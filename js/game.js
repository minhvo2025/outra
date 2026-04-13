// ── Persistence ───────────────────────────────────────────────
function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({
    name: player.name,
    selectedColorIndex,
    keybinds,
    profile
  }));
}

function loadProfile() {
  try {
    let raw = localStorage.getItem(PROFILE_KEY);
    let usedLegacy = false;

    if (!raw) {
      raw = localStorage.getItem(LEGACY_PROFILE_KEY);
      usedLegacy = !!raw;
    }

    if (!raw) return;

    const data = JSON.parse(raw);

    if (data.name) player.name = String(data.name).slice(0, 16);

    if (Number.isInteger(data.selectedColorIndex)) {
      selectedColorIndex = data.selectedColorIndex;
    }

    if (data.keybinds && typeof data.keybinds === 'object') {
      keybinds = { ...defaultBinds, ...data.keybinds };
    }

if (data.profile && typeof data.profile === 'object') {
  profile.wlk = Number(data.profile.wlk) || 0;
  profile.musicMuted = !!data.profile.musicMuted;

  if (typeof data.profile.musicVolume === 'number') {
    profile.musicVolume = Math.min(1, Math.max(0, data.profile.musicVolume));
  }

  if (typeof data.profile.aimSensitivity === 'number') {
    profile.aimSensitivity = data.profile.aimSensitivity;
  }

  if (typeof data.profile.performanceMode === 'boolean') {
    profile.performanceMode = data.profile.performanceMode;
  }

  if (data.profile.ranked && typeof data.profile.ranked === 'object') {
        profile.ranked.mmr = Math.max(0, Number(data.profile.ranked.mmr) || 0);
        profile.ranked.wins = Math.max(0, Number(data.profile.ranked.wins) || 0);
        profile.ranked.losses = Math.max(0, Number(data.profile.ranked.losses) || 0);
        profile.ranked.zeroStarLossBuffer = Math.max(0, Number(data.profile.ranked.zeroStarLossBuffer) || 0);
      }

      profile.store = { ...profile.store, ...(data.profile.store || {}) };
      profile.equipped = { ...profile.equipped, ...(data.profile.equipped || {}) };
    }

    if (usedLegacy) {
      saveProfile();
    }
  } catch {}

musicMuted = profile.musicMuted;

if (typeof profile.musicVolume !== 'number') {
  profile.musicVolume = 0.38;
}
profile.musicVolume = Math.min(1, Math.max(0, profile.musicVolume));

if (typeof profile.aimSensitivity !== 'number') profile.aimSensitivity = 0.7;
if (typeof profile.performanceMode !== 'boolean') profile.performanceMode = false;
if (typeof FORCE_ARENA_PERFORMANCE_MODE !== 'undefined' && FORCE_ARENA_PERFORMANCE_MODE) {
  profile.performanceMode = true;
}
if (!profile.ranked) {
  profile.ranked = { mmr: 0, wins: 0, losses: 0, zeroStarLossBuffer: 0 };
}
}

// ── Leaderboard ───────────────────────────────────────────────
const CUSTOM_MOUSE_CURSOR_SRC = '/docs/art/mouse.png';
const CUSTOM_MOUSE_CURSOR_MAX_SIZE = 40;
const CUSTOM_MOUSE_CURSOR_ALPHA_THRESHOLD = 18;

function clampCursorNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getCursorCssVarName(mode) {
  if (mode === 'menu') return '--outra-cursor-menu';
  if (mode === 'pointer') return '--outra-cursor-pointer';
  if (mode === 'crosshair') return '--outra-cursor-crosshair';
  return '--outra-cursor-default';
}

function getCanvasCursorModeValue(mode = 'default') {
  const cssVarName = getCursorCssVarName(mode);
  const computed = getComputedStyle(document.documentElement).getPropertyValue(cssVarName).trim();
  if (computed) return computed;
  if (mode === 'menu') return 'pointer';
  if (mode === 'pointer') return 'pointer';
  if (mode === 'crosshair') return 'crosshair';
  return 'default';
}

function setCanvasCursorMode(mode = 'default') {
  if (!canvas) return;
  if (isTouchDevice) {
    canvas.style.cursor = 'default';
    return;
  }
  canvas.style.cursor = getCanvasCursorModeValue(mode);
}

function syncCursorPhaseClass() {
  if (typeof document === 'undefined' || !document.body) return;
  const isLobbyOrDraft = gameState === 'lobby' || gameState === 'draft';
  document.body.classList.toggle('cursorCustomLobbyDraft', isLobbyOrDraft);
}

function setCustomMouseCursorCssVars(dataUrl, hotspotX, hotspotY) {
  if (!dataUrl) return;

  const x = Math.max(0, Math.round(hotspotX));
  const y = Math.max(0, Math.round(hotspotY));
  const rootStyle = document.documentElement.style;
  const cursorBase = `url("${dataUrl}") ${x} ${y}`;

  rootStyle.setProperty('--outra-cursor-menu', `${cursorBase}, pointer`);
}

function findCursorImageMetrics(imageData, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let tipX = Number.POSITIVE_INFINITY;
  let tipY = Number.POSITIVE_INFINITY;
  let found = false;

  const pixels = imageData.data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha < CUSTOM_MOUSE_CURSOR_ALPHA_THRESHOLD) continue;

      found = true;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      if ((x + y) < (tipX + tipY)) {
        tipX = x;
        tipY = y;
      }
    }
  }

  if (!found) return null;

  return {
    minX,
    minY,
    maxX,
    maxY,
    tipX,
    tipY,
  };
}

function initCustomMouseCursor() {
  if (isTouchDevice || typeof document === 'undefined') return;

  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    const srcW = Math.max(1, img.naturalWidth || img.width || 1);
    const srcH = Math.max(1, img.naturalHeight || img.height || 1);

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = srcW;
    sourceCanvas.height = srcH;
    const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceCtx) return;

    sourceCtx.clearRect(0, 0, srcW, srcH);
    sourceCtx.drawImage(img, 0, 0, srcW, srcH);
    const imageData = sourceCtx.getImageData(0, 0, srcW, srcH);
    const metrics = findCursorImageMetrics(imageData, srcW, srcH);
    if (!metrics) return;

    const rawCropW = (metrics.maxX - metrics.minX + 1);
    const rawCropH = (metrics.maxY - metrics.minY + 1);
    const margin = Math.max(1, Math.round(Math.min(rawCropW, rawCropH) * 0.04));
    const cropX = Math.max(0, metrics.minX - margin);
    const cropY = Math.max(0, metrics.minY - margin);
    const cropW = Math.min(srcW - cropX, rawCropW + margin * 2);
    const cropH = Math.min(srcH - cropY, rawCropH + margin * 2);

    const scale = Math.min(1, CUSTOM_MOUSE_CURSOR_MAX_SIZE / Math.max(cropW, cropH));
    const outW = Math.max(8, Math.round(cropW * scale));
    const outH = Math.max(8, Math.round(cropH * scale));

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = outW;
    outputCanvas.height = outH;
    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) return;

    outputCtx.imageSmoothingEnabled = true;
    outputCtx.clearRect(0, 0, outW, outH);
    outputCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

    const hotspotX = clampCursorNumber(
      Math.round((metrics.tipX - cropX) * (outW / cropW)),
      0,
      outW - 1
    );
    const hotspotY = clampCursorNumber(
      Math.round((metrics.tipY - cropY) * (outH / cropH)),
      0,
      outH - 1
    );
    const cursorDataUrl = outputCanvas.toDataURL('image/png');

    setCustomMouseCursorCssVars(cursorDataUrl, hotspotX, hotspotY);

    const mode = gameState === 'playing'
      ? 'crosshair'
      : gameState === 'draft'
      ? 'pointer'
      : 'default';
    setCanvasCursorMode(mode);
  };
  img.src = CUSTOM_MOUSE_CURSOR_SRC;
}

function getLeaderboard() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    let usedLegacy = false;

    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      usedLegacy = !!raw;
    }

    if (!raw) return [];

    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : [];

    if (usedLegacy) {
      saveLeaderboard(entries);
    }

    return entries;
  } catch {
    return [];
  }
}

