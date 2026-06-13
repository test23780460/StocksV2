const { lessons } = require("../lib/demo-data");
const { hasSupabaseServerConfig, select } = require("../lib/supabaseRest");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  try {
    if (hasSupabaseServerConfig()) {
      const rows = await select("glossary_terms", "select=*&order=term.asc");
      if (rows.length) {
        res.status(200).json({ mode: "Connected Data", terms: rows });
        return;
      }
    }
    res.status(200).json({
      mode: "Demo Mode",
      terms: lessons.map(([term, definition]) => ({
        term,
        short_definition: definition,
        full_definition: definition,
        beginner_example: "Use this concept to understand risk before acting.",
        related_terms: []
      }))
    });
  } catch (error) {
    res.status(503).json({ mode: "Temporarily unavailable", terms: [], error: error.message });
  }
};
