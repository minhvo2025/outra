// ── Helpers ───────────────────────────────────────────────────
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeKey(key) { return key === ' ' ? 'space' : String(key).toLowerCase(); }

function prettyKey(key) {
  if (key === ' ' || key === 'space') return 'Space';
  if (key === 'escape') return 'Esc';
  if (key === 'arrowup') return 'Arrow Up';
  if (key === 'arrowdown') return 'Arrow Down';
  if (key === 'arrowleft') return 'Arrow Left';
  if (key === 'arrowright') return 'Arrow Right';
  return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
}

// ── Spell Tooltip Data ────────────────────────────────────────
const SPELL_TOOLTIP_DATA = {
  fire: {
    name: 'Fireblast',
    desc: 'Fast fire projectile',
    stats: '20 dmg • long range • knockback',
  },
  hook: {
    name: 'Hook',
    desc: 'Pulls enemy to you',
    stats: '20 dmg • 150 range',
  },
  blink: {
    name: 'Blink',
    desc: 'Instant short teleport',
    stats: '150 range • mobility',
  },
  shield: {
    name: 'Shield',
    desc: 'Blocks damage briefly',
    stats: '1.0s shield • defensive',
  },
  charge: {
    name: 'Arcane Charge',
    desc: 'Dash forward with impact',
    stats: '16 dmg • 150 range',
  },
  shock: {
    name: 'Shock Blast',
    desc: 'Front cone burst',
    stats: '14 dmg • 115 range',
  },
  gust: {
    name: 'Gust',
    desc: 'Push enemies around you',
    stats: '4 dmg • 120 radius',
  },
  wall: {
    name: 'Wall',
    desc: 'Creates temporary barrier',
    stats: '150 width • blocks path',
  },
  rewind: {
    name: 'Rewind',
    desc: 'Return to old position',
    stats: '1.0s rewind • no heal',
  },
};

const LEADERBOARD_RANK_ICON_PATHS = {
  1: 'docs/art/Lobby/1.png',
  2: 'docs/art/Lobby/2.png',
  3: 'docs/art/Lobby/3.png',
};

const leaderboardRankIconStatus = {
  1: 'pending',
  2: 'pending',
  3: 'pending',
};

let leaderboardLastSignature = '';
let rankedPanelLastSignature = '';

function preloadLeaderboardRankIcons() {
  Object.entries(LEADERBOARD_RANK_ICON_PATHS).forEach(([rankKey, src]) => {
    const rank = Number(rankKey);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      leaderboardRankIconStatus[rank] = 'loaded';
    };
    img.onerror = () => {
      leaderboardRankIconStatus[rank] = 'failed';
    };
    img.src = src;
  });
}

preloadLeaderboardRankIcons();

let spellTooltipEl = null;
let rankTooltipEl = null;
let rankTooltipAutoHideBound = false;

function ensureSpellTooltip() {
  if (spellTooltipEl && document.body.contains(spellTooltipEl)) return spellTooltipEl;

  spellTooltipEl = document.createElement('div');
  spellTooltipEl.id = 'spellTooltip';
  spellTooltipEl.className = 'spellTooltip hidden';
  spellTooltipEl.innerHTML = `
    <div class="spellTooltipName"></div>
    <div class="spellTooltipDesc"></div>
    <div class="spellTooltipStats"></div>
  `;
  document.body.appendChild(spellTooltipEl);
  return spellTooltipEl;
}

function showSpellTooltip(spellId, x, y) {
  const tooltip = ensureSpellTooltip();
  const data = SPELL_TOOLTIP_DATA[spellId];
  if (!data) return;

  tooltip.querySelector('.spellTooltipName').textContent = data.name;
  tooltip.querySelector('.spellTooltipDesc').textContent = data.desc;
  tooltip.querySelector('.spellTooltipStats').textContent = data.stats;

  tooltip.classList.remove('hidden');
  positionSpellTooltip(x, y);
}

function positionSpellTooltip(x, y) {
  const tooltip = ensureSpellTooltip();
  const pad = 14;

  const rect = tooltip.getBoundingClientRect();
  let left = x - rect.width / 2;
  let top = y - rect.height - 18;

  if (left < pad) left = pad;
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
  if (top < pad) top = y + 18;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideSpellTooltip() {
  if (!spellTooltipEl) return;
  spellTooltipEl.classList.add('hidden');
}

function getAllRanksForTooltip() {
  const fromConfig = Array.isArray(window.OUTRA_RANKS?.all) ? window.OUTRA_RANKS.all : [];
  if (!fromConfig.length) return [];

  return fromConfig.map((tier) => ({
    id: tier.id,
    rankText: Number.isFinite(Number(tier?.rankNumber)) ? `Rank ${Number(tier.rankNumber)}` : 'Master',
    label: getRankLabelFromTier(tier),
    badge: getRankBadgeAssetPath(tier),
    fallback: getRankBadgeFallbackToken(tier),
  }));
}

function ensureRankTooltip() {
  if (rankTooltipEl && document.body.contains(rankTooltipEl)) return rankTooltipEl;

  const ranks = getAllRanksForTooltip();
  rankTooltipEl = document.createElement('div');
  rankTooltipEl.id = 'rankTooltip';
  rankTooltipEl.className = 'rankTooltip hidden';
  rankTooltipEl.innerHTML = `
    <div class="rankTooltipTitle">All Ranks</div>
    <div class="rankTooltipRows">
      ${ranks.map((entry) => `
        <div class="rankTooltipRow" data-rank-tooltip-row="${escapeHtml(entry.id)}">
          <span class="rankTooltipIconWrap">
            <img
              class="rankTooltipIcon"
              src="${escapeHtml(entry.badge)}"
              alt="${escapeHtml(entry.rankText)} icon"
              data-rank-tooltip-icon="1"
              decoding="async"
              draggable="false"
            />
            <span class="rankTooltipIconFallback">${escapeHtml(entry.fallback)}</span>
          </span>
          <span class="rankTooltipText">
            <span class="rankTooltipRankText">${escapeHtml(entry.rankText)}</span>
            <span class="rankTooltipLabel">${escapeHtml(entry.label)}</span>
          </span>
        </div>
      `).join('')}
    </div>
  `;
  document.body.appendChild(rankTooltipEl);

  rankTooltipEl.querySelectorAll('[data-rank-tooltip-icon="1"]').forEach((img) => {
    const icon = img;
    const applyFallback = () => {
      const wrap = icon.closest('.rankTooltipIconWrap');
      if (wrap) wrap.classList.add('rankTooltipIconFailed');
    };
    icon.addEventListener('error', applyFallback);
    if (icon.complete && icon.naturalWidth === 0) {
      applyFallback();
    }
  });

  return rankTooltipEl;
}

function positionRankTooltip(clientX, clientY) {
  const tooltip = ensureRankTooltip();
  const pad = 14;
  const rect = tooltip.getBoundingClientRect();
  let left = clientX + 16;
  let top = clientY - rect.height * 0.25;

  if (left + rect.width > window.innerWidth - pad) left = clientX - rect.width - 16;
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showRankTooltip(clientX, clientY) {
  const tooltip = ensureRankTooltip();
  tooltip.classList.remove('hidden');
  positionRankTooltip(clientX, clientY);
}

function hideRankTooltip() {
  if (!rankTooltipEl) return;
  rankTooltipEl.classList.add('hidden');
}

function bindRankTooltipAutoHide() {
  if (rankTooltipAutoHideBound) return;
  rankTooltipAutoHideBound = true;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideRankTooltip();
  });

  window.addEventListener('blur', () => {
    hideRankTooltip();
  });
}

bindRankTooltipAutoHide();

function bindDesktopSpellTooltips() {
  Object.keys(SPELL_TOOLTIP_DATA).forEach((spellId) => {
    const cell = document.getElementById(`dspell-${spellId}`);
    if (!cell || cell.dataset.tooltipBound === '1') return;

    cell.dataset.tooltipBound = '1';

    cell.addEventListener('mouseenter', (e) => {
      if (isTouchDevice) return;
      showSpellTooltip(spellId, e.clientX, e.clientY);
    });

    cell.addEventListener('mousemove', (e) => {
      if (isTouchDevice) return;
      positionSpellTooltip(e.clientX, e.clientY);
    });

    cell.addEventListener('mouseleave', () => {
      hideSpellTooltip();
    });
  });
}

// ── Tab Switching ─────────────────────────────────────────────
let draftOrderBuilt = false;
let draftOrderSignature = '';
const DRAFT_PLAYER_IDS = ['A', 'B'];
const DRAFT_PLAYER_AVATAR_BY_ID = Object.freeze({
  A: '/docs/art/pfp.png',
  B: '/docs/art/pfp.png',
});
const DRAFT_DEFAULT_RANK_ID = '20';
const DRAFT_EMOTE_LABELS = Object.freeze({
  greetings: 'Greetings',
  good_game: 'Good game',
  easy_win: 'Easy Win',
});
const DRAFT_EMOTE_UNLOCK_STORE_KEYS = Object.freeze({
  good_game: 'emoteGoodGame',
  easy_win: 'emoteEasyWin',
});
const draftEmoteHideTimers = {
  A: 0,
  B: 0,
};
let draftEmoteBindingsReady = false;
let draftSpellPoolBuilt = false;
const draftSpellPoolButtons = new Map();
const draftSpellRecentPickAt = new Map();
const draftUiSpellFxState = {
  initialized: false,
  prevPicks: {
    A: [],
    B: [],
  },
  lastActivePlayerId: '',
  hoverSpellId: '',
  hoverStartedAt: 0,
  pendingSpellId: '',
  pendingPlayerId: '',
  pendingStartedAt: 0,
};

const MP_ABILITY_TO_UI_SPELL = Object.freeze({
  fireblast: 'fire',
  blink: 'blink',
  shield: 'shield',
  gust: 'gust',
  charge: 'charge',
  shock: 'shock',
  wall: 'wall',
  rewind: 'rewind',
  hook: 'hook',
});

function getMultiplayerPresentationSnapshot() {
  const api = window.outraMultiplayer;
  if (!api || typeof api.getPresentationSnapshot !== 'function') return null;
  const snapshot = api.getPresentationSnapshot();
  if (!snapshot || snapshot.active !== true) return null;
  return snapshot;
}