function saveLeaderboard(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function awardWinRewards(name) {
  const entries = getLeaderboard();
  const existing = entries.find(e => e.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    existing.points += 3;
  } else {
    entries.push({ name, points: 3 });
  }

  entries.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  saveLeaderboard(entries.slice(0, 20));

  player.score = (entries.find(e => e.name.toLowerCase() === name.toLowerCase()) || { points: 0 }).points;
  profile.wlk += 1;
  saveProfile();
  renderLeaderboard();
  renderStore();
  renderInventory();
}

function getPlayerPoints(name) {
  const entry = getLeaderboard().find(e => e.name.toLowerCase() === name.toLowerCase());
  return entry ? entry.points : 0;
}

// ── Ranked Helpers ────────────────────────────────────────────
function getRankProgressionTiers() {
  const external = window.OUTRA_RANKS?.progressionTiers;
  if (Array.isArray(external) && external.length) return external;
  return Array.isArray(RANKED_CONFIG?.tiers) && RANKED_CONFIG.tiers.length
    ? RANKED_CONFIG.tiers
    : [];
}

function getTierStarCount(tier) {
  if (!tier || tier.max === Infinity) return 0;
  const count = Number(tier.stars);
  if (Number.isFinite(count) && count >= 0) return Math.floor(count);
  return Math.max(0, Number(RANKED_CONFIG.promoStarCount) || 0);
}

function getRankTierByMmr(mmr) {
  const safeMmr = Math.max(0, Number(mmr) || 0);
  const tiers = getRankProgressionTiers();
  return tiers.find(t => safeMmr >= t.min && safeMmr <= t.max) || tiers[0];
}

function getRankTierIndexByMmr(mmr) {
  const tiers = getRankProgressionTiers();
  const tier = getRankTierByMmr(mmr);
  return Math.max(0, tiers.findIndex(t => t.key === tier.key));
}

function getStarsFromMmr(mmr) {
  const tier = getRankTierByMmr(mmr);
  const tierStars = getTierStarCount(tier);
  if (tier.max === Infinity || tierStars <= 0) return 0;

  const span = Math.max(1, (tier.max - tier.min + 1));
  const offset = Math.max(0, Math.min(span - 1, mmr - tier.min));
  const stars = Math.min(
    tierStars,
    Math.floor(offset / RANKED_CONFIG.mmrPerStar)
  );

  return stars;
}

function isPromoMatchByMmr(mmr) {
  const tier = getRankTierByMmr(mmr);
  const tierStars = getTierStarCount(tier);
  if (tier.max === Infinity || tierStars <= 0) return false;

  const offset = Math.max(0, mmr - tier.min);
  return offset >= (tierStars * RANKED_CONFIG.mmrPerStar);
}

function getRankedSnapshot() {
  const mmr = Math.max(0, Number(profile.ranked?.mmr) || 0);
  const tier = getRankTierByMmr(mmr);
  const stars = getStarsFromMmr(mmr);
  const promo = isPromoMatchByMmr(mmr);

  return {
    mmr,
    tier,
    tierIndex: getRankTierIndexByMmr(mmr),
    stars,
    promo,
    wins: Number(profile.ranked?.wins) || 0,
    losses: Number(profile.ranked?.losses) || 0,
    zeroStarLossBuffer: Number(profile.ranked?.zeroStarLossBuffer) || 0,
  };
}

function getRankedResultSummary(didWin, before, after, forcedDerank) {
  const parts = [];

  parts.push(`${didWin ? '+' : '-'}${didWin ? RANKED_CONFIG.winMmr : RANKED_CONFIG.lossMmr} MMR`);

  if (after.tier.key !== before.tier.key) {
    if (after.tierIndex > before.tierIndex) {
      parts.push(`PROMOTED TO ${after.tier.name.toUpperCase()}`);
    } else if (forcedDerank || after.tierIndex < before.tierIndex) {
      parts.push(`DERANKED TO ${after.tier.name.toUpperCase()}`);
    }
  } else if (after.promo && !before.promo) {
    parts.push('RANK UP MATCH');
  }

  return parts.join(' • ');
}

function applyRankedMatchResult(didWin) {
  if (!profile.ranked) {
    profile.ranked = { mmr: 0, wins: 0, losses: 0, zeroStarLossBuffer: 0 };
  }

  const before = getRankedSnapshot();

  if (didWin) {
    profile.ranked.wins += 1;
    profile.ranked.mmr += RANKED_CONFIG.winMmr;
    profile.ranked.zeroStarLossBuffer = 0;
  } else {
    profile.ranked.losses += 1;

    const atZeroStars = before.stars <= 0;
    if (atZeroStars) {
      profile.ranked.zeroStarLossBuffer += 1;
    } else {
      profile.ranked.zeroStarLossBuffer = 0;
    }

    profile.ranked.mmr = Math.max(0, profile.ranked.mmr - RANKED_CONFIG.lossMmr);
  }

  let forcedDerank = false;
  const afterLossRaw = getRankedSnapshot();

  if (!didWin) {
    const sameTier = afterLossRaw.tier.key === before.tier.key;
    const stillAtZero = afterLossRaw.stars <= 0;

    if (
      sameTier &&
      stillAtZero &&
      profile.ranked.zeroStarLossBuffer > RANKED_CONFIG.derankProtectionLossesAtZero &&
      before.tierIndex > 0
    ) {
      const tiers = getRankProgressionTiers();
      const prevTier = tiers[before.tierIndex - 1];
      if (prevTier) {
        const prevTierStars = getTierStarCount(prevTier);
        profile.ranked.mmr = prevTier.min + Math.max(0, prevTierStars - 1) * RANKED_CONFIG.mmrPerStar;
        profile.ranked.zeroStarLossBuffer = 0;
        forcedDerank = true;
      }
    }
  }

  const after = getRankedSnapshot();
  saveProfile();
  return getRankedResultSummary(didWin, before, after, forcedDerank);
}

// ── Math Helpers ──────────────────────────────────────────────
function distance(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function normalized(dx, dy) { const len = Math.hypot(dx, dy) || 1; return { x: dx / len, y: dy / len }; }
function insidePlatform(x, y, padding = 0) { return distance(x, y, arena.cx, arena.cy) <= arena.radius - padding; }

// ── Collision ─────────────────────────────────────────────────
function getBlockingCircles() {
  const circles = [...obstacles];
  for (const wall of walls) {
    for (const seg of wall.segments) circles.push(seg);
  }
  return circles;
}

function circleHitsObstacle(x, y, r) {
  for (const obstacle of getBlockingCircles())
    if (distance(x, y, obstacle.x, obstacle.y) < r + obstacle.r) return obstacle;
  return null;
}

function lineCircleIntersect(x1, y1, x2, y2, cx, cy, cr) {
  const dx = x2 - x1, dy = y2 - y1, fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - cr * cr;
  let d = b * b - 4 * a * c;
  if (d < 0) return false;
  d = Math.sqrt(d);
  const t1 = (-b - d) / (2 * a), t2 = (-b + d) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

function hasObstacleBetween(x1, y1, x2, y2, ignoreRadius = 0) {
  for (const obstacle of getBlockingCircles())
    if (lineCircleIntersect(x1, y1, x2, y2, obstacle.x, obstacle.y, obstacle.r + ignoreRadius)) return true;
  return false;
}

function pushActorOutOfObstacle(actor) {
  const skin = 1.5;
  for (const obstacle of getBlockingCircles()) {
    const dx = actor.x - obstacle.x, dy = actor.y - obstacle.y;
    const dist = Math.hypot(dx, dy) || 1;
    const minDist = actor.r + obstacle.r + skin;
    if (dist < minDist) {
      const nx = dx / dist, ny = dy / dist;
      actor.x = obstacle.x + nx * minDist;
      actor.y = obstacle.y + ny * minDist;
      const intoNormal = actor.vx * nx + actor.vy * ny;
      if (intoNormal < 0) {
        actor.vx -= intoNormal * nx;
        actor.vy -= intoNormal * ny;
      }
    }
  }
}

// ── Movement ──────────────────────────────────────────────────
function moveActorWithSlide(actor, moveX, moveY, dt) {
  const moveLen = Math.hypot(moveX, moveY);
  if (moveLen <= 0.0001) return;
  const dirX = moveX / moveLen;
  const dirY = moveY / moveLen;
  const step = actor.speed * Math.min(1, moveLen) * dt;
  let nextX = actor.x + dirX * step;
  let nextY = actor.y + dirY * step;
  const hit = circleHitsObstacle(nextX, nextY, actor.r);
  if (!hit) { actor.x = nextX; actor.y = nextY; return; }
  const nx = nextX - hit.x, ny = nextY - hit.y;
  const nLen = Math.hypot(nx, ny) || 1;
  const unx = nx / nLen, uny = ny / nLen;
  const dot = dirX * unx + dirY * uny;
  const slideX = dirX - dot * unx;
  const slideY = dirY - dot * uny;
  const slideLen = Math.hypot(slideX, slideY);
  if (slideLen > 0.0001) {
    const sx = slideX / slideLen, sy = slideY / slideLen;
    nextX = actor.x + sx * step;
    nextY = actor.y + sy * step;
    if (!circleHitsObstacle(nextX, nextY, actor.r)) {
      actor.x = nextX;
      actor.y = nextY;
    }
  }
}

function clampActorMovementToPlatform(actor) {
  const dx = actor.x - arena.cx, dy = actor.y - arena.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const maxDist = arena.radius - actor.r;
  if (dist > maxDist) {
    actor.x = arena.cx + (dx / dist) * maxDist;
    actor.y = arena.cy + (dy / dist) * maxDist;
  }
  pushActorOutOfObstacle(actor);
}

function updateActorPhysics(actor, dt) {
  actor.x += actor.vx * dt;
  actor.y += actor.vy * dt;
  actor.vx *= Math.pow(0.0008, dt);
  actor.vy *= Math.pow(0.0008, dt);
  if (Math.abs(actor.vx) < 3) actor.vx = 0;
  if (Math.abs(actor.vy) < 3) actor.vy = 0;
  pushActorOutOfObstacle(actor);
}

// ── Arena Geometry ────────────────────────────────────────────
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  fxCanvas.width  = window.innerWidth;
  fxCanvas.height = window.innerHeight;

  updateArenaGeometry(true);
}

function updateArenaGeometry(resetRadius = false) {
  arena.cx         = canvas.width / 2;
  arena.cy         = canvas.height / 2 + 8;
  arena.baseRadius = Math.max(230, Math.min(canvas.width, canvas.height) * 0.34);
  if (resetRadius || !arena.radius) arena.radius = arena.baseRadius;
  arena.minRadius  = Math.max(150, arena.baseRadius * 0.58);
  playerSpawn.x    = arena.cx - arena.radius * 0.52;
  playerSpawn.y    = arena.cy;
  dummySpawn.x     = arena.cx + arena.radius * 0.52;
  dummySpawn.y     = arena.cy;
}

function buildObstacles() {
  obstacles.length = 0;
  let attempts = 0;
  while (obstacles.length < 3 && attempts < 300) {
    attempts++;
    const r     = 22 + Math.random() * 10;
    const angle = Math.random() * Math.PI * 2;
    const dist  = 50 + Math.random() * Math.max(20, arena.radius - 125);
    const x     = arena.cx + Math.cos(angle) * dist;
    const y     = arena.cy + Math.sin(angle) * dist;
    if (distance(x, y, arena.cx, arena.cy) > arena.radius - r - 20) continue;
    if (distance(x, y, playerSpawn.x, playerSpawn.y) < 95 || distance(x, y, dummySpawn.x, dummySpawn.y) < 95) continue;
    let overlap = false;
    for (const obstacle of obstacles)
      if (distance(x, y, obstacle.x, obstacle.y) < r + obstacle.r + 40) overlap = true;
    if (!overlap) obstacles.push({ x, y, r });
  }
}

// ── Effects ───────────────────────────────────────────────────
function isPerformanceModeEnabled() {
  return isPerformanceModeForced() || !!(profile && profile.performanceMode);
}

function isPerformanceModeForced() {
  return typeof FORCE_ARENA_PERFORMANCE_MODE !== 'undefined' && !!FORCE_ARENA_PERFORMANCE_MODE;
}

function getParticleSoftCap() {
  if (isPerformanceModeForced()) return 220;
  return isPerformanceModeEnabled() ? 320 : 760;
}

function getScaledEffectCount(count, minCount = 1) {
  const base = Math.max(0, Number(count) || 0);
  if (isPerformanceModeForced()) {
    return Math.max(minCount, Math.round(base * 0.45));
  }
  if (!isPerformanceModeEnabled()) return Math.round(base);
  return Math.max(minCount, Math.round(base * 0.55));
}

function addParticle(particle) {
  if (!particle || particles.length >= getParticleSoftCap()) return false;
  particles.push(particle);
  return true;
}

function spawnBurst(x, y, color, count = 16, speed = 180) {
  const spawnCount = getScaledEffectCount(count);
  for (let i = 0; i < spawnCount; i++)
    addParticle({
      x, y,
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
      life: 0.3 + Math.random() * 0.2,
      size: 2 + Math.random() * 4,
      color
    });
}

function spawnDamageText(x, y, amount, color = '#ffd36b', prefix = '-') {
  damageTexts.push({ x, y: y - 12, value: `${prefix}${Math.round(amount)}`, life: 0.75, vy: -34, color });
}

function clearRewindHistory() {
  rewindHistory.length = 0;
  rewindLastSampleAt = 0;
}

function seedRewindHistory() {
  const now = performance.now() / 1000;
  rewindHistory.length = 0;
  rewindHistory.push({ x: player.x, y: player.y, t: now });
  rewindLastSampleAt = now;
}

function recordRewindHistory(force = false) {
  if (!player.alive) return;
  const now = performance.now() / 1000;
  const last = rewindHistory[rewindHistory.length - 1];
  const movedEnough = !last || distance(player.x, player.y, last.x, last.y) >= 3;
  const timeEnough = !last || (now - rewindLastSampleAt) >= 0.03;
  if (force || movedEnough || timeEnough) {
    rewindHistory.push({ x: player.x, y: player.y, t: now });
    rewindLastSampleAt = now;
  }
  const keepAfter = now - Math.max(1.35, (player.rewindSeconds || 1.0) + 0.35);
  while (rewindHistory.length > 1 && rewindHistory[0].t < keepAfter) rewindHistory.shift();
}

function getRewindTarget(secondsBack = 1.0) {
  if (!rewindHistory.length) return null;
  const now = performance.now() / 1000;
  const targetTime = now - secondsBack;
  let best = rewindHistory[0];
  let bestDiff = Math.abs(best.t - targetTime);
  for (let i = 1; i < rewindHistory.length; i++) {
    const snap = rewindHistory[i];
    const diff = Math.abs(snap.t - targetTime);
    if (diff < bestDiff) {
      best = snap;
      bestDiff = diff;
    }
  }
  return best;
}

function getSafeRewindTarget(baseTarget) {
  if (baseTarget && !circleHitsObstacle(baseTarget.x, baseTarget.y, player.r) && insidePlatform(baseTarget.x, baseTarget.y, player.r)) {
    return baseTarget;
  }
  for (let i = rewindHistory.length - 1; i >= 0; i--) {
    const snap = rewindHistory[i];
    if (!circleHitsObstacle(snap.x, snap.y, player.r) && insidePlatform(snap.x, snap.y, player.r)) {
      return snap;
    }
  }
  return null;
}

function getWallPlacementData() {
  const dir = getPlayerAim();
  const perp = { x: -dir.y, y: dir.x };
  const wallLength = 150;
  const segmentRadius = 12;
  const segmentCount = 7;
  const centerDistance = player.r + 42;
  const duration = 3.5;
  const centerX = player.x + dir.x * centerDistance;
  const centerY = player.y + dir.y * centerDistance;
  const segments = [];

  for (let i = 0; i < segmentCount; i++) {
    const t = segmentCount === 1 ? 0 : (i / (segmentCount - 1)) - 0.5;
    const offset = t * wallLength;
    const sx = centerX + perp.x * offset;
    const sy = centerY + perp.y * offset;

    if (!insidePlatform(sx, sy, segmentRadius + 4)) return null;
    if (circleHitsObstacle(sx, sy, segmentRadius)) return null;
    if (distance(sx, sy, player.x, player.y) < player.r + segmentRadius + 8) return null;

    segments.push({ x: sx, y: sy, r: segmentRadius });
  }

  return { dir, perp, centerX, centerY, duration, segments };
}

// ── Player Colors ─────────────────────────────────────────────
function getAutoColorIndexFromName(name) {
  const source = String(name || 'Player').trim().toLowerCase() || 'player';
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % autoPlayerColors.length;
}

function getAutoColorForPlayerName(name) {
  return autoPlayerColors[getAutoColorIndexFromName(name)] || autoPlayerColors[0];
}

function applyPlayerColors() {
  const choice = getAutoColorForPlayerName(player.name);
  player.bodyColor = choice.body;
  player.wandColor = choice.wand;
}

// ── Upgrades ──────────────────────────────────────────────────
function getPotionHealAmount() { return profile.store.potionBoost ? 23 : 18; }
function getHookCooldown()     { return profile.store.cooldownCharm ? 1.5 : 1.8; }

// ── Combat ────────────────────────────────────────────────────
function healActor(actor, amount) {
  const before = actor.hp;
  actor.hp = Math.min(actor.maxHp, actor.hp + amount);
  const gained = actor.hp - before;
  if (gained > 0) {
    spawnDamageText(actor.x, actor.y - actor.r, gained, '#7cff93', '+');
    soundHeal();
  }
}

function getPlayerAim() { return normalized(player.aimX, player.aimY); }

function spawnArenaHitFlash(x, y, target) {
  if (!window.outraThree || typeof window.outraThree.spawnHitFlash !== 'function') return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  window.outraThree.spawnHitFlash({ x, y }, { target });
}

function damagePlayer(amount) {
  if (!player.alive) return;
  const now = performance.now() / 1000;
  if (now < player.shieldUntil) {
    spawnDamageText(player.x, player.y - player.r, 0, '#9fd8ff', 'Block');
    return;
  }
  player.hp = Math.max(0, player.hp - amount);
  if (window.outraThree && window.outraThree.triggerHit) window.outraThree.triggerHit();
  spawnDamageText(player.x, player.y - player.r, amount);
  soundHit();
  if (player.hp <= 0) killPlayer('HP reached 0');
}

function damageDummy(amount) {
  if (!dummyEnabled || !dummy.alive) return;
  dummy.hp = Math.max(0, dummy.hp - amount);

  if (window.outraThree && window.outraThree.triggerDummyHit) {
    window.outraThree.triggerDummyHit();
  }

  spawnDamageText(dummy.x, dummy.y - dummy.r, amount);
  soundHit();
  if (dummy.hp <= 0) killDummy('HP reached 0');
}

// ── Generic Spell Casting ─────────────────────────────────────
function canCastSpell(spellId) {
  const now = performance.now() / 1000;
  const def = SPELL_DEFS[spellId];
  if (!def) return false;
  if (gameState !== 'playing' || !player.alive) return false;
  if (isArenaPreFightLocked()) return false;
  if (spellId !== 'fire' && !activeSpellLoadout.includes(spellId)) return false;
  const readyAt = player[def.cooldownKey] || 0;
  return now >= readyAt;
}

function castPlayerSpell(spellId) {
  if (!canCastSpell(spellId)) return;

  switch (spellId) {
    case 'fire':
      shootFire();
      break;
    case 'hook':
      castHookFromPlayer();
      break;
    case 'blink':
      tryTeleport();
      break;
    case 'shield':
      castShield();
      break;
    case 'charge':
      castArcaneCharge();
      break;
    case 'shock':
      castShockBlast();
      break;
    case 'gust':
      castGust();
      break;
    case 'wall':
      castWall();
      break;
    case 'rewind':
      castRewind();
      break;
  }
}

// ── Skills ────────────────────────────────────────────────────
function shootFire() {
  const now = performance.now() / 1000;
  if (gameState !== 'playing' || !player.alive || now < player.fireReadyAt) return;
  const dir = getPlayerAim();
  player.fireReadyAt = now + player.fireCooldown;
  soundFire();
  if (window.outraThree && window.outraThree.triggerCast) window.outraThree.triggerCast();
  projectiles.push({
    owner: 'player',
    x: player.x + dir.x * (player.r + 10),
    y: player.y + dir.y * (player.r + 10),
    vx: dir.x * 620, vy: dir.y * 620,
    r: 7, life: 1.3, damage: 20, knockback: 360
  });
}

function shootFireFromDummy() {
  const now = performance.now() / 1000;
  if (gameState !== 'playing' || !dummyEnabled || !dummy.alive || now < dummy.fireReadyAt) return;
  if (hasObstacleBetween(dummy.x, dummy.y, player.x, player.y, 2)) return;
  const dir = normalized(player.x - dummy.x, player.y - dummy.y);
  dummy.fireReadyAt = now + dummy.fireCooldown;
  soundFire();
  if (window.outraThree && window.outraThree.triggerDummyCast) {
    window.outraThree.triggerDummyCast();
  }

  projectiles.push({
    owner: 'dummy',
    x: dummy.x + dir.x * (dummy.r + 10),
    y: dummy.y + dir.y * (dummy.r + 10),
    vx: dir.x * 520, vy: dir.y * 520,
    r: 7, life: 1.35, damage: 14, knockback: 250
  });
}

function castHookFromPlayer() {
  const now = performance.now() / 1000;
  if (gameState !== 'playing' || !player.alive || now < player.hookReadyAt) return;
  const dir = getPlayerAim();
  player.hookReadyAt = now + player.hookCooldown;
  soundHook();
  if (window.outraThree && window.outraThree.triggerCast) window.outraThree.triggerCast();
  hooks.push({
    owner: 'player', state: 'flying',
    x: player.x, y: player.y, sx: player.x, sy: player.y,
    tx: player.x + dir.x * player.teleportDistance,
    ty: player.y + dir.y * player.teleportDistance,
    progress: 0, speed: 3.5, damage: 20
  });
}

function castHookFromDummy() {
  const now = performance.now() / 1000;
  if (gameState !== 'playing' || !dummyEnabled || !dummy.alive || now < dummy.hookReadyAt) return;
  const dist = distance(dummy.x, dummy.y, player.x, player.y);
  if (dist > 260 || hasObstacleBetween(dummy.x, dummy.y, player.x, player.y, 0)) return;
  dummy.hookReadyAt = now + dummy.hookCooldown;
  soundHook();

  if (window.outraThree && window.outraThree.triggerDummyCast) {
    window.outraThree.triggerDummyCast();
  }

  hooks.push({
    owner: 'dummy', state: 'flying',
    x: dummy.x, y: dummy.y, sx: dummy.x, sy: dummy.y,
    tx: player.x, ty: player.y,
    progress: 0, speed: 3.1, damage: 16
  });
}

function castShield() {
  const now = performance.now() / 1000;
  if (gameState !== 'playing' || !player.alive || now < player.shieldReadyAt) return;
  player.shieldReadyAt = now + player.shieldCooldown;
  player.shieldUntil   = now + 1.0;
  soundShield();
  if (window.outraThree && window.outraThree.triggerCast) window.outraThree.triggerCast();
  spawnBurst(player.x, player.y, 'rgba(130,190,255,0.9)', 18, 140);
}

function stopArcaneCharge(spawnImpact = false) {
  if (!player.chargeActive) return;
  player.chargeActive = false;
  player.chargeTimer = 0;
  player.vx *= 0.18;
  player.vy *= 0.18;
  if (spawnImpact) spawnBurst(player.x, player.y, 'rgba(180,120,255,0.9)', 12, 150);
}

function castArcaneCharge() {
  const now = performance.now() / 1000;
  if (gameState !== 'playing' || !player.alive || now < player.chargeReadyAt || player.chargeActive) return;
  const dir = getPlayerAim();
  player.chargeReadyAt = now + player.chargeCooldown;
  if (window.outraThree && window.outraThree.triggerDash) window.outraThree.triggerDash();
  player.chargeActive = true;
  player.chargeDirX = dir.x;
  player.chargeDirY = dir.y;
  player.chargeTimer = player.teleportDistance / 760;
  player.chargeHit = false;
  player.vx = dir.x * 760;
  player.vy = dir.y * 760;
  soundCharge();
  spawnBurst(player.x, player.y, 'rgba(180,120,255,0.95)', 16, 170);
}

function castShockBlast() {
  const now = performance.now() / 1000;

  if (
    gameState !== 'playing' ||
    !player.alive ||
    now < player.shockReadyAt
  ) return;

  const dir = getPlayerAim();
  player.shockReadyAt = now + player.shockCooldown;

  if (window.outraThree && window.outraThree.triggerCast) {
    window.outraThree.triggerCast();
  }

  soundShock();

  const range = 115;
  const angle = Math.PI / 3;
  const damage = 14;
  const knockback = 680;

  if (dummyEnabled && dummy.alive) {
    const dx = dummy.x - player.x;
    const dy = dummy.y - player.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= range) {
      const nd = normalized(dx, dy);
      const dot = nd.x * dir.x + nd.y * dir.y;

      if (dot > Math.cos(angle / 2)) {
        spawnArenaHitFlash(dummy.x, dummy.y, 'dummy');
        damageDummy(damage);
        dummy.vx += nd.x * knockback;
        dummy.vy += nd.y * knockback;
        spawnBurst(dummy.x, dummy.y, 'rgba(255,200,120,0.95)', 18, 200);
      }
    }
  }

  spawnBurst(player.x, player.y, 'rgba(255,180,120,0.7)', 12, 120);
}

function castGust() {
  const now = performance.now() / 1000;

  if (
    gameState !== 'playing' ||
    !player.alive ||
    now < player.gustReadyAt
  ) return;

  player.gustReadyAt = now + player.gustCooldown;

  if (window.outraThree && window.outraThree.triggerCast) {
    window.outraThree.triggerCast();
  }

  soundGust();

  const radius = 120;
  const damage = 4;
  const knockback = 540;

  spawnBurst(player.x, player.y, 'rgba(170,245,255,0.92)', 18, radius * 1.7);

  const gustTrailCount = getScaledEffectCount(18, 10);
  for (let i = 0; i < gustTrailCount; i++) {
    const ang = (Math.PI * 2 * i) / Math.max(1, gustTrailCount) + Math.random() * 0.18;
    const speed = 180 + Math.random() * 120;
    addParticle({
      x: player.x + Math.cos(ang) * 18,
      y: player.y + Math.sin(ang) * 18,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      life: 0.22 + Math.random() * 0.12,
      size: 4 + Math.random() * 3,
      color: 'rgba(170,245,255,0.82)'
    });
  }

  if (dummyEnabled && dummy.alive) {
    const dx = dummy.x - player.x;
    const dy = dummy.y - player.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= radius + dummy.r) {
      const dir = dist > 0.001 ? normalized(dx, dy) : getPlayerAim();
      spawnArenaHitFlash(dummy.x, dummy.y, 'dummy');
      damageDummy(damage);
      dummy.vx += dir.x * knockback;
      dummy.vy += dir.y * knockback;
      spawnBurst(dummy.x, dummy.y, 'rgba(190,250,255,0.96)', 16, 180);
      if (dummyBehavior === 'active' && dist < 90) {
        dummy.targetX = dummy.x + dir.x * 120;
        dummy.targetY = dummy.y + dir.y * 120;
      }
    }
  }
}

