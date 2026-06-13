const { createConnectedProvider } = require("../../lib/providerContract");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
  try {
    const provider = createConnectedProvider();
    res.status(200).json({
      status: "ok",
      generatedAt: new Date().toISOString(),
      providers: await provider.health(),
      marketStatus: await provider.getMarketStatus()
    });
  } catch (error) {
    res.status(503).json({ status: "error", message: error.message });
  }
};
