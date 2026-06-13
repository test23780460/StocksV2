const { hasSupabaseServerConfig, insert, patch, requireUser, select } = require("../../lib/supabaseRest");
const { sanitizeText } = require("../../lib/validation");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!hasSupabaseServerConfig()) {
    res.status(503).json({ error: "Supabase is not configured." });
    return;
  }

  try {
    const user = await requireUser(req);
    if (req.method === "GET") {
      const profile = await select("profiles", `id=eq.${user.id}&select=*`);
      const settings = await select("user_settings", `user_id=eq.${user.id}&select=*`);
      res.status(200).json({ user, profile: profile[0] || null, settings: settings[0] || null });
      return;
    }

    if (req.method === "PATCH") {
      const body = req.body || {};
      const profilePatch = {};
      if (body.displayName != null) profilePatch.display_name = sanitizeText(body.displayName, 120);
      if (body.username != null) profilePatch.username = sanitizeText(body.username, 60).toLowerCase();
      if (body.experienceLevel != null) profilePatch.experience_level = sanitizeText(body.experienceLevel, 30);
      if (body.theme != null) profilePatch.preferred_theme = sanitizeText(body.theme, 20);
      if (body.beginnerMode != null) profilePatch.beginner_mode = Boolean(body.beginnerMode);
      if (body.compactMode != null) profilePatch.compact_mode = Boolean(body.compactMode);
      profilePatch.updated_at = new Date().toISOString();
      const rows = Object.keys(profilePatch).length
        ? await patch("profiles", `id=eq.${user.id}`, profilePatch)
        : [];
      if (body.timezone || body.defaultChartInterval || body.notificationPreferences) {
        await insert("user_settings", [{
          user_id: user.id,
          default_chart_interval: sanitizeText(body.defaultChartInterval || "1d", 20),
          notification_preferences: body.notificationPreferences || {},
          timezone: sanitizeText(body.timezone || "America/New_York", 80)
        }], { upsert: true, onConflict: "user_id" });
      }
      res.status(200).json({ profile: rows[0] || null });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};
