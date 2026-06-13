/**
 * Provider contracts for connected-data mode.
 *
 * Real providers normalize responses before the UI or scoring layer sees data.
 * Never return raw third-party payloads or provider keys to clients.
 */

class ProviderUnavailableError extends Error {
  constructor(providerName, reason = "Provider unavailable") {
    super(reason);
    this.name = "ProviderUnavailableError";
    this.providerName = providerName;
    this.statusCode = 503;
    this.dataStatus = "Provider unavailable";
  }
}

function normalizedQuote(input) {
  return {
    symbol: input.symbol,
    provider: input.provider,
    price: Number(input.price),
    changePct: Number(input.changePct),
    currency: input.currency || "USD",
    marketStatus: input.marketStatus || "Unknown",
    dataStatus: input.dataStatus || "Delayed data",
    asOf: input.asOf || new Date().toISOString()
  };
}

function normalizeError(error) {
  return {
    message: error.message || "Unknown provider error",
    provider: error.providerName || "unknown",
    dataStatus: error.dataStatus || "Calculation unavailable",
    retryable: error.statusCode ? error.statusCode >= 500 : true
  };
}

function createDemoProvider() {
  const { assets, providerStatus } = require("./demo-data");
  return {
    name: "demo-provider",
    async health() {
      return providerStatus;
    },
    async search(query) {
      const q = String(query || "").toLowerCase();
      return assets.filter((asset) => `${asset.symbol} ${asset.name}`.toLowerCase().includes(q));
    },
    async quote(symbol) {
      const found = assets.find((asset) => asset.symbol.toLowerCase() === String(symbol || "").toLowerCase());
      if (!found) throw new ProviderUnavailableError("demo-provider", "Data unavailable");
      return normalizedQuote({ ...found, provider: "demo-provider", dataStatus: "Demo Mode" });
    }
  };
}

const CRYPTO_IDS = {
  "BTC-USD": "bitcoin",
  "ETH-USD": "ethereum",
  "SOL-USD": "solana",
  "XRP-USD": "ripple",
  "DOGE-USD": "dogecoin"
};

const STOCK_LIKE_TYPES = new Set(["Stock", "ETF", "Index"]);

function alphaSymbol(symbol) {
  if (symbol === "^GSPC") return "SPY";
  return symbol;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new ProviderUnavailableError(options.providerName || "provider", `Provider returned ${response.status}`);
  }
  return response.json();
}

function scoreFromChange(changePct) {
  const momentum = Math.max(5, Math.min(95, Math.round(50 + changePct * 8)));
  const risk = Math.max(15, Math.min(90, Math.round(45 + Math.abs(changePct) * 10)));
  const signal = changePct > 0.75 ? "Watch" : changePct < -1.5 ? "Avoid" : "Wait";
  const direction = changePct > 0.3 ? "Bullish" : changePct < -0.3 ? "Bearish" : "Neutral";
  return { momentum, risk, signal, direction };
}

function enrichAsset(base, quote) {
  const changePct = Number.isFinite(quote.changePct) ? quote.changePct : base.changePct;
  const scores = scoreFromChange(changePct);
  const confidence = quote.dataStatus === "Connected data" ? 72 : base.confidence;
  const dataQuality = quote.dataStatus === "Connected data" ? 82 : base.dataQuality;
  return {
    ...base,
    price: Number.isFinite(quote.price) ? quote.price : base.price,
    changePct,
    signal: scores.signal,
    direction: scores.direction,
    confidence,
    risk: scores.risk,
    momentum: scores.momentum,
    dataQuality,
    dataStatus: quote.dataStatus,
    provider: quote.provider,
    lastUpdated: quote.asOf,
    warning: quote.dataStatus === "Connected data"
      ? "Connected provider quote. Still verify freshness, fundamentals, and market context before acting."
      : base.warning
  };
}