function castWall() {
  const now = performance.now() / 1000;

  if (gameState !== 'playing' || !player.alive || now < player.wallReadyAt) return;

  const placement = getWallPlacementData();
  if (!placement) return;

  player.wallReadyAt = now + player.wallCooldown;

  if (window.outraThree && window.outraThree.triggerCast) {
    window.outraThree.triggerCast();
  }

  soundWall();

  walls.push({
    x: placement.centerX,
    y: placement.centerY,
    dirX: placement.dir.x,
    dirY: placement.dir.y,
    perpX: placement.perp.x,
    perpY: placement.perp.y,
    life: placement.duration,
    maxLife: placement.duration,
    segments: placement.segments,
  });

  for (const seg of placement.segments) {
    spawnBurst(seg.x, seg.y, 'rgba(165, 210, 255, 0.88)', 6, 90);
  }
}

function castRewind() {
  const now = performance.now() / 1000;
  if (gameState !== 'playing' || !player.alive || now < player.rewindReadyAt) return;

  const target = getSafeRewindTarget(getRewindTarget(player.rewindSeconds || 1.0));
  if (!target) return;

  player.rewindReadyAt = now + player.rewindCooldown;
  stopArcaneCharge(false);
  player.vx = 0;
  player.vy = 0;

  if (window.outraThree && window.outraThree.triggerCast) {
    window.outraThree.triggerCast();
  }

  soundRewind();

  const fromX = player.x;
  const fromY = player.y;
  const dx = target.x - fromX;
  const dy = target.y - fromY;

  const rewindTrailCount = getScaledEffectCount(14, 8);
  for (let i = 0; i < rewindTrailCount; i++) {
    const p = i / Math.max(1, rewindTrailCount - 1);
    addParticle({
      x: fromX + dx * p + (Math.random() - 0.5) * 8,
      y: fromY + dy * p + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 30,
      vy: (Math.random() - 0.5) * 30,
      life: 0.20 + Math.random() * 0.10,
      size: 3 + Math.random() * 3,
      color: 'rgba(180,120,255,0.88)'
    });
  }

  spawnBurst(fromX, fromY, 'rgba(170,120,255,0.92)', 16, 170);
  player.x = target.x;
  player.y = target.y;
  spawnBurst(player.x, player.y, 'rgba(220,180,255,0.96)', 18, 190);
  recordRewindHistory(true);
}

