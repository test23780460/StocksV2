/**
 * Provider contracts for connected-data mode.
 *
 * All provider calls normalize into the same shape before reaching UI, jobs, or
 * scoring. API keys are read only on the server and raw provider payloads are
 * never returned to browser routes.
 */

const { cached } = require("./cache");
const {
  getEnv,
  hasSupabaseServerConfig,
  selectedMarketProvider,
  selectedNewsProvider
} = require("./env");
const { calculateIndicators } = require("./calculations");
const { normalizeSymbol } = require("./validation");

class ProviderUnavailableError extends Error {
  constructor(providerName, reason = "Provider unavailable", statusCode = 503) {
    super(reason);
    this.name = "ProviderUnavailableError";
    this.providerName = providerName;
    this.statusCode = statusCode;
    this.dataStatus = statusCode === 429 ? "Temporarily unavailable" : "Temporarily unavailable";
  }
}

const DATA_STATUS = {
  LIVE: "Live",
  DELAYED: "Delayed",
  CACHED: "Cached",
  DEMO: "Demo",
  UNAVAILABLE: "Temporarily unavailable",
  CLOSED: "Market closed"
};

const CRYPTO_IDS = {
  "BTC-USD": "bitcoin",
  "ETH-USD": "ethereum",
  "SOL-USD": "solana",
  "XRP-USD": "ripple",
  "DOGE-USD": "dogecoin"
};

const STOCK_LIKE_TYPES = new Set(["Stock", "ETF", "Index"]);

function normalizedQuote(input) {
  const timestamp = input.timestamp || input.asOf || new Date().toISOString();
  return {
    symbol: normalizeSymbol(input.symbol),
    provider: input.provider || "unknown",
    price: Number(input.price),
    open: input.open == null ? null : Number(input.open),
    high: input.high == null ? null : Number(input.high),
    low: input.low == null ? null : Number(input.low),
    previousClose: input.previousClose == null ? null : Number(input.previousClose),
    change: input.change == null ? null : Number(input.change),
    changePct: Number(input.changePct ?? input.change_percent ?? 0),
    volume: input.volume ?? null,
    marketCap: input.marketCap ?? null,
    bid: input.bid ?? null,
    ask: input.ask ?? null,
    currency: input.currency || "USD",
    marketStatus: input.marketStatus || "Unknown",
    dataStatus: input.dataStatus || DATA_STATUS.DELAYED,
    dataSource: input.dataSource || input.provider || "unknown",
    timezone: input.timezone || "America/New_York",
    asOf: timestamp,
    timestamp,
    error: input.error || null
  };
}

function normalizeError(error) {
  return {
    message: error.message || "Unknown provider error",
    provider: error.providerName || "unknown",
    dataStatus: error.dataStatus || DATA_STATUS.UNAVAILABLE,
    retryable: error.statusCode ? error.statusCode >= 500 || error.statusCode === 429 : true
  };
}

function alphaSymbol(symbol) {
  if (symbol === "^GSPC") return "SPY";
  return symbol.replace("-USD", "");
}

function buildHistoryFromAsset(asset) {
  const start = Date.now() - asset.history.length * 86_400_000;
  return asset.history.map((close, index) => ({
    symbol: asset.symbol,
    interval: "1d",
    timestamp: new Date(start + index * 86_400_000).toISOString(),
    open: close * 0.995,
    high: close * 1.01,
    low: close * 0.99,
    close,
    adjusted_close: close,
    volume: null,
    provider: "demo-provider",
    data_quality: "demo"
  }));
}

