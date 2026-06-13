const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
];

const SERVER_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "ALPHA_VANTAGE_API_KEY",
  "POLYGON_API_KEY",
  "FINNHUB_API_KEY",
  "COINGECKO_API_KEY",
  "CRON_SECRET",
  "MARKET_DATA_PROVIDER",
  "NEWS_DATA_PROVIDER",
  "APP_URL",
  "SENTRY_DSN"
];

function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function getSupabaseUrl() {
  return getEnv("NEXT_PUBLIC_SUPABASE_URL") || getEnv("SUPABASE_URL");
}

function getSupabasePublicKey() {
  return getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") || getEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

function getSupabaseServerKey() {
  return getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_SECRET_KEY");
}

function hasSupabaseServerConfig() {
  return Boolean(getSupabaseUrl() && getSupabaseServerKey());
}

function hasSupabasePublicConfig() {
  return Boolean(getSupabaseUrl() && getSupabasePublicKey());
}

function selectedMarketProvider() {
  return String(getEnv("MARKET_DATA_PROVIDER", "auto")).toLowerCase();
}

function selectedNewsProvider() {
  return String(getEnv("NEWS_DATA_PROVIDER", "auto")).toLowerCase();
}

function liveProviderConfigured() {
  const provider = selectedMarketProvider();
  if (provider === "demo") return false;
  return Boolean(
    getEnv("ALPHA_VANTAGE_API_KEY") ||
    getEnv("POLYGON_API_KEY") ||
    getEnv("FINNHUB_API_KEY") ||
    getEnv("COINGECKO_API_KEY")
  );
}

function publicConfig() {
  return {
    supabaseUrl: getSupabaseUrl(),
    supabaseAnonKey: getSupabasePublicKey(),
    authEnabled: hasSupabasePublicConfig(),
    liveProviderConfigured: liveProviderConfigured(),
    marketDataProvider: selectedMarketProvider(),
    newsDataProvider: selectedNewsProvider(),
    appUrl: getEnv("APP_URL")
  };
}

function redact(value) {
  if (!value) return "";
  const text = String(value);
  if (text.length <= 8) return "[configured]";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function serverConfigStatus() {
  const keys = [...PUBLIC_ENV_KEYS, ...SERVER_ENV_KEYS];
  return keys.map((key) => ({
    key,
    configured: Boolean(process.env[key]),
    valuePreview: key.includes("KEY") || key.includes("SECRET") || key.includes("TOKEN")
      ? redact(process.env[key])
      : process.env[key] || ""
  }));
}

function requireCronSecret(req) {
  const configured = getEnv("CRON_SECRET");
  const supplied = req.headers["x-cron-secret"] || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!configured || supplied !== configured) {
    const error = new Error("Unauthorized cron request");
    error.statusCode = 401;
    throw error;
  }
}

module.exports = {
  getEnv,
  getSupabasePublicKey,
  getSupabaseServerKey,
  getSupabaseUrl,
  hasSupabaseServerConfig,
  hasSupabasePublicConfig,
  liveProviderConfigured,
  publicConfig,
  requireCronSecret,
  selectedMarketProvider,
  selectedNewsProvider,
  serverConfigStatus
};
