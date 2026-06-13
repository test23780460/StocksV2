const assets = [
  { symbol: "AAPL", name: "Apple Inc.", type: "Stock", price: 196.45, changePct: 0.82, signal: "Watch", risk: 42, confidence: 74, dataStatus: "Demo Mode" },
  { symbol: "MSFT", name: "Microsoft Corp.", type: "Stock", price: 477.86, changePct: 1.24, signal: "Watch", risk: 38, confidence: 79, dataStatus: "Demo Mode" },
  { symbol: "NVDA", name: "NVIDIA Corp.", type: "Stock", price: 143.12, changePct: -1.91, signal: "Wait", risk: 67, confidence: 64, dataStatus: "Demo Mode" },
  { symbol: "TSLA", name: "Tesla Inc.", type: "Stock", price: 181.62, changePct: -2.47, signal: "Avoid", risk: 76, confidence: 57, dataStatus: "Demo Mode" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", type: "ETF", price: 612.37, changePct: 0.34, signal: "Watch", risk: 35, confidence: 70, dataStatus: "Demo Mode" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", type: "ETF", price: 541.77, changePct: 0.56, signal: "Watch", risk: 44, confidence: 72, dataStatus: "Demo Mode" },
  { symbol: "BTC-USD", name: "Bitcoin", type: "Crypto", price: 104230.5, changePct: 2.18, signal: "Watch", risk: 71, confidence: 68, dataStatus: "Demo Mode" },
  { symbol: "ETH-USD", name: "Ethereum", type: "Crypto", price: 3668.2, changePct: 1.05, signal: "Wait", risk: 69, confidence: 61, dataStatus: "Demo Mode" },
  { symbol: "SOL-USD", name: "Solana", type: "Crypto", price: 154.32, changePct: -0.74, signal: "Wait", risk: 81, confidence: 55, dataStatus: "Demo Mode" },
  { symbol: "^GSPC", name: "S&P 500 Index", type: "Index", price: 6121.8, changePct: 0.31, signal: "Watch", risk: 33, confidence: 69, dataStatus: "Demo Mode" }
];

const providerStatus = [
  { service: "Stock market API", status: "Not configured", lastSuccess: null },
  { service: "Cryptocurrency API", status: "Not configured", lastSuccess: null },
  { service: "News API", status: "Not configured", lastSuccess: null },
  { service: "AI research service", status: "Not configured", lastSuccess: null },
  { service: "Database", status: "Demo local storage", lastSuccess: "browser-session" }
];

module.exports = { assets, providerStatus };
