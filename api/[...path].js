const { publicConfig, requireCronSecret, serverConfigStatus } = require("../lib/env");
const { createConnectedProvider, normalizeError } = require("../lib/providerContract");
const { rateLimit } = require("../lib/cache");
const { runHistoricalBackfill, runIndicatorRecalculation, runPredictionEvaluation, runPredictionGeneration, runQuoteIngestion, scoreTrendingAssets } = require("../lib/jobs");
const { listNews, saveNews, upsertAsset } = require("../lib/repository");
const {
  hasSupabaseServerConfig,
  insert,
  normalizeWatchlistInput,
  patch,
  remove,
  requireAdmin,
  requireUser,
  select
} = require("../lib/supabaseRest");
const { lessons } = require("../lib/demo-data");
const { normalizeSymbol, sanitizeText } = require("../lib/validation");

function routePath(req) {
  const fromQuery = req.query?.path;
  if (Array.isArray(fromQuery)) return fromQuery.join("/");
  if (typeof fromQuery === "string") return fromQuery;
  const url = new URL(req.url || "/api", "http://localhost");
  return url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
}

function send(res, status, body, cacheControl = "no-store") {
  res.setHeader("Cache-Control", cacheControl);
  res.status(status).json(body);
}

function methodNotAllowed(res) {
  send(res, 405, { error: "Method not allowed" });
}

async function handleConfig(req, res) {
  send(res, 200, publicConfig(), "s-maxage=300, stale-while-revalidate=600");
}

async function handleHealth(req, res) {
  send(res, 200, {
    status: "ok",
    generatedAt: new Date().toISOString(),
    checks: {
      app: "ok",
      environment: serverConfigStatus().map(({ key, configured }) => ({ key, configured }))
    },
    disclaimer: "Health endpoints do not expose secret values."
  });
}

async function handleDatabaseHealth(req, res) {
  if (!hasSupabaseServerConfig()) {
    send(res, 200, { status: "not_configured", configured: false, message: "Supabase server variables are missing." });
    return;
  }
  try {
    const assets = await select("assets", "select=id&limit=1");
    send(res, 200, { status: "ok", configured: true, reachable: true, sampleRowsVisible: assets.length });
  } catch (error) {
    send(res, 503, { status: "error", configured: true, reachable: false, message: error.message });
  }
}

async function handleProviderHealth(req, res) {
  try {
    const provider = createConnectedProvider();
    send(res, 200, {
      status: "ok",
      generatedAt: new Date().toISOString(),
      providers: await provider.health(),
      marketStatus: await provider.getMarketStatus()
    }, "s-maxage=30, stale-while-revalidate=120");
  } catch (error) {
    send(res, 503, { status: "error", message: error.message });
  }
}

async function handleCronHealth(req, res) {
  if (!hasSupabaseServerConfig()) {
    send(res, 200, { status: "not_configured", lastSuccessfulIngestion: null, message: "Cron history is available after Supabase is configured." });
    return;
  }
  try {
    const rows = await select("data_ingestion_runs", "select=job_name,provider,started_at,completed_at,status,rows_inserted,error_message&order=started_at.desc&limit=10");
    send(res, 200, {
      status: rows.some((row) => row.status === "success" || row.status === "partial_success") ? "ok" : "needs_attention",
      runs: rows
    });
  } catch (error) {
    send(res, 503, { status: "error", message: error.message });
  }
}

async function handleStatus(req, res) {
  const provider = createConnectedProvider();
  const services = await provider.health();
  send(res, 200, {
    mode: services.some((item) => item.status === "Configured") ? "Connected Data" : "Demo Mode",
    generatedAt: new Date().toISOString(),
    message: "Provider keys are checked server-side. Missing services fall back to clearly labeled demo or unavailable data.",
    marketStatus: await provider.getMarketStatus(),
    databaseConfigured: hasSupabaseServerConfig(),
    services
  }, "s-maxage=30, stale-while-revalidate=120");
}