async function fetchJson(url, options = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 8500);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new ProviderUnavailableError(options.providerName || "provider", `Provider returned ${response.status}`, response.status);
      error.payload = json;
      throw error;
    }
    return {
      body: json,
      status: response.status,
      responseTimeMs: Date.now() - startedAt
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ProviderUnavailableError(options.providerName || "provider", "Provider timed out", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function scoreFromChange(changePct) {
  const momentum = Math.max(5, Math.min(95, Math.round(50 + Number(changePct) * 8)));
  const risk = Math.max(15, Math.min(90, Math.round(45 + Math.abs(Number(changePct)) * 10)));
  const signal = changePct > 0.75 ? "Watch" : changePct < -1.5 ? "Avoid" : "Wait";
  const direction = changePct > 0.3 ? "Bullish" : changePct < -0.3 ? "Bearish" : "Neutral";
  return { momentum, risk, signal, direction };
}

function enrichAsset(base, quote) {
  const changePct = Number.isFinite(quote.changePct) ? quote.changePct : base.changePct;
  const scores = scoreFromChange(changePct);
  const connected = [DATA_STATUS.LIVE, DATA_STATUS.DELAYED, DATA_STATUS.CACHED, DATA_STATUS.CLOSED].includes(quote.dataStatus);
  return {
    ...base,
    price: Number.isFinite(quote.price) ? quote.price : base.price,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    previousClose: quote.previousClose,
    change: quote.change,
    changePct,
    signal: scores.signal,
    direction: scores.direction,
    confidence: connected ? 72 : base.confidence,
    risk: scores.risk,
    momentum: scores.momentum,
    dataQuality: connected ? 82 : base.dataQuality,
    dataStatus: quote.dataStatus,
    dataSource: quote.dataSource,
    provider: quote.provider,
    lastUpdated: quote.asOf,
    timezone: quote.timezone,
    marketStatus: quote.marketStatus,
    error: quote.error,
    warning: connected
      ? "Connected provider quote. Still verify freshness, fundamentals, and market context before acting."
      : base.warning
  };
}

function createDemoProvider() {
  const { assets, providerStatus } = require("./demo-data");
  return {
    name: "demo-provider",
    async health() {
      return providerStatus;
    },
    async searchAssets(query) {
      const q = String(query || "").toLowerCase();
      return assets.filter((asset) => `${asset.symbol} ${asset.name}`.toLowerCase().includes(q));
    },
    async search(query) {
      return this.searchAssets(query);
    },
    async getQuote(symbol) {
      const found = assets.find((asset) => asset.symbol.toLowerCase() === String(symbol || "").toLowerCase());
      if (!found) throw new ProviderUnavailableError("demo-provider", "Data unavailable", 404);
      return normalizedQuote({
        ...found,
        provider: "demo-provider",
        dataStatus: DATA_STATUS.DEMO,
        dataSource: "Demo dataset",
        marketStatus: "Demo dataset"
      });
    },
    async quote(symbol) {
      const quote = await this.getQuote(symbol);
      const base = assets.find((asset) => asset.symbol === quote.symbol) || assets[0];
      return enrichAsset(base, quote);
    },
    async getHistoricalBars(symbol) {
      const found = assets.find((asset) => asset.symbol.toLowerCase() === String(symbol || "").toLowerCase());
      return found ? buildHistoryFromAsset(found) : [];
    },
    async getMarketMovers() {
      return {
        gainers: [...assets].sort((a, b) => b.changePct - a.changePct).slice(0, 5),
        losers: [...assets].sort((a, b) => a.changePct - b.changePct).slice(0, 5),
        mostActive: [...assets].sort((a, b) => b.relativeVolume - a.relativeVolume).slice(0, 5)
      };
    },
    async getMarketStatus() {
      return { status: DATA_STATUS.DEMO, isOpen: false, timezone: "America/New_York", source: "demo-provider" };
    },
    async getCompanyProfile(symbol) {
      const found = assets.find((asset) => asset.symbol.toLowerCase() === String(symbol || "").toLowerCase());
      return found ? { symbol: found.symbol, name: found.name, sector: found.sector, assetType: found.type, provider: "demo-provider" } : null;
    },
    async getTechnicalData(symbol) {
      return calculateIndicators(await this.getHistoricalBars(symbol));
    },
    async getNews(symbol) {
      const { news } = require("./demo-data");
      return news.filter((item) => !symbol || item.related?.includes(symbol)).map((item) => ({
        title: item.headline,
        summary: item.headline,
        source: item.source,
        url: null,
        publishedAt: item.published || new Date().toISOString(),
        sentiment: item.sentiment,
        relevanceScore: 0.5,
        provider: "demo-provider"
      }));
    },
    async getCryptoQuote(symbol) {
      return this.getQuote(symbol);
    },
    async getBatchQuotes(symbols) {
      return Promise.all(symbols.map((symbol) => this.quote(symbol)));
    },
    async market() {
      return {
        mode: "Demo Mode",
        dataStatus: DATA_STATUS.DEMO,
        generatedAt: new Date().toISOString(),
        assets: await this.getBatchQuotes(assets.map((item) => item.symbol)),
        providerStatus: await this.health()
      };
    }
  };
}

async function alphaQuote(symbol, apiKey) {
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", alphaSymbol(symbol));
  url.searchParams.set("apikey", apiKey);
  const { body } = await fetchJson(url, { providerName: "alpha-vantage" });
  const quote = body["Global Quote"];
  if (!quote || !quote["05. price"]) {
    throw new ProviderUnavailableError("alpha-vantage", body.Note || body.Information || "Data unavailable", body.Note ? 429 : 503);
  }
  const price = Number(quote["05. price"]);
  const previousClose = Number(quote["08. previous close"] || 0);
  return normalizedQuote({
    symbol,
    provider: "alpha-vantage",
    dataSource: "Alpha Vantage",
    price,
    open: Number(quote["02. open"] || price),
    high: Number(quote["03. high"] || price),
    low: Number(quote["04. low"] || price),
    previousClose,
    change: Number(quote["09. change"] || price - previousClose),
    changePct: Number(String(quote["10. change percent"] || "0").replace("%", "")),
    volume: Number(quote["06. volume"] || 0) || null,
    marketStatus: "Delayed or latest provider quote",
    dataStatus: DATA_STATUS.DELAYED,
    asOf: quote["07. latest trading day"] || new Date().toISOString()
  });
}

async function alphaSearch(query, apiKey) {
  if (!apiKey || !query) return [];
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "SYMBOL_SEARCH");
  url.searchParams.set("keywords", query);
  url.searchParams.set("apikey", apiKey);
  const { body } = await fetchJson(url, { providerName: "alpha-vantage" });
  if (body.Note || body.Information) throw new ProviderUnavailableError("alpha-vantage", body.Note || body.Information, 429);
  return (body.bestMatches || []).slice(0, 8).map((row) => ({
    symbol: row["1. symbol"],
    provider_symbol: row["1. symbol"],
    name: row["2. name"],
    type: row["3. type"] || "Stock",
    exchange: row["4. region"],
    currency: row["8. currency"],
    provider: "alpha-vantage",
    dataStatus: DATA_STATUS.DELAYED
  }));
}

async function alphaHistorical(symbol, interval, startDate, endDate, apiKey) {
  if (!apiKey) throw new ProviderUnavailableError("alpha-vantage", "Alpha Vantage key is missing");
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "TIME_SERIES_DAILY_ADJUSTED");
  url.searchParams.set("symbol", alphaSymbol(symbol));
  url.searchParams.set("outputsize", "full");
  url.searchParams.set("apikey", apiKey);
  const { body } = await fetchJson(url, { providerName: "alpha-vantage", timeoutMs: 12000 });
  const series = body["Time Series (Daily)"];
  if (!series) throw new ProviderUnavailableError("alpha-vantage", body.Note || body.Information || "Historical data unavailable", body.Note ? 429 : 503);
  const start = startDate ? Date.parse(startDate) : Date.now() - 5 * 366 * 86_400_000;
  const end = endDate ? Date.parse(endDate) : Date.now();
  return Object.entries(series)
    .map(([date, row]) => ({
      symbol,
      interval: interval || "1d",
      timestamp: new Date(`${date}T00:00:00.000Z`).toISOString(),
      open: Number(row["1. open"]),
      high: Number(row["2. high"]),
      low: Number(row["3. low"]),
      close: Number(row["4. close"]),
      adjusted_close: Number(row["5. adjusted close"]),
      volume: Number(row["6. volume"]),
      provider: "alpha-vantage",
      data_quality: "normal"
    }))
    .filter((bar) => Date.parse(bar.timestamp) >= start && Date.parse(bar.timestamp) <= end)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

async function coinGeckoQuote(symbol, apiKey) {
  const id = CRYPTO_IDS[symbol];
  if (!id) throw new ProviderUnavailableError("coingecko", "Unsupported crypto symbol", 404);
  const host = apiKey ? "https://pro-api.coingecko.com/api/v3/simple/price" : "https://api.coingecko.com/api/v3/simple/price";
  const url = new URL(host);
  url.searchParams.set("ids", id);
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_24hr_change", "true");
  url.searchParams.set("include_market_cap", "true");
  url.searchParams.set("include_24hr_vol", "true");
  url.searchParams.set("include_last_updated_at", "true");
  const headers = apiKey ? { "x-cg-pro-api-key": apiKey } : {};
  const { body } = await fetchJson(url, { headers, providerName: "coingecko" });
  const row = body[id];
  if (!row || row.usd == null) throw new ProviderUnavailableError("coingecko", "Data unavailable");
  return normalizedQuote({
    symbol,
    provider: apiKey ? "coingecko-pro" : "coingecko-public",
    dataSource: "CoinGecko",
    price: Number(row.usd),
    changePct: Number(row.usd_24h_change || 0),
    volume: row.usd_24h_vol || null,
    marketCap: row.usd_market_cap || null,
    marketStatus: "Crypto market open",
    dataStatus: apiKey ? DATA_STATUS.LIVE : DATA_STATUS.DELAYED,
    timezone: "UTC",
    asOf: row.last_updated_at ? new Date(row.last_updated_at * 1000).toISOString() : new Date().toISOString()
  });
}

async function finnhubNews(symbol, apiKey) {
  if (!apiKey) return [];
  const today = new Date();
  const from = new Date(today.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  const url = new URL(symbol ? "https://finnhub.io/api/v1/company-news" : "https://finnhub.io/api/v1/news");
  if (symbol) {
    url.searchParams.set("symbol", alphaSymbol(symbol));
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
  } else {
    url.searchParams.set("category", "general");
  }
  url.searchParams.set("token", apiKey);
  const { body } = await fetchJson(url, { providerName: "finnhub" });
  return (Array.isArray(body) ? body : []).slice(0, 20).map((article) => ({
    providerArticleId: String(article.id || article.url || article.headline),
    title: article.headline,
    summary: article.summary,
    source: article.source,
    author: null,
    url: article.url,
    imageUrl: article.image,
    publishedAt: article.datetime ? new Date(article.datetime * 1000).toISOString() : new Date().toISOString(),
    sentiment: "Neutral",
    sentimentScore: 0,
    relevanceScore: symbol ? 0.85 : 0.55,
    provider: "finnhub"
  }));
}

function createConnectedProvider(env = process.env) {
  const demo = createDemoProvider();
  const stockKey = env.ALPHA_VANTAGE_API_KEY;
  const coinKey = env.COINGECKO_API_KEY || env.COINGECKO_DEMO_API_KEY;
  const finnhubKey = env.FINNHUB_API_KEY;
  const marketProvider = selectedMarketProvider();

  async function getBase(symbol) {
    const found = (await demo.searchAssets(symbol)).find((item) => item.symbol.toLowerCase() === String(symbol).toLowerCase());
    if (found) return found;
    return {
      symbol: normalizeSymbol(symbol),
      name: normalizeSymbol(symbol),
      type: symbol?.includes("-USD") ? "Crypto" : "Stock",
      sector: "Unclassified",
      price: 0,
      changePct: 0,
      signal: "Wait",
      direction: "Neutral",
      confidence: 0,
      risk: 70,
      rsi: 50,
      volume: "N/A",
      relativeVolume: 1,
      volatility: 40,
      momentum: 50,
      technical: 50,
      sentiment: 50,
      liquidity: 50,
      dataQuality: 0,
      support: 0,
      resistance: 0,
      warning: "Asset is not in the demo universe. Provider data may be limited.",
      history: []
    };
  }

  return {
    name: "connected-provider",
    async health() {
      return [
        { service: "Stock market API", status: stockKey ? "Configured" : "Not configured", lastSuccess: stockKey ? "On request" : null, provider: "Alpha Vantage" },
        { service: "Cryptocurrency API", status: "Configured", lastSuccess: "On request", provider: coinKey ? "CoinGecko Pro" : "CoinGecko public" },
        { service: "News API", status: finnhubKey ? "Configured" : "Not configured", lastSuccess: finnhubKey ? "On request" : null, provider: selectedNewsProvider() === "finnhub" || selectedNewsProvider() === "auto" ? "Finnhub" : selectedNewsProvider() },
        { service: "Database", status: hasSupabaseServerConfig() ? "Configured" : "Not configured", lastSuccess: null, provider: "Supabase Postgres" }
      ];
    },
    async getQuote(symbol) {
      const base = await getBase(symbol);
      try {
        const cacheKey = `quote:${base.symbol}:${marketProvider}`;
        const ttl = base.type === "Crypto" ? 25_000 : 60_000;
        const result = await cached(cacheKey, ttl, async () => {
          if (base.type === "Crypto") return coinGeckoQuote(base.symbol, coinKey);
          if (STOCK_LIKE_TYPES.has(base.type) && stockKey) return alphaQuote(base.symbol, stockKey);
          throw new ProviderUnavailableError("connected-provider", "Provider not configured for this asset");
        });
        return result.stale ? { ...result.value, dataStatus: DATA_STATUS.CACHED } : result.value;
      } catch (error) {
        const normalized = normalizeError(error);
        return normalizedQuote({
          ...base,
          provider: normalized.provider,
          dataStatus: normalized.dataStatus,
          dataSource: normalized.provider,
          marketStatus: "Provider unavailable",
          error: normalized.message
        });
      }
    },
    async quote(symbol) {
      const base = await getBase(symbol);
      const quote = await this.getQuote(symbol);
      return enrichAsset(base, quote);
    },
    async getBatchQuotes(symbols) {
      const rows = [];
      for (const symbol of symbols) rows.push(await this.quote(symbol));
      return rows;
    },
    async searchAssets(query) {
      const q = String(query || "").trim();
      const local = await demo.searchAssets(q);
      if (!q || !stockKey) return local;
      try {
        const remote = await cached(`search:${q}`, 120_000, () => alphaSearch(q, stockKey));
        const seen = new Set(local.map((item) => item.symbol));
        return [...local, ...remote.value.filter((item) => !seen.has(item.symbol))].slice(0, 12);
      } catch {
        return local.map((item) => ({ ...item, dataStatus: DATA_STATUS.DEMO }));
      }
    },
    async search(query) {
      return this.searchAssets(query);
    },
    async getHistoricalBars(symbol, interval = "1d", startDate, endDate) {
      const base = await getBase(symbol);
      if (base.type === "Crypto") {
        return demo.getHistoricalBars(symbol, interval, startDate, endDate);
      }
      try {
        return cached(`history:${symbol}:${interval}:${startDate || "5y"}:${endDate || "now"}`, 86_400_000, () => alphaHistorical(symbol, interval, startDate, endDate, stockKey)).then((result) => result.value);
      } catch (error) {
        return demo.getHistoricalBars(symbol, interval, startDate, endDate);
      }
    },
    async getMarketMovers() {
      const market = await this.market();
      return {
        gainers: [...market.assets].sort((a, b) => b.changePct - a.changePct).slice(0, 5),
        losers: [...market.assets].sort((a, b) => a.changePct - b.changePct).slice(0, 5),
        mostActive: [...market.assets].sort((a, b) => b.relativeVolume - a.relativeVolume).slice(0, 5)
      };
    },
    async getMarketStatus() {
      const now = new Date();
      const utcDay = now.getUTCDay();
      const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      const regularOpen = utcDay >= 1 && utcDay <= 5 && minutes >= 13 * 60 + 30 && minutes <= 20 * 60;
      return {
        status: regularOpen ? DATA_STATUS.DELAYED : DATA_STATUS.CLOSED,
        isOpen: regularOpen,
        timezone: "America/New_York",
        source: "calendar-rule",
        updatedAt: now.toISOString()
      };
    },
    async getCompanyProfile(symbol) {
      const base = await getBase(symbol);
      return { symbol: base.symbol, name: base.name, sector: base.sector, assetType: base.type, exchange: base.exchange || null, provider: "local-universe" };
    },
    async getTechnicalData(symbol, interval = "1d") {
      return calculateIndicators(await this.getHistoricalBars(symbol, interval));
    },
    async getNews(symbol) {
      try {
        const rows = await cached(`news:${symbol || "market"}`, 900_000, () => finnhubNews(symbol, finnhubKey));
        return rows.value.length ? rows.value : demo.getNews(symbol);
      } catch {
        return demo.getNews(symbol);
      }
    },
    async getCryptoQuote(symbol) {
      return coinGeckoQuote(symbol, coinKey);
    },
    async market() {
      const { assets } = require("./demo-data");
      const rows = await this.getBatchQuotes(assets.map((item) => item.symbol));
      const connected = rows.some((item) => [DATA_STATUS.LIVE, DATA_STATUS.DELAYED, DATA_STATUS.CACHED, DATA_STATUS.CLOSED].includes(item.dataStatus));
      return {
        mode: connected ? "Connected Data" : "Demo Mode",
        dataStatus: connected ? DATA_STATUS.DELAYED : DATA_STATUS.DEMO,
        generatedAt: new Date().toISOString(),
        assets: rows,
        marketStatus: await this.getMarketStatus(),
        movers: {
          gainers: [...rows].sort((a, b) => b.changePct - a.changePct).slice(0, 5),
          losers: [...rows].sort((a, b) => a.changePct - b.changePct).slice(0, 5),
          mostActive: [...rows].sort((a, b) => b.relativeVolume - a.relativeVolume).slice(0, 5)
        },
        news: await this.getNews(),
        providerStatus: await this.health()
      };
    }
  };
}

module.exports = {
  DATA_STATUS,
  ProviderUnavailableError,
  createConnectedProvider,
  createDemoProvider,
  normalizedQuote,
  normalizeError
};
