const { runHistoricalBackfill } = require("../../lib/jobs");
const { requireAdmin } = require("../../lib/supabaseRest");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    await requireAdmin(req);
    const result = await runHistoricalBackfill({
      symbols: req.body?.symbols,
      startDate: req.body?.startDate,
      endDate: req.body?.endDate,
      limit: req.body?.limit
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ status: "error", message: error.message });
  }
};
