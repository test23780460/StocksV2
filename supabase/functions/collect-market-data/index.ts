type Asset = {
  id: string;
  symbol: string;
  provider_symbol: string | null;
  name: string;
  asset_type: "stock" | "etf" | "index" | "crypto" | "option" | "fund";
  exchange: string | null;
  currency: string | null;
  sector: string | null;
  provider: string | null;
};

type Quote = {
  asset: Asset;
  provider: string;
  price: number;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  marketCap: number | null;
  timestamp: string;
  dataStatus: "Live" | "Delayed" | "Cached" | "Demo" | "Temporarily unavailable" | "Market closed";
};

const CRYPTO_IDS: Record<string, string> = {
  "BTC-USD": "bitcoin",
  "ETH-USD": "ethereum",
  "SOL-USD": "solana",
  "XRP-USD": "ripple",
  "DOGE-USD": "dogecoin",
};

const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "SPY", "QQQ", "BTC-USD", "ETH-USD", "SOL-USD"];
const STOCK_BATCH_SIZE = Number(Deno.env.get("STOCK_BATCH_SIZE") || 5);
const CRYPTO_BATCH_SIZE = Number(Deno.env.get("CRYPTO_BATCH_SIZE") || 20);
const MAX_SYMBOLS_PER_RUN = Number(Deno.env.get("MAX_SYMBOLS_PER_RUN") || 25);
const API_REQUEST_BUDGET = Number(Deno.env.get("API_REQUEST_BUDGET") || 35);
const MAX_RUNTIME_MS = Number(Deno.env.get("MAX_RUNTIME_MS") || 45_000);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function requiredSecret(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} secret is required`);
  return value;
}

function assertCronSecret(request: Request) {
  const expected = requiredSecret("CRON_SECRET");
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!supplied || supplied !== expected) {
    return false;
  }
  return true;
}

function fiveMinuteBucket(date = new Date()) {
  const bucket = new Date(date);
  bucket.setUTCSeconds(0, 0);
  bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 5) * 5);
  return bucket.toISOString();
}

function isUsStockMarketOpen(date = new Date()) {
  // NYSE/Nasdaq regular session approximation: Mon-Fri, 9:30-16:00 ET.
  // Holidays and half-days should be added later through a market-calendar provider.
  const eastern = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = eastern.find((part) => part.type === "weekday")?.value || "Sun";
  const hour = Number(eastern.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(eastern.find((part) => part.type === "minute")?.value || 0);
  const weekdayOpen = !["Sat", "Sun"].includes(weekday);
  const minutes = hour * 60 + minute;
  return weekdayOpen && minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
}

function cryptoUpdateDue(date = new Date()) {
  // Crypto trades 24/7. Outside stock hours, update crypto every 15 minutes to
  // stay inside free execution/API limits.
  return date.getUTCMinutes() % 15 === 0;
}

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) output.push(items.slice(i, i + size));
  return output;
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, options: RequestInit & { retries?: number; provider?: string } = {}) {
  const retries = options.retries ?? 2;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.Note || body.Information) {
        const message = body.Note || body.Information || `${options.provider || "provider"} returned ${response.status}`;
        const retryable = response.status >= 500 || response.status === 429 || Boolean(body.Note);
        if (!retryable || attempt === retries) throw new Error(message);
        lastError = new Error(message);
      } else {
        return body;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === retries) throw lastError;
    } finally {
      clearTimeout(timeout);
    }
    await delay(250 * Math.pow(2, attempt));
  }
  throw lastError || new Error("Provider request failed");
}

async function supabaseRest(path: string, options: RequestInit = {}) {
  const supabaseUrl = requiredSecret("SUPABASE_URL").replace(/\/$/, "");
  const serviceRole = requiredSecret("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path.replace(/^\//, "")}`, {
    ...options,
    headers: {
      apikey: serviceRole,
      authorization: `Bearer ${serviceRole}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.message || `Supabase returned ${response.status}`);
  return body;
}

async function upsertAssetsFromDefaults() {
  const rows = DEFAULT_SYMBOLS.map((symbol) => ({
    symbol,
    provider_symbol: symbol,
    name: symbol,
    asset_type: symbol.endsWith("-USD") ? "crypto" : symbol.startsWith("^") ? "index" : ["SPY", "QQQ"].includes(symbol) ? "etf" : "stock",
    exchange: symbol.endsWith("-USD") ? "Crypto" : "US",
    currency: "USD",
    active: true,
    provider: "edge-default-universe",
  }));
  await supabaseRest("assets?on_conflict=symbol", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

async function loadTrackedAssets() {
  let assets = await supabaseRest(
    `assets?active=eq.true&select=id,symbol,provider_symbol,name,asset_type,exchange,currency,sector,provider&order=symbol.asc&limit=${MAX_SYMBOLS_PER_RUN}`,
  ) as Asset[];
  if (!assets.length) {
    await upsertAssetsFromDefaults();
    assets = await supabaseRest(
      `assets?active=eq.true&select=id,symbol,provider_symbol,name,asset_type,exchange,currency,sector,provider&order=symbol.asc&limit=${MAX_SYMBOLS_PER_RUN}`,
    ) as Asset[];
  }
  return assets;
}

function alphaSymbol(asset: Asset) {
  const symbol = asset.provider_symbol || asset.symbol;
  if (symbol === "^GSPC") return "SPY";
  return symbol.replace("-USD", "");
}

async function fetchAlphaQuote(asset: Asset): Promise<Quote> {
  const apiKey = requiredSecret("ALPHA_VANTAGE_API_KEY");
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", alphaSymbol(asset));
  url.searchParams.set("apikey", apiKey);
  const body = await fetchJson(url.toString(), { provider: "alpha-vantage" });
  const quote = body["Global Quote"];
  if (!quote?.["05. price"]) throw new Error(`No quote returned for ${asset.symbol}`);
  const price = Number(quote["05. price"]);
  const previousClose = Number(quote["08. previous close"] || 0);
  return {
    asset,
    provider: "alpha-vantage",
    price,
    open: Number(quote["02. open"] || price),
    high: Number(quote["03. high"] || price),
    low: Number(quote["04. low"] || price),
    previousClose,
    change: Number(quote["09. change"] || price - previousClose),
    changePercent: Number(String(quote["10. change percent"] || "0").replace("%", "")),
    volume: Number(quote["06. volume"] || 0) || null,
    marketCap: null,
    timestamp: fiveMinuteBucket(),
    dataStatus: "Delayed",
  };
}

async function fetchCryptoQuotes(assets: Asset[]): Promise<Quote[]> {
  const mapped = assets
    .map((asset) => ({ asset, id: CRYPTO_IDS[asset.symbol] }))
    .filter((item): item is { asset: Asset; id: string } => Boolean(item.id));
  if (!mapped.length) return [];

  const apiKey = Deno.env.get("COINGECKO_API_KEY");
  const host = apiKey
    ? "https://pro-api.coingecko.com/api/v3/simple/price"
    : "https://api.coingecko.com/api/v3/simple/price";
  const url = new URL(host);
  url.searchParams.set("ids", mapped.map((item) => item.id).join(","));
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_24hr_change", "true");
  url.searchParams.set("include_market_cap", "true");
  url.searchParams.set("include_24hr_vol", "true");
  url.searchParams.set("include_last_updated_at", "true");
  const body = await fetchJson(url.toString(), {
    provider: "coingecko",
    headers: apiKey ? { "x-cg-pro-api-key": apiKey } : undefined,
  });
  return mapped.flatMap(({ asset, id }) => {
    const row = body[id];
    if (!row?.usd) return [];
    return [{
      asset,
      provider: apiKey ? "coingecko-pro" : "coingecko-public",
      price: Number(row.usd),
      open: null,
      high: null,
      low: null,
      previousClose: null,
      change: null,
      changePercent: Number(row.usd_24h_change || 0),
      volume: Number(row.usd_24h_vol || 0) || null,
      marketCap: Number(row.usd_market_cap || 0) || null,
      timestamp: fiveMinuteBucket(),
      dataStatus: apiKey ? "Live" : "Delayed",
    }];
  });
}

function validQuote(quote: Quote) {
  return Number.isFinite(quote.price) && quote.price >= 0 && (quote.high == null || quote.low == null || quote.high >= quote.low);
}

async function createRun(jobName: string, provider: string, symbols: string[], marketOpen: boolean) {
  const rows = await supabaseRest("data_ingestion_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      job_name: jobName,
      provider,
      started_at: new Date().toISOString(),
      status: "running",
      requested_symbols: symbols,
      metadata: { marketOpen, bucket: fiveMinuteBucket(), runner: "supabase-edge-function" },
    }]),
  }) as Array<{ id: string }>;
  return rows[0]?.id;
}

async function completeRun(id: string | undefined, body: Record<string, unknown>) {
  if (!id) return;
  await supabaseRest(`data_ingestion_runs?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...body, completed_at: new Date().toISOString() }),
  });
}

