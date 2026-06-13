const { cached } = require("./cache");
const { getSupabasePublicKey, getSupabaseUrl } = require("./env");
const { assets: demoAssets } = require("./demo-data");

function titleAssetType(type) {
  const value = String(type || "stock").toLowerCase();
  if (value === "etf") return "ETF";
  if (value === "crypto") return "Crypto";
  if (value === "index") return "Index";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function demoBase(symbol) {
  return demoAssets.find((asset) => asset.symbol === symbol);
}

async function publicRequest(path) {
  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) return [];
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path.replace(/^\//, "")}`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json"
    }
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Supabase public read returned ${response.status}${message ? `: ${message.slice(0, 120)}` : ""}`);
  }
  return response.json();
}

function quoteAgeStatus(row) {
  const dataStatus = row.data_status || "Cached";
  const timestamp = Date.parse(row.timestamp);
  if (!Number.isFinite(timestamp)) return dataStatus;
  const ageMs = Date.now() - timestamp;
  if (ageMs > 30 * 60_000 && dataStatus !== "Demo") return "Cached";
  return dataStatus;
}

function mergeAssetQuote(asset, quote) {
  const base = demoBase(asset.symbol) || {};
  const changePct = Number(quote?.change_percent ?? base.changePct ?? 0);
  const price = Number(quote?.price ?? base.price ?? 0);
  const volumeValue = quote?.volume == null
    ? base.volume || "N/A"
    : Number(quote.volume).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return {
    ...base,
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name || base.name || asset.symbol,
    type: titleAssetType(asset.asset_type || base.type),
    sector: asset.sector || base.sector || asset.exchange || "Unclassified",
    exchange: asset.exchange || null,
    currency: asset.currency || "USD",
    price,
    open: quote?.open ?? null,
    high: quote?.high ?? null,
    low: quote?.low ?? null,
    previousClose: quote?.previous_close ?? null,
    change: quote?.change ?? null,
    changePct,
    volume: volumeValue,
    marketCap: quote?.market_cap ?? null,
    dataStatus: quote ? quoteAgeStatus(quote) : "Cached",
    dataSource: quote?.provider ? `Supabase cache (${quote.provider})` : "Supabase asset universe",
    provider: quote?.provider || asset.provider || "supabase",
    lastUpdated: quote?.timestamp || asset.updated_at || asset.created_at || new Date().toISOString(),
    marketStatus: quote?.data_status || "Stored market data",
    timezone: asset.asset_type === "crypto" ? "UTC" : "America/New_York",
    relativeVolume: base.relativeVolume || 1,
    volatility: base.volatility || 35,
    technical: base.technical || 50,
    sentiment: base.sentiment || 50,
    liquidity: base.liquidity || 50,
    dataQuality: quote ? 88 : base.dataQuality || 60,
    support: base.support || price,
    resistance: base.resistance || price,
    history: Array.isArray(base.history) && base.history.length ? base.history : [price],
    warning: quote
      ? "Stored provider data from Supabase ingestion. Verify freshness and source labels before acting."
      : "Asset is available in Supabase but has no recent quote yet."
  };
}

async function getStoredMarket() {
  return cached("supabase-public-market", 30_000, async () => {
    const [assets, quotes, snapshots] = await Promise.all([
      publicRequest("assets?active=eq.true&select=id,symbol,provider_symbol,name,asset_type,exchange,currency,sector,industry,provider,created_at,updated_at&order=symbol.asc&limit=100"),
      publicRequest("market_quotes?select=id,asset_id,price,open,high,low,previous_close,change,change_percent,volume,market_cap,bid,ask,timestamp,provider,data_status,asset:assets(id,symbol,provider_symbol,name,asset_type,exchange,currency,sector,industry,provider,created_at,updated_at)&order=timestamp.desc&limit=300"),
      publicRequest("market_snapshots?select=*&order=timestamp.desc&limit=1")
    ]);

    const latestByAsset = new Map();
    for (const quote of quotes) {
      if (!latestByAsset.has(quote.asset_id)) latestByAsset.set(quote.asset_id, quote);
    }

    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    for (const quote of quotes) {
      const nested = quote.asset || quote.assets;
      if (nested?.id && !assetsById.has(nested.id)) assetsById.set(nested.id, nested);
    }

    const rows = [...assetsById.values()]
      .map((asset) => mergeAssetQuote(asset, latestByAsset.get(asset.id)))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    const snapshot = snapshots[0] || null;
    return {
      mode: rows.some((asset) => asset.dataStatus !== "Demo") ? "Connected Data" : "Demo Mode",
      dataStatus: rows.some((asset) => asset.dataStatus === "Live" || asset.dataStatus === "Delayed") ? "Delayed" : "Cached",
      generatedAt: new Date().toISOString(),
      assets: rows,
      marketStatus: snapshot?.market_status || { status: "Cached", timezone: "America/New_York", source: "Supabase cache" },
      snapshot,
      providerStatus: [
        { service: "Database", status: "Configured", lastSuccess: snapshot?.timestamp || rows[0]?.lastUpdated || null, provider: "Supabase public REST" },
        { service: "Scheduled ingestion", status: rows.length ? "Configured" : "Not configured", lastSuccess: rows[0]?.lastUpdated || null, provider: "Supabase Cron" }
      ]
    };
  }).then((result) => result.value);
}

async function getStoredQuote(symbol) {
  const market = await getStoredMarket();
  const found = market.assets.find((asset) => asset.symbol.toLowerCase() === String(symbol || "").toLowerCase());
  return found || null;
}

async function searchStoredAssets(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const market = await getStoredMarket();
  return market.assets
    .filter((asset) => `${asset.symbol} ${asset.name} ${asset.type} ${asset.sector}`.toLowerCase().includes(q))
    .slice(0, 12);
}

module.exports = {
  getStoredMarket,
  getStoredQuote,
  searchStoredAssets
};
