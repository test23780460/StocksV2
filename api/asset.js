const { createConnectedProvider, normalizeError } = require("../lib/providerContract");

module.exports = async function handler(req, res) {
  const provider = createConnectedProvider();
  try {
    const quote = await provider.quote(req.query.symbol);
    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=60");
    res.status(200).json({
      mode: quote.dataStatus === "Connected data" ? "Connected Data" : "Demo Mode",
      quote,
      disclaimer: "Educational market research only. This is not financial advice."
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      mode: "Demo Mode",
      error: normalizeError(error)
    });
  }
};
