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
    settings: load("settings", { theme: "dark", compact: false, beginner: true })
  };

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
    return data.assets.find((item) => item.symbol.toLowerCase() === String(symbol).toLowerCase()) || data.assets[0];
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
    if (["Wait", "Neutral", "Demo Mode", "Not configured", "Paused"].includes(value)) return "warning";
    return "";
  }

  function esc(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  function go(route, symbol) {
    location.hash = symbol ? `${route}/${encodeURIComponent(symbol)}` : route;
  }

  function parseRoute() {
    const [route, symbol] = location.hash.replace("#", "").split("/");
    state.route = routes.some(([id]) => id === route) || route === "asset" ? route : "landing";
    if (symbol) state.symbol = decodeURIComponent(symbol);
  }

  function panel(title, subtitle, body, span = "span-12") {
    return `<section class="panel ${span}">
      <div class="panel-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div><span class="badge warning">Demo Mode</span></div>
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
      <div class="tiny">${item.type} - ${item.sector} - Demo Mode</div>
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
          <div class="terminal-strip"><div><span>Confidence</span><strong>${best.confidence}</strong></div><div><span>Risk</span><strong>${best.risk}</strong></div><div><span>Data</span><strong>Demo</strong></div></div>
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
        ${panel("Overall Market Mood", "Calculated from demo breadth, momentum, risk, and participation.", `<canvas id="mood-gauge" class="gauge-canvas" width="420" height="230"></canvas><div class="row-between">${metric("Score", `${m.score}/100`)}${metric("Mood", m.label)}</div>`, "span-4")}
        ${panel("Major Index and Crypto Movement", "Demo snapshots with status labels on every row.", cards(data.assets.filter((item) => ["Index", "Crypto", "ETF"].includes(item.type)).slice(0, 6)), "span-8")}
        ${panel("Strongest Current Research Signal", "A transparent Watch/Wait/Avoid label, not a buy or sell instruction.", setupCard(best), "span-6")}
        ${panel("Trending and Unusual Assets", "Sorted by relative volume proxy. Whale activity is not confirmed in Demo Mode.", cards(unusual), "span-6")}
        ${panel("Heat Map Wall", "Color shows demo daily performance and text labels repeat the signal.", heatMap(data.assets), "span-12")}
        ${panel("Important Market News", "Demo news desk with source and impact labels.", newsList(), "span-6")}
        ${panel("Daily AI Market Brief", "Structured summary grounded only in available demo data.", `<div class="definition-list"><div class="definition-row"><strong>Overall Market Read</strong><span class="muted">${m.label} with ${m.rising} of ${data.assets.length} demo assets rising.</span></div><div class="definition-row"><strong>Risk Warnings</strong><span class="muted">Crypto volatility and high-relative-volume assets require extra confirmation.</span></div><div class="definition-row"><strong>Data Quality</strong><span class="muted">Providers, AI generation, and database history are not configured yet.</span></div></div>`, "span-6")}
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
    return `<section class="page"><div class="row-between"><div><span class="eyebrow">Demo Mode</span><h1>${title}</h1><p class="lead">${subtitle}</p></div><button class="primary-button" data-go="screeners">Build Screener</button></div>
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
    return `<tr><td><strong>${item.symbol}</strong><br><span class="tiny">${item.name}</span></td><td>${price(item.price)}</td><td class="${cls(item.changePct)}">${pct(item.changePct)}</td><td><span class="badge ${cls(item.signal)}">${item.signal}</span></td><td>${item.direction}</td><td>${item.confidence}</td><td>${item.risk}</td><td>${item.rsi}</td><td>${item.volume}</td><td>${item.relativeVolume.toFixed(2)}</td><td>${item.momentum}</td><td><span class="badge warning">Demo</span></td><td><button class="mini-button" data-open="${item.symbol}">Open</button> <button class="mini-button" data-watch="${item.symbol}">Watch</button></td></tr>`;
  }

  function assetPage() {
    const item = asset(state.symbol);
    const swing = item.price * (item.volatility / 1000);
    return `<section class="page"><div class="row-between"><div><span class="eyebrow">${item.type} - ${item.sector} - Demo Mode</span><h1>${item.symbol} ${item.name}</h1><p class="lead">${item.warning}</p></div><div class="button-row"><button class="primary-button" data-watch="${item.symbol}">Add to Watchlist</button><button class="ghost-button" data-compare="${item.symbol}">Compare</button><button class="ghost-button" data-alert="${item.symbol}">Set Alert</button></div></div>
      <div class="grid">
        ${panel("Price and Research Setup", "Every value is sample data until a provider is configured.", `<div class="grid"><div class="span-3">${metric("Current price", price(item.price))}</div><div class="span-3">${metric("Daily change", pct(item.changePct), cls(item.changePct))}</div><div class="span-3">${metric("Signal", item.signal)}</div><div class="span-3">${metric("Direction", item.direction)}</div></div><canvas id="asset-chart" class="chart-canvas" width="900" height="260"></canvas>`, "span-8")}
        ${panel("Scores", "Transparent scoring inputs. Users cannot manually change weights.", `<div class="score-list">${score("Technical", item.technical)}${score("Momentum", item.momentum)}${score("News sentiment", item.sentiment)}${score("Confidence", item.confidence)}${score("Risk", item.risk)}${score("Data quality", item.dataQuality)}</div>`, "span-4")}
        ${panel("Why Did This Change?", "Historical explanation timeline placeholder connected to future signal snapshots.", `<div class="job-list"><div class="job-row"><strong>Signal unchanged</strong><span class="tiny">Previous ${item.signal} - current ${item.signal} - Demo timestamp</span></div><div class="job-row"><strong>Risk review</strong><span class="tiny">Risk ${item.risk}/100. ${esc(item.warning)}</span></div></div>`, "span-6")}
        ${panel("Prediction Estimate", "Range estimate, not a guaranteed future price.", `<div class="grid"><div class="span-4">${metric("Estimated low", price(item.price - swing))}</div><div class="span-4">${metric("Estimated high", price(item.price + swing * (item.momentum / 58)))}</div><div class="span-4">${metric("Confidence", `${item.confidence}/100`)}</div></div><p class="muted">Bullish case requires confirmation above ${price(item.resistance)}. Bearish case worsens below ${price(item.support)}.</p>`, "span-6")}
      </div></section>`;
  }

  function comparePage() {
    return `<section class="page"><h1>Prediction Battle Cards</h1><p class="lead">Compare assets by performance, momentum, confidence, risk, RSI, sentiment, support, resistance, and data quality.</p><section class="panel"><div class="toolbar">${[0, 1, 2].map((i) => `<label>Asset ${i + 1}<select data-compare-select="${i}"><option value="">None</option>${data.assets.map((item) => `<option value="${item.symbol}" ${state.compare[i] === item.symbol ? "selected" : ""}>${item.symbol} - ${item.name}</option>`).join("")}</select></label>`).join("")}</div></section><div class="comparison-grid">${state.compare.map((x) => `<section class="panel">${setupCard(asset(x))}</section>`).join("")}</div></section>`;
  }

  function watchlistsPage() {
    return `<section class="page"><h1>Watchlists</h1><p class="lead">Saved in this browser for now. Future Supabase auth can persist private watchlists, folders, notes, alerts, and shared read-only links.</p><section class="panel"><form class="toolbar" id="watch-form"><label>Add asset <select id="watch-symbol">${data.assets.map((item) => `<option>${item.symbol}</option>`).join("")}</select></label><button class="primary-button">Add</button><button class="danger-button" id="clear-watchlist" type="button">Clear</button></form></section>${state.watchlist.length ? cards(state.watchlist.map(asset)) : panel("Empty Watchlist", "Add a supported asset to start tracking it.", "")}</section>`;
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
    return `<section class="page"><h1>${admin ? "Administrator Monitoring" : "System Status"}</h1><p class="lead">Public status hides secrets and private stack traces. Admin views include job logs, API usage, data quality, and audit trails.</p><div class="grid">${panel("Provider Status", "Configured services, last successful update, and known delays.", services, "span-6")}${panel("Backend Jobs", "Retry-aware collectors and historical imports.", `<div class="job-list">${jobs}</div>`, "span-6")}${panel("Database Growth", "Schema supports quotes, snapshots, predictions, alerts, and audit logs.", `<div class="grid"><div class="span-4">${metric("Tracked assets", data.assets.length)}</div><div class="span-4">${metric("Quote records", "Demo")}</div><div class="span-4">${metric("Snapshots", "Demo")}</div></div>`, "span-6")}${panel("Audit Log", "Important admin actions should write permanent records.", `<div class="job-row"><strong>No protected admin actions yet</strong><span class="tiny">Audit logging table is included in database/schema.sql.</span></div>`, "span-6")}</div></section>`;
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
      case "predictions": return simplePage("Predictions", "Research estimates return ranges, scenarios, confidence, risk, warning factors, and data-status labels.", panel("Sample Estimate", "No guaranteed future price is shown.", `<form class="toolbar" id="prediction-form"><label>Asset <select id="prediction-symbol">${data.assets.map((x) => `<option>${x.symbol}</option>`).join("")}</select></label><button class="primary-button">Generate Estimate</button></form><div id="prediction-result"></div>`));
      case "compare": return comparePage();
      case "watchlists": return watchlistsPage();
      case "alerts": return alertsPage();
      case "learn": return learnPage();
      case "status": return statusPage();
      case "admin":
      case "jobs":
      case "data-quality": return statusPage(true);
      case "account": return simplePage("Account", "The UI is ready for email/password, Google sign-in, verification, password reset, secure sessions, and account deletion through Supabase Auth.", panel("Create Free Account", "Demo-only form.", `<form class="grid"><label class="span-6">Email <input type="email" placeholder="you@example.com"></label><label class="span-6">Password <input type="password" placeholder="Minimum 8 characters"></label><label class="span-4">Experience level <select><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label><div class="span-4 button-row"><button class="primary-button" type="button">Create Free Account</button><button class="ghost-button" type="button">Google Sign-in</button></div></form>`));
      case "settings": return simplePage("Settings", "Theme, experience mode, compact mode, quiet hours, and notification preferences.", panel("Preferences", "", `<div class="definition-list"><label class="definition-row"><strong>Theme</strong><select><option>Dark</option><option>Light</option></select></label><label class="definition-row"><strong>Experience Mode</strong><select><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label></div>`));
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
    if (watchForm) watchForm.onsubmit = (event) => { event.preventDefault(); const symbol = $("#watch-symbol").value; if (!state.watchlist.includes(symbol)) state.watchlist.push(symbol); save("watchlist", state.watchlist); render(); };
    const clearWatchlist = $("#clear-watchlist");
    if (clearWatchlist) clearWatchlist.onclick = () => { state.watchlist = []; save("watchlist", state.watchlist); render(); };
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
    document.documentElement.classList.toggle("light", state.settings.theme === "light");
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
  }

  search.oninput = () => {
    const q = search.value.toLowerCase();
    const matches = data.assets.filter((item) => `${item.symbol} ${item.name}`.toLowerCase().includes(q)).slice(0, 8);
    suggestions.classList.toggle("open", Boolean(q && matches.length));
    suggestions.innerHTML = matches.map((item) => `<button class="suggestion" data-open="${item.symbol}"><span><strong>${item.symbol}</strong> ${item.name}</span><span>${item.type}</span></button>`).join("");
    bind();
  };
  $("#asset-search").onsubmit = (event) => {
    event.preventDefault();
    const q = search.value.trim().toLowerCase();
    const found = data.assets.find((item) => item.symbol.toLowerCase() === q) || data.assets.find((item) => item.name.toLowerCase().includes(q));
    if (found) { search.value = ""; suggestions.classList.remove("open"); go("asset", found.symbol); }
  };
  $("#menu-toggle").onclick = () => document.body.classList.toggle("nav-open");
  $("#theme-toggle").onclick = () => { state.settings.theme = state.settings.theme === "dark" ? "light" : "dark"; save("settings", state.settings); render(); };
  $("#refresh-button").onclick = () => { $("#refresh-button").textContent = "Refreshed"; setTimeout(() => $("#refresh-button").textContent = "Refresh", 900); render(); };
  $("#beginner-toggle").onchange = () => { state.settings.beginner = $("#beginner-toggle").checked; save("settings", state.settings); };
  $("#compact-toggle").onchange = () => { state.settings.compact = $("#compact-toggle").checked; save("settings", state.settings); render(); };
  window.onhashchange = render;
  render();
})();