async function saveQuotes(quotes: Quote[]) {
  if (!quotes.length) return 0;
  const rows = quotes.filter(validQuote).map((quote) => ({
    asset_id: quote.asset.id,
    price: quote.price,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    previous_close: quote.previousClose,
    change: quote.change,
    change_percent: quote.changePercent,
    volume: quote.volume,
    market_cap: quote.marketCap,
    bid: null,
    ask: null,
    timestamp: quote.timestamp,
    provider: quote.provider,
    data_status: quote.dataStatus,
  }));
  await supabaseRest("market_quotes?on_conflict=asset_id,timestamp,provider", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  return rows.length;
}

async function saveMarketSnapshot(quotes: Quote[], marketOpen: boolean) {
  const bucket = fiveMinuteBucket();
  const indexQuotes = quotes.filter((quote) => ["index", "etf"].includes(quote.asset.asset_type));
  const cryptoQuotes = quotes.filter((quote) => quote.asset.asset_type === "crypto");
  const trending = [...quotes]
    .sort((a, b) => Math.abs(Number(b.changePercent || 0)) - Math.abs(Number(a.changePercent || 0)))
    .slice(0, 10)
    .map((quote) => ({
      symbol: quote.asset.symbol,
      changePercent: quote.changePercent,
      volume: quote.volume,
      provider: quote.provider,
    }));

  await supabaseRest("market_snapshots?on_conflict=timestamp", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      timestamp: bucket,
      market_status: { stockMarketOpen: marketOpen, cryptoUpdateDue: cryptoUpdateDue(), bucket },
      major_index_values: Object.fromEntries(indexQuotes.map((quote) => [quote.asset.symbol, quote.price])),
      advance_decline_data: {
        advancing: quotes.filter((quote) => Number(quote.changePercent || 0) > 0).length,
        declining: quotes.filter((quote) => Number(quote.changePercent || 0) < 0).length,
      },
      volatility_data: {},
      sector_performance: {},
      trending_assets: trending,
      market_breadth: { processedAssets: quotes.length },
      crypto_market_summary: Object.fromEntries(cryptoQuotes.map((quote) => [quote.asset.symbol, quote.price])),
      provider_metadata: { providers: [...new Set(quotes.map((quote) => quote.provider))], function: "collect-market-data" },
    }]),
  });
}

