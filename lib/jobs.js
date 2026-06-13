const { calculateIndicators, evaluatePrediction, generatePrediction, trendingScore } = require("./calculations");
const { createConnectedProvider, normalizeError } = require("./providerContract");
const repo = require("./repository");
const { validateBar, validateQuote } = require("./validation");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(operation, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await operation(i);
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await sleep(250 * Math.pow(2, i));
    }
  }
  throw lastError;
}

async function runQuoteIngestion(options = {}) {
  const provider = createConnectedProvider();
  const startedAt = new Date().toISOString();
  const tracked = options.symbols?.length
    ? options.symbols.map((symbol) => ({ symbol }))
    : await repo.listTrackedAssets(options.limit || 40);
  const requestedSymbols = tracked.map((asset) => asset.symbol);
  const run = await repo.logIngestionRun({
    job_name: "five-minute-market-ingestion",
    provider: provider.name,
    started_at: startedAt,
    status: "running",
    requested_symbols: requestedSymbols,
    successful_symbols: [],
    failed_symbols: [],
    rows_inserted: 0,
    api_requests: 0,
    metadata: { marketStatus: await provider.getMarketStatus() }
  });

  const successful = [];
  const failed = [];
  const quotes = [];

  for (const symbol of requestedSymbols) {
    try {
      const quote = await withRetry(() => provider.getQuote(symbol), 2);
      const validation = validateQuote(quote);
      if (!validation.valid) {
        failed.push({ symbol, reason: validation.errors.join("; ") });
        continue;
      }
      quotes.push(quote);
      successful.push(symbol);
      await repo.logApiUsage({
        provider: quote.provider,
        endpoint: "quote",
        requested_at: new Date().toISOString(),
        status_code: 200,
        response_time_ms: null,
        success: true,
        rate_limited: false,
        cached: quote.dataStatus === "Cached",
        error_type: null,
        request_metadata: { symbol }
      });
    } catch (error) {
      const normalized = normalizeError(error);
      failed.push({ symbol, reason: normalized.message });
      await repo.logApiUsage({
        provider: normalized.provider,
        endpoint: "quote",
        requested_at: new Date().toISOString(),
        status_code: error.statusCode || 500,
        response_time_ms: null,
        success: false,
        rate_limited: error.statusCode === 429,
        cached: false,
        error_type: normalized.dataStatus,
        request_metadata: { symbol }
      });
    }
  }

  const saved = await repo.saveQuotes(quotes);
  const completedAt = new Date().toISOString();
  await repo.updateIngestionRun(run?.id, {
    completed_at: completedAt,
    status: failed.length ? "partial_success" : "success",
    successful_symbols: successful,
    failed_symbols: failed,
    rows_inserted: saved.inserted,
    api_requests: requestedSymbols.length,
    metadata: {
      dataStatuses: [...new Set(quotes.map((quote) => quote.dataStatus))],
      duplicateRowsPreventedBy: "unique(asset_id,timestamp,provider)"
    }
  });

  return {
    startedAt,
    completedAt,
    requestedSymbols,
    successfulSymbols: successful,
    failedSymbols: failed,
    rowsInserted: saved.inserted,
    mode: quotes.some((quote) => quote.dataStatus !== "Demo") ? "Connected Data" : "Demo Mode"
  };
}

async function runHistoricalBackfill(options = {}) {
  const provider = createConnectedProvider();
  const symbols = options.symbols?.length
    ? options.symbols
    : (await repo.listTrackedAssets(options.limit || 25)).map((asset) => asset.symbol);
  const startDate = options.startDate || new Date(Date.now() - 5 * 366 * 86_400_000).toISOString().slice(0, 10);
  const endDate = options.endDate || new Date().toISOString().slice(0, 10);
  const rows = [];
  const failures = [];

  for (const symbol of symbols) {
    try {
      const bars = await withRetry(() => provider.getHistoricalBars(symbol, "1d", startDate, endDate), 2);
      const validBars = bars.filter((bar) => validateBar(bar).valid);
      const saved = await repo.savePriceBars(symbol, validBars);
      rows.push({ symbol, imported: saved.inserted, skipped: saved.skipped, lastTimestamp: validBars.at(-1)?.timestamp || null });
    } catch (error) {
      failures.push({ symbol, error: normalizeError(error).message });
    }
  }

  return {
    jobName: "historical-backfill",
    startDate,
    endDate,
    completed: rows.length,
    remaining: Math.max(0, symbols.length - rows.length),
    rowsImported: rows.reduce((sum, row) => sum + row.imported, 0),
    failures,
    symbols: rows,
    rateLimitStatus: "Provider request usage is controlled by batching and retries."
  };
}

async function runIndicatorRecalculation(options = {}) {
  const symbols = options.symbols?.length
    ? options.symbols
    : (await repo.listTrackedAssets(options.limit || 40)).map((asset) => asset.symbol);
  const results = [];
  for (const symbol of symbols) {
    const bars = await repo.latestBars(symbol, "1d", 260);
    results.push({ symbol, indicators: calculateIndicators(bars) });
  }
  return { jobName: "indicator-recalculation", assetsProcessed: results.length, results };
}

async function runPredictionGeneration(options = {}) {
  const provider = createConnectedProvider();
  const symbols = options.symbols?.length
    ? options.symbols
    : (await repo.listTrackedAssets(options.limit || 20)).map((asset) => asset.symbol);
  const horizons = options.horizons || [7, 14, 30];
  const predictions = [];

  for (const symbol of symbols) {
    const asset = await repo.findAssetBySymbol(symbol) || { symbol, name: symbol, type: symbol.includes("-USD") ? "Crypto" : "Stock" };
    const quote = await provider.getQuote(symbol);
    const indicators = await provider.getTechnicalData(symbol);
    for (const horizonDays of horizons) {
      const prediction = generatePrediction({ asset, quote, indicators, horizonDays });
      if (asset.id) await repo.savePrediction(asset.id, prediction);
      predictions.push(prediction);
    }
  }
  return { jobName: "prediction-generation", modelVersion: predictions[0]?.model_version || null, predictionsCreated: predictions.length, predictions };
}

async function runPredictionEvaluation() {
  const provider = createConnectedProvider();
  const due = await repo.activePredictionsDue();
  const evaluated = [];
  for (const prediction of due) {
    const generated = Date.parse(prediction.generated_at);
    const expires = generated + Number(prediction.prediction_horizon_days) * 86_400_000;
    if (Date.now() < expires) continue;
    const symbol = prediction.assets?.symbol || prediction.asset_symbol;
    if (!symbol) continue;
    const quote = await provider.getQuote(symbol);
    evaluated.push({
      predictionId: prediction.id,
      symbol,
      ...evaluatePrediction(prediction, quote)
    });
  }
  return { jobName: "prediction-evaluation", evaluated: evaluated.length, results: evaluated };
}

function scoreTrendingAssets(assets) {
  return assets.map((asset) => ({
    ...asset,
    trending: trendingScore({
      changePct: asset.changePct,
      relativeVolume: asset.relativeVolume,
      newsMentions: asset.newsMentions,
      watchlistAdds: asset.watchlistAdds,
      sentimentDelta: asset.sentimentDelta,
      volatility: asset.volatility
    })
  })).sort((a, b) => b.trending.score - a.trending.score);
}

module.exports = {
  runHistoricalBackfill,
  runIndicatorRecalculation,
  runPredictionEvaluation,
  runPredictionGeneration,
  runQuoteIngestion,
  scoreTrendingAssets
};
