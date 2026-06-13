const { hasSupabaseServerConfig, select } = require("../../lib/supabaseRest");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!hasSupabaseServerConfig()) {
    res.status(200).json({ status: "not_configured", lastSuccessfulIngestion: null, message: "Cron history is available after Supabase is configured." });
    return;
  }
  try {
    const rows = await select("data_ingestion_runs", "select=job_name,provider,started_at,completed_at,status,rows_inserted,error_message&order=started_at.desc&limit=10");
    res.status(200).json({
      status: rows.some((row) => row.status === "success" || row.status === "partial_success") ? "ok" : "needs_attention",
      runs: rows
    });
  } catch (error) {
    res.status(503).json({ status: "error", message: error.message });
  }
};