function toUiSpellFromMultiplayer(spellOrAbilityId) {
  const normalized = String(spellOrAbilityId || '').trim().toLowerCase();
  if (!normalized) return '';
  return MP_ABILITY_TO_UI_SPELL[normalized] || normalized;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeDraftPlayerId(playerId) {
  return String(playerId || '').trim().toUpperCase() === 'B' ? 'B' : 'A';
}

function clearDraftUiSpellFxState() {
  draftUiSpellFxState.initialized = false;
  draftUiSpellFxState.prevPicks.A = [];
  draftUiSpellFxState.prevPicks.B = [];
  draftUiSpellFxState.lastActivePlayerId = '';
  draftUiSpellFxState.hoverSpellId = '';
  draftUiSpellFxState.hoverStartedAt = 0;
  draftUiSpellFxState.pendingSpellId = '';
  draftUiSpellFxState.pendingPlayerId = '';
  draftUiSpellFxState.pendingStartedAt = 0;
  draftSpellRecentPickAt.clear();
  draftState.holdSpellId = null;
  draftState.holdTime = 0;
}

function queueDraftPickFxFromSync(playerId, slotIndex, spellId) {
  if (typeof queueDraftPickConfirmationFx !== 'function') return;
  const normalizedPlayerId = normalizeDraftPlayerId(playerId);
  const normalizedSpellId = toUiSpellFromMultiplayer(spellId);
  if (!normalizedSpellId) return;
  queueDraftPickConfirmationFx(normalizedSpellId, normalizedPlayerId, slotIndex);
  draftSpellRecentPickAt.set(normalizedSpellId, performance.now());
}

function syncDraftVisualRuntimeFromSnapshot(order, picksA, picksB, spellPool) {
  const spellOrder = Array.isArray(draftState.spellOrder) && draftState.spellOrder.length
    ? draftState.spellOrder.map((spellId) => toUiSpellFromMultiplayer(spellId)).filter(Boolean)
    : ['hook', 'blink', 'shield', 'charge', 'shock', 'gust', 'wall', 'rewind'];
  const picksByPlayer = {
    A: Array.isArray(picksA) ? picksA : [],
    B: Array.isArray(picksB) ? picksB : [],
  };
  const pickedByPlayerCounts = {
    A: {},
    B: {},
  };

  for (const playerId of DRAFT_PLAYER_IDS) {
    for (const spellId of picksByPlayer[playerId]) {
      const normalizedSpellId = toUiSpellFromMultiplayer(spellId);
      if (!normalizedSpellId) continue;
      pickedByPlayerCounts[playerId][normalizedSpellId] = (pickedByPlayerCounts[playerId][normalizedSpellId] || 0) + 1;
    }
  }

  draftState.order = Array.isArray(order) && order.length ? order.slice() : ['A', 'B', 'B', 'A', 'A', 'B'];
  draftState.spells = spellOrder.map((spellId) => {
    const entry = spellPool && typeof spellPool === 'object' ? spellPool[spellId] : null;
    const remainingCopies = Number(entry?.remainingCopies);
    const totalCopies = Number(entry?.totalCopies);
    const remaining = Number.isFinite(remainingCopies) ? Math.max(0, remainingCopies) : 0;
    const total = Number.isFinite(totalCopies) ? Math.max(remaining, totalCopies) : remaining;
    const countA = Number(pickedByPlayerCounts.A[spellId]) || 0;
    const countB = Number(pickedByPlayerCounts.B[spellId]) || 0;
    const takenBy = countA > countB ? 'A' : countB > countA ? 'B' : countA > 0 ? (draftUiSpellFxState.pendingPlayerId || '') : null;
    return {
      id: spellId,
      label: typeof getDraftSpellLabel === 'function' ? (getDraftSpellLabel(spellId) || spellId.toUpperCase()) : spellId.toUpperCase(),
      takenBy,
      disabled: remaining <= 0,
      remainingCopies: remaining,
      totalCopies: total,
    };
  });

  if (typeof buildDraftLayout === 'function') {
    draftState.layout = buildDraftLayout();
  }

  const seats = draftState.layout?.seats || {};
  for (const playerId of DRAFT_PLAYER_IDS) {
    const seat = seats[playerId];
    if (!seat) continue;
    if (!draftState.players[playerId]) {
      draftState.players[playerId] = { x: seat.x, y: seat.y, vx: 0, vy: 0, moveTimer: 0, dirX: 0, dirY: 0 };
    }
    draftState.players[playerId].x = seat.x;
    draftState.players[playerId].y = seat.y;
    draftState.players[playerId].vx = 0;
    draftState.players[playerId].vy = 0;
    draftState.players[playerId].moveTimer = 0;
    draftState.players[playerId].dirX = 0;
    draftState.players[playerId].dirY = 0;
  }
}

function syncDraftStateFromMultiplayer(multiplayerSnapshot) {
  const draft = multiplayerSnapshot?.draft;
  if (!draft || typeof draft !== 'object') return;

  const order = Array.isArray(draft.order) && draft.order.length
    ? draft.order.map((playerId) => normalizeDraftPlayerId(playerId))
    : ['A', 'B', 'B', 'A', 'A', 'B'];
  const activeIndexRaw = Number(draft.activeIndex);
  const activeIndex = Number.isFinite(activeIndexRaw)
    ? clampNumber(activeIndexRaw, 0, Math.max(0, order.length - 1))
    : 0;

  const rawPicksA = Array.isArray(draft.picks?.A) ? draft.picks.A : [];
  const rawPicksB = Array.isArray(draft.picks?.B) ? draft.picks.B : [];
  const picksA = rawPicksA.map((spellId) => toUiSpellFromMultiplayer(spellId)).filter(Boolean);
  const picksB = rawPicksB.map((spellId) => toUiSpellFromMultiplayer(spellId)).filter(Boolean);
  const mappedLocalPlayerId = normalizeDraftPlayerId(draft.localPlayerId || 'A');
  const mappedNames = {
    A: String(draft.playerNames?.A || '').trim(),
    B: String(draft.playerNames?.B || '').trim()
  };
  const spellPool = draft.spellPool && typeof draft.spellPool === 'object'
    ? draft.spellPool
    : {};

  draftState.order = order;
  draftState.activeIndex = activeIndex;
  draftState.turnIndex = activeIndex;
  draftState.localPlayerId = mappedLocalPlayerId;
  draftState.complete = !!draft.complete;
  draftState.turnDuration = Math.max(0, Number(draft.turnDurationSeconds) || draftState.turnDuration || 0);
  draftState.timeLeft = Math.max(0, Number(draft.timeLeftSeconds) || 0);
  draftState.turnTimeLeft = draftState.timeLeft;
  draftState.holdDuration = Math.max(0.36, Number(draftState.holdDuration) || 0.6);
  draftState.picks = {
    A: picksA.slice(0, 3),
    B: picksB.slice(0, 3)
  };
  draftState.playerNames = mappedNames;
  draftState.spellPool = spellPool;
  syncDraftVisualRuntimeFromSnapshot(order, picksA, picksB, spellPool);

  const activePlayerId = order[activeIndex] || null;
  if (!draftUiSpellFxState.initialized) {
    draftUiSpellFxState.prevPicks.A = picksA.slice();
    draftUiSpellFxState.prevPicks.B = picksB.slice();
    draftUiSpellFxState.lastActivePlayerId = activePlayerId || '';
    draftUiSpellFxState.initialized = true;
    return;
  }

  for (const playerId of DRAFT_PLAYER_IDS) {
    const previousPicks = Array.isArray(draftUiSpellFxState.prevPicks[playerId]) ? draftUiSpellFxState.prevPicks[playerId] : [];
    const nextPicks = playerId === 'A' ? picksA : picksB;
    const maxLength = Math.max(previousPicks.length, nextPicks.length);
    for (let index = 0; index < maxLength; index += 1) {
      const prevSpellId = toUiSpellFromMultiplayer(previousPicks[index]);
      const nextSpellId = toUiSpellFromMultiplayer(nextPicks[index]);
      if (!nextSpellId || prevSpellId === nextSpellId) continue;
      queueDraftPickFxFromSync(playerId, index, nextSpellId);
      if (
        draftUiSpellFxState.pendingSpellId
        && draftUiSpellFxState.pendingPlayerId === playerId
        && draftUiSpellFxState.pendingSpellId === nextSpellId
      ) {
        draftUiSpellFxState.pendingSpellId = '';
        draftUiSpellFxState.pendingPlayerId = '';
        draftUiSpellFxState.pendingStartedAt = 0;
      }
    }
  }

  if (
    draftUiSpellFxState.lastActivePlayerId !== activePlayerId
    && typeof queueDraftTurnFlash === 'function'
    && activePlayerId
  ) {
    queueDraftTurnFlash(activePlayerId);
  }
  draftUiSpellFxState.lastActivePlayerId = activePlayerId || '';
  draftUiSpellFxState.prevPicks.A = picksA.slice();
  draftUiSpellFxState.prevPicks.B = picksB.slice();
}

function ensureDraftOrderUi() {
  if (!draftOrderListEl) return;

  const order = Array.isArray(draftState.order) ? draftState.order : [];
  const signature = order.join('|');
  if (!order.length) {
    draftOrderListEl.innerHTML = '';
    draftOrderBuilt = true;
    draftOrderSignature = '';
    return;
  }

  if (draftOrderBuilt && draftOrderListEl.children.length === order.length && draftOrderSignature === signature) return;

  draftOrderListEl.innerHTML = order.map((slot, idx) => `
    <span class="draftOrderChip" data-draft-order-index="${idx}" data-draft-order-player="${escapeHtml(slot)}">
      <span class="draftOrderChipTurn">${idx + 1}</span>
      <span class="draftOrderChipPlayer">${escapeHtml(slot)}</span>
    </span>
  `).join('');
  draftOrderBuilt = true;
  draftOrderSignature = signature;
}

function clearDraftEmoteToast(playerId) {
  const safeId = String(playerId || '').trim().toUpperCase();
  if (!safeId) return;

  const toastEl = document.querySelector(`[data-draft-emote-toast="${safeId}"]`);
  if (toastEl) {
    toastEl.classList.remove('show');
    toastEl.textContent = '';
  }

  if (draftEmoteHideTimers[safeId]) {
    clearTimeout(draftEmoteHideTimers[safeId]);
    draftEmoteHideTimers[safeId] = 0;
  }
}

function clearAllDraftEmoteToasts() {
  for (const playerId of DRAFT_PLAYER_IDS) {
    clearDraftEmoteToast(playerId);
  }
}

function isDraftEmoteUnlocked(emoteKey) {
  const safeKey = String(emoteKey || '').trim().toLowerCase();
  if (!safeKey) return false;
  if (safeKey === 'greetings') return true;

  const storeKey = DRAFT_EMOTE_UNLOCK_STORE_KEYS[safeKey];
  if (!storeKey) return false;
  return !!(profile?.store?.[storeKey]);
}

function syncDraftEmoteButtons() {
  if (!draftOverlay) return;

  draftOverlay.querySelectorAll('[data-draft-emote-strip]').forEach((strip) => {
    let visibleCount = 0;
    strip.querySelectorAll('[data-draft-emote-btn]').forEach((btn) => {
      const raw = btn.getAttribute('data-draft-emote-btn') || '';
      const parts = raw.split(':');
      const emoteKey = parts[1] || '';
      const unlocked = isDraftEmoteUnlocked(emoteKey);

      btn.hidden = !unlocked;
      btn.disabled = !unlocked;
      btn.setAttribute('aria-hidden', unlocked ? 'false' : 'true');
      if (unlocked) visibleCount += 1;
    });

    strip.setAttribute('data-visible-count', String(Math.max(1, visibleCount)));
  });
}

function showDraftEmoteToast(playerId, emoteKey) {
  const safeId = String(playerId || '').trim().toUpperCase();
  const key = String(emoteKey || '').trim().toLowerCase();
  const emoteLabel = DRAFT_EMOTE_LABELS[key] || '';
  if (!safeId || !emoteLabel) return;

  const toastEl = document.querySelector(`[data-draft-emote-toast="${safeId}"]`);
  if (!toastEl) return;

  if (draftEmoteHideTimers[safeId]) {
    clearTimeout(draftEmoteHideTimers[safeId]);
    draftEmoteHideTimers[safeId] = 0;
  }

  toastEl.textContent = emoteLabel;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth;
  toastEl.classList.add('show');

  draftEmoteHideTimers[safeId] = setTimeout(() => {
    clearDraftEmoteToast(safeId);
  }, 1450);
}

function ensureDraftEmoteBindings() {
  if (draftEmoteBindingsReady || !draftOverlay) return;
  draftEmoteBindingsReady = true;

  draftOverlay.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest('[data-draft-emote-btn]');
    if (!btn) return;

    const raw = btn.getAttribute('data-draft-emote-btn') || '';
    const [playerId, emoteKey] = raw.split(':');
    if (!playerId || !emoteKey) return;
    const mpSnapshot = getMultiplayerPresentationSnapshot();
    const draftActive = gameState === 'draft' || !!mpSnapshot?.isDraftActive;
    if (!draftActive) return;
    if (!isDraftEmoteUnlocked(emoteKey)) return;

    showDraftEmoteToast(playerId, emoteKey);
  });
}

