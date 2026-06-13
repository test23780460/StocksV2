const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateIndicators,
  evaluatePrediction,
  generatePrediction,
  rsi,
  scoreSignal,
  sma,
  trendingScore
} = require("../lib/calculations");

test("calculates moving averages and RSI from historical bars", () => {
  const values = Array.from({ length: 220 }, (_, index) => 100 + index * 0.5);
  const bars = values.map((close) => ({ open: close - 1, high: close + 1, low: close - 2, close }));
  const indicators = calculateIndicators(bars);
  assert.equal(sma(values, 20), indicators.sma_20);
  assert.equal(Math.round(rsi(values, 14)), 100);
  assert.ok(indicators.sma_200 > 0);
  assert.ok(indicators.bollinger_upper > indicators.bollinger_lower);
});

test("scores bullish and bearish signals from measurable inputs", () => {
  const bullish = scoreSignal({
    quote: { price: 110, changePct: 2 },
    indicators: { sma_20: 100, sma_50: 99, sma_200: 90, rsi_14: 55, macd_histogram: 1, volatility: 20 },
    sentimentScore: 5,
    marketScore: 4
  });
  const bearish = scoreSignal({
    quote: { price: 90, changePct: -3 },
    indicators: { sma_20: 100, sma_50: 101, sma_200: 105, rsi_14: 75, macd_histogram: -1, volatility: 40 },
    sentimentScore: -5,
    marketScore: -4
  });
  assert.equal(bullish.direction, "bullish");
  assert.equal(bearish.direction, "bearish");
  assert.ok(bullish.confidence > 50);
  assert.ok(bearish.risk > bullish.risk);
});

test("generates explainable predictions without randomness", () => {
  const input = {
    asset: { symbol: "AAPL", price: 100, volatility: 25 },
    quote: { symbol: "AAPL", price: 100, changePct: 1, timestamp: "2026-01-01T00:00:00Z" },
    indicators: { sma_20: 95, sma_50: 94, sma_200: 90, rsi_14: 54, macd_histogram: 0.5, volatility: 18 },
    horizonDays: 14
  };
  const first = generatePrediction(input);
  const second = generatePrediction(input);
  assert.deepEqual(first, second);
  assert.equal(first.direction, "bullish");
  assert.match(first.explanation, /educational market research/i);
});

test("evaluates prediction outcomes", () => {
  const result = evaluatePrediction({
    starting_price: 100,
    predicted_price: 110,
    predicted_low: 106,
    predicted_high: 112,
    direction: "bullish"
  }, { price: 108 });
  assert.equal(result.direction_correct, true);
  assert.equal(result.target_reached, true);
  assert.equal(result.result, "correct");
});

test("normalizes trending score inputs and reasons", () => {
  const result = trendingScore({
    changePct: 6.4,
    relativeVolume: 3.2,
    watchlistAdds: 20,
    newsMentions: 10,
    sentimentDelta: 0.6,
    volatility: 80
  });
  assert.ok(result.score <= 100);
  assert.ok(result.score > 40);
  assert.ok(result.reasons.length >= 3);
});