async function handleMarkets(req, res) {
  const provider = createConnectedProvider();
  try {
    const market = await provider.market();
    const trendingAssets = scoreTrendingAssets(market.assets).slice(0, 8);
    send(res, 200, {
      ...market,
      trendingAssets,
      dataFreshness: {
        source: market.mode,
        lastUpdated: market.generatedAt,
        timezone: market.marketStatus?.timezone || "America/New_York",
        status: market.dataStatus
      },
      disclaimer: "Educational market research only. Nothing on this platform is financial advice. Market predictions are estimates and are not guarantees. Market data may be delayed, cached, estimated, or unavailable."
    }, "s-maxage=45, stale-while-revalidate=180");
  } catch (error) {
    send(res, error.statusCode || 500, {
      mode: "Demo Mode",
      dataStatus: "Temporarily unavailable",
      error: normalizeError(error)
    });
  }
}

async function handleSearch(req, res) {
  const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  const limit = rateLimit(`search:${ip}`, { limit: 60, windowMs: 60_000 });
  const query = req.query.q || "";
  if (!limit.allowed) {
    send(res, 429, { mode: "Temporarily unavailable", query, count: 0, results: [], error: "Search rate limit reached. Please wait before retrying.", resetAt: limit.resetAt });
    return;
  }
  try {
    const provider = createConnectedProvider();
    const results = await provider.searchAssets(query);
    send(res, 200, {
      mode: results.some((item) => ["Live", "Delayed", "Cached", "Market closed"].includes(item.dataStatus)) ? "Connected Data" : "Demo Mode",
      query,
      count: results.length,
      results,
      dataStatus: results[0]?.dataStatus || "Temporarily unavailable"
    }, "s-maxage=30, stale-while-revalidate=120");
  } catch (error) {
    send(res, error.statusCode || 503, { mode: "Temporarily unavailable", query, count: 0, results: [], error: error.message });
  }
}

async function handleAsset(req, res) {
  const provider = createConnectedProvider();
  try {
    const symbol = req.query.symbol;
    const quote = await provider.quote(symbol);
    const [bars, profile, technicalData, news] = await Promise.all([
      provider.getHistoricalBars(symbol, req.query.interval || "1d", req.query.start, req.query.end),
      provider.getCompanyProfile(symbol),
      provider.getTechnicalData(symbol),
      provider.getNews(symbol)
    ]);
    send(res, 200, {
      mode: ["Live", "Delayed", "Cached", "Market closed"].includes(quote.dataStatus) ? "Connected Data" : "Demo Mode",
      quote,
      profile,
      bars,
      technicalData,
      news,
      dataFreshness: {
        source: quote.dataSource || quote.provider,
        lastUpdated: quote.lastUpdated,
        timezone: quote.timezone,
        status: quote.dataStatus,
        error: quote.error || null
      },
      disclaimer: "Educational market research only. Nothing here is financial advice. Predictions can be wrong."
    }, "s-maxage=30, stale-while-revalidate=120");
  } catch (error) {
    send(res, error.statusCode || 500, {
      mode: "Demo Mode",
      dataStatus: "Temporarily unavailable",
      error: normalizeError(error)
    });
  }
}

async function handleNews(req, res) {
  try {
    const symbol = req.query.symbol;
    const provider = createConnectedProvider();
    const liveArticles = await provider.getNews(symbol);
    if (liveArticles.length) await saveNews(liveArticles).catch(() => null);
    const stored = await listNews();
    send(res, 200, {
      mode: liveArticles.some((article) => article.provider !== "demo-provider") ? "Connected Data" : "Demo Mode",
      articles: liveArticles.length ? liveArticles : stored,
      disclaimer: "News sentiment is contextual market research and is not guaranteed price direction."
    }, "s-maxage=300, stale-while-revalidate=900");
  } catch (error) {
    send(res, 503, { mode: "Temporarily unavailable", articles: [], error: error.message });
  }
}