function getDraftUiSpellLabel(spellId) {
  if (!spellId) return 'Spell';
  const fallback = (SPELL_DEFS[spellId] && SPELL_DEFS[spellId].name)
    ? SPELL_DEFS[spellId].name
    : String(spellId).toUpperCase();
  if (typeof getDraftSpellLabel !== 'function') return fallback;
  return getDraftSpellLabel(spellId) || fallback;
}

function getDraftUiSpellIconPath(spellId) {
  if (!spellId) return '';
  const path = SPELL_ICONS?.[spellId];
  return typeof path === 'string' ? path : '';
}

function syncDraftPickSlotVisual(slotEl, spellId) {
  if (!slotEl) return;
  if (!spellId) {
    delete slotEl.dataset.spellIconPath;
    return;
  }

  const label = getDraftUiSpellLabel(spellId);
  const iconPath = getDraftUiSpellIconPath(spellId);
  const fallbackIcon = (SPELL_DEFS[spellId] && SPELL_DEFS[spellId].icon) ? SPELL_DEFS[spellId].icon : '*';
  const currentPath = slotEl.dataset.spellIconPath || '';
  const hasImage = !!slotEl.querySelector('.draftPickIconImg');

  if (!iconPath) {
    slotEl.dataset.spellIconPath = '';
    return;
  }

  if (currentPath === iconPath && hasImage) return;

  slotEl.innerHTML = `
    <span class="draftPickIconWrap">
      <img class="draftPickIconImg" src="${escapeHtml(iconPath)}" alt="${escapeHtml(label)}" loading="lazy" decoding="async" />
      <span class="draftPickIconFallback">${escapeHtml(fallbackIcon)}</span>
    </span>
    <span class="draftPickName">${escapeHtml(label)}</span>
  `;

  const iconImg = slotEl.querySelector('.draftPickIconImg');
  const iconFallback = slotEl.querySelector('.draftPickIconFallback');
  if (iconFallback) iconFallback.style.display = 'none';
  if (iconImg) {
    iconImg.addEventListener('error', () => {
      iconImg.remove();
      if (iconFallback) iconFallback.style.display = 'inline-flex';
    }, { once: true });
  }

  slotEl.dataset.spellIconPath = iconPath;
}

function getDraftPlayerAvatarPath(playerId) {
  return DRAFT_PLAYER_AVATAR_BY_ID[playerId] || DRAFT_PLAYER_AVATAR_BY_ID.A;
}

function getDraftPlayerDisplayName(playerId) {
  const localPlayerId = draftState.localPlayerId || 'A';
  if (playerId === localPlayerId) {
    const localName = typeof player?.name === 'string' ? player.name.trim() : '';
    return localName || `Player ${playerId}`;
  }

  const mappedName = draftState?.playerNames?.[playerId];
  if (typeof mappedName === 'string' && mappedName.trim()) {
    return mappedName.trim();
  }

  return playerId === 'B' ? 'Opponent' : `Player ${playerId}`;
}

function getDraftPlayerRankTier(playerId) {
  const localPlayerId = draftState.localPlayerId || 'A';
  if (playerId === localPlayerId && typeof getRankedSnapshot === 'function') {
    const snapshot = getRankedSnapshot();
    if (snapshot?.tier) return snapshot.tier;
  }

  return window.OUTRA_RANKS?.getById?.(DRAFT_DEFAULT_RANK_ID)
    || window.OUTRA_RANKS?.all?.[0]
    || null;
}

function syncDraftPlayerAvatar(panel, playerId) {
  if (!panel) return;

  const avatarWrap = panel.querySelector(`[data-draft-player-avatar-wrap="${playerId}"]`);
  const avatarImg = panel.querySelector(`[data-draft-player-avatar="${playerId}"]`);
  const avatarFallback = panel.querySelector('.draftPlayerAvatarFallback');
  if (avatarFallback) avatarFallback.textContent = playerId;
  if (!avatarWrap || !avatarImg) return;

  if (avatarImg.dataset.fallbackBound !== '1') {
    avatarImg.dataset.fallbackBound = '1';

    avatarImg.addEventListener('error', () => {
      avatarWrap.classList.add('avatar-failed');
    });

    avatarImg.addEventListener('load', () => {
      if (avatarImg.naturalWidth > 0 && avatarImg.naturalHeight > 0) {
        avatarWrap.classList.remove('avatar-failed');
      }
    });
  }

  const avatarPath = getDraftPlayerAvatarPath(playerId);
  if (avatarImg.dataset.avatarPath !== avatarPath) {
    avatarImg.dataset.avatarPath = avatarPath;
    avatarImg.src = avatarPath;
  }

  if (avatarImg.complete && avatarImg.naturalWidth === 0) {
    avatarWrap.classList.add('avatar-failed');
  }
}

function syncDraftPlayerRankBadge(panel, playerId) {
  if (!panel) return;

  const rankWrap = panel.querySelector(`[data-draft-player-rank="${playerId}"]`);
  if (!rankWrap) return;

  const tier = getDraftPlayerRankTier(playerId);
  const normalizedTier = tier || {
    id: DRAFT_DEFAULT_RANK_ID,
    label: `Rank ${DRAFT_DEFAULT_RANK_ID}`,
    rankNumber: Number(DRAFT_DEFAULT_RANK_ID),
    badge: window.OUTRA_RANKS?.placeholderBadge || '/docs/art/ranks/20.png',
  };
  const signature = [
    String(normalizedTier.id || ''),
    String(normalizedTier.badge || ''),
    String(normalizedTier.label || normalizedTier.name || ''),
  ].join('|');

  if (rankWrap.dataset.rankSignature !== signature) {
    rankWrap.dataset.rankSignature = signature;
    rankWrap.innerHTML = renderRankBadgeDisplay(normalizedTier, { size: 52 });
    bindRankBadgeDisplayFallbacks(rankWrap);
  }
}

function renderDraftPlayerPanel(playerId, activePlayer, activeIndex, order, isComplete) {
  const panel = document.querySelector(`[data-draft-player-panel="${playerId}"]`);
  if (!panel) return;

  const localPlayerId = draftState.localPlayerId || 'A';
  const picks = Array.isArray(draftState.picks?.[playerId]) ? draftState.picks[playerId] : [];
  const isActive = !isComplete && activePlayer === playerId;
  const isLocal = localPlayerId === playerId;
  const isLocked = picks.length >= 3 || isComplete;

  panel.classList.toggle('is-active', isActive);
  panel.classList.toggle('is-local', isLocal);
  panel.classList.toggle('is-complete', isLocked);
  syncDraftPlayerAvatar(panel, playerId);
  syncDraftPlayerRankBadge(panel, playerId);

  const metaEl = panel.querySelector(`[data-draft-player-meta="${playerId}"]`);
  if (metaEl) {
    const displayName = getDraftPlayerDisplayName(playerId);
    metaEl.textContent = isLocal ? `${displayName} (You)` : displayName;
  }

  const stateEl = panel.querySelector(`[data-draft-player-state="${playerId}"]`);
  if (stateEl) {
    let stateText = 'WAITING';
    if (isActive) {
      stateText = 'PICKING';
    } else if (isLocked) {
      stateText = 'LOCKED';
    } else {
      const nextTurn = order.findIndex((slot, idx) => idx > activeIndex && slot === playerId);
      stateText = nextTurn === -1 ? 'DONE' : `UP ${nextTurn + 1}`;
    }
    stateEl.textContent = stateText;
  }

  for (let slotIndex = 0; slotIndex < 3; slotIndex += 1) {
    const slotEl = panel.querySelector(`[data-draft-player-slot="${playerId}-${slotIndex}"]`);
    if (!slotEl) continue;

    const spellId = picks[slotIndex];
    const spellToken = spellId ? String(spellId) : '';
    slotEl.classList.toggle('filled', !!spellId);
    slotEl.classList.toggle('empty', !spellId);

    if (slotEl.dataset.spellId !== spellToken) {
      if (spellId) {
        const icon = (SPELL_DEFS[spellId] && SPELL_DEFS[spellId].icon) ? SPELL_DEFS[spellId].icon : '✦';
        const label = getDraftUiSpellLabel(spellId);
        slotEl.innerHTML = `<span class="draftPickIcon">${escapeHtml(icon)}</span><span class="draftPickName">${escapeHtml(label)}</span>`;
        slotEl.setAttribute('title', label);
      } else {
        slotEl.innerHTML = '<span class="draftPickPlaceholder">Empty</span>';
        slotEl.removeAttribute('title');
      }
      slotEl.dataset.spellId = spellToken;
    }

    if (spellId) {
      syncDraftPickSlotVisual(slotEl, spellId);
    } else {
      delete slotEl.dataset.spellIconPath;
    }
  }
}

