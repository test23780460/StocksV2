const { runPredictionGeneration } = require("../../lib/jobs");
const { hasSupabaseServerConfig, select } = require("../../lib/supabaseRest");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", req.method === "GET" ? "s-maxage=60, stale-while-revalidate=300" : "no-store");
  try {
    if (req.method === "GET") {
      if (!hasSupabaseServerConfig()) {
        res.status(200).json({ mode: "Demo Mode", predictions: [], message: "Prediction storage becomes available after Supabase migrations are applied." });
        return;
      }
      const status = req.query.status || "active";
      const rows = await select("predictions", `status=eq.${encodeURIComponent(status)}&select=*,assets(symbol,name,asset_type)&order=generated_at.desc&limit=100`);
      res.status(200).json({ mode: "Connected Data", predictions: rows });
      return;
    }

    if (req.method === "POST") {
      const symbol = req.body?.symbol || req.query.symbol;
      const horizonDays = Number(req.body?.horizonDays || req.query.horizonDays || 14);
      const result = await runPredictionGeneration({ symbols: [symbol], horizons: [horizonDays] });
      res.status(201).json({ mode: hasSupabaseServerConfig() ? "Connected Data" : "Demo Mode", ...result });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};
