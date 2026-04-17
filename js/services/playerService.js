(function initOutraPlayerService(global) {
  const LOG_PREFIX = '[playerService]';
  const AWARD_DEDUPE_STORAGE_KEY = 'outra_supabase_awarded_matches_v1';
  const AWARD_DEDUPE_MAX = 120;
  const LEADERBOARD_TABLE = 'leaderboard_profiles';
  const LEADERBOARD_FALLBACK_TABLE = 'player_profiles';
  const LEADERBOARD_POINT_DELTA = 3;
  const DISPLAY_NAME_MIN_LENGTH = 3;
  const DISPLAY_NAME_MAX_LENGTH = 16;
  const DISPLAY_NAME_REGEX = /^[A-Za-z0-9 _-]+$/;
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PENDING_AUTH_ACTION_STORAGE_KEY = 'outra_pending_auth_action_v1';
  const PENDING_AUTH_ACTION_MAX_AGE_MS = 20 * 60 * 1000;
  const AUTH_CALLBACK_PATH = '/';
  const TEMP_NAME_PREFIXES = [
    'Traveler',
    'Mage',
    'Outrider',
    'Invoker',
    'Spark',
    'Warden',
    'Ranger',
    'Paladin',
    'Rogue',
    'Bard',
    'Druid',
    'Cleric',
    'Warlock',
    'Sorcerer',
    'Alchemist',
    'Arcanist',
    'Templar',
    'Sentinel',
    'Dragoon',
    'Berserker',
    'Gladiator',
    'Ravager',
    'Reaper',
    'Valkyrie',
    'Nightblade',
    'Spellweaver',
    'Runesmith',
    'Stormborn',
    'Ironclad',
    'Starseer',
    'Sunstrider',
    'Moonfang',
    'Shadowkin',
    'Dawnbringer',
    'Duskblade',
    'Emberlord',
    'Frostwarden',
    'Stoneguard',
    'Wildheart',
    'Riftwalker',
    'Voidcaller',
    'Ghostblade',
    'Skyrunner',
    'Flamebound',
    'Oathkeeper',
    'Windcaller',
    'Bloodrune',
    'Ashenborn',
    'Brightspear',
    'Darklance',
    'Thornhelm',
    'Goldcrest',
    'Silveroak',
    'Copperhand',
    'Grimward',
    'Ironwolf',
    'Steelwing',
    'Stormcloak',
    'Mistwalker',
    'Highwarden',
    'Everdawn',
    'Northstar',
    'Southwind',
    'Eastflame',
    'Westguard',
    'Seabreaker',
    'Sandstrider',
    'Wolfshade',
    'Lionheart',
    'Ravencrest',
    'Hawkthorne',
    'Foxshadow',
    'Drakefang',
    'Wyvernclaw',
    'Phoenixash',
    'Thunderborn',
    'Lightspire',
    'Darkspire',
    'Moonwarden',
    'Sunwarden',
    'Firebrand',
    'Icebound',
    'Earthsong',
    'Watershard',
    'Skyforge',
    'Runeblade',
    'Soulkeeper',
    'Fateweaver',
    'Dreamwarden',
    'Netherstorm',
    'Aetherborn',
  ];

  let initPromise = null;
  let identityUiBound = false;
  let authStateSubscriptionBound = false;
  let authStateSubscription = null;
  let authRefreshInFlight = null;
  let lastAuthUserId = '';
  let lastAuthIsAnonymous = true;
  let nameActionInFlight = false;
  let activeIdentityModal = null;
  let committedDisplayName = '';
  let leaderboardStorageMode = LEADERBOARD_TABLE;
  let leaderboardFallbackLogged = false;

  function toInt(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
  }

  function computeLeaderboardPoints(wins, losses, explicitPoints = null) {
    if (explicitPoints !== null && Number.isFinite(Number(explicitPoints))) {
      return Math.max(0, toInt(explicitPoints, 0));
    }
    const safeWins = Math.max(0, toInt(wins, 0));
    const safeLosses = Math.max(0, toInt(losses, 0));
    return Math.max(0, (safeWins - safeLosses) * LEADERBOARD_POINT_DELTA);
  }

  function isMissingLeaderboardTableError(error) {
    const code = trimString(error?.code).toUpperCase();
    const message = `${trimString(error?.message)} ${trimString(error?.hint)}`.toLowerCase();
    return (code === 'PGRST205' || code === '42P01')
      && message.includes('leaderboard_profiles');
  }

  function isMissingLeaderboardRpcError(error) {
    const code = trimString(error?.code).toUpperCase();
    const message = `${trimString(error?.message)} ${trimString(error?.details)} ${trimString(error?.hint)}`.toLowerCase();
    const isAmbiguousUserIdReference = code === '42702'
      && message.includes('user_id')
      && message.includes('ambiguous');
    return code === 'PGRST202'
      || code === '42883'
      || code === 'PGRST204'
      || isAmbiguousUserIdReference
      || message.includes('apply_leaderboard_match_result');
  }

  function isMissingProfilesDisplayNameLcError(error) {
    const code = trimString(error?.code).toUpperCase();
    const message = `${trimString(error?.message)} ${trimString(error?.details)} ${trimString(error?.hint)}`.toLowerCase();
    if (!message.includes('display_name_lc')) return false;
    return code === '42703' || code === 'PGRST204' || code === 'PGRST200' || !code;
  }

  function formatSupabaseError(error) {
    if (!error || typeof error !== 'object') return String(error || '');
    return {
      code: trimString(error.code),
      message: trimString(error.message),
      details: trimString(error.details),
      hint: trimString(error.hint),
      status: Number(error.status) || 0,
    };
  }

  function enableLeaderboardFallbackMode(reason, error = null) {
    leaderboardStorageMode = LEADERBOARD_FALLBACK_TABLE;
    if (leaderboardFallbackLogged) return;
    leaderboardFallbackLogged = true;
    console.warn(
      `${LOG_PREFIX} leaderboard fallback enabled (${reason}). Using ${LEADERBOARD_FALLBACK_TABLE} writes instead of ${LEADERBOARD_TABLE} RPC.`,
      error || ''
    );
  }

  function normalizeLeaderboardProfileRow(row) {
    if (!row || typeof row !== 'object') return null;
    const userId = trimString(row.user_id || row.userId);
    if (!userId) return null;
    const wins = Math.max(0, toInt(row.wins, 0));
    const losses = Math.max(0, toInt(row.losses, 0));
    const displayName = normalizeDisplayName(row.display_name || row.displayName, getSavedDisplayName());
    return {
      id: trimString(row.id),
      user_id: userId,
      display_name: displayName,
      leaderboard_points: computeLeaderboardPoints(wins, losses, row.leaderboard_points),
      wins,
      losses,
      created_at: trimString(row.created_at || row.createdAt),
      updated_at: trimString(row.updated_at || row.updatedAt),
    };
  }

  function trimString(value) {
    return String(value || '').trim();
  }

  function normalizeDisplayName(value, fallback = 'Traveler') {
    const raw = String(value || '').replace(/\s+/g, ' ').trim();
    if (raw) return raw.slice(0, DISPLAY_NAME_MAX_LENGTH);
    const fallbackRaw = String(fallback || '').replace(/\s+/g, ' ').trim();
    if (fallbackRaw) return fallbackRaw.slice(0, DISPLAY_NAME_MAX_LENGTH);
    return '';
  }

  function getSavedDisplayName() {
    const committed = normalizeDisplayName(committedDisplayName, '');
    if (committed) return committed;
    const fromSupabaseProfile = normalizeDisplayName(global.playerProfile && global.playerProfile.display_name, '');
    if (fromSupabaseProfile) return fromSupabaseProfile;
    if (typeof player !== 'undefined' && player && typeof player.name === 'string') {
      const fromRuntime = normalizeDisplayName(player.name, '');
      if (fromRuntime) return fromRuntime;
    }
    return 'Traveler';
  }

  function generateTemporaryPlayerName() {
    // Temporary name is generated only for first-time profile creation.
    const prefix = TEMP_NAME_PREFIXES[Math.floor(Math.random() * TEMP_NAME_PREFIXES.length)] || 'Traveler';
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    return `${prefix}${suffix}`;
  }

  function validateDisplayName(name) {
    const normalized = normalizeDisplayName(name, '');
    if (!normalized || normalized.length < DISPLAY_NAME_MIN_LENGTH) {
      return {
        ok: false,
        message: `Name must be ${DISPLAY_NAME_MIN_LENGTH}-${DISPLAY_NAME_MAX_LENGTH} characters.`,
        normalized,
      };
    }
    if (normalized.length > DISPLAY_NAME_MAX_LENGTH) {
      return {
        ok: false,
        message: `Name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`,
        normalized: normalized.slice(0, DISPLAY_NAME_MAX_LENGTH),
      };
    }
    if (!DISPLAY_NAME_REGEX.test(normalized)) {
      return {
        ok: false,
        message: 'Only letters, numbers, spaces, - and _ are allowed.',
        normalized,
      };
    }
    return { ok: true, message: '', normalized };
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function validateEmail(value) {
    const normalized = normalizeEmail(value);
    if (!normalized || !EMAIL_REGEX.test(normalized)) {
      return {
        ok: false,
        message: 'Please enter a valid email address.',
        normalized,
      };
    }
    return { ok: true, message: '', normalized };
  }

  function isAuthenticatedUser(user) {
    return Boolean(user && user.id && user.is_anonymous !== true);
  }

  function buildAuthRedirectUrl() {
    const runtimeOverride = trimString(global.__OUTRA_AUTH_REDIRECT_URL__);
    if (runtimeOverride) return runtimeOverride;
    const base = trimString(global.__OUTRA_APP_BASE_URL__) || trimString(global.location && global.location.origin);
    const safeBase = base || 'http://localhost:3000';
    const path = AUTH_CALLBACK_PATH.startsWith('/') ? AUTH_CALLBACK_PATH : `/${AUTH_CALLBACK_PATH}`;
    return `${safeBase}${path}`;
  }

  function loadPendingAuthAction() {
    try {
      const raw = localStorage.getItem(PENDING_AUTH_ACTION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const createdAt = Number(parsed.createdAt) || 0;
      if (!createdAt || (Date.now() - createdAt) > PENDING_AUTH_ACTION_MAX_AGE_MS) {
        localStorage.removeItem(PENDING_AUTH_ACTION_STORAGE_KEY);
        return null;
      }
      const type = trimString(parsed.type);
      if (type !== 'claim' && type !== 'continue') return null;
      return {
        type,
        email: normalizeEmail(parsed.email),
        desiredName: normalizeDisplayName(parsed.desiredName, ''),
        createdAt,
      };
    } catch (_error) {
      return null;
    }
  }

  function savePendingAuthAction(action) {
    try {
      const payload = {
        type: trimString(action?.type),
        email: normalizeEmail(action?.email),
        desiredName: normalizeDisplayName(action?.desiredName, ''),
        createdAt: Date.now(),
      };
      localStorage.setItem(PENDING_AUTH_ACTION_STORAGE_KEY, JSON.stringify(payload));
    } catch (_error) {
      // ignore storage errors
    }
  }

  function clearPendingAuthAction() {
    try {
      localStorage.removeItem(PENDING_AUTH_ACTION_STORAGE_KEY);
    } catch (_error) {
      // ignore storage errors
    }
  }

  function getNameInputEl() {
    return document.getElementById('nameInput');
  }

  function setNameInputValue(value) {
    const inputEl = getNameInputEl();
    if (!inputEl) return;
    inputEl.value = normalizeDisplayName(value, 'Traveler');
  }

  function applyDisplayNameToRuntime(displayName) {
    const safeName = normalizeDisplayName(displayName, 'Traveler');
    committedDisplayName = safeName;
    if (typeof player !== 'undefined' && player && typeof player === 'object') {
      player.name = safeName;
    }
    if (!global.playerProfile || typeof global.playerProfile !== 'object') {
      global.playerProfile = {};
    }
    global.playerProfile.display_name = safeName;
    setNameInputValue(safeName);
    if (typeof saveProfile === 'function') {
      saveProfile();
    }
    if (typeof updateHud === 'function') {
      updateHud();
    }
    if (typeof drawLobbyPreview === 'function' && typeof gameState !== 'undefined' && gameState === 'lobby') {
      drawLobbyPreview();
    }
  }

  function getSupabaseClient() {
    return global.outraSupabase && typeof global.outraSupabase.getClient === 'function'
      ? global.outraSupabase.getClient()
      : null;
  }

  function loadAwardedMatchIds() {
    try {
      const raw = localStorage.getItem(AWARD_DEDUPE_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((entry) => trimString(entry)).filter(Boolean);
    } catch (_error) {
      return [];
    }
  }

  function saveAwardedMatchIds(ids) {
    try {
      const safe = Array.isArray(ids) ? ids.slice(-AWARD_DEDUPE_MAX) : [];
      localStorage.setItem(AWARD_DEDUPE_STORAGE_KEY, JSON.stringify(safe));
    } catch (_error) {
      // ignore storage errors
    }
  }

  function hasAwardedMatch(matchId) {
    const normalized = trimString(matchId);
    if (!normalized) return false;
    const ids = loadAwardedMatchIds();
    return ids.includes(normalized);
  }

  function markAwardedMatch(matchId) {
    const normalized = trimString(matchId);
    if (!normalized) return;
    const ids = loadAwardedMatchIds();
    if (ids.includes(normalized)) return;
    ids.push(normalized);
    saveAwardedMatchIds(ids);
  }

  function syncRuntimeFromSupabaseProfile(profileRow) {
    if (!profileRow || typeof profileRow !== 'object') return;

    global.playerProfile = {
      ...(global.playerProfile || {}),
      ...profileRow,
    };

    const safeDisplayName = normalizeDisplayName(profileRow.display_name, getSavedDisplayName());
    committedDisplayName = safeDisplayName;
    if (typeof player !== 'undefined' && player && typeof player === 'object') {
      player.name = safeDisplayName;
    }
    global.playerProfile.display_name = safeDisplayName;
    const nameInputEl = getNameInputEl();
    if (nameInputEl && document.activeElement !== nameInputEl) {
      nameInputEl.value = safeDisplayName;
    }

    if (typeof profile !== 'undefined' && profile && typeof profile === 'object') {
      profile.wlk = Math.max(0, toInt(profileRow.out_balance, profile.wlk || 0));
      const existingRanked = profile.ranked && typeof profile.ranked === 'object'
        ? profile.ranked
        : {};
      profile.ranked = {
        ...existingRanked,
        currentRank: Math.max(1, Math.min(20, toInt(profileRow.rank_tier, existingRanked.currentRank || 20))),
        currentStars: Math.max(0, toInt(profileRow.stars, existingRanked.currentStars || 0)),
        wins: Math.max(0, toInt(profileRow.wins, existingRanked.wins || 0)),
        losses: Math.max(0, toInt(profileRow.losses, existingRanked.losses || 0)),
        totalMatches: Math.max(
          0,
          toInt(profileRow.wins, existingRanked.wins || 0) + toInt(profileRow.losses, existingRanked.losses || 0)
        ),
      };
      if (typeof normalizeRankedProfile === 'function') {
        profile.ranked = normalizeRankedProfile(profile.ranked);
      }
    }

    if (typeof saveProfile === 'function') {
      saveProfile();
    }
    if (typeof updateHud === 'function') {
      updateHud();
    }
    if (typeof drawLobbyPreview === 'function' && typeof gameState !== 'undefined' && gameState === 'lobby') {
      drawLobbyPreview();
    }
  }

  function syncRuntimeFromLeaderboardProfile(profileRow) {
    const row = normalizeLeaderboardProfileRow(profileRow);
    if (!row) return;

    if (!global.playerProfile || typeof global.playerProfile !== 'object') {
      global.playerProfile = {};
    }
    global.playerProfile.user_id = trimString(global.playerProfile.user_id || row.user_id);
    global.playerProfile.leaderboard_points = row.leaderboard_points;
    global.playerProfile.leaderboard_wins = row.wins;
    global.playerProfile.leaderboard_losses = row.losses;

    if (typeof profile !== 'undefined' && profile && typeof profile === 'object') {
      profile.leaderboard = {
        userId: row.user_id,
        points: row.leaderboard_points,
        wins: row.wins,
        losses: row.losses,
        updatedAt: row.updated_at,
      };
    }

    if (typeof player !== 'undefined' && player && typeof player === 'object') {
      player.score = row.leaderboard_points;
    }

    if (typeof saveProfile === 'function') {
      saveProfile();
    }
  }

  function refreshPlayerCurrencyUI() {
    const outBalance = Math.max(0, toInt(global.playerProfile && global.playerProfile.out_balance, 0));
    document.querySelectorAll('[data-out-balance]').forEach((el) => {
      el.textContent = String(outBalance);
    });

    if (typeof profile !== 'undefined' && profile && typeof profile === 'object') {
      profile.wlk = outBalance;
    }
    if (typeof updateHud === 'function') updateHud();
    if (typeof renderStore === 'function') renderStore();
  }

  async function getCurrentSupabaseUser() {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error(`${LOG_PREFIX} getSession failed:`, sessionError);
      return null;
    }
    const sessionUser = sessionData && sessionData.session && sessionData.session.user
      ? sessionData.session.user
      : null;
    if (!sessionUser || !sessionUser.id) return null;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error(`${LOG_PREFIX} getUser failed:`, userError);
      return null;
    }
    return userData && userData.user ? userData.user : null;
  }

  async function loadPlayerProfile(userId) {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return null;

    const { data, error } = await supabase
      .from('player_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error(`${LOG_PREFIX} loadPlayerProfile failed:`, error);
      return null;
    }

    return data || null;
  }

  async function createPlayerProfile(userId, options = {}) {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return null;

    const requestedName = normalizeDisplayName(options.displayName, '');
    const defaultDisplayName = requestedName || generateTemporaryPlayerName();
    const sourceRanked = options.ranked && typeof options.ranked === 'object'
      ? options.ranked
      : (typeof profile !== 'undefined' && profile && profile.ranked && typeof profile.ranked === 'object'
        ? profile.ranked
        : {});
    const sourceOut = Number.isFinite(Number(options.outBalance))
      ? Number(options.outBalance)
      : (
        typeof profile !== 'undefined' && profile && typeof profile.wlk !== 'undefined'
          ? Number(profile.wlk)
          : 0
      );

    const { data, error } = await supabase
      .from('player_profiles')
      .insert({
        user_id: userId,
        display_name: defaultDisplayName,
        rank_tier: Math.max(1, Math.min(20, toInt(sourceRanked.currentRank, 20))),
        stars: Math.max(0, toInt(sourceRanked.currentStars, 0)),
        hidden_mmr: Math.max(0, toInt(options.hiddenMmr, 1000)),
        wins: Math.max(0, toInt(sourceRanked.wins, 0)),
        losses: Math.max(0, toInt(sourceRanked.losses, 0)),
        out_balance: Math.max(0, toInt(sourceOut, 0)),
        out_earned_total: Math.max(0, toInt(options.outEarnedTotal, 0)),
        out_spent_total: 0,
      })
      .select()
      .single();

    if (error) {
      console.error(`${LOG_PREFIX} createPlayerProfile failed:`, error);
      return null;
    }

    return data || null;
  }

  async function loadIdentityProfile(userId) {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error(`${LOG_PREFIX} loadIdentityProfile failed:`, error);
      return null;
    }
    return data || null;
  }

  async function isDisplayNameAvailable(name, options = {}) {
    const supabase = getSupabaseClient();
    if (!supabase) return false;
    const validation = validateDisplayName(name);
    if (!validation.ok) return false;

    const payload = {
      p_display_name: validation.normalized,
      p_exclude_user_id: trimString(options.excludeUserId) || null,
    };
    const { data, error } = await supabase.rpc('is_profile_display_name_available', payload);
    if (!error) {
      return data === true;
    }

    const code = trimString(error?.code).toUpperCase();
    const message = `${trimString(error?.message)} ${trimString(error?.hint)}`.toLowerCase();
    const shouldFallbackToSelect = code === 'PGRST202'
      || code === '42883'
      || code === 'PGRST204'
      || message.includes('is_profile_display_name_available');
    if (!shouldFallbackToSelect) {
      console.error(`${LOG_PREFIX} isDisplayNameAvailable failed:`, error);
      return false;
    }

    const normalizedLc = validation.normalized.toLowerCase();
    const excludeId = trimString(options.excludeUserId);
    let query = supabase
      .from('profiles')
      .select('id')
      .eq('display_name_lc', normalizedLc)
      .limit(1);
    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    let { data: rows, error: selectError } = await query;
    if (selectError && isMissingProfilesDisplayNameLcError(selectError)) {
      let plainQuery = supabase
        .from('profiles')
        .select('id,display_name')
        .ilike('display_name', validation.normalized)
        .limit(1);
      if (excludeId) {
        plainQuery = plainQuery.neq('id', excludeId);
      }
      const fallbackResult = await plainQuery;
      rows = fallbackResult.data;
      selectError = fallbackResult.error;
    }
    if (selectError) {
      console.error(`${LOG_PREFIX} isDisplayNameAvailable fallback failed:`, selectError);
      return false;
    }
    return !Array.isArray(rows) || rows.length === 0;
  }

  async function isClaimEmailAvailable(email, options = {}) {
    const supabase = getSupabaseClient();
    if (!supabase) return { ok: false, available: false, message: 'Supabase is not available right now.' };

    const validation = validateEmail(email);
    if (!validation.ok) {
      return {
        ok: false,
        available: false,
        message: validation.message,
      };
    }

    const payload = {
      p_email: validation.normalized,
      p_exclude_user_id: trimString(options.excludeUserId) || null,
    };

    // Primary check: auth.users (true source of whether email already has an account).
    let { data, error } = await supabase.rpc('is_auth_email_available', payload);
    if (error) {
      const code = trimString(error?.code).toUpperCase();
      const message = `${trimString(error?.message)} ${trimString(error?.hint)}`.toLowerCase();
      const missingRpc = code === 'PGRST202'
        || code === '42883'
        || code === 'PGRST204'
        || message.includes('is_auth_email_available');

      // Backward compatibility fallback: older SQL may only have profiles-based helper.
      if (missingRpc) {
        const fallback = await supabase.rpc('is_profile_email_available', payload);
        data = fallback.data;
        error = fallback.error;
      }
    }

    if (error) {
      console.error(`${LOG_PREFIX} isClaimEmailAvailable failed:`, error);
      return {
        ok: false,
        available: false,
        message: 'Could not verify this email right now. Please try again.',
      };
    }

    return {
      ok: true,
      available: data === true,
      message: '',
    };
  }

  async function upsertIdentityProfile(user, options = {}) {
    const supabase = getSupabaseClient();
    if (!supabase || !user || !user.id) return null;

    const existingPlayerProfileName = normalizeDisplayName(options.existingPlayerProfileName, '');
    const fallbackName = normalizeDisplayName(options.fallbackDisplayName, getSavedDisplayName() || generateTemporaryPlayerName());
    const pendingAction = options.pendingAction && typeof options.pendingAction === 'object'
      ? options.pendingAction
      : loadPendingAuthAction();
    const pendingName = normalizeDisplayName(pendingAction?.desiredName, '');
    const emailFromUser = normalizeEmail(user.email);
    const requestedClaimName = options.claimDisplayName
      ? normalizeDisplayName(options.claimDisplayName, '')
      : pendingName;
    let row = await loadIdentityProfile(user.id);

    if (!row) {
      let insertDisplayName = existingPlayerProfileName || fallbackName || generateTemporaryPlayerName();
      if (requestedClaimName) {
        const available = await isDisplayNameAvailable(requestedClaimName, { excludeUserId: user.id });
        if (available) {
          insertDisplayName = requestedClaimName;
        }
      }
      const insertPayload = {
        id: user.id,
        email: emailFromUser || normalizeEmail(pendingAction?.email),
        display_name: insertDisplayName,
        display_name_lc: insertDisplayName.toLowerCase(),
      };
      let { data, error } = await supabase
        .from('profiles')
        .insert(insertPayload)
        .select()
        .single();
      if (error && isMissingProfilesDisplayNameLcError(error)) {
        const retryPayload = {
          id: user.id,
          email: insertPayload.email,
          display_name: insertPayload.display_name,
        };
        const retry = await supabase
          .from('profiles')
          .insert(retryPayload)
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }
      if (error) {
        console.error(`${LOG_PREFIX} upsertIdentityProfile insert failed:`, error);
        return null;
      }
      row = data || null;
    }

    if (!row) return null;

    const nextEmail = emailFromUser || normalizeEmail(row.email) || normalizeEmail(pendingAction?.email);
    const rowDisplayName = normalizeDisplayName(row.display_name, '');
    let nextDisplayName = rowDisplayName || existingPlayerProfileName || fallbackName || generateTemporaryPlayerName();
    let shouldUpdateDisplayName = false;

    // Recovery hardening: if identity row exists without a usable name, restore from known player profile name first.
    if (!rowDisplayName && existingPlayerProfileName) {
      shouldUpdateDisplayName = true;
      nextDisplayName = existingPlayerProfileName;
    }

    if (requestedClaimName) {
      const desiredName = normalizeDisplayName(requestedClaimName, '');
      if (desiredName && desiredName.toLowerCase() !== nextDisplayName.toLowerCase()) {
        const available = await isDisplayNameAvailable(desiredName, { excludeUserId: user.id });
        if (available) {
          nextDisplayName = desiredName;
          shouldUpdateDisplayName = true;
        }
      }
    }

    const shouldUpdateEmail = normalizeEmail(row.email) !== nextEmail;
    if (shouldUpdateEmail || shouldUpdateDisplayName) {
      const updatePayload = {
        updated_at: new Date().toISOString(),
      };
      if (shouldUpdateEmail) updatePayload.email = nextEmail || null;
      if (shouldUpdateDisplayName) {
        updatePayload.display_name = nextDisplayName;
        updatePayload.display_name_lc = nextDisplayName.toLowerCase();
      }
      let { data, error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', user.id)
        .select()
        .single();
      if (error && isMissingProfilesDisplayNameLcError(error) && Object.prototype.hasOwnProperty.call(updatePayload, 'display_name_lc')) {
        const retryPayload = {
          ...updatePayload,
        };
        delete retryPayload.display_name_lc;
        const retry = await supabase
          .from('profiles')
          .update(retryPayload)
          .eq('id', user.id)
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }
      if (error) {
        console.error(`${LOG_PREFIX} upsertIdentityProfile update failed:`, error);
        return row;
      }
      row = data || row;
    }

    return row;
  }

  async function sendMagicLink(email) {
    const supabase = getSupabaseClient();
    if (!supabase) return { ok: false, message: 'Supabase is not available right now.' };
    const validation = validateEmail(email);
    if (!validation.ok) return { ok: false, message: validation.message };

    const redirectTo = buildAuthRedirectUrl();
    const { error } = await supabase.auth.signInWithOtp({
      email: validation.normalized,
      options: {
        emailRedirectTo: redirectTo,
      },
    });
    if (error) {
      console.error(`${LOG_PREFIX} sendMagicLink failed:`, error);
      return { ok: false, message: 'Could not send magic link right now. Please try again.' };
    }
    return { ok: true, message: 'Check your email to continue.' };
  }

  async function updatePlayerRank(updatedFields) {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const user = await getCurrentSupabaseUser();
    if (!user) {
      console.error(`${LOG_PREFIX} updatePlayerRank: no user`);
      return null;
    }

    const payload = {
      ...updatedFields,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('player_profiles')
      .update(payload)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error(`${LOG_PREFIX} updatePlayerRank failed:`, error);
      return null;
    }

    syncRuntimeFromSupabaseProfile(data);
    refreshPlayerCurrencyUI();
    return data;
  }

  async function updatePlayerDisplayName(newName) {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const user = await getCurrentSupabaseUser();
    if (!user) {
      console.error(`${LOG_PREFIX} updatePlayerDisplayName: no user`);
      return null;
    }

    const validation = validateDisplayName(newName);
    if (!validation.ok) {
      console.error(`${LOG_PREFIX} updatePlayerDisplayName validation failed: ${validation.message}`);
      return null;
    }

    const available = await isDisplayNameAvailable(validation.normalized, { excludeUserId: user.id });
    if (!available) {
      console.warn(`${LOG_PREFIX} updatePlayerDisplayName: name unavailable ${validation.normalized}`);
      return null;
    }

    const identityProfile = await upsertIdentityProfile(user, {
      claimDisplayName: validation.normalized,
      fallbackDisplayName: validation.normalized,
    });
    if (!identityProfile) {
      console.error(`${LOG_PREFIX} updatePlayerDisplayName failed: identity profile unavailable`);
      return null;
    }

    const { data, error } = await supabase
      .from('player_profiles')
      .update({
        display_name: normalizeDisplayName(identityProfile.display_name, validation.normalized),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error(`${LOG_PREFIX} updatePlayerDisplayName failed:`, error);
      return null;
    }

    syncRuntimeFromSupabaseProfile(data);
    const syncedLb = await updateLeaderboardDisplayName(validation.normalized, { userId: user.id });
    if (!syncedLb) {
      console.warn(`${LOG_PREFIX} updatePlayerDisplayName: leaderboard display name sync skipped/failed`);
    } else if (typeof global.refreshLeaderboardFromSupabase === 'function') {
      global.refreshLeaderboardFromSupabase({ force: true }).catch(() => {});
    }
    return data;
  }

  async function loadLeaderboardProfile(userId) {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return null;

    if (leaderboardStorageMode === LEADERBOARD_FALLBACK_TABLE) {
      const { data, error } = await supabase
        .from(LEADERBOARD_FALLBACK_TABLE)
        .select('id,user_id,display_name,wins,losses,created_at,updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        console.error(`${LOG_PREFIX} loadLeaderboardProfile fallback failed:`, error);
        return null;
      }
      return normalizeLeaderboardProfileRow(data);
    }

    const { data, error } = await supabase
      .from(LEADERBOARD_TABLE)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isMissingLeaderboardTableError(error)) {
        enableLeaderboardFallbackMode('table_missing', error);
        return loadLeaderboardProfile(userId);
      }
      console.error(`${LOG_PREFIX} loadLeaderboardProfile failed:`, error);
      return null;
    }
    return normalizeLeaderboardProfileRow(data);
  }

  async function ensureLeaderboardProfile(options = {}) {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const user = options?.userId
      ? { id: trimString(options.userId) }
      : await getCurrentSupabaseUser();
    if (!user || !user.id) {
      console.error(`${LOG_PREFIX} ensureLeaderboardProfile: no user`);
      return null;
    }

    const displayName = normalizeDisplayName(options?.displayName, getSavedDisplayName());

    if (leaderboardStorageMode === LEADERBOARD_FALLBACK_TABLE) {
      const { data, error } = await supabase
        .from(LEADERBOARD_FALLBACK_TABLE)
        .upsert(
          {
            user_id: user.id,
            display_name: displayName,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .select('id,user_id,display_name,wins,losses,created_at,updated_at')
        .single();

      if (error) {
        console.error(`${LOG_PREFIX} ensureLeaderboardProfile fallback failed:`, error);
        return null;
      }

      const normalizedFallback = normalizeLeaderboardProfileRow(data);
      if (normalizedFallback) {
        syncRuntimeFromLeaderboardProfile(normalizedFallback);
      }
      return normalizedFallback;
    }

    const { data, error } = await supabase
      .from(LEADERBOARD_TABLE)
      .upsert(
        {
          user_id: user.id,
          display_name: displayName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) {
      if (isMissingLeaderboardTableError(error)) {
        enableLeaderboardFallbackMode('table_missing', error);
        return ensureLeaderboardProfile(options);
      }
      console.error(`${LOG_PREFIX} ensureLeaderboardProfile failed:`, error);
      return null;
    }

    const normalized = normalizeLeaderboardProfileRow(data);
    if (normalized) {
      syncRuntimeFromLeaderboardProfile(normalized);
    }
    return normalized;
  }

  async function updateLeaderboardDisplayName(displayName, options = {}) {
    const safeDisplayName = normalizeDisplayName(displayName, getSavedDisplayName());
    return ensureLeaderboardProfile({
      userId: options?.userId,
      displayName: safeDisplayName,
    });
  }

  async function fetchLeaderboard(options = {}) {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const limit = Math.max(1, Math.min(1000, toInt(options.limit, 100)));

    if (leaderboardStorageMode === LEADERBOARD_FALLBACK_TABLE) {
      const fallbackFetchLimit = Math.max(limit, 200);
      const { data, error } = await supabase
        .from(LEADERBOARD_FALLBACK_TABLE)
        .select('id,user_id,display_name,wins,losses,created_at,updated_at')
        .order('wins', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(fallbackFetchLimit);

      if (error) {
        console.error(`${LOG_PREFIX} fetchLeaderboard fallback failed:`, error);
        return [];
      }

      const rows = (Array.isArray(data) ? data : [])
        .map((row) => normalizeLeaderboardProfileRow(row))
        .filter(Boolean)
        .sort((a, b) => {
          const pointsDiff = (Number(b?.leaderboard_points) || 0) - (Number(a?.leaderboard_points) || 0);
          if (pointsDiff !== 0) return pointsDiff;
          const winsDiff = (Number(b?.wins) || 0) - (Number(a?.wins) || 0);
          if (winsDiff !== 0) return winsDiff;
          const createdA = Date.parse(String(a?.created_at || '')) || Number.MAX_SAFE_INTEGER;
          const createdB = Date.parse(String(b?.created_at || '')) || Number.MAX_SAFE_INTEGER;
          return createdA - createdB;
        });
      return rows.slice(0, limit);
    }

    const { data, error } = await supabase
      .from(LEADERBOARD_TABLE)
      .select('id,user_id,display_name,leaderboard_points,wins,losses,created_at,updated_at')
      .order('leaderboard_points', { ascending: false })
      .order('wins', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      if (isMissingLeaderboardTableError(error)) {
        enableLeaderboardFallbackMode('table_missing', error);
        return fetchLeaderboard(options);
      }
      console.error(`${LOG_PREFIX} fetchLeaderboard failed:`, error);
      return [];
    }

    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((row) => normalizeLeaderboardProfileRow(row))
      .filter(Boolean);
  }

  async function applyLeaderboardMatchResultDirect(params = {}) {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const userId = trimString(params.userId);
    const displayName = normalizeDisplayName(params.displayName, getSavedDisplayName());
    const normalizedResult = trimString(params.result).toLowerCase();
    if (!userId || (normalizedResult !== 'win' && normalizedResult !== 'loss')) return null;

    const baseRow = await ensureLeaderboardProfile({
      userId,
      displayName,
    });
    if (!baseRow) return null;

    const nextWins = Math.max(0, toInt(baseRow.wins, 0) + (normalizedResult === 'win' ? 1 : 0));
    const nextLosses = Math.max(0, toInt(baseRow.losses, 0) + (normalizedResult === 'loss' ? 1 : 0));
    const currentPoints = Math.max(0, toInt(baseRow.leaderboard_points, 0));
    const nextPoints = Math.max(0, currentPoints + (normalizedResult === 'win' ? LEADERBOARD_POINT_DELTA : -LEADERBOARD_POINT_DELTA));

    const { data, error } = await supabase
      .from(LEADERBOARD_TABLE)
      .update({
        display_name: displayName,
        wins: nextWins,
        losses: nextLosses,
        leaderboard_points: nextPoints,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select('id,user_id,display_name,leaderboard_points,wins,losses,created_at,updated_at')
      .single();

    if (error) {
      console.error(`${LOG_PREFIX} applyLeaderboardMatchResult direct-table fallback failed:`, formatSupabaseError(error), error);
      return null;
    }

    const normalized = normalizeLeaderboardProfileRow(data);
    if (!normalized) return null;
    syncRuntimeFromLeaderboardProfile(normalized);
    return normalized;
  }

  async function applyLeaderboardMatchResult(result, options = {}) {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const normalizedResult = trimString(result).toLowerCase();
    if (normalizedResult !== 'win' && normalizedResult !== 'loss') {
      console.warn(`${LOG_PREFIX} applyLeaderboardMatchResult skipped invalid result: ${result}`);
      return null;
    }

    const user = await getCurrentSupabaseUser();
    if (!user || !user.id) {
      console.error(`${LOG_PREFIX} applyLeaderboardMatchResult: no user`);
      return null;
    }

    const displayName = normalizeDisplayName(options?.displayName, getSavedDisplayName());

    if (leaderboardStorageMode === LEADERBOARD_FALLBACK_TABLE) {
      const currentRow = await ensureLeaderboardProfile({
        userId: user.id,
        displayName,
      });
      if (!currentRow) return null;

      const nextWins = Math.max(0, toInt(currentRow.wins, 0) + (normalizedResult === 'win' ? 1 : 0));
      const nextLosses = Math.max(0, toInt(currentRow.losses, 0) + (normalizedResult === 'loss' ? 1 : 0));

      const { data, error } = await supabase
        .from(LEADERBOARD_FALLBACK_TABLE)
        .update({
          display_name: displayName,
          wins: nextWins,
          losses: nextLosses,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select('id,user_id,display_name,wins,losses,created_at,updated_at')
        .single();

      if (error) {
        console.error(`${LOG_PREFIX} applyLeaderboardMatchResult fallback failed:`, error);
        return null;
      }

      const normalizedFallback = normalizeLeaderboardProfileRow(data);
      if (!normalizedFallback) return null;
      syncRuntimeFromLeaderboardProfile(normalizedFallback);
      return normalizedFallback;
    }

    const { data, error } = await supabase.rpc('apply_leaderboard_match_result', {
      p_user_id: user.id,
      p_display_name: displayName,
      p_result: normalizedResult,
    });

    if (error) {
      if (isMissingLeaderboardTableError(error) || isMissingLeaderboardRpcError(error)) {
        enableLeaderboardFallbackMode('rpc_or_table_missing', error);
        return applyLeaderboardMatchResult(normalizedResult, options);
      }
      console.error(`${LOG_PREFIX} applyLeaderboardMatchResult RPC failed:`, formatSupabaseError(error), error);
      const directRow = await applyLeaderboardMatchResultDirect({
        userId: user.id,
        displayName,
        result: normalizedResult,
      });
      if (directRow) {
        console.warn(`${LOG_PREFIX} applyLeaderboardMatchResult used direct-table fallback after RPC error.`);
        return directRow;
      }
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const normalized = normalizeLeaderboardProfileRow(row);
    if (!normalized) {
      console.error(`${LOG_PREFIX} applyLeaderboardMatchResult RPC returned no valid row`);
      return null;
    }

    syncRuntimeFromLeaderboardProfile(normalized);
    return normalized;
  }

  async function awardOut(amount, reason, options = {}) {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const safeAmount = toInt(amount, 0);
    if (safeAmount <= 0) {
      console.warn(`${LOG_PREFIX} awardOut skipped invalid amount:`, amount);
      return null;
    }

    const safeReason = trimString(reason);
    if (!safeReason) {
      console.warn(`${LOG_PREFIX} awardOut skipped missing reason`);
      return null;
    }

    const matchId = trimString(options.matchId);
    if (matchId && hasAwardedMatch(matchId)) {
      console.info(`${LOG_PREFIX} awardOut skipped duplicate match reward ${matchId}`);
      return null;
    }

    const user = await getCurrentSupabaseUser();
    if (!user) {
      console.error(`${LOG_PREFIX} awardOut: no user`);
      return null;
    }

    // Uses one RPC so balance update + ledger insert happen atomically.
    const { data, error } = await supabase.rpc('award_out_currency', {
      p_user_id: user.id,
      p_amount: safeAmount,
      p_reason: safeReason,
    });

    if (error) {
      console.error(`${LOG_PREFIX} awardOut RPC failed:`, error);
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      console.error(`${LOG_PREFIX} awardOut RPC returned no row`);
      return null;
    }

    if (!global.playerProfile) {
      global.playerProfile = {};
    }
    global.playerProfile.out_balance = Math.max(0, toInt(row.out_balance, 0));
    global.playerProfile.out_earned_total = Math.max(0, toInt(row.out_earned_total, 0));

    if (typeof profile !== 'undefined' && profile && typeof profile === 'object') {
      profile.wlk = global.playerProfile.out_balance;
    }

    if (matchId) {
      markAwardedMatch(matchId);
    }

    if (typeof saveProfile === 'function') {
      saveProfile();
    }
    refreshPlayerCurrencyUI();
    return row;
  }

  function getIdentityElements() {
    return {
      nameInputEl: getNameInputEl(),
      guestBlockEl: document.getElementById('identityGuestBlock'),
      actionGroupEl: document.getElementById('identityActionGroup'),
      claimBtnEl: document.getElementById('claimNameBtn'),
      continueBtnEl: document.getElementById('continueJourneyBtn'),
      signedInBlockEl: document.getElementById('identitySignedInBlock'),
      signedInTextEl: document.getElementById('identitySignedInText'),
      signOutBtnEl: document.getElementById('identitySignOutBtn'),
    };
  }

  function syncStoreModalBodyLock() {
    if (!document.body) return;
    const hasOpenModal = !!document.querySelector('.storeModal.open');
    document.body.classList.toggle('storeOpen', hasOpenModal);
  }

  function ensureIdentityModalElements(type) {
    const safeType = type === 'claim' ? 'claim' : 'continue';
    const modalId = safeType === 'claim' ? 'identityClaimModal' : 'identityContinueModal';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = modalId;
      modalEl.className = 'storeModal';
      modalEl.setAttribute('aria-hidden', 'true');
      modalEl.setAttribute('role', 'dialog');
      modalEl.setAttribute('aria-modal', 'true');

      if (safeType === 'claim') {
        modalEl.innerHTML = `
          <div class="storeModalBackdrop" data-identity-role="backdrop"></div>
          <div class="storeModalDialog" style="max-width: 520px;">
            <button type="button" class="secondary storeCloseBtn" data-identity-role="close">Close</button>
            <div class="sectionTitle identityModalTitle" style="margin-top:0; font-size:22px;">Claim your name</div>
            <div class="hint identityModalHint">We&apos;ll send a magic link to secure your name and progress.</div>
            <div class="row" style="display:grid; gap:10px;">
              <input type="text" maxlength="${DISPLAY_NAME_MAX_LENGTH}" class="nameChangeDialogInput" data-identity-role="name" placeholder="Choose your permanent name" />
              <input type="email" class="nameChangeDialogInput" data-identity-role="email" placeholder="you@example.com" />
            </div>
            <div class="row" style="justify-content:flex-end; gap:10px; margin-top:14px;">
              <button type="button" class="secondary nameChangeCancelBtn" data-identity-role="cancel">Cancel</button>
              <button type="button" class="secondary identityBtnPrimary" data-identity-role="submit">Send magic link</button>
            </div>
            <div class="identityModalError" data-identity-role="error"></div>
            <div class="identityModalSuccess" data-identity-role="success"></div>
          </div>
        `;
      } else {
        modalEl.innerHTML = `
          <div class="storeModalBackdrop" data-identity-role="backdrop"></div>
          <div class="storeModalDialog" style="max-width: 520px;">
            <button type="button" class="secondary storeCloseBtn" data-identity-role="close">Close</button>
            <div class="sectionTitle identityModalTitle" style="margin-top:0; font-size:22px;">Continue your journey</div>
            <div class="hint identityModalHint">We&apos;ll send a magic link so you can restore your profile on this device.</div>
            <div class="row" style="display:grid; gap:10px;">
              <input type="email" class="nameChangeDialogInput" data-identity-role="email" placeholder="you@example.com" />
            </div>
            <div class="row" style="justify-content:flex-end; gap:10px; margin-top:14px;">
              <button type="button" class="secondary nameChangeCancelBtn" data-identity-role="cancel">Cancel</button>
              <button type="button" class="secondary identityBtnSecondary" data-identity-role="submit">Send magic link</button>
            </div>
            <div class="identityModalError" data-identity-role="error"></div>
            <div class="identityModalSuccess" data-identity-role="success"></div>
          </div>
        `;
      }

      document.body.appendChild(modalEl);
    }

    return {
      modalEl,
      backdropEl: modalEl.querySelector('[data-identity-role="backdrop"]'),
      closeBtnEl: modalEl.querySelector('[data-identity-role="close"]'),
      cancelBtnEl: modalEl.querySelector('[data-identity-role="cancel"]'),
      submitBtnEl: modalEl.querySelector('[data-identity-role="submit"]'),
      nameInputEl: modalEl.querySelector('[data-identity-role="name"]'),
      emailInputEl: modalEl.querySelector('[data-identity-role="email"]'),
      errorEl: modalEl.querySelector('[data-identity-role="error"]'),
      successEl: modalEl.querySelector('[data-identity-role="success"]'),
    };
  }

  function setIdentityModalBusy(modalRefs, busy) {
    const isBusy = !!busy;
    if (modalRefs.submitBtnEl) modalRefs.submitBtnEl.disabled = isBusy;
    if (modalRefs.cancelBtnEl) modalRefs.cancelBtnEl.disabled = isBusy;
    if (modalRefs.closeBtnEl) modalRefs.closeBtnEl.disabled = isBusy;
    if (modalRefs.nameInputEl) modalRefs.nameInputEl.disabled = isBusy;
    if (modalRefs.emailInputEl) modalRefs.emailInputEl.disabled = isBusy;
  }

  function setIdentityModalError(modalRefs, message) {
    if (!modalRefs.errorEl) return;
    modalRefs.errorEl.textContent = trimString(message);
  }

  function setIdentityModalSuccess(modalRefs, message) {
    if (!modalRefs.successEl) return;
    modalRefs.successEl.textContent = trimString(message);
  }

  function openIdentityModal(modalRefs) {
    if (!modalRefs || !modalRefs.modalEl) return;
    if (activeIdentityModal && activeIdentityModal !== modalRefs.modalEl) {
      closeIdentityModal(activeIdentityModal);
    }
    activeIdentityModal = modalRefs.modalEl;
    modalRefs.modalEl.classList.add('open');
    modalRefs.modalEl.setAttribute('aria-hidden', 'false');
    syncStoreModalBodyLock();
  }

  function closeIdentityModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('open');
    modalEl.setAttribute('aria-hidden', 'true');
    if (activeIdentityModal === modalEl) {
      activeIdentityModal = null;
    }
    syncStoreModalBodyLock();
  }

  async function submitClaimFlow(modalRefs) {
    if (!modalRefs || nameActionInFlight) return;

    setIdentityModalError(modalRefs, '');
    setIdentityModalSuccess(modalRefs, '');

    const nameValidation = validateDisplayName(modalRefs.nameInputEl && modalRefs.nameInputEl.value);
    if (!nameValidation.ok) {
      setIdentityModalError(modalRefs, nameValidation.message);
      if (modalRefs.nameInputEl) modalRefs.nameInputEl.focus();
      return;
    }

    const emailValidation = validateEmail(modalRefs.emailInputEl && modalRefs.emailInputEl.value);
    if (!emailValidation.ok) {
      setIdentityModalError(modalRefs, emailValidation.message);
      if (modalRefs.emailInputEl) modalRefs.emailInputEl.focus();
      return;
    }

    nameActionInFlight = true;
    setIdentityModalBusy(modalRefs, true);
    try {
      const currentUser = await getCurrentSupabaseUser();

      const emailAvailability = await isClaimEmailAvailable(emailValidation.normalized, {
        excludeUserId: currentUser && currentUser.id ? currentUser.id : null,
      });
      if (!emailAvailability.ok) {
        setIdentityModalError(
          modalRefs,
          emailAvailability.message || 'Could not verify this email right now. Please try again.'
        );
        return;
      }
      if (!emailAvailability.available) {
        setIdentityModalError(
          modalRefs,
          'This email is already used. Click "Continue your journey" to sign in.'
        );
        return;
      }

      const available = await isDisplayNameAvailable(nameValidation.normalized, {
        excludeUserId: currentUser && currentUser.id ? currentUser.id : null,
      });
      if (!available) {
        setIdentityModalError(modalRefs, 'That name is already claimed.');
        return;
      }

      savePendingAuthAction({
        type: 'claim',
        email: emailValidation.normalized,
        desiredName: nameValidation.normalized,
      });

      const result = await sendMagicLink(emailValidation.normalized);
      if (!result.ok) {
        setIdentityModalError(modalRefs, result.message || 'Could not send magic link right now.');
        return;
      }

      setIdentityModalSuccess(modalRefs, 'Check your email to finish claiming your profile.');
      applyDisplayNameToRuntime(nameValidation.normalized);
    } finally {
      nameActionInFlight = false;
      setIdentityModalBusy(modalRefs, false);
    }
  }

  async function submitContinueFlow(modalRefs) {
    if (!modalRefs || nameActionInFlight) return;

    setIdentityModalError(modalRefs, '');
    setIdentityModalSuccess(modalRefs, '');

    const emailValidation = validateEmail(modalRefs.emailInputEl && modalRefs.emailInputEl.value);
    if (!emailValidation.ok) {
      setIdentityModalError(modalRefs, emailValidation.message);
      if (modalRefs.emailInputEl) modalRefs.emailInputEl.focus();
      return;
    }

    nameActionInFlight = true;
    setIdentityModalBusy(modalRefs, true);
    try {
      savePendingAuthAction({
        type: 'continue',
        email: emailValidation.normalized,
        desiredName: '',
      });
      const result = await sendMagicLink(emailValidation.normalized);
      if (!result.ok) {
        setIdentityModalError(modalRefs, result.message || 'Could not send magic link right now.');
        return;
      }
      setIdentityModalSuccess(modalRefs, 'Check your email to restore your profile on this device.');
    } finally {
      nameActionInFlight = false;
      setIdentityModalBusy(modalRefs, false);
    }
  }

  function openClaimNameModal() {
    const modalRefs = ensureIdentityModalElements('claim');
    if (!modalRefs || !modalRefs.modalEl) return;

    setIdentityModalError(modalRefs, '');
    setIdentityModalSuccess(modalRefs, '');
    setIdentityModalBusy(modalRefs, false);

    if (modalRefs.nameInputEl) {
      modalRefs.nameInputEl.value = normalizeDisplayName(getSavedDisplayName(), '');
    }
    if (modalRefs.emailInputEl) {
      modalRefs.emailInputEl.value = '';
    }

    const onClose = () => closeIdentityModal(modalRefs.modalEl);
    if (modalRefs.backdropEl) modalRefs.backdropEl.onclick = onClose;
    if (modalRefs.closeBtnEl) modalRefs.closeBtnEl.onclick = onClose;
    if (modalRefs.cancelBtnEl) modalRefs.cancelBtnEl.onclick = onClose;
    if (modalRefs.submitBtnEl) modalRefs.submitBtnEl.onclick = () => submitClaimFlow(modalRefs);
    if (modalRefs.nameInputEl) {
      modalRefs.nameInputEl.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitClaimFlow(modalRefs);
        }
      };
    }
    if (modalRefs.emailInputEl) {
      modalRefs.emailInputEl.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitClaimFlow(modalRefs);
        }
      };
    }
    modalRefs.modalEl.onkeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    openIdentityModal(modalRefs);
    if (modalRefs.nameInputEl) {
      modalRefs.nameInputEl.focus();
      modalRefs.nameInputEl.select();
    }
  }

  function openContinueJourneyModal() {
    const modalRefs = ensureIdentityModalElements('continue');
    if (!modalRefs || !modalRefs.modalEl) return;

    setIdentityModalError(modalRefs, '');
    setIdentityModalSuccess(modalRefs, '');
    setIdentityModalBusy(modalRefs, false);
    if (modalRefs.emailInputEl) modalRefs.emailInputEl.value = '';

    const onClose = () => closeIdentityModal(modalRefs.modalEl);
    if (modalRefs.backdropEl) modalRefs.backdropEl.onclick = onClose;
    if (modalRefs.closeBtnEl) modalRefs.closeBtnEl.onclick = onClose;
    if (modalRefs.cancelBtnEl) modalRefs.cancelBtnEl.onclick = onClose;
    if (modalRefs.submitBtnEl) modalRefs.submitBtnEl.onclick = () => submitContinueFlow(modalRefs);
    if (modalRefs.emailInputEl) {
      modalRefs.emailInputEl.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitContinueFlow(modalRefs);
        }
      };
    }
    modalRefs.modalEl.onkeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    openIdentityModal(modalRefs);
    if (modalRefs.emailInputEl) {
      modalRefs.emailInputEl.focus();
      modalRefs.emailInputEl.select();
    }
  }

  function refreshIdentityUiState(options = {}) {
    const identityEls = getIdentityElements();
    const isAuthenticated = typeof options.isAuthenticated === 'boolean'
      ? options.isAuthenticated
      : (Boolean(lastAuthUserId) && !lastAuthIsAnonymous);
    const displayName = normalizeDisplayName(options.displayName, getSavedDisplayName());

    if (identityEls.nameInputEl && document.activeElement !== identityEls.nameInputEl) {
      identityEls.nameInputEl.value = displayName;
      identityEls.nameInputEl.readOnly = true;
    }

    if (identityEls.guestBlockEl) {
      identityEls.guestBlockEl.hidden = isAuthenticated;
    }
    if (identityEls.actionGroupEl) {
      identityEls.actionGroupEl.hidden = isAuthenticated;
    }
    if (identityEls.signedInBlockEl) {
      identityEls.signedInBlockEl.hidden = !isAuthenticated;
    }
    if (identityEls.signedInTextEl) {
      identityEls.signedInTextEl.textContent = isAuthenticated
        ? `Signed in as ${displayName}`
        : '';
    }
    if (identityEls.signOutBtnEl) {
      identityEls.signOutBtnEl.hidden = !isAuthenticated;
      identityEls.signOutBtnEl.disabled = !isAuthenticated || nameActionInFlight;
    }
  }

  function bindIdentityUi() {
    if (identityUiBound) return;
    const identityEls = getIdentityElements();
    if (!identityEls.nameInputEl) return;

    identityUiBound = true;
    identityEls.nameInputEl.readOnly = true;

    if (identityEls.claimBtnEl) {
      identityEls.claimBtnEl.addEventListener('click', () => {
        if (nameActionInFlight) return;
        openClaimNameModal();
      });
    }
    if (identityEls.continueBtnEl) {
      identityEls.continueBtnEl.addEventListener('click', () => {
        if (nameActionInFlight) return;
        openContinueJourneyModal();
      });
    }
    if (identityEls.signOutBtnEl) {
      identityEls.signOutBtnEl.addEventListener('click', async () => {
        if (nameActionInFlight) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;
        nameActionInFlight = true;
        refreshIdentityUiState();
        try {
          const { error } = await supabase.auth.signOut();
          if (error) {
            console.error(`${LOG_PREFIX} signOut failed:`, error);
            window.alert('Unable to sign out right now. Please try again.');
            return;
          }
          clearPendingAuthAction();
          applyDisplayNameToRuntime(generateTemporaryPlayerName());
          await refreshAuthBackedProfile({ reason: 'manual_sign_out' });
        } finally {
          nameActionInFlight = false;
          refreshIdentityUiState();
        }
      });
    }

    refreshIdentityUiState();
  }

  async function ensurePlayerProfileForUser(user, options = {}) {
    if (!user || !user.id) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const preferredDisplayName = normalizeDisplayName(options.preferredDisplayName, '');
    const syncDisplayName = options.syncDisplayName === true;
    let profileRow = await loadPlayerProfile(user.id);
    if (!profileRow) {
      profileRow = await createPlayerProfile(user.id, {
        displayName: preferredDisplayName || getSavedDisplayName(),
      });
      return profileRow;
    }

    if (!syncDisplayName || !preferredDisplayName) {
      return profileRow;
    }

    const currentName = normalizeDisplayName(profileRow.display_name, '');
    if (currentName.toLowerCase() === preferredDisplayName.toLowerCase()) {
      return profileRow;
    }

    const { data, error } = await supabase
      .from('player_profiles')
      .update({
        display_name: preferredDisplayName,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .select()
      .single();
    if (error) {
      console.error(`${LOG_PREFIX} ensurePlayerProfileForUser display_name sync failed:`, error);
      return profileRow;
    }
    return data || profileRow;
  }

  async function refreshAuthBackedProfile(options = {}) {
    if (authRefreshInFlight && !options.force) {
      return authRefreshInFlight;
    }

    authRefreshInFlight = (async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        console.warn(`${LOG_PREFIX} Supabase unavailable, continuing with local profile only.`);
        const localName = normalizeDisplayName(getSavedDisplayName(), 'Traveler');
        applyDisplayNameToRuntime(localName);
        lastAuthUserId = '';
        lastAuthIsAnonymous = true;
        refreshIdentityUiState({ isAuthenticated: false, displayName: localName });
        return null;
      }

      let user = await getCurrentSupabaseUser();
      if (!user) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
          console.error(`${LOG_PREFIX} Anonymous sign-in failed:`, error);
          const localName = normalizeDisplayName(getSavedDisplayName(), 'Traveler');
          applyDisplayNameToRuntime(localName);
          lastAuthUserId = '';
          lastAuthIsAnonymous = true;
          refreshIdentityUiState({ isAuthenticated: false, displayName: localName });
          return null;
        }
        user = data && data.user ? data.user : await getCurrentSupabaseUser();
      }

      if (!user || !user.id) {
        console.error(`${LOG_PREFIX} No user after auth refresh`);
        const localName = normalizeDisplayName(getSavedDisplayName(), 'Traveler');
        applyDisplayNameToRuntime(localName);
        lastAuthUserId = '';
        lastAuthIsAnonymous = true;
        refreshIdentityUiState({ isAuthenticated: false, displayName: localName });
        return null;
      }

      const authenticated = isAuthenticatedUser(user);
      const pendingAction = authenticated ? loadPendingAuthAction() : null;
      const existingPlayerProfile = await loadPlayerProfile(user.id);
      const existingPlayerProfileName = normalizeDisplayName(existingPlayerProfile && existingPlayerProfile.display_name, '');
      const fallbackDisplayName = normalizeDisplayName(
        existingPlayerProfileName || getSavedDisplayName(),
        generateTemporaryPlayerName()
      );
      let identityProfile = null;
      if (authenticated) {
        identityProfile = await upsertIdentityProfile(user, {
          pendingAction,
          claimDisplayName: options.claimDisplayName || '',
          fallbackDisplayName,
          existingPlayerProfileName,
        });
      }

      const preferredDisplayName = normalizeDisplayName(
        (identityProfile && identityProfile.display_name) || fallbackDisplayName,
        fallbackDisplayName
      );
      const profileRow = await ensurePlayerProfileForUser(user, {
        preferredDisplayName,
        syncDisplayName: authenticated,
      });
      if (!profileRow) {
        console.error(`${LOG_PREFIX} Failed to initialize player profile for user ${user.id}`);
        refreshIdentityUiState({ isAuthenticated: authenticated, displayName: preferredDisplayName });
        return null;
      }

      syncRuntimeFromSupabaseProfile(profileRow);
      refreshPlayerCurrencyUI();

      // Leaderboard bootstrap policy:
      // 1) Claimed account (authenticated) -> create/update leaderboard row on login.
      // 2) Guest (anonymous) -> do NOT auto-insert row on boot; first match result creates it.
      if (authenticated) {
        const leaderboardProfile = await ensureLeaderboardProfile({
          userId: user.id,
          displayName: normalizeDisplayName(profileRow.display_name, preferredDisplayName),
        });
        if (!leaderboardProfile) {
          console.warn(`${LOG_PREFIX} refreshAuthBackedProfile: leaderboard profile bootstrap failed`);
        }
      }

      if (authenticated && pendingAction) {
        clearPendingAuthAction();
      }

      lastAuthUserId = trimString(user.id);
      lastAuthIsAnonymous = !authenticated;
      refreshIdentityUiState({
        isAuthenticated: authenticated,
        displayName: normalizeDisplayName(profileRow.display_name, preferredDisplayName),
      });
      return profileRow;
    })();

    try {
      return await authRefreshInFlight;
    } finally {
      authRefreshInFlight = null;
    }
  }

  function bindAuthStateSubscription() {
    if (authStateSubscriptionBound) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    authStateSubscriptionBound = true;
    const { data } = supabase.auth.onAuthStateChange((event, _session) => {
      if (!event) return;
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        refreshAuthBackedProfile({ reason: event }).catch((error) => {
          console.error(`${LOG_PREFIX} auth state refresh failed:`, error);
        });
      }
    });
    authStateSubscription = data && data.subscription ? data.subscription : null;
  }

  async function initPlayer() {
    if (initPromise) return initPromise;

    // Anonymous auth keeps guest flow frictionless; magic links upgrade to persistent identity.
    initPromise = (async () => {
      bindIdentityUi();
      bindAuthStateSubscription();
      const profileRow = await refreshAuthBackedProfile({ reason: 'boot' });
      setNameInputValue(getSavedDisplayName());
      return profileRow;
    })();

    return initPromise;
  }

  global.outraPlayerService = {
    getCurrentSupabaseUser,
    initPlayer,
    loadPlayerProfile,
    createPlayerProfile,
    updatePlayerRank,
    updatePlayerDisplayName,
    loadLeaderboardProfile,
    ensureLeaderboardProfile,
    updateLeaderboardDisplayName,
    fetchLeaderboard,
    applyLeaderboardMatchResult,
    awardOut,
    refreshPlayerCurrencyUI,
    syncRuntimeFromSupabaseProfile,
    syncRuntimeFromLeaderboardProfile,
    generateTemporaryPlayerName,
    openClaimNameModal,
    openContinueJourneyModal,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindIdentityUi();
      setNameInputValue(getSavedDisplayName());
    }, { once: true });
  } else {
    bindIdentityUi();
    setNameInputValue(getSavedDisplayName());
  }
})(window);