function getDraftSpellPoolEntry(spellId) {
  const normalizedId = String(spellId || '').trim().toLowerCase();
  if (!normalizedId) return null;
  const pool = draftState.spellPool && typeof draftState.spellPool === 'object'
    ? draftState.spellPool
    : {};
  const entry = pool[normalizedId];
  if (!entry || typeof entry !== 'object') return null;
  const remainingCopies = Number(entry.remainingCopies);
  const totalCopies = Number(entry.totalCopies);
  const remaining = Number.isFinite(remainingCopies) ? Math.max(0, remainingCopies) : 0;
  const total = Number.isFinite(totalCopies) ? Math.max(remaining, totalCopies) : remaining;
  return {
    id: normalizedId,
    remainingCopies: remaining,
    totalCopies: total
  };
}

function requestMultiplayerDraftPick(spellId) {
  const api = window.outraMultiplayer;
  if (!api || typeof api.requestDraftPick !== 'function') return false;
  const normalizedSpellId = toUiSpellFromMultiplayer(spellId);
  const localPlayerId = normalizeDraftPlayerId(draftState.localPlayerId || 'A');
  if (normalizedSpellId) {
    draftUiSpellFxState.pendingSpellId = normalizedSpellId;
    draftUiSpellFxState.pendingPlayerId = localPlayerId;
    draftUiSpellFxState.pendingStartedAt = performance.now();
    draftUiSpellFxState.hoverSpellId = normalizedSpellId;
    draftUiSpellFxState.hoverStartedAt = performance.now();
  }
  api.requestDraftPick(spellId);
  return true;
}

function renderDraftSpellPoolUi({ isDraft, isComplete, activePlayer, localPlayerId, multiplayerSnapshot }) {
  if (!draftSpellPoolDockEl || !draftSpellPoolGridEl) return;
  const isMultiplayerDraft = !!(multiplayerSnapshot && multiplayerSnapshot.isDraftActive);
  const showPool = isDraft && isMultiplayerDraft;

  draftSpellPoolDockEl.classList.toggle('show', showPool);
  draftSpellPoolDockEl.setAttribute('aria-hidden', showPool ? 'false' : 'true');
  if (!showPool) {
    draftSpellPoolDockEl.classList.remove('is-local-turn', 'is-opponent-turn');
    if (isMultiplayerDraft || !!multiplayerSnapshot?.active) {
      draftState.holdSpellId = null;
      draftState.holdTime = 0;
    }
    return;
  }

  const canPickNow = !isComplete && activePlayer === localPlayerId;
  const nowMs = performance.now();
  const myPicks = new Set(
    (Array.isArray(draftState.picks?.[localPlayerId]) ? draftState.picks[localPlayerId] : [])
      .map((spellId) => String(spellId || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const picksA = Array.isArray(draftState.picks?.A) ? draftState.picks.A : [];
  const picksB = Array.isArray(draftState.picks?.B) ? draftState.picks.B : [];
  const pickCountBySpellA = {};
  const pickCountBySpellB = {};
  picksA.forEach((spellId) => {
    const normalized = toUiSpellFromMultiplayer(spellId);
    if (!normalized) return;
    pickCountBySpellA[normalized] = (pickCountBySpellA[normalized] || 0) + 1;
  });
  picksB.forEach((spellId) => {
    const normalized = toUiSpellFromMultiplayer(spellId);
    if (!normalized) return;
    pickCountBySpellB[normalized] = (pickCountBySpellB[normalized] || 0) + 1;
  });

  const spellOrder = Array.isArray(draftState.spellOrder) && draftState.spellOrder.length
    ? draftState.spellOrder
    : ['hook', 'blink', 'shield', 'charge', 'shock', 'gust', 'wall', 'rewind'];
  const normalizedOrder = spellOrder
    .map((spellId) => toUiSpellFromMultiplayer(spellId))
    .filter(Boolean);

  const signature = normalizedOrder.join('|');
  if (!draftSpellPoolBuilt || draftSpellPoolGridEl.dataset.signature !== signature) {
    draftSpellPoolGridEl.innerHTML = '';
    draftSpellPoolButtons.clear();
    normalizedOrder.forEach((spellId) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'draftSpellPoolBtn';
      button.dataset.spellId = spellId;
      button.innerHTML = `
        <span class="draftSpellPoolOrb" aria-hidden="true">
          <span class="draftSpellPoolOrbGlow"></span>
          <span class="draftSpellPoolOrbCore">
            <img class="draftSpellPoolOrbIcon" alt="${escapeHtml(getDraftUiSpellLabel(spellId))}" decoding="async" loading="lazy" />
            <span class="draftSpellPoolOrbFallback">${escapeHtml((SPELL_DEFS[spellId] && SPELL_DEFS[spellId].icon) ? SPELL_DEFS[spellId].icon : '✦')}</span>
          </span>
          <span class="draftSpellPoolChannelRing"></span>
        </span>
        <span class="draftSpellPoolBtnMeta">
          <span class="draftSpellPoolBtnName">${escapeHtml(getDraftUiSpellLabel(spellId))}</span>
          <span class="draftSpellPoolBtnCount">0/0 copies</span>
        </span>
        <span class="draftSpellPoolBtnOwner" aria-hidden="true"></span>
      `;
      button.addEventListener('mouseenter', () => {
        draftUiSpellFxState.hoverSpellId = spellId;
        draftUiSpellFxState.hoverStartedAt = performance.now();
      });
      button.addEventListener('mouseleave', () => {
        if (draftUiSpellFxState.hoverSpellId !== spellId) return;
        draftUiSpellFxState.hoverSpellId = '';
        draftUiSpellFxState.hoverStartedAt = 0;
      });
      button.addEventListener('focus', () => {
        draftUiSpellFxState.hoverSpellId = spellId;
        draftUiSpellFxState.hoverStartedAt = performance.now();
      });
      button.addEventListener('blur', () => {
        if (draftUiSpellFxState.hoverSpellId !== spellId) return;
        draftUiSpellFxState.hoverSpellId = '';
        draftUiSpellFxState.hoverStartedAt = 0;
      });
      button.addEventListener('click', () => {
        requestMultiplayerDraftPick(spellId);
      });
      draftSpellPoolButtons.set(spellId, button);
      draftSpellPoolGridEl.appendChild(button);

      const orbIconEl = button.querySelector('.draftSpellPoolOrbIcon');
      const orbFallbackEl = button.querySelector('.draftSpellPoolOrbFallback');
      const iconPath = getDraftUiSpellIconPath(spellId);
      if (orbIconEl) {
        if (!iconPath) {
          orbIconEl.remove();
          if (orbFallbackEl) orbFallbackEl.style.display = 'inline-flex';
        } else {
          orbIconEl.src = iconPath;
          orbIconEl.addEventListener('error', () => {
            orbIconEl.remove();
            if (orbFallbackEl) orbFallbackEl.style.display = 'inline-flex';
          }, { once: true });
          orbIconEl.addEventListener('load', () => {
            if (orbFallbackEl) orbFallbackEl.style.display = 'none';
          }, { once: true });
        }
      }
    });
    draftSpellPoolBuilt = true;
    draftSpellPoolGridEl.dataset.signature = signature;
  }

  normalizedOrder.forEach((spellId) => {
    const button = draftSpellPoolButtons.get(spellId);
    if (!button) return;
    const entry = getDraftSpellPoolEntry(spellId);
    const remaining = entry ? entry.remainingCopies : 0;
    const total = entry ? entry.totalCopies : 0;
    const alreadyPicked = myPicks.has(spellId);
    const disabled = !canPickNow || remaining <= 0 || alreadyPicked;

    button.disabled = disabled;
    button.classList.toggle('is-pickable', !disabled);
    button.classList.toggle('is-disabled', remaining <= 0);
    button.classList.toggle('is-picked', alreadyPicked);
    button.classList.toggle('is-active-turn', canPickNow && !disabled);

    const countEl = button.querySelector('.draftSpellPoolBtnCount');
    if (countEl) countEl.textContent = `${remaining}/${total} copies`;

    const ownerEl = button.querySelector('.draftSpellPoolBtnOwner');
    const ownerA = Number(pickCountBySpellA[spellId]) || 0;
    const ownerB = Number(pickCountBySpellB[spellId]) || 0;
    const ownerText = ownerA > 0 && ownerB > 0 ? 'A+B' : ownerA > 0 ? 'A' : ownerB > 0 ? 'B' : '';
    if (ownerEl) {
      ownerEl.textContent = ownerText;
      ownerEl.classList.toggle('has-owner', !!ownerText);
      ownerEl.classList.toggle('owner-a', ownerText === 'A');
      ownerEl.classList.toggle('owner-b', ownerText === 'B');
      ownerEl.classList.toggle('owner-ab', ownerText === 'A+B');
    }

    const recentlyPickedAt = Number(draftSpellRecentPickAt.get(spellId)) || 0;
    const justPicked = recentlyPickedAt > 0 && (nowMs - recentlyPickedAt) <= 760;
    button.classList.toggle('is-just-picked', justPicked);
    if (!justPicked && recentlyPickedAt > 0) {
      draftSpellRecentPickAt.delete(spellId);
    }

    const pendingChannel = draftUiSpellFxState.pendingSpellId === spellId
      && (nowMs - Number(draftUiSpellFxState.pendingStartedAt || 0)) <= 900;
    const hoverChannel = !pendingChannel
      && draftUiSpellFxState.hoverSpellId === spellId
      && canPickNow
      && !disabled;
    const isChanneling = pendingChannel || hoverChannel;
    button.classList.toggle('is-channeling', isChanneling);

    let channelRatio = 0;
    if (pendingChannel) {
      channelRatio = clampNumber((nowMs - Number(draftUiSpellFxState.pendingStartedAt || 0)) / 540, 0.05, 1);
    } else if (hoverChannel) {
      channelRatio = clampNumber((nowMs - Number(draftUiSpellFxState.hoverStartedAt || 0)) / 760, 0.08, 0.82);
    }
    button.style.setProperty('--draft-channel-progress', String(channelRatio.toFixed(3)));
  });

  draftSpellPoolDockEl.classList.toggle('is-local-turn', canPickNow && !isComplete);
  draftSpellPoolDockEl.classList.toggle('is-opponent-turn', !canPickNow && !isComplete);

  let channelSpellId = '';
  let channelRatio = 0;
  const pendingAge = nowMs - Number(draftUiSpellFxState.pendingStartedAt || 0);
  const pendingIsFresh = !!draftUiSpellFxState.pendingSpellId && pendingAge <= 900;
  if (pendingIsFresh) {
    channelSpellId = draftUiSpellFxState.pendingSpellId;
    channelRatio = clampNumber(pendingAge / 540, 0.08, 1);
  } else if (canPickNow && draftUiSpellFxState.hoverSpellId) {
    const hoverAge = nowMs - Number(draftUiSpellFxState.hoverStartedAt || 0);
    channelSpellId = draftUiSpellFxState.hoverSpellId;
    channelRatio = clampNumber(hoverAge / 760, 0.10, 0.82);
  }
  if (pendingAge > 1200 && draftUiSpellFxState.pendingSpellId) {
    draftUiSpellFxState.pendingSpellId = '';
    draftUiSpellFxState.pendingPlayerId = '';
    draftUiSpellFxState.pendingStartedAt = 0;
  }
  draftState.holdSpellId = channelSpellId || null;
  draftState.holdTime = channelSpellId
    ? Math.max(0, Math.min(Number(draftState.holdDuration) || 0.6, (Number(draftState.holdDuration) || 0.6) * channelRatio))
    : 0;
}

function updateDraftOverlayUi(multiplayerSnapshot = null) {
  if (!draftOverlay) return;
  const snapshot = multiplayerSnapshot || getMultiplayerPresentationSnapshot();
  if (snapshot?.isDraftActive) {
    syncDraftStateFromMultiplayer(snapshot);
  }

  const isDraft = gameState === 'draft' || !!snapshot?.isDraftActive;
  draftOverlay.classList.toggle('show', isDraft);
  draftOverlay.setAttribute('aria-hidden', isDraft ? 'false' : 'true');
  if (!isDraft) {
    clearDraftUiSpellFxState();
    clearAllDraftEmoteToasts();
    if (draftSpellPoolDockEl) {
      draftSpellPoolDockEl.classList.remove('show');
      draftSpellPoolDockEl.classList.remove('is-local-turn', 'is-opponent-turn');
      draftSpellPoolDockEl.setAttribute('aria-hidden', 'true');
    }
    return;
  }

  ensureDraftEmoteBindings();
  syncDraftEmoteButtons();
  ensureDraftOrderUi();

  const isComplete = !!draftState.complete;
  const order = Array.isArray(draftState.order) && draftState.order.length
    ? draftState.order
    : ['A'];
  const activeIndex = Math.max(0, Math.min(order.length - 1, Number(draftState.activeIndex) || 0));
  const activePlayer = isComplete
    ? null
    : (order[activeIndex] || (draftState.localPlayerId || 'A'));
  const localPlayerId = draftState.localPlayerId || 'A';
  const turnNumber = activeIndex + 1;
  const timeLeft = Math.max(0, Number(draftState.timeLeft) || 0);
  const wholeSecondsLeft = isComplete ? 0 : Math.ceil(timeLeft);

  if (draftTurnBadgeEl) {
    draftTurnBadgeEl.classList.remove('local-turn', 'complete-turn');
    if (isComplete) {
      draftTurnBadgeEl.textContent = 'DRAFT COMPLETE';
      draftTurnBadgeEl.classList.add('complete-turn');
    } else {
      const isLocalTurn = activePlayer === localPlayerId;
      draftTurnBadgeEl.textContent = isLocalTurn ? 'YOUR TURN' : `PLAYER ${activePlayer} TURN`;
      draftTurnBadgeEl.classList.toggle('local-turn', isLocalTurn);
    }
  }

  if (draftTurnTextEl) {
    draftTurnTextEl.textContent = isComplete
      ? 'ALL PICKS LOCKED'
      : `TURN ${turnNumber}/${order.length} - PLAYER ${activePlayer} PICKING`;
  }

  if (draftCountdownEl) {
    draftCountdownEl.textContent = String(wholeSecondsLeft);
  }

  if (draftTimerCardEl) {
    draftTimerCardEl.classList.remove('timer-mid', 'timer-low');
    if (!isComplete) {
      if (timeLeft <= 3) {
        draftTimerCardEl.classList.add('timer-low');
      } else if (timeLeft <= 6) {
        draftTimerCardEl.classList.add('timer-mid');
      }
    }
  }

  if (draftHelperTextEl) {
    draftHelperTextEl.textContent = isComplete
      ? 'Starting match...'
      : (activePlayer === localPlayerId
          ? 'Hover ~1s or click a spell to lock your pick'
          : `Waiting for Player ${activePlayer}`);
  }

  if (draftOrderProgressEl) {
    const currentPick = isComplete ? order.length : turnNumber;
    draftOrderProgressEl.textContent = `Pick ${currentPick}/${order.length}`;
  }

  for (const playerId of DRAFT_PLAYER_IDS) {
    renderDraftPlayerPanel(playerId, activePlayer, activeIndex, order, isComplete);
  }
  // Spell picking now happens on the original in-room draft grid (canvas),
  // so keep the auxiliary overlay spell-pool dock hidden.
  if (draftSpellPoolDockEl) {
    draftSpellPoolDockEl.classList.remove('show');
    draftSpellPoolDockEl.classList.remove('is-local-turn', 'is-opponent-turn');
    draftSpellPoolDockEl.setAttribute('aria-hidden', 'true');
  }

  if (!draftOrderListEl) return;
  draftOrderListEl.querySelectorAll('.draftOrderChip').forEach((chip, idx) => {
    const chipPlayer = chip.getAttribute('data-draft-order-player') || '';
    chip.classList.toggle('active', !isComplete && idx === activeIndex);
    chip.classList.toggle('done', isComplete || idx < activeIndex);
    chip.classList.toggle('upcoming', !isComplete && idx > activeIndex);
    chip.classList.toggle('local', chipPlayer === localPlayerId);
  });
}

function setMenuTab(tab) {
  activeMenuTab = tab;

  document.querySelectorAll('[data-menu-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.menuTab === tab);
  });

  document.querySelectorAll('.menuPage').forEach((page) => {
    page.classList.remove('active');
  });

  const page = document.getElementById('menu' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (page) page.classList.add('active');
}

function openStoreModal() {
  const modal = document.getElementById('storeModal');
  if (!modal) return;

  activeLobbyTab = 'store';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('storeOpen');

  document.querySelectorAll('[data-lobby-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lobbyTab === 'store');
  });

  renderStore();
  renderInventory();
}

function closeStoreModal() {
  const modal = document.getElementById('storeModal');
  if (!modal) return;

  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('storeOpen');

  activeLobbyTab = 'play';
  document.querySelectorAll('[data-lobby-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lobbyTab === 'play');
  });
}

