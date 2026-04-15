// Minimal reusable multiplayer socket connector.
(function () {
  const LOG_PREFIX = '[multiplayer]';
  const LOCAL_SERVER_URL = 'http://localhost:3001';
  const ROOM_STATE_IDLE = 'idle';
  const ROOM_STATE_OFFLINE = 'offline';
  const ROOM_STATE_WAITING = 'waiting';
  const ROOM_STATE_READY_CHECK = 'ready_check';
  const ROOM_STATE_DRAFT = 'draft';
  const ROOM_STATE_COMBAT = 'combat';
  const ROOM_STATE_MATCH_END = 'match_end';
  const ROOM_STATE_STARTING = 'starting';
  const ROOM_STATE_IN_MATCH = 'in_match';
  const MATCH_PHASE_DRAFT = 'draft';
  const MATCH_PHASE_COMBAT_COUNTDOWN = 'combat_countdown';
  const DEFAULT_MATCH_PHASE = 'combat';
  const MATCH_PHASE_END = 'match_end';
  const READY_TOGGLE_ACK_TIMEOUT_MS = 2200;
  const INPUT_SEND_INTERVAL_MS = 50;
  const CLIENT_CAST_REQUEST_COALESCE_MS = 180;
  const CLIENT_DRAFT_REQUEST_COALESCE_MS = 150;
  const QUICK_MATCH_HEARTBEAT_MS = 3500;
  const RECONNECT_STORAGE_KEY = 'outra_multiplayer_reconnect_v1';
  const QUICK_MATCH_STATUS_IDLE = 'idle';
  const QUICK_MATCH_STATUS_SEARCHING = 'searching';
  const QUICK_MATCH_STATUS_MATCHED = 'matched';
  const KNOWN_ROOM_STATES = new Set([
    ROOM_STATE_IDLE,
    ROOM_STATE_OFFLINE,
    ROOM_STATE_WAITING,
    ROOM_STATE_READY_CHECK,
    ROOM_STATE_DRAFT,
    ROOM_STATE_COMBAT,
    ROOM_STATE_MATCH_END,
    ROOM_STATE_STARTING,
    ROOM_STATE_IN_MATCH
  ]);
  const DRAFT_SPELL_LIST = ['charge', 'shock', 'gust', 'wall', 'rewind', 'shield', 'hook', 'blink'];
  const ABILITY_IDS = Object.freeze({
    FIREBLAST: 'fireblast',
    BLINK: 'blink',
    SHIELD: 'shield',
    GUST: 'gust',
    CHARGE: 'charge',
    SHOCK: 'shock',
    HOOK: 'hook',
    WALL: 'wall',
    REWIND: 'rewind'
  });
  const ABILITY_DISPLAY_NAMES = Object.freeze({
    fireblast: 'Fireblast',
    blink: 'Blink',
    shield: 'Shield',
    gust: 'Gust',
    charge: 'Charge',
    shock: 'Shock',
    wall: 'Wall',
    rewind: 'Rewind',
    hook: 'Hook'
  });
  const ABILITY_TO_UI_SPELL_ID = Object.freeze({
    fireblast: 'fire',
    blink: 'blink',
    shield: 'shield',
    gust: 'gust',
    charge: 'charge',
    shock: 'shock',
    wall: 'wall',
    rewind: 'rewind',
    hook: 'hook'
  });
  const ABILITY_HUD_SLOTS = Object.freeze([
    Object.freeze({ key: 'Space', slotType: 'base', fixedAbilityId: ABILITY_IDS.FIREBLAST }),
    Object.freeze({ key: 'Q', slotType: 'drafted', draftedIndex: 0 }),
    Object.freeze({ key: 'E', slotType: 'drafted', draftedIndex: 1 }),
    Object.freeze({ key: 'R', slotType: 'drafted', draftedIndex: 2 })
  ]);
  const MOVEMENT_KEY_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
  const AIM_KEY_CODES = new Set(['KeyI', 'KeyJ', 'KeyK', 'KeyL']);
  const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

  let socket = null;
  let roomHandlersBound = false;
  let panel = null;
  let panelToggleButton = null;
  let abilityHud = null;
  let abilityHudSlots = [];
  let abilityStateBar = null;
  let abilityStateCharge = null;
  let abilityStateHook = null;
  let abilityStateWall = null;
  let gameplayUiRoot = null;
  let gameplayDraftPanel = null;
  let gameplayDraftPool = null;
  let gameplayDraftHeader = null;
  let gameplayDraftTurn = null;
  let gameplayDraftTimer = null;
  let gameplayDraftMyPicks = null;
  let gameplayDraftOppPicks = null;
  let gameplayDraftButtons = new Map();
  let gameplayEndPanel = null;
  let gameplayEndTitle = null;
  let gameplayEndSub = null;
  let gameplayReturnBtn = null;
  let gameplayRematchBtn = null;
  let gameplayLeaveBtn = null;
  let gameplayCountdownEl = null;
  let gameplayRoomBadge = null;
  let phaseBannerEl = null;
  let phaseBannerState = { text: '', shownAt: 0, durationMs: 1400 };
  let phaseBannerHideTimer = null;
  let matchEndPanelRevealAt = 0;
  let panelFields = null;
  let panelInput = null;
  let isDebugVisible = false;
  let draftButtonElements = new Map();
  let readyToggleAckTimer = null;
  let movementInputTimer = null;
  let keyboardHandlersBound = false;
  const pressedMovementKeys = new Set();
  const pressedAimKeys = new Set();
  let lastSentInput = { x: 0, y: 0 };
  let lastSentAim = { x: 0, y: 0 };
  let reconnectAttemptInFlight = false;
  let reconnectAttemptedForCurrentSocket = false;
  let reconnectUiTimer = null;
  let clientActionSequence = 0;
  const pendingAbilityRequests = new Map();
  let pendingDraftRequestAt = 0;
  let tuningSnapshot = null;
  let tuningIdentitySnapshot = null;
  let tuningUpdatedAt = null;
  let roomSnapshot = createInitialRoomSnapshot();
  let runtimeSnapshotCache = null;
  let quickMatchSnapshot = createInitialQuickMatchSnapshot();
  let quickMatchHeartbeatTimer = null;
  let quickMatchHeartbeatLastAt = 0;

  function createInitialRoomSnapshot(state = ROOM_STATE_IDLE) {
    return {
      code: '',
      playerCount: 0,
      state,
      slot: null,
      selfReady: false,
      selfConnected: false,
      players: [],
      connectedPlayerCount: 0,
      reconnectInfo: {
        graceMs: 0,
        disconnectedPlayers: []
      },
      matchId: '',
      matchPhase: '',
      matchPaused: false,
      matchPauseReason: '',
      matchPausedByPlayerNumber: null,
      matchPausedAt: null,
      combatStartsAt: null,
      combatCountdownSeconds: 0,
      combatCountdownRemainingMs: 0,
      matchStartedAt: null,
      matchEndedAt: null,
      eliminatedPlayerNumber: null,
      winnerPlayerNumber: null,
      myMatchPlayerNumber: null,
      mySpawnPosition: null,
      opponentSpawnPosition: null,
      myPosition: null,
      opponentPosition: null,
      myVelocity: null,
      opponentVelocity: null,
      myAimDirection: null,
      opponentAimDirection: null,
      myLoadout: [],
      opponentLoadout: [],
      myDraftedLoadout: [],
      opponentDraftedLoadout: [],
      myAbilityCooldowns: {},
      myAbilityReadyAt: {},
      myActiveEffects: {
        shieldUntil: 0,
        shieldRemainingMs: 0,
        shieldActive: false,
        chargeActive: false,
        chargeRemainingDistance: 0,
        chargeDirection: null
      },
      opponentActiveEffects: {
        shieldUntil: 0,
        shieldRemainingMs: 0,
        shieldActive: false,
        chargeActive: false,
        chargeRemainingDistance: 0,
        chargeDirection: null
      },
      myBlinkReadyAt: 0,
      myBlinkRemainingMs: 0,
      myBlinkAvailable: false,
      myHasBlink: false,
      matchStateTimestamp: null,
      projectiles: [],
      projectileCount: 0,
      walls: [],
      wallCount: 0,
      hitEvents: [],
      lastHitEvent: null,
      matchResult: '',
      draft: {
        status: '',
        currentTurnIndex: 0,
        currentTurnPlayerNumber: null,
        turnDurationMs: 0,
        turnStartedAt: null,
        turnEndsAt: null,
        turnRemainingMs: 0,
        turnOrder: [],
        pool: {},
        picksByPlayerNumber: {
          1: [],
          2: []
        }
      },
      reconnectToken: '',
      reconnectPlayerId: '',
      spawnPositions: {
        player1: null,
        player2: null
      },
      arenaBoundary: {
        type: 'circle',
        center: { x: 0, y: 0 },
        radius: 12
      }
    };
  }

  function createInitialQuickMatchSnapshot() {
    return {
      status: QUICK_MATCH_STATUS_IDLE,
      queueDepth: 0,
      queuedAt: 0,
      roomCode: '',
      reason: '',
      message: '',
      updatedAt: Date.now()
    };
  }

  function invalidateRuntimeSnapshotCache() {
    runtimeSnapshotCache = null;
  }

  function trimString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function parseNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function supportsLocalStorage() {
    try {
      return typeof window.localStorage !== 'undefined';
    } catch (_error) {
      return false;
    }
  }

  function loadReconnectIdentity() {
    if (!supportsLocalStorage()) return null;
    try {
      const rawValue = window.localStorage.getItem(RECONNECT_STORAGE_KEY);
      if (!rawValue) return null;
      const parsed = JSON.parse(rawValue);
      const roomCode = normalizeRoomCode(parsed?.roomCode);
      const reconnectToken = trimString(parsed?.reconnectToken);
      if (!roomCode || !reconnectToken) return null;
      return {
        roomCode,
        reconnectToken,
        reconnectPlayerId: trimString(parsed?.reconnectPlayerId),
        savedAt: parseNumber(parsed?.savedAt) || Date.now()
      };
    } catch (_error) {
      return null;
    }
  }

  function saveReconnectIdentity(roomCode, reconnectToken, reconnectPlayerId = '') {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const normalizedToken = trimString(reconnectToken);
    if (!normalizedRoomCode || !normalizedToken || !supportsLocalStorage()) return;
    try {
      window.localStorage.setItem(RECONNECT_STORAGE_KEY, JSON.stringify({
        roomCode: normalizedRoomCode,
        reconnectToken: normalizedToken,
        reconnectPlayerId: trimString(reconnectPlayerId),
        savedAt: Date.now()
      }));
    } catch (_error) {
      // Ignore storage write failures in hardened browser contexts.
    }
  }

  function clearReconnectIdentity() {
    if (!supportsLocalStorage()) return;
    try {
      window.localStorage.removeItem(RECONNECT_STORAGE_KEY);
    } catch (_error) {
      // Ignore storage removal failures.
    }
  }

  function normalizeMovementInput(input) {
    const xValue = parseNumber(input?.x);
    const yValue = parseNumber(input?.y);
    const x = xValue === null ? 0 : clamp(xValue, -1, 1);
    const y = yValue === null ? 0 : clamp(yValue, -1, 1);
    const magnitude = Math.hypot(x, y);
    if (magnitude <= 0) return { x: 0, y: 0 };
    if (magnitude <= 1) return { x, y };
    return {
      x: x / magnitude,
      y: y / magnitude
    };
  }

  function normalizeDirectionInput(input) {
    const xValue = parseNumber(input?.x);
    const yValue = parseNumber(input?.y);
    const x = xValue === null ? 0 : xValue;
    const y = yValue === null ? 0 : yValue;
    const magnitude = Math.hypot(x, y);
    if (magnitude <= 0.000001) return { x: 0, y: 0 };
    return {
      x: x / magnitude,
      y: y / magnitude
    };
  }

  function movementInputEquals(inputA, inputB) {
    if (!inputA || !inputB) return false;
    return inputA.x === inputB.x && inputA.y === inputB.y;
  }

  function compactSocketId(value) {
    const text = trimString(value);
    if (!text) return 'unknown';
    if (text.length <= 10) return text;
    return `${text.slice(0, 4)}...${text.slice(-4)}`;
  }

  function normalizeRoomCode(value) {
    return trimString(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function normalizeRoomState(value, fallback = ROOM_STATE_IDLE) {
    const normalized = trimString(value).toLowerCase();
    if (!normalized) return fallback;
    if (KNOWN_ROOM_STATES.has(normalized)) return normalized;
    return normalized;
  }

  function normalizeQuickMatchStatus(value, fallback = QUICK_MATCH_STATUS_IDLE) {
    const normalized = trimString(value).toLowerCase();
    if (!normalized) return fallback;
    if (
      normalized === QUICK_MATCH_STATUS_IDLE
      || normalized === QUICK_MATCH_STATUS_SEARCHING
      || normalized === QUICK_MATCH_STATUS_MATCHED
    ) {
      return normalized;
    }
    return fallback;
  }

  function emitQuickMatchStateChange() {
    try {
      window.dispatchEvent(new CustomEvent('outra:quickmatch-state', {
        detail: {
          ...quickMatchSnapshot
        }
      }));
    } catch (_error) {
      // Ignore environments without CustomEvent support.
    }
  }

  function updateQuickMatchState(nextState = {}, options = {}) {
    const source = nextState && typeof nextState === 'object' ? nextState : {};
    const previousStatus = quickMatchSnapshot.status;

    const nextStatus = normalizeQuickMatchStatus(
      source.status,
      quickMatchSnapshot.status || QUICK_MATCH_STATUS_IDLE
    );
    const nextQueueDepth = Math.max(
      0,
      parseNumber(source.queueDepth) || 0
    );
    const nextQueuedAt = Math.max(
      0,
      parseNumber(source.queuedAt) || 0
    );
    const nextRoomCode = normalizeRoomCode(source.roomCode || '');
    const nextReason = trimString(source.reason || '');
    const nextMessage = trimString(source.message || '');

    quickMatchSnapshot = {
      status: nextStatus,
      queueDepth: nextQueueDepth,
      queuedAt: nextQueuedAt,
      roomCode: nextRoomCode,
      reason: nextReason,
      message: nextMessage,
      updatedAt: Date.now()
    };

    if (nextStatus !== QUICK_MATCH_STATUS_SEARCHING) {
      quickMatchHeartbeatLastAt = 0;
    }

    if (Boolean(options.log)) {
      const logRoom = nextRoomCode ? ` room=${nextRoomCode}` : '';
      const logReason = nextReason ? ` reason=${nextReason}` : '';
      console.info(`${LOG_PREFIX} quick_match_state ${previousStatus} -> ${nextStatus}${logRoom}${logReason}`);
    }

    emitQuickMatchStateChange();
  }

  function shouldHeartbeatQuickMatch() {
    if (!socket || socket.connected !== true) return false;
    if (quickMatchSnapshot.status !== QUICK_MATCH_STATUS_SEARCHING) return false;
    if (trimString(roomSnapshot.code)) return false;
    return true;
  }

  function startQuickMatchHeartbeatLoop() {
    if (quickMatchHeartbeatTimer !== null) return;
    quickMatchHeartbeatTimer = window.setInterval(() => {
      if (!shouldHeartbeatQuickMatch()) return;
      const now = Date.now();
      if ((now - quickMatchHeartbeatLastAt) < QUICK_MATCH_HEARTBEAT_MS) return;
      quickMatchHeartbeatLastAt = now;
      try {
        socket.emit('queue_quick_match');
      } catch (_error) {
        // Socket may have dropped between interval checks; next tick will recover.
      }
    }, QUICK_MATCH_HEARTBEAT_MS);
  }

  function stopQuickMatchHeartbeatLoop() {
    if (quickMatchHeartbeatTimer === null) return;
    window.clearInterval(quickMatchHeartbeatTimer);
    quickMatchHeartbeatTimer = null;
  }

  function createClientActionId(prefix = 'action') {
    clientActionSequence += 1;
    const seq = clientActionSequence.toString(36);
    const time = Date.now().toString(36);
    return `${prefix}-${time}-${seq}`;
  }

  function clearPendingActionRequests() {
    pendingAbilityRequests.clear();
    pendingDraftRequestAt = 0;
  }

  function resetRealtimeInputState(options = {}) {
    const emitNeutral = Boolean(options.emitNeutral);
    pressedMovementKeys.clear();
    pressedAimKeys.clear();
    lastSentInput = { x: 0, y: 0 };
    lastSentAim = { x: 0, y: 0 };
    clearPendingActionRequests();

    if (emitNeutral && socket?.connected) {
      socket.emit('player_input', { x: 0, y: 0 });
    }
  }

  function isRoomInMatchFlow(stateValue) {
    const normalized = normalizeRoomState(stateValue, ROOM_STATE_IDLE);
    return normalized === ROOM_STATE_IN_MATCH
      || normalized === ROOM_STATE_DRAFT
      || normalized === ROOM_STATE_COMBAT
      || normalized === ROOM_STATE_MATCH_END;
  }

  function normalizePosition(value) {
    if (!value || typeof value !== 'object') return null;
    const x = parseNumber(value.x);
    const y = parseNumber(value.y);
    if (x === null || y === null) return null;
    return { x, y };
  }

  function normalizeArenaBoundary(value) {
    const source = value && typeof value === 'object' ? value : null;
    const center = normalizePosition(source?.center) || { x: 0, y: 0 };
    const radiusValue = parseNumber(source?.radius);
    const radius = radiusValue === null ? 12 : Math.max(0.1, radiusValue);
    return {
      type: 'circle',
      center,
      radius
    };
  }

  function resolveSpawnPositions(match, payloadSpawnPositions) {
    const fromPayload = payloadSpawnPositions && typeof payloadSpawnPositions === 'object'
      ? payloadSpawnPositions
      : null;
    const fromMatch = match && typeof match === 'object' ? match.spawnPositions : null;
    const fromMatchPlayers = Array.isArray(match?.players) ? match.players : [];
    const fromMatchPlayerOne = fromMatchPlayers.find((entry) => Number(entry?.matchPlayerNumber) === 1)?.spawn;
    const fromMatchPlayerTwo = fromMatchPlayers.find((entry) => Number(entry?.matchPlayerNumber) === 2)?.spawn;

    return {
      player1: normalizePosition(fromPayload?.player1) || normalizePosition(fromMatch?.player1) || normalizePosition(fromMatchPlayerOne),
      player2: normalizePosition(fromPayload?.player2) || normalizePosition(fromMatch?.player2) || normalizePosition(fromMatchPlayerTwo)
    };
  }

  function formatPosition(position) {
    if (!position) return '-';
    return `(${position.x.toFixed(2)}, ${position.y.toFixed(2)})`;
  }

  function formatStartedAt(timestamp) {
    if (!Number.isFinite(timestamp)) return '-';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  }

  function formatSpawnPositions(spawnPositions) {
    return `P1 ${formatPosition(spawnPositions?.player1)} | P2 ${formatPosition(spawnPositions?.player2)}`;
  }

  function formatHitEvent(hitEvent) {
    if (!hitEvent) return 'none';
    const source = Number.isFinite(hitEvent.sourcePlayerNumber) ? hitEvent.sourcePlayerNumber : '?';
    const target = Number.isFinite(hitEvent.targetPlayerNumber) ? hitEvent.targetPlayerNumber : '?';
    const type = trimString(hitEvent.type) || 'hit';
    const abilityLabel = toAbilityLabel(hitEvent.abilityId || '');
    const time = Number.isFinite(hitEvent.timestamp)
      ? new Date(hitEvent.timestamp).toLocaleTimeString()
      : '--:--:--';
    if (type === 'shield_block') {
      return `${abilityLabel} block: P${target} vs P${source} @ ${time}`;
    }
    return `${abilityLabel} ${type}: P${source} -> P${target} @ ${time}`;
  }

  function formatDurationMs(value) {
    const milliseconds = Math.max(0, Number(value) || 0);
    const totalSeconds = Math.ceil(milliseconds / 1000);
    return `${totalSeconds}s`;
  }

  function getDisconnectedPlayers() {
    const disconnectedFromSnapshot = Array.isArray(roomSnapshot.reconnectInfo?.disconnectedPlayers)
      ? roomSnapshot.reconnectInfo.disconnectedPlayers
      : [];
    if (disconnectedFromSnapshot.length > 0) return disconnectedFromSnapshot;

    return (Array.isArray(roomSnapshot.players) ? roomSnapshot.players : [])
      .filter((player) => player.connected === false)
      .map((player) => ({
        playerId: trimString(player.playerId),
        slot: Number(player.slot) || null,
        matchPlayerNumber: Number(player.matchPlayerNumber) || null,
        disconnectedAt: parseNumber(player.disconnectedAt),
        reconnectGraceExpiresAt: parseNumber(player.reconnectGraceExpiresAt),
        remainingMs: parseNumber(player.reconnectGraceRemainingMs) || 0
      }));
  }

  function getReconnectSummaryText() {
    const disconnectedPlayers = getDisconnectedPlayers();
    if (!disconnectedPlayers.length) return 'none';
    return disconnectedPlayers
      .map((entry) => {
        const playerNumber = Number(entry.matchPlayerNumber) || Number(entry.slot) || '?';
        const remainingMs = parseNumber(entry.remainingMs)
          ?? (() => {
            const expiresAt = parseNumber(entry.reconnectGraceExpiresAt);
            if (expiresAt === null) return 0;
            return Math.max(0, expiresAt - Date.now());
          })();
        return `P${playerNumber} (${formatDurationMs(remainingMs)} left)`;
      })
      .join(', ');
  }

  function formatSpellList(spells) {
    const normalized = Array.isArray(spells)
      ? spells.map((spell) => trimString(spell)).filter(Boolean)
      : [];
    return normalized.length ? normalized.join(', ') : '-';
  }

  function formatTuningSnapshotSummary() {
    if (!tuningSnapshot || typeof tuningSnapshot !== 'object') return 'No tuning snapshot loaded.';
    const lines = [];
    Object.keys(tuningSnapshot).forEach((abilityId) => {
      const entry = tuningSnapshot[abilityId];
      if (!entry || typeof entry !== 'object') return;
      const cooldownMs = parseNumber(entry.cooldownMs) || 0;
      const castDelayMs = parseNumber(entry.castDelayMs) || 0;
      const role = trimString(entry.role || tuningIdentitySnapshot?.[abilityId]?.role || 'utility');
      lines.push(`${abilityId}: cd=${cooldownMs}ms delay=${castDelayMs}ms role=${role || 'utility'}`);
    });
    if (!lines.length) return 'No spell tuning data.';
    return lines.join(' | ');
  }

  function requestTuningSnapshot(options = {}) {
    const silent = Boolean(options.silent);
    const requested = emitWhenConnected(
      'tuning_get',
      undefined,
      silent ? '' : 'Requesting tuning snapshot...',
      (response) => {
        if (!response || response.ok === false) {
          if (!silent) {
            const message = trimString(response?.message) || 'Unable to load tuning snapshot.';
            setStatusMessage(message);
          }
          return;
        }
        tuningSnapshot = response.tuning && typeof response.tuning === 'object' ? response.tuning : {};
        tuningIdentitySnapshot = response.identity && typeof response.identity === 'object' ? response.identity : {};
        tuningUpdatedAt = parseNumber(response.updatedAt) || Date.now();
        if (!silent) {
          setStatusMessage('Tuning snapshot loaded.');
          console.info(`${LOG_PREFIX} tuning snapshot`, tuningSnapshot);
        }
        renderDebugPanel();
      }
    );
    if (!requested && !silent) {
      setStatusMessage('Unable to request tuning snapshot.');
    }
  }

  function setTuningOverrideFromDebug() {
    if (!panelFields?.tuneAbilityInput || !panelFields?.tuneKeyInput || !panelFields?.tuneValueInput) {
      return;
    }
    const abilityId = trimString(panelFields.tuneAbilityInput.value).toLowerCase();
    const key = trimString(panelFields.tuneKeyInput.value);
    const valueRaw = trimString(panelFields.tuneValueInput.value);
    if (!abilityId || !key || !valueRaw) {
      setStatusMessage('Tune set requires ability, field, and value.');
      return;
    }
    const parsedNumericValue = parseNumber(valueRaw);
    const value = parsedNumericValue === null ? valueRaw : parsedNumericValue;
    const requested = emitWhenConnected(
      'tuning_set',
      { abilityId, field: key, value },
      'Applying tuning override...',
      (response) => {
        if (!response || response.ok === false) {
          const message = trimString(response?.message) || 'Tuning override failed.';
          setStatusMessage(message);
          return;
        }
        tuningSnapshot = response.allTuning && typeof response.allTuning === 'object'
          ? response.allTuning
          : (response.tuning && typeof response.tuning === 'object' ? { ...tuningSnapshot, [abilityId]: response.tuning } : tuningSnapshot);
        tuningIdentitySnapshot = response.identity && typeof response.identity === 'object' ? response.identity : tuningIdentitySnapshot;
        tuningUpdatedAt = parseNumber(response.updatedAt) || Date.now();
        setStatusMessage(`Tuning updated: ${abilityId}.${key}=${value}`);
        renderDebugPanel();
      }
    );
    if (!requested) return;
    console.info(`${LOG_PREFIX} tuning_set requested`, { abilityId, key, value });
  }

  function resetTuningOverrideFromDebug() {
    if (!panelFields?.tuneAbilityInput) return;
    const abilityId = trimString(panelFields.tuneAbilityInput.value).toLowerCase() || 'all';
    const requested = emitWhenConnected(
      'tuning_reset',
      { abilityId },
      'Resetting tuning override...',
      (response) => {
        if (!response || response.ok === false) {
          const message = trimString(response?.message) || 'Tuning reset failed.';
          setStatusMessage(message);
          return;
        }
        tuningSnapshot = response.allTuning && typeof response.allTuning === 'object' ? response.allTuning : tuningSnapshot;
        tuningIdentitySnapshot = response.identity && typeof response.identity === 'object' ? response.identity : tuningIdentitySnapshot;
        tuningUpdatedAt = parseNumber(response.updatedAt) || Date.now();
        setStatusMessage(`Tuning reset: ${response.reset || abilityId}`);
        renderDebugPanel();
      }
    );
    if (!requested) return;
    console.info(`${LOG_PREFIX} tuning_reset requested`, { abilityId });
  }

  function normalizeSpellList(spells) {
    return Array.isArray(spells)
      ? spells.map((spell) => trimString(spell).toLowerCase()).filter(Boolean)
      : [];
  }

  function toAbilityLabel(abilityId) {
    const normalized = trimString(abilityId).toLowerCase();
    if (!normalized) return 'Empty';
    return ABILITY_DISPLAY_NAMES[normalized] || normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function toUiSpellId(abilityId) {
    const normalized = trimString(abilityId).toLowerCase();
    if (!normalized) return '';
    return ABILITY_TO_UI_SPELL_ID[normalized] || normalized;
  }

  function toDraftPlayerId(matchPlayerNumber) {
    return Number(matchPlayerNumber) === 2 ? 'B' : 'A';
  }

  function getDraftedLoadout(loadout) {
    const normalized = normalizeSpellList(loadout);
    return normalized.filter((spellId) => spellId !== ABILITY_IDS.FIREBLAST).slice(0, 3);
  }

  function buildMultiplayerPresentationSnapshot() {
    const hasRoom = Boolean(roomSnapshot.code);
    const roomState = trimString(roomSnapshot.state);
    const matchPhase = trimString(roomSnapshot.matchPhase);
    const draftStatus = trimString(roomSnapshot.draft?.status).toLowerCase();
    let isDraftActive = hasRoom && (
      matchPhase === MATCH_PHASE_DRAFT
      || roomState === ROOM_STATE_DRAFT
      || draftStatus === 'draft'
      || draftStatus === 'active'
    );
    const isArenaActive = hasRoom && (
      matchPhase === MATCH_PHASE_COMBAT_COUNTDOWN
      || matchPhase === DEFAULT_MATCH_PHASE
      || matchPhase === MATCH_PHASE_END
      || roomState === ROOM_STATE_COMBAT
      || roomState === ROOM_STATE_MATCH_END
      || roomState === ROOM_STATE_IN_MATCH
    );
    // In combat/countdown/end, arena phase must take precedence even if draft status lingers.
    if (isArenaActive && matchPhase !== MATCH_PHASE_DRAFT) {
      isDraftActive = false;
    }

    let myMatchPlayerNumber = Number(roomSnapshot.myMatchPlayerNumber);
    if (!Number.isFinite(myMatchPlayerNumber) || myMatchPlayerNumber <= 0) {
      const slotAsFallback = Number(roomSnapshot.slot);
      if (slotAsFallback === 1 || slotAsFallback === 2) {
        myMatchPlayerNumber = slotAsFallback;
      }
    }
    const localPlayerId = toDraftPlayerId(myMatchPlayerNumber);
    let activeTurnPlayerNumber = Number(roomSnapshot.draft?.currentTurnPlayerNumber);
    if (!Number.isFinite(activeTurnPlayerNumber) || activeTurnPlayerNumber <= 0) {
      const draftTurnOrderRaw = Array.isArray(roomSnapshot.draft?.turnOrder)
        ? roomSnapshot.draft.turnOrder
            .map((entry) => Number(entry))
            .filter((entry) => Number.isFinite(entry) && entry > 0)
        : [];
      const fallbackTurnIndexRaw = parseNumber(roomSnapshot.draft?.currentTurnIndex);
      const fallbackTurnIndex = fallbackTurnIndexRaw === null
        ? 0
        : clamp(fallbackTurnIndexRaw, 0, Math.max(0, draftTurnOrderRaw.length - 1));
      const turnFromOrder = draftTurnOrderRaw[fallbackTurnIndex];
      if (Number.isFinite(turnFromOrder) && turnFromOrder > 0) {
        activeTurnPlayerNumber = turnFromOrder;
      }
    }
    const activeTurnPlayerId = Number.isFinite(activeTurnPlayerNumber) && activeTurnPlayerNumber > 0
      ? toDraftPlayerId(activeTurnPlayerNumber)
      : null;

    const turnOrder = Array.isArray(roomSnapshot.draft?.turnOrder)
      ? roomSnapshot.draft.turnOrder
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
        .map((entry) => toDraftPlayerId(entry))
      : [];
    const normalizedTurnOrder = turnOrder.length ? turnOrder : ['A', 'B', 'B', 'A', 'A', 'B'];
    let currentTurnIndex = parseNumber(roomSnapshot.draft?.currentTurnIndex);
    if (currentTurnIndex === null) currentTurnIndex = 0;
    currentTurnIndex = clamp(
      currentTurnIndex,
      0,
      Math.max(0, normalizedTurnOrder.length - 1)
    );

    const players = Array.isArray(roomSnapshot.players) ? roomSnapshot.players : [];
    const playerNames = {
      A: '',
      B: ''
    };
    players.forEach((entry) => {
      const matchNumber = Number(entry?.matchPlayerNumber);
      const fallbackSlot = Number(entry?.slot);
      const mappedId = Number.isFinite(matchNumber) && matchNumber > 0
        ? toDraftPlayerId(matchNumber)
        : toDraftPlayerId(fallbackSlot);
      const displayName = trimString(entry?.name);
      if (displayName) {
        playerNames[mappedId] = displayName;
      }
    });

    const draftPicksA = getDraftedSpellsForPlayer(1)
      .map((spellId) => toUiSpellId(spellId))
      .filter(Boolean);
    const draftPicksB = getDraftedSpellsForPlayer(2)
      .map((spellId) => toUiSpellId(spellId))
      .filter(Boolean);

    const draftPool = {};
    DRAFT_SPELL_LIST.forEach((spellId) => {
      const poolEntry = roomSnapshot.draft?.pool?.[spellId];
      const remainingCopies = Number(poolEntry?.remainingCopies);
      const totalCopies = Number(poolEntry?.totalCopies);
      const remaining = Number.isFinite(remainingCopies) ? Math.max(0, remainingCopies) : 0;
      const total = Number.isFinite(totalCopies) ? Math.max(remaining, totalCopies) : remaining;
      draftPool[spellId] = {
        id: spellId,
        remainingCopies: remaining,
        totalCopies: total
      };
    });

    const normalizedLoadout = normalizeSpellList(roomSnapshot.myLoadout)
      .map((abilityId) => toUiSpellId(abilityId))
      .filter(Boolean);
    const dedupedLoadout = Array.from(new Set(normalizedLoadout));
    if (!dedupedLoadout.includes('fire')) {
      dedupedLoadout.unshift('fire');
    }
    const draftedSlots = dedupedLoadout.filter((spellId) => spellId !== 'fire').slice(0, 3);
    const uiLoadout = ['fire', ...draftedSlots];

    const cooldownSecondsBySpell = {};
    const availabilityBySpell = {};
    normalizeSpellList(roomSnapshot.myLoadout).forEach((abilityId) => {
      const mappedSpellId = toUiSpellId(abilityId);
      if (!mappedSpellId) return;
      const remainingMs = getAbilityCooldownRemainingMs(abilityId);
      cooldownSecondsBySpell[mappedSpellId] = Math.max(0, remainingMs / 1000);
      availabilityBySpell[mappedSpellId] = getAbilityAvailabilityText(abilityId);
    });
    cooldownSecondsBySpell.fire = Math.max(0, getAbilityCooldownRemainingMs(ABILITY_IDS.FIREBLAST) / 1000);
    availabilityBySpell.fire = getAbilityAvailabilityText(ABILITY_IDS.FIREBLAST);

    const canPickNow = isDraftActive
      && Boolean(socket?.connected)
      && Boolean(activeTurnPlayerId)
      && activeTurnPlayerId === localPlayerId;
    const disconnectedPlayers = getDisconnectedPlayers();
    const pausedByDisconnect = Boolean(roomSnapshot.matchPaused)
      && disconnectedPlayers.length > 0;

    return {
      active: hasRoom,
      roomCode: roomSnapshot.code || '',
      roomState,
      matchPhase,
      isDraftActive,
      isArenaActive,
      isCountdownActive: matchPhase === MATCH_PHASE_COMBAT_COUNTDOWN,
      isMatchEnd: matchPhase === MATCH_PHASE_END,
      draft: {
        localPlayerId,
        activePlayerId: activeTurnPlayerId,
        activeIndex: currentTurnIndex,
        order: normalizedTurnOrder,
        picks: {
          A: draftPicksA,
          B: draftPicksB
        },
        playerNames,
        spellPool: draftPool,
        turnDurationSeconds: Math.max(0, (parseNumber(roomSnapshot.draft?.turnDurationMs) || 0) / 1000),
        timeLeftSeconds: Math.max(0, getDraftTurnCountdownMs() / 1000),
        complete: !isDraftActive,
        canPickNow
      },
      arena: {
        loadout: uiLoadout,
        cooldownSecondsBySpell,
        availabilityBySpell,
        shieldActive: Boolean(roomSnapshot.myActiveEffects?.shieldActive),
        shieldRemainingSeconds: Math.max(0, Number(roomSnapshot.myActiveEffects?.shieldRemainingMs || 0) / 1000),
        hitEvent: roomSnapshot.lastHitEvent || null,
        matchResult: getMatchResultText() || ''
      },
      reconnect: {
        pausedByDisconnect,
        disconnectedPlayers
      }
    };
  }

  function clonePositionSafe(position) {
    const normalized = normalizePosition(position);
    return normalized ? { x: normalized.x, y: normalized.y } : null;
  }

  function cloneVectorSafe(vector) {
    const normalized = normalizePosition(vector);
    return normalized ? { x: normalized.x, y: normalized.y } : null;
  }

  function cloneEffectsSafe(effects) {
    const source = effects && typeof effects === 'object' ? effects : {};
    return {
      shieldUntil: parseNumber(source.shieldUntil) || 0,
      shieldRemainingMs: Math.max(0, parseNumber(source.shieldRemainingMs) || 0),
      shieldActive: Boolean(source.shieldActive),
      chargeActive: Boolean(source.chargeActive),
      chargeRemainingDistance: Math.max(0, parseNumber(source.chargeRemainingDistance) || 0),
      chargeDirection: cloneVectorSafe(source.chargeDirection)
    };
  }

  function buildMultiplayerRuntimeSnapshot() {
    if (runtimeSnapshotCache) {
      return runtimeSnapshotCache;
    }

    const presentation = buildMultiplayerPresentationSnapshot();
    if (!presentation.active) {
      runtimeSnapshotCache = {
        active: false
      };
      return runtimeSnapshotCache;
    }

    const myNumber = Number(roomSnapshot.myMatchPlayerNumber);
    const fallbackSlot = Number(roomSnapshot.slot);
    const resolvedMyNumber = Number.isFinite(myNumber) && myNumber > 0
      ? myNumber
      : (fallbackSlot === 1 || fallbackSlot === 2 ? fallbackSlot : null);
    const opponentNumber = resolvedMyNumber === 1
      ? 2
      : resolvedMyNumber === 2
        ? 1
        : null;

    const players = Array.isArray(roomSnapshot.players) ? roomSnapshot.players : [];
    const selfPlayer = players.find((entry) => trimString(entry?.socketId) === socket?.id)
      || players.find((entry) => Number(entry?.matchPlayerNumber) === resolvedMyNumber)
      || null;
    const opponentPlayer = players.find((entry) => Number(entry?.matchPlayerNumber) === opponentNumber)
      || players.find((entry) => Number(entry?.slot) === opponentNumber)
      || null;

    const projectiles = Array.isArray(roomSnapshot.projectiles)
      ? roomSnapshot.projectiles.map((projectile) => ({
          projectileId: trimString(projectile?.projectileId),
          abilityId: trimString(projectile?.abilityId).toLowerCase(),
          ownerPlayerNumber: parseNumber(projectile?.ownerPlayerNumber),
          position: clonePositionSafe(projectile?.position),
          direction: cloneVectorSafe(projectile?.direction),
          speed: parseNumber(projectile?.speed),
          hitRadius: parseNumber(projectile?.hitRadius),
          spawnedAt: parseNumber(projectile?.spawnedAt),
          expiresAt: parseNumber(projectile?.expiresAt)
        }))
      : [];

    const walls = Array.isArray(roomSnapshot.walls)
      ? roomSnapshot.walls.map((wall) => ({
          wallId: trimString(wall?.wallId),
          ownerPlayerNumber: parseNumber(wall?.ownerPlayerNumber),
          position: clonePositionSafe(wall?.position),
          direction: cloneVectorSafe(wall?.direction),
          halfLength: parseNumber(wall?.halfLength),
          halfThickness: parseNumber(wall?.halfThickness),
          spawnedAt: parseNumber(wall?.spawnedAt),
          expiresAt: parseNumber(wall?.expiresAt)
        }))
      : [];

    const hitEvents = Array.isArray(roomSnapshot.hitEvents)
      ? roomSnapshot.hitEvents.map((event) => ({
          hitId: trimString(event?.hitId),
          type: trimString(event?.type),
          abilityId: trimString(event?.abilityId).toLowerCase(),
          projectileId: trimString(event?.projectileId),
          sourcePlayerNumber: parseNumber(event?.sourcePlayerNumber),
          targetPlayerNumber: parseNumber(event?.targetPlayerNumber),
          timestamp: parseNumber(event?.timestamp),
          knockback: cloneVectorSafe(event?.knockback),
          metadata: event?.metadata && typeof event.metadata === 'object'
            ? { ...event.metadata }
            : null
        }))
      : [];

    runtimeSnapshotCache = {
      active: true,
      roomCode: roomSnapshot.code || '',
      roomState: trimString(roomSnapshot.state),
      matchId: roomSnapshot.matchId || '',
      matchPhase: trimString(roomSnapshot.matchPhase),
      isDraftActive: presentation.isDraftActive,
      isArenaActive: presentation.isArenaActive,
      isMatchEnd: presentation.isMatchEnd,
      myPlayerNumber: resolvedMyNumber,
      opponentPlayerNumber: opponentNumber,
      myConnected: selfPlayer ? selfPlayer.connected !== false : false,
      opponentConnected: opponentPlayer ? opponentPlayer.connected !== false : false,
      myPosition: clonePositionSafe(roomSnapshot.myPosition),
      opponentPosition: clonePositionSafe(roomSnapshot.opponentPosition),
      myVelocity: cloneVectorSafe(roomSnapshot.myVelocity),
      opponentVelocity: cloneVectorSafe(roomSnapshot.opponentVelocity),
      myAimDirection: cloneVectorSafe(roomSnapshot.myAimDirection),
      opponentAimDirection: cloneVectorSafe(roomSnapshot.opponentAimDirection),
      myActiveEffects: cloneEffectsSafe(roomSnapshot.myActiveEffects),
      opponentActiveEffects: cloneEffectsSafe(roomSnapshot.opponentActiveEffects),
      projectiles,
      walls,
      hitEvents,
      lastHitEvent: roomSnapshot.lastHitEvent
        ? {
            hitId: trimString(roomSnapshot.lastHitEvent.hitId),
            type: trimString(roomSnapshot.lastHitEvent.type),
            abilityId: trimString(roomSnapshot.lastHitEvent.abilityId).toLowerCase(),
            projectileId: trimString(roomSnapshot.lastHitEvent.projectileId),
            sourcePlayerNumber: parseNumber(roomSnapshot.lastHitEvent.sourcePlayerNumber),
            targetPlayerNumber: parseNumber(roomSnapshot.lastHitEvent.targetPlayerNumber),
            timestamp: parseNumber(roomSnapshot.lastHitEvent.timestamp),
            knockback: cloneVectorSafe(roomSnapshot.lastHitEvent.knockback),
            metadata: roomSnapshot.lastHitEvent.metadata && typeof roomSnapshot.lastHitEvent.metadata === 'object'
              ? { ...roomSnapshot.lastHitEvent.metadata }
              : null
          }
        : null,
      eliminatedPlayerNumber: parseNumber(roomSnapshot.eliminatedPlayerNumber),
      winnerPlayerNumber: parseNumber(roomSnapshot.winnerPlayerNumber),
      arenaBoundary: normalizeArenaBoundary(roomSnapshot.arenaBoundary)
    };
    return runtimeSnapshotCache;
  }

  function getAbilityCooldownRemainingMs(abilityId) {
    const normalizedAbilityId = trimString(abilityId).toLowerCase();
    if (!normalizedAbilityId) return 0;
    const directRemaining = parseNumber(roomSnapshot.myAbilityCooldowns?.[normalizedAbilityId]);
    if (directRemaining !== null && directRemaining > 0) {
      return directRemaining;
    }
    const readyAt = parseNumber(roomSnapshot.myAbilityReadyAt?.[normalizedAbilityId]) || 0;
    return readyAt > 0 ? Math.max(0, readyAt - Date.now()) : 0;
  }

  function isAbilityInMyLoadout(abilityId) {
    const normalizedAbilityId = trimString(abilityId).toLowerCase();
    if (!normalizedAbilityId) return false;
    if (normalizedAbilityId === ABILITY_IDS.FIREBLAST) return true;
    return roomSnapshot.myLoadout.includes(normalizedAbilityId);
  }

  function isAbilityUsable(abilityId) {
    const normalizedAbilityId = trimString(abilityId).toLowerCase();
    if (!normalizedAbilityId) return false;
    if (!roomSnapshot.code || !roomSnapshot.matchId) return false;
    if (roomSnapshot.matchPhase !== DEFAULT_MATCH_PHASE) return false;
    if (roomSnapshot.matchPaused) return false;
    if (!isAbilityInMyLoadout(normalizedAbilityId)) return false;
    return getAbilityCooldownRemainingMs(normalizedAbilityId) <= 0;
  }

  function getDraftedAbilityBySlotIndex(index) {
    const slotIndex = Number(index);
    if (!Number.isFinite(slotIndex) || slotIndex < 0) return '';
    return trimString(roomSnapshot.myDraftedLoadout?.[slotIndex]).toLowerCase();
  }

  function getAbilityForHudSlot(slotDef) {
    if (!slotDef) return '';
    if (slotDef.slotType === 'base') {
      return trimString(slotDef.fixedAbilityId).toLowerCase();
    }
    if (slotDef.slotType === 'drafted') {
      return getDraftedAbilityBySlotIndex(slotDef.draftedIndex);
    }
    return '';
  }

  function getAbilityAvailabilityText(abilityId) {
    const normalizedAbilityId = trimString(abilityId).toLowerCase();
    if (!normalizedAbilityId) return 'empty';
    if (!isAbilityInMyLoadout(normalizedAbilityId)) return 'not drafted';
    if (roomSnapshot.matchPhase === MATCH_PHASE_COMBAT_COUNTDOWN) return 'countdown';
    if (roomSnapshot.matchPhase !== DEFAULT_MATCH_PHASE) return 'non-combat';
    if (roomSnapshot.matchPaused) return 'paused';
    const remainingMs = getAbilityCooldownRemainingMs(normalizedAbilityId);
    if (remainingMs > 0) return formatDurationMs(remainingMs);
    return 'ready';
  }

  function getBlinkAvailabilityText() {
    const blinkState = getAbilityAvailabilityText(ABILITY_IDS.BLINK);
    if (blinkState === 'ready') return 'available';
    if (blinkState === 'not drafted') return 'unavailable (not drafted)';
    if (blinkState === 'countdown') return 'unavailable (countdown)';
    if (blinkState === 'non-combat') return 'unavailable (non-combat)';
    if (blinkState === 'paused') return 'unavailable (paused)';
    if (blinkState === 'empty') return 'unavailable';
    return `cooldown (${blinkState})`;
  }

  function getDraftTurnCountdownMs() {
    const fromSnapshot = parseNumber(roomSnapshot.draft?.turnRemainingMs);
    if (fromSnapshot !== null) return Math.max(0, fromSnapshot);
    const turnEndsAt = parseNumber(roomSnapshot.draft?.turnEndsAt);
    if (turnEndsAt === null) return 0;
    return Math.max(0, turnEndsAt - Date.now());
  }

  function formatDraftPool() {
    const pool = roomSnapshot.draft?.pool && typeof roomSnapshot.draft.pool === 'object'
      ? roomSnapshot.draft.pool
      : {};
    const parts = DRAFT_SPELL_LIST.map((spellId) => {
      const remainingCopies = parseNumber(pool?.[spellId]?.remainingCopies);
      const totalCopies = parseNumber(pool?.[spellId]?.totalCopies);
      const remaining = remainingCopies === null ? 0 : remainingCopies;
      const total = totalCopies === null ? remaining : totalCopies;
      return `${spellId}:${remaining}/${total}`;
    });
    return parts.join(' | ');
  }

  function getMatchResultText() {
    if (roomSnapshot.matchPhase !== MATCH_PHASE_END) return '';
    const winner = Number(roomSnapshot.winnerPlayerNumber);
    const eliminated = Number(roomSnapshot.eliminatedPlayerNumber);
    const mine = Number(roomSnapshot.myMatchPlayerNumber);

    if (Number.isFinite(winner) && Number.isFinite(mine) && winner === mine) return 'You win';
    if (Number.isFinite(eliminated) && Number.isFinite(mine) && eliminated === mine) return 'You lose';
    if (Number.isFinite(winner)) return `Player ${winner} wins`;
    return 'Match ended';
  }

  function getStateMessage() {
    if (!roomSnapshot.code) return 'Create or join a room.';
    if (isRoomInMatchFlow(roomSnapshot.state)) {
      if (roomSnapshot.matchPhase === MATCH_PHASE_DRAFT) {
        const currentTurnPlayerNumber = Number(roomSnapshot.draft?.currentTurnPlayerNumber);
        const turnText = Number.isFinite(currentTurnPlayerNumber) ? ` Player ${currentTurnPlayerNumber} is picking.` : '';
        return `Draft phase.${turnText}`;
      }
      if (roomSnapshot.matchPaused) {
        return `Match paused: opponent disconnected (${getReconnectSummaryText()}).`;
      }
      if (roomSnapshot.matchPhase === MATCH_PHASE_COMBAT_COUNTDOWN) {
        return `Combat starts in ${formatDurationMs(getCombatCountdownMs())}.`;
      }
      if (roomSnapshot.matchPhase === MATCH_PHASE_END) {
        return `${getMatchResultText()}.`;
      }
      const numberPart = Number.isFinite(roomSnapshot.myMatchPlayerNumber) ? ` You are player ${roomSnapshot.myMatchPlayerNumber}.` : '';
      const phase = trimString(roomSnapshot.matchPhase) || DEFAULT_MATCH_PHASE;
      return `Match started.${numberPart} Phase: ${phase}.`;
    }
    if (roomSnapshot.state === ROOM_STATE_STARTING) return 'Both players ready. Match is starting...';
    if (roomSnapshot.playerCount < 2) return 'Waiting for opponent...';
    if (roomSnapshot.state === ROOM_STATE_READY_CHECK) {
      return roomSnapshot.selfReady ? 'You are ready. Waiting for opponent readiness.' : 'Opponent found. Toggle ready when prepared.';
    }
    return `Room state: ${roomSnapshot.state}`;
  }

  function isLikelyTemplateValue(value) {
    return value.includes('{$') || value.includes('${') || value.includes('<%') || value.includes('{{');
  }

  function sanitizeConfiguredServerUrl(value) {
    const text = trimString(value);
    if (!text) return '';
    if (isLikelyTemplateValue(text)) return '';

    try {
      const parsed = new URL(text, window.location.origin);
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) return '';
      if (!trimString(parsed.host)) return '';
      return parsed.toString().replace(/\/$/, '');
    } catch (_error) {
      return '';
    }
  }

  function isLocalBrowserHost() {
    const host = trimString(window.location.hostname).toLowerCase();
    return LOCAL_HOSTNAMES.has(host);
  }

  function resolveServerUrl() {
    const runtimeUrl = sanitizeConfiguredServerUrl(window.__OUTRA_MULTIPLAYER_URL__);
    if (runtimeUrl) return runtimeUrl;

    const metaTag = document.querySelector('meta[name="outra-multiplayer-url"]');
    const metaUrl = sanitizeConfiguredServerUrl(metaTag?.content);
    if (metaUrl) return metaUrl;

    if (isLocalBrowserHost()) return LOCAL_SERVER_URL;
    return '';
  }

  function ensureDebugPanelStyles() {
    if (document.getElementById('outraMultiplayerDebugStyles')) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'outraMultiplayerDebugStyles';
    styleEl.textContent = `
      .mpDebugPanel {
        position: fixed;
        left: 12px;
        top: 48px;
        bottom: auto;
        width: min(1120px, calc(100vw - 24px));
        max-height: calc(100vh - 60px);
        overflow-y: auto;
        z-index: 55;
        padding: 10px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        grid-auto-flow: row dense;
        align-items: start;
        gap: 10px;
        border-radius: 12px;
        border: 1px solid rgba(117, 151, 255, 0.35);
        background: rgba(7, 11, 20, 0.84);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.42);
        backdrop-filter: blur(8px);
        color: #e8eeff;
        font: 12px/1.35 'Segoe UI', Tahoma, sans-serif;
      }

      .mpDebugToggle {
        position: fixed;
        left: 12px;
        top: 12px;
        z-index: 56;
      }

      .mpDebugTitle {
        grid-column: 1 / -1;
        margin-bottom: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #b7cbff;
      }

      .mpDebugRow {
        grid-column: 1 / -1;
        display: flex;
        gap: 8px;
        margin-bottom: 0;
      }

      .mpDebugInput,
      .mpDebugBtn {
        border-radius: 8px;
        border: 1px solid rgba(149, 174, 255, 0.35);
        background: rgba(13, 18, 34, 0.9);
        color: #eef2ff;
        font-size: 12px;
      }

      .mpDebugInput {
        flex: 1;
        min-width: 0;
        padding: 7px 8px;
      }

      .mpDebugBtn {
        padding: 7px 9px;
        cursor: pointer;
      }

      .mpDebugBtn:hover:not([disabled]) {
        border-color: rgba(189, 209, 255, 0.55);
        background: rgba(19, 27, 52, 0.95);
      }

      .mpDebugBtn[disabled] {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .mpDebugBtnLeave,
      .mpDebugBtnReady,
      .mpDebugBtnReturn {
        width: 100%;
        margin-top: 0;
      }

      .mpDebugBtnReady,
      .mpDebugBtnReturn {
        border-color: rgba(96, 210, 140, 0.55);
        background: linear-gradient(180deg, rgba(25, 86, 56, 0.92), rgba(15, 58, 37, 0.94));
        color: #e9ffef;
      }

      .mpDebugBtnReady:hover:not([disabled]),
      .mpDebugBtnReturn:hover:not([disabled]) {
        border-color: rgba(135, 242, 174, 0.8);
        background: linear-gradient(180deg, rgba(32, 110, 69, 0.96), rgba(20, 72, 46, 0.96));
      }

      .mpDebugBtnLeave {
        border-color: rgba(238, 98, 108, 0.58);
        background: linear-gradient(180deg, rgba(108, 34, 42, 0.92), rgba(78, 24, 31, 0.94));
        color: #ffeef1;
      }

      .mpDebugBtnLeave:hover:not([disabled]) {
        border-color: rgba(255, 130, 141, 0.82);
        background: linear-gradient(180deg, rgba(132, 41, 51, 0.96), rgba(95, 30, 38, 0.96));
      }

      .mpDebugMeta {
        margin-bottom: 0;
        color: #c6d5ff;
      }

      .mpDebugMeta strong {
        color: #ffffff;
        font-weight: 700;
      }

      .mpDebugStateWaiting {
        color: #9ac7ff !important;
      }

      .mpDebugStateReadyCheck {
        color: #ffd888 !important;
      }

      .mpDebugStateStarting {
        color: #81ffbb !important;
      }

      .mpDebugStateInMatch {
        color: #ffb4a1 !important;
      }

      .mpDebugSlots,
      .mpDebugMatchBox {
        margin-top: 0;
        border-radius: 7px;
        padding: 6px 8px;
        border: 1px solid rgba(146, 176, 255, 0.25);
        background: rgba(15, 21, 41, 0.78);
      }

      .mpDebugSlots {
        grid-column: span 2;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 6px;
      }

      .mpDebugMatchBox {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 8px 10px;
      }

      .mpDebugSlot {
        color: #d8e3ff;
        margin-bottom: 4px;
      }

      .mpDebugSlot:last-child {
        margin-bottom: 0;
      }

      .mpDebugStatus {
        margin-top: 8px;
        border-radius: 7px;
        padding: 6px 8px;
        border: 1px solid rgba(146, 176, 255, 0.25);
        background: rgba(15, 21, 41, 0.78);
        color: #d8e3ff;
      }

      .mpDebugDraftBox {
        grid-column: 1 / -1;
        margin-top: 0;
        border-radius: 7px;
        padding: 6px 8px;
        border: 1px solid rgba(146, 176, 255, 0.25);
        background: rgba(15, 21, 41, 0.78);
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 8px 10px;
      }

      .mpDebugDraftButtons {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        margin-top: 0;
      }

      .mpDebugDraftBtn {
        border-radius: 7px;
        border: 1px solid rgba(149, 174, 255, 0.35);
        background: rgba(13, 18, 34, 0.9);
        color: #eef2ff;
        font-size: 11px;
        padding: 6px 7px;
        cursor: pointer;
        text-align: left;
      }

      .mpDebugDraftBtn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .mpDebugDraftBtn:not(:disabled):hover {
        border-color: rgba(189, 209, 255, 0.55);
        background: rgba(19, 27, 52, 0.95);
      }

      .mpDebugBtnReady,
      .mpDebugBtnReturn,
      .mpDebugBtnLeave,
      .mpDebugStatus {
        grid-column: 1 / -1;
      }

      @media (max-width: 980px) {
        .mpDebugPanel {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @media (max-width: 760px) {
        .mpDebugPanel {
          left: 8px;
          top: 44px;
          bottom: auto;
          width: calc(100vw - 16px);
          max-height: calc(100vh - 52px);
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .mpDebugSlots {
          grid-column: 1 / -1;
        }
      }

      @media (max-width: 520px) {
        .mpDebugPanel {
          grid-template-columns: 1fr;
        }
      }

      .mpAbilityHud {
        position: fixed;
        left: 50%;
        bottom: 22px;
        transform: translateX(-50%);
        z-index: 54;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
        width: min(560px, calc(100vw - 40px));
        padding: 8px;
        border-radius: 14px;
        border: 1px solid rgba(187, 211, 255, 0.24);
        background: rgba(8, 12, 22, 0.72);
        box-shadow: 0 12px 26px rgba(0, 0, 0, 0.36);
        backdrop-filter: blur(6px);
        pointer-events: none;
      }

      .mpAbilitySlot {
        border-radius: 12px;
        border: 1px solid rgba(163, 188, 255, 0.24);
        background: linear-gradient(180deg, rgba(21, 30, 56, 0.88), rgba(13, 18, 35, 0.86));
        padding: 8px 10px;
        min-height: 64px;
        display: grid;
        align-content: space-between;
        gap: 6px;
        transition: border-color 0.18s ease, box-shadow 0.18s ease;
      }

      .mpAbilitySlotTop {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .mpAbilityKey {
        min-width: 28px;
        text-align: center;
        border-radius: 6px;
        border: 1px solid rgba(190, 212, 255, 0.4);
        background: rgba(20, 30, 56, 0.7);
        color: #e7f0ff;
        font-size: 11px;
        font-weight: 700;
        padding: 2px 5px;
      }

      .mpAbilityName {
        color: #f4f7ff;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .mpAbilityState {
        color: #c5d6ff;
        font-size: 11px;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      .mpAbilitySlotReady {
        border-color: rgba(126, 221, 187, 0.5);
        box-shadow: 0 0 0 1px rgba(126, 221, 187, 0.14), 0 0 22px rgba(81, 196, 166, 0.14);
      }

      .mpAbilitySlotCooldown {
        border-color: rgba(255, 204, 126, 0.42);
      }

      .mpAbilitySlotUnavailable {
        opacity: 0.56;
      }

      .mpAbilityStateBar {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      .mpAbilityStateChip {
        border-radius: 9px;
        border: 1px solid rgba(157, 183, 245, 0.26);
        background: rgba(12, 18, 34, 0.72);
        min-height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #b7c9ef;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        transition: border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
      }

      .mpAbilityStateChip.is-active {
        border-color: rgba(121, 229, 184, 0.56);
        color: #dfffee;
        box-shadow: 0 0 0 1px rgba(121, 229, 184, 0.18), 0 0 16px rgba(72, 188, 146, 0.2);
      }

      .mpGameplayUi {
        position: fixed;
        inset: 0;
        z-index: 53;
        pointer-events: none;
      }

      .mpGameplayRoomBadge {
        position: fixed;
        right: 14px;
        top: 12px;
        padding: 7px 12px;
        border-radius: 10px;
        border: 1px solid rgba(171, 196, 255, 0.34);
        background: rgba(8, 12, 22, 0.78);
        color: #dce6ff;
        font: 700 12px/1.2 'Segoe UI', Tahoma, sans-serif;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      }

      .mpPhaseBanner {
        position: fixed;
        left: 50%;
        top: 16px;
        transform: translateX(-50%) translateY(-8px);
        opacity: 0;
        min-width: min(560px, calc(100vw - 48px));
        padding: 10px 16px;
        border-radius: 12px;
        border: 1px solid rgba(178, 202, 255, 0.34);
        background: linear-gradient(180deg, rgba(17, 26, 52, 0.88), rgba(10, 16, 32, 0.86));
        color: #f4f8ff;
        text-align: center;
        font: 800 20px/1.2 'Segoe UI', Tahoma, sans-serif;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        box-shadow: 0 14px 30px rgba(0, 0, 0, 0.42);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }

      .mpPhaseBanner.is-visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      .mpDraftPanel {
        position: fixed;
        left: 50%;
        top: 74px;
        transform: translateX(-50%);
        width: min(920px, calc(100vw - 36px));
        border-radius: 18px;
        border: 1px solid rgba(170, 196, 255, 0.28);
        background: linear-gradient(180deg, rgba(9, 14, 29, 0.9), rgba(7, 11, 22, 0.88));
        box-shadow: 0 18px 36px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(7px);
        padding: 14px 16px;
        display: none;
        pointer-events: auto;
      }

      .mpDraftPanel.is-visible {
        display: block;
      }

      .mpDraftPanel.is-my-turn {
        border-color: rgba(134, 244, 197, 0.56);
        box-shadow: 0 0 0 1px rgba(134, 244, 197, 0.2), 0 16px 34px rgba(0, 0, 0, 0.42), 0 0 34px rgba(85, 204, 164, 0.25);
      }

      .mpDraftHeader {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        align-items: center;
      }

      .mpDraftPhase {
        color: #f4f7ff;
        font-size: 19px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .mpDraftTurn {
        margin-top: 4px;
        color: #c6d7ff;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.04em;
      }

      .mpDraftPanel.is-my-turn .mpDraftTurn {
        color: #d8ffe8;
      }

      .mpDraftTimerWrap {
        border-radius: 11px;
        border: 1px solid rgba(164, 191, 255, 0.32);
        background: rgba(10, 15, 30, 0.75);
        padding: 6px 10px;
        text-align: center;
        min-width: 88px;
      }

      .mpDraftTimerLabel {
        display: block;
        color: #99b2eb;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .mpDraftTimerValue {
        display: block;
        color: #f0f5ff;
        font-size: 22px;
        font-weight: 800;
        line-height: 1.05;
        letter-spacing: 0.03em;
      }

      .mpDraftTimerValue.is-low {
        color: #ffd199;
      }

      .mpDraftPicksWrap {
        margin-top: 10px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .mpDraftPicksCol {
        border-radius: 11px;
        border: 1px solid rgba(147, 173, 240, 0.26);
        background: rgba(13, 20, 38, 0.62);
        padding: 8px 9px;
      }

      .mpDraftPicksTitle {
        color: #b8cfff;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        margin-bottom: 7px;
      }

      .mpDraftPicksRow {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 7px;
      }

      .mpDraftPickChip {
        border-radius: 9px;
        border: 1px solid rgba(143, 169, 232, 0.27);
        background: rgba(16, 23, 42, 0.76);
        color: #dde8ff;
        text-align: center;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 8px 6px;
        min-height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .mpDraftPickChip.is-empty {
        color: #7d8fb8;
      }

      .mpDraftPoolGrid {
        margin-top: 12px;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 9px;
      }

      .mpDraftSpellBtn {
        border-radius: 11px;
        border: 1px solid rgba(145, 170, 235, 0.32);
        background: linear-gradient(180deg, rgba(19, 29, 54, 0.92), rgba(12, 19, 36, 0.9));
        color: #e7efff;
        padding: 8px 9px;
        display: grid;
        gap: 4px;
        min-height: 64px;
        text-align: left;
        cursor: pointer;
        transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
      }

      .mpDraftSpellBtn:hover:not(:disabled) {
        transform: translateY(-1px);
        border-color: rgba(179, 210, 255, 0.58);
        box-shadow: 0 0 0 1px rgba(165, 199, 255, 0.2), 0 9px 18px rgba(0, 0, 0, 0.28);
      }

      .mpDraftSpellBtn:disabled {
        cursor: default;
      }

      .mpDraftSpellBtn.is-ready {
        border-color: rgba(124, 229, 185, 0.55);
        box-shadow: 0 0 0 1px rgba(124, 229, 185, 0.16), 0 0 18px rgba(88, 195, 155, 0.18);
      }

      .mpDraftSpellBtn.is-picked {
        border-color: rgba(123, 152, 224, 0.36);
        opacity: 0.72;
      }

      .mpDraftSpellBtn.is-unavailable {
        border-color: rgba(116, 126, 155, 0.25);
        opacity: 0.48;
      }

      .mpDraftSpellName {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .mpDraftSpellCount {
        font-size: 11px;
        color: #aac0f2;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .mpCombatCountdown {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        border-radius: 14px;
        border: 1px solid rgba(177, 199, 255, 0.42);
        background: rgba(10, 15, 30, 0.72);
        min-width: 132px;
        padding: 14px 18px;
        text-align: center;
        color: #f7faff;
        font: 900 70px/1 'Segoe UI', Tahoma, sans-serif;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        box-shadow: 0 14px 30px rgba(0, 0, 0, 0.42);
        display: none;
      }

      .mpMatchEndPanel {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: min(440px, calc(100vw - 32px));
        border-radius: 16px;
        border: 1px solid rgba(177, 201, 255, 0.34);
        background: linear-gradient(180deg, rgba(11, 16, 30, 0.92), rgba(8, 12, 23, 0.9));
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.44);
        padding: 16px;
        text-align: center;
        display: none;
        pointer-events: auto;
      }

      .mpMatchEndTitle {
        color: #f2f7ff;
        font-size: 30px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .mpMatchEndTitle.is-win {
        color: #90f2bf;
      }

      .mpMatchEndTitle.is-loss {
        color: #ffb1b9;
      }

      .mpMatchEndSub {
        margin-top: 5px;
        color: #c6d5ff;
        font-size: 13px;
      }

      .mpMatchEndActions {
        margin-top: 12px;
        display: grid;
        gap: 8px;
      }

      .mpGameBtn {
        border-radius: 9px;
        border: 1px solid rgba(170, 196, 255, 0.4);
        background: rgba(16, 24, 45, 0.86);
        color: #ebf2ff;
        font-size: 13px;
        font-weight: 700;
        padding: 8px 10px;
        cursor: pointer;
        transition: border-color 0.15s ease, background 0.15s ease;
      }

      .mpGameBtn:hover:not([disabled]) {
        border-color: rgba(204, 225, 255, 0.7);
        background: rgba(24, 35, 64, 0.92);
      }

      .mpGameBtn[disabled] {
        cursor: not-allowed;
        opacity: 0.58;
      }

      .mpGameBtnReturn {
        border-color: rgba(106, 215, 154, 0.62);
        background: linear-gradient(180deg, rgba(30, 98, 65, 0.9), rgba(20, 67, 44, 0.94));
      }

      .mpGameBtnRematch {
        border-color: rgba(238, 202, 122, 0.6);
        background: linear-gradient(180deg, rgba(98, 78, 32, 0.9), rgba(72, 57, 24, 0.94));
      }

      .mpGameBtnLeave {
        border-color: rgba(232, 110, 123, 0.6);
        background: linear-gradient(180deg, rgba(108, 38, 47, 0.9), rgba(82, 29, 36, 0.94));
      }

      @media (max-width: 900px) {
        .mpDraftPanel {
          top: 62px;
          width: calc(100vw - 20px);
          padding: 12px;
        }

        .mpDraftPoolGrid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 620px) {
        .mpDraftPicksWrap {
          grid-template-columns: 1fr;
        }

        .mpPhaseBanner {
          font-size: 17px;
          min-width: calc(100vw - 20px);
          padding: 8px 10px;
        }

        .mpCombatCountdown {
          min-width: 104px;
          font-size: 52px;
          padding: 10px 14px;
        }
      }
    `;

    document.head.appendChild(styleEl);
  }

  function applyDebugPanelVisibility() {
    if (panel && document.body.contains(panel)) {
      panel.style.display = isDebugVisible ? '' : 'none';
    }
    if (panelToggleButton && document.body.contains(panelToggleButton)) {
      panelToggleButton.textContent = isDebugVisible ? 'Hide Debug' : 'Show Debug';
    }
  }

  function isSnapshotInDraftPhase(snapshot) {
    if (!snapshot) return false;
    const roomState = trimString(snapshot.state).toLowerCase();
    const matchPhase = trimString(snapshot.matchPhase).toLowerCase();
    return roomState === ROOM_STATE_DRAFT || matchPhase === MATCH_PHASE_DRAFT;
  }

  function maybeAutoHideDebugPanelOnDraftEnter(wasInDraftPhase) {
    if (!isDebugVisible) return;
    if (wasInDraftPhase) return;
    if (!isSnapshotInDraftPhase(roomSnapshot)) return;
    isDebugVisible = false;
    applyDebugPanelVisibility();
    console.info(`${LOG_PREFIX} debug panel auto-hidden on draft enter`);
  }

  function ensureDebugToggleButton() {
    if (panelToggleButton && document.body.contains(panelToggleButton)) return panelToggleButton;
    if (!document.body) return null;

    panelToggleButton = document.createElement('button');
    panelToggleButton.type = 'button';
    panelToggleButton.className = 'mpDebugBtn mpDebugToggle';
    panelToggleButton.addEventListener('click', () => {
      isDebugVisible = !isDebugVisible;
      applyDebugPanelVisibility();
    });
    document.body.appendChild(panelToggleButton);
    applyDebugPanelVisibility();
    return panelToggleButton;
  }

  function ensureDebugPanel() {
    if (panel && document.body.contains(panel)) {
      ensureDebugToggleButton();
      applyDebugPanelVisibility();
      return panel;
    }
    if (!document.body) return null;

    ensureDebugPanelStyles();
    ensureDebugToggleButton();

    panel = document.createElement('section');
    panel.className = 'mpDebugPanel';
    draftButtonElements = new Map();
    panel.innerHTML = `
      <div class="mpDebugTitle">Multiplayer Debug</div>
      <div class="mpDebugRow">
        <button class="mpDebugBtn" type="button" data-mp-action="create">Create Room</button>
      </div>
      <div class="mpDebugRow">
        <input class="mpDebugInput" type="text" maxlength="8" placeholder="Room code" data-mp-input="code" />
        <button class="mpDebugBtn" type="button" data-mp-action="join">Join</button>
      </div>
      <div class="mpDebugMeta">Room: <strong data-mp-field="roomCode">-</strong></div>
      <div class="mpDebugMeta">Players: <strong data-mp-field="playerCount">0/2</strong></div>
      <div class="mpDebugMeta">State: <strong data-mp-field="state">${ROOM_STATE_IDLE}</strong></div>
      <div class="mpDebugMeta">Slot: <strong data-mp-field="slot">-</strong></div>
      <div class="mpDebugMeta">Socket: <strong data-mp-field="socket">offline</strong></div>
      <div class="mpDebugMeta">Connected: <strong data-mp-field="connectedCount">0/2</strong></div>
      <div class="mpDebugMeta">Reconnect: <strong data-mp-field="reconnectSummary">none</strong></div>
      <div class="mpDebugSlots">
        <div class="mpDebugSlot" data-mp-field="slot1">P1: empty</div>
        <div class="mpDebugSlot" data-mp-field="slot2">P2: empty</div>
      </div>
      <div class="mpDebugMatchBox">
        <div class="mpDebugMeta">Match Started: <strong data-mp-field="matchStarted">no</strong></div>
        <div class="mpDebugMeta">Match ID: <strong data-mp-field="matchId">-</strong></div>
        <div class="mpDebugMeta">Started At: <strong data-mp-field="matchStartedAt">-</strong></div>
        <div class="mpDebugMeta">My Player #: <strong data-mp-field="matchPlayerNumber">-</strong></div>
        <div class="mpDebugMeta">My Spawn: <strong data-mp-field="mySpawn">-</strong></div>
        <div class="mpDebugMeta">My Pos: <strong data-mp-field="myPos">-</strong></div>
        <div class="mpDebugMeta">My Vel: <strong data-mp-field="myVel">-</strong></div>
        <div class="mpDebugMeta">My Aim: <strong data-mp-field="myAim">-</strong></div>
        <div class="mpDebugMeta">My Loadout: <strong data-mp-field="myLoadout">-</strong></div>
        <div class="mpDebugMeta">Opp Loadout: <strong data-mp-field="oppLoadout">-</strong></div>
        <div class="mpDebugMeta">Abilities: <strong data-mp-field="myAbilitySummary">-</strong></div>
        <div class="mpDebugMeta">Blink: <strong data-mp-field="myBlinkState">-</strong></div>
        <div class="mpDebugMeta">Opponent Pos: <strong data-mp-field="oppPos">-</strong></div>
        <div class="mpDebugMeta">Opponent Vel: <strong data-mp-field="oppVel">-</strong></div>
        <div class="mpDebugMeta">Opponent Aim: <strong data-mp-field="oppAim">-</strong></div>
        <div class="mpDebugMeta">Paused: <strong data-mp-field="matchPaused">no</strong></div>
        <div class="mpDebugMeta">Pause Reason: <strong data-mp-field="matchPauseReason">-</strong></div>
        <div class="mpDebugMeta">Phase: <strong data-mp-field="matchPhase">-</strong></div>
        <div class="mpDebugMeta">Eliminated: <strong data-mp-field="eliminatedPlayer">-</strong></div>
        <div class="mpDebugMeta">Winner: <strong data-mp-field="winnerPlayer">-</strong></div>
        <div class="mpDebugMeta">Result: <strong data-mp-field="matchResult">-</strong></div>
        <div class="mpDebugMeta">Ended At: <strong data-mp-field="matchEndedAt">-</strong></div>
        <div class="mpDebugMeta">State Tick: <strong data-mp-field="matchTickAt">-</strong></div>
        <div class="mpDebugMeta">Projectiles: <strong data-mp-field="projectileCount">0</strong></div>
        <div class="mpDebugMeta">Walls: <strong data-mp-field="wallCount">0</strong></div>
        <div class="mpDebugMeta">Last Hit: <strong data-mp-field="lastHit">none</strong></div>
        <div class="mpDebugMeta">Spawns: <strong data-mp-field="spawns">P1 - | P2 -</strong></div>
      </div>
      <div class="mpDebugDraftBox">
        <div class="mpDebugMeta">Draft Turn: <strong data-mp-field="draftTurn">-</strong></div>
        <div class="mpDebugMeta">Draft Countdown: <strong data-mp-field="draftCountdown">-</strong></div>
        <div class="mpDebugMeta">My Drafted: <strong data-mp-field="myDraftedSpells">-</strong></div>
        <div class="mpDebugMeta">Opponent Drafted: <strong data-mp-field="oppDraftedSpells">-</strong></div>
        <div class="mpDebugMeta">Spell Pool: <strong data-mp-field="draftPool">-</strong></div>
      </div>
      <div class="mpDebugDraftButtons" data-mp-field="draftButtons"></div>
      <div class="mpDebugDraftBox">
        <div class="mpDebugMeta">Tuning Updated: <strong data-mp-field="tuningUpdatedAt">-</strong></div>
        <div class="mpDebugMeta">Tuning Snapshot: <strong data-mp-field="tuningSummary">Not loaded.</strong></div>
        <div class="mpDebugRow">
          <input class="mpDebugInput" type="text" placeholder="Ability (e.g. fireblast)" data-mp-input="tuneAbility" />
          <input class="mpDebugInput" type="text" placeholder="Field (e.g. cooldownMs)" data-mp-input="tuneKey" />
          <input class="mpDebugInput" type="text" placeholder="Value" data-mp-input="tuneValue" />
        </div>
        <div class="mpDebugRow">
          <button class="mpDebugBtn" type="button" data-mp-action="tune-set">Set Tuning</button>
          <button class="mpDebugBtn" type="button" data-mp-action="tune-reset">Reset Tuning</button>
          <button class="mpDebugBtn" type="button" data-mp-action="tune-log">Log Tuning</button>
        </div>
      </div>
      <button class="mpDebugBtn mpDebugBtnReady" type="button" data-mp-action="ready" disabled>Toggle Ready</button>
      <div class="mpDebugRow">
        <button class="mpDebugBtn mpDebugBtnBlink" type="button" data-mp-action="ability-fireblast" disabled>Fireblast (Space)</button>
        <button class="mpDebugBtn mpDebugBtnBlink" type="button" data-mp-action="ability-q" disabled>Slot 1 (Q)</button>
      </div>
      <div class="mpDebugRow">
        <button class="mpDebugBtn mpDebugBtnBlink" type="button" data-mp-action="ability-e" disabled>Slot 2 (E)</button>
        <button class="mpDebugBtn mpDebugBtnBlink" type="button" data-mp-action="ability-r" disabled>Slot 3 (R)</button>
      </div>
      <button class="mpDebugBtn mpDebugBtnReturn" type="button" data-mp-action="return" style="display:none;">Return to Room</button>
      <button class="mpDebugBtn mpDebugBtnLeave" type="button" data-mp-action="leave">Leave Room</button>
      <div class="mpDebugStatus" data-mp-field="message">Ready.</div>
    `;

    panelFields = {
      roomCode: panel.querySelector('[data-mp-field="roomCode"]'),
      playerCount: panel.querySelector('[data-mp-field="playerCount"]'),
      state: panel.querySelector('[data-mp-field="state"]'),
      slot: panel.querySelector('[data-mp-field="slot"]'),
      socket: panel.querySelector('[data-mp-field="socket"]'),
      connectedCount: panel.querySelector('[data-mp-field="connectedCount"]'),
      reconnectSummary: panel.querySelector('[data-mp-field="reconnectSummary"]'),
      slot1: panel.querySelector('[data-mp-field="slot1"]'),
      slot2: panel.querySelector('[data-mp-field="slot2"]'),
      matchStarted: panel.querySelector('[data-mp-field="matchStarted"]'),
      matchId: panel.querySelector('[data-mp-field="matchId"]'),
      matchStartedAt: panel.querySelector('[data-mp-field="matchStartedAt"]'),
      matchPlayerNumber: panel.querySelector('[data-mp-field="matchPlayerNumber"]'),
      mySpawn: panel.querySelector('[data-mp-field="mySpawn"]'),
      myPos: panel.querySelector('[data-mp-field="myPos"]'),
      myVel: panel.querySelector('[data-mp-field="myVel"]'),
      myAim: panel.querySelector('[data-mp-field="myAim"]'),
      myLoadout: panel.querySelector('[data-mp-field="myLoadout"]'),
      oppLoadout: panel.querySelector('[data-mp-field="oppLoadout"]'),
      myAbilitySummary: panel.querySelector('[data-mp-field="myAbilitySummary"]'),
      myBlinkState: panel.querySelector('[data-mp-field="myBlinkState"]'),
      oppPos: panel.querySelector('[data-mp-field="oppPos"]'),
      oppVel: panel.querySelector('[data-mp-field="oppVel"]'),
      oppAim: panel.querySelector('[data-mp-field="oppAim"]'),
      matchPaused: panel.querySelector('[data-mp-field="matchPaused"]'),
      matchPauseReason: panel.querySelector('[data-mp-field="matchPauseReason"]'),
      matchPhase: panel.querySelector('[data-mp-field="matchPhase"]'),
      eliminatedPlayer: panel.querySelector('[data-mp-field="eliminatedPlayer"]'),
      winnerPlayer: panel.querySelector('[data-mp-field="winnerPlayer"]'),
      matchResult: panel.querySelector('[data-mp-field="matchResult"]'),
      matchEndedAt: panel.querySelector('[data-mp-field="matchEndedAt"]'),
      matchTickAt: panel.querySelector('[data-mp-field="matchTickAt"]'),
      projectileCount: panel.querySelector('[data-mp-field="projectileCount"]'),
      wallCount: panel.querySelector('[data-mp-field="wallCount"]'),
      lastHit: panel.querySelector('[data-mp-field="lastHit"]'),
      spawns: panel.querySelector('[data-mp-field="spawns"]'),
      draftTurn: panel.querySelector('[data-mp-field="draftTurn"]'),
      draftCountdown: panel.querySelector('[data-mp-field="draftCountdown"]'),
      myDraftedSpells: panel.querySelector('[data-mp-field="myDraftedSpells"]'),
      oppDraftedSpells: panel.querySelector('[data-mp-field="oppDraftedSpells"]'),
      draftPool: panel.querySelector('[data-mp-field="draftPool"]'),
      draftButtons: panel.querySelector('[data-mp-field="draftButtons"]'),
      tuningUpdatedAt: panel.querySelector('[data-mp-field="tuningUpdatedAt"]'),
      tuningSummary: panel.querySelector('[data-mp-field="tuningSummary"]'),
      tuneAbilityInput: panel.querySelector('[data-mp-input="tuneAbility"]'),
      tuneKeyInput: panel.querySelector('[data-mp-input="tuneKey"]'),
      tuneValueInput: panel.querySelector('[data-mp-input="tuneValue"]'),
      message: panel.querySelector('[data-mp-field="message"]'),
      readyButton: panel.querySelector('[data-mp-action="ready"]'),
      abilityFireblastButton: panel.querySelector('[data-mp-action="ability-fireblast"]'),
      abilityQButton: panel.querySelector('[data-mp-action="ability-q"]'),
      abilityEButton: panel.querySelector('[data-mp-action="ability-e"]'),
      abilityRButton: panel.querySelector('[data-mp-action="ability-r"]'),
      returnButton: panel.querySelector('[data-mp-action="return"]')
    };
    panelInput = panel.querySelector('[data-mp-input="code"]');

    panel.querySelector('[data-mp-action="create"]')?.addEventListener('click', () => {
      createRoom();
    });
    panel.querySelector('[data-mp-action="join"]')?.addEventListener('click', () => {
      joinRoom(panelInput?.value);
    });
    panel.querySelector('[data-mp-action="ready"]')?.addEventListener('click', () => {
      toggleReady();
    });
    panel.querySelector('[data-mp-action="ability-fireblast"]')?.addEventListener('click', () => {
      castFireblast();
    });
    panel.querySelector('[data-mp-action="ability-q"]')?.addEventListener('click', () => {
      castDraftedAbilityBySlot(0);
    });
    panel.querySelector('[data-mp-action="ability-e"]')?.addEventListener('click', () => {
      castDraftedAbilityBySlot(1);
    });
    panel.querySelector('[data-mp-action="ability-r"]')?.addEventListener('click', () => {
      castDraftedAbilityBySlot(2);
    });
    panel.querySelector('[data-mp-action="return"]')?.addEventListener('click', () => {
      returnToRoom();
    });
    panel.querySelector('[data-mp-action="leave"]')?.addEventListener('click', () => {
      leaveRoom();
    });
    panel.querySelector('[data-mp-action="tune-set"]')?.addEventListener('click', () => {
      setTuningOverrideFromDebug();
    });
    panel.querySelector('[data-mp-action="tune-reset"]')?.addEventListener('click', () => {
      resetTuningOverrideFromDebug();
    });
    panel.querySelector('[data-mp-action="tune-log"]')?.addEventListener('click', () => {
      requestTuningSnapshot({ silent: false });
    });
    panelInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      joinRoom(panelInput?.value);
    });

    document.body.appendChild(panel);
    applyDebugPanelVisibility();
    renderDebugPanel();
    return panel;
  }

  function ensureAbilityHud() {
    if (abilityHud && document.body.contains(abilityHud)) return abilityHud;
    if (!document.body) return null;

    ensureDebugPanelStyles();

    abilityHud = document.createElement('section');
    abilityHud.className = 'mpAbilityHud';
    abilityHud.setAttribute('aria-label', 'Multiplayer ability HUD');
    abilityHudSlots = [];

    ABILITY_HUD_SLOTS.forEach((slotDef, index) => {
      const slot = document.createElement('div');
      slot.className = 'mpAbilitySlot mpAbilitySlotUnavailable';
      slot.dataset.slotIndex = String(index);

      const top = document.createElement('div');
      top.className = 'mpAbilitySlotTop';

      const nameEl = document.createElement('span');
      nameEl.className = 'mpAbilityName';
      nameEl.textContent = 'Empty';

      const keyEl = document.createElement('span');
      keyEl.className = 'mpAbilityKey';
      keyEl.textContent = slotDef.key;

      top.appendChild(nameEl);
      top.appendChild(keyEl);

      const stateEl = document.createElement('div');
      stateEl.className = 'mpAbilityState';
      stateEl.textContent = 'Not active';

      slot.appendChild(top);
      slot.appendChild(stateEl);
      abilityHud.appendChild(slot);
      abilityHudSlots.push({
        slot,
        nameEl,
        keyEl,
        stateEl
      });
    });

    abilityStateBar = document.createElement('div');
    abilityStateBar.className = 'mpAbilityStateBar';

    abilityStateCharge = document.createElement('div');
    abilityStateCharge.className = 'mpAbilityStateChip';
    abilityStateCharge.textContent = 'Charge: idle';

    abilityStateHook = document.createElement('div');
    abilityStateHook.className = 'mpAbilityStateChip';
    abilityStateHook.textContent = 'Hook: 0/0';

    abilityStateWall = document.createElement('div');
    abilityStateWall.className = 'mpAbilityStateChip';
    abilityStateWall.textContent = 'Wall: 0/0';

    abilityStateBar.appendChild(abilityStateCharge);
    abilityStateBar.appendChild(abilityStateHook);
    abilityStateBar.appendChild(abilityStateWall);
    abilityHud.appendChild(abilityStateBar);

    document.body.appendChild(abilityHud);
    return abilityHud;
  }

  function shouldShowAbilityHud() {
    if (!isDebugVisible) return false;
    if (!roomSnapshot.code || !roomSnapshot.matchId) return false;
    return roomSnapshot.matchPhase === DEFAULT_MATCH_PHASE
      || roomSnapshot.matchPhase === MATCH_PHASE_COMBAT_COUNTDOWN;
  }

  function renderAbilityHud() {
    ensureAbilityHud();
    if (!abilityHud) return;

    const show = shouldShowAbilityHud();
    abilityHud.style.display = show ? '' : 'none';
    if (!show) return;

    ABILITY_HUD_SLOTS.forEach((slotDef, index) => {
      const slotRefs = abilityHudSlots[index];
      if (!slotRefs) return;

      const abilityId = getAbilityForHudSlot(slotDef);
      const label = toAbilityLabel(abilityId);
      const availabilityText = abilityId
        ? getAbilityAvailabilityText(abilityId)
        : 'empty';
      const usable = abilityId ? isAbilityUsable(abilityId) : false;

      slotRefs.nameEl.textContent = label;
      slotRefs.keyEl.textContent = slotDef.key;
      slotRefs.stateEl.textContent = availabilityText === 'ready'
        ? 'Ready'
        : availabilityText === 'countdown'
          ? 'Starting'
        : availabilityText;

      slotRefs.slot.classList.remove('mpAbilitySlotReady', 'mpAbilitySlotCooldown', 'mpAbilitySlotUnavailable');
      if (!abilityId || availabilityText === 'empty' || availabilityText === 'not drafted') {
        slotRefs.slot.classList.add('mpAbilitySlotUnavailable');
      } else if (usable) {
        slotRefs.slot.classList.add('mpAbilitySlotReady');
      } else if (/^\d+s$/.test(availabilityText)) {
        slotRefs.slot.classList.add('mpAbilitySlotCooldown');
      } else {
        slotRefs.slot.classList.add('mpAbilitySlotUnavailable');
      }
    });

    const myNumber = Number(roomSnapshot.myMatchPlayerNumber);
    const opponentNumber = getOpponentMatchPlayerNumber();
    const myHooks = (Array.isArray(roomSnapshot.projectiles) ? roomSnapshot.projectiles : [])
      .filter((projectile) =>
        trimString(projectile?.abilityId).toLowerCase() === ABILITY_IDS.HOOK
        && Number(projectile?.ownerPlayerNumber) === myNumber
      )
      .length;
    const oppHooks = (Array.isArray(roomSnapshot.projectiles) ? roomSnapshot.projectiles : [])
      .filter((projectile) =>
        trimString(projectile?.abilityId).toLowerCase() === ABILITY_IDS.HOOK
        && Number(projectile?.ownerPlayerNumber) === opponentNumber
      )
      .length;
    const myWalls = (Array.isArray(roomSnapshot.walls) ? roomSnapshot.walls : [])
      .filter((wall) => Number(wall?.ownerPlayerNumber) === myNumber)
      .length;
    const oppWalls = (Array.isArray(roomSnapshot.walls) ? roomSnapshot.walls : [])
      .filter((wall) => Number(wall?.ownerPlayerNumber) === opponentNumber)
      .length;
    const myChargeActive = Boolean(roomSnapshot.myActiveEffects?.chargeActive);
    const oppChargeActive = Boolean(roomSnapshot.opponentActiveEffects?.chargeActive);

    if (abilityStateCharge) {
      abilityStateCharge.textContent = `Charge: ${myChargeActive ? 'you' : '-'} / ${oppChargeActive ? 'opp' : '-'}`;
      abilityStateCharge.classList.toggle('is-active', myChargeActive || oppChargeActive);
    }
    if (abilityStateHook) {
      abilityStateHook.textContent = `Hook: ${myHooks}/${oppHooks}`;
      abilityStateHook.classList.toggle('is-active', myHooks > 0 || oppHooks > 0);
    }
    if (abilityStateWall) {
      abilityStateWall.textContent = `Wall: ${myWalls}/${oppWalls}`;
      abilityStateWall.classList.toggle('is-active', myWalls > 0 || oppWalls > 0);
    }
  }

  function getOpponentMatchPlayerNumber() {
    const myNumber = Number(roomSnapshot.myMatchPlayerNumber);
    if (myNumber === 1) return 2;
    if (myNumber === 2) return 1;

    const candidates = (Array.isArray(roomSnapshot.players) ? roomSnapshot.players : [])
      .map((entry) => Number(entry?.matchPlayerNumber))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    return candidates[0] === 1 ? 2 : 1;
  }

  function getCombatCountdownMs() {
    const fromSnapshot = parseNumber(roomSnapshot.combatCountdownRemainingMs);
    if (fromSnapshot !== null) return Math.max(0, fromSnapshot);
    const combatStartsAt = parseNumber(roomSnapshot.combatStartsAt);
    if (combatStartsAt === null) return 0;
    return Math.max(0, combatStartsAt - Date.now());
  }

  function showPhaseBanner(text, durationMs = 1400) {
    const message = trimString(text);
    if (!message) return;
    ensureGameplayUi();
    if (phaseBannerHideTimer !== null) {
      window.clearTimeout(phaseBannerHideTimer);
      phaseBannerHideTimer = null;
    }
    phaseBannerState = {
      text: message,
      shownAt: Date.now(),
      durationMs: Math.max(300, Number(durationMs) || 1400)
    };
    if (!phaseBannerEl) return;
    phaseBannerEl.textContent = message;
    phaseBannerEl.classList.add('is-visible');
    phaseBannerHideTimer = window.setTimeout(() => {
      phaseBannerHideTimer = null;
      phaseBannerState.text = '';
      if (!phaseBannerEl) return;
      phaseBannerEl.classList.remove('is-visible');
      phaseBannerEl.textContent = '';
    }, phaseBannerState.durationMs);
  }

  function renderPhaseBanner() {
    if (!phaseBannerEl) return;
    const now = Date.now();
    const bannerText = trimString(phaseBannerState.text);
    const shouldShow = Boolean(bannerText)
      && (now - Number(phaseBannerState.shownAt || 0)) < Number(phaseBannerState.durationMs || 0);
    phaseBannerEl.textContent = bannerText;
    phaseBannerEl.classList.toggle('is-visible', shouldShow);
    if (!shouldShow && bannerText) {
      phaseBannerState.text = '';
    }
  }

  function renderDraftPickChips(container, spells) {
    if (!container) return;
    const normalized = normalizeSpellList(spells).slice(0, 3);
    container.replaceChildren();
    for (let index = 0; index < 3; index += 1) {
      const spellId = normalized[index];
      const chip = document.createElement('div');
      chip.className = 'mpDraftPickChip';
      if (!spellId) {
        chip.classList.add('is-empty');
        chip.textContent = 'Empty';
      } else {
        chip.textContent = toAbilityLabel(spellId);
      }
      container.appendChild(chip);
    }
  }

  function ensureGameplayUi() {
    if (gameplayUiRoot && document.body.contains(gameplayUiRoot)) return gameplayUiRoot;
    if (!document.body) return null;

    ensureDebugPanelStyles();
    gameplayDraftButtons = new Map();
    gameplayUiRoot = document.createElement('section');
    gameplayUiRoot.className = 'mpGameplayUi';
    gameplayUiRoot.innerHTML = `
      <div class="mpGameplayRoomBadge" data-mp-game-room-badge></div>
      <div class="mpPhaseBanner" data-mp-game-phase-banner></div>
      <section class="mpDraftPanel" data-mp-game-draft>
        <div class="mpDraftHeader">
          <div>
            <div class="mpDraftPhase" data-mp-game-draft-header>DRAFT PHASE</div>
            <div class="mpDraftTurn" data-mp-game-draft-turn>Waiting for draft state...</div>
          </div>
          <div class="mpDraftTimerWrap">
            <span class="mpDraftTimerLabel">Timer</span>
            <strong class="mpDraftTimerValue" data-mp-game-draft-timer>0s</strong>
          </div>
        </div>
        <div class="mpDraftPicksWrap">
          <div class="mpDraftPicksCol">
            <div class="mpDraftPicksTitle">Your Picks</div>
            <div class="mpDraftPicksRow" data-mp-game-draft-my-picks></div>
          </div>
          <div class="mpDraftPicksCol">
            <div class="mpDraftPicksTitle">Opponent Picks</div>
            <div class="mpDraftPicksRow" data-mp-game-draft-opp-picks></div>
          </div>
        </div>
        <div class="mpDraftPoolGrid" data-mp-game-draft-pool></div>
      </section>
      <div class="mpCombatCountdown" data-mp-game-countdown>3</div>
      <section class="mpMatchEndPanel" data-mp-game-end>
        <div class="mpMatchEndTitle" data-mp-game-end-title>Match End</div>
        <div class="mpMatchEndSub" data-mp-game-end-sub>Waiting for result...</div>
        <div class="mpMatchEndActions">
          <button type="button" class="mpGameBtn mpGameBtnReturn" data-mp-game-action="return">Return to Room</button>
          <button type="button" class="mpGameBtn mpGameBtnRematch" data-mp-game-action="rematch">Reset for Rematch</button>
          <button type="button" class="mpGameBtn mpGameBtnLeave" data-mp-game-action="leave">Leave Room</button>
        </div>
      </section>
    `;

    gameplayRoomBadge = gameplayUiRoot.querySelector('[data-mp-game-room-badge]');
    phaseBannerEl = gameplayUiRoot.querySelector('[data-mp-game-phase-banner]');
    gameplayDraftPanel = gameplayUiRoot.querySelector('[data-mp-game-draft]');
    gameplayDraftHeader = gameplayUiRoot.querySelector('[data-mp-game-draft-header]');
    gameplayDraftTurn = gameplayUiRoot.querySelector('[data-mp-game-draft-turn]');
    gameplayDraftTimer = gameplayUiRoot.querySelector('[data-mp-game-draft-timer]');
    gameplayDraftMyPicks = gameplayUiRoot.querySelector('[data-mp-game-draft-my-picks]');
    gameplayDraftOppPicks = gameplayUiRoot.querySelector('[data-mp-game-draft-opp-picks]');
    gameplayDraftPool = gameplayUiRoot.querySelector('[data-mp-game-draft-pool]');
    gameplayCountdownEl = gameplayUiRoot.querySelector('[data-mp-game-countdown]');
    gameplayEndPanel = gameplayUiRoot.querySelector('[data-mp-game-end]');
    gameplayEndTitle = gameplayUiRoot.querySelector('[data-mp-game-end-title]');
    gameplayEndSub = gameplayUiRoot.querySelector('[data-mp-game-end-sub]');
    gameplayReturnBtn = gameplayUiRoot.querySelector('[data-mp-game-action="return"]');
    gameplayRematchBtn = gameplayUiRoot.querySelector('[data-mp-game-action="rematch"]');
    gameplayLeaveBtn = gameplayUiRoot.querySelector('[data-mp-game-action="leave"]');

    gameplayReturnBtn?.addEventListener('click', () => {
      returnToRoom();
    });
    gameplayRematchBtn?.addEventListener('click', () => {
      resetRoomForRematch();
    });
    gameplayLeaveBtn?.addEventListener('click', () => {
      leaveRoom();
    });

    document.body.appendChild(gameplayUiRoot);
    return gameplayUiRoot;
  }

  function renderGameplayDraftPool(isMyTurn) {
    if (!gameplayDraftPool) return;

    if (!(gameplayDraftButtons instanceof Map)) {
      gameplayDraftButtons = new Map();
    }

    const myNumber = Number(roomSnapshot.myMatchPlayerNumber);
    const isDraftPhase = roomSnapshot.matchPhase === MATCH_PHASE_DRAFT;
    const myDraftedSpells = new Set(
      getDraftedSpellsForPlayer(myNumber).map((spellId) => trimString(spellId).toLowerCase()).filter(Boolean)
    );

    DRAFT_SPELL_LIST.forEach((spellId) => {
      const poolEntry = roomSnapshot.draft?.pool?.[spellId];
      const remainingCopies = Number(poolEntry?.remainingCopies);
      const totalCopies = Number(poolEntry?.totalCopies);
      const remaining = Number.isFinite(remainingCopies) ? remainingCopies : 0;
      const total = Number.isFinite(totalCopies) ? totalCopies : remaining;
      const alreadyPickedByMe = myDraftedSpells.has(spellId);
      const canPick = isDraftPhase && isMyTurn && remaining > 0 && !alreadyPickedByMe && Boolean(socket?.connected);

      let button = gameplayDraftButtons.get(spellId);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'mpDraftSpellBtn';
        button.dataset.spellId = spellId;
        button.addEventListener('click', (event) => {
          const targetSpellId = trimString(event?.currentTarget?.dataset?.spellId).toLowerCase();
          draftPick(targetSpellId || spellId);
        });
        gameplayDraftButtons.set(spellId, button);
      }

      if (button.parentElement !== gameplayDraftPool) {
        gameplayDraftPool.appendChild(button);
      }

      button.classList.toggle('is-ready', canPick);
      button.classList.toggle('is-picked', alreadyPickedByMe);
      button.classList.toggle('is-unavailable', remaining <= 0);
      button.disabled = !canPick;
      button.innerHTML = `
        <span class="mpDraftSpellName">${toAbilityLabel(spellId)}</span>
        <span class="mpDraftSpellCount">${remaining}/${total} copies</span>
      `;
    });
  }

  function renderGameplayDraftPanel() {
    if (!gameplayDraftPanel) return;
    gameplayDraftPanel.classList.remove('is-visible', 'is-my-turn');
    gameplayDraftPanel.style.display = 'none';
  }

  function renderGameplayCountdown() {
    if (!gameplayCountdownEl) return;
    const isCountdown = roomSnapshot.matchPhase === MATCH_PHASE_COMBAT_COUNTDOWN;
    gameplayCountdownEl.style.display = isCountdown ? 'block' : 'none';
    if (!isCountdown) return;
    const countdownMs = getCombatCountdownMs();
    const secondsLeft = Math.max(1, Math.ceil(countdownMs / 1000));
    const showFight = countdownMs <= 380;
    gameplayCountdownEl.textContent = showFight ? 'FIGHT' : String(secondsLeft);
  }

  function renderGameplayEndPanel() {
    if (!gameplayEndPanel) return;
    const isEnd = roomSnapshot.matchPhase === MATCH_PHASE_END;
    const revealReady = !isEnd || Date.now() >= matchEndPanelRevealAt;
    gameplayEndPanel.style.display = (isEnd && revealReady) ? 'block' : 'none';
    if (!isEnd) return;

    const resultText = getMatchResultText() || 'Match Ended';
    const winner = Number(roomSnapshot.winnerPlayerNumber);
    const eliminated = Number(roomSnapshot.eliminatedPlayerNumber);
    const myNumber = Number(roomSnapshot.myMatchPlayerNumber);
    const isWin = Number.isFinite(winner) && Number.isFinite(myNumber) && winner === myNumber;
    const isLoss = Number.isFinite(eliminated) && Number.isFinite(myNumber) && eliminated === myNumber;

    if (gameplayEndTitle) {
      gameplayEndTitle.textContent = resultText.toUpperCase();
      gameplayEndTitle.classList.toggle('is-win', isWin);
      gameplayEndTitle.classList.toggle('is-loss', isLoss);
    }
    if (gameplayEndSub) {
      const winnerText = Number.isFinite(winner) ? `Winner: Player ${winner}` : 'Winner pending';
      const eliminatedText = Number.isFinite(eliminated) ? `Eliminated: Player ${eliminated}` : '';
      gameplayEndSub.textContent = eliminatedText ? `${winnerText} · ${eliminatedText}` : winnerText;
    }

    const canInteract = Boolean(socket?.connected) && Boolean(roomSnapshot.code);
    if (gameplayReturnBtn) gameplayReturnBtn.disabled = !canInteract;
    if (gameplayRematchBtn) gameplayRematchBtn.disabled = !canInteract || roomSnapshot.playerCount < 2;
    if (gameplayLeaveBtn) gameplayLeaveBtn.disabled = !canInteract;
  }

  function renderGameplayRoomBadge() {
    if (!gameplayRoomBadge) return;
    if (!roomSnapshot.code) {
      gameplayRoomBadge.style.display = 'none';
      return;
    }

    const phaseText = roomSnapshot.matchPhase
      ? roomSnapshot.matchPhase.replace(/_/g, ' ')
      : roomSnapshot.state.replace(/_/g, ' ');
    gameplayRoomBadge.style.display = 'block';
    gameplayRoomBadge.textContent = `Room ${roomSnapshot.code} · ${phaseText}`;
  }

  function renderGameplayUi() {
    ensureGameplayUi();
    if (!gameplayUiRoot) return;
    renderGameplayRoomBadge();
    renderGameplayDraftPanel();
    renderGameplayCountdown();
    renderGameplayEndPanel();
    renderPhaseBanner();
  }

  function setStatusMessage(message) {
    if (!panelFields?.message) return;
    panelFields.message.textContent = String(message || 'Ready.');
  }

  function clearReadyToggleAckTimer() {
    if (readyToggleAckTimer === null) return;
    window.clearTimeout(readyToggleAckTimer);
    readyToggleAckTimer = null;
  }

  function startReconnectUiTimer() {
    if (reconnectUiTimer !== null) return;
    reconnectUiTimer = window.setInterval(() => {
      const disconnectedPlayers = getDisconnectedPlayers();
      const inDraftPhase = roomSnapshot.matchPhase === MATCH_PHASE_DRAFT;
      const inCountdownPhase = roomSnapshot.matchPhase === MATCH_PHASE_COMBAT_COUNTDOWN;
      if (!disconnectedPlayers.length && !inDraftPhase && !inCountdownPhase) return;
      refreshTransientDebugPanelValues();
    }, 400);
  }

  function stopReconnectUiTimer() {
    if (reconnectUiTimer === null) return;
    window.clearInterval(reconnectUiTimer);
    reconnectUiTimer = null;
  }

  function refreshTransientDebugPanelValues() {
    if (!panelFields) return;
    if (panelFields.reconnectSummary) {
      panelFields.reconnectSummary.textContent = getReconnectSummaryText();
    }
    if (panelFields.draftCountdown) {
      panelFields.draftCountdown.textContent = roomSnapshot.matchPhase === MATCH_PHASE_DRAFT
        ? formatDurationMs(getDraftTurnCountdownMs())
        : '-';
    }
    renderAbilityHud();
    renderGameplayUi();
  }

  function maybeStoreReconnectIdentityFromPayload(payload) {
    const reconnectToken = trimString(payload?.reconnectToken);
    const reconnectPlayerId = trimString(payload?.reconnectPlayerId);
    const roomCode = normalizeRoomCode(payload?.roomCode || payload?.room?.code || roomSnapshot.code);
    if (!reconnectToken || !roomCode) return;
    roomSnapshot.reconnectToken = reconnectToken;
    if (reconnectPlayerId) {
      roomSnapshot.reconnectPlayerId = reconnectPlayerId;
    }
    saveReconnectIdentity(roomCode, reconnectToken, reconnectPlayerId || roomSnapshot.reconnectPlayerId);
  }

  function attemptReconnectToPreviousSession() {
    if (!socket?.connected) return;
    if (reconnectAttemptInFlight || reconnectAttemptedForCurrentSocket) return;
    if (roomSnapshot.code) return;

    const reconnectIdentity = loadReconnectIdentity();
    if (!reconnectIdentity) return;

    reconnectAttemptInFlight = true;
    reconnectAttemptedForCurrentSocket = true;
    setStatusMessage(`Reconnecting to room ${reconnectIdentity.roomCode}...`);
    console.info(`${LOG_PREFIX} reconnect_room requested code=${reconnectIdentity.roomCode}`);

    socket.emit('reconnect_room', reconnectIdentity, (response) => {
      reconnectAttemptInFlight = false;
      if (!response || response.ok === false) {
        const message = trimString(response?.message) || 'Reconnect failed.';
        clearReconnectIdentity();
        roomSnapshot.reconnectToken = '';
        roomSnapshot.reconnectPlayerId = '';
        setStatusMessage(message);
        renderDebugPanel();
        console.warn(`${LOG_PREFIX} reconnect_room failed`, response);
        return;
      }

      maybeStoreReconnectIdentityFromPayload(response);
      applyRoomPayload(response, ROOM_STATE_WAITING);
      renderDebugPanel();
      const resumedText = response?.resumedMatch ? ' Match resumed.' : '';
      setStatusMessage(`Reconnected to room ${roomSnapshot.code}.${resumedText}`);
      console.info(`${LOG_PREFIX} reconnect_room success`, response);
    });
  }

  function computeMovementInputFromKeyboard() {
    let x = 0;
    let y = 0;

    if (pressedMovementKeys.has('ArrowLeft') || pressedMovementKeys.has('KeyA')) x -= 1;
    if (pressedMovementKeys.has('ArrowRight') || pressedMovementKeys.has('KeyD')) x += 1;
    if (pressedMovementKeys.has('ArrowUp') || pressedMovementKeys.has('KeyW')) y -= 1;
    if (pressedMovementKeys.has('ArrowDown') || pressedMovementKeys.has('KeyS')) y += 1;

    return normalizeMovementInput({ x, y });
  }

  function computeAimInputFromKeyboard() {
    let x = 0;
    let y = 0;

    if (pressedAimKeys.has('KeyJ')) x -= 1;
    if (pressedAimKeys.has('KeyL')) x += 1;
    if (pressedAimKeys.has('KeyI')) y -= 1;
    if (pressedAimKeys.has('KeyK')) y += 1;

    if (x === 0 && y === 0) return null;
    return normalizeMovementInput({ x, y });
  }

  function computeAimInputFromMouse() {
    const mouseX = Number(mouse?.x);
    const mouseY = Number(mouse?.y);
    const playerX = Number(player?.x);
    const playerY = Number(player?.y);

    if (!Number.isFinite(mouseX) || !Number.isFinite(mouseY)) return null;
    if (!Number.isFinite(playerX) || !Number.isFinite(playerY)) return null;

    const dx = mouseX - playerX;
    const dy = mouseY - playerY;
    if ((dx * dx + dy * dy) < 0.0001) return null;

    return normalizeDirectionInput({ x: dx, y: dy });
  }

  function shouldIgnoreKeyboardEvent(event) {
    const target = event?.target;
    if (!target || typeof target !== 'object') return false;
    if (target.isContentEditable) return true;
    const tagName = trimString(target.tagName).toUpperCase();
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
  }

  function bindKeyboardHandlers() {
    if (keyboardHandlersBound) return;
    keyboardHandlersBound = true;

    window.addEventListener('keydown', (event) => {
      if (shouldIgnoreKeyboardEvent(event)) return;
      const code = trimString(event?.code);
      const key = trimString(event?.key).toLowerCase();
      if (!code && !key) return;

      if (MOVEMENT_KEY_CODES.has(code)) {
        pressedMovementKeys.add(code);
        if (code.startsWith('Arrow')) {
          event.preventDefault();
        }
      }

      if (AIM_KEY_CODES.has(code)) {
        pressedAimKeys.add(code);
      }

      if (code === 'Space') {
        event.preventDefault();
        if (!event.repeat) {
          castFireblast();
        }
      }

      if (code === 'KeyQ' || key === 'q') {
        event.preventDefault();
        if (!event.repeat) {
          castDraftedAbilityBySlot(0);
        }
      }

      if (code === 'KeyE' || key === 'e') {
        event.preventDefault();
        if (!event.repeat) {
          castDraftedAbilityBySlot(1);
        }
      }

      if (code === 'KeyR' || key === 'r') {
        event.preventDefault();
        if (!event.repeat) {
          castDraftedAbilityBySlot(2);
        }
      }
    });

    window.addEventListener('keyup', (event) => {
      if (shouldIgnoreKeyboardEvent(event)) return;
      const code = trimString(event?.code);
      if (!code) return;

      if (MOVEMENT_KEY_CODES.has(code)) {
        pressedMovementKeys.delete(code);
      }
      if (AIM_KEY_CODES.has(code)) {
        pressedAimKeys.delete(code);
      }
    });

    // Ensure keys do not remain stuck when the tab loses focus.
    window.addEventListener('blur', () => {
      resetRealtimeInputState({ emitNeutral: true });
    });
  }

  function stopMovementInputLoop() {
    if (movementInputTimer !== null) {
      window.clearInterval(movementInputTimer);
      movementInputTimer = null;
    }
    resetRealtimeInputState({ emitNeutral: false });
  }

  function startMovementInputLoop() {
    if (movementInputTimer !== null) return;

    movementInputTimer = window.setInterval(() => {
      if (!socket?.connected) return;
      if (!isRoomInMatchFlow(roomSnapshot.state) || !roomSnapshot.matchId) return;
      if (roomSnapshot.matchPhase !== DEFAULT_MATCH_PHASE) return;
      if (roomSnapshot.matchPaused) return;

      const nextInput = computeMovementInputFromKeyboard();
      if (!movementInputEquals(nextInput, lastSentInput)) {
        socket.emit('player_input', nextInput);
        lastSentInput = nextInput;
      }

      const nextAim = computeAimInputFromMouse() || computeAimInputFromKeyboard();
      if (nextAim && !movementInputEquals(nextAim, lastSentAim)) {
        socket.emit('player_aim', nextAim);
        lastSentAim = nextAim;
      }
    }, INPUT_SEND_INTERVAL_MS);
  }

  function getPlayerAtSlot(slot) {
    return roomSnapshot.players.find((entry) => Number(entry?.slot) === slot) || null;
  }

  function getSlotText(slot) {
    const player = getPlayerAtSlot(slot);
    if (!player) return `P${slot}: empty`;

    const readyText = player.ready ? 'ready' : 'not ready';
    const connectionText = player.connected === false ? 'disconnected' : 'connected';
    const youText = player.socketId && socket?.id === player.socketId ? ' (you)' : '';
    const matchNumberText = Number.isFinite(player.matchPlayerNumber) ? ` #${player.matchPlayerNumber}` : '';
    return `P${slot}: ${readyText}, ${connectionText}${matchNumberText}${youText} [${compactSocketId(player.socketId)}]`;
  }

  function updateStateStyles() {
    if (!panelFields?.state) return;
    panelFields.state.classList.remove('mpDebugStateWaiting', 'mpDebugStateReadyCheck', 'mpDebugStateStarting', 'mpDebugStateInMatch');
    if (roomSnapshot.state === ROOM_STATE_WAITING) {
      panelFields.state.classList.add('mpDebugStateWaiting');
    } else if (roomSnapshot.state === ROOM_STATE_READY_CHECK) {
      panelFields.state.classList.add('mpDebugStateReadyCheck');
    } else if (roomSnapshot.state === ROOM_STATE_STARTING) {
      panelFields.state.classList.add('mpDebugStateStarting');
    } else if (isRoomInMatchFlow(roomSnapshot.state)) {
      panelFields.state.classList.add('mpDebugStateInMatch');
    }
  }

  function renderDebugPanel() {
    ensureDebugPanel();
    ensureGameplayUi();
    ensureAbilityHud();
    if (!panelFields) return;

    panelFields.roomCode.textContent = roomSnapshot.code || '-';
    panelFields.playerCount.textContent = `${roomSnapshot.playerCount}/2`;
    panelFields.state.textContent = roomSnapshot.state || ROOM_STATE_IDLE;
    panelFields.slot.textContent = Number.isFinite(roomSnapshot.slot) ? String(roomSnapshot.slot) : '-';
    panelFields.socket.textContent = socket?.connected ? (socket.id || 'connected') : 'offline';
    panelFields.connectedCount.textContent = `${Number(roomSnapshot.connectedPlayerCount) || 0}/2`;
    panelFields.reconnectSummary.textContent = getReconnectSummaryText();
    panelFields.slot1.textContent = getSlotText(1);
    panelFields.slot2.textContent = getSlotText(2);
    panelFields.matchStarted.textContent = roomSnapshot.matchId ? 'yes' : 'no';
    panelFields.matchId.textContent = roomSnapshot.matchId || '-';
    panelFields.matchStartedAt.textContent = formatStartedAt(roomSnapshot.matchStartedAt);
    panelFields.matchPlayerNumber.textContent = Number.isFinite(roomSnapshot.myMatchPlayerNumber) ? String(roomSnapshot.myMatchPlayerNumber) : '-';
    panelFields.mySpawn.textContent = formatPosition(roomSnapshot.mySpawnPosition);
    panelFields.myPos.textContent = formatPosition(roomSnapshot.myPosition);
    panelFields.myVel.textContent = formatPosition(roomSnapshot.myVelocity);
    panelFields.myAim.textContent = formatPosition(roomSnapshot.myAimDirection);
    panelFields.myLoadout.textContent = formatSpellList(roomSnapshot.myLoadout);
    panelFields.oppLoadout.textContent = formatSpellList(roomSnapshot.opponentLoadout);
    panelFields.myAbilitySummary.textContent = roomSnapshot.myLoadout.length
      ? roomSnapshot.myLoadout
        .map((abilityId) => `${toAbilityLabel(abilityId)}:${getAbilityAvailabilityText(abilityId)}`)
        .join(' | ')
      : '-';
    panelFields.myBlinkState.textContent = getBlinkAvailabilityText();
    panelFields.oppPos.textContent = formatPosition(roomSnapshot.opponentPosition);
    panelFields.oppVel.textContent = formatPosition(roomSnapshot.opponentVelocity);
    panelFields.oppAim.textContent = formatPosition(roomSnapshot.opponentAimDirection);
    panelFields.matchPaused.textContent = roomSnapshot.matchPaused ? 'yes' : 'no';
    panelFields.matchPauseReason.textContent = roomSnapshot.matchPauseReason || '-';
    panelFields.matchPhase.textContent = roomSnapshot.matchPhase || '-';
    panelFields.eliminatedPlayer.textContent = Number.isFinite(Number(roomSnapshot.eliminatedPlayerNumber))
      ? `P${Number(roomSnapshot.eliminatedPlayerNumber)}`
      : '-';
    panelFields.winnerPlayer.textContent = Number.isFinite(Number(roomSnapshot.winnerPlayerNumber))
      ? `P${Number(roomSnapshot.winnerPlayerNumber)}`
      : '-';
    panelFields.matchResult.textContent = getMatchResultText() || '-';
    panelFields.matchEndedAt.textContent = formatStartedAt(roomSnapshot.matchEndedAt);
    panelFields.matchTickAt.textContent = formatStartedAt(roomSnapshot.matchStateTimestamp);
    panelFields.projectileCount.textContent = String(roomSnapshot.projectileCount || 0);
    panelFields.wallCount.textContent = String(roomSnapshot.wallCount || 0);
    panelFields.lastHit.textContent = formatHitEvent(roomSnapshot.lastHitEvent);
    panelFields.spawns.textContent = formatSpawnPositions(roomSnapshot.spawnPositions);
    const currentTurnPlayerNumber = Number(roomSnapshot.draft?.currentTurnPlayerNumber);
    panelFields.draftTurn.textContent = Number.isFinite(currentTurnPlayerNumber) ? `P${currentTurnPlayerNumber}` : '-';
    panelFields.draftCountdown.textContent = roomSnapshot.matchPhase === MATCH_PHASE_DRAFT
      ? formatDurationMs(getDraftTurnCountdownMs())
      : '-';
    const myNumber = Number(roomSnapshot.myMatchPlayerNumber);
    const opponentNumber = Number.isFinite(myNumber) && myNumber === 1 ? 2 : 1;
    panelFields.myDraftedSpells.textContent = formatSpellList(getDraftedSpellsForPlayer(myNumber));
    panelFields.oppDraftedSpells.textContent = formatSpellList(getDraftedSpellsForPlayer(opponentNumber));
    panelFields.draftPool.textContent = formatDraftPool();
    if (panelFields.tuningUpdatedAt) {
      panelFields.tuningUpdatedAt.textContent = tuningUpdatedAt ? formatStartedAt(tuningUpdatedAt) : '-';
    }
    if (panelFields.tuningSummary) {
      panelFields.tuningSummary.textContent = formatTuningSnapshotSummary();
    }
    renderDraftButtons();
    updateStateStyles();

    if (panelFields.readyButton) {
      const canToggleReady = Boolean(roomSnapshot.code)
        && roomSnapshot.playerCount >= 2
        && Boolean(socket?.connected)
        && !isRoomInMatchFlow(roomSnapshot.state)
        && roomSnapshot.state !== ROOM_STATE_STARTING;
      panelFields.readyButton.disabled = !canToggleReady;
      if (isRoomInMatchFlow(roomSnapshot.state)) {
        panelFields.readyButton.textContent = 'Match Live';
      } else if (roomSnapshot.state === ROOM_STATE_STARTING) {
        panelFields.readyButton.textContent = 'Starting...';
      } else {
        panelFields.readyButton.textContent = roomSnapshot.selfReady ? 'Set Not Ready' : 'Set Ready';
      }
    }

    const canCastAnyAbility = Boolean(roomSnapshot.code)
      && Boolean(socket?.connected)
      && Boolean(roomSnapshot.matchId)
      && roomSnapshot.matchPhase === DEFAULT_MATCH_PHASE
      && !roomSnapshot.matchPaused;
    if (panelFields.abilityFireblastButton) {
      panelFields.abilityFireblastButton.disabled = !canCastAnyAbility;
      panelFields.abilityFireblastButton.textContent = `Fireblast (Space) - ${getAbilityAvailabilityText(ABILITY_IDS.FIREBLAST)}`;
    }
    if (panelFields.abilityQButton) {
      const slotAbilityId = getDraftedAbilityBySlotIndex(0);
      panelFields.abilityQButton.disabled = !canCastAnyAbility || !slotAbilityId;
      panelFields.abilityQButton.textContent = `${toAbilityLabel(slotAbilityId)} (Q) - ${getAbilityAvailabilityText(slotAbilityId)}`;
    }
    if (panelFields.abilityEButton) {
      const slotAbilityId = getDraftedAbilityBySlotIndex(1);
      panelFields.abilityEButton.disabled = !canCastAnyAbility || !slotAbilityId;
      panelFields.abilityEButton.textContent = `${toAbilityLabel(slotAbilityId)} (E) - ${getAbilityAvailabilityText(slotAbilityId)}`;
    }
    if (panelFields.abilityRButton) {
      const slotAbilityId = getDraftedAbilityBySlotIndex(2);
      panelFields.abilityRButton.disabled = !canCastAnyAbility || !slotAbilityId;
      panelFields.abilityRButton.textContent = `${toAbilityLabel(slotAbilityId)} (R) - ${getAbilityAvailabilityText(slotAbilityId)}`;
    }

    if (panelFields.returnButton) {
      const canReturnToRoom = Boolean(roomSnapshot.code)
        && Boolean(socket?.connected)
        && isRoomInMatchFlow(roomSnapshot.state)
        && roomSnapshot.matchPhase === MATCH_PHASE_END;
      panelFields.returnButton.style.display = canReturnToRoom ? 'block' : 'none';
      panelFields.returnButton.disabled = !canReturnToRoom;
    }

    if (
      getDisconnectedPlayers().length > 0
      || roomSnapshot.matchPhase === MATCH_PHASE_DRAFT
      || roomSnapshot.matchPhase === MATCH_PHASE_COMBAT_COUNTDOWN
    ) {
      startReconnectUiTimer();
    } else {
      stopReconnectUiTimer();
    }

    renderAbilityHud();
    renderGameplayUi();
  }

  function getDraftedSpellsForPlayer(matchPlayerNumber) {
    const playerEntry = (Array.isArray(roomSnapshot.players) ? roomSnapshot.players : [])
      .find((entry) => Number(entry?.matchPlayerNumber) === Number(matchPlayerNumber));
    if (playerEntry && Array.isArray(playerEntry.draftedSpells) && playerEntry.draftedSpells.length > 0) {
      return playerEntry.draftedSpells
        .map((spellId) => trimString(spellId))
        .filter(Boolean);
    }

    const draftPicks = roomSnapshot.draft?.picksByPlayerNumber?.[matchPlayerNumber];
    if (Array.isArray(draftPicks) && draftPicks.length > 0) {
      return draftPicks.map((spellId) => trimString(spellId)).filter(Boolean);
    }
    return [];
  }

  function renderDraftButtons() {
    if (!panelFields?.draftButtons) return;
    const container = panelFields.draftButtons;
    if (!(draftButtonElements instanceof Map)) {
      draftButtonElements = new Map();
    }
    if (draftButtonElements.size === 0 && container.children.length > 0) {
      container.innerHTML = '';
    }

    const myNumber = Number(roomSnapshot.myMatchPlayerNumber);
    const currentTurnPlayerNumber = Number(roomSnapshot.draft?.currentTurnPlayerNumber);
    const isDraftPhase = roomSnapshot.matchPhase === MATCH_PHASE_DRAFT;
    const isMyTurn = Number.isFinite(myNumber) && myNumber === currentTurnPlayerNumber;
    const myDraftedSpells = new Set(
      getDraftedSpellsForPlayer(myNumber).map((spellId) => trimString(spellId).toLowerCase()).filter(Boolean)
    );

    DRAFT_SPELL_LIST.forEach((spellId) => {
      const poolEntry = roomSnapshot.draft?.pool?.[spellId];
      const remainingCopies = Number(poolEntry?.remainingCopies);
      const totalCopies = Number(poolEntry?.totalCopies);
      const remaining = Number.isFinite(remainingCopies) ? remainingCopies : 0;
      const total = Number.isFinite(totalCopies) ? totalCopies : remaining;
      const alreadyPickedByMe = myDraftedSpells.has(spellId);
      const canPick = isDraftPhase && isMyTurn && remaining > 0 && !alreadyPickedByMe && Boolean(socket?.connected);
      let button = draftButtonElements.get(spellId);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'mpDebugDraftBtn';
        button.dataset.spellId = spellId;
        button.addEventListener('click', (event) => {
          const targetSpellId = trimString(event?.currentTarget?.dataset?.spellId).toLowerCase();
          draftPick(targetSpellId || spellId);
        });
        draftButtonElements.set(spellId, button);
      }

      if (button.parentElement !== container) {
        container.appendChild(button);
      }

      const nextLabel = `${spellId} (${remaining}/${total})`;
      if (button.textContent !== nextLabel) {
        button.textContent = nextLabel;
      }
      button.disabled = !canPick;
    });
  }

  function draftPick(spellId) {
    const normalizedSpellId = trimString(spellId).toLowerCase();
    if (!normalizedSpellId) return;
    if (!roomSnapshot.code || roomSnapshot.matchPhase !== MATCH_PHASE_DRAFT) {
      setStatusMessage('Draft is not active.');
      return;
    }

    const now = Date.now();
    if ((now - pendingDraftRequestAt) < CLIENT_DRAFT_REQUEST_COALESCE_MS) {
      return;
    }
    pendingDraftRequestAt = now;
    const requestId = createClientActionId('draft');

    const requested = emitWhenConnected(
      'draft_pick',
      { spellId: normalizedSpellId, requestId },
      'Sending draft pick...',
      (response) => {
        pendingDraftRequestAt = 0;
        if (!response) return;
        if (response.ok === false) {
          const message = trimString(response?.message) || 'Draft pick rejected.';
          setStatusMessage(message);
          return;
        }
        if (response.room) {
          maybeStoreReconnectIdentityFromPayload(response);
          applyRoomPayload(response, roomSnapshot.code ? ROOM_STATE_WAITING : ROOM_STATE_IDLE);
          renderDebugPanel();
        }
        const pickedSpellId = trimString(response?.spellId) || normalizedSpellId;
        setStatusMessage(`Draft pick locked: ${pickedSpellId}`);
      }
    );
    if (!requested) {
      pendingDraftRequestAt = 0;
      return;
    }
    console.info(`${LOG_PREFIX} draft_pick requested spell=${normalizedSpellId} requestId=${requestId}`);
  }

  function clearRoomSnapshot(state = ROOM_STATE_IDLE) {
    invalidateRuntimeSnapshotCache();
    resetRealtimeInputState({ emitNeutral: false });
    roomSnapshot = createInitialRoomSnapshot(state);
    matchEndPanelRevealAt = 0;
    if (phaseBannerHideTimer !== null) {
      window.clearTimeout(phaseBannerHideTimer);
      phaseBannerHideTimer = null;
    }
    phaseBannerState.text = '';
    if (phaseBannerEl) {
      phaseBannerEl.classList.remove('is-visible');
      phaseBannerEl.textContent = '';
    }
    stopReconnectUiTimer();
    if (state === ROOM_STATE_OFFLINE) {
      stopQuickMatchHeartbeatLoop();
    }
  }

  function applyMatchPayload(payload, players) {
    invalidateRuntimeSnapshotCache();
    const payloadObject = payload && typeof payload === 'object' ? payload : null;
    const payloadMatch = payloadObject?.match && typeof payloadObject.match === 'object'
      ? payloadObject.match
      : null;
    const topLevelMatchId = trimString(payloadObject?.matchId);
    const match = payloadMatch || (topLevelMatchId
      ? {
          matchId: topLevelMatchId,
          roomCode: trimString(payloadObject?.roomCode) || roomSnapshot.code,
          startedAt: parseNumber(payloadObject?.startedAt) || roomSnapshot.matchStartedAt,
          phase: trimString(payloadObject?.phase) || roomSnapshot.matchPhase || DEFAULT_MATCH_PHASE,
          combatStartsAt: parseNumber(payloadObject?.combatStartsAt) || roomSnapshot.combatStartsAt,
          combatCountdownSeconds: parseNumber(payloadObject?.combatCountdownSeconds) || roomSnapshot.combatCountdownSeconds,
          combatCountdownRemainingMs: parseNumber(payloadObject?.combatCountdownRemainingMs) || roomSnapshot.combatCountdownRemainingMs,
          isPaused: Boolean(payloadObject?.isPaused),
          pauseReason: trimString(payloadObject?.pauseReason),
          pausedByPlayerNumber: parseNumber(payloadObject?.pausedByPlayerNumber),
          pausedAt: parseNumber(payloadObject?.pausedAt),
          draft: payloadObject?.draft,
          players: Array.isArray(payloadObject?.players) ? payloadObject.players : [],
          spawnPositions: payloadObject?.spawnPositions || roomSnapshot.spawnPositions,
          arenaBoundary: payloadObject?.arenaBoundary || roomSnapshot.arenaBoundary,
          projectiles: Array.isArray(payloadObject?.projectiles) ? payloadObject.projectiles : roomSnapshot.projectiles,
          walls: Array.isArray(payloadObject?.walls) ? payloadObject.walls : roomSnapshot.walls,
          hitEvents: Array.isArray(payloadObject?.hitEvents) ? payloadObject.hitEvents : roomSnapshot.hitEvents,
          eliminatedPlayerNumber: parseNumber(payloadObject?.eliminatedPlayerNumber) || roomSnapshot.eliminatedPlayerNumber,
          winnerPlayerNumber: parseNumber(payloadObject?.winnerPlayerNumber) || roomSnapshot.winnerPlayerNumber,
          endedAt: parseNumber(payloadObject?.endedAt) || roomSnapshot.matchEndedAt
        }
      : null);
    const matchId = trimString(match?.matchId);
    if (!matchId) {
      matchEndPanelRevealAt = 0;
      roomSnapshot.matchId = '';
      roomSnapshot.matchPhase = '';
      roomSnapshot.matchPaused = false;
      roomSnapshot.matchPauseReason = '';
      roomSnapshot.matchPausedByPlayerNumber = null;
      roomSnapshot.matchPausedAt = null;
      roomSnapshot.combatStartsAt = null;
      roomSnapshot.combatCountdownSeconds = 0;
      roomSnapshot.combatCountdownRemainingMs = 0;
      roomSnapshot.matchStartedAt = null;
      roomSnapshot.matchEndedAt = null;
      roomSnapshot.eliminatedPlayerNumber = null;
      roomSnapshot.winnerPlayerNumber = null;
      roomSnapshot.myMatchPlayerNumber = null;
      roomSnapshot.mySpawnPosition = null;
      roomSnapshot.opponentSpawnPosition = null;
      roomSnapshot.myPosition = null;
      roomSnapshot.opponentPosition = null;
      roomSnapshot.myVelocity = null;
      roomSnapshot.opponentVelocity = null;
      roomSnapshot.myAimDirection = null;
      roomSnapshot.opponentAimDirection = null;
      roomSnapshot.myLoadout = [];
      roomSnapshot.opponentLoadout = [];
      roomSnapshot.myDraftedLoadout = [];
      roomSnapshot.opponentDraftedLoadout = [];
      roomSnapshot.myAbilityCooldowns = {};
      roomSnapshot.myAbilityReadyAt = {};
      roomSnapshot.myActiveEffects = {
        shieldUntil: 0,
        shieldRemainingMs: 0,
        shieldActive: false,
        chargeActive: false,
        chargeRemainingDistance: 0,
        chargeDirection: null
      };
      roomSnapshot.opponentActiveEffects = {
        shieldUntil: 0,
        shieldRemainingMs: 0,
        shieldActive: false,
        chargeActive: false,
        chargeRemainingDistance: 0,
        chargeDirection: null
      };
      roomSnapshot.myBlinkReadyAt = 0;
      roomSnapshot.myBlinkRemainingMs = 0;
      roomSnapshot.myBlinkAvailable = false;
      roomSnapshot.myHasBlink = false;
      roomSnapshot.matchStateTimestamp = null;
      roomSnapshot.projectiles = [];
      roomSnapshot.projectileCount = 0;
      roomSnapshot.walls = [];
      roomSnapshot.wallCount = 0;
      roomSnapshot.hitEvents = [];
      roomSnapshot.lastHitEvent = null;
      roomSnapshot.matchResult = '';
      roomSnapshot.draft = {
        status: '',
        currentTurnIndex: 0,
        currentTurnPlayerNumber: null,
        turnDurationMs: 0,
        turnStartedAt: null,
        turnEndsAt: null,
        turnRemainingMs: 0,
        turnOrder: [],
        pool: {},
        picksByPlayerNumber: {
          1: [],
          2: []
        }
      };
      roomSnapshot.spawnPositions = {
        player1: null,
        player2: null
      };
      roomSnapshot.arenaBoundary = normalizeArenaBoundary(null);
      return;
    }

    roomSnapshot.matchId = matchId;
    roomSnapshot.matchPhase = trimString(match?.phase) || DEFAULT_MATCH_PHASE;
    roomSnapshot.matchPaused = Boolean(match?.isPaused);
    roomSnapshot.matchPauseReason = trimString(match?.pauseReason);
    roomSnapshot.matchPausedByPlayerNumber = parseNumber(match?.pausedByPlayerNumber) || null;
    roomSnapshot.matchPausedAt = parseNumber(match?.pausedAt) || null;
    roomSnapshot.combatStartsAt = parseNumber(match?.combatStartsAt) || parseNumber(payload?.combatStartsAt) || null;
    roomSnapshot.combatCountdownSeconds = parseNumber(match?.combatCountdownSeconds) || parseNumber(payload?.combatCountdownSeconds) || 0;
    roomSnapshot.combatCountdownRemainingMs = parseNumber(match?.combatCountdownRemainingMs) || parseNumber(payload?.combatCountdownRemainingMs) || 0;
    roomSnapshot.matchStartedAt = parseNumber(match?.startedAt) || roomSnapshot.matchStartedAt;
    roomSnapshot.matchEndedAt = parseNumber(match?.endedAt) || parseNumber(payload?.endedAt) || null;
    roomSnapshot.eliminatedPlayerNumber = parseNumber(match?.eliminatedPlayerNumber) || parseNumber(payload?.eliminatedPlayerNumber) || null;
    roomSnapshot.winnerPlayerNumber = parseNumber(match?.winnerPlayerNumber) || parseNumber(payload?.winnerPlayerNumber) || null;
    roomSnapshot.matchStateTimestamp = parseNumber(payload?.timestamp) || roomSnapshot.matchStateTimestamp;
    roomSnapshot.spawnPositions = resolveSpawnPositions(match, payload?.spawnPositions);
    roomSnapshot.arenaBoundary = normalizeArenaBoundary(match?.arenaBoundary || payload?.arenaBoundary);
    const draftPayload = match?.draft && typeof match.draft === 'object' ? match.draft : null;
    const draftPool = draftPayload?.pool && typeof draftPayload.pool === 'object'
      ? draftPayload.pool
      : {};
    const picksByPlayer = draftPayload?.picksByPlayerNumber && typeof draftPayload.picksByPlayerNumber === 'object'
      ? draftPayload.picksByPlayerNumber
      : {};
    roomSnapshot.draft = {
      status: trimString(draftPayload?.status),
      currentTurnIndex: parseNumber(draftPayload?.currentTurnIndex) || 0,
      currentTurnPlayerNumber: parseNumber(draftPayload?.currentTurnPlayerNumber),
      turnDurationMs: parseNumber(draftPayload?.turnDurationMs) || 0,
      turnStartedAt: parseNumber(draftPayload?.turnStartedAt),
      turnEndsAt: parseNumber(draftPayload?.turnEndsAt),
      turnRemainingMs: parseNumber(draftPayload?.turnRemainingMs) || 0,
      turnOrder: Array.isArray(draftPayload?.turnOrder)
        ? draftPayload.turnOrder.map((value) => parseNumber(value) || 0)
        : [],
      pool: DRAFT_SPELL_LIST.reduce((acc, spellId) => {
        const entry = draftPool?.[spellId];
        acc[spellId] = {
          totalCopies: parseNumber(entry?.totalCopies) || 0,
          remainingCopies: parseNumber(entry?.remainingCopies) || 0
        };
        return acc;
      }, {}),
      picksByPlayerNumber: {
        1: Array.isArray(picksByPlayer?.[1]) ? picksByPlayer[1].map((spellId) => trimString(spellId)).filter(Boolean) : [],
        2: Array.isArray(picksByPlayer?.[2]) ? picksByPlayer[2].map((spellId) => trimString(spellId)).filter(Boolean) : []
      }
    };

    const myNumberFromPayload = parseNumber(payload?.matchPlayerNumber);
    if (myNumberFromPayload !== null) {
      roomSnapshot.myMatchPlayerNumber = myNumberFromPayload;
    } else {
      const selfPlayer = players.find((entry) => entry?.socketId === socket?.id);
      const myNumberFromRoom = parseNumber(selfPlayer?.matchPlayerNumber);
      roomSnapshot.myMatchPlayerNumber = myNumberFromRoom;
    }

    const payloadMySpawn = normalizePosition(payload?.mySpawnPosition);
    const payloadOpponentSpawn = normalizePosition(payload?.opponentSpawnPosition);
    const myNumber = roomSnapshot.myMatchPlayerNumber;
    const mySpawnFromMap = myNumber === 1
      ? normalizePosition(roomSnapshot.spawnPositions.player1)
      : myNumber === 2
        ? normalizePosition(roomSnapshot.spawnPositions.player2)
        : null;
    const opponentSpawnFromMap = myNumber === 1
      ? normalizePosition(roomSnapshot.spawnPositions.player2)
      : myNumber === 2
        ? normalizePosition(roomSnapshot.spawnPositions.player1)
        : null;

    roomSnapshot.mySpawnPosition = payloadMySpawn || mySpawnFromMap;
    roomSnapshot.opponentSpawnPosition = payloadOpponentSpawn || opponentSpawnFromMap;

    const matchPlayers = Array.isArray(match?.players) ? match.players : [];
    const selfMatchPlayer = matchPlayers.find((entry) => trimString(entry?.socketId) === socket?.id);
    const player1MatchState = matchPlayers.find((entry) => Number(entry?.matchPlayerNumber) === 1) || null;
    const player2MatchState = matchPlayers.find((entry) => Number(entry?.matchPlayerNumber) === 2) || null;
    const selfMatchPlayerFromNumber = myNumber === 1
      ? player1MatchState
      : myNumber === 2
        ? player2MatchState
        : null;
    const opponentMatchPlayer = myNumber === 1
      ? player2MatchState
      : myNumber === 2
        ? player1MatchState
        : null;
    const selfPositionFromSocket = normalizePosition(selfMatchPlayer?.position);
    const selfPositionFromNumber = myNumber === 1
      ? normalizePosition(player1MatchState?.position)
      : myNumber === 2
        ? normalizePosition(player2MatchState?.position)
        : null;
    const opponentPositionFromNumber = myNumber === 1
      ? normalizePosition(player2MatchState?.position)
      : myNumber === 2
        ? normalizePosition(player1MatchState?.position)
        : null;
    const selfVelocityFromSocket = normalizePosition(selfMatchPlayer?.velocity);
    const selfVelocityFromNumber = myNumber === 1
      ? normalizePosition(player1MatchState?.velocity)
      : myNumber === 2
        ? normalizePosition(player2MatchState?.velocity)
        : null;
    const opponentVelocityFromNumber = myNumber === 1
      ? normalizePosition(player2MatchState?.velocity)
      : myNumber === 2
        ? normalizePosition(player1MatchState?.velocity)
        : null;
    const selfAimFromSocket = normalizePosition(selfMatchPlayer?.aim);
    const selfAimFromNumber = myNumber === 1
      ? normalizePosition(player1MatchState?.aim)
      : myNumber === 2
        ? normalizePosition(player2MatchState?.aim)
        : null;
    const opponentAimFromNumber = myNumber === 1
      ? normalizePosition(player2MatchState?.aim)
      : myNumber === 2
        ? normalizePosition(player1MatchState?.aim)
        : null;

    roomSnapshot.myPosition = selfPositionFromSocket || selfPositionFromNumber;
    roomSnapshot.opponentPosition = opponentPositionFromNumber;
    roomSnapshot.myVelocity = selfVelocityFromSocket || selfVelocityFromNumber;
    roomSnapshot.opponentVelocity = opponentVelocityFromNumber;
    roomSnapshot.myAimDirection = selfAimFromSocket || selfAimFromNumber;
    roomSnapshot.opponentAimDirection = opponentAimFromNumber;

    const selfCombatState = selfMatchPlayer || selfMatchPlayerFromNumber;
    const selfLoadout = normalizeSpellList(selfCombatState?.loadout?.length ? selfCombatState.loadout : selfCombatState?.loadoutSpells);
    const opponentLoadout = normalizeSpellList(opponentMatchPlayer?.loadout?.length ? opponentMatchPlayer.loadout : opponentMatchPlayer?.loadoutSpells);
    roomSnapshot.myLoadout = selfLoadout;
    roomSnapshot.opponentLoadout = opponentLoadout;
    roomSnapshot.myDraftedLoadout = getDraftedLoadout(selfLoadout);
    roomSnapshot.opponentDraftedLoadout = getDraftedLoadout(opponentLoadout);
    roomSnapshot.myHasBlink = selfLoadout.includes(ABILITY_IDS.BLINK);

    const abilityCooldownsPayload = selfCombatState?.abilityCooldowns && typeof selfCombatState.abilityCooldowns === 'object'
      ? selfCombatState.abilityCooldowns
      : {};
    const abilityReadyAtPayload = selfCombatState?.abilityReadyAt && typeof selfCombatState.abilityReadyAt === 'object'
      ? selfCombatState.abilityReadyAt
      : {};
    const normalizedCooldowns = {};
    const normalizedReadyAt = {};
    Object.keys(abilityCooldownsPayload).forEach((abilityId) => {
      const normalizedAbilityId = trimString(abilityId).toLowerCase();
      if (!normalizedAbilityId) return;
      normalizedCooldowns[normalizedAbilityId] = Math.max(0, parseNumber(abilityCooldownsPayload[abilityId]) || 0);
    });
    Object.keys(abilityReadyAtPayload).forEach((abilityId) => {
      const normalizedAbilityId = trimString(abilityId).toLowerCase();
      if (!normalizedAbilityId) return;
      normalizedReadyAt[normalizedAbilityId] = Math.max(0, parseNumber(abilityReadyAtPayload[abilityId]) || 0);
    });
    roomSnapshot.myAbilityCooldowns = normalizedCooldowns;
    roomSnapshot.myAbilityReadyAt = normalizedReadyAt;

    const activeEffectsPayload = selfCombatState?.activeEffects && typeof selfCombatState.activeEffects === 'object'
      ? selfCombatState.activeEffects
      : {};
    const shieldUntil = parseNumber(activeEffectsPayload?.shieldUntil) || 0;
    const shieldRemainingMs = parseNumber(activeEffectsPayload?.shieldRemainingMs);
    const resolvedShieldRemainingMs = shieldRemainingMs !== null
      ? Math.max(0, shieldRemainingMs)
      : Math.max(0, shieldUntil - Date.now());
    roomSnapshot.myActiveEffects = {
      shieldUntil,
      shieldRemainingMs: resolvedShieldRemainingMs,
      shieldActive: Boolean(activeEffectsPayload?.shieldActive) || resolvedShieldRemainingMs > 0,
      chargeActive: Boolean(activeEffectsPayload?.charge?.active),
      chargeRemainingDistance: Math.max(0, parseNumber(activeEffectsPayload?.charge?.remainingDistance) || 0),
      chargeDirection: normalizePosition(activeEffectsPayload?.charge?.direction)
    };

    const opponentEffectsPayload = opponentMatchPlayer?.activeEffects && typeof opponentMatchPlayer.activeEffects === 'object'
      ? opponentMatchPlayer.activeEffects
      : {};
    const opponentShieldUntil = parseNumber(opponentEffectsPayload?.shieldUntil) || 0;
    const opponentShieldRemainingMs = parseNumber(opponentEffectsPayload?.shieldRemainingMs);
    const resolvedOpponentShieldRemainingMs = opponentShieldRemainingMs !== null
      ? Math.max(0, opponentShieldRemainingMs)
      : Math.max(0, opponentShieldUntil - Date.now());
    roomSnapshot.opponentActiveEffects = {
      shieldUntil: opponentShieldUntil,
      shieldRemainingMs: resolvedOpponentShieldRemainingMs,
      shieldActive: Boolean(opponentEffectsPayload?.shieldActive) || resolvedOpponentShieldRemainingMs > 0,
      chargeActive: Boolean(opponentEffectsPayload?.charge?.active),
      chargeRemainingDistance: Math.max(0, parseNumber(opponentEffectsPayload?.charge?.remainingDistance) || 0),
      chargeDirection: normalizePosition(opponentEffectsPayload?.charge?.direction)
    };

    const nextBlinkAt = parseNumber(selfCombatState?.nextBlinkAt) || parseNumber(normalizedReadyAt[ABILITY_IDS.BLINK]) || 0;
    const serializedBlinkRemaining = parseNumber(normalizedCooldowns[ABILITY_IDS.BLINK]) || 0;
    const timeBasedRemainingMs = nextBlinkAt > 0 ? Math.max(0, nextBlinkAt - Date.now()) : 0;
    const resolvedBlinkRemainingMs = Math.max(timeBasedRemainingMs, serializedBlinkRemaining, getAbilityCooldownRemainingMs(ABILITY_IDS.BLINK));
    roomSnapshot.myBlinkReadyAt = nextBlinkAt;
    roomSnapshot.myBlinkRemainingMs = resolvedBlinkRemainingMs;
    roomSnapshot.myBlinkAvailable = isAbilityUsable(ABILITY_IDS.BLINK);

    const matchProjectiles = Array.isArray(match?.projectiles) ? match.projectiles : [];
    roomSnapshot.projectiles = matchProjectiles.map((projectile) => ({
      projectileId: trimString(projectile?.projectileId),
      abilityId: trimString(projectile?.abilityId).toLowerCase(),
      ownerPlayerNumber: parseNumber(projectile?.ownerPlayerNumber),
      position: normalizePosition(projectile?.position),
      direction: normalizePosition(projectile?.direction),
      speed: parseNumber(projectile?.speed),
      hitRadius: parseNumber(projectile?.hitRadius),
      spawnedAt: parseNumber(projectile?.spawnedAt),
      expiresAt: parseNumber(projectile?.expiresAt)
    }));
    roomSnapshot.projectileCount = roomSnapshot.projectiles.length;
    const matchWalls = Array.isArray(match?.walls) ? match.walls : [];
    roomSnapshot.walls = matchWalls.map((wall) => ({
      wallId: trimString(wall?.wallId),
      ownerPlayerNumber: parseNumber(wall?.ownerPlayerNumber),
      position: normalizePosition(wall?.position),
      direction: normalizePosition(wall?.direction),
      halfLength: parseNumber(wall?.halfLength),
      halfThickness: parseNumber(wall?.halfThickness),
      spawnedAt: parseNumber(wall?.spawnedAt),
      expiresAt: parseNumber(wall?.expiresAt)
    }));
    roomSnapshot.wallCount = roomSnapshot.walls.length;

    const matchHitEvents = Array.isArray(match?.hitEvents) ? match.hitEvents : [];
    roomSnapshot.hitEvents = matchHitEvents.map((hitEvent) => ({
      hitId: trimString(hitEvent?.hitId),
      type: trimString(hitEvent?.type),
      abilityId: trimString(hitEvent?.abilityId).toLowerCase(),
      projectileId: trimString(hitEvent?.projectileId),
      sourcePlayerNumber: parseNumber(hitEvent?.sourcePlayerNumber),
      targetPlayerNumber: parseNumber(hitEvent?.targetPlayerNumber),
      timestamp: parseNumber(hitEvent?.timestamp),
      knockback: normalizePosition(hitEvent?.knockback),
      metadata: hitEvent?.metadata && typeof hitEvent.metadata === 'object' ? hitEvent.metadata : null
    }));
    roomSnapshot.lastHitEvent = roomSnapshot.hitEvents.length
      ? roomSnapshot.hitEvents[roomSnapshot.hitEvents.length - 1]
      : null;
    roomSnapshot.matchResult = getMatchResultText();
  }

  function applyRoomPayload(payload, fallbackState = ROOM_STATE_IDLE) {
    invalidateRuntimeSnapshotCache();
    const room = payload && typeof payload === 'object' ? payload.room : null;
    const code = normalizeRoomCode(payload?.roomCode || room?.code || '');

    const players = (Array.isArray(room?.players) ? room.players : [])
      .map((entry, index) => {
        const slotValue = Number(entry?.slot);
        return {
          playerId: trimString(entry?.playerId),
          slot: Number.isFinite(slotValue) && slotValue > 0 ? slotValue : index + 1,
          socketId: trimString(entry?.socketId),
          ready: Boolean(entry?.ready),
          matchPlayerNumber: parseNumber(entry?.matchPlayerNumber),
          connected: entry?.connected !== false,
          draftedSpells: Array.isArray(entry?.draftedSpells)
            ? entry.draftedSpells.map((spellId) => trimString(spellId)).filter(Boolean)
            : [],
          loadoutSpells: Array.isArray(entry?.loadoutSpells)
            ? entry.loadoutSpells.map((spellId) => trimString(spellId)).filter(Boolean)
            : [],
          disconnectedAt: parseNumber(entry?.disconnectedAt),
          reconnectGraceExpiresAt: parseNumber(entry?.reconnectGraceExpiresAt),
          reconnectGraceRemainingMs: parseNumber(entry?.reconnectGraceRemainingMs) || 0
        };
      })
      .sort((a, b) => a.slot - b.slot);

    const playerCountValue = Number(room?.playerCount);
    const playerCount = Number.isFinite(playerCountValue) && playerCountValue >= 0
      ? playerCountValue
      : players.length;

    const stateValue = room?.state?.status
      || room?.state
      || room?.status
      || payload?.state
      || payload?.status;
    const defaultState = code ? ROOM_STATE_WAITING : fallbackState;
    const state = normalizeRoomState(stateValue, defaultState);

    const slotFromPayload = Number(payload?.playerSlot || payload?.slot);
    const selfPlayer = players.find((entry) => entry?.socketId === socket?.id);
    const slotFromPlayers = Number(selfPlayer?.slot);
    const slotValue = Number.isFinite(slotFromPayload) && slotFromPayload > 0
      ? slotFromPayload
      : slotFromPlayers;

    roomSnapshot.code = code;
    roomSnapshot.playerCount = playerCount;
    roomSnapshot.state = state;
    roomSnapshot.slot = Number.isFinite(slotValue) && slotValue > 0 ? slotValue : null;
    roomSnapshot.selfReady = Boolean(selfPlayer?.ready);
    roomSnapshot.selfConnected = selfPlayer ? selfPlayer.connected !== false : false;
    roomSnapshot.players = players;
    roomSnapshot.connectedPlayerCount = Number(room?.connectedPlayerCount);
    if (!Number.isFinite(roomSnapshot.connectedPlayerCount)) {
      roomSnapshot.connectedPlayerCount = players.filter((entry) => entry.connected !== false).length;
    }
    const reconnectInfo = room?.reconnect && typeof room.reconnect === 'object' ? room.reconnect : null;
    roomSnapshot.reconnectInfo = {
      graceMs: parseNumber(reconnectInfo?.graceMs) || 0,
      disconnectedPlayers: Array.isArray(reconnectInfo?.disconnectedPlayers)
        ? reconnectInfo.disconnectedPlayers.map((entry) => ({
          playerId: trimString(entry?.playerId),
          slot: parseNumber(entry?.slot),
          matchPlayerNumber: parseNumber(entry?.matchPlayerNumber),
          disconnectedAt: parseNumber(entry?.disconnectedAt),
          reconnectGraceExpiresAt: parseNumber(entry?.reconnectGraceExpiresAt),
          remainingMs: parseNumber(entry?.remainingMs) || 0
        }))
        : []
    };

    const reconnectTokenFromPayload = trimString(payload?.reconnectToken);
    const reconnectPlayerIdFromPayload = trimString(payload?.reconnectPlayerId);
    if (reconnectTokenFromPayload) {
      roomSnapshot.reconnectToken = reconnectTokenFromPayload;
      if (roomSnapshot.code) {
        saveReconnectIdentity(roomSnapshot.code, reconnectTokenFromPayload, reconnectPlayerIdFromPayload);
      }
    }
    if (reconnectPlayerIdFromPayload) {
      roomSnapshot.reconnectPlayerId = reconnectPlayerIdFromPayload;
    }

    applyMatchPayload(
      {
        match: room?.match,
        matchPlayerNumber: payload?.matchPlayerNumber,
        spawnPositions: payload?.spawnPositions,
        mySpawnPosition: payload?.mySpawnPosition,
        opponentSpawnPosition: payload?.opponentSpawnPosition
      },
      players
    );

    if (code) {
      updateQuickMatchState({
        status: QUICK_MATCH_STATUS_IDLE,
        roomCode: code,
        reason: 'in_room',
        queuedAt: 0,
        queueDepth: 0
      });
    }
  }

  function bindRoomHandlers() {
    if (!socket || roomHandlersBound) return;
    roomHandlersBound = true;

    socket.on('quick_match_state', (payload) => {
      const status = normalizeQuickMatchStatus(payload?.status, quickMatchSnapshot.status);
      const queueDepth = Math.max(0, parseNumber(payload?.queueDepth) || 0);
      const roomCode = normalizeRoomCode(payload?.roomCode || '');
      const queuedAt = Math.max(0, parseNumber(payload?.queuedAt) || 0);
      const reason = trimString(payload?.reason || '');
      updateQuickMatchState(
        {
          status,
          queueDepth,
          roomCode,
          queuedAt,
          reason
        },
        { log: true }
      );
    });

    socket.on('quick_match_queued', (payload) => {
      updateQuickMatchState(
        {
          status: QUICK_MATCH_STATUS_SEARCHING,
          queueDepth: Math.max(0, parseNumber(payload?.queueDepth) || 0),
          queuedAt: Math.max(0, parseNumber(payload?.queuedAt) || Date.now()),
          reason: trimString(payload?.reason || '')
        },
        { log: true }
      );
      setStatusMessage('Finding opponent...');
      console.info(`${LOG_PREFIX} quick_match_queued`, payload);
    });

    socket.on('quick_match_matched', (payload) => {
      updateQuickMatchState(
        {
          status: QUICK_MATCH_STATUS_MATCHED,
          queueDepth: Math.max(0, parseNumber(payload?.queueDepth) || 0),
          roomCode: normalizeRoomCode(payload?.roomCode || ''),
          reason: trimString(payload?.reason || '')
        },
        { log: true }
      );
      setStatusMessage(`Opponent found. Joining room ${normalizeRoomCode(payload?.roomCode || '') || '-'}.`);
      console.info(`${LOG_PREFIX} quick_match_matched`, payload);
    });

    socket.on('quick_match_canceled', (payload) => {
      const reason = trimString(payload?.reason || 'canceled');
      updateQuickMatchState(
        {
          status: QUICK_MATCH_STATUS_IDLE,
          queueDepth: Math.max(0, parseNumber(payload?.queueDepth) || 0),
          reason,
          queuedAt: 0,
          roomCode: ''
        },
        { log: true }
      );
      setStatusMessage(reason === 'not_queued' ? 'Queue canceled.' : `Queue canceled (${reason}).`);
      console.info(`${LOG_PREFIX} quick_match_canceled`, payload);
    });

    socket.on('room_created', (payload) => {
      resetRealtimeInputState({ emitNeutral: false });
      maybeStoreReconnectIdentityFromPayload(payload);
      applyRoomPayload(payload, ROOM_STATE_WAITING);
      renderDebugPanel();
      setStatusMessage(`Room created (${roomSnapshot.code}). ${getStateMessage()}`);
      if (panelInput && roomSnapshot.code) panelInput.value = roomSnapshot.code;
      console.info(`${LOG_PREFIX} room_created`, payload);
    });

    socket.on('room_joined', (payload) => {
      resetRealtimeInputState({ emitNeutral: false });
      maybeStoreReconnectIdentityFromPayload(payload);
      applyRoomPayload(payload, ROOM_STATE_WAITING);
      renderDebugPanel();
      setStatusMessage(`Joined room ${roomSnapshot.code}. ${getStateMessage()}`);
      if (panelInput && roomSnapshot.code) panelInput.value = roomSnapshot.code;
      console.info(`${LOG_PREFIX} room_joined`, payload);
    });

    socket.on('room_reconnected', (payload) => {
      const wasInDraftPhase = isSnapshotInDraftPhase(roomSnapshot);
      resetRealtimeInputState({ emitNeutral: true });
      maybeStoreReconnectIdentityFromPayload(payload);
      applyRoomPayload(payload, ROOM_STATE_WAITING);
      maybeAutoHideDebugPanelOnDraftEnter(wasInDraftPhase);
      renderDebugPanel();
      showPhaseBanner('Reconnected', 1200);
      const resumedText = payload?.resumedMatch ? ' Match resumed.' : '';
      setStatusMessage(`Reconnected to room ${roomSnapshot.code}.${resumedText}`);
      if (panelInput && roomSnapshot.code) panelInput.value = roomSnapshot.code;
      console.info(`${LOG_PREFIX} room_reconnected`, payload);
    });

    socket.on('room_update', (payload) => {
      clearReadyToggleAckTimer();
      const wasInDraftPhase = isSnapshotInDraftPhase(roomSnapshot);
      const previousState = roomSnapshot.state;
      const previousSlot = roomSnapshot.slot;
      applyRoomPayload(payload, roomSnapshot.code ? ROOM_STATE_WAITING : ROOM_STATE_IDLE);
      if (!Number.isFinite(roomSnapshot.slot)) {
        roomSnapshot.slot = previousSlot;
      }
      maybeAutoHideDebugPanelOnDraftEnter(wasInDraftPhase);
      renderDebugPanel();

      if (previousState !== roomSnapshot.state) {
        console.info(`${LOG_PREFIX} state_change ${previousState} -> ${roomSnapshot.state}`);
        if (isRoomInMatchFlow(previousState) && !isRoomInMatchFlow(roomSnapshot.state)) {
          resetRealtimeInputState({ emitNeutral: true });
        }
        if (roomSnapshot.state === ROOM_STATE_STARTING) {
          showPhaseBanner('Preparing Match', 1000);
        } else if (roomSnapshot.state === ROOM_STATE_DRAFT) {
          showPhaseBanner('Draft Phase', 1200);
        } else if (isRoomInMatchFlow(previousState) && !isRoomInMatchFlow(roomSnapshot.state)) {
          showPhaseBanner('Returned To Room', 1200);
        }
      }
      setStatusMessage(getStateMessage());
      console.info(`${LOG_PREFIX} room_update`, payload);
    });

    socket.on('reconnect_grace_started', (payload) => {
      const playerNumber = Number(payload?.matchPlayerNumber) || Number(payload?.playerSlot) || '?';
      const graceMs = parseNumber(payload?.reconnectGraceMs) || 0;
      setStatusMessage(`Player ${playerNumber} disconnected. Reconnect window: ${formatDurationMs(graceMs)}.`);
      renderDebugPanel();
      console.info(`${LOG_PREFIX} reconnect_grace_started`, payload);
    });

    socket.on('player_disconnected', (payload) => {
      const playerNumber = Number(payload?.matchPlayerNumber) || Number(payload?.playerSlot) || '?';
      const graceMs = parseNumber(payload?.reconnectGraceMs) || 0;
      setStatusMessage(`Opponent disconnected (P${playerNumber}). Waiting ${formatDurationMs(graceMs)}.`);
      renderDebugPanel();
      showPhaseBanner('Opponent Disconnected', 1200);
      console.info(`${LOG_PREFIX} player_disconnected`, payload);
    });

    socket.on('player_reconnected', (payload) => {
      const playerNumber = Number(payload?.matchPlayerNumber) || Number(payload?.playerSlot) || '?';
      const resumedText = payload?.resumedMatch ? ' Match resumed.' : '';
      setStatusMessage(`Player ${playerNumber} reconnected.${resumedText}`);
      renderDebugPanel();
      showPhaseBanner('Opponent Reconnected', 1100);
      console.info(`${LOG_PREFIX} player_reconnected`, payload);
    });

    socket.on('reconnect_timeout_forfeit', (payload) => {
      const winner = Number(payload?.winnerPlayerNumber);
      const disconnected = Number(payload?.disconnectedPlayerNumber);
      const winnerText = Number.isFinite(winner) ? `Player ${winner}` : 'Opponent';
      const disconnectedText = Number.isFinite(disconnected) ? `Player ${disconnected}` : 'A player';
      setStatusMessage(`${disconnectedText} did not reconnect. ${winnerText} wins by forfeit.`);
      renderDebugPanel();
      console.info(`${LOG_PREFIX} reconnect_timeout_forfeit`, payload);
    });

    socket.on('reconnect_failed', (payload) => {
      const message = trimString(payload?.message) || 'Reconnect failed.';
      clearReconnectIdentity();
      roomSnapshot.reconnectToken = '';
      roomSnapshot.reconnectPlayerId = '';
      setStatusMessage(message);
      renderDebugPanel();
      console.warn(`${LOG_PREFIX} reconnect_failed`, payload);
    });

    socket.on('room_reset_for_rematch', (payload) => {
      clearReadyToggleAckTimer();
      resetRealtimeInputState({ emitNeutral: true });
      applyRoomPayload(payload, ROOM_STATE_WAITING);
      renderDebugPanel();
      showPhaseBanner('Room Reset', 1000);
      setStatusMessage('Room reset for rematch. Ready up to start again.');
      console.info(`${LOG_PREFIX} room_reset_for_rematch`, payload);
    });

    socket.on('match_started', (payload) => {
      clearReadyToggleAckTimer();
      const wasInDraftPhase = isSnapshotInDraftPhase(roomSnapshot);
      maybeStoreReconnectIdentityFromPayload(payload);
      resetRealtimeInputState({ emitNeutral: true });
      applyRoomPayload(payload, ROOM_STATE_IN_MATCH);
      if (!roomSnapshot.matchId) {
        applyMatchPayload(payload, roomSnapshot.players);
      } else {
        const myNumberFromEvent = parseNumber(payload?.matchPlayerNumber);
        if (myNumberFromEvent !== null) {
          roomSnapshot.myMatchPlayerNumber = myNumberFromEvent;
        }
      }
      lastSentAim = normalizeMovementInput(roomSnapshot.myAimDirection || { x: 0, y: 0 });
      maybeAutoHideDebugPanelOnDraftEnter(wasInDraftPhase);
      renderDebugPanel();
      const numberInfo = Number.isFinite(roomSnapshot.myMatchPlayerNumber) ? ` You are player ${roomSnapshot.myMatchPlayerNumber}.` : '';
      if (roomSnapshot.matchPhase === MATCH_PHASE_DRAFT) {
        showPhaseBanner('Draft Phase', 1200);
        setStatusMessage(`Draft started.${numberInfo}`);
      } else {
        showPhaseBanner('Match Started', 1200);
        setStatusMessage(`Match started.${numberInfo}`);
      }
      console.info(`${LOG_PREFIX} match_started`, payload);
    });

    socket.on('match_state', (payload) => {
      const previousHitId = trimString(roomSnapshot.lastHitEvent?.hitId);
      const previousPhase = roomSnapshot.matchPhase;
      const previousPaused = roomSnapshot.matchPaused;
      const previousDraftTurnPlayer = Number(roomSnapshot.draft?.currentTurnPlayerNumber);
      const wasInDraftPhase = isSnapshotInDraftPhase(roomSnapshot);
      applyMatchPayload(payload, roomSnapshot.players);
      if (roomSnapshot.matchPhase === MATCH_PHASE_DRAFT) {
        roomSnapshot.state = ROOM_STATE_DRAFT;
      } else if (roomSnapshot.matchPhase === MATCH_PHASE_END) {
        roomSnapshot.state = ROOM_STATE_MATCH_END;
      } else if (roomSnapshot.matchPhase === MATCH_PHASE_COMBAT_COUNTDOWN) {
        roomSnapshot.state = ROOM_STATE_COMBAT;
      } else if (roomSnapshot.matchPhase === DEFAULT_MATCH_PHASE) {
        roomSnapshot.state = ROOM_STATE_COMBAT;
      } else {
        roomSnapshot.state = ROOM_STATE_IN_MATCH;
      }
      maybeAutoHideDebugPanelOnDraftEnter(wasInDraftPhase);
      renderDebugPanel();
      const nextHit = roomSnapshot.lastHitEvent;
      const nextHitId = trimString(nextHit?.hitId);
      if (nextHitId && nextHitId !== previousHitId) {
        const markerText = formatHitEvent(nextHit);
        const myNumber = Number(roomSnapshot.myMatchPlayerNumber);
        const targetPlayerNumber = Number(nextHit?.targetPlayerNumber);
        if (Number.isFinite(myNumber) && Number.isFinite(targetPlayerNumber)) {
          showPhaseBanner(targetPlayerNumber === myNumber ? 'Hit Taken' : 'Hit Landed', 520);
        }
        setStatusMessage(markerText);
        console.info(`${LOG_PREFIX} hit_event ${nextHitId}`, nextHit);
      }
      if (previousPhase !== roomSnapshot.matchPhase) {
        if (roomSnapshot.matchPhase === MATCH_PHASE_END) {
          matchEndPanelRevealAt = Date.now() + 420;
          resetRealtimeInputState({ emitNeutral: true });
          const resultText = getMatchResultText() || 'Match ended';
          showPhaseBanner(resultText, 1800);
          setStatusMessage(resultText);
          console.info(`${LOG_PREFIX} match_end winner=P${roomSnapshot.winnerPlayerNumber || '?'} eliminated=P${roomSnapshot.eliminatedPlayerNumber || '?'}`);
        } else if (roomSnapshot.matchPhase === MATCH_PHASE_DRAFT) {
          matchEndPanelRevealAt = 0;
          const currentTurn = Number(roomSnapshot.draft?.currentTurnPlayerNumber);
          const turnText = Number.isFinite(currentTurn) ? ` Player ${currentTurn} picking.` : '';
          showPhaseBanner('Draft Phase', 1200);
          setStatusMessage(`Draft phase.${turnText}`);
        } else if (roomSnapshot.matchPhase === MATCH_PHASE_COMBAT_COUNTDOWN) {
          matchEndPanelRevealAt = 0;
          showPhaseBanner('Draft Complete', 1000);
          setStatusMessage('Draft complete. Combat countdown started.');
        } else if (roomSnapshot.matchPhase === DEFAULT_MATCH_PHASE) {
          matchEndPanelRevealAt = 0;
          showPhaseBanner('Fight', 900);
          setStatusMessage('Combat started.');
        } else {
          matchEndPanelRevealAt = 0;
          setStatusMessage(`Match phase: ${roomSnapshot.matchPhase || DEFAULT_MATCH_PHASE}`);
        }
      } else if (previousPaused !== roomSnapshot.matchPaused) {
        if (roomSnapshot.matchPaused) {
          setStatusMessage(`Match paused (${getReconnectSummaryText()}).`);
        } else {
          setStatusMessage('Match resumed.');
        }
      } else if (roomSnapshot.matchPhase === MATCH_PHASE_DRAFT) {
        const nextTurnPlayer = Number(roomSnapshot.draft?.currentTurnPlayerNumber);
        if (Number.isFinite(nextTurnPlayer) && nextTurnPlayer !== previousDraftTurnPlayer) {
          setStatusMessage(`Draft turn: Player ${nextTurnPlayer}.`);
        }
      }
    });

    socket.on('room_error', (payload) => {
      clearReadyToggleAckTimer();
      const message = trimString(payload?.message) || 'Room error.';
      setStatusMessage(message);
      renderDebugPanel();
      console.warn(`${LOG_PREFIX} room_error`, payload);
    });

    socket.on('room_left', (payload) => {
      clearReadyToggleAckTimer();
      clearReconnectIdentity();
      resetRealtimeInputState({ emitNeutral: true });
      clearRoomSnapshot(ROOM_STATE_IDLE);
      updateQuickMatchState({
        status: QUICK_MATCH_STATUS_IDLE,
        queueDepth: 0,
        queuedAt: 0,
        roomCode: '',
        reason: 'room_left'
      });
      renderDebugPanel();
      setStatusMessage('Left room.');
      if (panelInput) panelInput.value = '';
      console.info(`${LOG_PREFIX} room_left`, payload);
    });
  }

  function connect() {
    ensureDebugPanel();
    bindKeyboardHandlers();
    startMovementInputLoop();
    startQuickMatchHeartbeatLoop();
    if (socket) return socket;

    if (typeof window.io !== 'function') {
      console.warn(`${LOG_PREFIX} socket.io-client is not loaded.`);
      setStatusMessage('socket.io-client missing.');
      return null;
    }

    roomHandlersBound = false;
    const serverUrl = resolveServerUrl();
    if (!serverUrl) {
      console.warn(`${LOG_PREFIX} no multiplayer server URL configured for this environment.`);
      setStatusMessage('Multiplayer URL missing. Set OUTRA_MULTIPLAYER_SERVER_URL in production.');
      updateQuickMatchState({
        status: QUICK_MATCH_STATUS_IDLE,
        reason: 'missing_server_url',
        queueDepth: 0,
        queuedAt: 0,
        roomCode: ''
      });
      clearRoomSnapshot(ROOM_STATE_OFFLINE);
      renderDebugPanel();
      return null;
    }
    console.info(`${LOG_PREFIX} connecting to ${serverUrl}`);
    socket = window.io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true
    });
    bindRoomHandlers();

    socket.on('connect', () => {
      resetRealtimeInputState({ emitNeutral: false });
      startMovementInputLoop();
      startQuickMatchHeartbeatLoop();
      reconnectAttemptedForCurrentSocket = false;
      reconnectAttemptInFlight = false;
      console.info(`${LOG_PREFIX} connected`);
      console.info(`${LOG_PREFIX} socket id: ${socket.id}`);
      renderDebugPanel();
      setStatusMessage('Connected to multiplayer server.');
      attemptReconnectToPreviousSession();
      requestTuningSnapshot({ silent: true });
    });

    socket.on('disconnect', (reason) => {
      clearReadyToggleAckTimer();
      resetRealtimeInputState({ emitNeutral: false });
      stopMovementInputLoop();
      stopQuickMatchHeartbeatLoop();
      reconnectAttemptInFlight = false;
      reconnectAttemptedForCurrentSocket = false;
      updateQuickMatchState({
        status: QUICK_MATCH_STATUS_IDLE,
        queueDepth: 0,
        queuedAt: 0,
        roomCode: '',
        reason: 'socket_disconnected'
      });
      console.info(`${LOG_PREFIX} disconnected (${reason})`);
      clearRoomSnapshot(ROOM_STATE_OFFLINE);
      renderDebugPanel();
      setStatusMessage(`Disconnected (${reason})`);
    });

    socket.on('connect_error', (error) => {
      const message = trimString(error?.message) || 'Unknown connection error';
      console.error(`${LOG_PREFIX} connect_error: ${message}`, error);
      renderDebugPanel();
      setStatusMessage(`Connect error: ${message}`);
    });

    return socket;
  }

  function emitWhenConnected(eventName, payload, pendingMessage, ackCallback) {
    const activeSocket = connect();
    if (!activeSocket) return false;

    const emitEvent = () => {
      if (typeof ackCallback === 'function') {
        if (typeof payload === 'undefined') {
          activeSocket.emit(eventName, ackCallback);
          return;
        }
        activeSocket.emit(eventName, payload, ackCallback);
        return;
      }

      if (typeof payload === 'undefined') {
        activeSocket.emit(eventName);
        return;
      }
      activeSocket.emit(eventName, payload);
    };

    if (activeSocket.connected) {
      emitEvent();
      return true;
    }

    if (typeof activeSocket.connect === 'function') {
      activeSocket.connect();
    }

    setStatusMessage(pendingMessage || 'Connecting to multiplayer server...');
    const onceConnected = () => {
      emitEvent();
    };
    activeSocket.once('connect', onceConnected);
    return true;
  }

  function createRoom() {
    const requested = emitWhenConnected('create_room', undefined, 'Connecting and creating room...');
    if (!requested) return;
    updateQuickMatchState({
      status: QUICK_MATCH_STATUS_IDLE,
      queueDepth: 0,
      queuedAt: 0,
      roomCode: '',
      reason: 'manual_create'
    });
    setStatusMessage('Creating room...');
    console.info(`${LOG_PREFIX} create_room requested`);
  }

  function joinRoom(roomCode) {
    const normalizedCode = normalizeRoomCode(roomCode);
    if (!normalizedCode) {
      setStatusMessage('Enter a valid room code.');
      console.warn(`${LOG_PREFIX} join_room rejected: missing room code`);
      return;
    }

    if (panelInput) panelInput.value = normalizedCode;
    const requested = emitWhenConnected('join_room', { roomCode: normalizedCode }, `Connecting and joining ${normalizedCode}...`);
    if (!requested) return;
    updateQuickMatchState({
      status: QUICK_MATCH_STATUS_IDLE,
      queueDepth: 0,
      queuedAt: 0,
      roomCode: '',
      reason: 'manual_join'
    });
    setStatusMessage(`Joining ${normalizedCode}...`);
    console.info(`${LOG_PREFIX} join_room requested code=${normalizedCode}`);
  }

  function queueQuickMatch() {
    const requested = emitWhenConnected(
      'queue_quick_match',
      undefined,
      'Connecting and queueing quick match...',
      (response) => {
        if (!response) return;
        if (response.ok === false) {
          updateQuickMatchState({
            status: QUICK_MATCH_STATUS_IDLE,
            reason: trimString(response?.code || 'queue_failed'),
            queueDepth: 0,
            queuedAt: 0,
            roomCode: ''
          }, { log: true });
          setStatusMessage(trimString(response?.message) || 'Unable to queue for quick match.');
          return;
        }

        const status = normalizeQuickMatchStatus(response?.status, QUICK_MATCH_STATUS_IDLE);
        updateQuickMatchState({
          status,
          queueDepth: Math.max(0, parseNumber(response?.queueDepth) || 0),
          queuedAt: Math.max(0, parseNumber(response?.queuedAt) || 0),
          roomCode: normalizeRoomCode(response?.roomCode || ''),
          reason: trimString(response?.idempotent ? 'idempotent' : '')
        }, { log: true });

        if (status === QUICK_MATCH_STATUS_SEARCHING) {
          setStatusMessage('Finding opponent...');
        } else if (status === QUICK_MATCH_STATUS_MATCHED) {
          const matchedRoomCode = normalizeRoomCode(response?.roomCode || '');
          setStatusMessage(`Opponent found${matchedRoomCode ? ` (${matchedRoomCode})` : ''}.`);
        }
      }
    );
    if (!requested) return false;

    updateQuickMatchState({
      status: QUICK_MATCH_STATUS_SEARCHING,
      reason: 'queue_requested'
    });
    setStatusMessage('Finding opponent...');
    console.info(`${LOG_PREFIX} queue_quick_match requested`);
    return true;
  }

  function cancelQuickMatch() {
    const requested = emitWhenConnected(
      'cancel_quick_match',
      undefined,
      'Canceling quick match queue...',
      (response) => {
        if (!response) return;
        if (response.ok === false) {
          const message = trimString(response?.message) || 'Unable to cancel queue.';
          setStatusMessage(message);
          return;
        }
        updateQuickMatchState({
          status: QUICK_MATCH_STATUS_IDLE,
          queueDepth: Math.max(0, parseNumber(response?.queueDepth) || 0),
          queuedAt: 0,
          roomCode: '',
          reason: trimString(response?.reason || 'player_cancel')
        }, { log: true });
        setStatusMessage('Queue canceled.');
      }
    );
    if (!requested) return false;
    console.info(`${LOG_PREFIX} cancel_quick_match requested`);
    return true;
  }

  function toggleReady() {
    if (!roomSnapshot.code) {
      setStatusMessage('Join a room before toggling ready.');
      return;
    }

    if (isRoomInMatchFlow(roomSnapshot.state)) {
      setStatusMessage('Match already started.');
      return;
    }

    if (roomSnapshot.state === ROOM_STATE_STARTING) {
      setStatusMessage('Match is starting...');
      return;
    }

    if (roomSnapshot.playerCount < 2) {
      setStatusMessage('Waiting for opponent before ready check.');
      return;
    }

    const requested = emitWhenConnected(
      'toggle_ready',
      undefined,
      'Connecting and toggling ready...',
      (response) => {
        clearReadyToggleAckTimer();
        if (!response || response.ok !== false) return;
        const message = trimString(response?.message) || 'Ready toggle failed.';
        setStatusMessage(message);
      }
    );
    if (!requested) return;
    setStatusMessage(roomSnapshot.selfReady ? 'Setting not ready...' : 'Setting ready...');
    clearReadyToggleAckTimer();
    readyToggleAckTimer = window.setTimeout(() => {
      readyToggleAckTimer = null;
      setStatusMessage('No response for toggle_ready. Restart the multiplayer server and try again.');
    }, READY_TOGGLE_ACK_TIMEOUT_MS);
    console.info(`${LOG_PREFIX} toggle_ready requested`);
  }

  function returnToRoom() {
    if (!isRoomInMatchFlow(roomSnapshot.state) || roomSnapshot.matchPhase !== MATCH_PHASE_END) {
      setStatusMessage('Return is available after match end.');
      return;
    }
    resetRealtimeInputState({ emitNeutral: true });

    const requested = emitWhenConnected(
      'return_to_room',
      undefined,
      'Returning to room...',
      (response) => {
        if (!response) return;
        if (response.ok === false) {
          const message = trimString(response?.message) || 'Return to room failed.';
          setStatusMessage(message);
          return;
        }
        if (response.room) {
          maybeStoreReconnectIdentityFromPayload(response);
          applyRoomPayload(response, ROOM_STATE_WAITING);
          renderDebugPanel();
        }
        setStatusMessage('Returned to room. Ready up for rematch.');
      }
    );
    if (!requested) return;
    setStatusMessage('Returning to room...');
    console.info(`${LOG_PREFIX} return_to_room requested`);
  }

  function resetRoomForRematch() {
    resetRealtimeInputState({ emitNeutral: true });
    const requested = emitWhenConnected(
      'reset_room_for_rematch',
      undefined,
      'Resetting room for rematch...',
      (response) => {
        if (!response) return;
        if (response.ok === false) {
          const message = trimString(response?.message) || 'Room reset failed.';
          setStatusMessage(message);
          return;
        }
        if (response.room) {
          maybeStoreReconnectIdentityFromPayload(response);
          applyRoomPayload(response, ROOM_STATE_WAITING);
          renderDebugPanel();
        }
        setStatusMessage('Room reset for rematch.');
      }
    );
    if (!requested) return;
    setStatusMessage('Resetting room for rematch...');
    console.info(`${LOG_PREFIX} reset_room_for_rematch requested`);
  }

  function castAbility(abilityId, options = {}) {
    const normalizedAbilityId = trimString(abilityId).toLowerCase();
    if (!normalizedAbilityId) return;
    if (!isRoomInMatchFlow(roomSnapshot.state) || !roomSnapshot.matchId) {
      return;
    }
    if (roomSnapshot.matchPhase !== DEFAULT_MATCH_PHASE) {
      return;
    }
    if (roomSnapshot.matchPaused) {
      return;
    }

    if (!isAbilityInMyLoadout(normalizedAbilityId)) {
      setStatusMessage(`${toAbilityLabel(normalizedAbilityId)} is not in your loadout.`);
      return;
    }

    const now = Date.now();
    const pendingAt = Number(pendingAbilityRequests.get(normalizedAbilityId)) || 0;
    if ((now - pendingAt) < CLIENT_CAST_REQUEST_COALESCE_MS) {
      return;
    }
    pendingAbilityRequests.set(normalizedAbilityId, now);
    const requestId = createClientActionId(`cast-${normalizedAbilityId}`);

    const fallbackDirection = Number(roomSnapshot.myMatchPlayerNumber) === 2
      ? { x: -1, y: 0 }
      : { x: 1, y: 0 };
    const liveAimDirection = computeAimInputFromMouse()
      || computeAimInputFromKeyboard()
      || normalizeDirectionInput(roomSnapshot.myAimDirection)
      || fallbackDirection;
    const directionPayload = {
      abilityId: normalizedAbilityId,
      requestId,
      direction: liveAimDirection
    };

    const abilityLabel = toAbilityLabel(normalizedAbilityId);
    const logPrefix = options.logPrefix || `${normalizedAbilityId}`;
    let resolved = false;
    const timeoutId = window.setTimeout(() => {
      if (resolved) return;
      pendingAbilityRequests.delete(normalizedAbilityId);
      setStatusMessage(`${abilityLabel} request timed out (no server response). Restart backend and verify server URL.`);
    }, 1600);

    const requested = emitWhenConnected(
      'cast_ability',
      directionPayload,
      `Connecting and casting ${abilityLabel.toLowerCase()}...`,
      (response) => {
        resolved = true;
        window.clearTimeout(timeoutId);
        pendingAbilityRequests.delete(normalizedAbilityId);
        if (!response) return;
        if (response.ok === false) {
          const message = trimString(response?.message) || `${abilityLabel} cast failed.`;
          setStatusMessage(message);
          return;
        }
        if (normalizedAbilityId === ABILITY_IDS.FIREBLAST && response.projectileId) {
          setStatusMessage(`${abilityLabel} cast: ${response.projectileId}`);
          return;
        }
        const destination = normalizePosition(response?.destination);
        if (destination) {
          setStatusMessage(`${abilityLabel} cast -> (${destination.x.toFixed(2)}, ${destination.y.toFixed(2)})`);
          console.info(`${LOG_PREFIX} ${logPrefix}_destination x=${destination.x.toFixed(2)} y=${destination.y.toFixed(2)}`);
          return;
        }
        if (response.hit === true && Number.isFinite(Number(response.targetPlayerNumber))) {
          setStatusMessage(`${abilityLabel} hit Player ${Number(response.targetPlayerNumber)}`);
          return;
        }
        if (response.hit === false && response.reason) {
          setStatusMessage(`${abilityLabel}: ${response.reason}`);
        } else {
          setStatusMessage(`${abilityLabel} cast.`);
        }
      }
    );
    if (!requested) {
      resolved = true;
      window.clearTimeout(timeoutId);
      pendingAbilityRequests.delete(normalizedAbilityId);
      return;
    }
    setStatusMessage(`${abilityLabel} requested...`);
    console.info(`${LOG_PREFIX} cast_ability requested ability=${normalizedAbilityId} requestId=${requestId}`);
  }

  function castDraftedAbilityBySlot(slotIndex) {
    const index = Number(slotIndex);
    if (!Number.isFinite(index) || index < 0) return;
    const abilityId = getDraftedAbilityBySlotIndex(index);
    if (!abilityId) {
      setStatusMessage(`No drafted spell in slot ${index + 1}.`);
      return;
    }
    castAbility(abilityId, {
      logPrefix: `slot_${index + 1}_${abilityId}`
    });
  }

  function castBlink() {
    castAbility(ABILITY_IDS.BLINK, { logPrefix: 'blink' });
  }

  function castFireblast() {
    castAbility(ABILITY_IDS.FIREBLAST, { logPrefix: 'fireblast' });
  }

  function castShield() {
    castAbility(ABILITY_IDS.SHIELD, { logPrefix: 'shield' });
  }

  function castGust() {
    castAbility(ABILITY_IDS.GUST, { logPrefix: 'gust' });
  }

  function castCharge() {
    castAbility(ABILITY_IDS.CHARGE, { logPrefix: 'charge' });
  }

  function castShock() {
    castAbility(ABILITY_IDS.SHOCK, { logPrefix: 'shock' });
  }

  function castHook() {
    castAbility(ABILITY_IDS.HOOK, { logPrefix: 'hook' });
  }

  function castWall() {
    castAbility(ABILITY_IDS.WALL, { logPrefix: 'wall' });
  }

  function castRewind() {
    castAbility(ABILITY_IDS.REWIND, { logPrefix: 'rewind' });
  }

  function leaveRoom() {
    if (!socket) return;
    resetRealtimeInputState({ emitNeutral: true });
    updateQuickMatchState({
      status: QUICK_MATCH_STATUS_IDLE,
      queueDepth: 0,
      queuedAt: 0,
      roomCode: '',
      reason: 'leave_room'
    });
    emitWhenConnected('leave_room', undefined, 'Connecting and leaving room...');
    setStatusMessage('Leaving room...');
    console.info(`${LOG_PREFIX} leave_room requested`);
  }

  function disconnect() {
    if (!socket) return;
    clearReconnectIdentity();
    leaveRoom();
    socket.disconnect();
    stopQuickMatchHeartbeatLoop();
    socket = null;
    roomHandlersBound = false;
    stopMovementInputLoop();
    clearRoomSnapshot(ROOM_STATE_OFFLINE);
    renderDebugPanel();
  }

  function getSocket() {
    return socket;
  }

  function getQuickMatchState() {
    return {
      ...quickMatchSnapshot
    };
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', ensureDebugPanel, { once: true });
  } else {
    ensureDebugPanel();
  }

  window.outraMultiplayer = {
    connect,
    createRoom,
    joinRoom,
    queueQuickMatch,
    cancelQuickMatch,
    leaveRoom,
    toggleReady,
    returnToRoom,
    resetRoomForRematch,
    castAbility,
    castDraftedAbilityBySlot,
    castBlink,
    castShield,
    castGust,
    castCharge,
    castShock,
    castHook,
    castWall,
    castRewind,
    castFireblast,
    requestDraftPick: draftPick,
    disconnect,
    getSocket,
    getQuickMatchState,
    getServerUrl: resolveServerUrl,
    getPresentationSnapshot: buildMultiplayerPresentationSnapshot,
    getRuntimeSnapshot: buildMultiplayerRuntimeSnapshot
  };
})();
