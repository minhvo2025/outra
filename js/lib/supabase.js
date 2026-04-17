(function initOutraSupabaseClient(global) {
  const DEFAULT_SUPABASE_URL = 'https://wfujazyakiplsevvdxzn.supabase.co';
  const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_9l483O2Ng-IALqgHUJZEzQ__efU53Sf';
  const AUTH_HASH_KEYS = new Set([
    'access_token',
    'refresh_token',
    'expires_in',
    'expires_at',
    'token_type',
    'type',
    'provider_token',
    'provider_refresh_token',
    'error',
    'error_code',
    'error_description',
  ]);
  const AUTH_TOKEN_KEYS = new Set([
    'access_token',
    'refresh_token',
    'provider_token',
    'provider_refresh_token',
  ]);
  const AUTH_ERROR_KEYS = new Set([
    'error',
    'error_code',
    'error_description',
  ]);

  function trimString(value) {
    return String(value || '').trim();
  }

  function resolveSupabaseConfig() {
    const runtimeUrl = trimString(global.__OUTRA_SUPABASE_URL__);
    const runtimeAnonKey = trimString(global.__OUTRA_SUPABASE_ANON_KEY__);
    return {
      url: runtimeUrl || DEFAULT_SUPABASE_URL,
      anonKey: runtimeAnonKey || DEFAULT_SUPABASE_ANON_KEY,
    };
  }

  function isSupabaseAuthHash(rawHash) {
    const normalizedHash = trimString(rawHash).replace(/^#/, '');
    if (!normalizedHash) return false;
    const params = new URLSearchParams(normalizedHash);
    for (const key of AUTH_HASH_KEYS) {
      if (params.has(key)) return true;
    }
    return false;
  }

  function hasAnyAuthKey(params, keySet) {
    for (const key of keySet) {
      if (params.has(key)) return true;
    }
    return false;
  }

  function stripSupabaseAuthSearch(rawSearch, options = {}) {
    const includeTokens = options.includeTokens !== false;
    const normalizedSearch = trimString(rawSearch).replace(/^\?/, '');
    if (!normalizedSearch) return { search: '', changed: false, strippedTokenKeys: false };
    const params = new URLSearchParams(normalizedSearch);
    const hadTokenKeys = hasAnyAuthKey(params, AUTH_TOKEN_KEYS);
    const keysToStrip = includeTokens ? AUTH_HASH_KEYS : AUTH_ERROR_KEYS;
    let changed = false;
    for (const key of keysToStrip) {
      if (!params.has(key)) continue;
      params.delete(key);
      changed = true;
    }
    const next = params.toString();
    return {
      search: next ? `?${next}` : '',
      changed,
      strippedTokenKeys: includeTokens && hadTokenKeys,
    };
  }

  function clearAuthHashFromUrl(options = {}) {
    const includeTokens = options.includeTokens !== false;
    const location = global.location;
    const history = global.history;
    if (!location || !history || typeof history.replaceState !== 'function') return false;
    const normalizedHash = trimString(location.hash).replace(/^#/, '');
    const hashParams = new URLSearchParams(normalizedHash);
    const hashHasAuth = isSupabaseAuthHash(location.hash);
    const hashHasTokenKeys = hasAnyAuthKey(hashParams, AUTH_TOKEN_KEYS);
    const keysToStrip = includeTokens ? AUTH_HASH_KEYS : AUTH_ERROR_KEYS;
    let nextHashParams = null;
    let hashChanged = false;

    if (hashHasAuth) {
      nextHashParams = new URLSearchParams(normalizedHash);
      for (const key of keysToStrip) {
        if (!nextHashParams.has(key)) continue;
        nextHashParams.delete(key);
        hashChanged = true;
      }
    }

    const searchResult = stripSupabaseAuthSearch(location.search, { includeTokens });
    if (!hashHasAuth && !searchResult.changed) return false;

    const nextHash = nextHashParams && nextHashParams.toString()
      ? `#${nextHashParams.toString()}`
      : '';
    const nextPath = `${trimString(location.pathname) || '/'}${searchResult.search}${nextHash}`;

    // For error callbacks (no auth tokens), force one clean navigation to drop noisy hash state early.
    if (!includeTokens && hashHasAuth && !hashHasTokenKeys && typeof location.replace === 'function') {
      try {
        location.replace(nextPath);
        return true;
      } catch (_error) {
        // fall through to history-based fallback
      }
    }

    try {
      history.replaceState(history.state, global.document?.title || '', nextPath);
      return true;
    } catch (_error) {
      if (hashHasAuth && includeTokens && hashHasTokenKeys) {
        try {
          location.hash = '';
          return true;
        } catch (_ignored) {
          // ignore fallback failures
        }
      }
      return false;
    }
  }

  let authHashCleanupScheduled = false;
  function scheduleAuthHashCleanup() {
    if (authHashCleanupScheduled) return;
    authHashCleanupScheduled = true;
    const run = () => {
      authHashCleanupScheduled = false;
      clearAuthHashFromUrl({ includeTokens: true });
    };
    if (typeof global.setTimeout === 'function') {
      global.setTimeout(run, 0);
      return;
    }
    run();
  }

  let authErrorHashCleanupScheduled = false;
  function scheduleAuthErrorHashCleanup() {
    if (authErrorHashCleanupScheduled) return;
    authErrorHashCleanupScheduled = true;
    const run = () => {
      authErrorHashCleanupScheduled = false;
      clearAuthHashFromUrl({ includeTokens: false });
    };
    if (typeof global.setTimeout === 'function') {
      global.setTimeout(run, 0);
      return;
    }
    run();
  }

  let cachedClient = null;
  function getClient() {
    if (cachedClient) {
      scheduleAuthHashCleanup();
      return cachedClient;
    }

    const factory = global.supabase && typeof global.supabase.createClient === 'function'
      ? global.supabase.createClient
      : null;
    if (!factory) {
      console.warn('[Supabase] supabase-js global is not available.');
      return null;
    }

    const cfg = resolveSupabaseConfig();
    if (!cfg.url || !cfg.anonKey) {
      console.warn('[Supabase] missing URL or anon key.');
      return null;
    }

    cachedClient = factory(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    scheduleAuthHashCleanup();
    return cachedClient;
  }

  global.outraSupabase = {
    getClient,
    getConfig: resolveSupabaseConfig,
    clearAuthHashFromUrl,
    scheduleAuthHashCleanup,
    scheduleAuthErrorHashCleanup,
  };

  // Run once immediately for error fragments only; token fragments must survive until Supabase consumes them.
  scheduleAuthErrorHashCleanup();
})(window);
