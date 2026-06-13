const { createConnectedProvider } = require("../lib/providerContract");

module.exports = async function handler(req, res) {
  const provider = createConnectedProvider();
  const services = await provider.health();
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
  res.status(200).json({
    mode: services.some((item) => item.status === "Configured") ? "Connected Data" : "Demo Mode",
    generatedAt: new Date().toISOString(),
    message: "Provider keys are checked server-side. Missing services fall back to clearly labeled demo or unavailable data.",
    services
  });
};
