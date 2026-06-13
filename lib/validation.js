const VALID_DATA_QUALITY = new Set(["verified", "normal", "incomplete", "stale", "suspicious", "repaired"]);

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function sanitizeText(value, maxLength = 180) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function isValidTimestamp(value) {
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function validateQuote(quote) {
  const errors = [];
  if (!quote || !quote.symbol) errors.push("Missing symbol");
  if (!Number.isFinite(Number(quote.price)) || Number(quote.price) < 0) errors.push("Price must be a non-negative number");
  if (quote.high != null && quote.low != null && Number(quote.high) < Number(quote.low)) errors.push("High cannot be below low");
  if (quote.timestamp && !isValidTimestamp(quote.timestamp)) errors.push("Invalid provider timestamp");
  return {
    valid: errors.length === 0,
    errors,
    dataQuality: errors.length ? "suspicious" : quote.dataQuality || "normal"
  };
}

function validateBar(bar) {
  const errors = [];
  ["open", "high", "low", "close"].forEach((field) => {
    if (!Number.isFinite(Number(bar[field])) || Number(bar[field]) < 0) errors.push(`${field} must be non-negative`);
  });
  if (Number(bar.high) < Number(bar.low)) errors.push("High cannot be below low");
  if (!isValidTimestamp(bar.timestamp)) errors.push("Invalid bar timestamp");
  if (bar.data_quality && !VALID_DATA_QUALITY.has(bar.data_quality)) errors.push("Unknown data quality");
  return {
    valid: errors.length === 0,
    errors,
    dataQuality: errors.length ? "suspicious" : bar.data_quality || "normal"
  };
}

module.exports = {
  clamp,
  normalizeSymbol,
  sanitizeText,
  validateBar,
  validateQuote
};
