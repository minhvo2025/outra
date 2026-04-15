const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const crypto = require('crypto');
const {
  getWallHalfLength,
  getWallHalfThickness,
  getWallDirection,
  isWallActive,
  isPointInsideWall,
  findBlockingWallForPoint,
  findBlockingWallForMovement,
  resolvePointAgainstWalls
} = require('./wallCollision');
const {
  ABILITY_IDS,
  getSpellTuning,
  getAllSpellTuning,
  setSpellTuningOverride,
  resetSpellTuningOverride,
  getSpellIdentitySummary
} = require('./spellTuning');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = Number(process.env.PORT) || 3001;
const HOST = '0.0.0.0';
const MAX_PLAYERS_PER_ROOM = 2;
const ROOM_CODE_LENGTH = 5;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_STATES = Object.freeze({
  WAITING: 'waiting',
  READY_CHECK: 'ready_check',
  DRAFT: 'draft',
  COMBAT: 'combat',
  MATCH_END: 'match_end',
  STARTING: 'starting',
  IN_MATCH: 'in_match'
});
const MATCH_PHASE_DRAFT = 'draft';
const MATCH_PHASE_COMBAT_COUNTDOWN = 'combat_countdown';
const MATCH_PHASE_COMBAT = 'combat';
const MATCH_PHASE_MATCH_END = 'match_end';
const PLAYER_MOVE_SPEED = 8;
// Increased from 30 Hz -> 60 Hz for smoother multiplayer simulation
const MATCH_TICK_MS = 1000 / 60;
const MATCH_STATE_BROADCAST_MS = 33; // ~30 network snapshots/sec while sim runs at 60 Hz
const MATCH_MAX_DELTA_MS = 100;
const ARENA_BOUNDARY_CENTER = Object.freeze({ x: 0, y: 0 });
const ARENA_BOUNDARY_RADIUS = 12;
const PLAYER_RADIUS = 0.72;
const PLAYER_KNOCKBACK_DAMPING_PER_SECOND = 6.9;
const ABILITY_REQUEST_MIN_INTERVAL_MS = 70;
const ABILITY_REQUEST_CACHE_TTL_MS = 12000;
const DRAFT_PICK_MIN_INTERVAL_MS = 80;
const DRAFT_REQUEST_CACHE_TTL_MS = 12000;
const COMBAT_START_COUNTDOWN_SECONDS = 3;
const COMBAT_START_COUNTDOWN_MS = COMBAT_START_COUNTDOWN_SECONDS * 1000;
const MATCH_HIT_EVENT_HISTORY_LIMIT = 18;
const RECONNECT_GRACE_MS = 25000;
const DRAFT_TURN_MS = 12000;
const ENABLE_TUNING_ADMIN = process.env.OUTRA_ENABLE_TUNING_ADMIN === '1' || process.env.NODE_ENV !== 'production';
const KILL_CREDIT_TIMEOUT_MS = 2600;
const DRAFT_SPELL_POOL = Object.freeze([
  'charge',
  'shock',
  'gust',
  'wall',
  'rewind',
  'shield',
  'hook',
  'blink'
]);
const DRAFT_SPELL_COPY_LIMITS = Object.freeze({
  hook: 1,
  blink: 1,
  shield: 1,
  charge: 1,
  shock: 1,
  gust: 1,
  wall: 1,
  rewind: 1
});
const DRAFT_TURN_ORDER = Object.freeze([1, 2, 2, 1, 1, 2]);
const SPAWN_POSITIONS = Object.freeze({
  1: Object.freeze({ x: -5, y: 0 }),
  2: Object.freeze({ x: 5, y: 0 })
});
const PHASE_TRANSITIONS = Object.freeze({
  [MATCH_PHASE_DRAFT]: Object.freeze([MATCH_PHASE_COMBAT_COUNTDOWN, MATCH_PHASE_MATCH_END]),
  [MATCH_PHASE_COMBAT_COUNTDOWN]: Object.freeze([MATCH_PHASE_COMBAT, MATCH_PHASE_MATCH_END]),
  [MATCH_PHASE_COMBAT]: Object.freeze([MATCH_PHASE_MATCH_END]),
  [MATCH_PHASE_MATCH_END]: Object.freeze([])
});
const ABILITY_DEFS = Object.freeze({
  [ABILITY_IDS.FIREBLAST]: Object.freeze({
    id: ABILITY_IDS.FIREBLAST,
    event: 'cast_fireblast',
    requiresDrafted: false
  }),
  [ABILITY_IDS.BLINK]: Object.freeze({
    id: ABILITY_IDS.BLINK,
    event: 'cast_blink',
    requiresDrafted: true
  }),
  [ABILITY_IDS.SHIELD]: Object.freeze({
    id: ABILITY_IDS.SHIELD,
    event: 'cast_shield',
    requiresDrafted: true
  }),
  [ABILITY_IDS.GUST]: Object.freeze({
    id: ABILITY_IDS.GUST,
    event: 'cast_gust',
    requiresDrafted: true
  }),
  [ABILITY_IDS.CHARGE]: Object.freeze({
    id: ABILITY_IDS.CHARGE,
    event: 'cast_charge',
    requiresDrafted: true
  }),
  [ABILITY_IDS.SHOCK]: Object.freeze({
    id: ABILITY_IDS.SHOCK,
    event: 'cast_shock',
    requiresDrafted: true
  }),
  [ABILITY_IDS.HOOK]: Object.freeze({
    id: ABILITY_IDS.HOOK,
    event: 'cast_hook',
    requiresDrafted: true
  }),
  [ABILITY_IDS.WALL]: Object.freeze({
    id: ABILITY_IDS.WALL,
    event: 'cast_wall',
    requiresDrafted: true
  }),
  [ABILITY_IDS.REWIND]: Object.freeze({
    id: ABILITY_IDS.REWIND,
    event: 'cast_rewind',
    requiresDrafted: true
  })
});

const rooms = new Map();
const playerRoomBySocketId = new Map();
const reconnectGraceTimers = new Map();
const quickMatchQueue = [];

function getAbilityTuning(abilityId) {
  return getSpellTuning(abilityId) || {};
}

function getAbilityCooldownMs(abilityId) {
  return Math.max(0, Number(getAbilityTuning(abilityId).cooldownMs) || 0);
}

function getAbilityCastDelayMs(abilityId) {
  return Math.max(0, Number(getAbilityTuning(abilityId).castDelayMs) || 0);
}

function getAbilityNumber(abilityId, key, fallback = 0, min = 0) {
  const tuning = getAbilityTuning(abilityId);
  const parsed = Number(tuning?.[key]);
  if (!Number.isFinite(parsed)) return Math.max(min, Number(fallback) || 0);
  return Math.max(min, parsed);
}

function getAbilityRole(abilityId) {
  const role = String(getAbilityTuning(abilityId)?.role || '').trim().toLowerCase();
  return role || 'utility';
}

function getWallHalfLengthDefault() {
  return getAbilityNumber(ABILITY_IDS.WALL, 'halfLength', 1.9, 0.05);
}

function getWallHalfThicknessDefault() {
  return getAbilityNumber(ABILITY_IDS.WALL, 'halfThickness', 0.36, 0.03);
}

function getWallDurationMsDefault() {
  return getAbilityNumber(ABILITY_IDS.WALL, 'durationMs', 4500, 100);
}

function getFireblastHitRadiusDefault() {
  return getAbilityNumber(ABILITY_IDS.FIREBLAST, 'hitRadius', 0.34, 0.05);
}

function getHookHitRadiusDefault() {
  return getAbilityNumber(ABILITY_IDS.HOOK, 'hitRadius', 0.38, 0.05);
}

function normalizeRoomCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function clonePosition(position) {
  if (!position || typeof position !== 'object') return null;
  return {
    x: Number(position.x) || 0,
    y: Number(position.y) || 0
  };
}

