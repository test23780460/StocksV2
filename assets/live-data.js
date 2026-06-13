(async function () {
  let patchQueued = false;

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
        tiny.textContent = `${asset.type} - ${asset.sector || "Unclassified"} - ${asset.dataStatus || window.STOCKS_V2_DATA.dataMode}`;
      }
    });

    document.querySelectorAll("tbody tr").forEach((row) => {
      const symbol = row.querySelector("td strong")?.textContent;
      const asset = bySymbol.get(symbol);
      const cells = row.querySelectorAll("td");
      if (asset && cells[11]) {
        cells[11].innerHTML = `<span class="badge ${asset.dataStatus === "Connected data" ? "positive" : "warning"}">${asset.dataStatus || window.STOCKS_V2_DATA.dataMode}</span>`;
      }
    });
  }

  function queuePatch() {
    if (patchQueued) return;
    patchQueued = true;
    setTimeout(patchRenderedLabels, 0);
  }

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
    queuePatch();
    window.addEventListener("hashchange", queuePatch);
    new MutationObserver(queuePatch).observe(document.querySelector("#app"), { childList: true, subtree: true });
  } catch (error) {
    console.warn("Connected market data unavailable; keeping demo data.", error);
  }
})();