Deno.serve(async (request) => {
  const started = Date.now();
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (!assertCronSecret(request)) return json({ error: "Unauthorized" }, 401);
  } catch (error) {
    return json({ status: "error", message: error instanceof Error ? error.message : String(error) }, 500);
  }

  let runId: string | undefined;
  const failures: Array<{ symbol: string; error: string }> = [];
  const quotes: Quote[] = [];
  let apiRequests = 0;

  try {
    const marketOpen = isUsStockMarketOpen();
    const updateCrypto = cryptoUpdateDue();
    const assets = await loadTrackedAssets();
    const stockAssets = marketOpen
      ? assets.filter((asset) => ["stock", "etf", "index"].includes(asset.asset_type)).slice(0, MAX_SYMBOLS_PER_RUN)
      : [];
    const cryptoAssets = updateCrypto
      ? assets.filter((asset) => asset.asset_type === "crypto").slice(0, MAX_SYMBOLS_PER_RUN)
      : [];
    const selected = [...stockAssets, ...cryptoAssets].slice(0, MAX_SYMBOLS_PER_RUN);

    if (!selected.length) {
      return json({
        status: "skipped",
        reason: "stock market closed and crypto update not due",
        marketOpen,
        cryptoUpdateDue: updateCrypto,
      });
    }

    runId = await createRun("collect-market-data", "edge-function", selected.map((asset) => asset.symbol), marketOpen);

    for (const batch of chunks(stockAssets, STOCK_BATCH_SIZE)) {
      for (const asset of batch) {
        if (Date.now() - started > MAX_RUNTIME_MS || apiRequests >= API_REQUEST_BUDGET) break;
        try {
          quotes.push(await fetchAlphaQuote(asset));
          apiRequests += 1;
        } catch (error) {
          failures.push({ symbol: asset.symbol, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    for (const batch of chunks(cryptoAssets, CRYPTO_BATCH_SIZE)) {
      if (Date.now() - started > MAX_RUNTIME_MS || apiRequests >= API_REQUEST_BUDGET) break;
      try {
        quotes.push(...await fetchCryptoQuotes(batch));
        apiRequests += 1;
      } catch (error) {
        for (const asset of batch) {
          failures.push({ symbol: asset.symbol, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    const rowsInserted = await saveQuotes(quotes);
    await saveMarketSnapshot(quotes, marketOpen);
    await completeRun(runId, {
      status: failures.length ? "partial_success" : "success",
      successful_symbols: quotes.map((quote) => quote.asset.symbol),
      failed_symbols: failures,
      rows_inserted: rowsInserted,
      api_requests: apiRequests,
      metadata: {
        bucket: fiveMinuteBucket(),
        marketOpen,
        cryptoUpdateDue: updateCrypto,
        runtimeMs: Date.now() - started,
        idempotency: "market_quotes unique(asset_id,timestamp,provider), market_snapshots unique(timestamp)",
      },
    });

    return json({
      status: failures.length ? "partial_success" : "success",
      processed: quotes.length,
      failed: failures.length,
      rowsInserted,
      apiRequests,
      bucket: fiveMinuteBucket(),
      runtimeMs: Date.now() - started,
    });
  } catch (error) {
    await completeRun(runId, {
      status: "failed",
      failed_symbols: failures,
      rows_inserted: 0,
      api_requests: apiRequests,
      error_message: error instanceof Error ? error.message : String(error),
      metadata: { runtimeMs: Date.now() - started, bucket: fiveMinuteBucket() },
    }).catch(() => null);
    return json({ status: "error", message: error instanceof Error ? error.message : String(error) }, 500);
  }
});