function setLobbyTab(tab) {
  activeLobbyTab = tab;

  document.querySelectorAll('[data-lobby-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lobbyTab === tab);
  });

  if (tab === 'store') {
    openStoreModal();
    return;
  }

  closeStoreModal();

  document.querySelectorAll('.lobbyPage').forEach((page) => {
    page.classList.remove('active');
  });

  const page = document.getElementById('lobby' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (page) page.classList.add('active');

  if (tab === 'play') {
    drawLobbyPreview();
  }
}

// ── Mobile Controls Visibility ────────────────────────────────
function refreshMobileControls() {
  const snapshot = getMultiplayerPresentationSnapshot();
  const inArenaPhase = gameState === 'playing'
    || gameState === 'result'
    || !!snapshot?.isArenaActive;
  mobileControls.classList.toggle('show', isTouchDevice && inArenaPhase);
}

// ── Ranked Panel (replaces color chooser) ─────────────────────
function getRankStarsHtml(stars, totalStars) {
  const safeTotalStars = Math.max(0, Number(totalStars) || 0);
  if (safeTotalStars <= 0) return '';

  let html = '';
  for (let i = 0; i < safeTotalStars; i++) {
    html += `<span style="font-size:18px; letter-spacing:1px; color:${i < stars ? '#ffd36b' : 'rgba(255,255,255,0.24)'}">★</span>`;
  }
  return html;
}

function getRankLabelFromTier(tier) {
  if (typeof tier?.name === 'string' && tier.name.trim()) {
    return tier.name.trim();
  }

  if (typeof tier?.label === 'string' && tier.label.trim()) {
    const rawLabel = tier.label.trim();
    const emDashSplit = rawLabel.split('\u2014');
    if (emDashSplit.length > 1) {
      const suffix = emDashSplit.slice(1).join('\u2014').trim();
      if (suffix) return suffix;
    }
    const cleaned = rawLabel.replace(/^Rank\s+\d+\s*[-:]\s*/i, '').trim();
    return cleaned || rawLabel;
  }

  return 'Unranked';
}

function getRankBadgeAssetPath(tier) {
  if (typeof tier?.badge === 'string' && tier.badge) return tier.badge;
  const fromConfig = window.OUTRA_RANKS?.getById?.(tier?.id)?.badge;
  if (typeof fromConfig === 'string' && fromConfig) return fromConfig;
  return window.OUTRA_RANKS?.placeholderBadge || '/docs/art/ranks/20.png';
}

function getRankBadgeFallbackToken(tier) {
  if (Number.isFinite(Number(tier?.rankNumber))) return String(Number(tier.rankNumber));
  return 'M';
}

