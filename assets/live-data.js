(function () {
  let patchQueued = false;
  let lastError = null;

  function currentAssets() {
    return new Map((window.STOCKS_V2_DATA.assets || []).map((asset) => [asset.symbol, asset]));
  }

  function patchRenderedLabels() {
    patchQueued = false;
    const bySymbol = currentAssets();
    document.querySelectorAll(".asset-card[data-symbol]").forEach((card) => {
      const asset = bySymbol.get(card.dataset.symbol);
      const tiny = card.querySelector(".tiny");
      if (asset && tiny) {
        tiny.textContent = `${asset.type} - ${asset.sector || "Unclassified"} - ${asset.dataSource || asset.provider || "Demo dataset"} - ${asset.dataStatus || window.STOCKS_V2_DATA.dataMode}`;
      }
    });

    document.querySelectorAll("tbody tr").forEach((row) => {
      const symbol = row.querySelector("td strong")?.textContent;
      const asset = bySymbol.get(symbol);
      const cells = row.querySelectorAll("td");
      if (asset && cells[11]) {
        const connected = ["Live", "Delayed", "Cached", "Market closed"].includes(asset.dataStatus);
        cells[11].innerHTML = `<span class="badge ${connected ? "positive" : "warning"}">${asset.dataStatus || window.STOCKS_V2_DATA.dataMode}</span>`;
      }
    });
  }

  function queuePatch() {
    if (patchQueued) return;
    patchQueued = true;
    setTimeout(patchRenderedLabels, 0);
  }

  async function loadMarketData(force = false) {
    const url = force ? `/api/markets?refresh=${Date.now()}` : "/api/markets";
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Market refresh returned ${response.status}`);
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

    window.STOCKS_V2_DATA.generatedAt = market.generatedAt || new Date().toISOString();
    window.STOCKS_V2_DATA.marketStatus = market.marketStatus;
    window.STOCKS_V2_DATA.trendingAssets = market.trendingAssets || [];
    window.STOCKS_V2_DATA.news = Array.isArray(market.news) && market.news.length
      ? market.news.map((item) => ({
        headline: item.title || item.headline,
        source: item.source || item.provider || "News provider",
        category: "Market",
        sentiment: item.sentiment || "Neutral",
        impact: item.relevanceScore > 0.8 ? "High" : "Moderate",
        related: [],
        published: item.publishedAt || item.published || "Unknown"
      }))
      : window.STOCKS_V2_DATA.news;

    const badge = document.querySelector(".status-card .badge");
    const text = document.querySelector(".status-card p");
    if (badge) badge.textContent = window.STOCKS_V2_DATA.dataMode;
    if (text) {
      const freshness = market.dataFreshness;
      text.textContent = window.STOCKS_V2_DATA.dataMode === "Connected Data"
        ? `Server-side providers are connected. Source: ${freshness?.source || "provider"}; updated ${freshness?.lastUpdated || "unknown"}; status ${freshness?.status || "Delayed"}.`
        : "Sample data only. Connect market providers in Vercel environment variables for live or delayed data.";
    }

    window.dispatchEvent(new HashChangeEvent("hashchange"));
    queuePatch();
    return market;
  }

  async function refresh(force = false) {
    lastError = null;
    try {
      return await loadMarketData(force);
    } catch (error) {
      lastError = error;
      console.warn("Connected market data unavailable; keeping current data.", error);
      throw error;
    }
  }

  window.STOCKS_V2_REFRESH = refresh;
  window.STOCKS_V2_LAST_REFRESH_ERROR = () => lastError;

  refresh(false)
    .then(() => {
    window.addEventListener("hashchange", queuePatch);
    new MutationObserver(queuePatch).observe(document.querySelector("#app"), { childList: true, subtree: true });
    })
    .catch(() => null);
})();
