const { createConnectedProvider, normalizeError } = require("../lib/providerContract");

module.exports = async function handler(req, res) {
  const provider = createConnectedProvider();
  try {
    const symbol = req.query.symbol;
    const quote = await provider.quote(symbol);
    const [bars, profile, technicalData, news] = await Promise.all([
      provider.getHistoricalBars(symbol, req.query.interval || "1d", req.query.start, req.query.end),
      provider.getCompanyProfile(symbol),
      provider.getTechnicalData(symbol),
      provider.getNews(symbol)
    ]);
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    res.status(200).json({
      mode: ["Live", "Delayed", "Cached", "Market closed"].includes(quote.dataStatus) ? "Connected Data" : "Demo Mode",
      quote,
      profile,
      bars,
      technicalData,
      news,
      dataFreshness: {
        source: quote.dataSource || quote.provider,
        lastUpdated: quote.lastUpdated,
        timezone: quote.timezone,
        status: quote.dataStatus,
        error: quote.error || null
      },
      disclaimer: "Educational market research only. Nothing here is financial advice. Predictions can be wrong."
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      mode: "Demo Mode",
      dataStatus: "Temporarily unavailable",
      error: normalizeError(error)
    });
  }
};