function updateArcaneCharge(dt) {
  if (!player.chargeActive || !player.alive) return;
  if (gameState !== 'playing' && gameState !== 'result') {
    stopArcaneCharge(false);
    return;
  }

  const dir = normalized(player.chargeDirX, player.chargeDirY);
  const speed = 760;
  const stepDt = dt / 4;

  for (let step = 0; step < 4; step++) {
    if (!player.chargeActive) break;

    const nextX = player.x + dir.x * speed * stepDt;
    const nextY = player.y + dir.y * speed * stepDt;
    const obstacle = circleHitsObstacle(nextX, nextY, player.r);
    if (obstacle) {
      stopArcaneCharge(true);
      break;
    }

    player.x = nextX;
    player.y = nextY;
    player.vx = dir.x * speed;
    player.vy = dir.y * speed;

    addParticle({
      x: player.x - dir.x * (player.r + 6),
      y: player.y - dir.y * (player.r + 6),
      vx: -dir.x * 80 + (Math.random() - 0.5) * 70,
      vy: -dir.y * 80 + (Math.random() - 0.5) * 70,
      life: 0.18 + Math.random() * 0.06,
      size: 4 + Math.random() * 3,
      color: 'rgba(190,140,255,0.92)'
    });

    if (!player.chargeHit && dummyEnabled && dummy.alive && distance(player.x, player.y, dummy.x, dummy.y) <= player.r + dummy.r + 8) {
      player.chargeHit = true;
      spawnArenaHitFlash(dummy.x, dummy.y, 'dummy');
      damageDummy(16);
      dummy.vx += dir.x * 720;
      dummy.vy += dir.y * 720;
      spawnBurst(dummy.x, dummy.y, 'rgba(210,150,255,0.95)', 18, 210);
      soundChargeHit();
      stopArcaneCharge(false);
      break;
    }
  }

  player.chargeTimer -= dt;
  if (player.chargeTimer <= 0) stopArcaneCharge(false);
}

function getBlinkTargetPreview() {
  const dir = getPlayerAim();
  let tx = player.x + dir.x * player.teleportDistance;
  let ty = player.y + dir.y * player.teleportDistance;
  const dx = tx - arena.cx, dy = ty - arena.cy;
  const dist = Math.hypot(dx, dy) || 1;
  const maxDist = arena.radius - player.r;
  if (dist > maxDist) {
    tx = arena.cx + (dx / dist) * maxDist;
    ty = arena.cy + (dy / dist) * maxDist;
  }
  const blocked = !!circleHitsObstacle(tx, ty, player.r);
  return { x: tx, y: ty, blocked };
}

function tryTeleport() {
  const now = performance.now() / 1000;
  if (gameState !== 'playing' || !player.alive || now < player.teleportReadyAt) return;
  const target = getBlinkTargetPreview();
  if (target.blocked) return;
  player.teleportReadyAt = now + player.teleportCooldown;
  if (window.outraThree && window.outraThree.triggerCast) window.outraThree.triggerCast();
  soundTeleport();
  spawnBurst(player.x, player.y, 'rgba(160,120,255,0.9)', 18, 220);
  player.x = target.x;
  player.y = target.y;
  spawnBurst(player.x, player.y, 'rgba(160,120,255,0.9)', 18, 220);
  recordRewindHistory(true);
}

// ── AI ────────────────────────────────────────────────────────
function moveDummyAI(dt) {
  if (!dummyEnabled || !dummy.alive || !player.alive || gameState !== 'playing') return;
  if (dummyBehavior !== 'active') return;

  dummy.aiSwitchTimer -= dt;
  dummy.aiMoveTimer   -= dt;
  const distToPlayer = distance(dummy.x, dummy.y, player.x, player.y);

  if (dummy.aiSwitchTimer <= 0) {
    dummy.aiStrafeDir   = Math.random() < 0.5 ? -1 : 1;
    dummy.aiSwitchTimer = 1.2 + Math.random() * 1.3;
  }
  if (dummy.aiMoveTimer <= 0) {
    const away = normalized(dummy.x - player.x, dummy.y - player.y);
    const side = { x: -away.y * dummy.aiStrafeDir, y: away.x * dummy.aiStrafeDir };
    let desiredDist = 180;
    if (distToPlayer < 130) desiredDist = 220;
    if (distToPlayer > 250) desiredDist = 150;
    let tx = player.x + away.x * desiredDist + side.x * 70;
    let ty = player.y + away.y * desiredDist + side.y * 70;
    const fromCenter = normalized(tx - arena.cx, ty - arena.cy);
    const dCenter    = distance(tx, ty, arena.cx, arena.cy);
    const maxDist    = arena.radius - dummy.r - 8;
    if (dCenter > maxDist) {
      tx = arena.cx + fromCenter.x * maxDist;
      ty = arena.cy + fromCenter.y * maxDist;
    }
    if (!circleHitsObstacle(tx, ty, dummy.r)) {
      dummy.targetX = tx;
      dummy.targetY = ty;
    }
    dummy.aiMoveTimer = 0.35 + Math.random() * 0.35;
  }

  const dir    = normalized(dummy.targetX - dummy.x, dummy.targetY - dummy.y);
  const travel = distance(dummy.x, dummy.y, dummy.targetX, dummy.targetY);
  if (travel > 8) moveActorWithSlide(dummy, dir.x, dir.y, dt);
  clampActorMovementToPlatform(dummy);

  if (distToPlayer < 280 && !hasObstacleBetween(dummy.x, dummy.y, player.x, player.y, 3)) {
    shootFireFromDummy();
    if (distToPlayer < 220 && Math.random() < 0.008) castHookFromDummy();
  }
}

// ── Potions ───────────────────────────────────────────────────
function findValidSpawnNear(x, y, radius) {
  for (let i = 0; i < 60; i++) {
    const angle = (i / 60) * Math.PI * 2;
    const px    = x + Math.cos(angle) * radius;
    const py    = y + Math.sin(angle) * radius;
    if (insidePlatform(px, py, 18) && !circleHitsObstacle(px, py, 18)) return { x: px, y: py };
  }
  return { x: arena.cx, y: arena.cy };
}

function spawnPotion() {
  if (potions.length >= 2 || gameState !== 'playing') return;
  for (let i = 0; i < 80; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = 30 + Math.random() * Math.max(30, arena.radius - 70);
    const x     = arena.cx + Math.cos(angle) * dist;
    const y     = arena.cy + Math.sin(angle) * dist;
    if (!insidePlatform(x, y, 18) || circleHitsObstacle(x, y, 14)) continue;
    if (distance(x, y, player.x, player.y) < 60 || (dummyEnabled && distance(x, y, dummy.x, dummy.y) < 60)) continue;
    potions.push({ x, y, r: 12, heal: getPotionHealAmount(), life: 10 });
    break;
  }
}

function updatePotions(dt) {
  if (gameState !== 'playing') return;
  potionSpawnTimer -= dt;
  if (potionSpawnTimer <= 0) {
    spawnPotion();
    potionSpawnTimer = 6 + Math.random() * 5;
  }
  for (let i = potions.length - 1; i >= 0; i--) {
    const potion = potions[i];
    potion.life -= dt;
    if (potion.life <= 0) { potions.splice(i, 1); continue; }
    if (player.alive && distance(player.x, player.y, potion.x, potion.y) <= player.r + potion.r) {
      healActor(player, potion.heal);
      spawnBurst(potion.x, potion.y, 'rgba(120,255,160,0.9)', 14, 110);
      potions.splice(i, 1);
      continue;
    }
    if (dummyEnabled && dummy.alive && distance(dummy.x, dummy.y, potion.x, potion.y) <= dummy.r + potion.r) {
      healActor(dummy, potion.heal);
      spawnBurst(potion.x, potion.y, 'rgba(120,255,160,0.9)', 14, 110);
      potions.splice(i, 1);
    }
  }
}

// ── Arena Shrink ──────────────────────────────────────────────
function updateArenaShrink(dt) {
  if (gameState !== 'playing') return;
  arena.shrinkTimer -= dt;
  if (arena.shrinkTimer <= 0) {
    arena.radius      = Math.max(arena.minRadius, arena.radius - arena.shrinkStep);
    arena.shrinkTimer = arena.shrinkInterval;
    updateArenaGeometry(false);
    buildObstacles();
    if (dummyEnabled) clampActorMovementToPlatform(dummy);
    for (let i = potions.length - 1; i >= 0; i--)
      if (!insidePlatform(potions[i].x, potions[i].y, potions[i].r)) potions.splice(i, 1);
  }
}

