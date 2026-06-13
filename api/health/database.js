const { hasSupabaseServerConfig, select } = require("../../lib/supabaseRest");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!hasSupabaseServerConfig()) {
    res.status(200).json({ status: "not_configured", configured: false, message: "Supabase server variables are missing." });
    return;
  }
  try {
    const assets = await select("assets", "select=id&limit=1");
    res.status(200).json({ status: "ok", configured: true, reachable: true, sampleRowsVisible: assets.length });
  } catch (error) {
    res.status(503).json({ status: "error", configured: true, reachable: false, message: error.message });
  }
};
