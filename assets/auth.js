(function () {
  const storageKey = "stocks-v2:auth-session";
  const state = {
    config: null,
    session: loadSession(),
    profile: null
  };

  function loadSession() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    state.session = session;
    if (session) localStorage.setItem(storageKey, JSON.stringify(session));
    else localStorage.removeItem(storageKey);
    window.dispatchEvent(new CustomEvent("stocks-v2-auth", { detail: { session } }));
  }

  async function config() {
    if (state.config) return state.config;
    const response = await fetch("/api/config");
    state.config = await response.json();
    return state.config;
  }

  async function supabaseAuth(path, options = {}) {
    const cfg = await config();
    if (!cfg.authEnabled) throw new Error("Supabase Auth is not configured.");
    const headers = {
      apikey: cfg.supabaseAnonKey,
      "content-type": "application/json",
      ...(options.headers || {})
    };
    if (options.bearer) headers.authorization = `Bearer ${options.bearer}`;
    const response = await fetch(`${cfg.supabaseUrl.replace(/\/$/, "")}/auth/v1/${path}`, {
      method: options.method || "POST",
      headers,
      body: options.body == null ? undefined : JSON.stringify(options.body)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error_description || body.msg || body.message || `Auth returned ${response.status}`);
    return body;
  }

  async function signUp({ email, password, displayName }) {
    const body = await supabaseAuth("signup", {
      body: {
        email,
        password,
        data: { display_name: displayName || email.split("@")[0] }
      }
    });
    if (body.access_token) saveSession(body);
    return body;
  }

  async function signIn({ email, password }) {
    const body = await supabaseAuth("token?grant_type=password", {
      body: { email, password }
    });
    saveSession(body);
    return body;
  }

  async function resetPassword(email) {
    return supabaseAuth("recover", { body: { email } });
  }

  async function signOut() {
    if (state.session?.access_token) {
      await supabaseAuth("logout", { bearer: state.session.access_token }).catch(() => null);
    }
    saveSession(null);
  }

  async function apiFetch(url, options = {}) {
    const headers = {
      "content-type": "application/json",
      ...(options.headers || {})
    };
    if (state.session?.access_token) headers.authorization = `Bearer ${state.session.access_token}`;
    const response = await fetch(url, {
      ...options,
      headers,
      body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body
    });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || `Request returned ${response.status}`);
    return body;
  }

  async function loadProfile() {
    if (!state.session?.access_token) return null;
    const body = await apiFetch("/api/auth/profile");
    state.profile = body;
    return body;
  }

  async function savePreferences(settings) {
    if (!state.session?.access_token) return null;
    return apiFetch("/api/auth/profile", {
      method: "PATCH",
      body: {
        theme: settings.theme,
        beginnerMode: settings.beginner,
        compactMode: settings.compact
      }
    });
  }

  async function getWatchlists() {
    if (!state.session?.access_token) return null;
    return apiFetch("/api/watchlists");
  }

  async function addWatchlistAsset(symbol, watchlistId, notes) {
    if (!state.session?.access_token || !watchlistId) return null;
    return apiFetch("/api/watchlists", {
      method: "POST",
      body: { symbol, watchlistId, notes }
    });
  }

  window.STOCKS_V2_AUTH = {
    state,
    config,
    signUp,
    signIn,
    signOut,
    resetPassword,
    apiFetch,
    loadProfile,
    savePreferences,
    getWatchlists,
    addWatchlistAsset,
    isSignedIn: () => Boolean(state.session?.access_token)
  };
})();
