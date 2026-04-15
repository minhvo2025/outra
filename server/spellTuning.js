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

const DEFAULT_SPELL_TUNING = Object.freeze({
  [ABILITY_IDS.FIREBLAST]: Object.freeze({
    role: 'aggression',
    cooldownMs: 700,
    castDelayMs: 0,
    range: 19.6,
    durationMs: 0,
    speed: 14,
    lifetimeMs: 1400,
    spawnOffset: 0.9,
    hitRadius: 0.34,
    knockbackImpulse: 10.2,
    hitInvulnMs: 120
  }),
  [ABILITY_IDS.BLINK]: Object.freeze({
    role: 'mobility',
    cooldownMs: 5200,
    castDelayMs: 0,
    range: 3.2,
    knockbackImpulse: 0,
    durationMs: 0,
    distance: 3.2
  }),
  [ABILITY_IDS.SHIELD]: Object.freeze({
    role: 'defense',
    cooldownMs: 6000,
    castDelayMs: 0,
    range: 0,
    knockbackImpulse: 0,
    durationMs: 1200
  }),
  [ABILITY_IDS.GUST]: Object.freeze({
    role: 'control',
    cooldownMs: 3600,
    castDelayMs: 70,
    range: 3.4,
    durationMs: 0,
    knockbackImpulse: 8.8
  }),
  [ABILITY_IDS.CHARGE]: Object.freeze({
    role: 'aggression',
    cooldownMs: 5400,
    castDelayMs: 120,
    range: 4.8,
    durationMs: 220,
    speed: 22,
    distance: 4.8,
    hitRadius: 0.76,
    knockbackImpulse: 13.2
  }),
  [ABILITY_IDS.SHOCK]: Object.freeze({
    role: 'aggression',
    cooldownMs: 4200,
    castDelayMs: 90,
    range: 2.9,
    durationMs: 0,
    halfAngleDeg: 40,
    knockbackImpulse: 11.2
  }),
  [ABILITY_IDS.HOOK]: Object.freeze({
    role: 'control',
    cooldownMs: 5200,
    castDelayMs: 80,
    range: 16.2,
    durationMs: 900,
    speed: 18,
    lifetimeMs: 900,
    spawnOffset: 0.92,
    hitRadius: 0.38,
    pullTargetDistance: 1.55
  }),
  [ABILITY_IDS.WALL]: Object.freeze({
    role: 'control',
    cooldownMs: 7000,
    castDelayMs: 110,
    range: 1.6,
    knockbackImpulse: 0,
    durationMs: 4500,
    spawnOffset: 1.6,
    halfLength: 1.9,
    halfThickness: 0.36
  }),
  [ABILITY_IDS.REWIND]: Object.freeze({
    role: 'mobility',
    cooldownMs: 7800,
    castDelayMs: 0,
    range: 0,
    knockbackImpulse: 0,
    durationMs: 0,
    lookbackMs: 1000,
    historyMs: 2200,
    historyIntervalMs: 70
  })
});

const DEFAULT_BY_ID = Object.freeze(
  Object.keys(DEFAULT_SPELL_TUNING).reduce((acc, abilityId) => {
    acc[String(abilityId)] = DEFAULT_SPELL_TUNING[abilityId];
    return acc;
  }, {})
);

const overridesById = new Map();

function normalizeAbilityId(abilityId) {
  return String(abilityId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z_]/g, '');
}

function clampNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, parsed));
}

function getDefaultSpellTuning(abilityId) {
  const normalized = normalizeAbilityId(abilityId);
  return DEFAULT_BY_ID[normalized] || null;
}

function getSpellTuning(abilityId) {
  const normalized = normalizeAbilityId(abilityId);
  const defaults = DEFAULT_BY_ID[normalized];
  if (!defaults) return null;
  const override = overridesById.get(normalized);
  const merged = {
    ...defaults,
    ...(override || {})
  };
  if (normalized === ABILITY_IDS.SHOCK) {
    const halfAngleDeg = clampNumber(merged.halfAngleDeg, 1, 89) ?? defaults.halfAngleDeg;
    merged.halfAngleDeg = halfAngleDeg;
    merged.cosThreshold = Math.cos((halfAngleDeg * Math.PI) / 180);
  }
  return merged;
}

function getAllSpellTuning() {
  const snapshot = {};
  Object.keys(DEFAULT_BY_ID).forEach((abilityId) => {
    snapshot[abilityId] = getSpellTuning(abilityId);
  });
  return snapshot;
}

function sanitizeOverridePatch(abilityId, patch) {
  const defaults = getDefaultSpellTuning(abilityId);
  if (!defaults || !patch || typeof patch !== 'object') return {};
  const sanitized = {};
  Object.keys(patch).forEach((key) => {
    if (!(key in defaults)) return;
    if (key === 'role') {
      sanitized.role = String(patch.role || defaults.role).trim().toLowerCase();
      return;
    }
    const nextValue = clampNumber(patch[key], 0);
    if (nextValue === null) return;
    sanitized[key] = nextValue;
  });
  return sanitized;
}

function setSpellTuningOverride(abilityId, patch) {
  const normalized = normalizeAbilityId(abilityId);
  const defaults = DEFAULT_BY_ID[normalized];
  if (!defaults) {
    return { ok: false, code: 'UNKNOWN_ABILITY', message: 'Unknown ability.' };
  }
  const sanitizedPatch = sanitizeOverridePatch(normalized, patch);
  if (!Object.keys(sanitizedPatch).length) {
    return { ok: false, code: 'INVALID_PATCH', message: 'No valid tuning fields provided.' };
  }
  const previous = overridesById.get(normalized) || {};
  const merged = {
    ...previous,
    ...sanitizedPatch
  };
  overridesById.set(normalized, merged);
  return {
    ok: true,
    abilityId: normalized,
    tuning: getSpellTuning(normalized)
  };
}

function resetSpellTuningOverride(abilityId) {
  if (!abilityId || String(abilityId).trim().toLowerCase() === 'all') {
    overridesById.clear();
    return { ok: true, reset: 'all', tuning: getAllSpellTuning() };
  }
  const normalized = normalizeAbilityId(abilityId);
  const defaults = DEFAULT_BY_ID[normalized];
  if (!defaults) {
    return { ok: false, code: 'UNKNOWN_ABILITY', message: 'Unknown ability.' };
  }
  overridesById.delete(normalized);
  return {
    ok: true,
    abilityId: normalized,
    reset: normalized,
    tuning: getSpellTuning(normalized)
  };
}

function getSpellIdentitySummary() {
  const result = {};
  Object.keys(DEFAULT_BY_ID).forEach((abilityId) => {
    const tuning = getSpellTuning(abilityId);
    result[abilityId] = {
      role: tuning?.role || 'utility',
      cooldownMs: Number(tuning?.cooldownMs) || 0,
      castDelayMs: Number(tuning?.castDelayMs) || 0
    };
  });
  return result;
}

module.exports = {
  ABILITY_IDS,
  DEFAULT_SPELL_TUNING,
  getDefaultSpellTuning,
  getSpellTuning,
  getAllSpellTuning,
  setSpellTuningOverride,
  resetSpellTuningOverride,
  getSpellIdentitySummary
};