async function handleGlossary(req, res) {
  try {
    if (hasSupabaseServerConfig()) {
      const rows = await select("glossary_terms", "select=*&order=term.asc");
      if (rows.length) {
        send(res, 200, { mode: "Connected Data", terms: rows }, "s-maxage=3600, stale-while-revalidate=86400");
        return;
      }
    }
    send(res, 200, {
      mode: "Demo Mode",
      terms: lessons.map(([term, definition]) => ({
        term,
        short_definition: definition,
        full_definition: definition,
        beginner_example: "Use this concept to understand risk before acting.",
        related_terms: []
      }))
    }, "s-maxage=3600, stale-while-revalidate=86400");
  } catch (error) {
    send(res, 503, { mode: "Temporarily unavailable", terms: [], error: error.message });
  }
}

async function handlePredictions(req, res) {
  try {
    if (req.method === "GET") {
      if (!hasSupabaseServerConfig()) {
        send(res, 200, { mode: "Demo Mode", predictions: [], message: "Prediction storage becomes available after Supabase migrations are applied." }, "s-maxage=60, stale-while-revalidate=300");
        return;
      }
      const status = req.query.status || "active";
      const rows = await select("predictions", `status=eq.${encodeURIComponent(status)}&select=*,assets(symbol,name,asset_type)&order=generated_at.desc&limit=100`);
      send(res, 200, { mode: "Connected Data", predictions: rows }, "s-maxage=60, stale-while-revalidate=300");
      return;
    }
    if (req.method === "POST") {
      const symbol = req.body?.symbol || req.query.symbol;
      const horizonDays = Number(req.body?.horizonDays || req.query.horizonDays || 14);
      const result = await runPredictionGeneration({ symbols: [symbol], horizons: [horizonDays] });
      send(res, 201, { mode: hasSupabaseServerConfig() ? "Connected Data" : "Demo Mode", ...result });
      return;
    }
    methodNotAllowed(res);
  } catch (error) {
    send(res, error.statusCode || 500, { error: error.message });
  }
}

async function handleProfile(req, res) {
  if (!hasSupabaseServerConfig()) {
    send(res, 503, { error: "Supabase is not configured." });
    return;
  }
  try {
    const user = await requireUser(req);
    if (req.method === "GET") {
      const profile = await select("profiles", `id=eq.${user.id}&select=*`);
      const settings = await select("user_settings", `user_id=eq.${user.id}&select=*`);
      send(res, 200, { user, profile: profile[0] || null, settings: settings[0] || null });
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
      const rows = Object.keys(profilePatch).length ? await patch("profiles", `id=eq.${user.id}`, profilePatch) : [];
      if (body.timezone || body.defaultChartInterval || body.notificationPreferences) {
        await insert("user_settings", [{
          user_id: user.id,
          default_chart_interval: sanitizeText(body.defaultChartInterval || "1d", 20),
          notification_preferences: body.notificationPreferences || {},
          timezone: sanitizeText(body.timezone || "America/New_York", 80)
        }], { upsert: true, onConflict: "user_id" });
      }
      send(res, 200, { profile: rows[0] || null });
      return;
    }
    methodNotAllowed(res);
  } catch (error) {
    send(res, error.statusCode || 500, { error: error.message });
  }
}

async function handleWatchlists(req, res) {
  if (!hasSupabaseServerConfig()) {
    send(res, 503, { error: "Supabase is not configured. Guest watchlists are stored locally in the browser." });
    return;
  }
  try {
    const user = await requireUser(req);
    if (req.method === "GET") {
      const rows = await select("watchlists", `user_id=eq.${user.id}&select=id,name,description,is_default,created_at,updated_at,watchlist_items(id,notes,added_at,assets(symbol,name,asset_type,exchange,sector))&order=created_at.asc`);
      send(res, 200, { watchlists: rows });
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
        send(res, 200, { item: rows?.[0] || null });
        return;
      }
      const rows = await insert("watchlists", [{
        user_id: user.id,
        name: input.name || "My Watchlist",
        description: input.description || null,
        is_default: Boolean(body.isDefault)
      }]);
      send(res, 201, { watchlist: rows?.[0] || null });
      return;
    }
    if (req.method === "DELETE") {
      const itemId = sanitizeText(req.query.itemId, 80);
      const watchlistId = sanitizeText(req.query.watchlistId, 80);
      if (itemId) await remove("watchlist_items", `id=eq.${itemId}`);
      else if (watchlistId) await remove("watchlists", `id=eq.${watchlistId}&user_id=eq.${user.id}`);
      else {
        send(res, 400, { error: "itemId or watchlistId is required" });
        return;
      }
      res.status(204).end();
      return;
    }
    methodNotAllowed(res);
  } catch (error) {
    send(res, error.statusCode || 500, { error: error.message });
  }
}

