const memory = new Map();
const buckets = new Map();

function now() {
  return Date.now();
}

function getCache(key) {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt < now()) {
    memory.delete(key);
    return { stale: true, value: entry.value, updatedAt: entry.updatedAt };
  }
  return { stale: false, value: entry.value, updatedAt: entry.updatedAt };
}

function setCache(key, value, ttlMs) {
  const updatedAt = new Date().toISOString();
  memory.set(key, {
    value,
    updatedAt,
    expiresAt: now() + ttlMs
  });
  return value;
}

async function cached(key, ttlMs, loader) {
  const hit = getCache(key);
  if (hit && !hit.stale) return { ...hit, source: "memory" };
  const value = await loader(hit?.value);
  setCache(key, value, ttlMs);
  return { value, stale: false, updatedAt: new Date().toISOString(), source: "origin" };
}

function rateLimit(key, options = {}) {
  const limit = options.limit || 30;
  const windowMs = options.windowMs || 60_000;
  const current = now();
  const bucket = buckets.get(key) || [];
  const active = bucket.filter((timestamp) => current - timestamp < windowMs);
  active.push(current);
  buckets.set(key, active);
  return {
    allowed: active.length <= limit,
    remaining: Math.max(0, limit - active.length),
    resetAt: new Date(active[0] + windowMs).toISOString()
  };
}

module.exports = {
  cached,
  getCache,
  rateLimit,
  setCache
};