function renderRankBadgeDisplay(tier, options = {}) {
  const size = Math.max(24, Number(options.size) || 64);
  const badgePath = escapeHtml(getRankBadgeAssetPath(tier));
  const label = escapeHtml(String(tier?.label || tier?.name || 'Rank'));
  const fallbackToken = escapeHtml(getRankBadgeFallbackToken(tier));

  return `
    <div class="rankBadge rankBadgeDisplay" style="width:${size}px; height:${size}px;" aria-label="${label}">
      <img
        class="rankIcon rankBadgeDisplayIcon"
        src="${badgePath}"
        alt="${label} badge"
        data-rank-display-badge="1"
        decoding="async"
        draggable="false"
      />
      <span class="rankFallback rankBadgeDisplayFallback">${fallbackToken}</span>
    </div>
  `;
}

function bindRankBadgeDisplayFallbacks(scope) {
  const root = scope && typeof scope.querySelectorAll === 'function' ? scope : document;
  root.querySelectorAll('[data-rank-display-badge="1"]').forEach((img) => {
    if (img.dataset.bound === '1') return;
    img.dataset.bound = '1';

    const applyFallback = () => {
      const badge = img.closest('.rankBadgeDisplay');
      if (badge) badge.classList.add('rankIconFailed');
    };

    img.addEventListener('error', applyFallback);
    if (img.complete && img.naturalWidth === 0) {
      applyFallback();
    }

    const badge = img.closest('.rankBadgeDisplay');
    if (badge && badge.dataset.rankTooltipBound !== '1') {
      badge.dataset.rankTooltipBound = '1';

      badge.addEventListener('mouseenter', (e) => {
        if (isTouchDevice) return;
        showRankTooltip(e.clientX, e.clientY);
      });

      badge.addEventListener('mousemove', (e) => {
        if (isTouchDevice) return;
        positionRankTooltip(e.clientX, e.clientY);
      });

      badge.addEventListener('mouseleave', () => {
        hideRankTooltip();
      });
    }
  });
}

function buildRankedPanel() {
  if (!colorRow) return;

  const snapshot = getRankedSnapshot();
  const rankLabel = getRankLabelFromTier(snapshot.tier);
  const rankHeading = Number.isFinite(Number(snapshot?.tier?.rankNumber))
    ? `RANK ${Number(snapshot.tier.rankNumber)}`
    : 'MASTER';
  const tierStars = Math.max(0, Number(snapshot?.tier?.stars) || 0);
  const starProgressText = tierStars > 0
    ? (snapshot.promo ? 'Rank Up Match' : `${snapshot.stars}/${tierStars} stars`)
    : 'Master tier';
  const rankBadgePath = getRankBadgeAssetPath(snapshot.tier);
  const renderSignature = JSON.stringify({
    tierId: snapshot?.tier?.id || '',
    rankNumber: Number.isFinite(Number(snapshot?.tier?.rankNumber)) ? Number(snapshot.tier.rankNumber) : 'master',
    rankLabel,
    rankBadgePath,
    stars: Number(snapshot.stars) || 0,
    tierStars,
    promo: !!snapshot.promo,
    wins: Number(snapshot.wins) || 0,
    losses: Number(snapshot.losses) || 0,
  });

  if (renderSignature === rankedPanelLastSignature) return;
  rankedPanelLastSignature = renderSignature;
  hideRankTooltip();

  colorRow.innerHTML = `
    <div style="
      width:100%;
      max-width:100%;
      box-sizing:border-box;
      padding:12px 12px;
      border-radius:12px;
      background:linear-gradient(180deg, var(--inner-card-top), var(--inner-card-bottom));
      border:1px solid var(--inner-card-border);
      box-shadow:inset 0 1px 0 var(--inner-card-highlight), inset 0 -1px 0 rgba(0,0,0,0.26);
      color:#fff;
    ">
      <div class="rankHeadingHighlight">${escapeHtml(rankHeading)}</div>

      <div style="display:flex; align-items:center; gap:14px;">
        ${renderRankBadgeDisplay(snapshot.tier, { size: 64 })}

        <div style="min-width:0; flex:1;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px;">
            <div style="font-size:18px; font-weight:800; line-height:1.2;">${escapeHtml(rankLabel)}</div>
          </div>

          <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
            <div>${getRankStarsHtml(snapshot.stars, tierStars)}</div>
            <div style="font-size:12px; opacity:.78;">
              ${starProgressText}
            </div>
          </div>

<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
  <div style="font-size:12px; opacity:.78;">W ${snapshot.wins} • L ${snapshot.losses}</div>
</div>
      </div>
    </div>
  `;

  bindRankBadgeDisplayFallbacks(colorRow);
}

// ── Keybinds UI ───────────────────────────────────────────────
function buildKeybindsUI() {
  bindList.innerHTML = '';
  Object.keys(bindLabels).forEach(action => {
    const row = document.createElement('div');
    row.className = 'bindRow';

    const label = document.createElement('div');
    label.textContent = bindLabels[action];

    const btn = document.createElement('button');
    btn.className = 'secondary bindBtn' + (waitingForBind === action ? ' waiting' : '');
    btn.textContent = waitingForBind === action ? 'Press a key...' : prettyKey(keybinds[action]);
    btn.addEventListener('click', () => {
      waitingForBind = action;
      buildKeybindsUI();
    });

    row.appendChild(label);
    row.appendChild(btn);
    bindList.appendChild(row);
  });
}

// ── Leaderboard ───────────────────────────────────────────────
function renderLeaderboard() {
  const entries = getLeaderboard();
  const topEntries = entries.slice(0, 5);
  const signature = topEntries.map((entry, i) => `${i + 1}:${entry.name}:${entry.points}`).join('|') || '__empty__';

  if (signature === leaderboardLastSignature) return;
  leaderboardLastSignature = signature;

  if (!entries.length) {
    leaderboardList.innerHTML = '<div class="subtle">No entries yet. Win a match to get 3 points.</div>';
    return;
  }

  const getRankBadgeHtml = (rank) => {
    if (rank >= 1 && rank <= 3) {
      const status = leaderboardRankIconStatus[rank];
      if (status === 'failed') {
        return `
          <div class="rankBadge rankDefault" aria-label="Rank ${rank}">
            <span class="rankFallback">${rank}</span>
          </div>
        `;
      }

      return `
        <div class="rankBadge rankIconBadge rankIconBadge--${rank}" aria-label="Rank ${rank}">
          <img
            class="rankIcon"
            src="${LEADERBOARD_RANK_ICON_PATHS[rank]}"
            alt="Rank ${rank} icon"
            data-rank-icon="${rank}"
            decoding="async"
            draggable="false"
          />
          <span class="rankFallback">${rank}</span>
        </div>
      `;
    }

    return `
      <div class="rankBadge rankDefault" aria-label="Rank ${rank}">
        <span class="rankFallback">${rank}</span>
      </div>
    `;
  };

  leaderboardList.innerHTML = topEntries.map((entry, i) => {
    const rowClass = i === 0 ? 'aaaLbRow aaaLbRow--top1' : 'aaaLbRow';
    return `
      <div class="${rowClass}">
        ${getRankBadgeHtml(i + 1)}
        <div class="lbMeta">
          <div class="lbName">${escapeHtml(entry.name)}</div>
          <div class="lbPoints">${entry.points} pts</div>
        </div>
      </div>
    `;
  }).join('');

  leaderboardList.querySelectorAll('.rankIcon').forEach((img) => {
    if (img.dataset.bound === '1') return;
    img.dataset.bound = '1';
    const applyFallback = () => {
      const rank = Number(img.dataset.rankIcon);
      if (rank >= 1 && rank <= 3) {
        leaderboardRankIconStatus[rank] = 'failed';
      }
      const badge = img.closest('.rankIconBadge');
      if (badge) badge.classList.add('rankIconFailed');
    };
    img.addEventListener('error', applyFallback);
    if (img.complete && img.naturalWidth === 0) {
      applyFallback();
    }
  });
}

// ── Inventory ─────────────────────────────────────────────────
function equipItem(id) {
  const item = storeItems.find(x => x.id === id);
  if (!item || !profile.store[id]) return;

  if (item.type === 'hat') profile.equipped.hat = id;
  if (item.type === 'sweater') profile.equipped.sweater = true;
  if (item.type === 'boots') profile.equipped.boots = true;

  saveProfile();
  renderStore();
  renderInventory();
  drawLobbyPreview();
}

function unwearItem(id) {
  const item = storeItems.find(x => x.id === id);
  if (!item) return;

  if (item.type === 'hat' && profile.equipped.hat === id) profile.equipped.hat = null;
  if (item.type === 'sweater') profile.equipped.sweater = false;
  if (item.type === 'boots') profile.equipped.boots = false;

  saveProfile();
  renderStore();
  renderInventory();
  drawLobbyPreview();
}

function renderInventory() {
  const slotCount = 12;

  function isEquipped(item) {
    if (item.type === 'hat') return profile.equipped.hat === item.id;
    if (item.type === 'sweater') return !!profile.equipped.sweater;
    if (item.type === 'boots') return !!profile.equipped.boots;
    return false;
  }

  function getTypeTag(item) {
    if (item.type === 'hat') return 'Head';
    if (item.type === 'sweater') return 'Chest';
    if (item.type === 'boots') return 'Feet';
    return 'Item';
  }

  function getTypeEmblem(item) {
    if (item.type === 'hat') return 'H';
    if (item.type === 'sweater') return 'C';
    if (item.type === 'boots') return 'F';
    return 'I';
  }

  const typeOrder = { hat: 0, sweater: 1, boots: 2 };

  const ownedItems = storeItems
    .filter(item =>
      (item.type === 'hat' || item.type === 'sweater' || item.type === 'boots') &&
      profile.store[item.id]
    )
    .sort((a, b) => {
      const equippedDiff = Number(isEquipped(b)) - Number(isEquipped(a));
      if (equippedDiff !== 0) return equippedDiff;

      const typeDiff = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
      if (typeDiff !== 0) return typeDiff;

      return String(a.name).localeCompare(String(b.name));
    });

  const visibleItems = ownedItems.slice(0, slotCount);
  const hiddenCount = Math.max(0, ownedItems.length - slotCount);

  const slots = [];
  for (let i = 0; i < slotCount; i += 1) {
    const item = visibleItems[i];
    if (!item) {
      slots.push(
        `<div class="inventorySlot inventorySlotEmpty" aria-hidden="true"></div>`
      );
      continue;
    }

    const equipped = isEquipped(item);
    const actionAttr = equipped
      ? `data-inv-unwear="${item.id}"`
      : `data-inv-wear="${item.id}"`;

    slots.push(
      `<button class="inventorySlot${equipped ? ' equipped' : ''}" data-slot-type="${item.type}" type="button" ${actionAttr}>
        <span class="inventorySlotEmblem" aria-hidden="true">${getTypeEmblem(item)}</span>
        <span class="inventorySlotMeta">
          <span class="inventorySlotTag">${getTypeTag(item)}</span>
          <span class="inventorySlotName">${escapeHtml(item.name)}</span>
        </span>
        ${equipped ? '<span class="inventorySlotEquipped">EQ</span>' : ''}
      </button>`
    );
  }

  inventoryList.innerHTML = `
    <div class="inventoryGridWrap">
      <div class="inventoryGridHead">
        <span class="inventoryGridLabel">Bag</span>
        <span class="inventoryGridCount">${Math.min(ownedItems.length, slotCount)}/${slotCount}${hiddenCount ? ` +${hiddenCount}` : ''}</span>
      </div>
      <div class="inventoryGrid">${slots.join('')}</div>
    </div>
  `;

  inventoryList.querySelectorAll('[data-inv-wear]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (typeof soundClick === 'function') {
        soundClick();
      }
      equipItem(btn.getAttribute('data-inv-wear'));
    })
  );
  inventoryList.querySelectorAll('[data-inv-unwear]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (typeof soundClick === 'function') {
        soundClick();
      }
      unwearItem(btn.getAttribute('data-inv-unwear'));
    })
  );
}

