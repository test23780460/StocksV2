const { createConnectedProvider } = require("../lib/providerContract");
const { rateLimit } = require("../lib/cache");

module.exports = async function handler(req, res) {
  const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  const limit = rateLimit(`search:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) {
    res.status(429).json({ mode: "Temporarily unavailable", query: req.query.q || "", count: 0, results: [], error: "Search rate limit reached. Please wait before retrying.", resetAt: limit.resetAt });
    return;
  }
  const provider = createConnectedProvider();
  const query = req.query.q || "";
  try {
    const results = await provider.searchAssets(query);
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    res.status(200).json({
      mode: results.some((item) => ["Live", "Delayed", "Cached", "Market closed"].includes(item.dataStatus)) ? "Connected Data" : "Demo Mode",
      query,
      count: results.length,
      results,
      dataStatus: results[0]?.dataStatus || "Temporarily unavailable"
    });
  } catch (error) {
    res.status(error.statusCode || 503).json({ mode: "Temporarily unavailable", query, count: 0, results: [], error: error.message });
  }
};