function sanitizeVector(vector) {
  if (!vector || typeof vector !== 'object') return { x: 0, y: 0 };
  const x = Number(vector.x);
  const y = Number(vector.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function logLifecycle(scope, event, fields = {}) {
  const details = Object.entries(fields)
    .filter(([, value]) => typeof value !== 'undefined')
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
  if (details) {
    console.log(`[${scope}] ${event} ${details}`);
    return;
  }
  console.log(`[${scope}] ${event}`);
}

function getQuickMatchQueueIndexBySocketId(socketId) {
  const normalizedSocketId = String(socketId || '');
  if (!normalizedSocketId) return -1;
  return quickMatchQueue.findIndex((entry) => String(entry?.socketId || '') === normalizedSocketId);
}

function getQueuedSocketById(socketId) {
  const normalizedSocketId = String(socketId || '');
  if (!normalizedSocketId) return null;
  const candidateSocket = io?.sockets?.sockets?.get(normalizedSocketId) || null;
  if (!candidateSocket || candidateSocket.connected !== true) return null;
  return candidateSocket;
}

function emitQuickMatchState(socket, status, extra = {}) {
  if (!socket) return;
  socket.emit('quick_match_state', {
    status: String(status || 'idle'),
    queueDepth: quickMatchQueue.length,
    ...extra
  });
}

function removeSocketFromQuickMatchQueue(socketId, reason = 'removed', emitEvent = false) {
  const index = getQuickMatchQueueIndexBySocketId(socketId);
  if (index < 0) return null;
  const [removedEntry] = quickMatchQueue.splice(index, 1);
  if (removedEntry) {
    logLifecycle('queue', 'removed', {
      socket: removedEntry.socketId,
      reason,
      queueDepth: quickMatchQueue.length
    });
    if (emitEvent) {
      const queuedSocket = getQueuedSocketById(removedEntry.socketId);
      if (queuedSocket) {
        emitQuickMatchState(queuedSocket, 'idle', {
          reason
        });
        queuedSocket.emit('quick_match_canceled', {
          status: 'idle',
          reason,
          queueDepth: quickMatchQueue.length
        });
      }
    }
  }
  return removedEntry || null;
}

function pruneQuickMatchQueue() {
  for (let index = quickMatchQueue.length - 1; index >= 0; index -= 1) {
    const entry = quickMatchQueue[index];
    const entrySocketId = String(entry?.socketId || '');
    if (!entrySocketId) {
      quickMatchQueue.splice(index, 1);
      continue;
    }
    if (!getQueuedSocketById(entrySocketId)) {
      quickMatchQueue.splice(index, 1);
      continue;
    }
    const existingRoomCode = playerRoomBySocketId.get(entrySocketId);
    if (existingRoomCode) {
      quickMatchQueue.splice(index, 1);
    }
  }
}

function findNextQueuedOpponent(excludedSocketId) {
  const normalizedExcludedId = String(excludedSocketId || '');
  pruneQuickMatchQueue();
  while (quickMatchQueue.length > 0) {
    const nextEntry = quickMatchQueue.shift();
    if (!nextEntry) continue;
    const nextSocketId = String(nextEntry.socketId || '');
    if (!nextSocketId || nextSocketId === normalizedExcludedId) continue;
    const queuedSocket = getQueuedSocketById(nextSocketId);
    if (!queuedSocket) continue;
    if (playerRoomBySocketId.has(nextSocketId)) continue;
    return {
      ...nextEntry,
      socket: queuedSocket
    };
  }
  return null;
}

function createQuickMatchRoomAndStartDraft(socketA, socketB) {
  if (!socketA || !socketB) return null;
  const roomCode = createUniqueRoomCode();
  const createdAt = Date.now();
  const room = {
    code: roomCode,
    players: [
      createRoomPlayer(socketA.id, 1),
      createRoomPlayer(socketB.id, 2)
    ],
    match: null,
    state: ROOM_STATES.WAITING,
    createdAt
  };
  rooms.set(roomCode, room);
  playerRoomBySocketId.set(socketA.id, roomCode);
  playerRoomBySocketId.set(socketB.id, roomCode);
  socketA.join(roomCode);
  socketB.join(roomCode);

  setRoomState(room, ROOM_STATES.STARTING, 'quick_match_found');
  createMatchForRoom(room);
  emitRoomUpdate(room);
  emitMatchStarted(room);
  emitMatchState(room, Date.now());
  return room;
}

function createAbilityAnalyticsEntry(abilityId) {
  return {
    abilityId: normalizeSpellId(abilityId) || String(abilityId || ''),
    role: getAbilityRole(abilityId),
    castRequested: 0,
    castAccepted: 0,
    castRejected: 0,
    cooldownRejected: 0,
    castExecuted: 0,
    hitsLanded: 0,
    eliminations: 0
  };
}

function ensureMatchAnalytics(match) {
  if (!match || typeof match !== 'object') {
    return {
      byAbility: {},
      playerLastImpactByNumber: {}
    };
  }
  if (!match.analytics || typeof match.analytics !== 'object') {
    match.analytics = {
      byAbility: {},
      playerLastImpactByNumber: {},
      createdAt: Number(match.startedAt) || Date.now(),
      lastUpdatedAt: Date.now()
    };
  }
  if (!match.analytics.byAbility || typeof match.analytics.byAbility !== 'object') {
    match.analytics.byAbility = {};
  }
  if (!match.analytics.playerLastImpactByNumber || typeof match.analytics.playerLastImpactByNumber !== 'object') {
    match.analytics.playerLastImpactByNumber = {};
  }
  Object.values(ABILITY_DEFS).forEach((abilityDef) => {
    const abilityId = normalizeSpellId(abilityDef?.id);
    if (!abilityId) return;
    if (!match.analytics.byAbility[abilityId]) {
      match.analytics.byAbility[abilityId] = createAbilityAnalyticsEntry(abilityId);
    }
  });
  match.analytics.lastUpdatedAt = Date.now();
  return match.analytics;
}

function trackAbilityMetric(match, abilityId, metric, amount = 1) {
  const normalizedAbilityId = normalizeSpellId(abilityId);
  if (!normalizedAbilityId || !metric) return;
  const analytics = ensureMatchAnalytics(match);
  if (!analytics.byAbility[normalizedAbilityId]) {
    analytics.byAbility[normalizedAbilityId] = createAbilityAnalyticsEntry(normalizedAbilityId);
  }
  const entry = analytics.byAbility[normalizedAbilityId];
  const currentValue = Number(entry[metric]) || 0;
  entry[metric] = currentValue + (Number(amount) || 0);
  analytics.lastUpdatedAt = Date.now();
}

function trackPlayerRecentImpact(match, targetPlayerNumber, sourcePlayerNumber, abilityId, timestamp = Date.now()) {
  const normalizedAbilityId = normalizeSpellId(abilityId);
  const targetNumber = Number(targetPlayerNumber) || 0;
  const sourceNumber = Number(sourcePlayerNumber) || 0;
  if (!match || !normalizedAbilityId || targetNumber <= 0 || sourceNumber <= 0) return;
  const analytics = ensureMatchAnalytics(match);
  analytics.playerLastImpactByNumber[targetNumber] = {
    abilityId: normalizedAbilityId,
    sourcePlayerNumber: sourceNumber,
    targetPlayerNumber: targetNumber,
    timestamp: Number(timestamp) || Date.now()
  };
  analytics.lastUpdatedAt = Date.now();
}

function getRecentImpactForPlayer(match, targetPlayerNumber, now = Date.now()) {
  if (!match) return null;
  const analytics = ensureMatchAnalytics(match);
  const targetNumber = Number(targetPlayerNumber) || 0;
  if (targetNumber <= 0) return null;
  const impact = analytics.playerLastImpactByNumber[targetNumber];
  if (!impact || typeof impact !== 'object') return null;
  const impactTimestamp = Number(impact.timestamp) || 0;
  const currentTimestamp = Number(now) || Date.now();
  if (impactTimestamp <= 0) return null;
  if ((currentTimestamp - impactTimestamp) > KILL_CREDIT_TIMEOUT_MS) return null;
  return impact;
}

function buildAbilityAnalyticsSnapshot(match) {
  const analytics = ensureMatchAnalytics(match);
  const snapshot = {};
  Object.keys(analytics.byAbility).forEach((abilityId) => {
    const entry = analytics.byAbility[abilityId];
    snapshot[abilityId] = {
      role: String(entry?.role || 'utility'),
      castRequested: Number(entry?.castRequested) || 0,
      castAccepted: Number(entry?.castAccepted) || 0,
      castRejected: Number(entry?.castRejected) || 0,
      cooldownRejected: Number(entry?.cooldownRejected) || 0,
      castExecuted: Number(entry?.castExecuted) || 0,
      hitsLanded: Number(entry?.hitsLanded) || 0,
      eliminations: Number(entry?.eliminations) || 0
    };
  });
  return snapshot;
}

function logSpellTuningSnapshot(reason = 'snapshot') {
  const tuning = getAllSpellTuning();
  Object.keys(tuning).forEach((abilityId) => {
    const entry = tuning[abilityId];
    if (!entry || typeof entry !== 'object') return;
    logLifecycle('tuning', 'spell_config', {
      reason,
      ability: abilityId,
      role: entry.role || 'utility',
      cooldownMs: Number(entry.cooldownMs) || 0,
      castDelayMs: Number(entry.castDelayMs) || 0,
      range: Number(entry.range) || 0,
      distance: Number(entry.distance) || 0,
      durationMs: Number(entry.durationMs) || 0,
      knockbackImpulse: Number(entry.knockbackImpulse) || 0
    });
  });
}

function logMatchAnalyticsSummary(room, match, endedAt = Date.now(), reason = 'match_end') {
  if (!room || !match) return;
  const analyticsSnapshot = buildAbilityAnalyticsSnapshot(match);
  const durationMs = Math.max(0, (Number(endedAt) || Date.now()) - (Number(match.startedAt) || Number(endedAt) || Date.now()));
  logLifecycle('analytics', 'match_summary', {
    code: room.code,
    matchId: match.matchId,
    reason,
    durationMs,
    winner: Number(match.winnerPlayerNumber) || 0,
    eliminated: Number(match.eliminatedPlayerNumber) || 0
  });
  Object.keys(analyticsSnapshot).forEach((abilityId) => {
    const entry = analyticsSnapshot[abilityId];
    const casts = Number(entry.castAccepted) || 0;
    const hits = Number(entry.hitsLanded) || 0;
    const eliminations = Number(entry.eliminations) || 0;
    if (casts <= 0 && hits <= 0 && eliminations <= 0) return;
    logLifecycle('analytics', 'spell_summary', {
      code: room.code,
      matchId: match.matchId,
      ability: abilityId,
      role: entry.role,
      castRequested: entry.castRequested,
      castAccepted: casts,
      castRejected: entry.castRejected,
      cooldownRejected: entry.cooldownRejected,
      castExecuted: entry.castExecuted,
      hitsLanded: hits,
      eliminations
    });
  });
}

function normalizeInputVector(input) {
  const rawX = Number(input?.x);
  const rawY = Number(input?.y);
  const x = Number.isFinite(rawX) ? clamp(rawX, -1, 1) : 0;
  const y = Number.isFinite(rawY) ? clamp(rawY, -1, 1) : 0;
  const magnitude = Math.hypot(x, y);
  if (magnitude <= 0) return { x: 0, y: 0 };
  if (magnitude <= 1) return { x, y };
  return {
    x: x / magnitude,
    y: y / magnitude
  };
}

function inputsEqual(inputA, inputB) {
  if (!inputA || !inputB) return false;
  return inputA.x === inputB.x && inputA.y === inputB.y;
}

function dotProduct(vectorA, vectorB) {
  const a = sanitizeVector(vectorA);
  const b = sanitizeVector(vectorB);
  return (a.x * b.x) + (a.y * b.y);
}

function positionsEqual(positionA, positionB) {
  if (!positionA || !positionB) return false;
  return positionA.x === positionB.x && positionA.y === positionB.y;
}

function buildSpawnPositions() {
  const player1 = clonePosition(SPAWN_POSITIONS[1]) || { x: -5, y: 0 };
  const player2 = clonePosition(SPAWN_POSITIONS[2]) || { x: 5, y: 0 };

  // Safety guard: never allow both players to spawn at the exact same coordinates.
  if (positionsEqual(player1, player2)) {
    player2.x += 10;
    console.log('[match] spawn_adjustment applied reason=identical_spawn_positions');
  }

  return { player1, player2 };
}

function createRoomCode() {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
}

function createUniqueRoomCode() {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const code = createRoomCode();
    if (!rooms.has(code)) return code;
  }
  return `${Date.now().toString(36).toUpperCase().slice(-ROOM_CODE_LENGTH)}`;
}

function createMatchId(roomCode) {
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${roomCode}-${timePart}-${randomPart}`;
}

function createProjectileId(match) {
  match.nextProjectileSequence = (Number(match.nextProjectileSequence) || 0) + 1;
  return `${match.matchId}-P${match.nextProjectileSequence}`;
}

function createWallId(match) {
  match.nextWallSequence = (Number(match.nextWallSequence) || 0) + 1;
  return `${match.matchId}-W${match.nextWallSequence}`;
}

function markProjectileResolved(match, projectileId, timestamp = Date.now()) {
  if (!match || !projectileId) return;
  const resolvedMap = ensureActionCache(match, 'resolvedProjectileIds');
  resolvedMap[String(projectileId)] = Number(timestamp) || Date.now();
}

function isProjectileResolved(match, projectileId) {
  if (!match || !projectileId) return false;
  const resolvedMap = ensureActionCache(match, 'resolvedProjectileIds');
  return Boolean(resolvedMap[String(projectileId)]);
}

function pruneResolvedProjectiles(match, now = Date.now(), ttlMs = 12000) {
  if (!match) return;
  const resolvedMap = ensureActionCache(match, 'resolvedProjectileIds');
  const minTimestamp = (Number(now) || Date.now()) - Math.max(0, Number(ttlMs) || 0);
  Object.keys(resolvedMap).forEach((projectileId) => {
    if ((Number(resolvedMap[projectileId]) || 0) < minTimestamp) {
      delete resolvedMap[projectileId];
    }
  });
}

function createHitId(match) {
  match.nextHitSequence = (Number(match.nextHitSequence) || 0) + 1;
  return `${match.matchId}-H${match.nextHitSequence}`;
}

function normalizeSpellId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z_]/g, '');
}

function normalizeRequestId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, '')
    .slice(0, 96);
}

function ensureActionCache(entity, key) {
  if (!entity || typeof entity !== 'object') return {};
  const current = entity[key];
  if (!current || typeof current !== 'object') {
    entity[key] = {};
    return entity[key];
  }
  return current;
}

function pruneRequestCache(cacheMap, now, ttlMs) {
  if (!cacheMap || typeof cacheMap !== 'object') return;
  const minTimestamp = (Number(now) || Date.now()) - Math.max(0, Number(ttlMs) || 0);
  Object.keys(cacheMap).forEach((requestId) => {
    const entry = cacheMap[requestId];
    const timestamp = Number(entry?.timestamp || entry?.at || 0);
    if (timestamp < minTimestamp) {
      delete cacheMap[requestId];
    }
  });
}

function isAllowedPhaseTransition(fromPhase, toPhase) {
  const from = String(fromPhase || '');
  const to = String(toPhase || '');
  if (!from || !to) return false;
  if (from === to) return true;
  const allowed = PHASE_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

function createDraftPoolState() {
  const pool = {};
  DRAFT_SPELL_POOL.forEach((spellId) => {
    pool[spellId] = {
      totalCopies: Number(DRAFT_SPELL_COPY_LIMITS[spellId]) || 0,
      remainingCopies: Number(DRAFT_SPELL_COPY_LIMITS[spellId]) || 0
    };
  });
  return pool;
}

function createDraftState(startedAt) {
  const startedTimestamp = Number(startedAt) || Date.now();
  const turnDurationMs = DRAFT_TURN_MS;
  const turnEndsAt = startedTimestamp + turnDurationMs;
  return {
    status: 'active',
    turnOrder: [...DRAFT_TURN_ORDER],
    currentTurnIndex: 0,
    currentTurnPlayerNumber: Number(DRAFT_TURN_ORDER[0]) || 1,
    turnDurationMs,
    turnStartedAt: startedTimestamp,
    turnEndsAt,
    pool: createDraftPoolState(),
    picksByPlayerNumber: {
      1: [],
      2: []
    },
    pickHistory: [],
    completedAt: null
  };
}

function createReconnectToken() {
  return crypto.randomBytes(24).toString('hex');
}

function createPlayerId() {
  return `P-${crypto.randomBytes(8).toString('hex')}`;
}

function normalizeReconnectToken(value) {
  return String(value || '').trim();
}

function getReconnectTimerKey(roomCode, playerId) {
  return `${String(roomCode || '')}:${String(playerId || '')}`;
}

function clearReconnectGraceTimer(roomCode, playerId) {
  const key = getReconnectTimerKey(roomCode, playerId);
  const timer = reconnectGraceTimers.get(key);
  if (!timer) return;
  clearTimeout(timer);
  reconnectGraceTimers.delete(key);
}

function clearReconnectTimersForRoom(roomCode) {
  const prefix = `${String(roomCode || '')}:`;
  reconnectGraceTimers.forEach((timer, key) => {
    if (!key.startsWith(prefix)) return;
    clearTimeout(timer);
    reconnectGraceTimers.delete(key);
  });
}

function createRoomPlayer(socketId, slot) {
  return {
    playerId: createPlayerId(),
    reconnectToken: createReconnectToken(),
    socketId,
    slot,
    ready: false,
    matchPlayerNumber: null,
    connected: true,
    disconnectedAt: null,
    reconnectGraceExpiresAt: null
  };
}

function getPlayerBySocketId(room, socketId) {
  return room.players.find((player) => player.socketId === socketId) || null;
}

function getPlayerByPlayerId(room, playerId) {
  return room.players.find((player) => player.playerId === playerId) || null;
}

function getPlayerByReconnectToken(room, reconnectToken) {
  const normalizedToken = normalizeReconnectToken(reconnectToken);
  if (!normalizedToken) return null;
  return room.players.find((player) => player.reconnectToken === normalizedToken) || null;
}

function getMatchPlayerBySocketId(match, socketId) {
  return match?.players?.find((player) => player.socketId === socketId) || null;
}

function getMatchPlayerByPlayerId(match, playerId) {
  return match?.players?.find((player) => player.playerId === playerId) || null;
}

function getMatchPlayerByNumber(match, matchPlayerNumber) {
  return match?.players?.find((player) => Number(player.matchPlayerNumber) === Number(matchPlayerNumber)) || null;
}

function getDraftCurrentTurnPlayerNumber(match) {
  const turnOrder = Array.isArray(match?.draft?.turnOrder) ? match.draft.turnOrder : [];
  const currentTurnIndex = Number(match?.draft?.currentTurnIndex) || 0;
  return Number(turnOrder[currentTurnIndex]) || null;
}

function getValidDraftSpellsForMatchPlayer(match, matchPlayer) {
  if (!match || !matchPlayer || match.phase !== MATCH_PHASE_DRAFT) return [];
  const draftedSpells = new Set(
    (Array.isArray(matchPlayer.draftedSpells) ? matchPlayer.draftedSpells : [])
      .map((spellId) => normalizeSpellId(spellId))
      .filter(Boolean)
  );

  return DRAFT_SPELL_POOL.filter((spellId) => {
    const poolEntry = match?.draft?.pool?.[spellId];
    const remainingCopies = Number(poolEntry?.remainingCopies) || 0;
    if (remainingCopies <= 0) return false;
    if (draftedSpells.has(spellId)) return false;
    return true;
  });
}

function getConnectedPlayerCount(room) {
  return (Array.isArray(room?.players) ? room.players : [])
    .filter((player) => player.connected !== false)
    .length;
}

function areAllMatchPlayersConnected(match) {
  const matchPlayers = Array.isArray(match?.players) ? match.players : [];
  return matchPlayers.length > 0 && matchPlayers.every((player) => player.connected !== false);
}

function normalizePlayerSlots(room) {
  room.players.forEach((player, index) => {
    player.slot = index + 1;
  });
}

function resetReadyAndMatchRole(room) {
  room.players.forEach((player) => {
    player.ready = false;
    player.matchPlayerNumber = null;
  });
}

function createFireblastProjectile(match, ownerPlayer, direction, now) {
  const spawnOffset = getAbilityNumber(ABILITY_IDS.FIREBLAST, 'spawnOffset', 0.9, 0);
  const speed = getAbilityNumber(ABILITY_IDS.FIREBLAST, 'speed', 14, 0.01);
  const hitRadius = getAbilityNumber(ABILITY_IDS.FIREBLAST, 'hitRadius', 0.34, 0.05);
  const lifetimeMs = getAbilityNumber(ABILITY_IDS.FIREBLAST, 'lifetimeMs', 1400, 10);
  const normalizedDirection = normalizeInputVector(direction);
  const spawnBase = clonePosition(ownerPlayer.position) || { x: 0, y: 0 };
  const spawnPosition = {
    x: spawnBase.x + normalizedDirection.x * spawnOffset,
    y: spawnBase.y + normalizedDirection.y * spawnOffset
  };

  return {
    projectileId: createProjectileId(match),
    abilityId: ABILITY_IDS.FIREBLAST,
    ownerPlayerNumber: ownerPlayer.matchPlayerNumber,
    position: spawnPosition,
    direction: normalizedDirection,
    speed,
    hitRadius,
    spawnedAt: now,
    expiresAt: now + lifetimeMs
  };
}

function createHookProjectile(match, ownerPlayer, direction, now) {
  const spawnOffset = getAbilityNumber(ABILITY_IDS.HOOK, 'spawnOffset', 0.92, 0);
  const speed = getAbilityNumber(ABILITY_IDS.HOOK, 'speed', 18, 0.01);
  const hitRadius = getAbilityNumber(ABILITY_IDS.HOOK, 'hitRadius', 0.38, 0.05);
  const lifetimeMs = getAbilityNumber(ABILITY_IDS.HOOK, 'lifetimeMs', 900, 10);
  const normalizedDirection = normalizeInputVector(direction);
  const spawnBase = clonePosition(ownerPlayer.position) || { x: 0, y: 0 };
  const spawnPosition = {
    x: spawnBase.x + normalizedDirection.x * spawnOffset,
    y: spawnBase.y + normalizedDirection.y * spawnOffset
  };

  return {
    projectileId: createProjectileId(match),
    abilityId: ABILITY_IDS.HOOK,
    ownerPlayerNumber: ownerPlayer.matchPlayerNumber,
    position: spawnPosition,
    direction: normalizedDirection,
    speed,
    hitRadius,
    spawnedAt: now,
    expiresAt: now + lifetimeMs
  };
}

function getOpponentPlayer(match, ownerPlayerNumber) {
  return (Array.isArray(match?.players) ? match.players : [])
    .find((player) => Number(player?.matchPlayerNumber) !== Number(ownerPlayerNumber)) || null;
}

function isOutsideArenaBoundary(position) {
  const pos = clonePosition(position) || { x: 0, y: 0 };
  const dx = pos.x - ARENA_BOUNDARY_CENTER.x;
  const dy = pos.y - ARENA_BOUNDARY_CENTER.y;
  return (dx * dx + dy * dy) > (ARENA_BOUNDARY_RADIUS * ARENA_BOUNDARY_RADIUS);
}

function clampPositionInsideArena(position, padding = 0) {
  const pos = clonePosition(position) || { x: 0, y: 0 };
  const safePadding = Math.max(0, Number(padding) || 0);
  const maxRadius = Math.max(0, ARENA_BOUNDARY_RADIUS - safePadding);
  const dx = pos.x - ARENA_BOUNDARY_CENTER.x;
  const dy = pos.y - ARENA_BOUNDARY_CENTER.y;
  const distance = Math.hypot(dx, dy);

  if (distance <= maxRadius || distance <= 0) {
    return pos;
  }

  const scale = maxRadius / distance;
  return {
    x: ARENA_BOUNDARY_CENTER.x + (dx * scale),
    y: ARENA_BOUNDARY_CENTER.y + (dy * scale)
  };
}


function createWallEntity(match, ownerPlayerNumber, position, direction, now) {
  const halfLength = getAbilityNumber(ABILITY_IDS.WALL, 'halfLength', 1.9, 0.05);
  const halfThickness = getAbilityNumber(ABILITY_IDS.WALL, 'halfThickness', 0.36, 0.03);
  const durationMs = getAbilityNumber(ABILITY_IDS.WALL, 'durationMs', 4500, 100);
  return {
    wallId: createWallId(match),
    ownerPlayerNumber: Number(ownerPlayerNumber) || 0,
    position: clonePosition(position) || { x: 0, y: 0 },
    direction: getWallDirection({ direction }),
    halfLength,
    halfThickness,
    spawnedAt: Number(now) || Date.now(),
    expiresAt: (Number(now) || Date.now()) + durationMs
  };
}

function pruneExpiredWalls(match, timestamp = Date.now()) {
  if (!match) return;
  const now = Number(timestamp) || Date.now();
  const currentWalls = Array.isArray(match.walls) ? match.walls : [];
  const activeWalls = [];
  currentWalls.forEach((wall) => {
    if (isWallActive(wall, now)) {
      activeWalls.push(wall);
      return;
    }
    logLifecycle('ability', 'wall_expired', {
      code: match.roomCode,
      wallId: wall.wallId || '-',
      owner: Number(wall.ownerPlayerNumber) || 0
    });
  });
  match.walls = activeWalls;
}

function ensurePlayerPositionHistory(matchPlayer, timestamp = Date.now()) {
  if (!matchPlayer || typeof matchPlayer !== 'object') return [];
  if (!Array.isArray(matchPlayer.positionHistory)) {
    matchPlayer.positionHistory = [];
  }

  const now = Number(timestamp) || Date.now();
  const historyIntervalMs = getAbilityNumber(ABILITY_IDS.REWIND, 'historyIntervalMs', 70, 10);
  const historyWindowMs = getAbilityNumber(ABILITY_IDS.REWIND, 'historyMs', 2200, 100);
  const history = matchPlayer.positionHistory;
  const position = clonePosition(matchPlayer.position) || { x: 0, y: 0 };
  const lastEntry = history.length ? history[history.length - 1] : null;
  const shouldPush = !lastEntry
    || (now - Number(lastEntry.timestamp || 0)) >= historyIntervalMs
    || Math.hypot(position.x - Number(lastEntry.x || 0), position.y - Number(lastEntry.y || 0)) >= 0.08;

  if (shouldPush) {
    history.push({
      x: position.x,
      y: position.y,
      timestamp: now
    });
  }

  const minTimestamp = now - historyWindowMs;
  while (history.length > 1 && Number(history[0].timestamp || 0) < minTimestamp) {
    history.shift();
  }
  return history;
}

function hasSpellInLoadout(matchPlayer, spellId) {
  const normalizedSpellId = normalizeSpellId(spellId);
  if (!normalizedSpellId) return false;
  const draftedLoadout = Array.isArray(matchPlayer?.loadoutSpells) ? matchPlayer.loadoutSpells : [];
  const fullLoadout = Array.isArray(matchPlayer?.loadout) ? matchPlayer.loadout : [];
  const combined = [...draftedLoadout, ...fullLoadout]
    .map((entry) => normalizeSpellId(entry))
    .filter(Boolean);
  return combined.includes(normalizedSpellId);
}

function getAbilityDef(abilityId) {
  const normalizedAbilityId = normalizeSpellId(abilityId);
  if (!normalizedAbilityId) return null;
  return ABILITY_DEFS[normalizedAbilityId] || null;
}

function normalizeAbilityCooldownMap(value) {
  if (!value || typeof value !== 'object') return {};
  const map = {};
  Object.keys(value).forEach((abilityId) => {
    const normalizedAbilityId = normalizeSpellId(abilityId);
    if (!normalizedAbilityId) return;
    const readyAt = Number(value[abilityId]) || 0;
    map[normalizedAbilityId] = readyAt;
  });
  return map;
}

function getAbilityReadyAt(matchPlayer, abilityId) {
  const normalizedAbilityId = normalizeSpellId(abilityId);
  if (!normalizedAbilityId || !matchPlayer) return 0;
  const cooldowns = normalizeAbilityCooldownMap(matchPlayer.abilityCooldowns);
  const fromMap = Number(cooldowns[normalizedAbilityId]) || 0;
  if (fromMap > 0) return fromMap;

  if (normalizedAbilityId === ABILITY_IDS.FIREBLAST) {
    return Number(matchPlayer.nextFireblastAt) || 0;
  }
  if (normalizedAbilityId === ABILITY_IDS.BLINK) {
    return Number(matchPlayer.nextBlinkAt) || 0;
  }
  if (normalizedAbilityId === ABILITY_IDS.SHIELD) {
    return Number(matchPlayer.nextShieldAt) || 0;
  }
  if (normalizedAbilityId === ABILITY_IDS.GUST) {
    return Number(matchPlayer.nextGustAt) || 0;
  }
  if (normalizedAbilityId === ABILITY_IDS.CHARGE) {
    return Number(matchPlayer.nextChargeAt) || 0;
  }
  if (normalizedAbilityId === ABILITY_IDS.SHOCK) {
    return Number(matchPlayer.nextShockAt) || 0;
  }
  if (normalizedAbilityId === ABILITY_IDS.HOOK) {
    return Number(matchPlayer.nextHookAt) || 0;
  }
  if (normalizedAbilityId === ABILITY_IDS.WALL) {
    return Number(matchPlayer.nextWallAt) || 0;
  }
  if (normalizedAbilityId === ABILITY_IDS.REWIND) {
    return Number(matchPlayer.nextRewindAt) || 0;
  }
  return 0;
}

function setAbilityReadyAt(matchPlayer, abilityId, readyAt) {
  const normalizedAbilityId = normalizeSpellId(abilityId);
  if (!normalizedAbilityId || !matchPlayer) return;
  const nextReadyAt = Math.max(0, Number(readyAt) || 0);
  const currentMap = normalizeAbilityCooldownMap(matchPlayer.abilityCooldowns);
  currentMap[normalizedAbilityId] = nextReadyAt;
  matchPlayer.abilityCooldowns = currentMap;

  if (normalizedAbilityId === ABILITY_IDS.FIREBLAST) {
    matchPlayer.nextFireblastAt = nextReadyAt;
  } else if (normalizedAbilityId === ABILITY_IDS.BLINK) {
    matchPlayer.nextBlinkAt = nextReadyAt;
  } else if (normalizedAbilityId === ABILITY_IDS.SHIELD) {
    matchPlayer.nextShieldAt = nextReadyAt;
  } else if (normalizedAbilityId === ABILITY_IDS.GUST) {
    matchPlayer.nextGustAt = nextReadyAt;
  } else if (normalizedAbilityId === ABILITY_IDS.CHARGE) {
    matchPlayer.nextChargeAt = nextReadyAt;
  } else if (normalizedAbilityId === ABILITY_IDS.SHOCK) {
    matchPlayer.nextShockAt = nextReadyAt;
  } else if (normalizedAbilityId === ABILITY_IDS.HOOK) {
    matchPlayer.nextHookAt = nextReadyAt;
  } else if (normalizedAbilityId === ABILITY_IDS.WALL) {
    matchPlayer.nextWallAt = nextReadyAt;
  } else if (normalizedAbilityId === ABILITY_IDS.REWIND) {
    matchPlayer.nextRewindAt = nextReadyAt;
  }
}

function getAbilityRemainingMs(matchPlayer, abilityId, now = Date.now()) {
  const readyAt = getAbilityReadyAt(matchPlayer, abilityId);
  if (readyAt <= 0) return 0;
  return Math.max(0, readyAt - (Number(now) || Date.now()));
}

function getPlayerActiveShieldUntil(matchPlayer) {
  const fromLegacy = Number(matchPlayer?.activeShieldUntil) || 0;
  const fromEffects = Number(matchPlayer?.activeEffects?.shieldUntil) || 0;
  return Math.max(fromLegacy, fromEffects, 0);
}

function setPlayerActiveShieldUntil(matchPlayer, shieldUntil) {
  const nextShieldUntil = Math.max(0, Number(shieldUntil) || 0);
  matchPlayer.activeShieldUntil = nextShieldUntil;
  matchPlayer.activeEffects = {
    ...(matchPlayer.activeEffects || {}),
    shieldUntil: nextShieldUntil
  };
}

function isShieldActive(matchPlayer, timestamp = Date.now()) {
  return getPlayerActiveShieldUntil(matchPlayer) > (Number(timestamp) || Date.now());
}

function buildAbilityCooldownSnapshot(matchPlayer, now = Date.now()) {
  const cooldowns = {};
  Object.values(ABILITY_DEFS).forEach((abilityDef) => {
    const abilityId = abilityDef.id;
    cooldowns[abilityId] = getAbilityRemainingMs(matchPlayer, abilityId, now);
  });
  return cooldowns;
}

function buildAbilityReadyAtSnapshot(matchPlayer) {
  const readyAt = {};
  Object.values(ABILITY_DEFS).forEach((abilityDef) => {
    readyAt[abilityDef.id] = getAbilityReadyAt(matchPlayer, abilityDef.id);
  });
  return readyAt;
}

function transitionMatchPhase(room, nextPhase, reason = 'phase_transition', timestamp = Date.now()) {
  if (!room?.match) return false;
  const match = room.match;
  const previousPhase = String(match.phase || '');
  const targetPhase = String(nextPhase || '');
  if (!targetPhase) return false;
  if (previousPhase === targetPhase) {
    logLifecycle('phase', 'transition_ignored_same_phase', {
      code: room.code,
      phase: targetPhase,
      reason
    });
    return true;
  }
  if (!isAllowedPhaseTransition(previousPhase, targetPhase)) {
    logLifecycle('phase', 'transition_rejected_invalid', {
      code: room.code,
      from: previousPhase || '-',
      to: targetPhase,
      reason
    });
    return false;
  }

  match.phase = targetPhase;
  match.lastTickAt = Number(timestamp) || Date.now();
  match.lastBroadcastAt = Number(timestamp) || Date.now();
  logLifecycle('phase', 'transition', {
    code: room.code,
    from: previousPhase || '-',
    to: targetPhase,
    reason
  });
  return true;
}

function resetTransientMatchPlayerState(matchPlayer, timestamp = Date.now()) {
  if (!matchPlayer || typeof matchPlayer !== 'object') return;
  const now = Number(timestamp) || Date.now();
  matchPlayer.input = { x: 0, y: 0 };
  matchPlayer.velocity = { x: 0, y: 0 };
  matchPlayer.lastUpdated = now;
  setPlayerActiveShieldUntil(matchPlayer, 0);
  matchPlayer.activeEffects = {
    ...(matchPlayer.activeEffects || {}),
    shieldUntil: 0,
    charge: null
  };
}

function transitionMatchToEnd(room, eliminatedPlayer, winnerPlayer, reason, timestamp) {
  const match = room?.match;
  if (!match) return false;
  if (match.phase === MATCH_PHASE_MATCH_END) return false;

  const endedAt = Number(timestamp) || Date.now();
  const eliminatedNumber = Number(eliminatedPlayer?.matchPlayerNumber) || null;
  const winnerNumber = Number(winnerPlayer?.matchPlayerNumber) || null;

  const didTransition = transitionMatchPhase(room, MATCH_PHASE_MATCH_END, reason, endedAt);
  if (!didTransition) return false;

  match.eliminatedPlayerNumber = eliminatedNumber;
  match.winnerPlayerNumber = winnerNumber;
  match.endedAt = endedAt;
  match.matchEndReason = String(reason || 'match_end');
  match.projectiles = [];
  match.walls = [];
  match.pendingAbilityCasts = [];
  match.isPaused = false;
  match.pauseReason = '';
  match.pausedByPlayerNumber = null;
  match.pausedAt = null;

  (Array.isArray(match.players) ? match.players : []).forEach((player) => {
    resetTransientMatchPlayerState(player, endedAt);
    player.eliminated = Number(player?.matchPlayerNumber) === eliminatedNumber;
  });

  const recentImpact = getRecentImpactForPlayer(match, eliminatedNumber, endedAt);
  if (recentImpact && Number(recentImpact.sourcePlayerNumber) === winnerNumber) {
    trackAbilityMetric(match, recentImpact.abilityId, 'eliminations', 1);
    logLifecycle('analytics', 'elimination_credit', {
      code: room.code,
      matchId: match.matchId,
      ability: recentImpact.abilityId,
      winner: winnerNumber,
      eliminated: eliminatedNumber,
      msSinceImpact: Math.max(0, endedAt - (Number(recentImpact.timestamp) || endedAt))
    });
  }

  logLifecycle('match', 'winner_declared', {
    code: room.code,
    winner: winnerNumber,
    eliminated: eliminatedNumber,
    endedAt
  });
  logMatchAnalyticsSummary(room, match, endedAt, reason);
  return true;
}

function createFireblastHitEvent(match, projectile, targetPlayer, now) {
  const fireblastKnockbackImpulse = getAbilityNumber(ABILITY_IDS.FIREBLAST, 'knockbackImpulse', 10.2, 0);
  const knockback = {
    x: projectile.direction.x * fireblastKnockbackImpulse,
    y: projectile.direction.y * fireblastKnockbackImpulse
  };
  return {
    hitId: createHitId(match),
    type: 'fireblast_hit',
    abilityId: ABILITY_IDS.FIREBLAST,
    timestamp: now,
    projectileId: projectile.projectileId,
    sourcePlayerNumber: projectile.ownerPlayerNumber,
    targetPlayerNumber: targetPlayer.matchPlayerNumber,
    knockback
  };
}

function createCombatEvent(match, {
  type = 'combat_event',
  abilityId = '',
  sourcePlayerNumber = null,
  targetPlayerNumber = null,
  projectileId = '',
  timestamp = Date.now(),
  knockback = { x: 0, y: 0 },
  metadata = null
} = {}) {
  return {
    hitId: createHitId(match),
    type: String(type || 'combat_event'),
    abilityId: normalizeSpellId(abilityId),
    timestamp: Number(timestamp) || Date.now(),
    projectileId: String(projectileId || ''),
    sourcePlayerNumber: Number(sourcePlayerNumber) || 0,
    targetPlayerNumber: Number(targetPlayerNumber) || 0,
    knockback: { ...sanitizeVector(knockback) },
    metadata: metadata && typeof metadata === 'object' ? metadata : null
  };
}

function pushMatchHitEvent(match, hitEvent) {
  if (!Array.isArray(match.hitEvents)) {
    match.hitEvents = [];
  }
  match.hitEvents.push(hitEvent);
  const abilityId = normalizeSpellId(hitEvent?.abilityId);
  const type = String(hitEvent?.type || '');
  const sourcePlayerNumber = Number(hitEvent?.sourcePlayerNumber) || 0;
  const targetPlayerNumber = Number(hitEvent?.targetPlayerNumber) || 0;
  const timestamp = Number(hitEvent?.timestamp) || Date.now();
  const isOffensiveHit = type === 'fireblast_hit'
    || type === 'gust_hit'
    || type === 'shock_hit'
    || type === 'charge_hit'
    || type === 'hook_pull';
  if (abilityId && isOffensiveHit) {
    trackAbilityMetric(match, abilityId, 'hitsLanded', 1);
    if (sourcePlayerNumber > 0 && targetPlayerNumber > 0) {
      trackPlayerRecentImpact(match, targetPlayerNumber, sourcePlayerNumber, abilityId, timestamp);
    }
  }
  if (match.hitEvents.length > MATCH_HIT_EVENT_HISTORY_LIMIT) {
    match.hitEvents.splice(0, match.hitEvents.length - MATCH_HIT_EVENT_HISTORY_LIMIT);
  }
}

function getRoomReconnectStatus(room, now = Date.now()) {
  const disconnectedPlayers = (Array.isArray(room?.players) ? room.players : [])
    .filter((player) => player.connected === false)
    .map((player) => {
      const reconnectGraceExpiresAt = Number(player.reconnectGraceExpiresAt) || 0;
      const remainingMs = reconnectGraceExpiresAt > 0
        ? Math.max(0, reconnectGraceExpiresAt - now)
        : 0;
      return {
        playerId: player.playerId,
        slot: Number(player.slot) || null,
        matchPlayerNumber: Number(player.matchPlayerNumber) || null,
        disconnectedAt: Number(player.disconnectedAt) || null,
        reconnectGraceExpiresAt: reconnectGraceExpiresAt || null,
        remainingMs
      };
    });

  return {
    graceMs: RECONNECT_GRACE_MS,
    disconnectedPlayers
  };
}

function setMatchPauseState(match, paused, reason = '', pausedByPlayerNumber = null, timestamp = Date.now()) {
  if (!match || (match.phase !== MATCH_PHASE_COMBAT && match.phase !== MATCH_PHASE_COMBAT_COUNTDOWN)) return;

  if (paused) {
    if (match.isPaused === true && match.pauseReason === reason && Number(match.pausedByPlayerNumber) === Number(pausedByPlayerNumber)) {
      return;
    }
    match.isPaused = true;
    match.pauseReason = String(reason || 'paused');
    match.pausedByPlayerNumber = Number(pausedByPlayerNumber) || null;
    match.pausedAt = Number(timestamp) || Date.now();
    match.players.forEach((player) => {
      player.input = { x: 0, y: 0 };
    });
    return;
  }

  if (match.isPaused !== true) return;
  match.isPaused = false;
  match.pauseReason = '';
  match.pausedByPlayerNumber = null;
  match.pausedAt = null;
  match.lastTickAt = Number(timestamp) || Date.now();
}

function areAllPlayersReady(room) {
  return room.players.length === MAX_PLAYERS_PER_ROOM
    && getConnectedPlayerCount(room) === MAX_PLAYERS_PER_ROOM
    && room.players.every((player) => player.ready === true && player.connected !== false);
}

function getStateForRoom(room) {
  if (room.match) {
    if (room.match.phase === MATCH_PHASE_DRAFT) return ROOM_STATES.DRAFT;
    if (room.match.phase === MATCH_PHASE_MATCH_END) return ROOM_STATES.MATCH_END;
    if (room.match.phase === MATCH_PHASE_COMBAT_COUNTDOWN) return ROOM_STATES.COMBAT;
    if (room.match.phase === MATCH_PHASE_COMBAT) return ROOM_STATES.COMBAT;
    return ROOM_STATES.IN_MATCH;
  }
  if (room.players.length < MAX_PLAYERS_PER_ROOM) return ROOM_STATES.WAITING;
  if (getConnectedPlayerCount(room) < MAX_PLAYERS_PER_ROOM) return ROOM_STATES.WAITING;
  if (areAllPlayersReady(room)) return ROOM_STATES.STARTING;
  return ROOM_STATES.READY_CHECK;
}

function setRoomState(room, nextState, reason = 'sync') {
  const previousState = room.state || ROOM_STATES.WAITING;
  room.state = nextState;
  if (previousState !== nextState) {
    logLifecycle('room', 'state_change', {
      code: room.code,
      from: previousState,
      to: nextState,
      reason
    });
  }
  return room.state;
}

function refreshRoomState(room, reason = 'sync') {
  return setRoomState(room, getStateForRoom(room), reason);
}

function createMatchForRoom(room) {
  if (!room) return null;
  if (room.match) {
    logLifecycle('match', 'create_ignored_existing_match', {
      code: room.code,
      phase: room.match.phase || '-'
    });
    return room.match;
  }

  const startedAt = Date.now();

  room.players.forEach((player) => {
    player.matchPlayerNumber = player.slot;
    player.connected = true;
    player.disconnectedAt = null;
    player.reconnectGraceExpiresAt = null;
    clearReconnectGraceTimer(room.code, player.playerId);
    console.log(`[match] player_assignment code=${room.code} socket=${player.socketId} slot=${player.slot} matchPlayerNumber=${player.matchPlayerNumber}`);
  });

  const matchId = createMatchId(room.code);
  const spawnPositions = buildSpawnPositions();

  const matchPlayers = room.players.map((player) => ({
    playerId: player.playerId,
    reconnectToken: player.reconnectToken,
    socketId: player.socketId,
    slot: player.slot,
    ready: Boolean(player.ready),
    matchPlayerNumber: player.matchPlayerNumber,
    position: player.matchPlayerNumber === 1
      ? clonePosition(spawnPositions.player1)
      : clonePosition(spawnPositions.player2),
    velocity: { x: 0, y: 0 },
    input: { x: 0, y: 0 },
    aim: player.matchPlayerNumber === 1 ? { x: 1, y: 0 } : { x: -1, y: 0 },
    lastAimUpdated: startedAt,
    lastHitAt: 0,
    hitInvulnerableUntil: 0,
    eliminated: false,
    connected: player.connected !== false,
    disconnectedAt: null,
    reconnectGraceExpiresAt: null,
    draftedSpells: [],
    loadoutSpells: [],
    loadout: ['fireblast'],
    abilityCooldowns: {
      fireblast: 0,
      blink: 0,
      shield: 0,
      gust: 0,
      charge: 0,
      shock: 0,
      hook: 0,
      wall: 0,
      rewind: 0
    },
    actionRateLimits: {},
    recentAbilityRequests: {},
    recentDraftRequests: {},
    activeEffects: {
      shieldUntil: 0,
      charge: null
    },
    lastUpdated: startedAt,
    nextFireblastAt: 0,
    nextBlinkAt: 0,
    nextShieldAt: 0,
    nextGustAt: 0,
    nextChargeAt: 0,
    nextShockAt: 0,
    nextHookAt: 0,
    nextWallAt: 0,
    nextRewindAt: 0,
    activeShieldUntil: 0,
    positionHistory: []
  }));

  matchPlayers.forEach((player) => {
    ensurePlayerPositionHistory(player, startedAt);
  });

  const draftState = createDraftState(startedAt);

  room.match = {
    matchId,
    roomCode: room.code,
    startedAt,
    phase: MATCH_PHASE_DRAFT,
    combatStartsAt: null,
    combatCountdownSeconds: COMBAT_START_COUNTDOWN_SECONDS,
    draft: draftState,
    players: matchPlayers,
    spawnPositions,
    projectiles: [],
    walls: [],
    pendingAbilityCasts: [],
    resolvedProjectileIds: {},
    nextProjectileSequence: 0,
    nextWallSequence: 0,
    nextHitSequence: 0,
    hitEvents: [],
    analytics: {
      byAbility: {},
      playerLastImpactByNumber: {},
      createdAt: startedAt,
      lastUpdatedAt: startedAt
    },
    eliminatedPlayerNumber: null,
    winnerPlayerNumber: null,
    endedAt: null,
    isPaused: false,
    pauseReason: '',
    pausedByPlayerNumber: null,
    pausedAt: null,
    lastTickAt: startedAt,
    lastBroadcastAt: 0,
    lastMoveLogAt: 0,
    matchStartedEmittedAt: 0,
    cleanupAt: null
  };
  ensureMatchAnalytics(room.match);

  logLifecycle('match', 'created', {
    code: room.code,
    matchId,
    startedAt: room.match.startedAt
  });
  setRoomState(room, ROOM_STATES.DRAFT, 'draft_started');
  logLifecycle('draft', 'started', {
    code: room.code,
    turnOrder: DRAFT_TURN_ORDER.join('->'),
    turnMs: DRAFT_TURN_MS
  });
  logLifecycle('draft', 'current_turn', {
    code: room.code,
    turnIndex: 0,
    player: draftState.currentTurnPlayerNumber
  });
  return room.match;
}

function serializeMatch(match) {
  if (!match) return null;
  const now = Date.now();
  return {
    matchId: match.matchId,
    roomCode: match.roomCode,
    startedAt: match.startedAt,
    phase: match.phase,
    combatStartsAt: Number(match.combatStartsAt) || null,
    combatCountdownSeconds: Number(match.combatCountdownSeconds) || COMBAT_START_COUNTDOWN_SECONDS,
    combatCountdownRemainingMs: Number(match.combatStartsAt) > 0
      ? Math.max(0, Number(match.combatStartsAt) - now)
      : 0,
    isPaused: Boolean(match.isPaused),
    pauseReason: String(match.pauseReason || ''),
    pausedByPlayerNumber: Number(match.pausedByPlayerNumber) || null,
    pausedAt: Number(match.pausedAt) || null,
    players: match.players.map((player) => ({
      socketId: player.socketId,
      slot: player.slot,
      ready: Boolean(player.ready),
      matchPlayerNumber: player.matchPlayerNumber,
      position: clonePosition(player.position),
      velocity: { ...sanitizeVector(player.velocity) },
      input: { ...normalizeInputVector(player.input) },
      aim: { ...normalizeInputVector(player.aim) },
      lastAimUpdated: player.lastAimUpdated,
      lastHitAt: Number(player.lastHitAt) || 0,
      hitInvulnerableUntil: Number(player.hitInvulnerableUntil) || 0,
      eliminated: Boolean(player.eliminated),
      connected: player.connected !== false,
      disconnectedAt: Number(player.disconnectedAt) || null,
      reconnectGraceExpiresAt: Number(player.reconnectGraceExpiresAt) || null,
      reconnectGraceRemainingMs: Number(player.reconnectGraceExpiresAt) > 0
        ? Math.max(0, Number(player.reconnectGraceExpiresAt) - now)
        : 0,
      draftedSpells: (Array.isArray(player.draftedSpells) ? player.draftedSpells : [])
        .map((spellId) => normalizeSpellId(spellId))
        .filter(Boolean),
      loadoutSpells: (Array.isArray(player.loadoutSpells) ? player.loadoutSpells : [])
        .map((spellId) => normalizeSpellId(spellId))
        .filter(Boolean),
      loadout: (Array.isArray(player.loadout) ? player.loadout : [])
        .map((spellId) => normalizeSpellId(spellId))
        .filter(Boolean),
      abilityCooldowns: buildAbilityCooldownSnapshot(player, now),
      abilityReadyAt: buildAbilityReadyAtSnapshot(player),
      activeEffects: {
        shieldUntil: getPlayerActiveShieldUntil(player),
        shieldRemainingMs: Math.max(0, getPlayerActiveShieldUntil(player) - now),
        shieldActive: isShieldActive(player, now),
        chargeActive: Boolean(player?.activeEffects?.charge?.active),
        chargeRemainingDistance: Math.max(0, Number(player?.activeEffects?.charge?.remainingDistance) || 0),
        chargeDirection: { ...normalizeInputVector(player?.activeEffects?.charge?.direction) }
      },
      nextFireblastAt: Number(player.nextFireblastAt) || 0,
      nextBlinkAt: Number(player.nextBlinkAt) || 0,
      nextShieldAt: Number(player.nextShieldAt) || 0,
      nextGustAt: Number(player.nextGustAt) || 0,
      nextChargeAt: Number(player.nextChargeAt) || 0,
      nextShockAt: Number(player.nextShockAt) || 0,
      nextHookAt: Number(player.nextHookAt) || 0,
      nextWallAt: Number(player.nextWallAt) || 0,
      nextRewindAt: Number(player.nextRewindAt) || 0,
      lastUpdated: player.lastUpdated
    })),
    spawnPositions: {
      player1: clonePosition(match.spawnPositions?.player1),
      player2: clonePosition(match.spawnPositions?.player2)
    },
    projectiles: (Array.isArray(match.projectiles) ? match.projectiles : []).map((projectile) => {
      const projectileAbilityId = normalizeSpellId(projectile.abilityId || ABILITY_IDS.FIREBLAST) || ABILITY_IDS.FIREBLAST;
      const defaultSpeed = projectileAbilityId === ABILITY_IDS.HOOK
        ? getAbilityNumber(ABILITY_IDS.HOOK, 'speed', 18, 0.01)
        : getAbilityNumber(ABILITY_IDS.FIREBLAST, 'speed', 14, 0.01);
      const defaultHitRadius = projectileAbilityId === ABILITY_IDS.HOOK
        ? getHookHitRadiusDefault()
        : getFireblastHitRadiusDefault();
      return {
        projectileId: projectile.projectileId,
        abilityId: projectileAbilityId,
        ownerPlayerNumber: projectile.ownerPlayerNumber,
        position: clonePosition(projectile.position),
        direction: { ...normalizeInputVector(projectile.direction) },
        speed: Number(projectile.speed) || defaultSpeed,
        hitRadius: Number(projectile.hitRadius) || defaultHitRadius,
        spawnedAt: projectile.spawnedAt,
        expiresAt: projectile.expiresAt
      };
    }),
    walls: (Array.isArray(match.walls) ? match.walls : []).map((wall) => ({
      wallId: String(wall.wallId || ''),
      ownerPlayerNumber: Number(wall.ownerPlayerNumber) || 0,
      position: clonePosition(wall.position),
      direction: { ...getWallDirection(wall) },
      halfLength: getWallHalfLength(wall, getWallHalfLengthDefault()),
      halfThickness: getWallHalfThickness(wall, getWallHalfThicknessDefault()),
      spawnedAt: Number(wall.spawnedAt) || 0,
      expiresAt: Number(wall.expiresAt) || 0
    })),
    hitEvents: (Array.isArray(match.hitEvents) ? match.hitEvents : []).map((hitEvent) => ({
      hitId: String(hitEvent.hitId || ''),
      timestamp: Number(hitEvent.timestamp) || 0,
      projectileId: String(hitEvent.projectileId || ''),
      type: String(hitEvent.type || 'combat_event'),
      abilityId: normalizeSpellId(hitEvent.abilityId),
      sourcePlayerNumber: Number(hitEvent.sourcePlayerNumber) || 0,
      targetPlayerNumber: Number(hitEvent.targetPlayerNumber) || 0,
      knockback: { ...sanitizeVector(hitEvent.knockback) },
      metadata: hitEvent.metadata && typeof hitEvent.metadata === 'object' ? hitEvent.metadata : null
    })),
    abilityAnalytics: buildAbilityAnalyticsSnapshot(match),
    eliminatedPlayerNumber: Number(match.eliminatedPlayerNumber) || null,
    winnerPlayerNumber: Number(match.winnerPlayerNumber) || null,
    endedAt: Number(match.endedAt) || null,
    draft: match.draft
      ? {
        status: String(match.draft.status || 'active'),
        currentTurnIndex: Number(match.draft.currentTurnIndex) || 0,
        currentTurnPlayerNumber: Number(match.draft.currentTurnPlayerNumber) || null,
        turnDurationMs: Number(match.draft.turnDurationMs) || DRAFT_TURN_MS,
        turnStartedAt: Number(match.draft.turnStartedAt) || null,
        turnEndsAt: Number(match.draft.turnEndsAt) || null,
        turnRemainingMs: Number(match.draft.turnEndsAt) > 0
          ? Math.max(0, Number(match.draft.turnEndsAt) - now)
          : 0,
        turnOrder: Array.isArray(match.draft.turnOrder) ? match.draft.turnOrder.map((value) => Number(value) || 0) : [],
        pool: DRAFT_SPELL_POOL.reduce((acc, spellId) => {
          const poolEntry = match.draft.pool?.[spellId];
          acc[spellId] = {
            totalCopies: Number(poolEntry?.totalCopies) || Number(DRAFT_SPELL_COPY_LIMITS[spellId]) || 0,
            remainingCopies: Number(poolEntry?.remainingCopies) || 0
          };
          return acc;
        }, {}),
        picksByPlayerNumber: {
          1: (Array.isArray(match.draft.picksByPlayerNumber?.[1]) ? match.draft.picksByPlayerNumber[1] : [])
            .map((spellId) => normalizeSpellId(spellId))
            .filter(Boolean),
          2: (Array.isArray(match.draft.picksByPlayerNumber?.[2]) ? match.draft.picksByPlayerNumber[2] : [])
            .map((spellId) => normalizeSpellId(spellId))
            .filter(Boolean)
        },
        pickHistory: Array.isArray(match.draft.pickHistory)
          ? match.draft.pickHistory.map((entry) => ({
            turnIndex: Number(entry?.turnIndex) || 0,
            playerNumber: Number(entry?.playerNumber) || 0,
            spellId: normalizeSpellId(entry?.spellId),
            reason: String(entry?.reason || 'manual'),
            timestamp: Number(entry?.timestamp) || 0
          }))
          : [],
        completedAt: Number(match.draft.completedAt) || null
      }
      : null,
    arenaBoundary: {
      type: 'circle',
      center: clonePosition(ARENA_BOUNDARY_CENTER),
      radius: ARENA_BOUNDARY_RADIUS
    }
  };
}

function serializeRoom(room) {
  refreshRoomState(room, 'serialize');
  const now = Date.now();
  return {
    code: room.code,
    createdAt: room.createdAt,
    playerCount: room.players.length,
    connectedPlayerCount: getConnectedPlayerCount(room),
    state: room.state,
    status: room.state,
    players: room.players.map((player) => ({
      ...(function resolveDraftFields() {
        const matchPlayer = getMatchPlayerByPlayerId(room.match, player.playerId);
        return {
          draftedSpells: (Array.isArray(matchPlayer?.draftedSpells) ? matchPlayer.draftedSpells : [])
            .map((spellId) => normalizeSpellId(spellId))
            .filter(Boolean),
          loadoutSpells: (Array.isArray(matchPlayer?.loadoutSpells) ? matchPlayer.loadoutSpells : [])
            .map((spellId) => normalizeSpellId(spellId))
            .filter(Boolean)
        };
      }()),
      socketId: player.socketId,
      playerId: player.playerId,
      slot: player.slot,
      ready: Boolean(player.ready),
      matchPlayerNumber: player.matchPlayerNumber,
      connected: player.connected !== false,
      disconnectedAt: Number(player.disconnectedAt) || null,
      reconnectGraceExpiresAt: Number(player.reconnectGraceExpiresAt) || null,
      reconnectGraceRemainingMs: Number(player.reconnectGraceExpiresAt) > 0
        ? Math.max(0, Number(player.reconnectGraceExpiresAt) - now)
        : 0
    })),
    reconnect: getRoomReconnectStatus(room, now),
    match: serializeMatch(room.match)
  };
}

function emitRoomUpdate(room) {
  io.to(room.code).emit('room_update', {
    roomCode: room.code,
    room: serializeRoom(room)
  });
}

function emitMatchStarted(room) {
  if (!room.match) return;
  if (Number(room.match.matchStartedEmittedAt) > 0) {
    logLifecycle('match', 'match_started_emit_ignored_duplicate', {
      code: room.code,
      matchId: room.match.matchId
    });
    return;
  }
  room.match.matchStartedEmittedAt = Date.now();
  const serializedRoom = serializeRoom(room);
  const serializedMatch = serializeMatch(room.match);

  room.players.forEach((player) => {
    const mySpawnPosition = player.matchPlayerNumber === 1
      ? clonePosition(serializedMatch.spawnPositions.player1)
      : clonePosition(serializedMatch.spawnPositions.player2);
    const opponentSpawnPosition = player.matchPlayerNumber === 1
      ? clonePosition(serializedMatch.spawnPositions.player2)
      : clonePosition(serializedMatch.spawnPositions.player1);

    io.to(player.socketId).emit('match_started', {
      roomCode: room.code,
      room: serializedRoom,
      match: serializedMatch,
      matchPlayerNumber: player.matchPlayerNumber,
      reconnectToken: player.reconnectToken,
      reconnectPlayerId: player.playerId,
      spawnPositions: serializedMatch.spawnPositions,
      mySpawnPosition,
      opponentSpawnPosition
    });
  });
}

function emitMatchState(room, timestamp = Date.now()) {
  if (!room.match) return;
  const serializedMatch = serializeMatch(room.match);
  io.to(room.code).emit('match_state', {
    roomCode: room.code,
    matchId: serializedMatch.matchId,
    startedAt: serializedMatch.startedAt,
    phase: serializedMatch.phase,
    combatStartsAt: serializedMatch.combatStartsAt,
    combatCountdownSeconds: serializedMatch.combatCountdownSeconds,
    combatCountdownRemainingMs: serializedMatch.combatCountdownRemainingMs,
    isPaused: Boolean(serializedMatch.isPaused),
    pauseReason: String(serializedMatch.pauseReason || ''),
    pausedByPlayerNumber: Number(serializedMatch.pausedByPlayerNumber) || null,
    pausedAt: Number(serializedMatch.pausedAt) || null,
    draft: serializedMatch.draft,
    players: serializedMatch.players,
    projectiles: serializedMatch.projectiles,
    walls: serializedMatch.walls,
    hitEvents: serializedMatch.hitEvents,
    abilityAnalytics: serializedMatch.abilityAnalytics,
    arenaBoundary: serializedMatch.arenaBoundary,
    eliminatedPlayerNumber: serializedMatch.eliminatedPlayerNumber,
    winnerPlayerNumber: serializedMatch.winnerPlayerNumber,
    endedAt: serializedMatch.endedAt,
    timestamp
  });
}

function emitMatchStateThrottled(room, timestamp = Date.now(), force = false) {
  if (!room?.match) return false;
  const now = Number(timestamp) || Date.now();
  const match = room.match;
  const lastBroadcastAt = Number(match.lastBroadcastAt) || 0;
  if (!force && (now - lastBroadcastAt) < MATCH_STATE_BROADCAST_MS) {
    return false;
  }
  match.lastBroadcastAt = now;
  emitMatchState(room, now);
  return true;
}

function buildPlayerSessionPayload(room, player) {
  if (!room || !player) return {};
  const serializedMatch = serializeMatch(room.match);
  const mySpawnPosition = player.matchPlayerNumber === 1
    ? clonePosition(serializedMatch?.spawnPositions?.player1)
    : player.matchPlayerNumber === 2
      ? clonePosition(serializedMatch?.spawnPositions?.player2)
      : null;
  const opponentSpawnPosition = player.matchPlayerNumber === 1
    ? clonePosition(serializedMatch?.spawnPositions?.player2)
    : player.matchPlayerNumber === 2
      ? clonePosition(serializedMatch?.spawnPositions?.player1)
      : null;

  return {
    roomCode: room.code,
    playerSlot: player.slot,
    matchPlayerNumber: player.matchPlayerNumber,
    reconnectToken: player.reconnectToken,
    reconnectPlayerId: player.playerId,
    room: serializeRoom(room),
    match: serializedMatch,
    spawnPositions: serializedMatch?.spawnPositions || null,
    mySpawnPosition,
    opponentSpawnPosition
  };
}

function clearDisconnectedStateForPlayer(player, timestamp = Date.now()) {
  if (!player) return;
  player.connected = true;
  player.disconnectedAt = null;
  player.reconnectGraceExpiresAt = null;
  if (player.input && typeof player.input === 'object') {
    player.input = { x: 0, y: 0 };
  }
  player.lastUpdated = Number(timestamp) || Date.now();
}

function markPlayerDisconnected(player, timestamp = Date.now()) {
  if (!player) return;
  const now = Number(timestamp) || Date.now();
  player.connected = false;
  player.disconnectedAt = now;
  player.reconnectGraceExpiresAt = now + RECONNECT_GRACE_MS;
}

function removePlayerFromRoomList(room, playerId) {
  if (!room) return null;
  const index = room.players.findIndex((player) => player.playerId === playerId);
  if (index < 0) return null;
  const [removedPlayer] = room.players.splice(index, 1);
  clearReconnectGraceTimer(room.code, playerId);
  return removedPlayer || null;
}

function deleteRoomIfEmpty(room) {
  if (!room) return false;
  if (room.players.length > 0) return false;
  cleanupRoomMatchState(room, 'room_deleted_empty', Date.now());
  clearReconnectTimersForRoom(room.code);
  rooms.delete(room.code);
  logLifecycle('room', 'deleted', {
    code: room.code
  });
  return true;
}

function tryResumePausedMatch(room, reason = 'player_reconnected') {
  if (!room?.match) return false;
  const match = room.match;
  if (match.phase !== MATCH_PHASE_COMBAT && match.phase !== MATCH_PHASE_COMBAT_COUNTDOWN) return false;
  if (match.isPaused !== true) return false;
  if (!areAllMatchPlayersConnected(match)) return false;

  setMatchPauseState(match, false, '', null, Date.now());
  logLifecycle('match', 'resumed', {
    code: room.code,
    reason
  });
  return true;
}

function handleReconnectGraceTimeout(roomCode, playerId) {
  const key = getReconnectTimerKey(roomCode, playerId);
  reconnectGraceTimers.delete(key);

  const room = rooms.get(roomCode);
  if (!room) return;

  const player = getPlayerByPlayerId(room, playerId);
  if (!player) return;
  if (player.connected !== false) return;

  const now = Date.now();
  const reconnectGraceExpiresAt = Number(player.reconnectGraceExpiresAt) || 0;
  if (reconnectGraceExpiresAt > now) {
    scheduleReconnectGraceTimeout(room, player);
    return;
  }

  const disconnectedMatchPlayer = getMatchPlayerByPlayerId(room.match, playerId);
  const disconnectedPlayerNumber = Number(disconnectedMatchPlayer?.matchPlayerNumber)
    || Number(player.matchPlayerNumber)
    || null;

  logLifecycle('reconnect', 'timeout_expired', {
    code: room.code,
    playerId: player.playerId,
    slot: player.slot
  });

  if (room.match && room.match.phase !== MATCH_PHASE_MATCH_END) {
    const winnerMatchPlayer = (Array.isArray(room.match.players) ? room.match.players : [])
      .find((matchPlayer) => Number(matchPlayer?.matchPlayerNumber) !== Number(disconnectedPlayerNumber) && matchPlayer.connected !== false) || null;
    const winnerPlayerNumber = Number(winnerMatchPlayer?.matchPlayerNumber) || null;

    transitionMatchToEnd(
      room,
      disconnectedMatchPlayer || { matchPlayerNumber: disconnectedPlayerNumber },
      winnerMatchPlayer || { matchPlayerNumber: winnerPlayerNumber },
      'reconnect_timeout_forfeit',
      now
    );
    setMatchPauseState(room.match, false, '', null, now);

    io.to(room.code).emit('reconnect_timeout_forfeit', {
      roomCode: room.code,
      disconnectedPlayerNumber,
      winnerPlayerNumber,
      disconnectedAt: Number(player.disconnectedAt) || null,
      expiredAt: now
    });
    logLifecycle('match', 'reconnect_timeout_forfeit', {
      code: room.code,
      disconnected: disconnectedPlayerNumber,
      winner: winnerPlayerNumber
    });

    const removed = removePlayerFromRoomList(room, player.playerId);
    if (removed) {
      logLifecycle('room', 'remove_disconnected_after_forfeit', {
        code: room.code,
        playerId: removed.playerId
      });
    }

    if (!deleteRoomIfEmpty(room)) {
      emitRoomUpdate(room);
      emitMatchState(room, now);
    }
    return;
  }

  const removed = removePlayerFromRoomList(room, player.playerId);
  if (removed) {
    logLifecycle('room', 'remove_disconnected_timeout', {
      code: room.code,
      playerId: removed.playerId
    });
  }

  if (room.match && room.match.phase === MATCH_PHASE_MATCH_END) {
    const matchPlayer = getMatchPlayerByPlayerId(room.match, playerId);
    if (matchPlayer) {
      matchPlayer.connected = false;
      matchPlayer.disconnectedAt = Number(player.disconnectedAt) || now;
      matchPlayer.reconnectGraceExpiresAt = reconnectGraceExpiresAt || now;
    }
  }

  if (!deleteRoomIfEmpty(room)) {
    refreshRoomState(room, 'reconnect_timeout');
    emitRoomUpdate(room);
    if (room.match) emitMatchState(room, now);
  }
}

function scheduleReconnectGraceTimeout(room, player) {
  if (!room || !player) return;
  clearReconnectGraceTimer(room.code, player.playerId);

  const reconnectGraceExpiresAt = Number(player.reconnectGraceExpiresAt) || 0;
  const remainingMs = reconnectGraceExpiresAt > 0
    ? Math.max(0, reconnectGraceExpiresAt - Date.now())
    : RECONNECT_GRACE_MS;
  const key = getReconnectTimerKey(room.code, player.playerId);

  const timer = setTimeout(() => {
    handleReconnectGraceTimeout(room.code, player.playerId);
  }, remainingMs + 15);
  reconnectGraceTimers.set(key, timer);
}

function beginDisconnectGraceForPlayer(room, player, disconnectReason = 'disconnect') {
  if (!room || !player) return;
  if (player.connected === false) {
    logLifecycle('reconnect', 'grace_already_active', {
      code: room.code,
      playerId: player.playerId,
      reason: disconnectReason
    });
    return;
  }

  const now = Date.now();
  const matchPlayer = getMatchPlayerByPlayerId(room.match, player.playerId);
  const matchPlayerNumber = Number(matchPlayer?.matchPlayerNumber) || Number(player.matchPlayerNumber) || null;

  markPlayerDisconnected(player, now);
  player.socketId = null;
  player.ready = false;

  if (matchPlayer) {
    markPlayerDisconnected(matchPlayer, now);
    matchPlayer.socketId = null;
    matchPlayer.input = { x: 0, y: 0 };
    matchPlayer.velocity = sanitizeVector(matchPlayer.velocity);
  }

  scheduleReconnectGraceTimeout(room, player);

  if (room.match && (room.match.phase === MATCH_PHASE_COMBAT || room.match.phase === MATCH_PHASE_COMBAT_COUNTDOWN)) {
    setMatchPauseState(room.match, true, 'player_disconnected', matchPlayerNumber, now);
  }

  io.to(room.code).emit('reconnect_grace_started', {
    roomCode: room.code,
    playerSlot: player.slot,
    matchPlayerNumber,
    disconnectedAt: now,
    reconnectGraceMs: RECONNECT_GRACE_MS
  });
  io.to(room.code).emit('player_disconnected', {
    roomCode: room.code,
    playerSlot: player.slot,
    matchPlayerNumber,
    disconnectedAt: now,
    reconnectGraceMs: RECONNECT_GRACE_MS,
    reason: disconnectReason
  });

  logLifecycle('reconnect', 'grace_started', {
    code: room.code,
    playerId: player.playerId,
    slot: player.slot,
    matchPlayerNumber,
    ms: RECONNECT_GRACE_MS
  });
  emitRoomUpdate(room);
  if (room.match) emitMatchState(room, now);
}

function completeDraftAndStartCombat(room, completedAt = Date.now()) {
  if (!room?.match) return false;
  const match = room.match;
  if (match.phase === MATCH_PHASE_COMBAT || match.phase === MATCH_PHASE_COMBAT_COUNTDOWN) {
    logLifecycle('draft', 'complete_ignored_already_in_combat', {
      code: room.code,
      matchId: match.matchId
    });
    return true;
  }
  if (match.phase !== MATCH_PHASE_DRAFT) return false;
  const now = Number(completedAt) || Date.now();

  if (match.draft) {
    match.draft.status = 'completed';
    match.draft.completedAt = now;
    match.draft.turnEndsAt = now;
    match.draft.turnStartedAt = now;
    match.draft.currentTurnPlayerNumber = null;
  }

  match.players.forEach((player) => {
    const draftedSpells = (Array.isArray(player.draftedSpells) ? player.draftedSpells : [])
      .map((spellId) => normalizeSpellId(spellId))
      .filter(Boolean);
    player.draftedSpells = draftedSpells;
    player.loadoutSpells = draftedSpells.slice(0, 3);
    player.loadout = ['fireblast', ...player.loadoutSpells];
    player.input = { x: 0, y: 0 };
    player.velocity = sanitizeVector(player.velocity);
    setAbilityReadyAt(player, ABILITY_IDS.FIREBLAST, 0);
    setAbilityReadyAt(player, ABILITY_IDS.BLINK, 0);
    setAbilityReadyAt(player, ABILITY_IDS.SHIELD, 0);
    setAbilityReadyAt(player, ABILITY_IDS.GUST, 0);
    setAbilityReadyAt(player, ABILITY_IDS.CHARGE, 0);
    setAbilityReadyAt(player, ABILITY_IDS.SHOCK, 0);
    setAbilityReadyAt(player, ABILITY_IDS.HOOK, 0);
    setAbilityReadyAt(player, ABILITY_IDS.WALL, 0);
    setAbilityReadyAt(player, ABILITY_IDS.REWIND, 0);
    setPlayerActiveShieldUntil(player, 0);
    player.activeEffects = {
      ...(player.activeEffects || {}),
      shieldUntil: 0,
      charge: null
    };
    player.positionHistory = [];
    ensurePlayerPositionHistory(player, now);
    player.recentAbilityRequests = {};
    player.recentDraftRequests = {};
    player.actionRateLimits = {};
  });

  match.combatStartsAt = now + COMBAT_START_COUNTDOWN_MS;
  match.combatCountdownSeconds = COMBAT_START_COUNTDOWN_SECONDS;

  const didTransition = transitionMatchPhase(
    room,
    MATCH_PHASE_COMBAT_COUNTDOWN,
    'draft_completed_start_countdown',
    now
  );
  if (!didTransition) {
    return false;
  }
  setRoomState(room, ROOM_STATES.COMBAT, 'draft_completed_start_countdown');
  logLifecycle('draft', 'completed', {
    code: room.code,
    at: now
  });
  logLifecycle('match', 'combat_countdown_started', {
    code: room.code,
    matchId: match.matchId,
    combatStartsAt: match.combatStartsAt,
    countdownSeconds: match.combatCountdownSeconds
  });
  return true;
}

function advanceDraftTurn(room, timestamp = Date.now()) {
  const match = room?.match;
  if (!match || match.phase !== MATCH_PHASE_DRAFT || !match.draft) return false;
  if (match.draft.status === 'completed') {
    logLifecycle('draft', 'advance_ignored_completed', {
      code: room.code,
      matchId: match.matchId
    });
    return false;
  }

  const now = Number(timestamp) || Date.now();
  const nextTurnIndex = (Number(match.draft.currentTurnIndex) || 0) + 1;
  match.draft.currentTurnIndex = nextTurnIndex;

  if (nextTurnIndex >= match.draft.turnOrder.length) {
    return completeDraftAndStartCombat(room, now);
  }

  const nextTurnPlayerNumber = Number(match.draft.turnOrder[nextTurnIndex]) || null;
  match.draft.currentTurnPlayerNumber = nextTurnPlayerNumber;
  match.draft.turnStartedAt = now;
  match.draft.turnEndsAt = now + (Number(match.draft.turnDurationMs) || DRAFT_TURN_MS);

  logLifecycle('draft', 'current_turn', {
    code: room.code,
    turnIndex: nextTurnIndex,
    player: nextTurnPlayerNumber
  });
  return true;
}

function applyDraftPick(room, pickingPlayerNumber, requestedSpellId, pickReason = 'manual') {
  const match = room?.match;
  if (!match || match.phase !== MATCH_PHASE_DRAFT || !match.draft) {
    return { ok: false, code: 'DRAFT_NOT_ACTIVE', message: 'Draft is not active.' };
  }

  const now = Date.now();
  const currentTurnPlayerNumber = getDraftCurrentTurnPlayerNumber(match);
  if (Number(currentTurnPlayerNumber) !== Number(pickingPlayerNumber)) {
    return { ok: false, code: 'NOT_YOUR_TURN', message: 'It is not your draft turn.' };
  }

  const matchPlayer = getMatchPlayerByNumber(match, pickingPlayerNumber);
  if (!matchPlayer) {
    return { ok: false, code: 'MATCH_PLAYER_NOT_FOUND', message: 'Draft player not found.' };
  }

  const normalizedRequestedSpellId = normalizeSpellId(requestedSpellId);
  const validSpells = getValidDraftSpellsForMatchPlayer(match, matchPlayer);
  if (validSpells.length <= 0) {
    const advanced = advanceDraftTurn(room, now);
    if (!advanced) {
      return { ok: false, code: 'DRAFT_STUCK', message: 'No valid spells available and draft could not advance.' };
    }
    return {
      ok: false,
      code: 'NO_VALID_SPELLS',
      message: 'No valid spells available for this player.',
      skipped: true
    };
  }

  let pickedSpellId = normalizedRequestedSpellId;
  if (!pickedSpellId || !DRAFT_SPELL_POOL.includes(pickedSpellId)) {
    return { ok: false, code: 'INVALID_SPELL', message: 'Invalid draft spell.' };
  }

  const poolEntry = match.draft.pool?.[pickedSpellId];
  const remainingCopies = Number(poolEntry?.remainingCopies) || 0;
  if (remainingCopies <= 0) {
    return { ok: false, code: 'SPELL_UNAVAILABLE', message: `${pickedSpellId} is unavailable.` };
  }

  const draftedSpells = Array.isArray(matchPlayer.draftedSpells) ? matchPlayer.draftedSpells : [];
  if (draftedSpells.includes(pickedSpellId)) {
    return { ok: false, code: 'DUPLICATE_SPELL', message: `You already drafted ${pickedSpellId}.` };
  }

  poolEntry.remainingCopies = Math.max(0, remainingCopies - 1);
  draftedSpells.push(pickedSpellId);
  matchPlayer.draftedSpells = draftedSpells;
  matchPlayer.loadoutSpells = draftedSpells.slice(0, 3);

  if (!match.draft.picksByPlayerNumber[pickingPlayerNumber]) {
    match.draft.picksByPlayerNumber[pickingPlayerNumber] = [];
  }
  match.draft.picksByPlayerNumber[pickingPlayerNumber].push(pickedSpellId);
  match.draft.pickHistory.push({
    turnIndex: Number(match.draft.currentTurnIndex) || 0,
    playerNumber: Number(pickingPlayerNumber) || 0,
    spellId: pickedSpellId,
    reason: String(pickReason || 'manual'),
    timestamp: now
  });

  logLifecycle('draft', 'spell_picked', {
    code: room.code,
    turnIndex: match.draft.currentTurnIndex,
    player: pickingPlayerNumber,
    spell: pickedSpellId,
    remaining: poolEntry.remainingCopies,
    reason: pickReason
  });

  advanceDraftTurn(room, now);
  refreshRoomState(room, 'draft_pick');

  return {
    ok: true,
    spellId: pickedSpellId,
    playerNumber: Number(pickingPlayerNumber) || 0,
    reason: String(pickReason || 'manual'),
    room: serializeRoom(room),
    match: serializeMatch(match)
  };
}

function resolveCastDirection(matchPlayer, payloadDirection) {
  const inputDirection = normalizeInputVector(payloadDirection);
  if (inputDirection.x !== 0 || inputDirection.y !== 0) {
    return inputDirection;
  }
  const aimDirection = normalizeInputVector(matchPlayer?.aim);
  if (aimDirection.x !== 0 || aimDirection.y !== 0) {
    return aimDirection;
  }
  return { x: 0, y: 0 };
}

function getPlayerChargeState(matchPlayer) {
  const chargeState = matchPlayer?.activeEffects?.charge;
  if (!chargeState || typeof chargeState !== 'object') return null;
  if (chargeState.active !== true) return null;
  const direction = normalizeInputVector(chargeState.direction);
  if (direction.x === 0 && direction.y === 0) return null;
  const chargeSpeed = getAbilityNumber(ABILITY_IDS.CHARGE, 'speed', 22, 0.01);
  return {
    active: true,
    direction,
    speed: Math.max(0, Number(chargeState.speed) || chargeSpeed),
    remainingDistance: Math.max(0, Number(chargeState.remainingDistance) || 0),
    startedAt: Number(chargeState.startedAt) || 0
  };
}

function clearPlayerChargeState(matchPlayer) {
  if (!matchPlayer) return;
  matchPlayer.activeEffects = {
    ...(matchPlayer.activeEffects || {}),
    charge: null
  };
}

function startPlayerChargeState(matchPlayer, direction, now) {
  if (!matchPlayer) return;
  const normalizedDirection = normalizeInputVector(direction);
  const chargeSpeed = getAbilityNumber(ABILITY_IDS.CHARGE, 'speed', 22, 0.01);
  const chargeDistance = getAbilityNumber(ABILITY_IDS.CHARGE, 'distance', 4.8, 0.1);
  matchPlayer.activeEffects = {
    ...(matchPlayer.activeEffects || {}),
    charge: {
      active: true,
      direction: normalizedDirection,
      speed: chargeSpeed,
      remainingDistance: chargeDistance,
      startedAt: Number(now) || Date.now()
    }
  };
}

function executeFireblastAbility(room, matchPlayer, payload, now) {
  const castDirection = resolveCastDirection(matchPlayer, payload?.direction || payload);
  if (castDirection.x === 0 && castDirection.y === 0) {
    return { ok: false, code: 'INVALID_AIM', message: 'Aim before casting fireblast.' };
  }

  const projectile = createFireblastProjectile(room.match, matchPlayer, castDirection, now);
  room.match.projectiles.push(projectile);
  console.log(`[match] projectile_spawned code=${room.code} projectileId=${projectile.projectileId} owner=${projectile.ownerPlayerNumber}`);

  return {
    ok: true,
    projectileId: projectile.projectileId
  };
}

function executeBlinkAbility(matchPlayer, payload, now) {
  const castDirection = resolveCastDirection(matchPlayer, payload?.direction || payload);
  if (castDirection.x === 0 && castDirection.y === 0) {
    return { ok: false, code: 'INVALID_AIM', message: 'Aim before casting blink.' };
  }
  const blinkDistance = getAbilityNumber(ABILITY_IDS.BLINK, 'distance', 3.2, 0.1);

  const currentPosition = clonePosition(matchPlayer.position) || { x: 0, y: 0 };
  const rawTargetPosition = {
    x: currentPosition.x + (castDirection.x * blinkDistance),
    y: currentPosition.y + (castDirection.y * blinkDistance)
  };
  const finalTargetPosition = clampPositionInsideArena(rawTargetPosition, PLAYER_RADIUS + 0.02);
  matchPlayer.position = finalTargetPosition;
  matchPlayer.lastUpdated = now;

  return {
    ok: true,
    destination: clonePosition(finalTargetPosition)
  };
}

function executeShieldAbility(room, matchPlayer, now) {
  const shieldDurationMs = getAbilityNumber(ABILITY_IDS.SHIELD, 'durationMs', 1200, 50);
  const shieldUntil = now + shieldDurationMs;
  setPlayerActiveShieldUntil(matchPlayer, shieldUntil);
  console.log(`[match] shield_activated code=${room.code} player=${matchPlayer.matchPlayerNumber} until=${shieldUntil}`);

  return {
    ok: true,
    activeMs: shieldDurationMs,
    shieldUntil
  };
}

function executeGustAbility(room, matchPlayer, payload, now) {
  const castDirection = resolveCastDirection(matchPlayer, payload?.direction || payload);
  if (castDirection.x === 0 && castDirection.y === 0) {
    return { ok: false, code: 'INVALID_AIM', message: 'Aim before casting gust.' };
  }

  const opponent = getOpponentPlayer(room.match, matchPlayer.matchPlayerNumber);
  if (!opponent) {
    return {
      ok: true,
      hit: false,
      reason: 'no_opponent'
    };
  }

  const dx = opponent.position.x - matchPlayer.position.x;
  const dy = opponent.position.y - matchPlayer.position.y;
  const distance = Math.hypot(dx, dy);
  const gustRange = getAbilityNumber(ABILITY_IDS.GUST, 'range', 3.4, 0.1);
  if (distance > gustRange) {
    return {
      ok: true,
      hit: false,
      reason: 'out_of_range',
      range: gustRange
    };
  }

  opponent.velocity = sanitizeVector(opponent.velocity);
  const gustKnockbackImpulse = getAbilityNumber(ABILITY_IDS.GUST, 'knockbackImpulse', 8.8, 0);
  const knockback = {
    x: castDirection.x * gustKnockbackImpulse,
    y: castDirection.y * gustKnockbackImpulse
  };
  opponent.velocity.x += knockback.x;
  opponent.velocity.y += knockback.y;
  opponent.lastHitAt = now;

  const gustEvent = createCombatEvent(room.match, {
    type: 'gust_hit',
    abilityId: ABILITY_IDS.GUST,
    sourcePlayerNumber: matchPlayer.matchPlayerNumber,
    targetPlayerNumber: opponent.matchPlayerNumber,
    timestamp: now,
    knockback,
    metadata: {
      range: Number(distance.toFixed(2))
    }
  });
  pushMatchHitEvent(room.match, gustEvent);

  console.log(`[match] gust_hit code=${room.code} source=${matchPlayer.matchPlayerNumber} target=${opponent.matchPlayerNumber} distance=${distance.toFixed(2)}`);
  console.log(`[match] knockback_applied code=${room.code} target=${opponent.matchPlayerNumber} vx=${opponent.velocity.x.toFixed(2)} vy=${opponent.velocity.y.toFixed(2)}`);

  return {
    ok: true,
    hit: true,
    targetPlayerNumber: opponent.matchPlayerNumber,
    distance
  };
}

function executeChargeAbility(room, matchPlayer, payload, now) {
  if (getPlayerChargeState(matchPlayer)) {
    return { ok: false, code: 'ALREADY_CHARGING', message: 'Charge is already active.' };
  }
  const castDirection = resolveCastDirection(matchPlayer, payload?.direction || payload);
  if (castDirection.x === 0 && castDirection.y === 0) {
    return { ok: false, code: 'INVALID_AIM', message: 'Aim before casting charge.' };
  }

  startPlayerChargeState(matchPlayer, castDirection, now);
  matchPlayer.input = { x: 0, y: 0 };
  matchPlayer.velocity = { x: 0, y: 0 };
  matchPlayer.lastUpdated = now;

  logLifecycle('ability', 'charge_started', {
    code: room.code,
    player: matchPlayer.matchPlayerNumber,
    direction: `${castDirection.x.toFixed(2)},${castDirection.y.toFixed(2)}`,
    distance: getAbilityNumber(ABILITY_IDS.CHARGE, 'distance', 4.8, 0.1)
  });

  const chargeDistance = getAbilityNumber(ABILITY_IDS.CHARGE, 'distance', 4.8, 0.1);
  const chargeSpeed = getAbilityNumber(ABILITY_IDS.CHARGE, 'speed', 22, 0.01);
  return {
    ok: true,
    activeMs: Math.round((chargeDistance / chargeSpeed) * 1000),
    distance: chargeDistance
  };
}

function executeShockAbility(room, matchPlayer, payload, now) {
  const castDirection = resolveCastDirection(matchPlayer, payload?.direction || payload);
  if (castDirection.x === 0 && castDirection.y === 0) {
    return { ok: false, code: 'INVALID_AIM', message: 'Aim before casting shock.' };
  }

  const opponent = getOpponentPlayer(room.match, matchPlayer.matchPlayerNumber);
  if (!opponent) {
    return {
      ok: true,
      hit: false,
      reason: 'no_opponent'
    };
  }

  const dx = opponent.position.x - matchPlayer.position.x;
  const dy = opponent.position.y - matchPlayer.position.y;
  const distance = Math.hypot(dx, dy);
  const shockRange = getAbilityNumber(ABILITY_IDS.SHOCK, 'range', 2.9, 0.1);
  if (distance > shockRange) {
    return {
      ok: true,
      hit: false,
      reason: 'out_of_range',
      range: shockRange
    };
  }

  const directionToOpponent = distance > 0.0001
    ? { x: dx / distance, y: dy / distance }
    : castDirection;
  const facingDot = dotProduct(castDirection, directionToOpponent);
  const shockHalfAngleDeg = getAbilityNumber(ABILITY_IDS.SHOCK, 'halfAngleDeg', 40, 1);
  const shockCosThreshold = Math.cos((shockHalfAngleDeg * Math.PI) / 180);
  if (facingDot < shockCosThreshold) {
    return {
      ok: true,
      hit: false,
      reason: 'outside_cone',
      dot: Number(facingDot.toFixed(3))
    };
  }

  opponent.velocity = sanitizeVector(opponent.velocity);
  const shockKnockbackImpulse = getAbilityNumber(ABILITY_IDS.SHOCK, 'knockbackImpulse', 11.2, 0);
  const knockback = {
    x: directionToOpponent.x * shockKnockbackImpulse,
    y: directionToOpponent.y * shockKnockbackImpulse
  };
  opponent.velocity.x += knockback.x;
  opponent.velocity.y += knockback.y;
  opponent.lastHitAt = now;

  const shockEvent = createCombatEvent(room.match, {
    type: 'shock_hit',
    abilityId: ABILITY_IDS.SHOCK,
    sourcePlayerNumber: matchPlayer.matchPlayerNumber,
    targetPlayerNumber: opponent.matchPlayerNumber,
    timestamp: now,
    knockback,
    metadata: {
      distance: Number(distance.toFixed(2)),
      dot: Number(facingDot.toFixed(3))
    }
  });
  pushMatchHitEvent(room.match, shockEvent);

  logLifecycle('ability', 'shock_hit', {
    code: room.code,
    source: matchPlayer.matchPlayerNumber,
    target: opponent.matchPlayerNumber,
    distance: distance.toFixed(2)
  });
  logLifecycle('match', 'knockback_applied', {
    code: room.code,
    target: opponent.matchPlayerNumber,
    vx: opponent.velocity.x.toFixed(2),
    vy: opponent.velocity.y.toFixed(2)
  });

  return {
    ok: true,
    hit: true,
    targetPlayerNumber: opponent.matchPlayerNumber,
    distance
  };
}

function executeHookAbility(room, matchPlayer, payload, now) {
  const castDirection = resolveCastDirection(matchPlayer, payload?.direction || payload);
  if (castDirection.x === 0 && castDirection.y === 0) {
    return { ok: false, code: 'INVALID_AIM', message: 'Aim before casting hook.' };
  }

  const projectile = createHookProjectile(room.match, matchPlayer, castDirection, now);
  room.match.projectiles.push(projectile);
  logLifecycle('ability', 'hook_spawned', {
    code: room.code,
    projectileId: projectile.projectileId,
    owner: projectile.ownerPlayerNumber
  });

  return {
    ok: true,
    projectileId: projectile.projectileId
  };
}

function findValidWallSpawnPosition(match, matchPlayer, direction, now) {
  const directionVector = normalizeInputVector(direction);
  const casterPosition = clonePosition(matchPlayer.position) || { x: 0, y: 0 };
  const wallSpawnOffset = getAbilityNumber(ABILITY_IDS.WALL, 'spawnOffset', 1.6, 0.1);
  const wallHalfLength = getWallHalfLengthDefault();
  const wallHalfThickness = getWallHalfThicknessDefault();
  const wallDurationMs = getWallDurationMsDefault();
  const offsets = [
    wallSpawnOffset,
    wallSpawnOffset + 0.55,
    wallSpawnOffset + 1.1
  ];

  for (const offset of offsets) {
    const candidate = clampPositionInsideArena({
      x: casterPosition.x + (directionVector.x * offset),
      y: casterPosition.y + (directionVector.y * offset)
    }, wallHalfLength + wallHalfThickness + 0.08);
    const testWall = {
      ownerPlayerNumber: matchPlayer.matchPlayerNumber,
      position: candidate,
      direction: directionVector,
      halfLength: wallHalfLength,
      halfThickness: wallHalfThickness,
      spawnedAt: now,
      expiresAt: now + wallDurationMs
    };

    const overlapsPlayer = (Array.isArray(match?.players) ? match.players : []).some((player) =>
      isPointInsideWall(player.position, testWall, {
        padding: PLAYER_RADIUS * 0.92,
        defaultHalfLength: wallHalfLength,
        defaultHalfThickness: wallHalfThickness
      })
    );
    if (overlapsPlayer) continue;

    const overlapsExistingWall = Boolean(findBlockingWallForPoint(candidate, match.walls, {
      padding: wallHalfThickness * 0.5,
      timestamp: now,
      defaultHalfLength: wallHalfLength,
      defaultHalfThickness: wallHalfThickness
    }));
    if (overlapsExistingWall) continue;
    return candidate;
  }

  return clampPositionInsideArena({
    x: casterPosition.x + (directionVector.x * wallSpawnOffset),
    y: casterPosition.y + (directionVector.y * wallSpawnOffset)
  }, wallHalfLength + wallHalfThickness + 0.08);
}

function executeWallAbility(room, matchPlayer, payload, now) {
  const castDirection = resolveCastDirection(matchPlayer, payload?.direction || payload);
  if (castDirection.x === 0 && castDirection.y === 0) {
    return { ok: false, code: 'INVALID_AIM', message: 'Aim before casting wall.' };
  }

  if (!Array.isArray(room.match.walls)) {
    room.match.walls = [];
  }
  pruneExpiredWalls(room.match, now);

  const wallPosition = findValidWallSpawnPosition(room.match, matchPlayer, castDirection, now);
  const wall = createWallEntity(room.match, matchPlayer.matchPlayerNumber, wallPosition, castDirection, now);
  room.match.walls.push(wall);
  logLifecycle('ability', 'wall_spawned', {
    code: room.code,
    wallId: wall.wallId,
    owner: wall.ownerPlayerNumber,
    expiresAt: wall.expiresAt
  });

  return {
    ok: true,
    wallId: wall.wallId,
    durationMs: getWallDurationMsDefault()
  };
}

function executeRewindAbility(room, matchPlayer, now) {
  const history = ensurePlayerPositionHistory(matchPlayer, now);
  if (!history.length) {
    return { ok: false, code: 'NO_REWIND_HISTORY', message: 'No rewind history available.' };
  }

  const rewindLookbackMs = getAbilityNumber(ABILITY_IDS.REWIND, 'lookbackMs', 1000, 50);
  const targetTimestamp = now - rewindLookbackMs;
  let selectedSnapshot = null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (Number(entry.timestamp) <= targetTimestamp) {
      selectedSnapshot = entry;
      break;
    }
  }
  if (!selectedSnapshot) {
    selectedSnapshot = history[0];
  }
  if (!selectedSnapshot) {
    return { ok: false, code: 'NO_REWIND_TARGET', message: 'Unable to resolve rewind destination.' };
  }

  const currentPosition = clonePosition(matchPlayer.position) || { x: 0, y: 0 };
  const rawDestination = {
    x: Number(selectedSnapshot.x) || currentPosition.x,
    y: Number(selectedSnapshot.y) || currentPosition.y
  };
  const clampedDestination = clampPositionInsideArena(rawDestination, PLAYER_RADIUS + 0.02);
  const safeDestination = resolvePointAgainstWalls(
    clampedDestination,
    currentPosition,
    room.match?.walls,
    {
      padding: PLAYER_RADIUS,
      timestamp: now,
      defaultHalfLength: getWallHalfLengthDefault(),
      defaultHalfThickness: getWallHalfThicknessDefault()
    }
  );

  matchPlayer.position = safeDestination;
  matchPlayer.input = { x: 0, y: 0 };
  matchPlayer.velocity = { x: 0, y: 0 };
  matchPlayer.lastUpdated = now;
  ensurePlayerPositionHistory(matchPlayer, now);

  const rewindEvent = createCombatEvent(room.match, {
    type: 'rewind_used',
    abilityId: ABILITY_IDS.REWIND,
    sourcePlayerNumber: matchPlayer.matchPlayerNumber,
    targetPlayerNumber: matchPlayer.matchPlayerNumber,
    timestamp: now,
    metadata: {
      from: currentPosition,
      to: safeDestination
    }
  });
  pushMatchHitEvent(room.match, rewindEvent);

  logLifecycle('ability', 'rewind_destination', {
    code: room.code,
    player: matchPlayer.matchPlayerNumber,
    x: safeDestination.x.toFixed(2),
    y: safeDestination.y.toFixed(2)
  });

  return {
    ok: true,
    destination: clonePosition(safeDestination),
    rewoundMs: Math.max(0, now - (Number(selectedSnapshot.timestamp) || now))
  };
}

function executeAbilityCast(room, matchPlayer, abilityDef, payload, now) {
  if (!room || !matchPlayer || !abilityDef) {
    return { ok: false, code: 'ABILITY_EXECUTION_FAILED', message: 'Ability execution failed.' };
  }

  if (abilityDef.id === ABILITY_IDS.FIREBLAST) {
    return executeFireblastAbility(room, matchPlayer, payload, now);
  }
  if (abilityDef.id === ABILITY_IDS.BLINK) {
    return executeBlinkAbility(matchPlayer, payload, now);
  }
  if (abilityDef.id === ABILITY_IDS.SHIELD) {
    return executeShieldAbility(room, matchPlayer, now);
  }
  if (abilityDef.id === ABILITY_IDS.GUST) {
    return executeGustAbility(room, matchPlayer, payload, now);
  }
  if (abilityDef.id === ABILITY_IDS.CHARGE) {
    return executeChargeAbility(room, matchPlayer, payload, now);
  }
  if (abilityDef.id === ABILITY_IDS.SHOCK) {
    return executeShockAbility(room, matchPlayer, payload, now);
  }
  if (abilityDef.id === ABILITY_IDS.HOOK) {
    return executeHookAbility(room, matchPlayer, payload, now);
  }
  if (abilityDef.id === ABILITY_IDS.WALL) {
    return executeWallAbility(room, matchPlayer, payload, now);
  }
  if (abilityDef.id === ABILITY_IDS.REWIND) {
    return executeRewindAbility(room, matchPlayer, now);
  }
  return {
    ok: false,
    code: 'ABILITY_NOT_IMPLEMENTED',
    message: `${abilityDef.id} is not implemented yet.`
  };
}

function buildWallCollisionOptions(padding, timestamp) {
  return {
    padding,
    timestamp,
    defaultHalfLength: getWallHalfLengthDefault(),
    defaultHalfThickness: getWallHalfThicknessDefault()
  };
}

function applyChargeMovementRuntime({ room, match, player, previousPosition, deltaSeconds, tickTimestamp }) {
  const chargeState = getPlayerChargeState(player);
  if (!chargeState) {
    return {
      handled: false,
      nextPosition: previousPosition,
      chargeState: null,
      chargeBlockedByWall: false,
      chargeEndedByDistance: false
    };
  }

  player.input = { x: 0, y: 0 };
  player.velocity = { x: 0, y: 0 };
  const stepDistance = Math.max(0, Math.min(chargeState.remainingDistance, chargeState.speed * deltaSeconds));
  const proposedPosition = {
    x: previousPosition.x + (chargeState.direction.x * stepDistance),
    y: previousPosition.y + (chargeState.direction.y * stepDistance)
  };
  const wallResolvedChargePosition = resolvePointAgainstWalls(
    proposedPosition,
    previousPosition,
    match.walls,
    buildWallCollisionOptions(PLAYER_RADIUS, tickTimestamp)
  );
  const resolvedChargePosition = clampPositionInsideArena(
    wallResolvedChargePosition,
    PLAYER_RADIUS + 0.02
  );
  const movedDistance = Math.hypot(
    resolvedChargePosition.x - previousPosition.x,
    resolvedChargePosition.y - previousPosition.y
  );
  const chargeBlockedByWall = stepDistance > 0.02 && movedDistance < (stepDistance * 0.35);
  const remainingDistance = Math.max(0, chargeState.remainingDistance - movedDistance);
  let chargeEndedByDistance = false;
  if (remainingDistance <= 0.001) {
    clearPlayerChargeState(player);
    chargeEndedByDistance = true;
  } else {
    player.activeEffects = {
      ...(player.activeEffects || {}),
      charge: {
        ...chargeState,
        active: true,
        remainingDistance
      }
    };
  }

  if (chargeBlockedByWall) {
    clearPlayerChargeState(player);
    logLifecycle('ability', 'charge_end', {
      code: room.code,
      player: player.matchPlayerNumber,
      reason: 'blocked_by_wall'
    });
  } else if (chargeEndedByDistance) {
    logLifecycle('ability', 'charge_end', {
      code: room.code,
      player: player.matchPlayerNumber,
      reason: 'distance_reached'
    });
  }

  return {
    handled: true,
    nextPosition: resolvedChargePosition,
    chargeState,
    chargeBlockedByWall,
    chargeEndedByDistance
  };
}

function handleChargePostMovementRuntime({ room, match, player, tickTimestamp }) {
  const chargeState = getPlayerChargeState(player);
  if (!chargeState) return false;
  const targetPlayer = getOpponentPlayer(match, player.matchPlayerNumber);
  if (!targetPlayer || targetPlayer.connected === false) return false;

  const dx = targetPlayer.position.x - player.position.x;
  const dy = targetPlayer.position.y - player.position.y;
  const chargeHitRadius = getAbilityNumber(ABILITY_IDS.CHARGE, 'hitRadius', 0.76, 0.05);
  const collisionRadius = PLAYER_RADIUS + chargeHitRadius;
  const didCollide = (dx * dx + dy * dy) <= (collisionRadius * collisionRadius);
  if (!didCollide) return false;

  clearPlayerChargeState(player);
  targetPlayer.velocity = sanitizeVector(targetPlayer.velocity);
  const chargeKnockbackImpulse = getAbilityNumber(ABILITY_IDS.CHARGE, 'knockbackImpulse', 13.2, 0);
  const knockback = {
    x: chargeState.direction.x * chargeKnockbackImpulse,
    y: chargeState.direction.y * chargeKnockbackImpulse
  };
  targetPlayer.velocity.x += knockback.x;
  targetPlayer.velocity.y += knockback.y;
  targetPlayer.lastHitAt = tickTimestamp;

  const settleDistance = (PLAYER_RADIUS * 2) + 0.14;
  const desiredChargerPosition = {
    x: targetPlayer.position.x - (chargeState.direction.x * settleDistance),
    y: targetPlayer.position.y - (chargeState.direction.y * settleDistance)
  };
  const clampedChargerPosition = clampPositionInsideArena(desiredChargerPosition, PLAYER_RADIUS + 0.02);
  player.position = resolvePointAgainstWalls(
    clampedChargerPosition,
    player.position,
    match.walls,
    buildWallCollisionOptions(PLAYER_RADIUS, tickTimestamp)
  );
  player.lastUpdated = tickTimestamp;

  const chargeEvent = createCombatEvent(match, {
    type: 'charge_hit',
    abilityId: ABILITY_IDS.CHARGE,
    sourcePlayerNumber: player.matchPlayerNumber,
    targetPlayerNumber: targetPlayer.matchPlayerNumber,
    timestamp: tickTimestamp,
    knockback
  });
  pushMatchHitEvent(match, chargeEvent);
  logLifecycle('ability', 'charge_collision', {
    code: room.code,
    source: player.matchPlayerNumber,
    target: targetPlayer.matchPlayerNumber
  });
  logLifecycle('ability', 'charge_end', {
    code: room.code,
    player: player.matchPlayerNumber,
    reason: 'enemy_hit'
  });
  logLifecycle('match', 'knockback_applied', {
    code: room.code,
    target: targetPlayer.matchPlayerNumber,
    vx: targetPlayer.velocity.x.toFixed(2),
    vy: targetPlayer.velocity.y.toFixed(2)
  });
  return true;
}

function handleFireblastProjectileBlockedByWall({ room, projectile }) {
  logLifecycle('ability', 'projectile_blocked_by_wall', {
    code: room.code,
    projectileId: projectile.projectileId,
    ability: ABILITY_IDS.FIREBLAST
  });
}

function handleHookProjectileBlockedByWall({ room, projectile, wall }) {
  logLifecycle('ability', 'projectile_blocked_by_wall', {
    code: room.code,
    projectileId: projectile.projectileId,
    ability: ABILITY_IDS.HOOK,
    wallId: wall?.wallId || '-'
  });
  logLifecycle('ability', 'hook_miss', {
    code: room.code,
    projectileId: projectile.projectileId,
    reason: 'blocked_by_wall'
  });
}

function handleFireblastProjectileExpired({ room, projectile }) {
  console.log(`[match] projectile_expired code=${room.code} projectileId=${projectile.projectileId}`);
}

function handleHookProjectileExpired({ room, projectile }) {
  logLifecycle('ability', 'hook_miss', {
    code: room.code,
    projectileId: projectile.projectileId,
    reason: 'expired'
  });
}

function handleFireblastProjectileHit({ room, match, projectile, targetPlayer, tickTimestamp }) {
  if (isShieldActive(targetPlayer, tickTimestamp)) {
    const shieldBlockEvent = createCombatEvent(match, {
      type: 'shield_block',
      abilityId: ABILITY_IDS.SHIELD,
      sourcePlayerNumber: projectile.ownerPlayerNumber,
      targetPlayerNumber: targetPlayer.matchPlayerNumber,
      projectileId: projectile.projectileId,
      timestamp: tickTimestamp
    });
    pushMatchHitEvent(match, shieldBlockEvent);
    console.log(`[match] projectile_blocked code=${room.code} projectileId=${projectile.projectileId} by=${targetPlayer.matchPlayerNumber}`);
    return { resolved: true };
  }

  const targetInvulnerableUntil = Number(targetPlayer.hitInvulnerableUntil) || 0;
  if (tickTimestamp < targetInvulnerableUntil) {
    return { resolved: false };
  }

  targetPlayer.velocity = sanitizeVector(targetPlayer.velocity);
  const fireblastKnockbackImpulse = getAbilityNumber(ABILITY_IDS.FIREBLAST, 'knockbackImpulse', 10.2, 0);
  const fireblastHitInvulnMs = getAbilityNumber(ABILITY_IDS.FIREBLAST, 'hitInvulnMs', 120, 0);
  targetPlayer.velocity.x += projectile.direction.x * fireblastKnockbackImpulse;
  targetPlayer.velocity.y += projectile.direction.y * fireblastKnockbackImpulse;
  targetPlayer.lastHitAt = tickTimestamp;
  targetPlayer.hitInvulnerableUntil = tickTimestamp + fireblastHitInvulnMs;

  const hitEvent = createFireblastHitEvent(match, projectile, targetPlayer, tickTimestamp);
  pushMatchHitEvent(match, hitEvent);
  console.log(`[match] projectile_hit code=${room.code} projectileId=${projectile.projectileId} source=${projectile.ownerPlayerNumber} target=${targetPlayer.matchPlayerNumber}`);
  console.log(`[match] projectile_removed_on_hit code=${room.code} projectileId=${projectile.projectileId}`);
  console.log(`[match] knockback_applied code=${room.code} target=${targetPlayer.matchPlayerNumber} vx=${targetPlayer.velocity.x.toFixed(2)} vy=${targetPlayer.velocity.y.toFixed(2)}`);
  return { resolved: true };
}

function handleHookProjectileHit({ room, match, projectile, targetPlayer, tickTimestamp }) {
  const sourcePlayer = getMatchPlayerByNumber(match, projectile.ownerPlayerNumber);
  if (!sourcePlayer) {
    return { resolved: true };
  }

  const beforePullPosition = clonePosition(targetPlayer.position) || { x: 0, y: 0 };
  const toTargetX = targetPlayer.position.x - sourcePlayer.position.x;
  const toTargetY = targetPlayer.position.y - sourcePlayer.position.y;
  const distanceToSource = Math.hypot(toTargetX, toTargetY);
  const hookPullTargetDistance = getAbilityNumber(ABILITY_IDS.HOOK, 'pullTargetDistance', 1.55, 0.1);
  let pulledTargetPosition = beforePullPosition;
  if (distanceToSource > hookPullTargetDistance + 0.01) {
    const pullDir = distanceToSource > 0
      ? { x: toTargetX / distanceToSource, y: toTargetY / distanceToSource }
      : { x: 1, y: 0 };
    pulledTargetPosition = {
      x: sourcePlayer.position.x + (pullDir.x * hookPullTargetDistance),
      y: sourcePlayer.position.y + (pullDir.y * hookPullTargetDistance)
    };
  }

  pulledTargetPosition = clampPositionInsideArena(pulledTargetPosition, PLAYER_RADIUS + 0.02);
  pulledTargetPosition = resolvePointAgainstWalls(
    pulledTargetPosition,
    beforePullPosition,
    match.walls,
    buildWallCollisionOptions(PLAYER_RADIUS, tickTimestamp)
  );

  targetPlayer.position = pulledTargetPosition;
  targetPlayer.velocity = { x: 0, y: 0 };
  targetPlayer.input = { x: 0, y: 0 };
  targetPlayer.lastUpdated = tickTimestamp;
  ensurePlayerPositionHistory(targetPlayer, tickTimestamp);

  const pullKnockback = {
    x: pulledTargetPosition.x - beforePullPosition.x,
    y: pulledTargetPosition.y - beforePullPosition.y
  };
  const hookHitEvent = createCombatEvent(match, {
    type: 'hook_pull',
    abilityId: ABILITY_IDS.HOOK,
    sourcePlayerNumber: sourcePlayer.matchPlayerNumber,
    targetPlayerNumber: targetPlayer.matchPlayerNumber,
    projectileId: projectile.projectileId,
    timestamp: tickTimestamp,
    knockback: pullKnockback,
    metadata: {
      from: beforePullPosition,
      to: pulledTargetPosition
    }
  });
  pushMatchHitEvent(match, hookHitEvent);
  logLifecycle('ability', 'hook_hit', {
    code: room.code,
    projectileId: projectile.projectileId,
    source: sourcePlayer.matchPlayerNumber,
    target: targetPlayer.matchPlayerNumber
  });
  return { resolved: true };
}

function handleWallRuntimeTick({ match, tickTimestamp }) {
  pruneExpiredWalls(match, tickTimestamp);
}

const abilityRuntimeHandlers = Object.freeze({
  [ABILITY_IDS.CHARGE]: Object.freeze({
    applyMovement: applyChargeMovementRuntime,
    onPostMovement: handleChargePostMovementRuntime
  }),
  [ABILITY_IDS.WALL]: Object.freeze({
    onMatchTick: handleWallRuntimeTick
  }),
  [ABILITY_IDS.FIREBLAST]: Object.freeze({
    onProjectileBlockedByWall: handleFireblastProjectileBlockedByWall,
    onProjectileExpired: handleFireblastProjectileExpired,
    onProjectileHit: handleFireblastProjectileHit
  }),
  [ABILITY_IDS.HOOK]: Object.freeze({
    onProjectileBlockedByWall: handleHookProjectileBlockedByWall,
    onProjectileExpired: handleHookProjectileExpired,
    onProjectileHit: handleHookProjectileHit
  })
});

function runMatchAbilityRuntimeTick(room, match, tickTimestamp) {
  Object.values(abilityRuntimeHandlers).forEach((handler) => {
    if (typeof handler?.onMatchTick === 'function') {
      handler.onMatchTick({ room, match, tickTimestamp });
    }
  });
}

function runPostMovementAbilityHandlers(room, match, tickTimestamp) {
  (Array.isArray(match.players) ? match.players : []).forEach((player) => {
    Object.values(abilityRuntimeHandlers).forEach((handler) => {
      if (typeof handler?.onPostMovement !== 'function') return;
      handler.onPostMovement({ room, match, player, tickTimestamp });
    });
  });
}

function processMatchTickForRoom(room, tickTimestamp) {
  if (!room.match) return;

  const match = room.match;
  pruneResolvedProjectiles(match, tickTimestamp, 12000);
  runMatchAbilityRuntimeTick(room, match, tickTimestamp);
  const previousTickAt = Number(match.lastTickAt) || tickTimestamp;
  const deltaMs = clamp(tickTimestamp - previousTickAt, 0, MATCH_MAX_DELTA_MS);
  const deltaSeconds = deltaMs / 1000;
  match.lastTickAt = tickTimestamp;
  let movedPlayers = 0;
  let eliminatedThisTick = false;

  if (match.phase === MATCH_PHASE_DRAFT) {
    let didDraftUpdate = false;
    const currentTurnPlayerNumber = getDraftCurrentTurnPlayerNumber(match);
    const turnEndsAt = Number(match.draft?.turnEndsAt) || 0;
    if (currentTurnPlayerNumber && tickTimestamp >= turnEndsAt) {
      const currentTurnPlayer = getMatchPlayerByNumber(match, currentTurnPlayerNumber);
      const validSpells = getValidDraftSpellsForMatchPlayer(match, currentTurnPlayer);
      if (validSpells.length > 0) {
        const autoSpellId = validSpells[0];
        logLifecycle('draft', 'timeout_auto_pick', {
          code: room.code,
          turnIndex: match.draft.currentTurnIndex,
          player: currentTurnPlayerNumber,
          spell: autoSpellId
        });
        const autoPickResult = applyDraftPick(room, currentTurnPlayerNumber, autoSpellId, 'timeout_auto_pick');
        if (!autoPickResult.ok) {
          logLifecycle('draft', 'timeout_auto_pick_failed', {
            code: room.code,
            player: currentTurnPlayerNumber,
            reason: autoPickResult.code || 'UNKNOWN'
          });
        }
        didDraftUpdate = true;
      } else {
        logLifecycle('draft', 'timeout_no_valid_spell', {
          code: room.code,
          turnIndex: match.draft.currentTurnIndex,
          player: currentTurnPlayerNumber
        });
        advanceDraftTurn(room, tickTimestamp);
        didDraftUpdate = true;
      }
      if (didDraftUpdate) {
        emitRoomUpdate(room);
      }
    }

    const shouldBroadcastDraftState = didDraftUpdate
      || (tickTimestamp - (Number(match.lastBroadcastAt) || 0)) >= 250;
    if (shouldBroadcastDraftState) {
      emitMatchStateThrottled(room, tickTimestamp, didDraftUpdate);
    }
    return;
  }

  if (match.phase === MATCH_PHASE_COMBAT_COUNTDOWN) {
    if (match.isPaused === true) {
      emitMatchStateThrottled(room, tickTimestamp, false);
      return;
    }

    const combatStartsAt = Number(match.combatStartsAt) || 0;
    let didTransitionToCombat = false;
    if (combatStartsAt > 0 && tickTimestamp >= combatStartsAt) {
      const didTransition = transitionMatchPhase(room, MATCH_PHASE_COMBAT, 'countdown_finished', tickTimestamp);
      if (didTransition) {
        didTransitionToCombat = true;
        setRoomState(room, ROOM_STATES.COMBAT, 'countdown_finished');
        logLifecycle('match', 'combat_started', {
          code: room.code,
          matchId: match.matchId,
          at: tickTimestamp
        });
        emitRoomUpdate(room);
      }
    }

    emitMatchStateThrottled(room, tickTimestamp, didTransitionToCombat);
    return;
  }

  if (match.phase !== MATCH_PHASE_COMBAT) {
    emitMatchStateThrottled(room, tickTimestamp, false);
    return;
  }

  if (match.isPaused === true) {
    emitMatchStateThrottled(room, tickTimestamp, false);
    return;
  }

  executePendingAbilityCasts(room, tickTimestamp);

  if (deltaSeconds > 0) {
    match.players.forEach((player) => {
      if (player.connected === false) {
        player.input = { x: 0, y: 0 };
        ensurePlayerPositionHistory(player, tickTimestamp);
        return;
      }
      const previousPosition = clonePosition(player.position) || { x: 0, y: 0 };
      const input = normalizeInputVector(player.input);
      player.input = input;

      const velocity = sanitizeVector(player.velocity);
      player.velocity = velocity;
      let nextPosition = clonePosition(previousPosition) || { x: 0, y: 0 };
      const chargeHandler = abilityRuntimeHandlers[ABILITY_IDS.CHARGE];
      const chargeRuntime = typeof chargeHandler?.applyMovement === 'function'
        ? chargeHandler.applyMovement({
          room,
          match,
          player,
          previousPosition,
          deltaSeconds,
          tickTimestamp
        })
        : {
          handled: false,
          nextPosition: previousPosition,
          chargeState: null
        };
      const chargeState = chargeRuntime?.chargeState || null;

      if (chargeRuntime?.handled) {
        nextPosition = clonePosition(chargeRuntime.nextPosition) || nextPosition;
      } else {
        if (input.x !== 0 || input.y !== 0) {
          nextPosition.x += input.x * PLAYER_MOVE_SPEED * deltaSeconds;
          nextPosition.y += input.y * PLAYER_MOVE_SPEED * deltaSeconds;
        }

        if (velocity.x !== 0 || velocity.y !== 0) {
          nextPosition.x += velocity.x * deltaSeconds;
          nextPosition.y += velocity.y * deltaSeconds;

          const damping = Math.exp(-PLAYER_KNOCKBACK_DAMPING_PER_SECOND * deltaSeconds);
          player.velocity.x *= damping;
          player.velocity.y *= damping;

          if (Math.abs(player.velocity.x) < 0.01) player.velocity.x = 0;
          if (Math.abs(player.velocity.y) < 0.01) player.velocity.y = 0;
        }

        const blockingWall = findBlockingWallForMovement(
          previousPosition,
          nextPosition,
          match.walls,
          {
            padding: PLAYER_RADIUS,
            timestamp: tickTimestamp,
            defaultHalfLength: getWallHalfLengthDefault(),
            defaultHalfThickness: getWallHalfThicknessDefault()
          }
        );
        if (blockingWall) {
          nextPosition = previousPosition;
          player.velocity = { x: 0, y: 0 };
        }
      }

      player.position = nextPosition;

      ensurePlayerPositionHistory(player, tickTimestamp);

      if (
        input.x !== 0
        || input.y !== 0
        || velocity.x !== 0
        || velocity.y !== 0
        || chargeState
        || !positionsEqual(previousPosition, nextPosition)
      ) {
        player.lastUpdated = tickTimestamp;
        movedPlayers += 1;
      }
    });

    runPostMovementAbilityHandlers(room, match, tickTimestamp);

    const eliminatedPlayer = (Array.isArray(match.players) ? match.players : []).find((player) =>
      isOutsideArenaBoundary(player.position)
    );
    if (eliminatedPlayer) {
      const winnerPlayer = getOpponentPlayer(match, eliminatedPlayer.matchPlayerNumber);
      console.log(`[match] player_eliminated_out_of_bounds code=${room.code} player=${eliminatedPlayer.matchPlayerNumber} x=${eliminatedPlayer.position.x.toFixed(2)} y=${eliminatedPlayer.position.y.toFixed(2)} radius=${ARENA_BOUNDARY_RADIUS}`);
      eliminatedThisTick = transitionMatchToEnd(room, eliminatedPlayer, winnerPlayer, 'out_of_bounds', tickTimestamp);
    }

    if (!eliminatedThisTick && match.phase === MATCH_PHASE_COMBAT) {
      const activeProjectiles = [];
      (Array.isArray(match.projectiles) ? match.projectiles : []).forEach((projectile) => {
        if (isProjectileResolved(match, projectile.projectileId)) {
          return;
        }
        const projectileAbilityId = normalizeSpellId(projectile.abilityId || ABILITY_IDS.FIREBLAST) || ABILITY_IDS.FIREBLAST;
        const projectileHandler = abilityRuntimeHandlers[projectileAbilityId] || abilityRuntimeHandlers[ABILITY_IDS.FIREBLAST];
        const previousPosition = clonePosition(projectile.position) || { x: 0, y: 0 };
        const projectileHitRadius = Math.max(
          0.08,
          Number(projectile.hitRadius)
            || getAbilityNumber(projectileAbilityId, 'hitRadius', projectileAbilityId === ABILITY_IDS.HOOK ? getHookHitRadiusDefault() : getFireblastHitRadiusDefault(), 0.05)
        );

        projectile.position.x += projectile.direction.x * projectile.speed * deltaSeconds;
        projectile.position.y += projectile.direction.y * projectile.speed * deltaSeconds;

        const blockingWall = findBlockingWallForMovement(
          previousPosition,
          projectile.position,
          match.walls,
          {
            padding: projectileHitRadius * 0.85,
            timestamp: tickTimestamp,
            defaultHalfLength: getWallHalfLengthDefault(),
            defaultHalfThickness: getWallHalfThicknessDefault()
          }
        );
        if (blockingWall) {
          if (typeof projectileHandler?.onProjectileBlockedByWall === 'function') {
            projectileHandler.onProjectileBlockedByWall({
              room,
              match,
              projectile,
              wall: blockingWall,
              tickTimestamp
            });
          }
          markProjectileResolved(match, projectile.projectileId, tickTimestamp);
          return;
        }

        if (tickTimestamp >= projectile.expiresAt) {
          if (typeof projectileHandler?.onProjectileExpired === 'function') {
            projectileHandler.onProjectileExpired({
              room,
              match,
              projectile,
              tickTimestamp
            });
          }
          markProjectileResolved(match, projectile.projectileId, tickTimestamp);
          return;
        }

        const targetPlayer = getOpponentPlayer(match, projectile.ownerPlayerNumber);
        if (targetPlayer) {
          const dx = targetPlayer.position.x - projectile.position.x;
          const dy = targetPlayer.position.y - projectile.position.y;
          const collisionRadius = PLAYER_RADIUS + projectileHitRadius;
          const didCollide = (dx * dx + dy * dy) <= (collisionRadius * collisionRadius);
          if (didCollide) {
            if (typeof projectileHandler?.onProjectileHit === 'function') {
              const hitResult = projectileHandler.onProjectileHit({
                room,
                match,
                projectile,
                targetPlayer,
                tickTimestamp
              });
              if (hitResult?.resolved === true) {
                markProjectileResolved(match, projectile.projectileId, tickTimestamp);
                return;
              }
            }
          }
        }

        activeProjectiles.push(projectile);
      });
      match.projectiles = activeProjectiles;
    }
  }

  if (movedPlayers > 0 && tickTimestamp - (match.lastMoveLogAt || 0) >= 500) {
    const compactPlayers = match.players
      .map((player) => `p${player.matchPlayerNumber}=(${player.position.x.toFixed(2)},${player.position.y.toFixed(2)})`)
      .join(' ');
    console.log(`[match] tick code=${room.code} ${compactPlayers} projectiles=${match.projectiles.length}`);
    match.lastMoveLogAt = tickTimestamp;
  }

  emitMatchStateThrottled(room, tickTimestamp, eliminatedThisTick);
}

function runMatchSimulationTick() {
  const now = Date.now();
  rooms.forEach((room) => {
    processMatchTickForRoom(room, now);
  });
}

function emitRoomError(socket, message, code = 'ROOM_ERROR') {
  socket.emit('room_error', { code, message });
}

function resolveAbilityCastPayloadAndAck(payloadOrAck, maybeAck) {
  return {
    payload: typeof payloadOrAck === 'function' ? undefined : payloadOrAck,
    ack: typeof payloadOrAck === 'function' ? payloadOrAck : maybeAck
  };
}

function ensurePendingAbilityCasts(match) {
  if (!match || typeof match !== 'object') return [];
  if (!Array.isArray(match.pendingAbilityCasts)) {
    match.pendingAbilityCasts = [];
  }
  return match.pendingAbilityCasts;
}

function executePendingAbilityCasts(room, tickTimestamp = Date.now()) {
  if (!room?.match) return;
  if (room.match.phase !== MATCH_PHASE_COMBAT) return;
  if (room.match.isPaused === true) return;

  const pendingQueue = ensurePendingAbilityCasts(room.match);
  if (!pendingQueue.length) return;

  const now = Number(tickTimestamp) || Date.now();
  const remaining = [];
  pendingQueue.forEach((pendingCast) => {
    if (!pendingCast || typeof pendingCast !== 'object') return;
    const executeAt = Number(pendingCast.executeAt) || 0;
    if (executeAt > now) {
      remaining.push(pendingCast);
      return;
    }

    const abilityDef = getAbilityDef(pendingCast.abilityId);
    if (!abilityDef) return;
    const matchPlayer = getMatchPlayerByPlayerId(room.match, pendingCast.playerId);
    if (!matchPlayer || matchPlayer.connected === false) {
      logLifecycle('ability', 'cast_dropped_pending', {
        code: room.code,
        ability: abilityDef.id,
        reason: 'player_missing_or_disconnected',
        requestId: pendingCast.requestId || '-'
      });
      return;
    }

    const executionResult = executeAbilityCast(
      room,
      matchPlayer,
      abilityDef,
      pendingCast.payload,
      now
    );
    if (!executionResult?.ok) {
      logLifecycle('ability', 'cast_pending_failed', {
        code: room.code,
        player: matchPlayer.matchPlayerNumber,
        ability: abilityDef.id,
        reason: executionResult?.code || 'ABILITY_CAST_FAILED'
      });
      return;
    }

    trackAbilityMetric(room.match, abilityDef.id, 'castExecuted', 1);
    logLifecycle('ability', 'cast_executed', {
      code: room.code,
      player: matchPlayer.matchPlayerNumber,
      ability: abilityDef.id,
      castDelayMs: Math.max(0, now - (Number(pendingCast.requestedAt) || now)),
      requestId: pendingCast.requestId || '-'
    });
  });
  room.match.pendingAbilityCasts = remaining;
}

function handleAbilityCastRequest(socket, abilityId, payloadOrAck, maybeAck) {
  const { payload, ack } = resolveAbilityCastPayloadAndAck(payloadOrAck, maybeAck);
  const respond = typeof ack === 'function'
    ? (responsePayload) => ack(responsePayload)
    : () => {};

  function fail(message, code, extra = {}) {
    const responsePayload = { ok: false, code, message, abilityId: normalizedAbilityId, ...extra };
    emitRoomError(socket, message, code);
    respond(responsePayload);
    return responsePayload;
  }

  const normalizedAbilityId = normalizeSpellId(abilityId);
  const abilityDef = getAbilityDef(normalizedAbilityId);
  if (!abilityDef) {
    fail('Unknown ability.', 'UNKNOWN_ABILITY');
    return;
  }

  const roomCode = playerRoomBySocketId.get(socket.id);
  if (!roomCode) {
    fail(`Join a room before casting ${abilityDef.id}.`, 'NOT_IN_ROOM');
    return;
  }

  const room = rooms.get(roomCode);
  if (!room || !room.match) {
    fail('You can cast only during an active match.', 'MATCH_NOT_ACTIVE');
    return;
  }

  const matchPlayer = getMatchPlayerBySocketId(room.match, socket.id);
  if (!matchPlayer) {
    fail('Match player not found.', 'MATCH_PLAYER_NOT_FOUND');
    return;
  }

  const now = Date.now();
  const requestId = normalizeRequestId(payload?.requestId || payload?.castId || payload?.actionId);
  const recentAbilityRequests = ensureActionCache(matchPlayer, 'recentAbilityRequests');
  pruneRequestCache(recentAbilityRequests, now, ABILITY_REQUEST_CACHE_TTL_MS);
  if (requestId && recentAbilityRequests[requestId]) {
    const cachedResponse = recentAbilityRequests[requestId]?.response;
    logLifecycle('ability', 'duplicate_request_ignored', {
      code: roomCode,
      player: matchPlayer.matchPlayerNumber,
      ability: abilityDef.id,
      requestId
    });
    if (cachedResponse && typeof cachedResponse === 'object') {
      respond(cachedResponse);
      return;
    }
    respond({ ok: true, abilityId: abilityDef.id, duplicated: true, requestId });
    return;
  }

  const phase = String(room.match.phase || '');
  if (phase !== MATCH_PHASE_COMBAT) {
    trackAbilityMetric(room.match, abilityDef.id, 'castRejected', 1);
    const rejected = fail(`${abilityDef.id} can only be cast during combat.`, 'MATCH_NOT_IN_COMBAT', {
      phase
    });
    if (requestId) {
      recentAbilityRequests[requestId] = {
        timestamp: now,
        response: rejected
      };
    }
    logLifecycle('ability', 'cast_rejected_phase', {
      code: roomCode,
      player: matchPlayer.matchPlayerNumber,
      ability: abilityDef.id,
      phase
    });
    return;
  }
  if (room.match.isPaused === true) {
    trackAbilityMetric(room.match, abilityDef.id, 'castRejected', 1);
    const rejected = fail('Match is paused while waiting for reconnect.', 'MATCH_PAUSED');
    if (requestId) {
      recentAbilityRequests[requestId] = {
        timestamp: now,
        response: rejected
      };
    }
    logLifecycle('ability', 'cast_rejected_paused', {
      code: roomCode,
      player: matchPlayer.matchPlayerNumber,
      ability: abilityDef.id
    });
    return;
  }
  if (matchPlayer.connected === false) {
    trackAbilityMetric(room.match, abilityDef.id, 'castRejected', 1);
    const rejected = fail('Disconnected players cannot cast.', 'PLAYER_DISCONNECTED');
    if (requestId) {
      recentAbilityRequests[requestId] = {
        timestamp: now,
        response: rejected
      };
    }
    return;
  }
  if (abilityDef.requiresDrafted && !hasSpellInLoadout(matchPlayer, abilityDef.id)) {
    trackAbilityMetric(room.match, abilityDef.id, 'castRejected', 1);
    const rejected = fail(`${abilityDef.id} is not in your drafted loadout.`, 'ABILITY_NOT_DRAFTED');
    if (requestId) {
      recentAbilityRequests[requestId] = {
        timestamp: now,
        response: rejected
      };
    }
    logLifecycle('ability', 'cast_rejected_not_in_loadout', {
      code: roomCode,
      player: matchPlayer.matchPlayerNumber,
      ability: abilityDef.id
    });
    return;
  }

  const actionRateLimits = ensureActionCache(matchPlayer, 'actionRateLimits');
  const lastRequestAt = Number(actionRateLimits[abilityDef.id]) || 0;
  if ((now - lastRequestAt) < ABILITY_REQUEST_MIN_INTERVAL_MS) {
    trackAbilityMetric(room.match, abilityDef.id, 'castRejected', 1);
    const rejected = fail('Ability cast rate limit hit.', 'ABILITY_RATE_LIMIT', {
      retryInMs: Math.max(0, ABILITY_REQUEST_MIN_INTERVAL_MS - (now - lastRequestAt))
    });
    if (requestId) {
      recentAbilityRequests[requestId] = {
        timestamp: now,
        response: rejected
      };
    }
    logLifecycle('ability', 'cast_rejected_rate_limit', {
      code: roomCode,
      player: matchPlayer.matchPlayerNumber,
      ability: abilityDef.id
    });
    return;
  }
  actionRateLimits[abilityDef.id] = now;

  const remainingMs = getAbilityRemainingMs(matchPlayer, abilityDef.id, now);
  const cooldownMs = getAbilityCooldownMs(abilityDef.id);
  const castDelayMs = getAbilityCastDelayMs(abilityDef.id);
  let executionPayload = payload && typeof payload === 'object' ? { ...payload } : payload;
  const abilityNeedsDirection = abilityDef.id !== ABILITY_IDS.SHIELD && abilityDef.id !== ABILITY_IDS.REWIND;
  if (abilityNeedsDirection) {
    const payloadDirection = payload && typeof payload === 'object'
      ? payload.direction
      : payload;
    const lockedDirection = resolveCastDirection(matchPlayer, payloadDirection);
    if (lockedDirection.x === 0 && lockedDirection.y === 0) {
      trackAbilityMetric(room.match, abilityDef.id, 'castRejected', 1);
      const rejected = fail(`Aim before casting ${abilityDef.id}.`, 'INVALID_AIM');
      if (requestId) {
        recentAbilityRequests[requestId] = {
          timestamp: now,
          response: rejected
        };
      }
      logLifecycle('ability', 'cast_rejected_invalid_aim', {
        code: roomCode,
        player: matchPlayer.matchPlayerNumber,
        ability: abilityDef.id
      });
      return;
    }
    if (executionPayload && typeof executionPayload === 'object') {
      executionPayload.direction = lockedDirection;
    } else {
      executionPayload = { direction: lockedDirection };
    }
  }
  trackAbilityMetric(room.match, abilityDef.id, 'castRequested', 1);
  logLifecycle('ability', 'cast_requested', {
    code: roomCode,
    socket: socket.id,
    player: matchPlayer.matchPlayerNumber,
    ability: abilityDef.id,
    cooldownMs,
    castDelayMs,
    requestId: requestId || '-'
  });

  if (remainingMs > 0) {
    trackAbilityMetric(room.match, abilityDef.id, 'castRejected', 1);
    trackAbilityMetric(room.match, abilityDef.id, 'cooldownRejected', 1);
    const rejected = fail(`${abilityDef.id} is on cooldown.`, 'ABILITY_COOLDOWN', { remainingMs });
    if (requestId) {
      recentAbilityRequests[requestId] = {
        timestamp: now,
        response: rejected
      };
    }
    logLifecycle('ability', 'cast_rejected_cooldown', {
      code: roomCode,
      player: matchPlayer.matchPlayerNumber,
      ability: abilityDef.id,
      remainingMs
    });
    return;
  }

  const nextReadyAt = now + cooldownMs;
  setAbilityReadyAt(matchPlayer, abilityDef.id, nextReadyAt);
  matchPlayer.lastUpdated = now;
  trackAbilityMetric(room.match, abilityDef.id, 'castAccepted', 1);

  let executionResult = null;
  let queued = false;
  let executeAt = now;
  if (castDelayMs > 0) {
    executeAt = now + castDelayMs;
    const pendingQueue = ensurePendingAbilityCasts(room.match);
    pendingQueue.push({
      abilityId: abilityDef.id,
      playerId: matchPlayer.playerId,
      matchPlayerNumber: matchPlayer.matchPlayerNumber,
      payload: executionPayload && typeof executionPayload === 'object' ? executionPayload : {},
      requestedAt: now,
      executeAt,
      requestId: requestId || ''
    });
    queued = true;
  } else {
    executionResult = executeAbilityCast(room, matchPlayer, abilityDef, executionPayload, now);
    if (!executionResult?.ok) {
      setAbilityReadyAt(matchPlayer, abilityDef.id, now);
      trackAbilityMetric(room.match, abilityDef.id, 'castRejected', 1);
      const code = executionResult?.code || 'ABILITY_CAST_FAILED';
      const message = executionResult?.message || `Failed to cast ${abilityDef.id}.`;
      const rejected = fail(message, code, executionResult || {});
      if (requestId) {
        recentAbilityRequests[requestId] = {
          timestamp: now,
          response: rejected
        };
      }
      logLifecycle('ability', 'cast_rejected_execution', {
        code: roomCode,
        player: matchPlayer.matchPlayerNumber,
        ability: abilityDef.id,
        reason: code
      });
      return;
    }
    trackAbilityMetric(room.match, abilityDef.id, 'castExecuted', 1);
    logLifecycle('ability', 'cast_executed', {
      code: roomCode,
      player: matchPlayer.matchPlayerNumber,
      ability: abilityDef.id,
      castDelayMs: 0,
      requestId: requestId || '-'
    });
  }

  emitMatchState(room, now);
  const successResponse = {
    ok: true,
    abilityId: abilityDef.id,
    requestId: requestId || '',
    cooldownMs,
    castDelayMs,
    queued,
    executeAt,
    nextReadyAt,
    ...(executionResult || {})
  };
  if (requestId) {
    recentAbilityRequests[requestId] = {
      timestamp: now,
      response: successResponse
    };
  }
  logLifecycle('ability', 'cast_accepted', {
    code: roomCode,
    player: matchPlayer.matchPlayerNumber,
    ability: abilityDef.id,
    queued: queued ? 'yes' : 'no',
    requestId: requestId || '-'
  });
  respond(successResponse);
}

function cleanupRoomMatchState(room, reason = 'cleanup', timestamp = Date.now()) {
  if (!room?.match) return false;
  const match = room.match;
  const now = Number(timestamp) || Date.now();

  if (Array.isArray(match.players)) {
    match.players.forEach((player) => {
      resetTransientMatchPlayerState(player, now);
      player.eliminated = false;
      player.lastHitAt = 0;
      player.hitInvulnerableUntil = 0;
      setAbilityReadyAt(player, ABILITY_IDS.FIREBLAST, 0);
      setAbilityReadyAt(player, ABILITY_IDS.BLINK, 0);
      setAbilityReadyAt(player, ABILITY_IDS.SHIELD, 0);
      setAbilityReadyAt(player, ABILITY_IDS.GUST, 0);
      setAbilityReadyAt(player, ABILITY_IDS.CHARGE, 0);
      setAbilityReadyAt(player, ABILITY_IDS.SHOCK, 0);
      setAbilityReadyAt(player, ABILITY_IDS.HOOK, 0);
      setAbilityReadyAt(player, ABILITY_IDS.WALL, 0);
      setAbilityReadyAt(player, ABILITY_IDS.REWIND, 0);
      player.positionHistory = [];
      player.actionRateLimits = {};
      player.recentAbilityRequests = {};
      player.recentDraftRequests = {};
    });
  }

  match.projectiles = [];
  match.walls = [];
  match.pendingAbilityCasts = [];
  match.hitEvents = [];
  if (match.analytics && typeof match.analytics === 'object') {
    match.analytics.playerLastImpactByNumber = {};
    match.analytics.lastUpdatedAt = now;
  }
  match.cleanupAt = now;
  room.match = null;

  logLifecycle('cleanup', 'match_state_cleared', {
    code: room.code,
    reason,
    at: now
  });
  return true;
}

function resetRoomAfterMatch(room, requestedBySocketId, reason = 'return_to_room') {
  if (!room || !room.match) return false;
  if (room.match.phase !== MATCH_PHASE_MATCH_END) return false;

  logLifecycle('room', 'player_returned_to_room', {
    code: room.code,
    socket: requestedBySocketId,
    reason
  });
  cleanupRoomMatchState(room, reason, Date.now());
  clearReconnectTimersForRoom(room.code);

  normalizePlayerSlots(room);
  room.players.forEach((player) => {
    clearDisconnectedStateForPlayer(player);
    clearReconnectGraceTimer(room.code, player.playerId);
  });
  resetReadyAndMatchRole(room);
  refreshRoomState(room, 'rematch_reset');
  logLifecycle('room', 'rematch_ready', {
    code: room.code,
    state: room.state,
    players: room.players.length
  });
  return true;
}

function leaveRoomForSocket(socket, reason = 'leave_room', notifySelf = true) {
  removeSocketFromQuickMatchQueue(socket?.id, `leave_room:${reason}`, false);
  const roomCode = playerRoomBySocketId.get(socket.id);
  if (!roomCode) return null;

  const room = rooms.get(roomCode);
  const roomPlayer = room ? getPlayerBySocketId(room, socket.id) : null;
  playerRoomBySocketId.delete(socket.id);
  socket.leave(roomCode);

  if (!room) {
    if (notifySelf) {
      socket.emit('room_left', { roomCode, reason });
    }
    return { roomCode, room: null };
  }

  if (reason === 'disconnect' && roomPlayer) {
    beginDisconnectGraceForPlayer(room, roomPlayer, reason);
    return { roomCode, room, deferred: true };
  }

  if (roomPlayer) {
    removePlayerFromRoomList(room, roomPlayer.playerId);
    logLifecycle('room', 'leave', {
      code: roomCode,
      socket: socket.id,
      playerId: roomPlayer.playerId,
      reason
    });
  } else {
    room.players = room.players.filter((player) => player.socketId !== socket.id);
    logLifecycle('room', 'leave', {
      code: roomCode,
      socket: socket.id,
      reason
    });
  }

  if (!deleteRoomIfEmpty(room)) {
    if (room.match) {
      cleanupRoomMatchState(room, 'player_left', Date.now());
    }
    normalizePlayerSlots(room);
    resetReadyAndMatchRole(room);
    logLifecycle('room', 'ready_reset', {
      code: roomCode,
      reason: 'player_left'
    });
    refreshRoomState(room, 'player_left');
    emitRoomUpdate(room);
  }

  if (notifySelf) {
    socket.emit('room_left', { roomCode, reason });
  }

  return { roomCode, room };
}

app.get('/', (_req, res) => {
  res.type('text/plain').send('Outra multiplayer server is running.');
});

io.on('connection', (socket) => {
  const remoteAddress = socket.handshake.address || 'unknown';
  logLifecycle('socket', 'connected', {
    id: socket.id,
    ip: remoteAddress
  });

  socket.on('queue_quick_match', (ack) => {
    const respond = typeof ack === 'function'
      ? (payload) => ack(payload)
      : () => {};

    logLifecycle('queue', 'request', {
      socket: socket.id,
      queueDepth: quickMatchQueue.length
    });

    pruneQuickMatchQueue();
    const existingRoomCode = playerRoomBySocketId.get(socket.id);
    if (existingRoomCode) {
      const existingRoom = rooms.get(existingRoomCode);
      if (existingRoom?.match && existingRoom.match.phase !== MATCH_PHASE_MATCH_END) {
        logLifecycle('queue', 'force_switch_from_active_match', {
          socket: socket.id,
          code: existingRoomCode,
          phase: existingRoom.match.phase
        });
      }
      leaveRoomForSocket(socket, 'switch_to_quick_match', false);
    }

    const existingQueueIndex = getQuickMatchQueueIndexBySocketId(socket.id);
    if (existingQueueIndex >= 0) {
      const existingEntry = quickMatchQueue[existingQueueIndex];
      const queuedAt = Number(existingEntry?.queuedAt) || Date.now();
      emitQuickMatchState(socket, 'searching', {
        queuedAt,
        queueDepth: quickMatchQueue.length
      });
      respond({
        ok: true,
        status: 'searching',
        queuedAt,
        queueDepth: quickMatchQueue.length,
        idempotent: true
      });
      return;
    }

    const opponentEntry = findNextQueuedOpponent(socket.id);
    if (!opponentEntry || !opponentEntry.socket) {
      const queuedAt = Date.now();
      quickMatchQueue.push({
        socketId: socket.id,
        queuedAt
      });
      logLifecycle('queue', 'queued', {
        socket: socket.id,
        queueDepth: quickMatchQueue.length
      });
      emitQuickMatchState(socket, 'searching', {
        queuedAt,
        queueDepth: quickMatchQueue.length
      });
      socket.emit('quick_match_queued', {
        status: 'searching',
        queuedAt,
        queueDepth: quickMatchQueue.length
      });
      respond({
        ok: true,
        status: 'searching',
        queuedAt,
        queueDepth: quickMatchQueue.length
      });
      return;
    }

    const opponentSocket = opponentEntry.socket;
    removeSocketFromQuickMatchQueue(socket.id, 'matched', false);
    removeSocketFromQuickMatchQueue(opponentSocket.id, 'matched', false);

    const opponentRoomCode = playerRoomBySocketId.get(opponentSocket.id);
    if (opponentRoomCode) {
      leaveRoomForSocket(opponentSocket, 'switch_to_quick_match_match', false);
    }
    const selfRoomCode = playerRoomBySocketId.get(socket.id);
    if (selfRoomCode) {
      leaveRoomForSocket(socket, 'switch_to_quick_match_match', false);
    }

    const room = createQuickMatchRoomAndStartDraft(opponentSocket, socket);
    if (!room) {
      const responsePayload = {
        ok: false,
        code: 'QUICK_MATCH_FAILED',
        message: 'Unable to create quick match room.'
      };
      respond(responsePayload);
      emitQuickMatchState(socket, 'idle', {
        reason: responsePayload.code
      });
      emitQuickMatchState(opponentSocket, 'idle', {
        reason: responsePayload.code
      });
      return;
    }

    const selfQueuedMs = Math.max(0, Date.now() - (Number(opponentEntry?.queuedAt) || Date.now()));
    const selfResponse = {
      ok: true,
      status: 'matched',
      roomCode: room.code,
      queueDepth: quickMatchQueue.length
    };
    respond(selfResponse);
    emitQuickMatchState(socket, 'matched', {
      roomCode: room.code,
      queueDepth: quickMatchQueue.length
    });
    emitQuickMatchState(opponentSocket, 'matched', {
      roomCode: room.code,
      queueDepth: quickMatchQueue.length
    });
    socket.emit('quick_match_matched', {
      status: 'matched',
      roomCode: room.code,
      queueDepth: quickMatchQueue.length
    });
    opponentSocket.emit('quick_match_matched', {
      status: 'matched',
      roomCode: room.code,
      waitMs: selfQueuedMs,
      queueDepth: quickMatchQueue.length
    });
    logLifecycle('queue', 'matched', {
      roomCode: room.code,
      playerA: opponentSocket.id,
      playerB: socket.id
    });
  });

  socket.on('cancel_quick_match', (ack) => {
    const respond = typeof ack === 'function'
      ? (payload) => ack(payload)
      : () => {};

    const removedEntry = removeSocketFromQuickMatchQueue(socket.id, 'player_cancel', true);
    if (!removedEntry) {
      respond({
        ok: true,
        status: 'idle',
        queueDepth: quickMatchQueue.length,
        idempotent: true
      });
      emitQuickMatchState(socket, 'idle', {
        reason: 'not_queued',
        queueDepth: quickMatchQueue.length
      });
      return;
    }

    respond({
      ok: true,
      status: 'idle',
      queueDepth: quickMatchQueue.length
    });
    emitQuickMatchState(socket, 'idle', {
      reason: 'player_cancel',
      queueDepth: quickMatchQueue.length
    });
  });

  socket.on('create_room', () => {
    removeSocketFromQuickMatchQueue(socket.id, 'manual_create_room', false);
    leaveRoomForSocket(socket, 'switch_to_create', false);

    const roomCode = createUniqueRoomCode();
    const room = {
      code: roomCode,
      players: [createRoomPlayer(socket.id, 1)],
      match: null,
      state: ROOM_STATES.WAITING,
      createdAt: Date.now()
    };

    rooms.set(roomCode, room);
    playerRoomBySocketId.set(socket.id, roomCode);
    socket.join(roomCode);

    logLifecycle('room', 'created', {
      code: roomCode,
      by: socket.id
    });
    const creator = room.players[0];
    socket.emit('room_created', {
      roomCode,
      playerSlot: 1,
      reconnectToken: creator?.reconnectToken || '',
      reconnectPlayerId: creator?.playerId || '',
      room: serializeRoom(room)
    });
    emitRoomUpdate(room);
  });

  socket.on('reconnect_room', (payload, ack) => {
    const respond = typeof ack === 'function'
      ? (responsePayload) => ack(responsePayload)
      : () => {};

    const requestedCode = normalizeRoomCode(payload?.roomCode || payload?.code);
    const reconnectToken = normalizeReconnectToken(payload?.reconnectToken || payload?.token);

    function fail(message, code = 'RECONNECT_FAILED') {
      socket.emit('reconnect_failed', {
        roomCode: requestedCode || '',
        code,
        message
      });
      respond({ ok: false, roomCode: requestedCode || '', code, message });
      logLifecycle('reconnect', 'failed', {
        socket: socket.id,
        code: requestedCode || '-',
        reason: code
      });
    }

    if (!requestedCode) {
      fail('Missing room code for reconnect.', 'MISSING_ROOM_CODE');
      return;
    }

    if (!reconnectToken) {
      fail('Missing reconnect token.', 'MISSING_RECONNECT_TOKEN');
      return;
    }

    const room = rooms.get(requestedCode);
    if (!room) {
      fail(`Room ${requestedCode} no longer exists.`, 'ROOM_NOT_FOUND');
      return;
    }

    const reconnectPlayer = getPlayerByReconnectToken(room, reconnectToken);
    if (!reconnectPlayer) {
      fail('Reconnect token is invalid for this room.', 'INVALID_RECONNECT_TOKEN');
      return;
    }

    if (reconnectPlayer.connected === true && reconnectPlayer.socketId === socket.id) {
      const idempotentPayload = buildPlayerSessionPayload(room, reconnectPlayer);
      socket.emit('room_reconnected', {
        ...idempotentPayload,
        resumedMatch: false,
        idempotent: true
      });
      respond({
        ok: true,
        ...idempotentPayload,
        resumedMatch: false,
        idempotent: true
      });
      logLifecycle('reconnect', 'idempotent_success', {
        code: room.code,
        socket: socket.id,
        playerId: reconnectPlayer.playerId
      });
      return;
    }

    if (reconnectPlayer.connected === true && reconnectPlayer.socketId && reconnectPlayer.socketId !== socket.id) {
      fail('This player slot is already connected.', 'ALREADY_CONNECTED');
      return;
    }

    const existingRoomCode = playerRoomBySocketId.get(socket.id);
    if (existingRoomCode && existingRoomCode !== requestedCode) {
      leaveRoomForSocket(socket, 'switch_to_reconnect', false);
    }

    clearReconnectGraceTimer(room.code, reconnectPlayer.playerId);
    clearDisconnectedStateForPlayer(reconnectPlayer);
    reconnectPlayer.socketId = socket.id;
    removeSocketFromQuickMatchQueue(socket.id, 'reconnected_to_room', false);

    playerRoomBySocketId.set(socket.id, room.code);
    socket.join(room.code);

    const matchPlayer = getMatchPlayerByPlayerId(room.match, reconnectPlayer.playerId);
    if (matchPlayer) {
      clearDisconnectedStateForPlayer(matchPlayer);
      matchPlayer.socketId = socket.id;
      matchPlayer.input = { x: 0, y: 0 };
    }

    refreshRoomState(room, 'player_reconnected');
    const resumedMatch = tryResumePausedMatch(room, 'player_reconnected');
    const reconnectPayload = buildPlayerSessionPayload(room, reconnectPlayer);

    socket.emit('room_reconnected', {
      ...reconnectPayload,
      resumedMatch
    });
    io.to(room.code).emit('player_reconnected', {
      roomCode: room.code,
      playerSlot: reconnectPlayer.slot,
      matchPlayerNumber: reconnectPlayer.matchPlayerNumber,
      reconnectedAt: Date.now(),
      resumedMatch
    });
    emitRoomUpdate(room);
    if (room.match) emitMatchState(room, Date.now());

    respond({
      ok: true,
      ...reconnectPayload,
      resumedMatch
    });
    logLifecycle('reconnect', 'success', {
      code: room.code,
      socket: socket.id,
      playerId: reconnectPlayer.playerId,
      slot: reconnectPlayer.slot,
      resumedMatch
    });
  });

  socket.on('join_room', (payload) => {
    removeSocketFromQuickMatchQueue(socket.id, 'manual_join_room', false);
    const requestedCode = normalizeRoomCode(payload?.roomCode || payload?.code || payload);
    if (!requestedCode) {
      emitRoomError(socket, 'Please provide a valid room code.', 'INVALID_ROOM_CODE');
      return;
    }

    const room = rooms.get(requestedCode);
    if (!room) {
      emitRoomError(socket, `Room ${requestedCode} does not exist.`, 'ROOM_NOT_FOUND');
      return;
    }

    const directExistingPlayerInRequestedRoom = getPlayerBySocketId(room, socket.id);
    if (directExistingPlayerInRequestedRoom) {
      playerRoomBySocketId.set(socket.id, requestedCode);
      socket.join(requestedCode);
      socket.emit('room_joined', {
        roomCode: requestedCode,
        playerSlot: directExistingPlayerInRequestedRoom.slot || 1,
        reconnectToken: directExistingPlayerInRequestedRoom.reconnectToken || '',
        reconnectPlayerId: directExistingPlayerInRequestedRoom.playerId || '',
        room: serializeRoom(room),
        idempotent: true
      });
      emitRoomUpdate(room);
      logLifecycle('room', 'join_idempotent_existing_socket', {
        code: requestedCode,
        socket: socket.id,
        slot: directExistingPlayerInRequestedRoom.slot || 1
      });
      return;
    }

    const existingRoomCode = playerRoomBySocketId.get(socket.id);
    if (existingRoomCode === requestedCode) {
      const existingPlayer = getPlayerBySocketId(room, socket.id);
      socket.emit('room_joined', {
        roomCode: requestedCode,
        playerSlot: existingPlayer?.slot || 1,
        reconnectToken: existingPlayer?.reconnectToken || '',
        reconnectPlayerId: existingPlayer?.playerId || '',
        room: serializeRoom(room)
      });
      emitRoomUpdate(room);
      return;
    }

    if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
      emitRoomError(socket, `Room ${requestedCode} is full.`, 'ROOM_FULL');
      return;
    }

    if (existingRoomCode) {
      leaveRoomForSocket(socket, 'switch_to_join', false);
    }

    room.players.push(createRoomPlayer(socket.id, room.players.length + 1));
    normalizePlayerSlots(room);
    refreshRoomState(room, 'player_joined');
    playerRoomBySocketId.set(socket.id, requestedCode);
    socket.join(requestedCode);

    const playerSlot = getPlayerBySocketId(room, socket.id)?.slot || room.players.length;
    logLifecycle('room', 'joined', {
      code: requestedCode,
      socket: socket.id,
      slot: playerSlot
    });
    socket.emit('room_joined', {
      roomCode: requestedCode,
      playerSlot,
      reconnectToken: getPlayerBySocketId(room, socket.id)?.reconnectToken || '',
      reconnectPlayerId: getPlayerBySocketId(room, socket.id)?.playerId || '',
      room: serializeRoom(room)
    });
    emitRoomUpdate(room);
  });

  socket.on('leave_room', () => {
    leaveRoomForSocket(socket, 'leave_room', true);
  });

  socket.on('return_to_room', (ack) => {
    const respond = typeof ack === 'function'
      ? (payload) => ack(payload)
      : () => {};

    function fail(message, code) {
      emitRoomError(socket, message, code);
      respond({ ok: false, code, message });
    }

    const roomCode = playerRoomBySocketId.get(socket.id);
    if (!roomCode) {
      fail('Join a room before returning.', 'NOT_IN_ROOM');
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      fail('Room is no longer available.', 'ROOM_NOT_FOUND');
      return;
    }

    const player = getPlayerBySocketId(room, socket.id);
    if (!player) {
      fail('You are not in this room.', 'NOT_IN_ROOM');
      return;
    }

    if (!room.match) {
      refreshRoomState(room, 'return_no_match');
      emitRoomUpdate(room);
      respond({
        ok: true,
        roomCode: room.code,
        room: serializeRoom(room),
        reset: false,
        reconnectToken: player.reconnectToken,
        reconnectPlayerId: player.playerId
      });
      return;
    }

    if (room.match.phase !== MATCH_PHASE_MATCH_END) {
      logLifecycle('room', 'return_to_room_rejected_phase', {
        code: room.code,
        socket: socket.id,
        phase: room.match.phase || '-'
      });
      fail('Match has not ended yet.', 'MATCH_NOT_ENDED');
      return;
    }

    const didReset = resetRoomAfterMatch(room, socket.id, 'return_to_room');
    if (!didReset) {
      fail('Unable to return room to ready state.', 'ROOM_RESET_FAILED');
      return;
    }

    const serializedRoom = serializeRoom(room);
    emitRoomUpdate(room);
    io.to(room.code).emit('room_reset_for_rematch', {
      roomCode: room.code,
      room: serializedRoom,
      reason: 'return_to_room',
      requestedBySocketId: socket.id
    });
    respond({
      ok: true,
      roomCode: room.code,
      room: serializedRoom,
      reset: true,
      reconnectToken: player.reconnectToken,
      reconnectPlayerId: player.playerId
    });
    logLifecycle('room', 'returned_to_room', {
      code: room.code,
      socket: socket.id,
      reset: true
    });
  });

  socket.on('reset_room_for_rematch', (ack) => {
    const respond = typeof ack === 'function'
      ? (payload) => ack(payload)
      : () => {};

    function fail(message, code) {
      emitRoomError(socket, message, code);
      respond({ ok: false, code, message });
    }

    const roomCode = playerRoomBySocketId.get(socket.id);
    if (!roomCode) {
      fail('Join a room before resetting.', 'NOT_IN_ROOM');
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      fail('Room is no longer available.', 'ROOM_NOT_FOUND');
      return;
    }

    const player = getPlayerBySocketId(room, socket.id);
    if (!player) {
      fail('You are not in this room.', 'NOT_IN_ROOM');
      return;
    }

    if (!room.match) {
      resetReadyAndMatchRole(room);
      refreshRoomState(room, 'rematch_reset_no_match');
      const serializedRoom = serializeRoom(room);
      emitRoomUpdate(room);
      respond({
        ok: true,
        roomCode: room.code,
        room: serializedRoom,
        reset: false,
        reconnectToken: player.reconnectToken,
        reconnectPlayerId: player.playerId
      });
      return;
    }

    if (room.match.phase !== MATCH_PHASE_MATCH_END) {
      logLifecycle('room', 'reset_rematch_rejected_phase', {
        code: room.code,
        socket: socket.id,
        phase: room.match.phase || '-'
      });
      fail('Match has not ended yet.', 'MATCH_NOT_ENDED');
      return;
    }

    const didReset = resetRoomAfterMatch(room, socket.id, 'reset_room_for_rematch');
    if (!didReset) {
      fail('Unable to reset room for rematch.', 'ROOM_RESET_FAILED');
      return;
    }

    const serializedRoom = serializeRoom(room);
    emitRoomUpdate(room);
    io.to(room.code).emit('room_reset_for_rematch', {
      roomCode: room.code,
      room: serializedRoom,
      reason: 'reset_room_for_rematch',
      requestedBySocketId: socket.id
    });
    respond({
      ok: true,
      roomCode: room.code,
      room: serializedRoom,
      reset: true,
      reconnectToken: player.reconnectToken,
      reconnectPlayerId: player.playerId
    });
    logLifecycle('room', 'reset_for_rematch', {
      code: room.code,
      socket: socket.id,
      reset: true
    });
  });

  socket.on('toggle_ready', (ack) => {
    const respond = typeof ack === 'function'
      ? (payload) => ack(payload)
      : () => {};

    function fail(message, code) {
      emitRoomError(socket, message, code);
      respond({ ok: false, code, message });
    }

    const roomCode = playerRoomBySocketId.get(socket.id);
    if (!roomCode) {
      fail('Join a room before toggling ready.', 'NOT_IN_ROOM');
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      fail('Room is no longer available.', 'ROOM_NOT_FOUND');
      return;
    }

    const player = getPlayerBySocketId(room, socket.id);
    if (!player) {
      fail('You are not in this room.', 'NOT_IN_ROOM');
      return;
    }

    if (room.match) {
      logLifecycle('room', 'ready_toggle_rejected_match_exists', {
        code: room.code,
        socket: socket.id,
        phase: room.match.phase || '-'
      });
      fail('Match already started.', 'MATCH_ALREADY_STARTED');
      return;
    }

    if (room.players.length < MAX_PLAYERS_PER_ROOM || getConnectedPlayerCount(room) < MAX_PLAYERS_PER_ROOM) {
      player.ready = false;
      player.matchPlayerNumber = null;
      refreshRoomState(room, 'waiting_for_opponent');
      fail('Waiting for opponent before ready check.', 'WAITING_FOR_OPPONENT');
      emitRoomUpdate(room);
      return;
    }

    player.ready = !Boolean(player.ready);
    logLifecycle('room', 'ready_toggled', {
      code: roomCode,
      socket: socket.id,
      ready: player.ready
    });

    if (areAllPlayersReady(room)) {
      logLifecycle('room', 'both_ready', {
        code: roomCode
      });
      setRoomState(room, ROOM_STATES.STARTING, 'both_ready');
      const match = createMatchForRoom(room);
      emitRoomUpdate(room);
      emitMatchStarted(room);
      emitMatchState(room, Date.now());
      respond({
        ok: true,
        roomCode: room.code,
        room: serializeRoom(room),
        match,
        matchPlayerNumber: player.matchPlayerNumber,
        reconnectToken: player.reconnectToken,
        reconnectPlayerId: player.playerId
      });
      return;
    }

    refreshRoomState(room, 'ready_toggled');
    emitRoomUpdate(room);
    respond({
      ok: true,
      roomCode: room.code,
      room: serializeRoom(room),
      match: null,
      matchPlayerNumber: player.matchPlayerNumber,
      reconnectToken: player.reconnectToken,
      reconnectPlayerId: player.playerId
    });
  });

  socket.on('player_input', (payload) => {
    const roomCode = playerRoomBySocketId.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room || !room.match || room.match.phase !== MATCH_PHASE_COMBAT) return;
    if (room.match.isPaused === true) return;

    const matchPlayer = getMatchPlayerBySocketId(room.match, socket.id);
    if (!matchPlayer) return;
    if (matchPlayer.connected === false) return;

    const nextInput = normalizeInputVector(payload);
    const previousInput = normalizeInputVector(matchPlayer.input);
    matchPlayer.input = nextInput;
    matchPlayer.lastUpdated = Date.now();

    if (!inputsEqual(previousInput, nextInput)) {
      console.log(`[match] player_input code=${roomCode} socket=${socket.id} x=${nextInput.x.toFixed(2)} y=${nextInput.y.toFixed(2)}`);
    }
  });

  socket.on('player_aim', (payload) => {
    const roomCode = playerRoomBySocketId.get(socket.id);
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room || !room.match || room.match.phase !== MATCH_PHASE_COMBAT) return;
    if (room.match.isPaused === true) return;

    const matchPlayer = getMatchPlayerBySocketId(room.match, socket.id);
    if (!matchPlayer) return;
    if (matchPlayer.connected === false) return;

    const nextAim = normalizeInputVector(payload);
    if (nextAim.x === 0 && nextAim.y === 0) return;

    const previousAim = normalizeInputVector(matchPlayer.aim);
    if (inputsEqual(previousAim, nextAim)) return;

    matchPlayer.aim = nextAim;
    matchPlayer.lastAimUpdated = Date.now();
    console.log(`[match] player_aim code=${roomCode} socket=${socket.id} x=${nextAim.x.toFixed(2)} y=${nextAim.y.toFixed(2)}`);
  });

  socket.on('cast_ability', (payloadOrAck, maybeAck) => {
    const { payload } = resolveAbilityCastPayloadAndAck(payloadOrAck, maybeAck);
    const abilityId = normalizeSpellId(
      payload?.abilityId
      || payload?.spellId
      || payload?.ability
      || payload?.spell
      || payload
    );
    if (!abilityId) {
      const ack = typeof payloadOrAck === 'function' ? payloadOrAck : maybeAck;
      if (typeof ack === 'function') {
        ack({ ok: false, code: 'MISSING_ABILITY', message: 'Missing abilityId.' });
      }
      emitRoomError(socket, 'Missing abilityId.', 'MISSING_ABILITY');
      return;
    }
    handleAbilityCastRequest(socket, abilityId, payloadOrAck, maybeAck);
  });

  socket.on('cast_fireblast', (payloadOrAck, maybeAck) => {
    handleAbilityCastRequest(socket, ABILITY_IDS.FIREBLAST, payloadOrAck, maybeAck);
  });

  socket.on('cast_blink', (payloadOrAck, maybeAck) => {
    handleAbilityCastRequest(socket, ABILITY_IDS.BLINK, payloadOrAck, maybeAck);
  });

  socket.on('cast_shield', (payloadOrAck, maybeAck) => {
    handleAbilityCastRequest(socket, ABILITY_IDS.SHIELD, payloadOrAck, maybeAck);
  });

  socket.on('cast_gust', (payloadOrAck, maybeAck) => {
    handleAbilityCastRequest(socket, ABILITY_IDS.GUST, payloadOrAck, maybeAck);
  });

  socket.on('cast_charge', (payloadOrAck, maybeAck) => {
    handleAbilityCastRequest(socket, ABILITY_IDS.CHARGE, payloadOrAck, maybeAck);
  });

  socket.on('cast_shock', (payloadOrAck, maybeAck) => {
    handleAbilityCastRequest(socket, ABILITY_IDS.SHOCK, payloadOrAck, maybeAck);
  });

  socket.on('cast_hook', (payloadOrAck, maybeAck) => {
    handleAbilityCastRequest(socket, ABILITY_IDS.HOOK, payloadOrAck, maybeAck);
  });

  socket.on('cast_wall', (payloadOrAck, maybeAck) => {
    handleAbilityCastRequest(socket, ABILITY_IDS.WALL, payloadOrAck, maybeAck);
  });

  socket.on('cast_rewind', (payloadOrAck, maybeAck) => {
    handleAbilityCastRequest(socket, ABILITY_IDS.REWIND, payloadOrAck, maybeAck);
  });

  socket.on('tuning_get', (ack) => {
    const respond = typeof ack === 'function' ? (payload) => ack(payload) : () => {};
    if (!ENABLE_TUNING_ADMIN) {
      respond({
        ok: false,
        code: 'TUNING_DISABLED',
        message: 'Live tuning is disabled in this environment.'
      });
      return;
    }
    const tuning = getAllSpellTuning();
    const identity = getSpellIdentitySummary();
    respond({
      ok: true,
      tuning,
      identity,
      updatedAt: Date.now()
    });
    logLifecycle('tuning', 'snapshot_requested', {
      socket: socket.id
    });
  });

  socket.on('tuning_set', (payloadOrAck, maybeAck) => {
    const payload = typeof payloadOrAck === 'function' ? {} : (payloadOrAck || {});
    const ack = typeof payloadOrAck === 'function' ? payloadOrAck : maybeAck;
    const respond = typeof ack === 'function' ? (responsePayload) => ack(responsePayload) : () => {};
    if (!ENABLE_TUNING_ADMIN) {
      respond({
        ok: false,
        code: 'TUNING_DISABLED',
        message: 'Live tuning is disabled in this environment.'
      });
      return;
    }

    const abilityId = normalizeSpellId(payload?.abilityId);
    const patchFromPayload = payload?.patch && typeof payload.patch === 'object'
      ? payload.patch
      : null;
    const field = String(payload?.field || payload?.key || '').trim();
    const value = payload?.value;
    const patch = patchFromPayload || (field ? { [field]: value } : {});
    const result = setSpellTuningOverride(abilityId, patch);
    if (!result?.ok) {
      respond({
        ok: false,
        code: result?.code || 'TUNING_SET_FAILED',
        message: result?.message || 'Failed to set tuning override.'
      });
      return;
    }

    const tuning = getAllSpellTuning();
    const identity = getSpellIdentitySummary();
    respond({
      ok: true,
      abilityId: result.abilityId,
      tuning: result.tuning,
      allTuning: tuning,
      identity,
      updatedAt: Date.now()
    });
    logLifecycle('tuning', 'override_set', {
      socket: socket.id,
      ability: result.abilityId
    });
    logSpellTuningSnapshot(`override_set:${result.abilityId}`);
  });

  socket.on('tuning_reset', (payloadOrAck, maybeAck) => {
    const payload = typeof payloadOrAck === 'function' ? {} : (payloadOrAck || {});
    const ack = typeof payloadOrAck === 'function' ? payloadOrAck : maybeAck;
    const respond = typeof ack === 'function' ? (responsePayload) => ack(responsePayload) : () => {};
    if (!ENABLE_TUNING_ADMIN) {
      respond({
        ok: false,
        code: 'TUNING_DISABLED',
        message: 'Live tuning is disabled in this environment.'
      });
      return;
    }

    const abilityId = normalizeSpellId(payload?.abilityId || payload?.reset || payload) || 'all';
    const result = resetSpellTuningOverride(abilityId);
    if (!result?.ok) {
      respond({
        ok: false,
        code: result?.code || 'TUNING_RESET_FAILED',
        message: result?.message || 'Failed to reset tuning override.'
      });
      return;
    }
    const tuning = getAllSpellTuning();
    const identity = getSpellIdentitySummary();
    respond({
      ok: true,
      reset: result.reset || result.abilityId || abilityId,
      tuning: result.tuning,
      allTuning: tuning,
      identity,
      updatedAt: Date.now()
    });
    logLifecycle('tuning', 'override_reset', {
      socket: socket.id,
      reset: result.reset || result.abilityId || abilityId
    });
    logSpellTuningSnapshot(`override_reset:${result.reset || result.abilityId || abilityId}`);
  });

  socket.on('draft_pick', (payloadOrAck, maybeAck) => {
    const payload = typeof payloadOrAck === 'function' ? undefined : payloadOrAck;
    const ack = typeof payloadOrAck === 'function' ? payloadOrAck : maybeAck;
    const respond = typeof ack === 'function'
      ? (responsePayload) => ack(responsePayload)
      : () => {};

    function fail(message, code, extra = {}) {
      emitRoomError(socket, message, code);
      respond({ ok: false, code, message, ...extra });
      logLifecycle('draft', 'pick_rejected', {
        socket: socket.id,
        code,
        message
      });
    }

    const roomCode = playerRoomBySocketId.get(socket.id);
    if (!roomCode) {
      fail('Join a room before drafting.', 'NOT_IN_ROOM');
      return;
    }

    const room = rooms.get(roomCode);
    if (!room || !room.match) {
      fail('Draft is not active.', 'DRAFT_NOT_ACTIVE');
      return;
    }

    if (room.match.phase !== MATCH_PHASE_DRAFT) {
      logLifecycle('draft', 'pick_ignored_wrong_phase', {
        code: room.code,
        socket: socket.id,
        phase: room.match.phase || '-'
      });
      fail('Draft phase has ended.', 'DRAFT_NOT_ACTIVE');
      return;
    }

    const matchPlayer = getMatchPlayerBySocketId(room.match, socket.id);
    if (!matchPlayer) {
      fail('Match player not found for drafting.', 'MATCH_PLAYER_NOT_FOUND');
      return;
    }

    if (matchPlayer.connected === false) {
      fail('Disconnected players cannot draft.', 'PLAYER_DISCONNECTED');
      return;
    }

    const now = Date.now();
    const requestId = normalizeRequestId(payload?.requestId || payload?.pickId || payload?.actionId);
    const recentDraftRequests = ensureActionCache(matchPlayer, 'recentDraftRequests');
    pruneRequestCache(recentDraftRequests, now, DRAFT_REQUEST_CACHE_TTL_MS);
    if (requestId && recentDraftRequests[requestId]) {
      const cached = recentDraftRequests[requestId]?.response;
      logLifecycle('draft', 'pick_duplicate_ignored', {
        code: room.code,
        player: matchPlayer.matchPlayerNumber,
        requestId
      });
      if (cached && typeof cached === 'object') {
        respond(cached);
        return;
      }
      respond({ ok: true, duplicated: true, requestId });
      return;
    }

    const actionRateLimits = ensureActionCache(matchPlayer, 'actionRateLimits');
    const lastDraftRequestAt = Number(actionRateLimits.draft_pick) || 0;
    if ((now - lastDraftRequestAt) < DRAFT_PICK_MIN_INTERVAL_MS) {
      const rejected = {
        ok: false,
        code: 'DRAFT_RATE_LIMIT',
        message: 'Draft pick rate limit hit.',
        retryInMs: Math.max(0, DRAFT_PICK_MIN_INTERVAL_MS - (now - lastDraftRequestAt))
      };
      emitRoomError(socket, rejected.message, rejected.code);
      respond(rejected);
      if (requestId) {
        recentDraftRequests[requestId] = {
          timestamp: now,
          response: rejected
        };
      }
      logLifecycle('draft', 'pick_rejected_rate_limit', {
        code: room.code,
        player: matchPlayer.matchPlayerNumber
      });
      return;
    }
    actionRateLimits.draft_pick = now;

    const spellId = normalizeSpellId(payload?.spellId || payload?.spell || payload);
    if (!spellId) {
      fail('Select a valid spell.', 'INVALID_SPELL');
      return;
    }

    const draftResult = applyDraftPick(room, matchPlayer.matchPlayerNumber, spellId, 'manual');
    if (!draftResult.ok) {
      const rejected = {
        ok: false,
        code: draftResult.code || 'DRAFT_PICK_REJECTED',
        message: draftResult.message || 'Draft pick rejected.'
      };
      fail(rejected.message, rejected.code);
      if (requestId) {
        recentDraftRequests[requestId] = {
          timestamp: now,
          response: rejected
        };
      }
      emitRoomUpdate(room);
      emitMatchState(room, Date.now());
      return;
    }

    emitRoomUpdate(room);
    emitMatchState(room, Date.now());
    const successResponse = {
      ok: true,
      roomCode: room.code,
      spellId: draftResult.spellId,
      playerNumber: draftResult.playerNumber,
      reason: draftResult.reason,
      requestId: requestId || '',
      room: serializeRoom(room),
      match: serializeMatch(room.match)
    };
    if (requestId) {
      recentDraftRequests[requestId] = {
        timestamp: now,
        response: successResponse
      };
    }
    respond(successResponse);
  });

  socket.on('disconnect', (reason) => {
    leaveRoomForSocket(socket, 'disconnect', false);
    logLifecycle('socket', 'disconnected', {
      id: socket.id,
      reason
    });
  });
});

let matchSimulationInterval = null;

function startMatchSimulation() {
  if (matchSimulationInterval !== null) return;
  matchSimulationInterval = setInterval(runMatchSimulationTick, MATCH_TICK_MS);
}

function stopMatchSimulation() {
  if (matchSimulationInterval === null) return;
  clearInterval(matchSimulationInterval);
  matchSimulationInterval = null;
}

function startServer(options = {}) {
  const host = options.host || HOST;
  const port = Number(options.port) || PORT;
  startMatchSimulation();
  logSpellTuningSnapshot('server_start');
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('error', onError);
      reject(error);
    };
    server.on('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      console.log(`Outra multiplayer server listening on http://${host}:${port}`);
      resolve({ host, port });
    });
  });
}

