const { getEnv, getSupabaseUrl, hasSupabaseServerConfig } = require("./env");
const { sanitizeText } = require("./validation");

function assertConfigured() {
  if (!hasSupabaseServerConfig()) {
    const error = new Error("Supabase server configuration is missing");
    error.statusCode = 503;
    error.code = "SUPABASE_NOT_CONFIGURED";
    throw error;
  }
}

function restUrl(path) {
  const base = getSupabaseUrl().replace(/\/$/, "");
  return `${base}/rest/v1/${path.replace(/^\//, "")}`;
}

function authUrl(path) {
  const base = getSupabaseUrl().replace(/\/$/, "");
  return `${base}/auth/v1/${path.replace(/^\//, "")}`;
}

async function serviceRequest(path, options = {}) {
  assertConfigured();
  const method = options.method || "GET";
  const headers = {
    apikey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    authorization: `Bearer ${getEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
    "content-type": "application/json",
    ...(options.headers || {})
  };

  const response = await fetch(restUrl(path), {
    method,
    headers,
    body: options.body == null ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(json?.message || `Supabase REST returned ${response.status}`);
    error.statusCode = response.status;
    error.details = json;
    throw error;
  }
  return json;
}

async function select(table, query = "") {
  return serviceRequest(`${table}${query ? `?${query}` : ""}`);
}

async function insert(table, rows, options = {}) {
  const params = new URLSearchParams();
  if (options.onConflict) params.set("on_conflict", options.onConflict);
  const prefer = [
    options.upsert ? "resolution=merge-duplicates" : "",
    options.returnMinimal ? "return=minimal" : "return=representation"
  ].filter(Boolean).join(",");
  return serviceRequest(`${table}${params.toString() ? `?${params}` : ""}`, {
    method: "POST",
    body: rows,
    headers: { Prefer: prefer }
  });
}

async function patch(table, query, body) {
  return serviceRequest(`${table}?${query}`, {
    method: "PATCH",
    body,
    headers: { Prefer: "return=representation" }
  });
}

async function remove(table, query) {
  return serviceRequest(`${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

function bearerToken(req) {
  return req.headers.authorization?.replace(/^Bearer\s+/i, "");
}

async function getUserFromRequest(req) {
  const token = bearerToken(req);
  if (!token) return null;
  if (!getSupabaseUrl() || !getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")) return null;
  const response = await fetch(authUrl("user"), {
    headers: {
      apikey: getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) return null;
  return response.json();
}

async function requireUser(req) {
  const user = await getUserFromRequest(req);
  if (!user?.id) {
    const error = new Error("Authentication required");
    error.statusCode = 401;
    throw error;
  }
  return user;
}

async function isAdminUser(userId) {
  if (!userId || !hasSupabaseServerConfig()) return false;
  const rows = await select("profiles", `id=eq.${encodeURIComponent(userId)}&select=role`);
  return rows?.[0]?.role === "admin";
}

async function requireAdmin(req) {
  const cronSecret = getEnv("CRON_SECRET");
  const suppliedSecret = req.headers["x-cron-secret"] || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (cronSecret && suppliedSecret === cronSecret) return { id: "cron", role: "admin" };

  const user = await requireUser(req);
  if (!(await isAdminUser(user.id))) {
    const error = new Error("Admin role required");
    error.statusCode = 403;
    throw error;
  }
  return { ...user, role: "admin" };
}

function normalizeWatchlistInput(body = {}) {
  return {
    name: sanitizeText(body.name || "My Watchlist", 80),
    description: sanitizeText(body.description || "", 280),
    notes: sanitizeText(body.notes || "", 500)
  };
}

module.exports = {
  getUserFromRequest,
  hasSupabaseServerConfig,
  insert,
  normalizeWatchlistInput,
  patch,
  remove,
  requireAdmin,
  requireUser,
  select,
  serviceRequest
};
