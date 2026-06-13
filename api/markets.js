const { createConnectedProvider, normalizeError } = require("../lib/providerContract");

module.exports = async function handler(req, res) {
  const provider = createConnectedProvider();
  try {
    const market = await provider.market();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=180");
    res.status(200).json({
      ...market,
      disclaimer: "Educational market research only. This is not financial advice."
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      mode: "Demo Mode",
      error: normalizeError(error)
    });
  }
};