// ── Match Flow ────────────────────────────────────────────────
function killPlayer(reason) {
  if (!player.alive) return;
  stopArcaneCharge(false);
  player.alive = false;
  player.deadReason = reason;
  spawnBurst(player.x, player.y, 'rgba(255,90,50,0.95)', 24, 260);
  endMatch(false);
}

function killDummy(reason) {
  if (!dummy.alive) return;
  dummy.alive = false;
  dummy.deadReason = reason;
  spawnBurst(dummy.x, dummy.y, 'rgba(255,180,70,0.95)', 24, 260);
  endMatch(true);
}

function endMatch(playerWon) {
  if (gameState !== 'playing') return;
  gameState = 'result';
  winnerReward = null;

  let rankedText = '';

  if (dummyEnabled && dummyBehavior === 'active') {
    rankedText = applyRankedMatchResult(playerWon);
  }

  if (playerWon) {
    awardWinRewards(player.name);
    soundWin();
    winnerText = `${player.name} wins! +3 pts${rankedText ? ` • ${rankedText}` : ''}`;
    winnerReward = { currency: 1 };
  } else {
    soundLose();
    winnerText = dummyEnabled
      ? `Dummy wins!${rankedText ? ` • ${rankedText}` : ''}`
      : 'Round ended';
  }

  resultTimer = 2.2;
  updateHud();
}

function spawnDummy(mode = 'active') {
  dummyEnabled = true;
  dummyBehavior = mode;

  const d = findValidSpawnNear(dummySpawn.x, dummySpawn.y, 0);

  Object.assign(dummy, {
    x: d.x, y: d.y, vx: 0, vy: 0,
    hp: dummy.maxHp, alive: dummyEnabled, deadReason: dummyEnabled ? '' : 'removed',
    fireReadyAt: 0, hookReadyAt: 0,
    aiSwitchTimer: 0, aiMoveTimer: 0, targetX: d.x, targetY: d.y
  });
}

function removeDummy() {
  dummyEnabled = false;
  dummy.alive = false;
  dummy.deadReason = 'removed';
}

function resetRound() {
  updateArenaGeometry(true);
  arena.shrinkTimer    = arena.shrinkInterval;
  buildObstacles();
  player.hookCooldown  = getHookCooldown();

  const p = findValidSpawnNear(playerSpawn.x, playerSpawn.y, 0);
  const d = findValidSpawnNear(dummySpawn.x,  dummySpawn.y,  0);

  Object.assign(player, {
    x: p.x, y: p.y, vx: 0, vy: 0,
    hp: player.maxHp, alive: true, deadReason: '',
    fireReadyAt: 0, hookReadyAt: 0, teleportReadyAt: 0, shieldReadyAt: 0, chargeReadyAt: 0, shockReadyAt: 0, gustReadyAt: 0, wallReadyAt: 0, rewindReadyAt: 0, shieldUntil: 0,
    chargeActive: false, chargeDirX: 0, chargeDirY: 0, chargeTimer: 0, chargeHit: false,
    aimX: 1, aimY: 0
  });

  Object.assign(dummy, {
    x: d.x, y: d.y, vx: 0, vy: 0,
    hp: dummy.maxHp, alive: dummyEnabled, deadReason: dummyEnabled ? '' : 'removed',
    fireReadyAt: 0, hookReadyAt: 0,
    aiSwitchTimer: 0, aiMoveTimer: 0, targetX: d.x, targetY: d.y
  });

  projectiles.length  = 0;
  particles.length    = 0;
  damageTexts.length  = 0;
  hooks.length        = 0;
  walls.length        = 0;
  potions.length      = 0;
  lavaTick            = 0;
  potionSpawnTimer    = 5 + Math.random() * 3;
  winnerText          = '';
  winnerReward        = null;
  resultTimer         = 0;
  lavaSoundTimer      = 0;
  resetMoveStick();
  skillAimPreview.active = false;
  skillAimPreview.type   = null;
  mouse.x = player.x + 120;
  mouse.y = player.y;
  clearRewindHistory();
  seedRewindHistory();
}

function getDraftSpellLabel(spellId) {
  const labels = {
    hook: 'Hook',
    blink: 'Blink',
    shield: 'Shield',
    charge: 'Charge',
    shock: 'Shock',
    gust: 'Gust',
    wall: 'Wall',
    rewind: 'Rewind',
  };

  return labels[spellId] || spellId;
}

function getDraftRoomLayoutTuning() {
  const roomCfg = window.OUTRA_3D_CONFIG?.draftRoom || {};
  const layoutCfg = roomCfg.layout || {};
  const platformCfg = roomCfg.platform || {};
  const platformFitRadius = Math.max(
    1,
    Number.isFinite(Number(platformCfg.fitToLayoutRadius))
      ? Number(platformCfg.fitToLayoutRadius)
      : 1
  );

  return {
    centerOffsetX: Number.isFinite(Number(layoutCfg.centerOffsetX)) ? Number(layoutCfg.centerOffsetX) : 0,
    centerOffsetY: Number.isFinite(Number(layoutCfg.centerOffsetY)) ? Number(layoutCfg.centerOffsetY) : 0,
    gridOffsetX: Number.isFinite(Number(layoutCfg.gridOffsetX)) ? Number(layoutCfg.gridOffsetX) : 0,
    gridOffsetY: Number.isFinite(Number(layoutCfg.gridOffsetY)) ? Number(layoutCfg.gridOffsetY) : -6,
    gridInsidePadding: Number.isFinite(Number(layoutCfg.gridInsidePadding)) ? Number(layoutCfg.gridInsidePadding) : 26,
    tileWidth: Number.isFinite(Number(layoutCfg.tileWidth)) ? Number(layoutCfg.tileWidth) : 142,
    tileHeight: Number.isFinite(Number(layoutCfg.tileHeight)) ? Number(layoutCfg.tileHeight) : 68,
    tileGapX: Number.isFinite(Number(layoutCfg.tileGapX)) ? Number(layoutCfg.tileGapX) : 18,
    tileGapY: Number.isFinite(Number(layoutCfg.tileGapY)) ? Number(layoutCfg.tileGapY) : 20,
    moveRadiusScale: Number.isFinite(Number(layoutCfg.moveRadiusScale)) ? Number(layoutCfg.moveRadiusScale) : 0.92,
    moveRadiusPadding: Number.isFinite(Number(layoutCfg.moveRadiusPadding)) ? Number(layoutCfg.moveRadiusPadding) : -6,
    seatRadiusScale: Number.isFinite(Number(layoutCfg.seatRadiusScale)) ? Number(layoutCfg.seatRadiusScale) : 0.62,
    seatRadiusOffset: Number.isFinite(Number(layoutCfg.seatRadiusOffset)) ? Number(layoutCfg.seatRadiusOffset) : 0,
    sideSeatMode: layoutCfg.sideSeatMode !== false,
    sideSeatXFactor: Number.isFinite(Number(layoutCfg.sideSeatXFactor)) ? Number(layoutCfg.sideSeatXFactor) : 0.18,
    sideSeatYFactor: Number.isFinite(Number(layoutCfg.sideSeatYFactor)) ? Number(layoutCfg.sideSeatYFactor) : 0.24,
    sideSeatUsePanelAnchors: layoutCfg.sideSeatUsePanelAnchors !== false,
    sideSeatPanelOffsetY: Number.isFinite(Number(layoutCfg.sideSeatPanelOffsetY)) ? Number(layoutCfg.sideSeatPanelOffsetY) : 34,
    platformFitRadius,
    seatOffsets: roomCfg.playerSeatOffsets && typeof roomCfg.playerSeatOffsets === 'object'
      ? roomCfg.playerSeatOffsets
      : {},
  };
}

function getDraftSeatFromPanel(playerId, fallbackX, fallbackY, yOffset = 34) {
  const panelEl = document.querySelector(`[data-draft-player-panel="${playerId}"]`);
  if (!panelEl) {
    return { x: fallbackX, y: fallbackY };
  }

  const rect = panelEl.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) {
    return { x: fallbackX, y: fallbackY };
  }

  const x = rect.left + rect.width * 0.5;
  const y = rect.top - yOffset;
  return {
    x: Math.max(24, Math.min(canvas.width - 24, x)),
    y: Math.max(24, Math.min(canvas.height - 24, y)),
  };
}

function getDraftParticipantIds() {
  const order = Array.isArray(draftState.order) ? draftState.order : [];
  const seen = new Set();
  const ids = [];

  for (const id of order) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  const localId = draftState.localPlayerId || 'A';
  if (!ids.length) {
    ids.push(localId);
  } else if (!seen.has(localId)) {
    ids.unshift(localId);
  }

  return ids;
}

