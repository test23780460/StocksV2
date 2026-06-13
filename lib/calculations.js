const { clamp } = require("./validation");

const MODEL_VERSION = "ruleset-2026-06-13";

function sma(values, period) {
  if (!values.length || values.length < period) return null;
  const slice = values.slice(-period).map(Number);
  return slice.reduce((sum, value) => sum + value, 0) / period;
}

function ema(values, period) {
  if (!values.length || values.length < period) return null;
  const multiplier = 2 / (period + 1);
  const numbers = values.map(Number);
  let current = numbers.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of numbers.slice(period)) {
    current = value * multiplier + current * (1 - multiplier);
  }
  return current;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const diff = Number(values[i]) - Number(values[i - 1]);
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

function macd(values) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  if (fast == null || slow == null) return { macd: null, signal: null, histogram: null };
  const line = fast - slow;
  const macdValues = [];
  for (let i = 26; i <= values.length; i += 1) {
    const part = values.slice(0, i);
    const fastPart = ema(part, 12);
    const slowPart = ema(part, 26);
    if (fastPart != null && slowPart != null) macdValues.push(fastPart - slowPart);
  }
  const signal = ema(macdValues, 9);
  return {
    macd: line,
    signal,
    histogram: signal == null ? null : line - signal
  };
}

function bollinger(values, period = 20, deviations = 2) {
  const middle = sma(values, period);
  if (middle == null) return { upper: null, middle: null, lower: null };
  const slice = values.slice(-period).map(Number);
  const variance = slice.reduce((sum, value) => sum + Math.pow(value - middle, 2), 0) / period;
  const sd = Math.sqrt(variance);
  return {
    upper: middle + sd * deviations,
    middle,
    lower: middle - sd * deviations
  };
}

function atr(bars, period = 14) {
  if (!bars.length || bars.length <= period) return null;
  const ranges = [];
  for (let i = bars.length - period; i < bars.length; i += 1) {
    const current = bars[i];
    const previous = bars[i - 1];
    ranges.push(Math.max(
      Number(current.high) - Number(current.low),
      Math.abs(Number(current.high) - Number(previous.close)),
      Math.abs(Number(current.low) - Number(previous.close))
    ));
  }
  return ranges.reduce((sum, value) => sum + value, 0) / period;
}

function supportResistance(values) {
  const slice = values.slice(-60).map(Number);
  if (!slice.length) return { support: null, resistance: null };
  const sorted = [...slice].sort((a, b) => a - b);
  return {
    support: sorted[Math.max(0, Math.floor(sorted.length * 0.15) - 1)],
    resistance: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.85))]
  };
}

function calculateIndicators(bars) {
  const closes = bars.map((bar) => Number(bar.close ?? bar.price)).filter(Number.isFinite);
  const macdValues = macd(closes);
  const bands = bollinger(closes);
  const levels = supportResistance(closes);
  const current = closes.at(-1);
  const volatility = bands.middle ? Math.abs((bands.upper - bands.lower) / bands.middle) * 100 : null;
  return {
    sma_20: sma(closes, 20),
    sma_50: sma(closes, 50),
    sma_200: sma(closes, 200),
    ema_12: ema(closes, 12),
    ema_26: ema(closes, 26),
    rsi_14: rsi(closes, 14),
    macd: macdValues.macd,
    macd_signal: macdValues.signal,
    macd_histogram: macdValues.histogram,
    atr: bars[0]?.high != null ? atr(bars, 14) : null,
    volatility,
    bollinger_upper: bands.upper,
    bollinger_middle: bands.middle,
    bollinger_lower: bands.lower,
    support_levels: levels.support == null ? [] : [levels.support],
    resistance_levels: levels.resistance == null ? [] : [levels.resistance],
    current_price: current
  };
}

function scoreSignal({ quote, indicators = {}, sentimentScore = 0, marketScore = 0 }) {
  const changePct = Number(quote.changePct ?? quote.change_percent ?? 0);
  const price = Number(quote.price ?? quote.close ?? indicators.current_price ?? 0);
  const aboveSma20 = indicators.sma_20 ? price > indicators.sma_20 : false;
  const aboveSma50 = indicators.sma_50 ? price > indicators.sma_50 : false;
  const aboveSma200 = indicators.sma_200 ? price > indicators.sma_200 : false;
  const rsiValue = Number(indicators.rsi_14 ?? 50);
  const macdHistogram = Number(indicators.macd_histogram ?? 0);
  const volatility = Number(indicators.volatility ?? quote.volatility ?? 35);

  const support = [];
  const oppose = [];
  let score = 50;

  if (changePct > 0) { score += clamp(changePct * 4, 0, 14); support.push(`Price momentum is positive at ${changePct.toFixed(2)}%.`); }
  if (changePct < 0) { score -= clamp(Math.abs(changePct) * 4, 0, 14); oppose.push(`Price momentum is negative at ${changePct.toFixed(2)}%.`); }
  if (aboveSma20) { score += 7; support.push("Price is above the 20-day moving average."); } else if (indicators.sma_20) { score -= 5; oppose.push("Price is below the 20-day moving average."); }
  if (aboveSma50) { score += 6; support.push("Price is above the 50-day moving average."); } else if (indicators.sma_50) { score -= 5; oppose.push("Price is below the 50-day moving average."); }
  if (aboveSma200) { score += 5; support.push("Long-term trend is above the 200-day average."); } else if (indicators.sma_200) { score -= 6; oppose.push("Long-term trend is below the 200-day average."); }
  if (rsiValue > 70) { score -= 8; oppose.push("RSI is elevated, which can signal overbought risk."); }
  if (rsiValue < 30) { score += 5; support.push("RSI is low, which can signal oversold conditions."); }
  if (macdHistogram > 0) { score += 6; support.push("MACD momentum is improving."); }
  if (macdHistogram < 0) { score -= 6; oppose.push("MACD momentum is weakening."); }
  score += clamp(sentimentScore, -15, 15);
  score += clamp(marketScore, -10, 10);

  const boundedScore = Math.round(clamp(score, 0, 100));
  const direction = boundedScore >= 62 ? "bullish" : boundedScore <= 42 ? "bearish" : "neutral";
  const confidence = Math.round(clamp(45 + Math.abs(boundedScore - 50) * 0.75 + (indicators.sma_20 ? 8 : 0) + (indicators.rsi_14 ? 8 : 0) - volatility * 0.12, 5, 92));
  const risk = Math.round(clamp(35 + volatility * 0.7 + (rsiValue > 70 || rsiValue < 30 ? 8 : 0), 5, 95));

  return {
    signalScore: boundedScore,
    direction,
    confidence,
    risk,
    support,
    oppose,
    marketRegime: aboveSma200 && marketScore >= 0 ? "constructive" : marketScore < -5 ? "risk-off" : "mixed"
  };
}

