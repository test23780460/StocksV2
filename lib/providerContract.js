/**
 * Provider contracts for future connected-data mode.
 *
 * Real providers should normalize responses into these shapes before the UI or
 * scoring layer sees the data. Never return raw third-party payloads to clients.
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

module.exports = {
  ProviderUnavailableError,
  createDemoProvider,
  normalizedQuote,
  normalizeError
};
