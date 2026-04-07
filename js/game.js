// ── Persistence ───────────────────────────────────────────────
function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: player.name, selectedColorIndex, keybinds, profile }));
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

    if (Number.isInteger(data.selectedColorIndex) && colorChoices[data.selectedColorIndex]) {
      selectedColorIndex = data.selectedColorIndex;
    }

    if (data.keybinds && typeof data.keybinds === 'object') {
      keybinds = { ...defaultBinds, ...data.keybinds };
    }

    if (data.profile && typeof data.profile === 'object') {
      profile.wlk = Number(data.profile.wlk) || 0;
      profile.musicMuted = !!data.profile.musicMuted;

      if (typeof data.profile.aimSensitivity === 'number') {
        profile.aimSensitivity = data.profile.aimSensitivity;
      }

      profile.store = { ...profile.store, ...(data.profile.store || {}) };
      profile.equipped = { ...profile.equipped, ...(data.profile.equipped || {}) };
    }

    if (usedLegacy) {
      saveProfile();
    }
  } catch {}
  musicMuted = profile.musicMuted;
  if (typeof profile.aimSensitivity !== 'number') profile.aimSensitivity = 0.7;
}

// ── Leaderboard ───────────────────────────────────────────────
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

// ── Math Helpers ──────────────────────────────────────────────

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
function spawnBurst(x, y, color, count = 16, speed = 180) {
  for (let i = 0; i < count; i++)
    particles.push({
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
function applyPlayerColors() {
  const choice = colorChoices[selectedColorIndex] || colorChoices[0];
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

  // cooldown
  player.shockReadyAt = now + player.shockCooldown;

  // animation
  if (window.outraThree && window.outraThree.triggerCast) {
    window.outraThree.triggerCast();
  }

  // sound
  soundShock();

  // SETTINGS
  const range = 115;
  const angle = Math.PI / 3; // 60° cone
  const damage = 14;
  const knockback = 680;

  // HIT CHECK
  if (dummyEnabled && dummy.alive) {
    const dx = dummy.x - player.x;
    const dy = dummy.y - player.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= range) {
      const nd = normalized(dx, dy);

      // angle check (cone)
      const dot = nd.x * dir.x + nd.y * dir.y;

      if (dot > Math.cos(angle / 2)) {
        damageDummy(damage);

        dummy.vx += nd.x * knockback;
        dummy.vy += nd.y * knockback;

        spawnBurst(
          dummy.x,
          dummy.y,
          'rgba(255,200,120,0.95)',
          18,
          200
        );
      }
    }
  }

  // player effect
  spawnBurst(
    player.x,
    player.y,
    'rgba(255,180,120,0.7)',
    12,
    120
  );
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

  spawnBurst(
    player.x,
    player.y,
    'rgba(170,245,255,0.92)',
    18,
    radius * 1.7
  );

  for (let i = 0; i < 18; i++) {
    const ang = (Math.PI * 2 * i) / 18 + Math.random() * 0.18;
    const speed = 180 + Math.random() * 120;
    particles.push({
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

  for (let i = 0; i < 14; i++) {
    const p = i / 13;
    particles.push({
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

    particles.push({
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
  if (playerWon) {
    awardWinRewards(player.name);
    soundWin();
    winnerText = `${player.name} wins! +3 pts +1 WLK`;
  } else {
    soundLose();
    winnerText = dummyEnabled ? 'Dummy wins!' : 'Round ended';
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
  activeSpellLoadout   = ['fire', 'hook', 'blink', 'shield', 'charge', 'shock', 'gust', 'wall', 'rewind'];

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

function enterLobby() {
  gameState      = 'lobby';
  menuOpen       = false;
  waitingForBind = null;
  winnerText     = '';
  resultTimer    = 0;
  overlay.style.display   = 'flex';
  hud.style.display       = 'none';
  topbar.style.display    = 'none';
  menuPanel.style.display = 'none';
  canvas.style.cursor     = 'default';
  renderLeaderboard();
  renderStore();
  renderInventory();
  nameInput.value = player.name;
  buildColorChoices();
  buildKeybindsUI();
  drawLobbyPreview();
  setLobbyTab(activeLobbyTab);
  setMenuTab(activeMenuTab);
  player.score = getPlayerPoints(player.name);
  updateAimSensitivityUI();
  updateHud();
  refreshMobileControls();
}

function startMatch() {
  startMusicIfNeeded();
  player.name = (nameInput.value || 'Player').trim().slice(0, 16) || 'Player';
  applyPlayerColors();
  saveProfile();
  player.score = getPlayerPoints(player.name);
  resetRound();
  gameState               = 'playing';
  overlay.style.display   = 'none';
  topbar.style.display    = 'flex';
  menuPanel.style.display = 'none';
  canvas.style.cursor     = isTouchDevice ? 'default' : 'crosshair';
  updateAimSensitivityUI();
  updateHud();
  refreshMobileControls();
}

// ── Main Update ───────────────────────────────────────────────
function update(dt) {
  updateMusic(dt);

  if (gameState === 'lobby' || menuOpen) {
    updateHud();
    return;
  }

  if (gameState === 'result') {
    resultTimer -= dt;
    if (resultTimer <= 0) enterLobby();
  }

  updateArenaShrink(dt);
  updatePotions(dt);

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
    if (player.chargeActive) {
      updateArcaneCharge(dt);
    } else {
      if ((moveX || moveY) && gameState === 'playing') moveActorWithSlide(player, moveX, moveY, dt);
      updateActorPhysics(player, dt);
    }
    recordRewindHistory();
  }

  if (dummyEnabled && (gameState === 'playing' || gameState === 'result') && dummy.alive) {
    moveDummyAI(dt);
    updateActorPhysics(dummy, dt);
  }

  // Dummy lava damage
  const dummyDist = distance(dummy.x, dummy.y, arena.cx, arena.cy);
  if (dummyEnabled && dummy.alive && dummyDist > arena.radius) {
    damageDummy(10 * dt * 4);
    lavaSoundTimer -= dt;
    if (lavaSoundTimer <= 0) { soundLava(); lavaSoundTimer = 0.26; }
  }
  if (dummyEnabled && dummy.alive && dummyDist > arena.radius + 120) killDummy('fell fully into lava');

  // Player lava damage
  const playerDist = distance(player.x, player.y, arena.cx, arena.cy);
  if (player.alive && playerDist > arena.radius) {
    lavaTick -= dt;
    if (lavaTick <= 0) { damagePlayer(8); soundLava(); lavaTick = 0.28; }
  } else {
    lavaTick = 0;
  }
  if (player.alive && playerDist > arena.radius + 120) killPlayer('fell fully into lava');

  // Projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    for (let n = 0; n < 2; n++)
      particles.push({
        x: p.x, y: p.y,
        vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40,
        life: 0.18, size: 2 + Math.random() * 2,
        color: p.owner === 'player' ? 'rgba(255,140,40,0.9)' : 'rgba(130,220,255,0.9)'
      });
    if (circleHitsObstacle(p.x, p.y, p.r)) {
      spawnBurst(p.x, p.y, 'rgba(255,200,120,0.9)', 10, 120);
      projectiles.splice(i, 1); continue;
    }
    if (dummyEnabled && p.owner === 'player' && dummy.alive && distance(p.x, p.y, dummy.x, dummy.y) <= p.r + dummy.r) {
      const dir = normalized(dummy.x - player.x, dummy.y - player.y);
      damageDummy(p.damage);
      dummy.vx += dir.x * p.knockback;
      dummy.vy += dir.y * p.knockback;
      spawnBurst(p.x, p.y, 'rgba(255,170,70,0.95)', 14, 160);
      projectiles.splice(i, 1); continue;
    }
    if (p.owner === 'dummy' && player.alive && distance(p.x, p.y, player.x, player.y) <= p.r + player.r) {
      const dir = normalized(player.x - dummy.x, player.y - dummy.y);
      damagePlayer(p.damage);
      player.vx += dir.x * p.knockback;
      player.vy += dir.y * p.knockback;
      spawnBurst(p.x, p.y, 'rgba(255,170,70,0.95)', 14, 160);
      projectiles.splice(i, 1); continue;
    }
    if (p.life <= 0 || distance(p.x, p.y, arena.cx, arena.cy) > arena.radius + 180) projectiles.splice(i, 1);
  }

  // Hooks
  for (let i = hooks.length - 1; i >= 0; i--) {
    const h            = hooks[i];
    const targetActor  = h.owner === 'player' ? dummy : player;
    const caster       = h.owner === 'player' ? player : dummy;

    if (h.owner === 'player' && h.state === 'pulling' && (!dummyEnabled || !dummy.alive)) { hooks.splice(i, 1); continue; }
    if (h.owner === 'dummy'  && (!dummyEnabled || !dummy.alive))                          { hooks.splice(i, 1); continue; }

    if (h.state === 'flying') {
      h.progress += dt * h.speed;
      h.x = h.sx + (h.tx - h.sx) * Math.min(1, h.progress);
      h.y = h.sy + (h.ty - h.sy) * Math.min(1, h.progress);

      if (circleHitsObstacle(h.x, h.y, 4)) { hooks.splice(i, 1); continue; }

      if (dummyEnabled && targetActor.alive && distance(h.x, h.y, targetActor.x, targetActor.y) <= targetActor.r + 6) {
        h.state = 'pulling';
        if (h.owner === 'player') damageDummy(h.damage);
        else damagePlayer(h.damage);
        spawnBurst(h.x, h.y, 'rgba(180,220,255,0.9)', 12, 120);
      } else if (h.progress >= 1) {
        hooks.splice(i, 1); continue;
      }
    } else {
      const dir       = normalized(caster.x - targetActor.x, caster.y - targetActor.y);
      const pullSpeed = h.owner === 'player' ? 760 : 720;
      targetActor.vx  = dir.x * pullSpeed;
      targetActor.vy  = dir.y * pullSpeed;
      targetActor.x  += dir.x * pullSpeed * dt;
      targetActor.y  += dir.y * pullSpeed * dt;
      pushActorOutOfObstacle(targetActor);
      h.x = targetActor.x;
      h.y = targetActor.y;
      if (distance(targetActor.x, targetActor.y, caster.x, caster.y) <= caster.r + targetActor.r + 6) {
        targetActor.x = caster.x + dir.x * (caster.r + targetActor.r + 6);
        targetActor.y = caster.y + dir.y * (caster.r + targetActor.r + 6);
        hooks.splice(i, 1); continue;
      }
      if (circleHitsObstacle(targetActor.x, targetActor.y, targetActor.r) || !targetActor.alive || !caster.alive)
        hooks.splice(i, 1);
    }
  }

  // Walls
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

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Damage texts
  for (let i = damageTexts.length - 1; i >= 0; i--) {
    const d = damageTexts[i];
    d.y += d.vy * dt; d.life -= dt;
    if (d.life <= 0) damageTexts.splice(i, 1);
  }

  updateHud();
}
