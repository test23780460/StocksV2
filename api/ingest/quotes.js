const { requireCronSecret } = require("../../lib/env");
const { runQuoteIngestion } = require("../../lib/jobs");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["POST", "GET"].includes(req.method)) {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    requireCronSecret(req);
    const symbols = req.method === "POST" ? req.body?.symbols : String(req.query.symbols || "").split(",").filter(Boolean);
    const result = await runQuoteIngestion({ symbols });
    res.status(200).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ status: "error", message: error.message });
  }
};