function buildDraftLayout() {
  const tune = getDraftRoomLayoutTuning();
  const cx = canvas.width * 0.5 + tune.centerOffsetX;
  const cy = canvas.height * 0.57 + tune.centerOffsetY;
  const platformRadius = Math.max(170, Math.min(canvas.width, canvas.height) * 0.24);
  const spellIds = Array.isArray(draftState.spellOrder) ? draftState.spellOrder : [];
  const columnCount = Math.max(1, Math.min(4, spellIds.length || 4));
  const rowCount = Math.max(1, Math.ceil(Math.max(1, spellIds.length) / columnCount));
  const effectivePlatformRadius = platformRadius * Math.max(1, tune.platformFitRadius || 1);

  let gapX = Math.max(8, Number(tune.tileGapX) || 20);
  let gapY = Math.max(10, Number(tune.tileGapY) || 24);
  let tileW = Math.max(64, Number(tune.tileWidth) || 154);
  let tileH = Math.max(34, Number(tune.tileHeight) || 74);
  const maxLayoutWidth = Math.max(320, canvas.width - 40);
  const baseLayoutWidth = tileW * columnCount + gapX * Math.max(0, columnCount - 1);

  if (baseLayoutWidth > maxLayoutWidth) {
    const scale = maxLayoutWidth / baseLayoutWidth;
    tileW = Math.max(64, tileW * scale);
    tileH = Math.max(34, tileH * scale);
    gapX = Math.max(8, gapX * scale);
    gapY = Math.max(8, gapY * scale);
  }

  const allowedGridRadius = Math.max(
    48,
    effectivePlatformRadius - Math.max(0, tune.gridInsidePadding)
  );
  let layoutWidth = tileW * columnCount + gapX * Math.max(0, columnCount - 1);
  let layoutHeight = tileH * rowCount + gapY * Math.max(0, rowCount - 1);

  function fitGridInsideDraftCircle() {
    const halfDiagonal = Math.hypot(layoutWidth * 0.5, layoutHeight * 0.5);
    if (halfDiagonal <= allowedGridRadius) return;

    const scale = allowedGridRadius / Math.max(halfDiagonal, 1);
    tileW = Math.max(38, tileW * scale);
    tileH = Math.max(24, tileH * scale);
    gapX = Math.max(4, gapX * scale);
    gapY = Math.max(4, gapY * scale);

    layoutWidth = tileW * columnCount + gapX * Math.max(0, columnCount - 1);
    layoutHeight = tileH * rowCount + gapY * Math.max(0, rowCount - 1);
  }

  fitGridInsideDraftCircle();
  fitGridInsideDraftCircle();

  tileW = Math.max(38, Math.round(tileW));
  tileH = Math.max(24, Math.round(tileH));
  gapX = Math.max(4, Math.round(gapX));
  gapY = Math.max(4, Math.round(gapY));

  layoutWidth = tileW * columnCount + gapX * Math.max(0, columnCount - 1);
  layoutHeight = tileH * rowCount + gapY * Math.max(0, rowCount - 1);

  let clampedGridOffsetX = tune.gridOffsetX;
  let clampedGridOffsetY = tune.gridOffsetY;
  const halfDiagonal = Math.hypot(layoutWidth * 0.5, layoutHeight * 0.5);
  const maxOffset = Math.max(0, allowedGridRadius - halfDiagonal);
  const offsetLength = Math.hypot(clampedGridOffsetX, clampedGridOffsetY);
  if (offsetLength > maxOffset && offsetLength > 0.0001) {
    const scale = maxOffset / offsetLength;
    clampedGridOffsetX *= scale;
    clampedGridOffsetY *= scale;
  }

  const startX = cx - layoutWidth * 0.5 + clampedGridOffsetX;
  const startY = cy - layoutHeight * 0.5 + clampedGridOffsetY;

  const tileRects = [];
  for (let i = 0; i < spellIds.length; i += 1) {
    const row = Math.floor(i / columnCount);
    const col = i % columnCount;
    const x = startX + col * (tileW + gapX);
    const y = startY + row * (tileH + gapY);
    tileRects.push({
      id: spellIds[i],
      label: getDraftSpellLabel(spellIds[i]),
      x,
      y,
      w: tileW,
      h: tileH,
      cx: x + tileW * 0.5,
      cy: y + tileH * 0.5,
    });
  }

  const participantIds = getDraftParticipantIds();
  const moveRadiusBase = effectivePlatformRadius;
  const moveRadius = Math.min(
    moveRadiusBase - 6,
    Math.max(36, moveRadiusBase * tune.moveRadiusScale + tune.moveRadiusPadding)
  );
  const seatRadiusMax = Math.max(18, moveRadius - 10);
  const seatRadius = Math.max(
    18,
    Math.min(
      seatRadiusMax,
      platformRadius * tune.seatRadiusScale + tune.seatRadiusOffset
    )
  );
  const seats = {};
  const useSideSeatLayout = participantIds.length === 2 && !!tune.sideSeatMode;

  if (participantIds.length === 1) {
    const id = participantIds[0];
    seats[id] = { x: cx, y: cy - seatRadius };
  } else if (useSideSeatLayout) {
    const sideXFactor = Math.max(0.12, Math.min(0.42, Number(tune.sideSeatXFactor) || 0.18));
    const sideYFactor = Math.max(0.12, Math.min(0.48, Number(tune.sideSeatYFactor) || 0.24));
    const sideY = canvas.height * sideYFactor;
    const leftX = canvas.width * sideXFactor;
    const rightX = canvas.width * (1 - sideXFactor);
    const usePanelAnchors = !!tune.sideSeatUsePanelAnchors;
    const panelOffsetY = Number.isFinite(Number(tune.sideSeatPanelOffsetY)) ? Number(tune.sideSeatPanelOffsetY) : 34;
    for (let i = 0; i < participantIds.length; i += 1) {
      const id = participantIds[i];
      const isLeft = id === 'A' || (id !== 'B' && i === 0);
      const fallbackX = isLeft ? leftX : rightX;
      const fallbackY = sideY;
      seats[id] = usePanelAnchors
        ? getDraftSeatFromPanel(id, fallbackX, fallbackY, panelOffsetY)
        : { x: fallbackX, y: fallbackY };
    }
  } else if (participantIds.length === 2) {
    const twoPlayerSeatAngles = { A: -Math.PI * 0.5, B: Math.PI * 0.5 };
    const fallbackAngles = [-Math.PI * 0.5, Math.PI * 0.5];
    for (let i = 0; i < participantIds.length; i += 1) {
      const id = participantIds[i];
      const angle = Number.isFinite(twoPlayerSeatAngles[id]) ? twoPlayerSeatAngles[id] : fallbackAngles[i];
      seats[id] = {
        x: cx + Math.cos(angle) * seatRadius,
        y: cy + Math.sin(angle) * seatRadius,
      };
    }
  } else {
    for (let i = 0; i < participantIds.length; i += 1) {
      const id = participantIds[i];
      const angle = -Math.PI * 0.5 + (i / participantIds.length) * Math.PI * 2;
      seats[id] = {
        x: cx + Math.cos(angle) * seatRadius,
        y: cy + Math.sin(angle) * seatRadius,
      };
    }
  }

  for (const id of participantIds) {
    const seat = seats[id];
    if (!seat) continue;
    const offset = tune.seatOffsets?.[id] || {};
    if (Number.isFinite(Number(offset.x))) seat.x += Number(offset.x);
    if (Number.isFinite(Number(offset.y))) seat.y += Number(offset.y);

    if (useSideSeatLayout) continue;

    const fromCx = seat.x - cx;
    const fromCy = seat.y - cy;
    const dist = Math.hypot(fromCx, fromCy);
    const maxSeatRadius = Math.max(10, moveRadius - 4);
    if (dist > maxSeatRadius && dist > 0.0001) {
      const scale = maxSeatRadius / dist;
      seat.x = cx + fromCx * scale;
      seat.y = cy + fromCy * scale;
    }
  }

  return {
    cx,
    cy,
    platformRadius,
    tileRects,
    seats,
    participantIds,
    moveRadius,
  };
}

function getDraftActivePlayerId() {
  const order = Array.isArray(draftState.order) ? draftState.order : [];
  if (!order.length) return null;
  const idx = Math.max(0, Math.min(order.length - 1, Number(draftState.turnIndex) || 0));
  return order[idx] || null;
}

function getDraftSpellById(spellId) {
  return (Array.isArray(draftState.spells) ? draftState.spells : []).find((spell) => spell.id === spellId) || null;
}

function getDraftAvailableSpells() {
  return (Array.isArray(draftState.spells) ? draftState.spells : []).filter((spell) => !spell.disabled);
}

function queueDraftTurnFlash(playerId) {
  const id = String(playerId || '').trim().toUpperCase();
  if (!id) return;
  draftState.turnFlash = {
    playerId: id,
    startedAt: performance.now(),
    durationMs: 420,
  };
}

function ensureDraftPickFxState() {
  if (!draftState.pickFx || typeof draftState.pickFx !== 'object') {
    draftState.pickFx = {};
  }
  if (!Array.isArray(draftState.pickFx.transfers)) draftState.pickFx.transfers = [];
  if (!Array.isArray(draftState.pickFx.ringPulses)) draftState.pickFx.ringPulses = [];
  if (!Array.isArray(draftState.pickFx.tileBursts)) draftState.pickFx.tileBursts = [];
  return draftState.pickFx;
}

function getDraftPickSlotCanvasTarget(pickerId, slotIndex) {
  if (!Number.isFinite(Number(slotIndex))) return null;
  if (typeof document === 'undefined' || !canvas) return null;

  const safePlayerId = String(pickerId || '').trim().toUpperCase();
  const safeSlotIndex = Math.max(0, Math.min(2, Math.floor(Number(slotIndex) || 0)));
  const slotEl = document.querySelector(`[data-draft-player-slot="${safePlayerId}-${safeSlotIndex}"]`);
  if (!slotEl) return null;

  const slotRect = slotEl.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const x = slotRect.left + slotRect.width * 0.5 - canvasRect.left;
  const y = slotRect.top + slotRect.height * 0.5 - canvasRect.top;

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.max(0, Math.min(canvas.width, x)),
    y: Math.max(0, Math.min(canvas.height, y)),
  };
}

function queueDraftPickConfirmationFx(spellId, pickerId, slotIndex = -1) {
  const fx = ensureDraftPickFxState();
  const nowMs = performance.now();
  const layout = draftState.layout;
  const tile = Array.isArray(layout?.tileRects)
    ? layout.tileRects.find((t) => t.id === spellId)
    : null;
  const actor = draftState.players?.[pickerId] || null;
  const slotTarget = getDraftPickSlotCanvasTarget(pickerId, slotIndex);

  if (tile) {
    fx.tileBursts.push({
      tileId: spellId,
      startedAt: nowMs,
      durationMs: 360,
    });
  }

  if (tile && (slotTarget || (actor && Number.isFinite(actor.x) && Number.isFinite(actor.y)))) {
    fx.transfers.push({
      fromX: tile.cx,
      fromY: tile.cy,
      toX: Number.isFinite(slotTarget?.x) ? slotTarget.x : actor.x,
      toY: Number.isFinite(slotTarget?.y) ? slotTarget.y : actor.y,
      startedAt: nowMs,
      durationMs: 360,
      pickerId,
      spellId: String(spellId || ''),
      slotIndex: Number.isFinite(Number(slotIndex)) ? Math.floor(Number(slotIndex)) : -1,
    });
  }

  if (actor && Number.isFinite(actor.x) && Number.isFinite(actor.y)) {
    fx.ringPulses.push({
      pickerId,
      startedAt: nowMs,
      durationMs: 320,
    });
  }

  if (fx.transfers.length > 16) fx.transfers.splice(0, fx.transfers.length - 16);
  if (fx.ringPulses.length > 16) fx.ringPulses.splice(0, fx.ringPulses.length - 16);
  if (fx.tileBursts.length > 16) fx.tileBursts.splice(0, fx.tileBursts.length - 16);
}

function moveDraftActor(actor, moveX, moveY, speed, dt, layout) {
  if (!actor || !layout) return;

  let dx = Number(moveX) || 0;
  let dy = Number(moveY) || 0;
  const len = Math.hypot(dx, dy);
  if (len > 0.0001) {
    dx /= len;
    dy /= len;
    actor.x += dx * speed * dt;
    actor.y += dy * speed * dt;
  }

  actor.x = Math.max(24, Math.min(canvas.width - 24, actor.x));
  actor.y = Math.max(24, Math.min(canvas.height - 24, actor.y));

  const fromCx = actor.x - layout.cx;
  const fromCy = actor.y - layout.cy;
  const dist = Math.hypot(fromCx, fromCy) || 1;
  if (dist > layout.moveRadius) {
    actor.x = layout.cx + (fromCx / dist) * layout.moveRadius;
    actor.y = layout.cy + (fromCy / dist) * layout.moveRadius;
  }

  const canClampTo3DPlatform =
    window.outraThree &&
    typeof window.outraThree.isDraftPlatformRenderedIn3D === 'function' &&
    typeof window.outraThree.isDraftWorldPointOnPlatform === 'function' &&
    window.outraThree.isDraftPlatformRenderedIn3D();

  if (!canClampTo3DPlatform) return;

  const isOnPlatform = window.outraThree.isDraftWorldPointOnPlatform(
    actor.x - layout.cx,
    actor.y - layout.cy
  );
  if (isOnPlatform) return;

  const edgeDx = actor.x - layout.cx;
  const edgeDy = actor.y - layout.cy;
  const edgeDist = Math.hypot(edgeDx, edgeDy);
  if (edgeDist <= 0.0001) return;

  let low = 0;
  let high = 1;

  for (let i = 0; i < 8; i += 1) {
    const mid = (low + high) * 0.5;
    const testX = layout.cx + edgeDx * mid;
    const testY = layout.cy + edgeDy * mid;
    const valid = window.outraThree.isDraftWorldPointOnPlatform(
      testX - layout.cx,
      testY - layout.cy
    );
    if (valid) {
      low = mid;
    } else {
      high = mid;
    }
  }

  actor.x = layout.cx + edgeDx * low;
  actor.y = layout.cy + edgeDy * low;
}

