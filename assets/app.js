(function () {
  const data = window.STOCKS_V2_DATA;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const app = $("#app");
  const nav = $("#side-nav");
  const ticker = $("#ticker-tape");
  const search = $("#search-input");
  const suggestions = $("#suggestions");
  const routes = [
    ["landing", "Launch"], ["dashboard", "Dashboard"], ["markets", "Markets"], ["stocks", "Stocks"],
    ["crypto", "Crypto"], ["etfs", "ETFs"], ["indexes", "Indexes"], ["options", "Options"],
    ["ideas", "Research Ideas"], ["news", "News"], ["predictions", "Predictions"], ["compare", "Compare"],
    ["screeners", "Screeners"], ["watchlists", "Watchlists"], ["alerts", "Alerts"], ["learn", "Learn"],
    ["status", "System Status"], ["account", "Account"], ["settings", "Settings"], ["admin", "Admin Dashboard"],
    ["jobs", "Backend Jobs"], ["data-quality", "Data Quality"]
  ];
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const state = {
    route: "landing",
    symbol: "AAPL",
    filter: "All",
    sort: "confidence",
    query: "",
    compare: ["AAPL", "BTC-USD"],
    watchlist: load("watchlist", ["AAPL", "BTC-USD", "SPY"]),
    alerts: load("alerts", []),
    settings: load("settings", { theme: "dark", compact: false, beginner: true }),
    remoteWatchlists: null,
    statusMessage: "",
    searchLoading: false,
    lastRefresh: null
  };
  const loadedAssets = new Set();

  function load(key, fallback) {
    try {
      const value = localStorage.getItem(`stocks-v2:${key}`);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    localStorage.setItem(`stocks-v2:${key}`, JSON.stringify(value));
  }

  function asset(symbol) {
    const found = data.assets.find((item) => item.symbol.toLowerCase() === String(symbol).toLowerCase());
    if (found) return found;
    const normalized = String(symbol || "UNKNOWN").toUpperCase();
    return {
      ...data.assets[0],
      symbol: normalized,
      name: normalized,
      type: normalized.includes("-USD") ? "Crypto" : "Stock",
      sector: "Provider lookup",
      price: 0,
      changePct: 0,
      signal: "Wait",
      direction: "Neutral",
      confidence: 0,
      risk: 70,
      dataQuality: 0,
      support: 0,
      resistance: 0,
      dataStatus: "Temporarily unavailable",
      dataSource: "Provider lookup required",
      warning: "This symbol is not in the local universe yet. Use Refresh after provider configuration or add it from the admin asset controls.",
      history: [0, 0, 0, 0, 0]
    };
  }

  function price(value) {
    return value >= 1000 ? money.format(value) : `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }

  function pct(value) {
    return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
  }

  function cls(value) {
    if (typeof value === "number") return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
    if (["Watch", "Bullish", "Positive", "Ready"].includes(value)) return "positive";
    if (["Avoid", "Bearish", "Negative", "High Risk"].includes(value)) return "negative";
    if (["Wait", "Neutral", "Demo Mode", "Demo", "Not configured", "Paused", "Cached", "Delayed", "Market closed", "Temporarily unavailable"].includes(value)) return "warning";
    return "";
  }

  function esc(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  function go(route, symbol) {
    location.hash = symbol ? `${route}/${encodeURIComponent(symbol)}` : route;
  }

  function dataStatus(item = {}) {
    return item.dataStatus || data.dataMode || "Demo Mode";
  }

  function dataSource(item = {}) {
    return item.dataSource || item.provider || (data.dataMode === "Demo Mode" ? "Demo dataset" : "Server provider");
  }

  function dataBadge(item = {}) {
    const status = dataStatus(item);
    const connected = ["Live", "Delayed", "Cached", "Market closed"].includes(status);
    return `<span class="badge ${connected ? "positive" : "warning"}">${esc(status)}</span>`;
  }

  function freshness(item = {}) {
    const updated = item.lastUpdated || item.asOf || data.generatedAt || "Unknown";
    const zone = item.timezone || data.marketStatus?.timezone || "America/New_York";
    const error = item.error ? `<span class="tiny negative">Refresh issue: ${esc(item.error)}</span>` : "";
    return `<div class="freshness"><span>Source: ${esc(dataSource(item))}</span><span>Updated: ${esc(updated)}</span><span>Zone: ${esc(zone)}</span>${error}</div>`;
  }

  function parseRoute() {
    const [route, symbol] = location.hash.replace("#", "").split("/");
    state.route = routes.some(([id]) => id === route) || route === "asset" ? route : "landing";
    if (symbol) state.symbol = decodeURIComponent(symbol);
  }

  function panel(title, subtitle, body, span = "span-12") {
    return `<section class="panel ${span}">
      <div class="panel-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div>${dataBadge({ dataStatus: data.dataMode === "Connected Data" ? "Delayed" : "Demo" })}</div>
      ${body}
    </section>`;
  }

  function metric(label, value, tone = "") {
    return `<div class="metric"><span>${label}</span><strong class="${tone}">${value}</strong></div>`;
  }

  function score(label, value) {
    return `<div class="score-row"><div class="row-between"><strong>${label}</strong><span>${value}/100</span></div><div class="score-line"><span style="width:${value}%"></span></div></div>`;
  }

  function card(item) {
    return `<article class="asset-card" data-symbol="${item.symbol}" tabindex="0">
      <div class="asset-top"><div><div class="symbol">${item.symbol}</div><span class="muted">${item.name}</span></div><span class="badge ${cls(item.signal)}">${item.signal}</span></div>
      <div class="asset-bottom"><strong>${price(item.price)}</strong><span class="${cls(item.changePct)}">${pct(item.changePct)}</span></div>
      <div class="tiny">${item.type} - ${item.sector || "Unclassified"} - ${dataStatus(item)}</div>
    </article>`;
  }

  function cards(items) {
    return `<div class="asset-grid">${items.map(card).join("")}</div>`;
  }

  function mood() {
    const rising = data.assets.filter((item) => item.changePct > 0).length;
    const avgMomentum = data.assets.reduce((sum, item) => sum + item.momentum, 0) / data.assets.length;
    const avgRisk = data.assets.reduce((sum, item) => sum + item.risk, 0) / data.assets.length;
    const scoreValue = Math.round(avgMomentum * 0.45 + (100 - avgRisk) * 0.25 + (rising / data.assets.length) * 30);
    const label = scoreValue > 68 ? "Optimistic" : scoreValue > 55 ? "Cautious" : "Neutral";
    return { score: scoreValue, label, rising };
  }

  function landingPage() {
    const best = [...data.assets].sort((a, b) => b.confidence - a.confidence)[0];
    return `<section class="page">
      <div class="hero">
        <div class="hero-copy">
          <span class="eyebrow">Market research command center</span>
          <h1>Scan the market. Track the hype. Understand the risk.</h1>
          <p class="lead">Stocks V2 combines market prices, technical indicators, historical performance, news sentiment, market conditions, predictions, alerts, education, and AI-assisted research in one organized workspace.</p>
          <div class="button-row"><button class="primary-button" data-go="dashboard">Explore the Market</button><button class="ghost-button" data-focus-search>Search an Asset</button><button class="ghost-button" data-go="news">View Today's Market Brief</button><button class="ghost-button" data-go="account">Create a Free Account</button></div>
        </div>
        <div class="hero-visual">
          <div class="row-between"><div><span class="eyebrow">Signal of the day</span><h2>${best.symbol} ${best.signal}</h2></div><span class="badge ${cls(best.direction)}">${best.direction}</span></div>
          <canvas id="hero-chart" width="900" height="360"></canvas>
          <div class="terminal-strip"><div><span>Confidence</span><strong>${best.confidence}</strong></div><div><span>Risk</span><strong>${best.risk}</strong></div><div><span>Data</span><strong>${dataStatus(best)}</strong></div></div>
          ${freshness(best)}
        </div>
      </div>
      ${dashboardPage(true)}
    </section>`;
  }

  function dashboardPage(embedded = false) {
    const m = mood();
    const best = [...data.assets].sort((a, b) => b.confidence + b.momentum - a.confidence - a.momentum)[0];
    const unusual = [...data.assets].sort((a, b) => b.relativeVolume - a.relativeVolume).slice(0, 4);
    return `<section class="${embedded ? "" : "page"}">
      ${embedded ? "" : "<h1>Market Command Center</h1>"}
      <div class="grid">
        ${panel("Overall Market Mood", "Calculated from available breadth, momentum, risk, and participation.", `<canvas id="mood-gauge" class="gauge-canvas" width="420" height="230"></canvas><div class="row-between">${metric("Score", `${m.score}/100`)}${metric("Mood", m.label)}</div><p class="tiny">Market status: ${esc(data.marketStatus?.status || data.dataMode)}.</p>`, "span-4")}
        ${panel("Major Index and Crypto Movement", "Provider snapshots with source and freshness labels on every row.", cards(data.assets.filter((item) => ["Index", "Crypto", "ETF"].includes(item.type)).slice(0, 6)), "span-8")}
        ${panel("Strongest Current Research Signal", "A transparent Watch/Wait/Avoid label, not a buy or sell instruction.", setupCard(best), "span-6")}
        ${panel("Trending and Unusual Assets", "Sorted by transparent relative-volume, price movement, news, and watchlist signals.", cards((data.trendingAssets?.length ? data.trendingAssets : unusual).slice(0, 4)), "span-6")}
        ${panel("Heat Map Wall", "Color shows demo daily performance and text labels repeat the signal.", heatMap(data.assets), "span-12")}
        ${panel("Important Market News", "Demo news desk with source and impact labels.", newsList(), "span-6")}
        ${panel("Market Brief", "Structured summary grounded in the currently available provider or demo data.", `<div class="definition-list"><div class="definition-row"><strong>Overall Market Read</strong><span class="muted">${m.label} with ${m.rising} of ${data.assets.length} visible assets rising.</span></div><div class="definition-row"><strong>Risk Warnings</strong><span class="muted">Crypto volatility and high-relative-volume assets require extra confirmation.</span></div><div class="definition-row"><strong>Data Quality</strong><span class="muted">${data.dataMode}. Use the source labels before relying on any value.</span></div></div>`, "span-6")}
      </div>
    </section>`;
  }

  function setupCard(item) {
    return `<div class="grid"><div class="span-6">${card(item)}<div class="button-row" style="margin-top:.8rem"><button class="primary-button" data-watch="${item.symbol}">Add to Watchlist</button><button class="ghost-button" data-open="${item.symbol}">Open Full Analysis</button></div></div><div class="span-6 score-list">${score("Confidence", item.confidence)}${score("Risk", item.risk)}${score("Data quality", item.dataQuality)}</div></div>`;
  }

  function heatMap(items) {
    return `<div class="toolbar" style="margin-bottom:.8rem"><select id="heat-filter" aria-label="Heat map asset type"><option>All</option><option>Stock</option><option>Crypto</option><option>ETF</option><option>Index</option></select></div><div class="heat-map">${items.map((item) => {
      const color = item.changePct >= 0 ? "rgba(61,220,151,.22)" : "rgba(255,107,122,.22)";
      return `<button class="heat-block" data-type="${item.type}" data-open="${item.symbol}" style="background:${color}"><strong>${item.symbol}</strong><span>${pct(item.changePct)}</span><span class="tiny">${item.signal} - Risk ${item.risk}</span></button>`;
    }).join("")}</div>`;
  }

  function newsList() {
    return `<div class="job-list">${data.news.map((item) => `<article class="job-row"><div class="row-between"><strong>${esc(item.headline)}</strong><span class="badge ${cls(item.sentiment)}">${item.sentiment}</span></div><span class="tiny">${item.source} - ${item.category} - ${item.impact} impact</span><span class="tiny">Related: ${item.related.join(", ")}</span></article>`).join("")}</div>`;
  }

  function tablePage(type, title, subtitle) {
    const items = filtered(type);
    const sectors = [...new Set(data.assets.filter((item) => type === "All" || item.type === type).map((item) => item.sector))];
    return `<section class="page"><div class="row-between"><div><span class="eyebrow">${esc(data.dataMode)}</span><h1>${title}</h1><p class="lead">${subtitle}</p></div><button class="primary-button" data-go="screeners">Build Screener</button></div>
      <section class="panel"><div class="toolbar"><label>Search <input id="table-query" value="${esc(state.query)}" placeholder="Filter visible table"></label><label>Filter <select id="table-filter">${["All", "Watch", "Wait", "Avoid", ...sectors].map((x) => `<option ${state.filter === x ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Sort <select id="table-sort">${["confidence", "risk", "changePct", "momentum", "technical", "dataQuality", "symbol"].map((x) => `<option value="${x}" ${state.sort === x ? "selected" : ""}>${x}</option>`).join("")}</select></label><button class="ghost-button" id="export-csv">Export CSV</button></div></section>
      <section class="table-wrap"><table><thead><tr><th>Asset</th><th>Price</th><th>Change</th><th>Signal</th><th>Direction</th><th>Confidence</th><th>Risk</th><th>RSI</th><th>Volume</th><th>Rel Vol</th><th>Momentum</th><th>Data</th><th>Actions</th></tr></thead><tbody>${items.map(row).join("")}</tbody></table></section>
    </section>`;
  }

  function filtered(type) {
    return data.assets
      .filter((item) => type === "All" || item.type === type)
      .filter((item) => state.filter === "All" || item.signal === state.filter || item.sector === state.filter)
      .filter((item) => !state.query || `${item.symbol} ${item.name} ${item.sector}`.toLowerCase().includes(state.query.toLowerCase()))
      .sort((a, b) => typeof a[state.sort] === "number" ? b[state.sort] - a[state.sort] : String(a[state.sort]).localeCompare(String(b[state.sort])));
  }

  function row(item) {
    return `<tr><td><strong>${item.symbol}</strong><br><span class="tiny">${item.name}</span></td><td>${price(item.price)}</td><td class="${cls(item.changePct)}">${pct(item.changePct)}</td><td><span class="badge ${cls(item.signal)}">${item.signal}</span></td><td>${item.direction}</td><td>${item.confidence}</td><td>${item.risk}</td><td>${item.rsi}</td><td>${item.volume}</td><td>${Number(item.relativeVolume || 1).toFixed(2)}</td><td>${item.momentum}</td><td>${dataBadge(item)}<br><span class="tiny">${esc(dataSource(item))}</span></td><td><button class="mini-button" data-open="${item.symbol}">Open</button> <button class="mini-button" data-watch="${item.symbol}">Watch</button></td></tr>`;
  }

  function assetPage() {
    const item = asset(state.symbol);
    const swing = item.price * (item.volatility / 1000);
    return `<section class="page"><div class="row-between"><div><span class="eyebrow">${item.type} - ${item.sector || "Unclassified"} - ${dataStatus(item)}</span><h1>${item.symbol} ${item.name}</h1><p class="lead">${item.warning}</p>${freshness(item)}</div><div class="button-row"><button class="primary-button" data-watch="${item.symbol}">Add to Watchlist</button><button class="ghost-button" data-compare="${item.symbol}">Compare</button><button class="ghost-button" data-alert="${item.symbol}">Set Alert</button></div></div>
      <div class="grid">
        ${panel("Price and Research Setup", "Values are real, delayed, cached, unavailable, or demo exactly as labeled.", `<div class="toolbar chart-tabs"><button class="mini-button active">1D</button><button class="mini-button">5D</button><button class="mini-button">1M</button><button class="mini-button">6M</button><button class="mini-button">1Y</button><button class="mini-button">5Y</button><button class="mini-button">Max</button></div><div class="grid"><div class="span-3">${metric("Current price", price(item.price))}</div><div class="span-3">${metric("Daily change", pct(item.changePct), cls(item.changePct))}</div><div class="span-3">${metric("Signal", item.signal)}</div><div class="span-3">${metric("Direction", item.direction)}</div></div><canvas id="asset-chart" class="chart-canvas" width="900" height="260" aria-label="${item.symbol} price chart"></canvas><p class="tiny">Accessible chart summary: recent displayed prices moved from ${price(item.history?.[0] || item.price)} to ${price(item.history?.at(-1) || item.price)}.</p>`, "span-8")}
        ${panel("Scores", "Transparent scoring inputs. Users cannot manually change weights.", `<div class="score-list">${score("Technical", item.technical)}${score("Momentum", item.momentum)}${score("News sentiment", item.sentiment)}${score("Confidence", item.confidence)}${score("Risk", item.risk)}${score("Data quality", item.dataQuality)}</div>`, "span-4")}
        ${panel("Why Did This Change?", "Signal explanation uses current measured inputs and stored history when available.", `<div class="job-list"><div class="job-row"><strong>Signal context</strong><span class="tiny">Current ${item.signal}. Source ${esc(dataSource(item))}. Status ${esc(dataStatus(item))}.</span></div><div class="job-row"><strong>Risk review</strong><span class="tiny">Risk ${item.risk}/100. ${esc(item.warning)}</span></div>${state.settings.beginner ? `<div class="job-row"><strong>Beginner note</strong><span class="tiny">Volatility means how much price moves. Higher risk scores mean the estimate deserves more caution, not that losses are certain.</span></div>` : ""}</div>`, "span-6")}
        ${panel("Prediction Estimate", "Range estimate, not a guaranteed future price.", `<div class="grid"><div class="span-4">${metric("Estimated low", price(item.price - swing))}</div><div class="span-4">${metric("Estimated high", price(item.price + swing * (item.momentum / 58)))}</div><div class="span-4">${metric("Confidence", `${item.confidence}/100`)}</div></div><p class="muted">Bullish case requires confirmation above ${price(item.resistance)}. Bearish case worsens below ${price(item.support)}.</p><button class="ghost-button" data-generate-prediction="${item.symbol}">Generate saved estimate</button><div id="asset-prediction-result"></div>`, "span-6")}
        ${panel("News and Sentiment", "Headlines are deduplicated and summarized; full articles stay with their original publishers.", newsList(), "span-6")}
        ${panel("Support, Resistance, and Volatility", "Support and resistance are research zones, not guaranteed floors or ceilings.", `<div class="grid"><div class="span-4">${metric("Support", price(item.support || item.price))}</div><div class="span-4">${metric("Resistance", price(item.resistance || item.price))}</div><div class="span-4">${metric("Volatility", `${item.volatility}/100`)}</div></div>`, "span-6")}
      </div></section>`;
  }

  function comparePage() {
    return `<section class="page"><h1>Prediction Battle Cards</h1><p class="lead">Compare assets by performance, momentum, confidence, risk, RSI, sentiment, support, resistance, and data quality.</p><section class="panel"><div class="toolbar">${[0, 1, 2].map((i) => `<label>Asset ${i + 1}<select data-compare-select="${i}"><option value="">None</option>${data.assets.map((item) => `<option value="${item.symbol}" ${state.compare[i] === item.symbol ? "selected" : ""}>${item.symbol} - ${item.name}</option>`).join("")}</select></label>`).join("")}</div></section><div class="comparison-grid">${state.compare.map((x) => `<section class="panel">${setupCard(asset(x))}</section>`).join("")}</div></section>`;
  }

  function watchlistsPage() {
    const signedIn = window.STOCKS_V2_AUTH?.isSignedIn();
    const remote = state.remoteWatchlists?.watchlists || [];
    return `<section class="page"><h1>Watchlists</h1><p class="lead">${signedIn ? "Signed-in watchlists sync through Supabase with RLS." : "Guests can browse public data and store a local watchlist in this browser. Sign in to sync across devices."}</p><section class="panel"><form class="toolbar" id="watch-form"><label>Add asset <select id="watch-symbol">${data.assets.map((item) => `<option>${item.symbol}</option>`).join("")}</select></label>${signedIn && remote.length ? `<label>Watchlist <select id="watchlist-id">${remote.map((list) => `<option value="${list.id}">${esc(list.name)}</option>`).join("")}</select></label>` : ""}<label>Notes <input id="watch-notes" placeholder="Optional private note"></label><button class="primary-button">Add</button><button class="danger-button" id="clear-watchlist" type="button">Clear local</button><button class="ghost-button" id="load-watchlists" type="button">Sync</button></form></section>${remote.length ? panel("Synced Watchlists", "Private rows are protected by Supabase RLS.", `<div class="job-list">${remote.map((list) => `<article class="job-row"><strong>${esc(list.name)}</strong><span class="tiny">${(list.watchlist_items || []).length} saved assets</span></article>`).join("")}</div>`) : ""}${state.watchlist.length ? cards(state.watchlist.map(asset)) : panel("Empty Watchlist", "Add a supported asset to start tracking it.", "")}</section>`;
  }

  function alertsPage() {
    return `<section class="page"><h1>Alerts</h1><p class="lead">Create demo in-app alerts for price, percentage move, signal change, risk increase, unusual volume, RSI, and provider outages.</p><section class="panel"><form class="toolbar" id="alert-form"><label>Asset <select id="alert-symbol">${data.assets.map((item) => `<option>${item.symbol}</option>`).join("")}</select></label><label>Trigger <select id="alert-type"><option>Price reaches</option><option>Signal changes</option><option>Risk score increases</option><option>Unusual volume</option></select></label><label>Value <input id="alert-value" placeholder="Example: 200"></label><button class="primary-button">Create Alert</button></form></section><section class="panel"><div class="job-list">${state.alerts.length ? state.alerts.map((alert, i) => `<div class="job-row"><div class="row-between"><strong>${alert.symbol} - ${alert.type}</strong><button class="mini-button" data-remove-alert="${i}">Remove</button></div><span class="tiny">Value: ${esc(alert.value || "Any change")} - Created locally.</span></div>`).join("") : `<div class="definition-row"><strong>No alerts yet</strong><span class="muted">Create one above to test the workflow.</span></div>`}</div></section></section>`;
  }

  function learnPage() {
    return `<section class="page"><h1>Learn</h1><p class="lead">Beginner-friendly explanations with examples, why each concept matters, and common misunderstandings.</p><section class="panel"><input id="lesson-query" placeholder="Search definitions..." style="width:100%; margin-bottom:.8rem"><div class="definition-list">${data.lessons.map(([term, body]) => `<article class="definition-row" data-term="${term.toLowerCase()} ${body.toLowerCase()}"><strong>${term}</strong><span class="muted">${body}</span><span class="tiny">Why it matters: it helps separate useful research from hype.</span></article>`).join("")}</div></section></section>`;
  }

  function statusPage(admin = false) {
    const services = `<div class="table-wrap"><table><thead><tr><th>Service</th><th>Status</th><th>Last success</th><th>Latency</th></tr></thead><tbody>${data.providerStatus.map((x) => `<tr><td>${x.service}</td><td><span class="badge ${cls(x.status)}">${x.status}</span></td><td>${x.lastSuccess}</td><td>${x.latency}</td></tr>`).join("")}</tbody></table></div>`;
    const jobs = ["stock-quotes", "crypto-quotes", "news-impact", "indicator-calculation", "prediction-evaluation"].map((name, i) => `<div class="job-row"><div class="row-between"><strong>${name}</strong><span class="badge ${i > 2 ? "positive" : "warning"}">${i > 2 ? "Ready" : "Paused"}</span></div><span class="tiny">Retry-aware job scaffold. Provider credentials required for collection.</span></div>`).join("");
    const adminControls = admin ? `<div class="toolbar"><button class="ghost-button" data-admin-action="refresh-quotes">Refresh quotes</button><button class="ghost-button" data-admin-action="backfill-history">Backfill history</button><button class="ghost-button" data-admin-action="recalculate-indicators">Recalculate indicators</button><button class="ghost-button" data-admin-action="generate-predictions">Run predictions</button><button class="ghost-button" data-admin-action="evaluate-predictions">Evaluate expired</button></div><div id="admin-action-result" class="tiny">${esc(state.statusMessage || "Admin actions require Supabase Auth admin role or CRON_SECRET.")}</div>` : "";
    return `<section class="page"><h1>${admin ? "Administrator Monitoring" : "System Status"}</h1><p class="lead">Public status hides secrets and private stack traces. Admin views include job logs, API usage, data quality, and audit trails.</p>${adminControls}<div class="grid">${panel("Provider Status", "Configured services, last successful update, and known delays.", services, "span-6")}${panel("Backend Jobs", "Retry-aware collectors and historical imports.", `<div class="job-list">${jobs}</div>`, "span-6")}${panel("Database Growth", "Schema supports quotes, snapshots, predictions, alerts, and audit logs.", `<div class="grid"><div class="span-4">${metric("Tracked assets", data.assets.length)}</div><div class="span-4">${metric("Quote records", data.dataMode === "Connected Data" ? "Stored by Supabase" : "Demo")}</div><div class="span-4">${metric("Snapshots", data.dataMode === "Connected Data" ? "Scheduled" : "Demo")}</div></div>`, "span-6")}${panel("Audit Log", "Important admin actions write permanent records through protected routes.", `<div class="job-row"><strong>Protected actions endpoint</strong><span class="tiny">/api/admin/actions validates admin users and never returns secret values.</span></div>`, "span-6")}</div></section>`;
  }

  function simplePage(title, lead, body = "") {
    return `<section class="page"><h1>${title}</h1><p class="lead">${lead}</p>${body || panel(title, "Demo Mode placeholder with production-ready architecture notes.", `<div class="definition-row"><strong>Provider unavailable</strong><span class="muted">This section becomes live when the relevant provider and database services are configured.</span></div>`)}</section>`;
  }

  function page() {
    switch (state.route) {
      case "dashboard":
      case "markets": return dashboardPage();
      case "stocks": return tablePage("Stock", "Stock Dashboard", "Premarket movers, gainers, losers, unusual volume, sector performance, earnings, dividends, and sortable research signals.");
      case "crypto": return tablePage("Crypto", "Cryptocurrency Dashboard", "24/7 crypto movement, major assets, volatility, unusual activity proxies, risk warnings, and data-quality labels.");
      case "etfs": return tablePage("ETF", "ETF Dashboard", "ETF prices, historical performance, holdings placeholders, expense ratio readiness, sector exposure, dividends, and trend/risk signals.");
      case "indexes": return tablePage("Index", "Index Dashboard", "Major indexes, market breadth, contributors, trend, volatility, and historical snapshots.");
      case "ideas":
      case "screeners": return tablePage("All", state.route === "ideas" ? "Research Ideas" : "Custom Screeners", "Rank and filter assets by type, signal, risk, confidence, momentum, RSI, volume, and data quality.");
      case "news": return simplePage("News Impact Desk", "Financial, economic, cryptocurrency, and market-moving political news with sentiment, impact, and duplicate-story readiness.", panel("Trending Headlines", "Demo articles with source and impact labels.", newsList()));
      case "predictions": return simplePage("Predictions", "Research estimates return ranges, scenarios, confidence, risk, warning factors, and data-status labels. Failed predictions remain visible in stored outcomes.", panel("Prediction Workspace", "No guaranteed future price is shown.", `<form class="toolbar" id="prediction-form"><label>Asset <select id="prediction-symbol">${data.assets.map((x) => `<option>${x.symbol}</option>`).join("")}</select></label><label>Horizon <select id="prediction-horizon"><option value="7">7 days</option><option value="14" selected>14 days</option><option value="30">30 days</option></select></label><button class="primary-button">Generate Estimate</button></form><div id="prediction-result" class="job-list"></div>`));
      case "compare": return comparePage();
      case "watchlists": return watchlistsPage();
      case "alerts": return alertsPage();
      case "learn": return learnPage();
      case "status": return statusPage();
      case "admin":
      case "jobs":
      case "data-quality": return statusPage(true);
      case "account": return simplePage("Account", "Email/password registration, email verification, login, logout, password reset, sessions, and profile preferences use Supabase Auth when configured.", panel("Account Access", window.STOCKS_V2_AUTH?.isSignedIn() ? "Signed in. Session is stored locally and sent only to first-party server routes." : "Sign up or sign in with Supabase Auth.", `<form class="grid" id="auth-form"><label class="span-6">Email <input id="auth-email" type="email" autocomplete="email" placeholder="you@example.com" required></label><label class="span-6">Password <input id="auth-password" type="password" autocomplete="current-password" placeholder="Minimum 8 characters"></label><label class="span-4">Display name <input id="auth-display" placeholder="Optional"></label><div class="span-8 button-row"><button class="primary-button" data-auth-action="signup">Create Free Account</button><button class="ghost-button" data-auth-action="signin">Sign In</button><button class="ghost-button" data-auth-action="reset">Reset Password</button><button class="danger-button" data-auth-action="signout" type="button">Sign Out</button></div></form><div id="auth-status" class="tiny">${esc(state.statusMessage)}</div>`));
      case "settings": return simplePage("Settings", "Theme, beginner mode, compact mode, chart defaults, quiet hours, and notification preferences.", panel("Preferences", "Saved locally for guests and synced to Supabase profile for signed-in users.", `<div class="definition-list"><label class="definition-row"><strong>Theme</strong><select id="settings-theme"><option value="dark" ${state.settings.theme === "dark" ? "selected" : ""}>Dark</option><option value="light" ${state.settings.theme === "light" ? "selected" : ""}>Light</option><option value="system" ${state.settings.theme === "system" ? "selected" : ""}>System</option></select></label><label class="definition-row"><strong>Beginner mode</strong><input id="settings-beginner" type="checkbox" ${state.settings.beginner ? "checked" : ""}><span class="muted">Show plain-language explanations and glossary hints.</span></label><label class="definition-row"><strong>Compact mode</strong><input id="settings-compact" type="checkbox" ${state.settings.compact ? "checked" : ""}><span class="muted">Reduce card padding and table spacing.</span></label><button class="primary-button" id="save-settings">Save Preferences</button><div id="settings-status" class="tiny">${esc(state.statusMessage)}</div></div>`));
      case "options": return simplePage("Options", "Options chains appear only when a supported provider is configured. Unsupported fields are clearly labeled unavailable.");
      case "asset": return assetPage();
      default: return landingPage();
    }
  }

  function drawLine(canvas, values) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const min = Math.min(...values);
    const max = Math.max(...values);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(85,166,255,.06)";
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    values.forEach((value, i) => {
      const x = 30 + (i / (values.length - 1)) * (w - 60);
      const y = h - 30 - ((value - min) / ((max - min) || 1)) * (h - 60);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = "#55a6ff";
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  function drawGauge(canvas, value) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 22;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(210, 190, 135, Math.PI, 0);
    ctx.strokeStyle = "rgba(135,148,167,.25)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(210, 190, 135, Math.PI, Math.PI + (value / 100) * Math.PI);
    ctx.strokeStyle = value > 65 ? "#3ddc97" : "#f8bd4a";
    ctx.stroke();
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text");
    ctx.textAlign = "center";
    ctx.font = "800 46px sans-serif";
    ctx.fillText(value, 210, 170);
    ctx.font = "600 18px sans-serif";
    ctx.fillText("Market Mood", 210, 205);
  }

  function bind() {
    $$('[data-go]').forEach((el) => el.onclick = () => go(el.dataset.go));
    $$('[data-open]').forEach((el) => el.onclick = () => go("asset", el.dataset.open));
    $$('[data-focus-search]').forEach((el) => el.onclick = () => search.focus());
    $$(".asset-card").forEach((el) => {
      el.onclick = () => go("asset", el.dataset.symbol);
      el.onkeydown = (event) => event.key === "Enter" && go("asset", el.dataset.symbol);
    });
    $$('[data-watch]').forEach((el) => el.onclick = () => {
      if (!state.watchlist.includes(el.dataset.watch)) state.watchlist.push(el.dataset.watch);
      save("watchlist", state.watchlist);
      const firstList = state.remoteWatchlists?.watchlists?.[0];
      if (window.STOCKS_V2_AUTH?.isSignedIn() && firstList) {
        window.STOCKS_V2_AUTH.addWatchlistAsset(el.dataset.watch, firstList.id).catch((error) => {
          state.statusMessage = error.message;
        });
      }
      render();
    });
    $$('[data-alert]').forEach((el) => el.onclick = () => {
      state.alerts.push({ symbol: el.dataset.alert, type: "Signal changes", value: "" });
      save("alerts", state.alerts);
      go("alerts");
    });
    $$('[data-compare]').forEach((el) => el.onclick = () => {
      if (!state.compare.includes(el.dataset.compare)) state.compare.push(el.dataset.compare);
      state.compare = state.compare.slice(0, 3);
      go("compare");
    });
    const tableQuery = $("#table-query");
    const tableFilter = $("#table-filter");
    const tableSort = $("#table-sort");
    if (tableQuery) tableQuery.oninput = () => { state.query = tableQuery.value; render(); };
    if (tableFilter) tableFilter.onchange = () => { state.filter = tableFilter.value; render(); };
    if (tableSort) tableSort.onchange = () => { state.sort = tableSort.value; render(); };
    const heatFilter = $("#heat-filter");
    if (heatFilter) heatFilter.onchange = () => $$(".heat-block").forEach((block) => { block.hidden = heatFilter.value !== "All" && block.dataset.type !== heatFilter.value; });
    const watchForm = $("#watch-form");
    if (watchForm) watchForm.onsubmit = async (event) => {
      event.preventDefault();
      const symbol = $("#watch-symbol").value;
      if (!state.watchlist.includes(symbol)) state.watchlist.push(symbol);
      save("watchlist", state.watchlist);
      const watchlistId = $("#watchlist-id")?.value;
      if (watchlistId && window.STOCKS_V2_AUTH?.isSignedIn()) {
        try {
          await window.STOCKS_V2_AUTH.addWatchlistAsset(symbol, watchlistId, $("#watch-notes")?.value || "");
          state.statusMessage = `${symbol} saved to synced watchlist.`;
        } catch (error) {
          state.statusMessage = error.message;
        }
      }
      render();
    };
    const clearWatchlist = $("#clear-watchlist");
    if (clearWatchlist) clearWatchlist.onclick = () => { state.watchlist = []; save("watchlist", state.watchlist); render(); };
    const loadWatchlists = $("#load-watchlists");
    if (loadWatchlists) loadWatchlists.onclick = async () => {
      try {
        state.remoteWatchlists = await window.STOCKS_V2_AUTH.getWatchlists();
        state.statusMessage = "Watchlists synced.";
      } catch (error) {
        state.statusMessage = error.message;
      }
      render();
    };
    const alertForm = $("#alert-form");
    if (alertForm) alertForm.onsubmit = (event) => { event.preventDefault(); state.alerts.push({ symbol: $("#alert-symbol").value, type: $("#alert-type").value, value: $("#alert-value").value }); save("alerts", state.alerts); render(); };
    $$('[data-remove-alert]').forEach((el) => el.onclick = () => { state.alerts.splice(Number(el.dataset.removeAlert), 1); save("alerts", state.alerts); render(); });
    $$('[data-compare-select]').forEach((el) => el.onchange = () => { state.compare[Number(el.dataset.compareSelect)] = el.value; state.compare = state.compare.filter(Boolean); render(); });
    const lessonQuery = $("#lesson-query");
    if (lessonQuery) lessonQuery.oninput = () => $$('[data-term]').forEach((row) => { row.hidden = !row.dataset.term.includes(lessonQuery.value.toLowerCase()); });
    const csv = $("#export-csv");
    if (csv) csv.onclick = () => {
      const rows = filtered("All").map((item) => [item.symbol, item.name, item.type, item.price, item.changePct, item.signal, item.confidence, item.risk, "Demo Mode"]);
      const text = [["Symbol", "Name", "Type", "Price", "ChangePct", "Signal", "Confidence", "Risk", "DataStatus"], ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      Object.assign(document.createElement("a"), { href: url, download: "stocks-v2-demo-export.csv" }).click();
      URL.revokeObjectURL(url);
    };
    const predictionForm = $("#prediction-form");
    if (predictionForm) predictionForm.onsubmit = async (event) => {
      event.preventDefault();
      const target = $("#prediction-result");
      target.innerHTML = `<div class="job-row"><strong>Generating estimate...</strong><span class="tiny">Using server-side ruleset and provider data.</span></div>`;
      try {
        const response = await fetch("/api/predictions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ symbol: $("#prediction-symbol").value, horizonDays: $("#prediction-horizon").value })
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Prediction generation failed");
        target.innerHTML = body.predictions.map((prediction) => `<article class="job-row"><div class="row-between"><strong>${prediction.asset_symbol} ${prediction.direction}</strong><span class="badge ${cls(prediction.direction === "bullish" ? "Bullish" : prediction.direction === "bearish" ? "Bearish" : "Neutral")}">${prediction.confidence}%</span></div><span class="tiny">Range ${price(prediction.predicted_low)} to ${price(prediction.predicted_high)} over ${prediction.prediction_horizon_days} days.</span><span class="muted">${esc(prediction.explanation)}</span></article>`).join("");
      } catch (error) {
        target.innerHTML = `<div class="job-row"><strong>Prediction unavailable</strong><span class="tiny negative">${esc(error.message)}</span></div>`;
      }
    };
    $$("[data-generate-prediction]").forEach((button) => button.onclick = async () => {
      const target = $("#asset-prediction-result");
      if (target) target.textContent = "Generating saved estimate...";
      try {
        const response = await fetch("/api/predictions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ symbol: button.dataset.generatePrediction, horizonDays: 14 })
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Prediction generation failed");
        const prediction = body.predictions[0];
        if (target) target.innerHTML = `<div class="job-row"><strong>${prediction.direction} estimate</strong><span class="tiny">Expected range ${price(prediction.predicted_low)} to ${price(prediction.predicted_high)}. ${esc(prediction.explanation)}</span></div>`;
      } catch (error) {
        if (target) target.innerHTML = `<span class="tiny negative">${esc(error.message)}</span>`;
      }
    });
    const authForm = $("#auth-form");
    if (authForm) {
      authForm.onsubmit = (event) => event.preventDefault();
      $$("[data-auth-action]").forEach((button) => button.onclick = async (event) => {
        event.preventDefault();
        const action = button.dataset.authAction;
        const status = $("#auth-status");
        status.textContent = "Working...";
        try {
          const email = $("#auth-email").value;
          const password = $("#auth-password").value;
          if (action === "signup") await window.STOCKS_V2_AUTH.signUp({ email, password, displayName: $("#auth-display").value });
          if (action === "signin") await window.STOCKS_V2_AUTH.signIn({ email, password });
          if (action === "reset") await window.STOCKS_V2_AUTH.resetPassword(email);
          if (action === "signout") await window.STOCKS_V2_AUTH.signOut();
          state.statusMessage = action === "reset" ? "Password reset email requested." : "Account action completed.";
        } catch (error) {
          state.statusMessage = error.message;
        }
        render();
      });
    }
    const saveSettings = $("#save-settings");
    if (saveSettings) saveSettings.onclick = async () => {
      state.settings.theme = $("#settings-theme").value;
      state.settings.beginner = $("#settings-beginner").checked;
      state.settings.compact = $("#settings-compact").checked;
      save("settings", state.settings);
      try {
        await window.STOCKS_V2_AUTH?.savePreferences(state.settings);
        state.statusMessage = window.STOCKS_V2_AUTH?.isSignedIn() ? "Preferences synced." : "Preferences saved locally.";
      } catch (error) {
        state.statusMessage = `Saved locally. Sync issue: ${error.message}`;
      }
      render();
    };
    $$("[data-admin-action]").forEach((button) => button.onclick = async () => {
      const output = $("#admin-action-result");
      output.textContent = "Running protected admin action...";
      try {
        const body = await window.STOCKS_V2_AUTH.apiFetch("/api/admin/actions", {
          method: "POST",
          body: { action: button.dataset.adminAction, options: {} }
        });
        output.textContent = `${body.action} completed.`;
      } catch (error) {
        output.textContent = error.message;
      }
    });
    $$(".chart-tabs button").forEach((button) => button.onclick = () => {
      $$(".chart-tabs button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const selected = asset(state.symbol);
      const ranges = { "1D": 8, "5D": 16, "1M": 30, "6M": 60, "1Y": 120, "5Y": 260, "Max": selected.history.length };
      const amount = ranges[button.textContent.trim()] || selected.history.length;
      drawLine($("#asset-chart"), selected.history.slice(-amount));
    });
  }

  function renderNav() {
    nav.innerHTML = routes.map(([id, label]) => `<button class="nav-link ${state.route === id ? "active" : ""}" data-route="${id}"><span>${label}</span><span class="count">${["admin", "jobs", "data-quality"].includes(id) ? "Admin" : ""}</span></button>`).join("");
    $$(".nav-link", nav).forEach((button) => button.onclick = () => { document.body.classList.remove("nav-open"); go(button.dataset.route); });
  }

  function renderTicker() {
    ticker.innerHTML = data.assets.map((item) => `<button class="ticker-pill" data-open="${item.symbol}"><strong>${item.symbol}</strong><span>${price(item.price)}</span><span class="${cls(item.changePct)}">${pct(item.changePct)}</span></button>`).join("");
  }

  function render() {
    parseRoute();
    const systemLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    document.documentElement.classList.toggle("light", state.settings.theme === "light" || (state.settings.theme === "system" && systemLight));
    document.body.classList.toggle("compact", state.settings.compact);
    $("#beginner-toggle").checked = state.settings.beginner;
    $("#compact-toggle").checked = state.settings.compact;
    renderNav();
    renderTicker();
    app.innerHTML = page();
    bind();
    const selected = asset(state.symbol);
    drawLine($("#hero-chart"), selected.history.concat(data.assets[1].history));
    drawLine($("#asset-chart"), selected.history);
    drawGauge($("#mood-gauge"), mood().score);
    if (state.route === "asset") loadAssetDetail(state.symbol);
  }

  async function loadAssetDetail(symbol) {
    const key = String(symbol || "").toUpperCase();
    if (!key || loadedAssets.has(key)) return;
    loadedAssets.add(key);
    try {
      const response = await fetch(`/api/asset?symbol=${encodeURIComponent(key)}`);
      const body = await response.json();
      if (!response.ok || !body.quote) throw new Error(body.error?.message || body.error || "Asset detail unavailable");
      const existingIndex = data.assets.findIndex((item) => item.symbol === body.quote.symbol);
      const current = existingIndex >= 0 ? data.assets[existingIndex] : asset(body.quote.symbol);
      const bars = Array.isArray(body.bars) ? body.bars.map((bar) => Number(bar.close)).filter(Number.isFinite).slice(-80) : current.history;
      const merged = {
        ...current,
        ...body.quote,
        symbol: body.quote.symbol,
        name: body.profile?.name || current.name,
        type: body.profile?.assetType || current.type,
        sector: body.profile?.sector || current.sector,
        price: body.quote.price,
        changePct: body.quote.changePct,
        history: bars.length ? bars : current.history,
        warning: body.quote.error || current.warning
      };
      if (existingIndex >= 0) data.assets[existingIndex] = merged;
      else data.assets.push(merged);
      if (Array.isArray(body.news) && body.news.length) {
        data.news = body.news.map((item) => ({
          headline: item.title || item.headline,
          source: item.source || item.provider,
          category: merged.symbol,
          sentiment: item.sentiment || "Neutral",
          impact: item.relevanceScore > 0.8 ? "High" : "Moderate",
          related: [merged.symbol],
          published: item.publishedAt || item.published || "Unknown"
        }));
      }
      render();
    } catch (error) {
      const current = asset(key);
      current.error = error.message;
    }
  }

  let searchTimer;
  search.oninput = () => {
    const q = search.value.toLowerCase();
    clearTimeout(searchTimer);
    const matches = data.assets.filter((item) => `${item.symbol} ${item.name}`.toLowerCase().includes(q)).slice(0, 8);
    suggestions.classList.toggle("open", Boolean(q && matches.length));
    suggestions.innerHTML = q ? `<div class="suggestion"><span>${state.searchLoading ? "Searching providers..." : "Local matches"}</span><span>${matches.length}</span></div>${matches.map((item) => `<button class="suggestion" data-open="${item.symbol}"><span><strong>${item.symbol}</strong> ${item.name}</span><span>${item.type}</span></button>`).join("")}` : "";
    bind();
    if (q.length >= 2) {
      state.searchLoading = true;
      searchTimer = setTimeout(async () => {
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Search unavailable");
          body.results.forEach((item) => {
            if (!data.assets.some((assetItem) => assetItem.symbol === item.symbol)) {
              data.assets.push({
                ...asset(item.symbol),
                symbol: item.symbol,
                name: item.name,
                type: item.type || item.asset_type || "Stock",
                sector: item.exchange || "Provider result",
                dataStatus: item.dataStatus || body.dataStatus || body.mode,
                dataSource: item.provider || "Provider search"
              });
            }
          });
          suggestions.classList.toggle("open", Boolean(search.value && body.results.length));
          suggestions.innerHTML = body.results.length
            ? body.results.map((item) => `<button class="suggestion" data-open="${item.symbol}"><span><strong>${item.symbol}</strong> ${esc(item.name)}</span><span>${esc(item.type || item.asset_type || "")} - ${esc(item.dataStatus || body.dataStatus || body.mode)}</span></button>`).join("")
            : `<div class="suggestion"><span>No supported assets found for "${esc(q)}".</span><span>Try a symbol</span></div>`;
          bind();
        } catch (error) {
          suggestions.classList.add("open");
          suggestions.innerHTML = `<div class="suggestion"><span>Provider search unavailable.</span><span>${esc(error.message)}</span></div>`;
        } finally {
          state.searchLoading = false;
        }
      }, 250);
    }
  };
  $("#asset-search").onsubmit = (event) => {
    event.preventDefault();
    const q = search.value.trim().toLowerCase();
    const found = data.assets.find((item) => item.symbol.toLowerCase() === q) || data.assets.find((item) => item.name.toLowerCase().includes(q));
    if (found) {
      search.value = "";
      suggestions.classList.remove("open");
      go("asset", found.symbol);
    } else if (q) {
      search.value = "";
      suggestions.classList.remove("open");
      go("asset", q.toUpperCase());
    }
  };
  $("#menu-toggle").onclick = () => document.body.classList.toggle("nav-open");
  $("#theme-toggle").onclick = () => {
    const order = ["dark", "light", "system"];
    state.settings.theme = order[(order.indexOf(state.settings.theme) + 1) % order.length];
    save("settings", state.settings);
    window.STOCKS_V2_AUTH?.savePreferences(state.settings).catch(() => null);
    render();
  };
  $("#refresh-button").onclick = async () => {
    const button = $("#refresh-button");
    button.disabled = true;
    button.textContent = "Refreshing...";
    try {
      await window.STOCKS_V2_REFRESH?.(true);
      state.lastRefresh = new Date().toLocaleTimeString();
      button.textContent = `Updated ${state.lastRefresh}`;
      setTimeout(() => { button.textContent = "Refresh"; button.disabled = false; }, 1200);
    } catch {
      button.textContent = "Refresh failed";
      setTimeout(() => { button.textContent = "Refresh"; button.disabled = false; }, 1600);
    }
  };
  $("#beginner-toggle").onchange = () => {
    state.settings.beginner = $("#beginner-toggle").checked;
    save("settings", state.settings);
    window.STOCKS_V2_AUTH?.savePreferences(state.settings).catch(() => null);
    render();
  };
  $("#compact-toggle").onchange = () => {
    state.settings.compact = $("#compact-toggle").checked;
    save("settings", state.settings);
    window.STOCKS_V2_AUTH?.savePreferences(state.settings).catch(() => null);
    render();
  };
  window.onhashchange = render;
  render();
})();