function stopServer() {
  stopMatchSimulation();
  return new Promise((resolve) => {
    try {
      io.close(() => {
        server.close(() => {
          resolve();
        });
      });
    } catch (_error) {
      try {
        server.close(() => resolve());
      } catch (_innerError) {
        resolve();
      }
    }
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('[server] failed_to_start', error);
    process.exitCode = 1;
  });
}

module.exports = {
  app,
  server,
  io,
  rooms,
  playerRoomBySocketId,
  ABILITY_IDS,
  ABILITY_DEFS,
  MATCH_PHASE_DRAFT,
  MATCH_PHASE_COMBAT_COUNTDOWN,
  MATCH_PHASE_COMBAT,
  MATCH_PHASE_MATCH_END,
  ROOM_STATES,
  startServer,
  stopServer,
  runMatchSimulationTick,
  processMatchTickForRoom,
  handleAbilityCastRequest,
  executeAbilityCast,
  getAbilityDef,
  getAbilityRemainingMs,
  setAbilityReadyAt,
  getSpellTuning,
  getAllSpellTuning,
  setSpellTuningOverride,
  resetSpellTuningOverride,
  getSpellIdentitySummary,
  ensurePlayerPositionHistory,
  createCombatEvent,
  pushMatchHitEvent,
  cleanupRoomMatchState,
  createMatchForRoom,
  createRoomPlayer,
  abilityRuntimeHandlers
};