// ── Store ─────────────────────────────────────────────────────
function renderStore() {
  const currencyIconPath = escapeHtml(
    window.OUTRA_3D_CONFIG?.lobbyArt?.currency || 'docs/art/Lobby/Currency.png'
  );

  if (wlkLobbyEl) {
    wlkLobbyEl.innerHTML = `
      <img src="${currencyIconPath}" alt="" class="currencyIcon storeCurrencyIcon" />
      <span class="storeCurrencyValue">${profile.wlk}</span>
    `;
  }
  if (wlkLobbyTopEl) wlkLobbyTopEl.textContent = String(profile.wlk);

  storeList.innerHTML = storeItems.map(item => {
    const owned = !!profile.store[item.id];
    const canBuy = profile.wlk >= item.cost && !owned;
    let actionHtml = '';

    if (!owned) {
      actionHtml = `<button class="secondary" data-store-id="${item.id}" ${canBuy ? '' : 'disabled'}>Buy</button>`;
    } else if (item.type === 'hat') {
      const wearing = profile.equipped.hat === item.id;
      actionHtml = `<div>
        <button class="secondary" data-wear-id="${item.id}">${wearing ? 'Equiped' : 'Equip'}</button>
        ${wearing ? ` <button class="secondary" data-unwear-id="${item.id}">Unequip</button>` : ''}
      </div>`;
    } else if (item.type === 'sweater') {
      const wearing = profile.equipped.sweater;
      actionHtml = `<div>
        <button class="secondary" data-wear-id="${item.id}">${wearing ? 'Equiped' : 'Equip'}</button>
        ${wearing ? ` <button class="secondary" data-unwear-id="${item.id}">Unequip</button>` : ''}
      </div>`;
    } else if (item.type === 'boots') {
      const wearing = profile.equipped.boots;
      actionHtml = `<div>
        <button class="secondary" data-wear-id="${item.id}">${wearing ? 'Equiped' : 'Equip'}</button>
        ${wearing ? ` <button class="secondary" data-unwear-id="${item.id}">Unequip</button>` : ''}
      </div>`;
    } else if (item.type === 'emote') {
      actionHtml = '<button class="secondary" disabled>Unlocked</button>';
    } else {
      actionHtml = '<button class="secondary" disabled>Owned</button>';
    }

    return `<div class="storeRow">
      <div>
        <div class="storeRowTitleLine">
          <span class="storeRowTitle">${escapeHtml(item.name)}</span>
          <span class="storePriceTag">
            <img src="${currencyIconPath}" alt="" class="storePriceIcon" />
            <span>${item.cost}</span>
          </span>
        </div>
        <div class="hint">${escapeHtml(item.description)}</div>
      </div>
      ${actionHtml}
    </div>`;
  }).join('');

  storeList.querySelectorAll('[data-store-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-store-id');
      const item = storeItems.find(x => x.id === id);
      if (!item || profile.wlk < item.cost || profile.store[id]) return;

      profile.wlk -= item.cost;
      item.apply(profile);
      saveProfile();
      renderStore();
      renderInventory();
      drawLobbyPreview();
      updateHud();
      updateSkillCooldownButtons();
      updateMusicVolumeUI();
    });
  });

  storeList.querySelectorAll('[data-wear-id]').forEach(btn =>
    btn.addEventListener('click', () => equipItem(btn.getAttribute('data-wear-id')))
  );
  storeList.querySelectorAll('[data-unwear-id]').forEach(btn =>
    btn.addEventListener('click', () => unwearItem(btn.getAttribute('data-unwear-id')))
  );
}

// ── Spell Icons ───────────────────────────────────────────────
function applySpellIconsDesktop() {
  Object.entries(SPELL_ICONS).forEach(([key, path]) => {
    const cell = document.getElementById(`dspell-${key}`);
    if (!cell) return;

    let img = cell.querySelector('img.spellIcon');
    if (!img) {
      img = document.createElement('img');
      img.className = 'spellIcon';
      img.alt = '';
      img.style.position = 'absolute';
      img.style.inset = '0';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '16px';
      img.style.pointerEvents = 'none';
      img.style.zIndex = '0';
      cell.appendChild(img);
    }

    img.src = path;
  });

  bindDesktopSpellTooltips();
}

// ── HUD ───────────────────────────────────────────────────────
function triggerReadyFlash(el) {
  if (!el) return;
  el.classList.remove('readyFlash');
  void el.offsetWidth;
  el.classList.add('readyFlash');
}

function updateSkillCooldownButtons(multiplayerSnapshot = null) {
  const snapshot = multiplayerSnapshot || getMultiplayerPresentationSnapshot();
  const multiplayerArena = snapshot?.isArenaActive ? snapshot.arena : null;
  const now = performance.now() / 1000;
  const cooldowns = {};
  const effectiveLoadout = Array.isArray(multiplayerArena?.loadout) && multiplayerArena.loadout.length
    ? multiplayerArena.loadout
    : activeSpellLoadout;
  const availableSpells = new Set(effectiveLoadout);

  Object.keys(skillButtons).forEach((spellId) => {
    const isAvailable = spellId === 'fire' || availableSpells.has(spellId);
    const desktopCell = document.getElementById(`dspell-${spellId}`);
    const mobileBtn = skillButtons[spellId];

    if (desktopCell) {
      desktopCell.classList.toggle('spellDisabled', !isAvailable);
    }

    if (mobileBtn) {
      mobileBtn.classList.toggle('spellDisabled', !isAvailable);
      mobileBtn.disabled = !isAvailable;
    }
  });

  effectiveLoadout.forEach((spellId) => {
    const def = SPELL_DEFS[spellId];
    if (!def) return;
    if (multiplayerArena) {
      let cooldownValue = Math.max(0, Number(multiplayerArena.cooldownSecondsBySpell?.[spellId]) || 0);
      if (spellId === 'shield' && multiplayerArena.shieldActive) {
        cooldownValue = Math.max(
          cooldownValue,
          Math.max(0, Number(multiplayerArena.shieldRemainingSeconds) || 0)
        );
      }
      cooldowns[spellId] = cooldownValue;
      return;
    }

    if (spellId === 'shield' && now < player.shieldUntil) {
      cooldowns[spellId] = player.shieldUntil - now;
    } else {
      cooldowns[spellId] = Math.max(0, (player[def.cooldownKey] || 0) - now);
    }
  });

  Object.entries(skillButtons).forEach(([key, btn]) => {
    if (!btn) return;

    const cdOverlay = btn.querySelector('.mobileBtnCooldown');
    if (!cdOverlay) return;

    const cd = cooldowns[key] || 0;
    const wasOnCooldown = btn.classList.contains('onCooldown');

    if (cd > 0.02) {
      btn.classList.add('onCooldown');
      cdOverlay.textContent = String(Math.ceil(cd));
      btn.dataset.readyFlashed = '0';
    } else {
      btn.classList.remove('onCooldown');
      cdOverlay.textContent = '';

      if (wasOnCooldown && btn.dataset.readyFlashed !== '1') {
        triggerReadyFlash(btn);
        btn.dataset.readyFlashed = '1';
      }
    }
  });

  Object.entries(cooldowns).forEach(([key, cd]) => {
    const cell = document.getElementById(`dspell-${key}`);
    const cdEl = document.getElementById(`dcd-${key}`);
    if (!cell || !cdEl) return;

    const wasOnCooldown = cell.classList.contains('onCooldown');

    if (cd > 0.02) {
      cell.classList.add('onCooldown');
      cdEl.textContent = String(Math.ceil(cd));
      cell.dataset.readyFlashed = '0';
    } else {
      cell.classList.remove('onCooldown');
      cdEl.textContent = '';

      if (wasOnCooldown && cell.dataset.readyFlashed !== '1') {
        triggerReadyFlash(cell);
        cell.dataset.readyFlashed = '1';
      }
    }
  });

  const keyMap = {
    hook: 'dkey-hook',
    blink: 'dkey-blink',
    shield: 'dkey-shield',
    charge: 'dkey-charge',
    shock: 'dkey-shock',
    gust: 'dkey-gust',
    wall: 'dkey-wall',
    rewind: 'dkey-rewind'
  };

  const bindMap = {
    hook: keybinds.hook,
    blink: keybinds.teleport,
    shield: keybinds.shield,
    charge: keybinds.charge,
    shock: keybinds.shock,
    gust: keybinds.gust,
    wall: keybinds.wall,
    rewind: keybinds.rewind
  };

  if (multiplayerArena) {
    const draftedSpells = effectiveLoadout.filter((spellId) => spellId !== 'fire').slice(0, 3);
    const keyBySpell = {
      [draftedSpells[0]]: 'Q',
      [draftedSpells[1]]: 'E',
      [draftedSpells[2]]: 'R'
    };
    Object.entries(keyMap).forEach(([skill, elId]) => {
      const el = document.getElementById(elId);
      if (!el) return;
      const mappedKey = keyBySpell[skill] || '—';
      el.textContent = mappedKey;
    });
    const fireKeyEl = document.querySelector('#dspell-fire .deskSpellKey');
    if (fireKeyEl) fireKeyEl.textContent = 'Space';
  } else {
    Object.entries(keyMap).forEach(([skill, elId]) => {
      const el = document.getElementById(elId);
      if (el) el.textContent = prettyKey(bindMap[skill]);
    });
    const fireKeyEl = document.querySelector('#dspell-fire .deskSpellKey');
    if (fireKeyEl) fireKeyEl.textContent = 'M1';
  }
}

