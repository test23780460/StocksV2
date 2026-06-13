const { createDemoProvider } = require("../lib/providerContract");

module.exports = async function handler(req, res) {
  const provider = createDemoProvider();
  const services = await provider.health();
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
  res.status(200).json({
    mode: "Demo Mode",
    generatedAt: new Date().toISOString(),
    message: "No real market-data providers are configured. Demo data is never live financial data.",
    services
  });
};
