const { assets: demoAssets, news: demoNews } = require("./demo-data");
const { hasSupabaseServerConfig, insert, patch, select } = require("./supabaseRest");
const { sanitizeText } = require("./validation");

function assetType(type) {
  return String(type || "stock").toLowerCase();
}

async function listTrackedAssets(limit = 50) {
  if (!hasSupabaseServerConfig()) return demoAssets.slice(0, limit);
  const rows = await select(
    "assets",
    `active=eq.true&select=id,symbol,provider_symbol,name,asset_type,exchange,currency,country,sector,industry,provider&order=symbol.asc&limit=${limit}`
  );
  return rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    providerSymbol: row.provider_symbol,
    name: row.name,
    type: row.asset_type,
    exchange: row.exchange,
    currency: row.currency,
    country: row.country,
    sector: row.sector,
    industry: row.industry,
    provider: row.provider
  }));
}

async function findAssetBySymbol(symbol) {
  if (!hasSupabaseServerConfig()) return demoAssets.find((asset) => asset.symbol === symbol);
  const rows = await select("assets", `symbol=eq.${encodeURIComponent(symbol)}&select=*`);
  return rows[0] || null;
}

async function upsertAsset(asset) {
  if (!hasSupabaseServerConfig()) return null;
  const rows = await insert("assets", [{
    symbol: asset.symbol,
    provider_symbol: asset.providerSymbol || asset.provider_symbol || asset.symbol,
    name: asset.name || asset.symbol,
    asset_type: assetType(asset.type || asset.asset_type),
    exchange: asset.exchange || null,
    currency: asset.currency || "USD",
    country: asset.country || null,
    sector: asset.sector || null,
    industry: asset.industry || null,
    provider: asset.provider || "local-universe",
    active: asset.active !== false
  }], { upsert: true, onConflict: "symbol" });
  return rows?.[0] || null;
}

async function saveQuotes(quotes) {
  if (!hasSupabaseServerConfig()) return { inserted: 0, skipped: quotes.length };
  const rows = [];
  for (const quote of quotes) {
    const asset = await upsertAsset({
      symbol: quote.symbol,
      name: quote.name || quote.symbol,
      type: quote.type || "stock",
      provider: quote.provider
    });
    if (!asset?.id) continue;
    rows.push({
      asset_id: asset.id,
      price: quote.price,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      previous_close: quote.previousClose,
      change: quote.change,
      change_percent: quote.changePct,
      volume: Number.isFinite(Number(quote.volume)) ? Number(quote.volume) : null,
      market_cap: quote.marketCap || null,
      bid: quote.bid || null,
      ask: quote.ask || null,
      timestamp: quote.timestamp || quote.asOf || new Date().toISOString(),
      provider: quote.provider || "unknown",
      data_status: quote.dataStatus || "Delayed",
      raw_payload_reference: null
    });
  }
  if (!rows.length) return { inserted: 0, skipped: quotes.length };
  await insert("market_quotes", rows, { upsert: true, onConflict: "asset_id,timestamp,provider", returnMinimal: true });
  return { inserted: rows.length, skipped: quotes.length - rows.length };
}

async function savePriceBars(symbol, bars) {
  if (!hasSupabaseServerConfig()) return { inserted: 0, skipped: bars.length };
  const asset = await upsertAsset({ symbol, name: symbol, type: symbol.includes("-USD") ? "crypto" : "stock" });
  if (!asset?.id) return { inserted: 0, skipped: bars.length };
  const rows = bars.map((bar) => ({
    asset_id: asset.id,
    interval: bar.interval || "1d",
    timestamp: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    adjusted_close: bar.adjusted_close ?? bar.close,
    volume: bar.volume,
    provider: bar.provider,
    data_quality: bar.data_quality || "normal"
  }));
  await insert("price_bars", rows, { upsert: true, onConflict: "asset_id,interval,timestamp,provider", returnMinimal: true });
  return { inserted: rows.length, skipped: 0 };
}

async function latestBars(symbol, interval = "1d", limit = 260) {
  if (!hasSupabaseServerConfig()) {
    const asset = demoAssets.find((item) => item.symbol === symbol) || demoAssets[0];
    return asset.history.map((close, index) => ({ timestamp: index, close, open: close, high: close, low: close }));
  }
  const asset = await findAssetBySymbol(symbol);
  if (!asset?.id) return [];
  return select("price_bars", `asset_id=eq.${asset.id}&interval=eq.${interval}&select=*&order=timestamp.desc&limit=${limit}`)
    .then((rows) => rows.reverse());
}

async function saveNews(articles, symbolToAssetId = new Map()) {
  if (!hasSupabaseServerConfig()) return { inserted: 0, skipped: articles.length };
  const rows = articles.map((article) => ({
    provider_article_id: article.providerArticleId,
    title: sanitizeText(article.title, 320),
    summary: sanitizeText(article.summary, 1000),
    source: sanitizeText(article.source, 120),
    author: sanitizeText(article.author, 120) || null,
    article_url: article.url,
    image_url: article.imageUrl,
    published_at: article.publishedAt,
    overall_sentiment: article.sentiment || "Neutral",
    sentiment_score: article.sentimentScore || 0,
    relevance_score: article.relevanceScore || 0,
    provider: article.provider || "unknown"
  }));
  await insert("news_articles", rows, { upsert: true, onConflict: "provider_article_id", returnMinimal: true });
  return { inserted: rows.length, skipped: 0, symbolToAssetId };
}

async function listNews() {
  if (!hasSupabaseServerConfig()) return demoNews;
  return select("news_articles", "select=*&order=published_at.desc&limit=30");
}

async function logIngestionRun(run) {
  if (!hasSupabaseServerConfig()) return null;
  const rows = await insert("data_ingestion_runs", [run], { returnMinimal: false });
  return rows?.[0] || null;
}

async function updateIngestionRun(id, patchBody) {
  if (!hasSupabaseServerConfig() || !id) return null;
  return patch("data_ingestion_runs", `id=eq.${id}`, patchBody);
}

async function logApiUsage(log) {
  if (!hasSupabaseServerConfig()) return null;
  return insert("api_usage_logs", [log], { returnMinimal: true }).catch(() => null);
}

async function savePrediction(assetId, prediction) {
  if (!hasSupabaseServerConfig()) return null;
  const row = {
    asset_id: assetId,
    generated_at: prediction.generated_at,
    prediction_horizon_days: prediction.prediction_horizon_days,
    direction: prediction.direction,
    confidence: prediction.confidence,
    starting_price: prediction.starting_price,
    predicted_low: prediction.predicted_low,
    predicted_high: prediction.predicted_high,
    predicted_price: prediction.predicted_price,
    signal_score: prediction.signal_score,
    market_regime: prediction.market_regime,
    explanation: prediction.explanation,
    supporting_indicators: prediction.supporting_indicators,
    supporting_news: prediction.supporting_news,
    model_version: prediction.model_version,
    data_timestamp: prediction.data_timestamp,
    status: prediction.status
  };
  const rows = await insert("predictions", [row]);
  return rows?.[0] || null;
}

async function activePredictionsDue() {
  if (!hasSupabaseServerConfig()) return [];
  return select(
    "predictions",
    "status=eq.active&select=*,assets(symbol)&order=generated_at.asc&limit=200"
  );
}

module.exports = {
  activePredictionsDue,
  findAssetBySymbol,
  latestBars,
  listNews,
  listTrackedAssets,
  logApiUsage,
  logIngestionRun,
  saveNews,
  savePrediction,
  savePriceBars,
  saveQuotes,
  updateIngestionRun,
  upsertAsset
};