async function alphaQuote(symbol, apiKey) {
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", alphaSymbol(symbol));
  url.searchParams.set("apikey", apiKey);
  const body = await fetchJson(url, { providerName: "alpha-vantage" });
  const quote = body["Global Quote"];
  if (!quote || !quote["05. price"]) {
    throw new ProviderUnavailableError("alpha-vantage", body.Note || body.Information || "Data unavailable");
  }
  return normalizedQuote({
    symbol,
    provider: "alpha-vantage",
    price: Number(quote["05. price"]),
    changePct: Number(String(quote["10. change percent"] || "0").replace("%", "")),
    marketStatus: "Delayed or latest provider quote",
    dataStatus: "Connected data",
    asOf: quote["07. latest trading day"] || new Date().toISOString()
  });
}

async function coinGeckoQuote(symbol, apiKey) {
  const id = CRYPTO_IDS[symbol];
  if (!id) throw new ProviderUnavailableError("coingecko", "Unsupported crypto symbol");
  const host = apiKey ? "https://pro-api.coingecko.com/api/v3/simple/price" : "https://api.coingecko.com/api/v3/simple/price";
  const url = new URL(host);
  url.searchParams.set("ids", id);
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_24hr_change", "true");
  url.searchParams.set("include_last_updated_at", "true");
  const headers = apiKey ? { "x-cg-pro-api-key": apiKey } : {};
  const body = await fetchJson(url, { headers, providerName: "coingecko" });
  const row = body[id];
  if (!row || row.usd == null) throw new ProviderUnavailableError("coingecko", "Data unavailable");
  return normalizedQuote({
    symbol,
    provider: apiKey ? "coingecko-pro" : "coingecko-public",
    price: Number(row.usd),
    changePct: Number(row.usd_24h_change || 0),
    marketStatus: "Crypto market open",
    dataStatus: "Connected data",
    asOf: row.last_updated_at ? new Date(row.last_updated_at * 1000).toISOString() : new Date().toISOString()
  });
}

function createConnectedProvider(env = process.env) {
  const demo = createDemoProvider();
  const stockKey = env.ALPHA_VANTAGE_API_KEY;
  const coinKey = env.COINGECKO_API_KEY || env.COINGECKO_DEMO_API_KEY;

  return {
    name: "connected-provider",
    async health() {
      return [
        { service: "Stock market API", status: stockKey ? "Configured" : "Not configured", lastSuccess: stockKey ? "On request" : null },
        { service: "Cryptocurrency API", status: "Configured", lastSuccess: "On request" },
        { service: "News API", status: env.FINNHUB_API_KEY ? "Configured" : "Not configured", lastSuccess: env.FINNHUB_API_KEY ? "On request" : null },
        { service: "AI research service", status: env.OPENAI_API_KEY ? "Configured" : "Not configured", lastSuccess: env.OPENAI_API_KEY ? "On request" : null },
        { service: "Database", status: env.SUPABASE_URL ? "Configured" : "Not configured", lastSuccess: null }
      ];
    },
    async quote(symbol) {
      const found = (await demo.search(symbol)).find((item) => item.symbol.toLowerCase() === String(symbol).toLowerCase());
      const base = found || (await demo.quote(symbol));
      try {
        let quote;
        if (base.type === "Crypto") quote = await coinGeckoQuote(base.symbol, coinKey);
        else if (STOCK_LIKE_TYPES.has(base.type) && stockKey) quote = await alphaQuote(base.symbol, stockKey);
        else throw new ProviderUnavailableError("connected-provider", "Provider not configured for this asset");
        return enrichAsset(base, quote);
      } catch (error) {
        const normalized = normalizeError(error);
        return { ...base, dataStatus: normalized.dataStatus, provider: normalized.provider };
      }
    },
    async market() {
      const { assets } = require("./demo-data");
      const rows = [];
      for (const item of assets) {
        rows.push(await this.quote(item.symbol));
      }
      const connected = rows.some((item) => item.dataStatus === "Connected data");
      return {
        mode: connected ? "Connected Data" : "Demo Mode",
        generatedAt: new Date().toISOString(),
        assets: rows,
        providerStatus: await this.health()
      };
    },
    async search(query) {
      const q = String(query || "").toLowerCase();
      const market = await this.market();
      return market.assets.filter((item) => `${item.symbol} ${item.name}`.toLowerCase().includes(q));
    }
  };
}

module.exports = {
  ProviderUnavailableError,
  createConnectedProvider,
  createDemoProvider,
  normalizedQuote,
  normalizeError
};