function generatePrediction({ asset, quote, indicators = {}, horizonDays = 14, sentimentScore = 0, marketScore = 0 }) {
  const result = scoreSignal({ quote, indicators, sentimentScore, marketScore });
  const startingPrice = Number(quote.price ?? asset.price);
  const volatility = Number(indicators.volatility ?? asset.volatility ?? 35) / 100;
  const horizonScale = Math.sqrt(horizonDays / 252);
  const expectedMovePct = (result.signalScore - 50) / 100 * 0.18 * (horizonDays / 30);
  const predictedPrice = startingPrice * (1 + expectedMovePct);
  const rangePct = Math.max(0.015, volatility * horizonScale);

  return {
    asset_symbol: asset.symbol,
    generated_at: new Date().toISOString(),
    prediction_horizon_days: horizonDays,
    direction: result.direction,
    confidence: result.confidence,
    starting_price: startingPrice,
    predicted_low: predictedPrice * (1 - rangePct),
    predicted_high: predictedPrice * (1 + rangePct),
    predicted_price: predictedPrice,
    signal_score: result.signalScore,
    market_regime: result.marketRegime,
    explanation: [
      `Ruleset ${MODEL_VERSION} produced a ${result.direction} estimate from measurable trend, momentum, volatility, and sentiment inputs.`,
      result.support[0] || "No strong bullish input dominated the signal.",
      result.oppose[0] || "No strong opposing input dominated the signal.",
      "This is educational market research only and can be wrong."
    ].join(" "),
    supporting_indicators: { support: result.support, oppose: result.oppose, indicators },
    supporting_news: { sentimentScore },
    model_version: MODEL_VERSION,
    data_timestamp: quote.timestamp || quote.asOf || new Date().toISOString(),
    status: "active"
  };
}

function evaluatePrediction(prediction, actual) {
  const start = Number(prediction.starting_price);
  const actualPrice = Number(actual.price ?? actual.close);
  const predicted = Number(prediction.predicted_price);
  const actualMove = actualPrice - start;
  const predictedMove = predicted - start;
  const directionCorrect =
    prediction.direction === "neutral"
      ? Math.abs(actualMove / start) <= 0.02
      : Math.sign(actualMove) === Math.sign(predictedMove);
  const targetReached = actualPrice >= Number(prediction.predicted_low) && actualPrice <= Number(prediction.predicted_high);
  const absoluteError = Math.abs(actualPrice - predicted);
  const percentageError = start ? Math.abs(absoluteError / start) * 100 : null;
  let result = "incorrect";
  if (directionCorrect && targetReached) result = "correct";
  else if (directionCorrect || targetReached) result = "partially_correct";
  return {
    direction_correct: directionCorrect,
    target_reached: targetReached,
    absolute_error: absoluteError,
    percentage_error: percentageError,
    result
  };
}

function trendingScore(input) {
  const reasons = [];
  const priceMove = clamp(Math.abs(Number(input.changePct || 0)) * 9, 0, 25);
  const relativeVolume = clamp((Number(input.relativeVolume || 1) - 1) * 18, 0, 22);
  const watchlists = clamp(Math.log10(Number(input.watchlistAdds || 0) + 1) * 12, 0, 16);
  const newsVolume = clamp(Math.log10(Number(input.newsMentions || 0) + 1) * 10, 0, 14);
  const sentiment = clamp(Math.abs(Number(input.sentimentDelta || 0)) * 10, 0, 10);
  const volatility = clamp(Number(input.volatility || 0) * 0.12, 0, 8);
  const score = Math.round(clamp(priceMove + relativeVolume + watchlists + newsVolume + sentiment + volatility, 0, 100));
  if (relativeVolume > 4) reasons.push(`Volume is ${Number(input.relativeVolume || 1).toFixed(1)} times normal.`);
  if (priceMove > 5) reasons.push(`Price moved ${Number(input.changePct || 0).toFixed(2)}%.`);
  if (newsVolume > 3) reasons.push("News mentions increased.");
  if (watchlists > 2) reasons.push("Appearing on more user watchlists.");
  if (sentiment > 3) reasons.push("Sentiment changed materially.");
  return { score, reasons };
}

module.exports = {
  MODEL_VERSION,
  calculateIndicators,
  evaluatePrediction,
  generatePrediction,
  scoreSignal,
  sma,
  ema,
  rsi,
  macd,
  trendingScore
};
