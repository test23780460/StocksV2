const test = require("node:test");
const assert = require("node:assert/strict");
const { cached, getCache, rateLimit, setCache } = require("../lib/cache");
const { createDemoProvider, normalizedQuote } = require("../lib/providerContract");
const { sanitizeText, validateBar, validateQuote } = require("../lib/validation");

test("normalizes provider quotes into a safe public shape", () => {
  const quote = normalizedQuote({
    symbol: "aapl",
    provider: "test-provider",
    price: "123.45",
    changePct: "1.25",
    dataStatus: "Delayed"
  });
  assert.equal(quote.symbol, "AAPL");
  assert.equal(quote.price, 123.45);
  assert.equal(quote.dataStatus, "Delayed");
  assert.ok(!("raw" in quote));
});

test("demo provider implements market-data provider methods", async () => {
  const provider = createDemoProvider();
  const results = await provider.searchAssets("apple");
  assert.equal(results[0].symbol, "AAPL");
  const quote = await provider.getQuote("AAPL");
  assert.equal(quote.dataStatus, "Demo");
  const bars = await provider.getHistoricalBars("AAPL");
  assert.ok(bars.length > 0);
  const movers = await provider.getMarketMovers();
  assert.ok(movers.gainers.length > 0);
});

test("cache returns fresh values and marks stale entries", async () => {
  let calls = 0;
  const first = await cached("unit-cache-key", 50, async () => {
    calls += 1;
    return { value: calls };
  });
  const second = await cached("unit-cache-key", 50, async () => {
    calls += 1;
    return { value: calls };
  });
  assert.equal(first.value.value, 1);
  assert.equal(second.value.value, 1);
  setCache("short-lived", { ok: true }, -1);
  assert.equal(getCache("short-lived").stale, true);
});

test("rate limiter blocks after configured threshold", () => {
  const key = `limit-${Date.now()}`;
  assert.equal(rateLimit(key, { limit: 2, windowMs: 1000 }).allowed, true);
  assert.equal(rateLimit(key, { limit: 2, windowMs: 1000 }).allowed, true);
  assert.equal(rateLimit(key, { limit: 2, windowMs: 1000 }).allowed, false);
});

test("validation catches bad market data and sanitizes user text", () => {
  assert.equal(validateQuote({ symbol: "AAPL", price: -1 }).valid, false);
  assert.equal(validateBar({ timestamp: "2026-01-01T00:00:00Z", open: 10, high: 8, low: 9, close: 9 }).valid, false);
  assert.equal(sanitizeText("<b>My Watchlist</b>"), "bMy Watchlist/b");
});
