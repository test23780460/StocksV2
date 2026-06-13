const {
  hasSupabaseServerConfig,
  insert,
  normalizeWatchlistInput,
  remove,
  requireUser,
  select
} = require("../../lib/supabaseRest");
const { normalizeSymbol, sanitizeText } = require("../../lib/validation");
const { upsertAsset } = require("../../lib/repository");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!hasSupabaseServerConfig()) {
    res.status(503).json({ error: "Supabase is not configured. Guest watchlists are stored locally in the browser." });
    return;
  }

  try {
    const user = await requireUser(req);
    if (req.method === "GET") {
      const rows = await select(
        "watchlists",
        `user_id=eq.${user.id}&select=id,name,description,is_default,created_at,updated_at,watchlist_items(id,notes,added_at,assets(symbol,name,asset_type,exchange,sector))&order=created_at.asc`
      );
      res.status(200).json({ watchlists: rows });
      return;
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const input = normalizeWatchlistInput(body);
      if (body.symbol) {
        const watchlistId = sanitizeText(body.watchlistId, 80);
        const asset = await upsertAsset({ symbol: normalizeSymbol(body.symbol), name: normalizeSymbol(body.symbol), type: body.assetType || "stock" });
        const rows = await insert("watchlist_items", [{
          watchlist_id: watchlistId,
          asset_id: asset.id,
          notes: input.notes || null
        }], { upsert: true, onConflict: "watchlist_id,asset_id" });
        res.status(200).json({ item: rows?.[0] || null });
        return;
      }

      const rows = await insert("watchlists", [{
        user_id: user.id,
        name: input.name || "My Watchlist",
        description: input.description || null,
        is_default: Boolean(body.isDefault)
      }]);
      res.status(201).json({ watchlist: rows?.[0] || null });
      return;
    }

    if (req.method === "DELETE") {
      const itemId = sanitizeText(req.query.itemId, 80);
      const watchlistId = sanitizeText(req.query.watchlistId, 80);
      if (itemId) await remove("watchlist_items", `id=eq.${itemId}`);
      else if (watchlistId) await remove("watchlists", `id=eq.${watchlistId}&user_id=eq.${user.id}`);
      else {
        res.status(400).json({ error: "itemId or watchlistId is required" });
        return;
      }
      res.status(204).end();
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};
