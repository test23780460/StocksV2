const {
  runHistoricalBackfill,
  runIndicatorRecalculation,
  runPredictionEvaluation,
  runPredictionGeneration,
  runQuoteIngestion
} = require("../../lib/jobs");
const { requireAdmin } = require("../../lib/supabaseRest");

const ACTIONS = {
  "refresh-quotes": runQuoteIngestion,
  "backfill-history": runHistoricalBackfill,
  "recalculate-indicators": runIndicatorRecalculation,
  "generate-predictions": runPredictionGeneration,
  "evaluate-predictions": runPredictionEvaluation
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    await requireAdmin(req);
    const action = req.body?.action;
    if (!ACTIONS[action]) {
      res.status(400).json({ error: "Unknown admin action", availableActions: Object.keys(ACTIONS) });
      return;
    }
    const result = await ACTIONS[action](req.body?.options || {});
    res.status(200).json({ action, status: "completed", result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ status: "error", message: error.message });
  }
};
