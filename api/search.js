const { createConnectedProvider } = require("../lib/providerContract");

module.exports = async function handler(req, res) {
  const provider = createConnectedProvider();
  const query = req.query.q || "";
  const results = await provider.search(query);
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
  res.status(200).json({
    mode: results.some((item) => item.dataStatus === "Connected data") ? "Connected Data" : "Demo Mode",
    query,
    count: results.length,
    results
  });
};
