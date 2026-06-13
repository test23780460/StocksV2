const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
];

const SERVER_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
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

function hasSupabaseServerConfig() {
  return Boolean(getSupabaseUrl() && getEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

function hasSupabasePublicConfig() {
  return Boolean(getSupabaseUrl() && getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
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
    supabaseAnonKey: getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
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