async function handleQuoteIngestion(req, res) {
  if (!["POST", "GET"].includes(req.method)) {
    methodNotAllowed(res);
    return;
  }
  try {
    requireCronSecret(req);
    const symbols = req.method === "POST" ? req.body?.symbols : String(req.query.symbols || "").split(",").filter(Boolean);
    const result = await runQuoteIngestion({ symbols });
    send(res, 200, result);
  } catch (error) {
    send(res, error.statusCode || 500, { status: "error", message: error.message });
  }
}

async function handleAdminJobs(req, res) {
  if (hasSupabaseServerConfig()) {
    try {
      const runs = await select("data_ingestion_runs", "select=job_name,provider,started_at,completed_at,status,requested_symbols,successful_symbols,failed_symbols,rows_inserted,api_requests,error_message,metadata&order=started_at.desc&limit=25");
      send(res, 200, {
        mode: "Connected Data",
        protectedActions: true,
        actionsEndpoint: "/api/admin/actions",
        jobs: runs,
        adminActions: ["refresh-quotes", "backfill-history", "recalculate-indicators", "generate-predictions", "evaluate-predictions"]
      });
      return;
    } catch (error) {
      send(res, 503, { mode: "Temporarily unavailable", error: error.message });
      return;
    }
  }
  send(res, 200, {
    mode: "Demo Mode",
    protected: true,
    note: "Supabase is not configured. Protected admin actions are available at /api/admin/actions after Auth, RLS, and service-role variables are configured.",
    adminActions: ["refresh-quotes", "backfill-history", "recalculate-indicators", "generate-predictions", "evaluate-predictions"],
    jobs: []
  });
}

async function handleAdminBackfill(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res);
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
    send(res, 200, result);
  } catch (error) {
    send(res, error.statusCode || 500, { status: "error", message: error.message });
  }
}

async function handleAdminActions(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res);
    return;
  }
  const actions = {
    "refresh-quotes": runQuoteIngestion,
    "backfill-history": runHistoricalBackfill,
    "recalculate-indicators": runIndicatorRecalculation,
    "generate-predictions": runPredictionGeneration,
    "evaluate-predictions": runPredictionEvaluation
  };
  try {
    await requireAdmin(req);
    const action = req.body?.action;
    if (!actions[action]) {
      send(res, 400, { error: "Unknown admin action", availableActions: Object.keys(actions) });
      return;
    }
    const result = await actions[action](req.body?.options || {});
    send(res, 200, { action, status: "completed", result });
  } catch (error) {
    send(res, error.statusCode || 500, { status: "error", message: error.message });
  }
}

module.exports = async function handler(req, res) {
  const path = routePath(req);
  if (!path || path === "config") return handleConfig(req, res);
  if (path === "health") return handleHealth(req, res);
  if (path === "health/database") return handleDatabaseHealth(req, res);
  if (path === "health/providers") return handleProviderHealth(req, res);
  if (path === "health/cron") return handleCronHealth(req, res);
  if (path === "status") return handleStatus(req, res);
  if (path === "markets") return handleMarkets(req, res);
  if (path === "search") return handleSearch(req, res);
  if (path === "asset") return handleAsset(req, res);
  if (path === "news") return handleNews(req, res);
  if (path === "glossary") return handleGlossary(req, res);
  if (path === "predictions") return handlePredictions(req, res);
  if (path === "auth/profile") return handleProfile(req, res);
  if (path === "watchlists") return handleWatchlists(req, res);
  if (path === "ingest/quotes") return handleQuoteIngestion(req, res);
  if (path === "admin/jobs") return handleAdminJobs(req, res);
  if (path === "admin/backfill") return handleAdminBackfill(req, res);
  if (path === "admin/actions") return handleAdminActions(req, res);
  send(res, 404, { error: "API route not found", path });
};
