(async function () {
  try {
    const response = await fetch("/api/markets");
    if (!response.ok) return;
    const market = await response.json();
    if (!Array.isArray(market.assets)) return;

    window.STOCKS_V2_DATA.assets = market.assets;
    window.STOCKS_V2_DATA.dataMode = market.mode || window.STOCKS_V2_DATA.dataMode;
    window.STOCKS_V2_DATA.providerStatus = (market.providerStatus || []).map((item) => ({
      service: item.service,
      status: item.status,
      lastSuccess: item.lastSuccess || "Data unavailable",
      latency: "Server-side"
    }));

    const badge = document.querySelector(".status-card .badge");
    const text = document.querySelector(".status-card p");
    if (badge) badge.textContent = window.STOCKS_V2_DATA.dataMode;
    if (text) {
      text.textContent = window.STOCKS_V2_DATA.dataMode === "Connected Data"
        ? "Server-side providers are connected. Some assets may still show unavailable labels if a provider is rate-limited or unsupported."
        : "Sample data only. Connect market providers in Vercel environment variables for live or delayed data.";
    }

    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } catch (error) {
    console.warn("Connected market data unavailable; keeping demo data.", error);
  }
})();