function isDraftTileTriggerHit(actor, tile) {
  if (!actor || !tile) return false;
  if (!Number.isFinite(actor.x) || !Number.isFinite(actor.y)) return false;
  if (!Number.isFinite(tile.x) || !Number.isFinite(tile.y)) return false;
  if (!Number.isFinite(tile.w) || !Number.isFinite(tile.h)) return false;

  // Keep trigger anchored to the tile box itself (no vertical bias), so it does not activate above the tile.
  const inset = 3;
  const minX = tile.x + inset;
  const maxX = tile.x + tile.w - inset;
  const minY = tile.y + inset;
  const maxY = tile.y + tile.h - inset;

  const actorRadius = Math.max(8, Math.min(18, Number(player?.r) || 18));

  // Primary check: actor anchor point is inside tile box.
  if (actor.x >= minX && actor.x <= maxX && actor.y >= minY && actor.y <= maxY) return true;

  // Secondary check: small overlap radius for edge forgiveness without early "above tile" activation.
  const closestX = Math.max(minX, Math.min(maxX, actor.x));
  const closestY = Math.max(minY, Math.min(maxY, actor.y));
  const dx = actor.x - closestX;
  const dy = actor.y - closestY;
  const triggerRadius = Math.max(4, actorRadius * 0.32);
  return (dx * dx + dy * dy) <= triggerRadius * triggerRadius;
}

function getDraftTileUnderPlayer(actor, layout) {
  if (!actor || !layout || !Array.isArray(layout.tileRects)) return null;
  for (const tile of layout.tileRects) {
    const spell = getDraftSpellById(tile.id);
    if (!spell || spell.disabled) continue;
    if (isDraftTileTriggerHit(actor, tile)) {
      return tile;
    }
  }
  return null;
}

function getDraftTileUnderCursor(layout) {
  if (!layout || !Array.isArray(layout.tileRects)) return null;
  if (!Number.isFinite(Number(mouse?.x)) || !Number.isFinite(Number(mouse?.y))) return null;

  const px = Number(mouse.x);
  const py = Number(mouse.y);
  for (const tile of layout.tileRects) {
    const spell = getDraftSpellById(tile.id);
    if (!spell || spell.disabled) continue;

    const inset = 3;
    const minX = tile.x + inset;
    const maxX = tile.x + tile.w - inset;
    const minY = tile.y + inset;
    const maxY = tile.y + tile.h - inset;
    if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
      return tile;
    }
  }
  return null;
}

function advanceDraftTurn() {
  const order = Array.isArray(draftState.order) ? draftState.order : [];
  const orderLength = Math.max(1, order.length);

  draftState.turnIndex += 1;
  draftState.activeIndex = Math.max(0, Math.min(orderLength - 1, draftState.turnIndex));
  draftState.turnTimeLeft = Math.max(0.5, Number(draftState.turnDuration) || 8);
  draftState.holdSpellId = null;
  draftState.holdTime = 0;

  if (draftState.turnIndex >= orderLength || !getDraftAvailableSpells().length) {
    draftState.complete = true;
    draftState.completeAt = 0;
    draftState.turnTimeLeft = 0;
    draftState.timeLeft = 0;
    draftState.turnFlash = null;
  } else {
    queueDraftTurnFlash(getDraftActivePlayerId());
  }
}

function commitDraftPick(spellId) {
  if (draftState.complete) return false;

  const activePlayerId = getDraftActivePlayerId();
  if (!activePlayerId) return false;

  const spell = getDraftSpellById(spellId);
  if (!spell || spell.disabled) return false;

  const picks = draftState.picks[activePlayerId] || [];
  if (picks.length >= 3) {
    advanceDraftTurn();
    if (typeof updateDraftOverlayUi === 'function') updateDraftOverlayUi();
    if (typeof updateHud === 'function') updateHud();
    return false;
  }

  spell.takenBy = activePlayerId;
  spell.disabled = true;
  picks.push(spell.id);
  draftState.picks[activePlayerId] = picks;

  queueDraftPickConfirmationFx(spell.id, activePlayerId, picks.length - 1);
  soundDraftPick();
  stopDraftSpellHoverSound();
  advanceDraftTurn();
  if (typeof updateDraftOverlayUi === 'function') updateDraftOverlayUi();
  if (typeof updateHud === 'function') updateHud();
  return true;
}

function tryDraftPickAtCursor() {
  if (gameState !== 'draft') return false;
  if (menuOpen || draftState.complete) return false;

  const activePlayerId = getDraftActivePlayerId();
  if (!activePlayerId || activePlayerId !== draftState.localPlayerId) return false;

  const layout = draftState.layout || buildDraftLayout();
  if (!layout) return false;

  const tile = getDraftTileUnderCursor(layout);
  if (!tile) return false;

  const picked = commitDraftPick(tile.id);
  if (picked) {
    draftState.holdSpellId = null;
    draftState.holdTime = 0;
  }
  return picked;
}

function autoAssignDraftPick() {
  const available = getDraftAvailableSpells();
  if (!available.length) {
    advanceDraftTurn();
    return;
  }

  const next = available[Math.floor(Math.random() * available.length)];
  commitDraftPick(next.id);
}

function getDraftLoadoutForLocalPlayer() {
  const selected = Array.from(
    new Set((draftState.picks[draftState.localPlayerId] || []).filter((id) => draftState.spellOrder.includes(id)))
  );

  return ['fire', ...selected.slice(0, 3)];
}

function getFullArenaLoadout() {
  return ['fire', 'hook', 'blink', 'shield', 'charge', 'shock', 'gust', 'wall', 'rewind'];
}

function resetDraftPhase() {
  const orderLength = Math.max(1, Array.isArray(draftState.order) ? draftState.order.length : 0);
  const turnDuration = Math.max(0.5, Number(draftState.turnDuration) || 8);
  const totalDuration = orderLength * turnDuration;
  const participantIds = getDraftParticipantIds();

  draftState.turnIndex = 0;
  draftState.activeIndex = 0;
  draftState.turnTimeLeft = turnDuration;
  draftState.elapsed = 0;
  draftState.totalDuration = totalDuration;
  draftState.timeLeft = turnDuration;
  draftState.holdSpellId = null;
  draftState.holdTime = 0;
  draftState.complete = false;
  draftState.completeAt = 0;
  draftState.turnFlash = null;
  const fxState = ensureDraftPickFxState();
  fxState.transfers.length = 0;
  fxState.ringPulses.length = 0;
  fxState.tileBursts.length = 0;

  draftState.spells = (Array.isArray(draftState.spellOrder) ? draftState.spellOrder : []).map((id) => ({
    id,
    label: getDraftSpellLabel(id),
    takenBy: null,
    disabled: false,
  }));

  const nextPicks = {};
  for (const id of participantIds) {
    nextPicks[id] = [];
  }
  draftState.picks = nextPicks;
  draftState.layout = buildDraftLayout();

  for (const id of participantIds) {
    const seat = draftState.layout?.seats?.[id] || { x: canvas.width * 0.5, y: canvas.height * 0.5 };
    if (!draftState.players[id]) {
      draftState.players[id] = { x: seat.x, y: seat.y, vx: 0, vy: 0, moveTimer: 0, dirX: 0, dirY: 0 };
    }
    draftState.players[id].x = seat.x;
    draftState.players[id].y = seat.y;
    draftState.players[id].vx = 0;
    draftState.players[id].vy = 0;
    draftState.players[id].moveTimer = 0;
    draftState.players[id].dirX = 0;
    draftState.players[id].dirY = 0;
  }

  queueDraftTurnFlash(getDraftActivePlayerId());
}

function updateDraftPhase(dt) {
  if (gameState !== 'draft') {
    stopDraftSpellHoverSound();
    return;
  }

  const layout = buildDraftLayout();
  draftState.layout = layout;
  const participantIds = Array.isArray(layout?.participantIds) && layout.participantIds.length
    ? layout.participantIds
    : getDraftParticipantIds();

  for (const id of participantIds) {
    const actor = draftState.players[id];
    if (!actor) continue;
    const seat = layout?.seats?.[id];
    if (!seat) continue;
    actor.x = seat.x;
    actor.y = seat.y;
    actor.vx = 0;
    actor.vy = 0;
    actor.moveTimer = 0;
    actor.dirX = 0;
    actor.dirY = 0;
  }

  draftState.elapsed += dt;

  if (!draftState.complete) {
    draftState.completeAt = 0;
    const activePlayer = getDraftActivePlayerId();
    if (activePlayer === draftState.localPlayerId) {
      const tile = getDraftTileUnderCursor(layout);
      if (!tile) {
        stopDraftSpellHoverSound();
        draftState.holdSpellId = null;
        draftState.holdTime = 0;
      } else {
        startDraftSpellHoverSound();
        if (draftState.holdSpellId !== tile.id) {
          draftState.holdSpellId = tile.id;
          draftState.holdTime = 0;
        }
        draftState.holdTime += dt;
        if (draftState.holdTime >= Math.max(0.1, Number(draftState.holdDuration) || 0.6)) {
          commitDraftPick(tile.id);
        }
      }
    } else {
      stopDraftSpellHoverSound();
      draftState.holdSpellId = null;
      draftState.holdTime = 0;
    }

    draftState.turnTimeLeft = Math.max(0, draftState.turnTimeLeft - dt);
    if (draftState.turnTimeLeft <= 0 && !draftState.complete) {
      autoAssignDraftPick();
    }
  } else {
    stopDraftSpellHoverSound();
    draftState.holdSpellId = null;
    draftState.holdTime = 0;
    const nowSec = performance.now() / 1000;
    if (!Number.isFinite(draftState.completeAt) || draftState.completeAt <= 0) {
      draftState.completeAt = nowSec;
    } else if (nowSec - draftState.completeAt >= Math.max(0, Number(draftState.autoStartDelay) || 1)) {
      startMatch();
      return;
    }
  }

  draftState.activeIndex = Math.max(0, Math.min(draftState.order.length - 1, draftState.turnIndex));
  draftState.timeLeft = draftState.complete ? 0 : draftState.turnTimeLeft;
}

function enterLobby() {
  stopDraftSpellHoverSound();
  gameState      = 'lobby';
  menuOpen       = false;
  waitingForBind = null;
  winnerText     = '';
  winnerReward   = null;
  resultTimer    = 0;
  overlay.style.display   = 'flex';
  hud.style.display       = 'none';
  topbar.style.display    = 'none';
  menuPanel.style.display = 'none';
  setCanvasCursorMode('default');
  syncCursorPhaseClass();
  renderLeaderboard();
  renderStore();
  renderInventory();
  nameInput.value = player.name;
  buildRankedPanel();
  buildKeybindsUI();
  drawLobbyPreview();
  setLobbyTab(activeLobbyTab);
  setMenuTab(activeMenuTab);
  player.score = getPlayerPoints(player.name);
  arenaIntro.active = false;
  arenaIntro.elapsed = 0;
  updateAimSensitivityUI();
  updateHud();
  refreshMobileControls();
}

function enterDraftRoom() {
  player.name = (nameInput.value || 'Player').trim().slice(0, 16) || 'Player';
  applyPlayerColors();
  saveProfile();
  player.score = getPlayerPoints(player.name);

  gameState      = 'draft';
  menuOpen       = false;
  waitingForBind = null;

  overlay.style.display   = 'none';
  hud.style.display       = 'none';
  topbar.style.display    = 'flex';
  menuPanel.style.display = 'none';
  setCanvasCursorMode('pointer');
  syncCursorPhaseClass();
  stopDraftSpellHoverSound();

  skillAimPreview.active = false;
  skillAimPreview.type = null;
  arenaIntro.active = false;
  arenaIntro.elapsed = 0;
  resetDraftPhase();

  updateAimSensitivityUI();
  updateHud();
  refreshMobileControls();
}

