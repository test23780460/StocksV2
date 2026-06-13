const { createConnectedProvider, normalizeError } = require("../lib/providerContract");
const { scoreTrendingAssets } = require("../lib/jobs");

module.exports = async function handler(req, res) {
  const provider = createConnectedProvider();
  try {
    const market = await provider.market();
    const trendingAssets = scoreTrendingAssets(market.assets).slice(0, 8);
    res.setHeader("Cache-Control", "s-maxage=45, stale-while-revalidate=180");
    res.status(200).json({
      ...market,
      trendingAssets,
      dataFreshness: {
        source: market.mode,
        lastUpdated: market.generatedAt,
        timezone: market.marketStatus?.timezone || "America/New_York",
        status: market.dataStatus
      },
      disclaimer: "Educational market research only. Nothing on this platform is financial advice. Market predictions are estimates and are not guarantees. Market data may be delayed, cached, estimated, or unavailable."
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      mode: "Demo Mode",
      dataStatus: "Temporarily unavailable",
      error: normalizeError(error)
    });
  }
};