function syncArenaSpellBarLayout(multiplayerSnapshot = null) {
  const spellBar = document.getElementById('desktopSpellBar');
  if (!spellBar) return;

  const snapshot = multiplayerSnapshot || getMultiplayerPresentationSnapshot();
  const inArenaPhase = gameState === 'playing'
    || gameState === 'result'
    || !!snapshot?.isArenaActive;
  const effectiveLoadout = Array.isArray(snapshot?.arena?.loadout) && snapshot.arena.loadout.length
    ? snapshot.arena.loadout
    : activeSpellLoadout;
  const isDraftLoadout = Array.isArray(effectiveLoadout)
    && effectiveLoadout.includes('fire')
    && effectiveLoadout.length <= 4;
  const visibleDraftSpells = new Set(
    isDraftLoadout
      ? effectiveLoadout.filter((spellId) => spellId !== 'fire').slice(0, 3)
      : []
  );

  const desktopSpellOrder = ['fire', 'hook', 'blink', 'shield', 'charge', 'shock', 'gust', 'wall', 'rewind'];
  for (const spellId of desktopSpellOrder) {
    const cell = document.getElementById(`dspell-${spellId}`);
    if (!cell) continue;

    if (!inArenaPhase) {
      cell.style.display = '';
      continue;
    }

    if (!isDraftLoadout) {
      cell.style.display = '';
      continue;
    }

    const shouldShow = spellId === 'fire' || visibleDraftSpells.has(spellId);
    cell.style.display = shouldShow ? '' : 'none';
  }

  spellBar.classList.toggle('draftSpellBarOnlyPicks', inArenaPhase && isDraftLoadout);
}

function updateHud() {
  const multiplayerSnapshot = getMultiplayerPresentationSnapshot();
  const multiplayerMatchFlowActive = !!multiplayerSnapshot?.active
    && (!!multiplayerSnapshot?.isDraftActive || !!multiplayerSnapshot?.isArenaActive);
  if (document?.body) {
    document.body.classList.toggle('mpMatchFlowActive', multiplayerMatchFlowActive);
  }
  const inArenaPhase = gameState === 'playing'
    || gameState === 'result'
    || !!multiplayerSnapshot?.isArenaActive;
  updateDraftOverlayUi(multiplayerSnapshot);

  applySpellIconsDesktop();

  hpEl.textContent = `HP: ${Math.ceil(player.hp)}` + (player.alive ? '' : ' (dead)');

  dummyHpEl.textContent = !dummyEnabled
    ? 'Dummy HP: removed'
    : dummy.alive
      ? `${dummyBehavior === 'standing' ? 'Standing Dummy' : 'Active Dummy'} HP: ${Math.ceil(dummy.hp)}`
      : `Dummy HP: dead (${dummy.deadReason})`;

  if (standingDummyBtn) {
    standingDummyBtn.textContent = dummyEnabled && dummyBehavior === 'standing'
      ? 'Standing Dummy On'
      : 'Start Standing Dummy';
  }

  if (activeDummyBtn) {
    activeDummyBtn.textContent = dummyEnabled && dummyBehavior === 'active'
      ? 'Active Dummy On'
      : 'Start Active Dummy';
  }

  if (removeDummyBtn) {
    removeDummyBtn.textContent = dummyEnabled ? 'Remove Dummy' : 'No Dummy';
  }

  if (hudToggleBtn) {
    hudToggleBtn.textContent = hudVisible ? 'Hide Info' : 'Show Info';
  }
  playerNameHudEl.textContent = `Name: ${player.name}`;
  if (lobbyHeroNameEl) {
    lobbyHeroNameEl.textContent = player.name || 'Player';
  }
  scoreHudEl.textContent = `Score: ${player.score}`;
  wlkHudEl.textContent = `WLK: ${profile.wlk}`;
  if (wlkTopbarEl) wlkTopbarEl.textContent = String(profile.wlk);
  roundTimerHudEl.textContent = `Shrink In: ${Math.ceil(arena.shrinkTimer)}s`;

  controlsHudEl.textContent = isTouchDevice
    ? 'Touch: Move stick | Pull skill and release to cast | Top-right Menu'
    : `Fire: Mouse1 | Hook: ${prettyKey(keybinds.hook)} | Teleport: ${prettyKey(keybinds.teleport)} | Shield: ${prettyKey(keybinds.shield)} | Charge: ${prettyKey(keybinds.charge)} | Shock: ${prettyKey(keybinds.shock)} | Gust: ${prettyKey(keybinds.gust)} | Wall: hold ${prettyKey(keybinds.wall)} and release | Rewind: ${prettyKey(keybinds.rewind)} | Menu: ${prettyKey(keybinds.menu)}`;

  musicToggleBtn.textContent = `Music: ${musicMuted ? 'Off' : 'On'}`;
  musicToggleBtn.className = musicMuted ? 'musicToggleOff' : 'musicToggleOn';
  updatePerformanceModeUI();
  hud.style.display = (inArenaPhase && hudVisible) ? 'block' : 'none';

  const spellBar = document.getElementById('desktopSpellBar');
  if (spellBar) spellBar.style.display = (inArenaPhase && !isTouchDevice) ? 'flex' : 'none';
  syncArenaSpellBarLayout(multiplayerSnapshot);

  updateSkillCooldownButtons(multiplayerSnapshot);

  if (gameState === 'lobby') {
    buildRankedPanel();
  }
}

// ── Aim Sensitivity UI ────────────────────────────────────────
function updateAimSensitivityUI() {
  const value = Math.min(1.4, Math.max(0.35, Number(profile.aimSensitivity) || 0.7));
  profile.aimSensitivity = value;

  if (aimSensitivitySlider) {
    aimSensitivitySlider.value = value.toFixed(2);
  }

  if (aimSensitivityValue) {
    aimSensitivityValue.textContent = `${value.toFixed(2)}x`;
  }
}

function updateMusicVolumeUI() {
  const value = Math.min(1, Math.max(0, Number(profile.musicVolume) || 0.38));
  profile.musicVolume = value;

  if (musicVolumeSlider) {
    musicVolumeSlider.value = value.toFixed(2);
  }

  if (musicVolumeValue) {
    musicVolumeValue.textContent = `${Math.round(value * 100)}%`;
  }
}

function updatePerformanceModeUI() {
  if (!performanceModeToggleBtn) return;
  const forced = typeof FORCE_ARENA_PERFORMANCE_MODE !== 'undefined' && !!FORCE_ARENA_PERFORMANCE_MODE;
  if (forced) {
    performanceModeToggleBtn.textContent = 'Performance Mode: On (Forced)';
    performanceModeToggleBtn.disabled = true;
    performanceModeToggleBtn.setAttribute('aria-disabled', 'true');
    return;
  }

  const enabled = !!profile.performanceMode;
  performanceModeToggleBtn.textContent = `Performance Mode: ${enabled ? 'On' : 'Off'}`;
  performanceModeToggleBtn.disabled = false;
  performanceModeToggleBtn.removeAttribute('aria-disabled');
}

// —— Lobby Depth FX (background parallax) ————————————————————————————————
const lobbyDepthFx = {
  initialized: false,
  enabled: !isTouchDevice,
  currentX: 0,
  currentY: 0,
  targetX: 0,
  targetY: 0,
  rafId: 0,
};

function queueLobbyDepthFrame() {
  if (lobbyDepthFx.rafId) return;
  lobbyDepthFx.rafId = requestAnimationFrame(stepLobbyDepthFx);
}

function setLobbyParallaxTargetFromPointer(clientX, clientY) {
  const nx = (clientX / Math.max(1, window.innerWidth)) - 0.5;
  const ny = (clientY / Math.max(1, window.innerHeight)) - 0.5;

  // Keep parallax subtle: roughly 3-5px at edges.
  lobbyDepthFx.targetX = Math.max(-5, Math.min(5, nx * 10));
  lobbyDepthFx.targetY = Math.max(-5, Math.min(5, ny * 10));
  queueLobbyDepthFrame();
}

function resetLobbyParallaxTarget() {
  lobbyDepthFx.targetX = 0;
  lobbyDepthFx.targetY = 0;
  queueLobbyDepthFrame();
}

function stepLobbyDepthFx() {
  lobbyDepthFx.rafId = 0;

  if (!overlay) return;

  if (!lobbyDepthFx.enabled || gameState !== 'lobby') {
    lobbyDepthFx.targetX = 0;
    lobbyDepthFx.targetY = 0;
  }

  lobbyDepthFx.currentX += (lobbyDepthFx.targetX - lobbyDepthFx.currentX) * 0.1;
  lobbyDepthFx.currentY += (lobbyDepthFx.targetY - lobbyDepthFx.currentY) * 0.1;

  overlay.style.setProperty('--lobby-bg-x', `${lobbyDepthFx.currentX.toFixed(2)}px`);
  overlay.style.setProperty('--lobby-bg-y', `${lobbyDepthFx.currentY.toFixed(2)}px`);

  const stillMoving =
    Math.abs(lobbyDepthFx.targetX - lobbyDepthFx.currentX) > 0.02 ||
    Math.abs(lobbyDepthFx.targetY - lobbyDepthFx.currentY) > 0.02 ||
    Math.abs(lobbyDepthFx.currentX) > 0.02 ||
    Math.abs(lobbyDepthFx.currentY) > 0.02;

  if (stillMoving) {
    queueLobbyDepthFrame();
  }
}

function initLobbyDepthEffects() {
  if (lobbyDepthFx.initialized) return;
  lobbyDepthFx.initialized = true;

  if (!overlay) return;

  overlay.addEventListener('pointermove', (e) => {
    if (!lobbyDepthFx.enabled || gameState !== 'lobby') return;
    setLobbyParallaxTargetFromPointer(e.clientX, e.clientY);
  }, { passive: true });

  overlay.addEventListener('pointerleave', () => {
    resetLobbyParallaxTarget();
  }, { passive: true });

  window.addEventListener('blur', () => {
    resetLobbyParallaxTarget();
  });

  window.addEventListener('resize', () => {
    resetLobbyParallaxTarget();
  });
}