function startArenaIntroCountdown() {
  arenaIntro.active = true;
  arenaIntro.elapsed = 0;
}

function updateArenaIntroCountdown(dt) {
  if (!arenaIntro.active || gameState !== 'playing') return;

  arenaIntro.elapsed += dt;
  const preDelay = Math.max(0, Number(arenaIntro.preDelay) || 0);
  const countdownSeconds = Math.max(0, Number(arenaIntro.countdownSeconds) || 0);
  const fightDuration = Math.max(0, Number(arenaIntro.fightDuration) || 0);
  const postFightDelay = Math.max(0, Number(arenaIntro.postFightDelay) || 0);
  const totalDuration = preDelay + countdownSeconds + fightDuration + postFightDelay;
  if (arenaIntro.elapsed >= totalDuration) {
    arenaIntro.elapsed = totalDuration;
    arenaIntro.active = false;
  }
}

function getArenaIntroOverlayLabel() {
  if (gameState !== 'playing' || !arenaIntro.active) return '';

  const preDelay = Math.max(0, Number(arenaIntro.preDelay) || 0);
  const countdownSeconds = Math.max(0, Number(arenaIntro.countdownSeconds) || 0);
  const elapsed = Math.max(0, Number(arenaIntro.elapsed) || 0);
  if (elapsed < preDelay) return '';

  const phaseTime = elapsed - preDelay;
  if (phaseTime < countdownSeconds) {
    const secondsLeft = Math.ceil(countdownSeconds - phaseTime);
    return String(Math.max(1, secondsLeft));
  }

  if (phaseTime < countdownSeconds + Math.max(0, Number(arenaIntro.fightDuration) || 0)) {
    return 'FIGHT';
  }

  return '';
}

function isArenaPreFightLocked() {
  if (gameState !== 'playing' || !arenaIntro.active) return false;
  const preDelay = Math.max(0, Number(arenaIntro.preDelay) || 0);
  const countdownSeconds = Math.max(0, Number(arenaIntro.countdownSeconds) || 0);
  const fightDuration = Math.max(0, Number(arenaIntro.fightDuration) || 0);
  const postFightDelay = Math.max(0, Number(arenaIntro.postFightDelay) || 0);
  return arenaIntro.elapsed < preDelay + countdownSeconds + fightDuration + postFightDelay;
}

function startMatch(options = {}) {
  stopDraftSpellHoverSound();
  const skipArenaIntro = !!options.skipArenaIntro;
  startMusicIfNeeded();
  const fromDraft = gameState === 'draft';
  if (fromDraft && !draftState.complete) return;
  if (fromDraft && window.outraThree && typeof window.outraThree.forceCharacterSet === 'function') {
    window.outraThree.forceCharacterSet('arena');
  }
  player.name = (nameInput.value || 'Player').trim().slice(0, 16) || 'Player';
  applyPlayerColors();
  saveProfile();
  player.score = getPlayerPoints(player.name);
  activeSpellLoadout = fromDraft
    ? getDraftLoadoutForLocalPlayer()
    : getFullArenaLoadout();
  resetRound();
  gameState               = 'playing';
  arenaIntro.active = false;
  arenaIntro.elapsed = 0;
  if (!skipArenaIntro) {
    startArenaIntroCountdown();
  }
  overlay.style.display   = 'none';
  topbar.style.display    = 'flex';
  menuPanel.style.display = 'none';
  setCanvasCursorMode('crosshair');
  syncCursorPhaseClass();
  updateAimSensitivityUI();
  updateHud();
  refreshMobileControls();
}

// ── Main Update ───────────────────────────────────────────────
function update(dt) {
  updateMusic(dt);

  if (gameState !== 'draft') {
    stopDraftSpellHoverSound();
  }

  if (gameState === 'draft') {
    if (!menuOpen || draftState.complete) {
      updateDraftPhase(dt);
    } else {
      stopDraftSpellHoverSound();
    }
    updateHud();
    return;
  }

  if (gameState === 'lobby' || menuOpen) {
    updateHud();
    return;
  }

  if (gameState === 'result') {
    resultTimer -= dt;
    if (resultTimer <= 0) enterLobby();
  }

  updateArenaIntroCountdown(dt);
  const arenaPreFightLocked = isArenaPreFightLocked();

  if (!arenaPreFightLocked) {
    updateArenaShrink(dt);
    updatePotions(dt);
  }

  const keyMoveX = (keys[keybinds.right] ? 1 : 0) - (keys[keybinds.left] ? 1 : 0);
  const keyMoveY = (keys[keybinds.down]  ? 1 : 0) - (keys[keybinds.up]   ? 1 : 0);
  const moveX    = moveStick.active ? moveStick.dx : keyMoveX;
  const moveY    = moveStick.active ? moveStick.dy : keyMoveY;

  if (!isTouchDevice) {
    const aim    = normalized(mouse.x - player.x, mouse.y - player.y);
    player.aimX  = aim.x;
    player.aimY  = aim.y;
  }

  if ((gameState === 'playing' || gameState === 'result') && player.alive) {
    if (gameState === 'playing' && arenaPreFightLocked) {
      player.vx = 0;
      player.vy = 0;
    } else if (player.chargeActive) {
      updateArcaneCharge(dt);
    } else {
      if ((moveX || moveY) && gameState === 'playing') moveActorWithSlide(player, moveX, moveY, dt);
      updateActorPhysics(player, dt);
    }
    recordRewindHistory();
  }

  if (dummyEnabled && (gameState === 'playing' || gameState === 'result') && dummy.alive) {
    if (gameState === 'playing' && arenaPreFightLocked) {
      dummy.vx = 0;
      dummy.vy = 0;
    } else {
      moveDummyAI(dt);
      updateActorPhysics(dummy, dt);
    }
  }

  const dummyDist = distance(dummy.x, dummy.y, arena.cx, arena.cy);
  if (dummyEnabled && dummy.alive && dummyDist > arena.radius) {
    damageDummy(10 * dt * 4);
    lavaSoundTimer -= dt;
    if (lavaSoundTimer <= 0) { soundLava(); lavaSoundTimer = 0.26; }
  }
  if (dummyEnabled && dummy.alive && dummyDist > arena.radius + 120) killDummy('fell fully into lava');

  const playerDist = distance(player.x, player.y, arena.cx, arena.cy);
  if (player.alive && playerDist > arena.radius) {
    lavaTick -= dt;
    if (lavaTick <= 0) { damagePlayer(8); soundLava(); lavaTick = 0.28; }
  } else {
    lavaTick = 0;
  }
  if (player.alive && playerDist > arena.radius + 120) killPlayer('fell fully into lava');

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    const projectileTrailCount = isPerformanceModeEnabled() ? 1 : 2;
    for (let n = 0; n < projectileTrailCount; n++) {
      addParticle({
        x: p.x, y: p.y,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 40,
        life: 0.18,
        size: 2 + Math.random() * 2,
        color: p.owner === 'player' ? 'rgba(255,140,40,0.9)' : 'rgba(130,220,255,0.9)'
      });
    }

    if (circleHitsObstacle(p.x, p.y, p.r)) {
      spawnBurst(p.x, p.y, 'rgba(255,200,120,0.9)', 10, 120);
      projectiles.splice(i, 1);
      continue;
    }

    if (dummyEnabled && p.owner === 'player' && dummy.alive && distance(p.x, p.y, dummy.x, dummy.y) <= p.r + dummy.r) {
      const dir = normalized(dummy.x - player.x, dummy.y - player.y);
      spawnArenaHitFlash(p.x, p.y, 'dummy');
      damageDummy(p.damage);
      dummy.vx += dir.x * p.knockback;
      dummy.vy += dir.y * p.knockback;
      spawnBurst(p.x, p.y, 'rgba(255,170,70,0.95)', 14, 160);
      projectiles.splice(i, 1);
      continue;
    }

    if (p.owner === 'dummy' && player.alive && distance(p.x, p.y, player.x, player.y) <= p.r + player.r) {
      const dir = normalized(player.x - dummy.x, player.y - dummy.y);
      spawnArenaHitFlash(p.x, p.y, 'player');
      damagePlayer(p.damage);
      player.vx += dir.x * p.knockback;
      player.vy += dir.y * p.knockback;
      spawnBurst(p.x, p.y, 'rgba(255,170,70,0.95)', 14, 160);
      projectiles.splice(i, 1);
      continue;
    }

    if (p.life <= 0 || distance(p.x, p.y, arena.cx, arena.cy) > arena.radius + 180) {
      projectiles.splice(i, 1);
    }
  }

  for (let i = hooks.length - 1; i >= 0; i--) {
    const h = hooks[i];
    const targetActor = h.owner === 'player' ? dummy : player;
    const caster = h.owner === 'player' ? player : dummy;

    if (h.owner === 'player' && h.state === 'pulling' && (!dummyEnabled || !dummy.alive)) {
      hooks.splice(i, 1);
      continue;
    }

    if (h.owner === 'dummy' && (!dummyEnabled || !dummy.alive)) {
      hooks.splice(i, 1);
      continue;
    }

    if (h.state === 'flying') {
      h.progress += dt * h.speed;
      h.x = h.sx + (h.tx - h.sx) * Math.min(1, h.progress);
      h.y = h.sy + (h.ty - h.sy) * Math.min(1, h.progress);

      if (circleHitsObstacle(h.x, h.y, 4)) {
        hooks.splice(i, 1);
        continue;
      }

      if (dummyEnabled && targetActor.alive && distance(h.x, h.y, targetActor.x, targetActor.y) <= targetActor.r + 6) {
        h.state = 'pulling';
        if (h.owner === 'player') {
          spawnArenaHitFlash(h.x, h.y, 'dummy');
          damageDummy(h.damage);
        } else {
          spawnArenaHitFlash(h.x, h.y, 'player');
          damagePlayer(h.damage);
        }
        spawnBurst(h.x, h.y, 'rgba(180,220,255,0.9)', 12, 120);
      } else if (h.progress >= 1) {
        hooks.splice(i, 1);
        continue;
      }
    } else {
      const dir = normalized(caster.x - targetActor.x, caster.y - targetActor.y);
      const pullSpeed = h.owner === 'player' ? 760 : 720;

      targetActor.vx = dir.x * pullSpeed;
      targetActor.vy = dir.y * pullSpeed;
      targetActor.x += dir.x * pullSpeed * dt;
      targetActor.y += dir.y * pullSpeed * dt;
      pushActorOutOfObstacle(targetActor);
      h.x = targetActor.x;
      h.y = targetActor.y;

      if (distance(targetActor.x, targetActor.y, caster.x, caster.y) <= caster.r + targetActor.r + 6) {
        targetActor.x = caster.x + dir.x * (caster.r + targetActor.r + 6);
        targetActor.y = caster.y + dir.y * (caster.r + targetActor.r + 6);
        hooks.splice(i, 1);
        continue;
      }

      if (circleHitsObstacle(targetActor.x, targetActor.y, targetActor.r) || !targetActor.alive || !caster.alive) {
        hooks.splice(i, 1);
      }
    }
  }

  for (let i = walls.length - 1; i >= 0; i--) {
    const wall = walls[i];
    wall.life -= dt;

    if (wall.life <= 0) {
      for (const seg of wall.segments) {
        spawnBurst(seg.x, seg.y, 'rgba(140, 190, 255, 0.45)', 3, 55);
      }
      walls.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  for (let i = damageTexts.length - 1; i >= 0; i--) {
    const d = damageTexts[i];
    d.y += d.vy * dt;
    d.life -= dt;
    if (d.life <= 0) damageTexts.splice(i, 1);
  }

  updateHud();
}
