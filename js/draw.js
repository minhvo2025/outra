// ── Cosmetics ─────────────────────────────────────────────────
function drawCosmetics(drawCtx, x, y, scale = 1) {
  if (profile.equipped.boots) {
    drawCtx.fillStyle = '#6a472d';
    drawCtx.fillRect(x - 22 * scale, y + 20 * scale, 14 * scale, 18 * scale);
    drawCtx.fillRect(x +  8 * scale, y + 20 * scale, 14 * scale, 18 * scale);
  }
  if (profile.equipped.sweater) {
    drawCtx.fillStyle = '#7b274c';
    if (typeof drawCtx.roundRect === 'function') {
      drawCtx.beginPath();
      drawCtx.roundRect(x - 28 * scale, y - 8 * scale, 56 * scale, 42 * scale, 12 * scale);
      drawCtx.fill();
    } else {
      drawCtx.fillRect(x - 28 * scale, y - 8 * scale, 56 * scale, 42 * scale);
    }
  }
  const hat = profile.equipped.hat;
  if (hat === 'wizardHat') {
    drawCtx.fillStyle = '#3f2a7d';
    drawCtx.beginPath();
    drawCtx.moveTo(x - 24 * scale, y - 18 * scale);
    drawCtx.lineTo(x,              y - 72 * scale);
    drawCtx.lineTo(x + 24 * scale, y - 18 * scale);
    drawCtx.closePath();
    drawCtx.fill();
    drawCtx.fillRect(x - 28 * scale, y - 20 * scale, 56 * scale, 8 * scale);
  } else if (hat === 'beanie') {
    drawCtx.fillStyle = '#2f7b5b';
    drawCtx.beginPath();
    drawCtx.arc(x, y - 24 * scale, 24 * scale, Math.PI, 0);
    drawCtx.fill();
    drawCtx.fillRect(x - 24 * scale, y - 24 * scale, 48 * scale, 10 * scale);
  } else if (hat === 'crown') {
    drawCtx.fillStyle = '#d8b11e';
    drawCtx.beginPath();
    drawCtx.moveTo(x - 24 * scale, y - 18 * scale);
    drawCtx.lineTo(x - 16 * scale, y - 36 * scale);
    drawCtx.lineTo(x -  4 * scale, y - 18 * scale);
    drawCtx.lineTo(x,              y - 40 * scale);
    drawCtx.lineTo(x +  4 * scale, y - 18 * scale);
    drawCtx.lineTo(x + 16 * scale, y - 36 * scale);
    drawCtx.lineTo(x + 24 * scale, y - 18 * scale);
    drawCtx.closePath();
    drawCtx.fill();
  } else if (hat === 'strawHat') {
    drawCtx.fillStyle = '#cba25f';
    drawCtx.beginPath();
    drawCtx.ellipse(x, y - 26 * scale, 34 * scale, 8 * scale, 0, 0, Math.PI * 2);
    drawCtx.fill();
    drawCtx.fillRect(x - 18 * scale, y - 46 * scale, 36 * scale, 20 * scale);
  }
}

// ── Lobby Preview ─────────────────────────────────────────────
function drawLobbyPreview() {
  if (!previewCtx || !previewCanvas) return;

  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

  const has3DPreview =
    window.outraThree &&
    typeof window.outraThree.renderLobbyPreview === 'function';

  if (has3DPreview) {
    window.outraThree.renderLobbyPreview();
    return;
  }

  // minimal fallback only, no fake boxed window
  const x = previewCanvas.width / 2;
  const y = previewCanvas.height * 0.68;

  previewCtx.fillStyle = 'rgba(0,0,0,0.22)';
  previewCtx.beginPath();
  previewCtx.ellipse(x, y + 52, 54, 18, 0, 0, Math.PI * 2);
  previewCtx.fill();

  previewCtx.fillStyle = player.bodyColor;
  previewCtx.beginPath();
  previewCtx.arc(x, y, 34, 0, Math.PI * 2);
  previewCtx.fill();

  drawCosmetics(previewCtx, x, y, 1);

  previewCtx.fillStyle = player.wandColor;
  previewCtx.save();
  previewCtx.translate(x, y);
  previewCtx.rotate(-0.3);
  previewCtx.fillRect(4, -4, 34, 8);
  previewCtx.restore();
}

// ── Arena ─────────────────────────────────────────────────────
function drawLavaRingBand(innerR, outerR, fillStyle) {
  ctx.beginPath();
  ctx.arc(arena.cx, arena.cy, outerR, 0, Math.PI * 2);
  ctx.arc(arena.cx, arena.cy, innerR, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

const LAVA_QUALITY_PRESETS = {
  normal: {
    waveCount: 56,
    emberCount: 28,
    crackCount: 24,
    pocketCount: 10,
    dynamicFps: 60,
    edgeOuterBlur: 12,
    edgeInnerBlur: 6,
    simpleWaveShading: false,
    simplePocketShading: false,
  },
  performance: {
    waveCount: 16,
    emberCount: 8,
    crackCount: 6,
    pocketCount: 3,
    dynamicFps: 24,
    edgeOuterBlur: 0,
    edgeInnerBlur: 0,
    simpleWaveShading: true,
    simplePocketShading: true,
  },
};

const lavaRenderCache = {
  staticCanvas: null,
  staticCtx: null,
  dynamicCanvas: null,
  dynamicCtx: null,
  staticKey: '',
  dynamicKey: '',
  lastDynamicUpdateSec: 0,
  lastPerformanceMode: null,
};

function isArenaPerformanceModeEnabled() {
  const forced = typeof FORCE_ARENA_PERFORMANCE_MODE !== 'undefined' && !!FORCE_ARENA_PERFORMANCE_MODE;
  return forced || !!(profile && profile.performanceMode);
}

function getLavaQualityPreset() {
  return isArenaPerformanceModeEnabled()
    ? LAVA_QUALITY_PRESETS.performance
    : LAVA_QUALITY_PRESETS.normal;
}

function getLavaCacheKey(has3DFloor) {
  return [
    canvas.width,
    canvas.height,
    arena.cx.toFixed(2),
    arena.cy.toFixed(2),
    arena.radius.toFixed(2),
    has3DFloor ? 1 : 0,
  ].join('|');
}

function ensureLavaCacheCanvas(type) {
  const canvasKey = type === 'static' ? 'staticCanvas' : 'dynamicCanvas';
  const ctxKey = type === 'static' ? 'staticCtx' : 'dynamicCtx';

  if (!lavaRenderCache[canvasKey]) {
    lavaRenderCache[canvasKey] = document.createElement('canvas');
    lavaRenderCache[ctxKey] = lavaRenderCache[canvasKey].getContext('2d');
  }

  const layerCanvas = lavaRenderCache[canvasKey];
  if (layerCanvas.width !== canvas.width || layerCanvas.height !== canvas.height) {
    layerCanvas.width = canvas.width;
    layerCanvas.height = canvas.height;
  }

  return lavaRenderCache[ctxKey];
}

function drawArenaStaticLayer(targetCtx, has3DFloor) {
  const prevCtx = ctx;
  ctx = targetCtx;

  const bgGrad = ctx.createRadialGradient(
    arena.cx,
    arena.cy,
    Math.max(40, arena.radius * 0.2),
    arena.cx,
    arena.cy,
    arena.radius + 420
  );
  bgGrad.addColorStop(0, '#24130f');
  bgGrad.addColorStop(0.55, '#1b0c0a');
  bgGrad.addColorStop(1, '#110807');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const lavaGrad = ctx.createRadialGradient(
    arena.cx,
    arena.cy,
    arena.radius + 10,
    arena.cx,
    arena.cy,
    arena.radius + 210
  );
  lavaGrad.addColorStop(0, '#ff8d2f');
  lavaGrad.addColorStop(0.26, '#ff6422');
  lavaGrad.addColorStop(0.58, '#d93a12');
  lavaGrad.addColorStop(1, '#6e1407');
  drawLavaRingBand(arena.radius + 2, arena.radius + 210, lavaGrad);

  const hotBand = ctx.createRadialGradient(
    arena.cx,
    arena.cy,
    arena.radius - 10,
    arena.cx,
    arena.cy,
    arena.radius + 64
  );
  hotBand.addColorStop(0, 'rgba(255,240,180,0.00)');
  hotBand.addColorStop(0.55, 'rgba(255,188,84,0.42)');
  hotBand.addColorStop(1, 'rgba(255,94,28,0.00)');
  drawLavaRingBand(arena.radius - 2, arena.radius + 64, hotBand);

  if (!has3DFloor) {
    ctx.fillStyle = '#3a4047';
    ctx.beginPath();
    ctx.arc(arena.cx, arena.cy, arena.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#8a939e';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(arena.cx, arena.cy, arena.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx = prevCtx;
}

function drawLavaWaves(time, preset) {
  const waveCount = preset.waveCount;

  for (let i = 0; i < waveCount; i++) {
    const t = i / waveCount;
    const baseAngle = t * Math.PI * 2;

    const pulseA = Math.sin(time * 1.8 + i * 0.7) * 14;
    const pulseB = Math.sin(time * 3.1 - i * 0.45) * 7;
    const radius = arena.radius + 48 + pulseA + pulseB;

    const angle = baseAngle + Math.sin(time * 0.7 + i) * 0.05;
    const x = arena.cx + Math.cos(angle) * radius;
    const y = arena.cy + Math.sin(angle) * radius;

    const size = 10 + Math.sin(time * 2.4 + i * 1.3) * 2.5;

    if (preset.simpleWaveShading) {
      ctx.fillStyle = 'rgba(255, 176, 72, 0.14)';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(6, size * 1.1), 0, Math.PI * 2);
      ctx.fill();
    } else {
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(7, size * 1.5));
      g.addColorStop(0, 'rgba(255, 238, 170, 0.24)');
      g.addColorStop(0.35, 'rgba(255, 176, 72, 0.16)');
      g.addColorStop(1, 'rgba(255, 90, 25, 0)');

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(7, size * 1.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawLavaEmbers(time, preset) {
  const emberCount = preset.emberCount;

  for (let i = 0; i < emberCount; i++) {
    const seed = i * 17.173;
    const angle = (i / emberCount) * Math.PI * 2 + Math.sin(time * 0.45 + seed) * 0.06;

    const ringOffset =
      86 +
      Math.sin(time * 1.7 + seed * 0.8) * 14 +
      Math.cos(time * 2.6 + seed * 0.35) * 6;

    const rise = (Math.sin(time * 3.4 + seed) * 0.5 + 0.5) * 14;
    const x = arena.cx + Math.cos(angle) * (arena.radius + ringOffset);
    const y = arena.cy + Math.sin(angle) * (arena.radius + ringOffset) - rise;

    const r = 2 + (Math.sin(time * 4.2 + seed * 1.1) * 0.5 + 0.5) * 3.2;
    const alpha = 0.16 + (Math.sin(time * 5.3 + seed) * 0.5 + 0.5) * 0.22;

    ctx.fillStyle = `rgba(255, 225, 140, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLavaCracks(time, preset) {
  const crackCount = preset.crackCount;

  ctx.save();
  ctx.lineCap = 'round';

  for (let i = 0; i < crackCount; i++) {
    const a = (i / crackCount) * Math.PI * 2 + time * 0.05;
    const inner = arena.radius + 18 + Math.sin(time * 2.2 + i * 0.9) * 6;
    const outer = arena.radius + 82 + Math.sin(time * 1.5 + i * 0.55) * 10;

    const x1 = arena.cx + Math.cos(a) * inner;
    const y1 = arena.cy + Math.sin(a) * inner;
    const x2 = arena.cx + Math.cos(a + Math.sin(time + i) * 0.035) * outer;
    const y2 = arena.cy + Math.sin(a + Math.sin(time + i) * 0.035) * outer;

    ctx.strokeStyle = 'rgba(255, 206, 120, 0.08)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawLavaEdgeGlow(time, preset) {
  const glowR = arena.radius + 14 + Math.sin(time * 2.1) * 1.5;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 184, 90, 0.42)';
  ctx.lineWidth = 8;
  ctx.shadowColor = 'rgba(255, 120, 40, 0.32)';
  ctx.shadowBlur = preset.edgeOuterBlur;
  ctx.beginPath();
  ctx.arc(arena.cx, arena.cy, glowR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 245, 200, 0.16)';
  ctx.lineWidth = 2;
  ctx.shadowBlur = preset.edgeInnerBlur;
  ctx.beginPath();
  ctx.arc(arena.cx, arena.cy, glowR - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLavaPockets(time, preset) {
  const pocketCount = Math.max(1, preset.pocketCount);
  for (let i = 0; i < pocketCount; i++) {
    const ang = (i / pocketCount) * Math.PI * 2 + time * 0.12 + Math.sin(i * 0.8 + time) * 0.04;
    const dist = arena.radius + 128 + Math.sin(time * 1.9 + i * 1.4) * 20;
    const x = arena.cx + Math.cos(ang) * dist;
    const y = arena.cy + Math.sin(ang) * dist;
    const rr = 16 + Math.sin(time * 2.8 + i) * 4;

    if (preset.simplePocketShading) {
      ctx.fillStyle = 'rgba(255, 176, 76, 0.16)';
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const pocket = ctx.createRadialGradient(x, y, 0, x, y, rr * 1.5);
      pocket.addColorStop(0, 'rgba(255, 240, 190, 0.20)');
      pocket.addColorStop(0.32, 'rgba(255, 176, 76, 0.14)');
      pocket.addColorStop(1, 'rgba(255, 90, 25, 0)');
      ctx.fillStyle = pocket;
      ctx.beginPath();
      ctx.arc(x, y, rr * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawArenaDynamicLayer(targetCtx, time, preset) {
  const prevCtx = ctx;
  ctx = targetCtx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawLavaWaves(time, preset);
  drawLavaCracks(time, preset);
  drawLavaEmbers(time, preset);
  drawLavaEdgeGlow(time, preset);
  drawLavaPockets(time, preset);
  ctx = prevCtx;
}

function drawArena() {
  const time = performance.now() * 0.001;
  const preset = getLavaQualityPreset();

  const has3DFloor =
    window.outraThree &&
    typeof window.outraThree.isArenaFloorRenderedIn3D === 'function' &&
    window.outraThree.isArenaFloorRenderedIn3D();

  const perfMode = isArenaPerformanceModeEnabled();
  if (lavaRenderCache.lastPerformanceMode !== perfMode) {
    lavaRenderCache.staticKey = '';
    lavaRenderCache.dynamicKey = '';
    lavaRenderCache.lastDynamicUpdateSec = 0;
    lavaRenderCache.lastPerformanceMode = perfMode;
  }

  const cacheKey = getLavaCacheKey(has3DFloor);
  const staticCtx = ensureLavaCacheCanvas('static');
  const dynamicCtx = ensureLavaCacheCanvas('dynamic');

  if (lavaRenderCache.staticKey !== cacheKey) {
    staticCtx.clearRect(0, 0, canvas.width, canvas.height);
    drawArenaStaticLayer(staticCtx, has3DFloor);
    lavaRenderCache.staticKey = cacheKey;
  }

  const dynamicFrameInterval = 1 / Math.max(15, preset.dynamicFps);
  const shouldRefreshDynamic =
    lavaRenderCache.dynamicKey !== cacheKey ||
    (time - lavaRenderCache.lastDynamicUpdateSec) >= dynamicFrameInterval;

  if (shouldRefreshDynamic) {
    drawArenaDynamicLayer(dynamicCtx, time, preset);
    lavaRenderCache.dynamicKey = cacheKey;
    lavaRenderCache.lastDynamicUpdateSec = time;
  }

  if (lavaRenderCache.staticCanvas) ctx.drawImage(lavaRenderCache.staticCanvas, 0, 0);
  if (lavaRenderCache.dynamicCanvas) ctx.drawImage(lavaRenderCache.dynamicCanvas, 0, 0);
}

// ── Obstacles ─────────────────────────────────────────────────
function drawObstacles() {
  for (const obstacle of obstacles) {
    ctx.fillStyle = '#59616c';
    ctx.beginPath();
    ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#98a2ad';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(obstacle.x, obstacle.y, obstacle.r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(obstacle.x + 4, obstacle.y + 5, obstacle.r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWalls() {
  for (const wall of walls) {
    const alpha = Math.max(0.3, Math.min(1, wall.life / wall.maxLife));
    const start = wall.segments[0];
    const end = wall.segments[wall.segments.length - 1];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(145, 195, 255, ${0.92 * alpha})`;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.strokeStyle = `rgba(235, 245, 255, ${0.65 * alpha})`;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    for (const seg of wall.segments) {
      ctx.fillStyle = `rgba(110, 165, 235, ${0.18 * alpha})`;
      ctx.beginPath();
      ctx.arc(seg.x, seg.y, seg.r + 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(158, 204, 255, ${0.92 * alpha})`;
      ctx.beginPath();
      ctx.arc(seg.x, seg.y, seg.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ── Potions ───────────────────────────────────────────────────
function drawPotions() {
  for (const potion of potions) {
    ctx.fillStyle = '#45e37b';
    ctx.beginPath();
    ctx.arc(potion.x, potion.y, potion.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(230,255,235,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(potion.x - 2, potion.y - 6, 4, 12);
    ctx.fillRect(potion.x - 6, potion.y - 2, 12, 4);
  }
}

// ── Actors ────────────────────────────────────────────────────
function drawHealthBar(actor, color) {
  const width = 56, height = 8;
  const x = actor.x - width / 2;
  const y = actor.y - actor.r - 22;
  const ratio = Math.max(0, actor.hp / actor.maxHp);

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, (width - 2) * ratio, height - 2);

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
}

function drawNameTag(actor) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(actor.name, actor.x, actor.y - actor.r - 30);
  ctx.textAlign = 'left';
}

function drawPlayer() {
  // Arena character rendering is 3D-only; keep HUD overlays on canvas.
  drawHealthBar(player, '#62f36d');
  drawNameTag(player);

  const now = performance.now() / 1000;

  if (now < player.shieldUntil) {
    ctx.save();
    ctx.strokeStyle = 'rgba(120,190,255,0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = 'rgba(120,190,255,1)';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (player.chargeActive) {
    ctx.save();
    ctx.strokeStyle = 'rgba(196,150,255,0.95)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = 'rgba(196,150,255,1)';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawDummy() {
  // Arena dummy rendering is 3D-only; keep HUD overlays on canvas.
  drawHealthBar(dummy, '#ff8c5a');
  drawNameTag(dummy);
}

// ── Projectiles ───────────────────────────────────────────────
function drawProjectiles() {
  for (const p of projectiles) {
    ctx.fillStyle = p.owner === 'player' ? '#ff8a2b' : '#6fd8ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = p.owner === 'player' ? 'rgba(255,200,80,0.6)' : 'rgba(160,230,255,0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ── Hooks ─────────────────────────────────────────────────────
function drawHooks() {
  for (const h of hooks) {
    const caster = h.owner === 'player' ? player : dummy;
    if (h.owner === 'dummy' && !dummyEnabled) continue;

    ctx.strokeStyle = h.owner === 'player' ? 'rgba(200,220,255,0.95)' : 'rgba(255,220,200,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(caster.x, caster.y);
    ctx.lineTo(h.x, h.y);
    ctx.stroke();

    ctx.fillStyle = h.owner === 'player' ? '#bfe4ff' : '#ffd4b4';
    ctx.beginPath();
    ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Particles ─────────────────────────────────────────────────
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.45));
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── Skill Aim Preview ─────────────────────────────────────────

function getWallPreviewData() {
  const dir = normalized(skillAimPreview.dx || player.aimX, skillAimPreview.dy || player.aimY);
  const perp = { x: -dir.y, y: dir.x };
  const wallLength = 150;
  const segmentRadius = 12;
  const segmentCount = 7;
  const centerDistance = player.r + 42;
  const centerX = player.x + dir.x * centerDistance;
  const centerY = player.y + dir.y * centerDistance;
  const segments = [];
  let blocked = false;

  for (let i = 0; i < segmentCount; i++) {
    const t = segmentCount === 1 ? 0 : (i / (segmentCount - 1)) - 0.5;
    const offset = t * wallLength;
    const sx = centerX + perp.x * offset;
    const sy = centerY + perp.y * offset;
    const invalid = !insidePlatform(sx, sy, segmentRadius + 4) || !!circleHitsObstacle(sx, sy, segmentRadius) || distance(sx, sy, player.x, player.y) < player.r + segmentRadius + 8;
    if (invalid) blocked = true;
    segments.push({ x: sx, y: sy, r: segmentRadius, blocked: invalid });
  }

  return { dir, perp, centerX, centerY, halfLen: wallLength * 0.5, segments, blocked };
}

function getRewindPreviewTarget() {
  const snap = getSafeRewindTarget(getRewindTarget(player.rewindSeconds || 1.0));
  if (!snap) return null;
  return snap;
}

function drawSkillAimPreview() {
  if (!skillAimPreview.active || gameState === 'lobby' || !player.alive) return;
  const dir = normalized(skillAimPreview.dx, skillAimPreview.dy);

  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 8]);

  if (skillAimPreview.type === 'shield') {
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(120,190,255,0.7)';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 12, 0, Math.PI * 2);
    ctx.stroke();

  } else if (skillAimPreview.type === 'fire' || skillAimPreview.type === 'hook') {
    const len  = skillAimPreview.type === 'fire' ? 140 : 180;
    const endX = player.x + dir.x * len;
    const endY = player.y + dir.y * len;

    ctx.strokeStyle = skillAimPreview.type === 'fire'
      ? 'rgba(255,160,70,0.28)'
      : 'rgba(190,230,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(player.x, player.y, 24, 0, Math.PI * 2);
    ctx.strokeStyle = skillAimPreview.type === 'fire'
      ? 'rgba(255,140,60,0.14)'
      : 'rgba(180,220,255,0.14)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(endX, endY, skillAimPreview.type === 'fire' ? 8 : 10, 0, Math.PI * 2);
    ctx.strokeStyle = skillAimPreview.type === 'fire'
      ? 'rgba(255,200,120,0.75)'
      : 'rgba(220,245,255,0.75)';
    ctx.stroke();

  } else if (skillAimPreview.type === 'shock') {
    const len = 115;
    const spread = 0.6;

    ctx.strokeStyle = 'rgba(255,180,120,0.35)';
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);

    ctx.lineTo(
      player.x + (dir.x * Math.cos(spread) - dir.y * Math.sin(spread)) * len,
      player.y + (dir.y * Math.cos(spread) + dir.x * Math.sin(spread)) * len
    );

    ctx.moveTo(player.x, player.y);

    ctx.lineTo(
      player.x + (dir.x * Math.cos(-spread) - dir.y * Math.sin(-spread)) * len,
      player.y + (dir.y * Math.cos(-spread) + dir.x * Math.sin(-spread)) * len
    );

    ctx.stroke();

  } else if (skillAimPreview.type === 'blink') {
    const target = getBlinkTargetPreview();

    ctx.strokeStyle = target.blocked ? 'rgba(255,110,110,0.24)' : 'rgba(170,140,255,0.24)';
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(target.x, target.y, player.r + 8, 0, Math.PI * 2);
    ctx.strokeStyle = target.blocked ? 'rgba(255,120,120,0.8)' : 'rgba(186,166,255,0.82)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(target.x, target.y, player.r - 2, 0, Math.PI * 2);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = target.blocked ? 'rgba(255,90,90,1)' : 'rgba(170,140,255,1)';
    ctx.fill();

  } else if (skillAimPreview.type === 'charge') {
    const len = player.teleportDistance;
    const endX = player.x + dir.x * len;
    const endY = player.y + dir.y * len;

    ctx.strokeStyle = 'rgba(200,150,255,0.30)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(endX, endY, player.r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(225,190,255,0.80)';
    ctx.stroke();

    ctx.globalAlpha = 0.13;
    ctx.fillStyle = 'rgba(190,145,255,1)';
    ctx.beginPath();
    ctx.arc(endX, endY, player.r + 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (skillAimPreview.type === 'wall') {
    const preview = getWallPreviewData();

    ctx.setLineDash([]);
    ctx.strokeStyle = preview.blocked ? 'rgba(255,130,130,0.82)' : 'rgba(170,210,255,0.82)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(preview.centerX - preview.perp.x * preview.halfLen, preview.centerY - preview.perp.y * preview.halfLen);
    ctx.lineTo(preview.centerX + preview.perp.x * preview.halfLen, preview.centerY + preview.perp.y * preview.halfLen);
    ctx.stroke();

    ctx.strokeStyle = preview.blocked ? 'rgba(255,220,220,0.68)' : 'rgba(235,245,255,0.52)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(preview.centerX - preview.perp.x * preview.halfLen, preview.centerY - preview.perp.y * preview.halfLen);
    ctx.lineTo(preview.centerX + preview.perp.x * preview.halfLen, preview.centerY + preview.perp.y * preview.halfLen);
    ctx.stroke();

    for (const seg of preview.segments) {
      ctx.fillStyle = seg.blocked ? 'rgba(255,120,120,0.28)' : 'rgba(170,210,255,0.18)';
      ctx.beginPath();
      ctx.arc(seg.x, seg.y, seg.r + 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (skillAimPreview.type === 'rewind') {
    const target = getRewindPreviewTarget();
    if (target) {
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = 'rgba(186,166,255,0.5)';
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(220,190,255,0.88)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(target.x, target.y, player.r + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ── Damage Texts ──────────────────────────────────────────────
function drawDamageTexts() {
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px Arial';
  for (const d of damageTexts) {
    ctx.globalAlpha = Math.max(0, d.life / 0.75);
    ctx.fillStyle = d.color || '#ffd36b';
    ctx.fillText(d.value, d.x, d.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

// ── Crosshair ─────────────────────────────────────────────────
function drawCrosshair() {
  if (gameState === 'lobby' || isTouchDevice) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(mouse.x, mouse.y, 10, 0, Math.PI * 2);
  ctx.moveTo(mouse.x - 14, mouse.y);
  ctx.lineTo(mouse.x + 14, mouse.y);
  ctx.moveTo(mouse.x, mouse.y - 14);
  ctx.lineTo(mouse.x, mouse.y + 14);
  ctx.stroke();
}

// ── Result Overlay ────────────────────────────────────────────
const resultOverlayCurrencyIcon = {
  img: null,
  src: '',
  state: 'idle', // idle | loading | loaded | failed
};

function getResultOverlayCurrencyIconPath() {
  return window.OUTRA_3D_CONFIG?.lobbyArt?.currency || '/docs/art/Lobby/Currency.png';
}

function ensureResultOverlayCurrencyIcon() {
  const desiredSrc = String(getResultOverlayCurrencyIconPath() || '').trim();
  if (!desiredSrc) return null;

  if (resultOverlayCurrencyIcon.src !== desiredSrc) {
    resultOverlayCurrencyIcon.src = desiredSrc;
    resultOverlayCurrencyIcon.state = 'idle';
    resultOverlayCurrencyIcon.img = null;
  }

  if (resultOverlayCurrencyIcon.state === 'loaded' && resultOverlayCurrencyIcon.img) {
    return resultOverlayCurrencyIcon.img;
  }

  if (resultOverlayCurrencyIcon.state === 'loading') return null;
  if (resultOverlayCurrencyIcon.state === 'failed') return null;

  const img = new Image();
  img.decoding = 'async';
  resultOverlayCurrencyIcon.state = 'loading';
  img.onload = () => {
    if (resultOverlayCurrencyIcon.src !== desiredSrc) return;
    resultOverlayCurrencyIcon.img = img;
    resultOverlayCurrencyIcon.state = 'loaded';
  };
  img.onerror = () => {
    if (resultOverlayCurrencyIcon.src !== desiredSrc) return;
    resultOverlayCurrencyIcon.img = null;
    resultOverlayCurrencyIcon.state = 'failed';
  };
  img.src = desiredSrc;

  return null;
}

function fillRoundedRect(x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    return;
  }
  ctx.fillRect(x, y, w, h);
}

function drawResultOverlay() {
  if (gameState !== 'result') return;
  const centerX = canvas.width * 0.5;
  const centerY = canvas.height * 0.5;
  const panelW = Math.min(860, canvas.width * 0.9);
  const panelH = Math.min(300, canvas.height * 0.44);
  const panelX = centerX - panelW * 0.5;
  const panelY = centerY - panelH * 0.5;
  const panelR = 22;

  const currencyGain = Math.max(0, Math.floor(Number(winnerReward?.currency) || 0));
  const currencyIcon = currencyGain > 0 ? ensureResultOverlayCurrencyIcon() : null;

  let titleLine = winnerText || 'Round ended';
  let detailLine = '';
  const separators = [' • ', ' â€¢ '];
  for (const sep of separators) {
    const idx = titleLine.indexOf(sep);
    if (idx >= 0) {
      detailLine = titleLine.slice(idx + sep.length).trim();
      titleLine = titleLine.slice(0, idx).trim();
      break;
    }
  }

  ctx.save();

  const vignette = ctx.createRadialGradient(
    centerX,
    centerY,
    Math.max(120, panelW * 0.12),
    centerX,
    centerY,
    Math.max(canvas.width, canvas.height) * 0.76
  );
  vignette.addColorStop(0, 'rgba(8, 12, 20, 0.22)');
  vignette.addColorStop(1, 'rgba(3, 4, 8, 0.68)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
  panelGrad.addColorStop(0, 'rgba(20, 30, 48, 0.94)');
  panelGrad.addColorStop(1, 'rgba(8, 12, 20, 0.95)');
  ctx.fillStyle = panelGrad;
  fillRoundedRect(panelX, panelY, panelW, panelH, panelR);

  ctx.strokeStyle = 'rgba(255, 218, 142, 0.42)';
  ctx.lineWidth = 2;
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, panelR);
    ctx.stroke();
  } else {
    ctx.strokeRect(panelX, panelY, panelW, panelH);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = '900 48px Arial';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.58)';
  ctx.fillStyle = '#f6e7c8';
  ctx.shadowColor = 'rgba(255, 186, 86, 0.34)';
  ctx.shadowBlur = 22;
  ctx.strokeText(titleLine, centerX, panelY + panelH * 0.36);
  ctx.fillText(titleLine, centerX, panelY + panelH * 0.36);

  if (detailLine) {
    ctx.shadowBlur = 14;
    ctx.font = '800 20px Arial';
    ctx.fillStyle = 'rgba(255, 224, 178, 0.95)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.54)';
    ctx.lineWidth = 5;
    ctx.strokeText(detailLine, centerX, panelY + panelH * 0.53);
    ctx.fillText(detailLine, centerX, panelY + panelH * 0.53);
  }

  if (currencyGain > 0) {
    const rewardY = panelY + panelH * (detailLine ? 0.72 : 0.62);
    const pillW = Math.max(170, Math.min(260, panelW * 0.32));
    const pillH = 44;
    const pillX = centerX - pillW * 0.5;

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 194, 102, 0.14)';
    fillRoundedRect(pillX, rewardY - pillH * 0.5, pillW, pillH, 999);
    ctx.strokeStyle = 'rgba(255, 204, 122, 0.54)';
    ctx.lineWidth = 1.5;
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(pillX, rewardY - pillH * 0.5, pillW, pillH, 999);
      ctx.stroke();
    } else {
      ctx.strokeRect(pillX, rewardY - pillH * 0.5, pillW, pillH);
    }

    const iconSize = 24;
    const text = `+${currencyGain}`;
    ctx.font = '900 24px Arial';
    const textWidth = ctx.measureText(text).width;
    const groupW = (currencyIcon ? (iconSize + 10) : 0) + textWidth;
    let drawX = centerX - groupW * 0.5;

    if (currencyIcon) {
      ctx.drawImage(currencyIcon, drawX, rewardY - iconSize * 0.5, iconSize, iconSize);
      drawX += iconSize + 10;
    }

    ctx.fillStyle = '#ffe9bf';
    ctx.shadowColor = 'rgba(255, 186, 86, 0.32)';
    ctx.shadowBlur = 12;
    ctx.fillText(text, drawX + textWidth * 0.5, rewardY + 1);
  }

  ctx.shadowBlur = 0;
  ctx.font = '700 18px Arial';
  ctx.fillStyle = 'rgba(230, 238, 255, 0.9)';
  ctx.fillText('Returning to lobby...', centerX, panelY + panelH - 34);

  ctx.restore();
  ctx.textAlign = 'left';
}

function drawArenaStartCountdownOverlay() {
  if (typeof getArenaIntroOverlayLabel !== 'function') return;
  const label = getArenaIntroOverlayLabel();
  if (!label) return;

  const isFight = label === 'FIGHT';
  const centerX = canvas.width * 0.5;
  const centerY = canvas.height * 0.48;
  const size = isFight
    ? Math.max(78, canvas.width * 0.108)
    : Math.max(104, canvas.width * 0.132);

  ctx.save();

  ctx.fillStyle = isFight ? 'rgba(5, 10, 18, 0.16)' : 'rgba(4, 8, 14, 0.22)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(size)}px Arial`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = isFight ? 8 : 10;
  ctx.strokeStyle = isFight ? 'rgba(12, 62, 32, 0.74)' : 'rgba(42, 24, 10, 0.82)';
  ctx.shadowColor = isFight ? 'rgba(126, 255, 158, 0.44)' : 'rgba(255, 176, 92, 0.38)';
  ctx.shadowBlur = isFight ? 30 : 24;
  ctx.fillStyle = isFight ? '#9affb4' : '#ffe6bf';

  ctx.strokeText(label, centerX, centerY);
  ctx.fillText(label, centerX, centerY);

  if (typeof isArenaPreFightLocked === 'function' && isArenaPreFightLocked()) {
    ctx.shadowBlur = 0;
    ctx.font = '700 18px Arial';
    ctx.fillStyle = 'rgba(237, 243, 255, 0.9)';
    ctx.fillText('Movement and spells locked', centerX, centerY + size * 0.56);
  }

  ctx.restore();
}

// ── Main Render ───────────────────────────────────────────────
function render() {
  bgCtx.clearRect(0, 0, canvas.width, canvas.height);
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);

  if (gameState === 'draft') {
    const hasDraft3DPlatform =
      window.outraThree &&
      typeof window.outraThree.isDraftPlatformRenderedIn3D === 'function' &&
      window.outraThree.isDraftPlatformRenderedIn3D();

    ctx = bgCtx;
    drawDraftRoom(hasDraft3DPlatform ? 'background' : 'full');

    if (hasDraft3DPlatform) {
      ctx = fxCtx;
      drawDraftRoom('foreground');
    }

    ctx = bgCtx;
    return;
  }

  // Background canvas: arena / lava only
  ctx = bgCtx;
  drawArena();

  // 3D floor renders in the middle via threeLayer

  // FX canvas: everything that must stay visible above the floor
  ctx = fxCtx;
  drawObstacles();
  drawWalls();
  drawPotions();
  drawParticles();
  drawHooks();
  drawProjectiles();
  if (dummyEnabled && dummy.alive) drawDummy();
  drawPlayer();
  drawSkillAimPreview();
  drawDamageTexts();
  drawCrosshair();
  drawArenaStartCountdownOverlay();
  drawResultOverlay();

  // Restore default drawing context
  ctx = bgCtx;
}

function drawDraftRoundedRect(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w * 0.5, h * 0.5));

  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rr);
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

const DRAFT_VISUAL_STYLE = {
  bgTop: '#070a10',
  bgMid: '#0a101a',
  bgBottom: '#04070d',
  platformLift: 0.06,
  platformShadowAlpha: 0.52,
  platformShadowScaleX: 1.05,
  platformShadowScaleY: 0.28,
  platformCoreTop: '#3a4662',
  platformCoreMid: '#263349',
  platformCoreBottom: '#111b2c',
  gridFramePadX: 34,
  gridFramePadY: 22,
  gridFrameRadius: 20,
  tileRadius: 12,
  tileIdlePulseSpeed: 1.45,
  tileGlowPulseSpeed: 2.1,
  channelAccent: 'rgba(104, 236, 194, 1)',
};

const DRAFT_SPELL_ORB_RGB = {
  hook: '120,196,255',
  blink: '176,156,255',
  shield: '126,230,206',
  charge: '255,210,126',
  shock: '255,148,140',
  gust: '142,236,214',
  wall: '202,178,146',
  rewind: '206,168,255',
};

const draftSpellOrbIconCache = Object.create(null);
const DRAFT_BACKGROUND_IMAGE_PATH = '/docs/art/draft/bg.png';
const draftBackgroundImageCache = {
  src: '',
  loaded: false,
  failed: false,
  img: null,
};

function drawImageCover(image, dx, dy, dw, dh) {
  if (!image || !image.naturalWidth || !image.naturalHeight || dw <= 0 || dh <= 0) return false;

  const scale = Math.max(dw / image.naturalWidth, dh / image.naturalHeight);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (image.naturalWidth - sw) * 0.5;
  const sy = (image.naturalHeight - sh) * 0.5;

  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  return true;
}

function getDraftBackgroundImage() {
  const configuredPath = window.OUTRA_3D_CONFIG?.draftRoom?.backgroundImage;
  const path = typeof configuredPath === 'string' && configuredPath.trim()
    ? configuredPath.trim()
    : DRAFT_BACKGROUND_IMAGE_PATH;

  if (!path) return null;

  const cached = draftBackgroundImageCache;
  if (cached.src === path && cached.img) {
    return cached.loaded ? cached.img : null;
  }

  const img = new Image();
  cached.src = path;
  cached.loaded = false;
  cached.failed = false;
  cached.img = img;
  img.decoding = 'async';
  img.onload = () => {
    if (draftBackgroundImageCache.img !== img) return;
    cached.loaded = true;
    cached.failed = false;
  };
  img.onerror = () => {
    if (draftBackgroundImageCache.img !== img) return;
    cached.loaded = false;
    cached.failed = true;
  };
  img.src = path;

  return null;
}

function draftEaseOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - x, 3);
}

function getDraftOrbConfig() {
  const roomCfg = window.OUTRA_3D_CONFIG?.draftRoom || {};
  const orbCfg = roomCfg.orb || {};
  const stateBrightness = orbCfg.stateBrightness || {};

  return {
    height: Number.isFinite(Number(orbCfg.height)) ? Number(orbCfg.height) : 16,
    bobAmplitude: Number.isFinite(Number(orbCfg.bobAmplitude)) ? Number(orbCfg.bobAmplitude) : 5.5,
    bobSpeed: Number.isFinite(Number(orbCfg.bobSpeed)) ? Number(orbCfg.bobSpeed) : 1.35,
    scale: Number.isFinite(Number(orbCfg.scale)) ? Number(orbCfg.scale) : 1,
    glowIntensity: Number.isFinite(Number(orbCfg.glowIntensity)) ? Number(orbCfg.glowIntensity) : 1,
    stateBrightness: {
      idle: Number.isFinite(Number(stateBrightness.idle)) ? Number(stateBrightness.idle) : 1,
      selectable: Number.isFinite(Number(stateBrightness.selectable)) ? Number(stateBrightness.selectable) : 1.14,
      channeling: Number.isFinite(Number(stateBrightness.channeling)) ? Number(stateBrightness.channeling) : 1.36,
      taken: Number.isFinite(Number(stateBrightness.taken)) ? Number(stateBrightness.taken) : 0.42,
    },
  };
}

function getDraftSpellOrbRgb(spellId) {
  return DRAFT_SPELL_ORB_RGB[spellId] || '156,184,255';
}

function getDraftSpellOrbIcon(spellId) {
  const path = SPELL_ICONS?.[spellId];
  if (!path) return null;

  const cached = draftSpellOrbIconCache[spellId];
  if (cached && cached.src === path) {
    return cached.loaded ? cached.img : null;
  }

  const img = new Image();
  const entry = {
    src: path,
    loaded: false,
    failed: false,
    img,
  };
  img.decoding = 'async';
  img.onload = () => {
    entry.loaded = true;
    entry.failed = false;
  };
  img.onerror = () => {
    entry.loaded = false;
    entry.failed = true;
  };
  img.src = path;
  draftSpellOrbIconCache[spellId] = entry;
  return null;
}

function drawDraftTurnFlashOverlay() {
  const flash = draftState?.turnFlash;
  if (!flash || typeof flash !== 'object') return;

  const playerId = String(flash.playerId || '').trim().toUpperCase();
  if (!playerId) {
    draftState.turnFlash = null;
    return;
  }

  const startedAt = Number(flash.startedAt) || 0;
  const durationMs = Math.max(120, Number(flash.durationMs) || 420);
  const elapsedMs = performance.now() - startedAt;
  if (elapsedMs < 0 || elapsedMs >= durationMs) {
    draftState.turnFlash = null;
    return;
  }

  const t = Math.max(0, Math.min(1, elapsedMs / durationMs));
  const fade = 1 - draftEaseOutCubic(t);
  const scale = 0.9 + t * 0.18;
  const x = canvas.width * 0.5;
  const y = canvas.height * 0.5;
  const fontSize = Math.max(120, Math.round(Math.min(canvas.width, canvas.height) * 0.26 * scale));
  const turnColors = {
    A: { fill: 'rgba(128, 206, 255, 1)', stroke: 'rgba(42, 96, 154, 1)', glow: 'rgba(96, 176, 255, 0.6)' },
    B: { fill: 'rgba(255, 194, 122, 1)', stroke: 'rgba(152, 88, 38, 1)', glow: 'rgba(255, 156, 86, 0.54)' },
    C: { fill: 'rgba(192, 168, 255, 1)', stroke: 'rgba(94, 72, 156, 1)', glow: 'rgba(170, 132, 255, 0.54)' },
    D: { fill: 'rgba(255, 150, 188, 1)', stroke: 'rgba(152, 60, 94, 1)', glow: 'rgba(255, 116, 160, 0.54)' },
  };
  const color = turnColors[playerId] || turnColors.A;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, fade));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${fontSize}px Arial`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(5, Math.round(fontSize * 0.08));
  ctx.shadowColor = color.glow;
  ctx.shadowBlur = Math.max(12, fontSize * 0.18 * fade);
  ctx.strokeStyle = color.stroke;
  ctx.fillStyle = color.fill;
  ctx.strokeText(playerId, x, y);
  ctx.fillText(playerId, x, y);
  ctx.restore();
}

function drawDraftRoom(mode = 'full') {
  const renderBackground = mode !== 'foreground';
  const renderForeground = mode !== 'background';

  const layout = draftState.layout || {
    cx: canvas.width * 0.5,
    cy: canvas.height * 0.57,
    platformRadius: Math.max(170, Math.min(canvas.width, canvas.height) * 0.24),
    tileRects: [],
    seats: {},
  };
  const cx = layout.cx;
  const cy = layout.cy;
  const platformRadius = layout.platformRadius;
  const tileRects = Array.isArray(layout.tileRects) ? layout.tileRects : [];
  const participantIds = Array.isArray(layout.participantIds) && layout.participantIds.length
    ? layout.participantIds
    : (() => {
        const fromSeats = Object.keys(layout?.seats || {});
        if (fromSeats.length) return fromSeats;
        const fromOrder = [];
        const seen = new Set();
        for (const id of Array.isArray(draftState.order) ? draftState.order : []) {
          if (typeof id !== 'string' || !id || seen.has(id)) continue;
          seen.add(id);
          fromOrder.push(id);
        }
        return fromOrder;
      })();
  const draftNow = performance.now() * 0.001;
  const style = DRAFT_VISUAL_STYLE;
  const orbCfg = getDraftOrbConfig();
  const nowMs = performance.now();
  const has3DDraftPlatform =
    window.outraThree &&
    typeof window.outraThree.isDraftPlatformRenderedIn3D === 'function' &&
    window.outraThree.isDraftPlatformRenderedIn3D();
  const has3DDraftActors =
    window.outraThree &&
    typeof window.outraThree.areDraftActorsRenderedIn3D === 'function' &&
    window.outraThree.areDraftActorsRenderedIn3D();

  const activePlayerId = (Array.isArray(draftState.order) && draftState.order.length)
    ? draftState.order[Math.max(0, Math.min(draftState.order.length - 1, Number(draftState.turnIndex) || 0))]
    : null;
  const activeActor = activePlayerId ? draftState.players?.[activePlayerId] : null;
  const pickFx = draftState.pickFx && typeof draftState.pickFx === 'object'
    ? draftState.pickFx
    : { transfers: [], ringPulses: [], tileBursts: [] };

  const activeTransfers = Array.isArray(pickFx.transfers)
    ? pickFx.transfers.filter((fx) => nowMs - (fx.startedAt || 0) <= (fx.durationMs || 0) + 40)
    : [];
  const activeRingPulses = Array.isArray(pickFx.ringPulses)
    ? pickFx.ringPulses.filter((fx) => nowMs - (fx.startedAt || 0) <= (fx.durationMs || 0) + 40)
    : [];
  const activeTileBursts = Array.isArray(pickFx.tileBursts)
    ? pickFx.tileBursts.filter((fx) => nowMs - (fx.startedAt || 0) <= (fx.durationMs || 0) + 40)
    : [];

  if (Array.isArray(pickFx.transfers)) pickFx.transfers = activeTransfers;
  if (Array.isArray(pickFx.ringPulses)) pickFx.ringPulses = activeRingPulses;
  if (Array.isArray(pickFx.tileBursts)) pickFx.tileBursts = activeTileBursts;

  let gridMinX = cx - platformRadius * 0.66;
  let gridMinY = cy - platformRadius * 0.40;
  let gridMaxX = cx + platformRadius * 0.66;
  let gridMaxY = cy + platformRadius * 0.40;
  if (tileRects.length) {
    gridMinX = Math.min(...tileRects.map((tile) => tile.x));
    gridMinY = Math.min(...tileRects.map((tile) => tile.y));
    gridMaxX = Math.max(...tileRects.map((tile) => tile.x + tile.w));
    gridMaxY = Math.max(...tileRects.map((tile) => tile.y + tile.h));
  }
  const gridCx = (gridMinX + gridMaxX) * 0.5;
  const gridCy = (gridMinY + gridMaxY) * 0.5;
  const gridRadius = Math.max(100, Math.hypot(gridMaxX - gridMinX, gridMaxY - gridMinY) * 0.58);
  const gridPulse = 0.5 + 0.5 * Math.sin(draftNow * style.tileGlowPulseSpeed);

  if (renderBackground) {
    const draftBackgroundImage = getDraftBackgroundImage();
    if (draftBackgroundImage) {
      drawImageCover(draftBackgroundImage, 0, 0, canvas.width, canvas.height);
    }

    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, style.bgTop);
    bg.addColorStop(0.56, style.bgMid);
    bg.addColorStop(1, style.bgBottom);
    ctx.save();
    ctx.globalAlpha = draftBackgroundImage ? 0.44 : 1;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    const vignette = ctx.createRadialGradient(
      cx,
      cy - platformRadius * 0.30,
      platformRadius * 0.26,
      cx,
      cy,
      Math.max(canvas.width, canvas.height) * 0.82
    );
    vignette.addColorStop(0, 'rgba(92, 114, 168, 0.16)');
    vignette.addColorStop(0.55, 'rgba(34, 46, 74, 0.08)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.52)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gridFocus = ctx.createRadialGradient(
      gridCx,
      gridCy,
      gridRadius * 0.18,
      gridCx,
      gridCy,
      gridRadius * 1.15
    );
    gridFocus.addColorStop(0, `rgba(140, 168, 228, ${0.12 + gridPulse * 0.06})`);
    gridFocus.addColorStop(0.62, 'rgba(78, 104, 160, 0.04)');
    gridFocus.addColorStop(1, 'rgba(78, 104, 160, 0)');
    ctx.fillStyle = gridFocus;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawLegacyDraftDeck = false;
    if (!has3DDraftPlatform && drawLegacyDraftDeck) {
      const deckY = cy - platformRadius * style.platformLift;

      ctx.fillStyle = `rgba(0, 0, 0, ${style.platformShadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy + platformRadius * 0.70,
        platformRadius * style.platformShadowScaleX,
        platformRadius * style.platformShadowScaleY,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      const underside = ctx.createLinearGradient(
        cx,
        deckY + platformRadius * 0.26,
        cx,
        deckY + platformRadius * 0.92
      );
      underside.addColorStop(0, 'rgba(20, 30, 48, 0.88)');
      underside.addColorStop(1, 'rgba(6, 10, 18, 0.95)');
      ctx.fillStyle = underside;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        deckY + platformRadius * 0.38,
        platformRadius * 0.90,
        platformRadius * 0.24,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      const platform = ctx.createRadialGradient(
        cx,
        deckY - platformRadius * 0.24,
        platformRadius * 0.14,
        cx,
        deckY,
        platformRadius * 1.05
      );
      platform.addColorStop(0, style.platformCoreTop);
      platform.addColorStop(0.52, style.platformCoreMid);
      platform.addColorStop(1, style.platformCoreBottom);
      ctx.fillStyle = platform;
      ctx.beginPath();
      ctx.arc(cx, deckY, platformRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(182, 206, 255, 0.24)';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(cx, deckY, platformRadius - 2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(88, 118, 178, 0.40)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, deckY, platformRadius * 0.76, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(70, 102, 160, 0.28)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(cx, deckY, platformRadius * 0.56, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (!renderForeground) {
    return;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 12px Arial';

  const draftPickerColors = {
    A: 'rgba(120, 198, 255, 0.98)',
    B: 'rgba(255, 188, 110, 0.98)',
    C: 'rgba(186, 156, 255, 0.98)',
    D: 'rgba(255, 132, 170, 0.98)',
  };

  for (const tile of tileRects) {
    const spell = (Array.isArray(draftState.spells) ? draftState.spells : []).find((s) => s.id === tile.id) || null;
    const isTaken = !!spell?.disabled;
    const holder = spell?.takenBy || '';
    const isHoldTarget = !isTaken && draftState.holdSpellId === tile.id && activePlayerId === draftState.localPlayerId;
    const holdRatio = isHoldTarget
      ? Math.max(0, Math.min(1, (draftState.holdTime || 0) / Math.max(0.1, draftState.holdDuration || 0.6)))
      : 0;
    const isSelectable = !isTaken && !draftState.complete;
    const isTriggerHit = typeof isDraftTileTriggerHit === 'function'
      ? isDraftTileTriggerHit(activeActor, tile)
      : (
          !!activeActor &&
          activeActor.x >= tile.x + 8 &&
          activeActor.x <= tile.x + tile.w - 8 &&
          activeActor.y >= tile.y + 6 &&
          activeActor.y <= tile.y + tile.h - 6
        );
    const isActiveStanding =
      !!activeActor &&
      isSelectable &&
      isTriggerHit;
    const idlePulse = 0.5 + 0.5 * Math.sin(
      draftNow * style.tileIdlePulseSpeed + tile.cx * 0.018 + tile.cy * 0.013
    );
    const finalChannelRatio = isHoldTarget
      ? Math.max(0, Math.min(1, (holdRatio - 0.76) / 0.24))
      : 0;
    const tileBurstFx = activeTileBursts.find((fx) => fx.tileId === tile.id) || null;
    const tileBurstStrength = tileBurstFx
      ? Math.max(
          0,
          1 - draftEaseOutCubic(
            Math.max(0, Math.min(1, (nowMs - tileBurstFx.startedAt) / Math.max(1, tileBurstFx.durationMs || 1)))
          )
        )
      : 0;

    let tileState = 'idle';
    if (isTaken) tileState = 'taken';
    else if (isHoldTarget) tileState = 'channeling';
    else if (isActiveStanding) tileState = 'selectable';

    const spellRgb = getDraftSpellOrbRgb(tile.id);
    const stateBrightness = orbCfg.stateBrightness[tileState] || 1;
    const bobSeed = tile.cx * 0.018 + tile.cy * 0.011;
    const bobOffset = Math.sin(draftNow * orbCfg.bobSpeed + bobSeed) * orbCfg.bobAmplitude;
    const channelScale = tileState === 'channeling' ? (1 + finalChannelRatio * 0.16) : 1;
    const selectScale = tileState === 'selectable' ? 1.04 : 1;
    const orbRadius = Math.max(12, Math.min(tile.w, tile.h) * 0.27) * orbCfg.scale * channelScale * selectScale;
    const orbCx = tile.cx;
    const orbCy = tile.cy - orbCfg.height + bobOffset - tile.h * 0.03;
    const iconRadius = orbRadius * 0.80;

    const statePalette = {
      idle: {
        top: 'rgba(34, 45, 68, 0.90)',
        bottom: 'rgba(16, 22, 36, 0.94)',
        edge: `rgba(132, 166, 228, ${0.22 + idlePulse * 0.08})`,
        inner: 'rgba(88, 120, 184, 0.18)',
        label: 'rgba(232, 240, 255, 0.96)',
        glow: `rgba(84, 126, 204, ${0.04 + idlePulse * 0.04})`,
      },
      selectable: {
        top: 'rgba(44, 62, 96, 0.92)',
        bottom: 'rgba(20, 34, 58, 0.96)',
        edge: 'rgba(208, 228, 255, 0.50)',
        inner: 'rgba(120, 162, 230, 0.22)',
        label: 'rgba(248, 252, 255, 0.99)',
        glow: `rgba(122, 182, 255, ${0.12 + idlePulse * 0.08})`,
      },
      channeling: {
        top: 'rgba(36, 74, 84, 0.94)',
        bottom: 'rgba(16, 44, 54, 0.96)',
        edge: `rgba(184, 255, 232, ${0.46 + holdRatio * 0.16 + finalChannelRatio * 0.12})`,
        inner: `rgba(112, 228, 198, ${0.28 + finalChannelRatio * 0.14})`,
        label: 'rgba(242, 255, 248, 0.99)',
        glow: `rgba(96, 236, 198, ${0.20 + holdRatio * 0.14 + finalChannelRatio * 0.18})`,
      },
      taken: {
        top: 'rgba(28, 32, 40, 0.94)',
        bottom: 'rgba(14, 18, 24, 0.96)',
        edge: 'rgba(112, 124, 148, 0.18)',
        inner: 'rgba(74, 86, 110, 0.12)',
        label: 'rgba(168, 176, 194, 0.92)',
        glow: 'rgba(0, 0, 0, 0)',
      },
    };
    const palette = statePalette[tileState];

    ctx.save();
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = tileState === 'channeling'
      ? (14 + holdRatio * 10)
      : tileState === 'selectable'
        ? (10 + idlePulse * 5)
        : (5 + idlePulse * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    drawDraftRoundedRect(tile.x + 2, tile.y + 3, tile.w - 4, tile.h - 3, style.tileRadius - 1);
    ctx.fill();
    ctx.restore();

    const tileGrad = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + tile.h);
    tileGrad.addColorStop(0, palette.top);
    tileGrad.addColorStop(1, palette.bottom);
    drawDraftRoundedRect(tile.x, tile.y, tile.w, tile.h, style.tileRadius);
    ctx.fillStyle = tileGrad;
    ctx.fill();

    const shade = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + tile.h);
    shade.addColorStop(0, 'rgba(255,255,255,0.10)');
    shade.addColorStop(0.44, 'rgba(255,255,255,0.00)');
    shade.addColorStop(1, 'rgba(0,0,0,0.24)');
    drawDraftRoundedRect(tile.x + 1, tile.y + 1, tile.w - 2, tile.h - 2, style.tileRadius - 1);
    ctx.fillStyle = shade;
    ctx.fill();

    const glowPulseBoost = tileState === 'channeling'
      ? (1 + holdRatio * 0.45 + finalChannelRatio * 0.35)
      : tileState === 'selectable'
        ? (1.08 + idlePulse * 0.12)
        : (0.94 + idlePulse * 0.08);
    const glowStrength = Math.max(0.1, orbCfg.glowIntensity * stateBrightness * glowPulseBoost);

    const glowNearAlpha = Math.max(0, Math.min(1, 0.16 * glowStrength + tileBurstStrength * 0.16));
    const glowMidAlpha = Math.max(0, Math.min(1, 0.08 * glowStrength + tileBurstStrength * 0.10));
    const orbGlow = ctx.createRadialGradient(
      orbCx,
      orbCy,
      orbRadius * 0.16,
      orbCx,
      orbCy,
      orbRadius * (2.25 + tileBurstStrength * 0.35)
    );
    orbGlow.addColorStop(0, `rgba(${spellRgb}, ${glowNearAlpha})`);
    orbGlow.addColorStop(0.55, `rgba(${spellRgb}, ${glowMidAlpha})`);
    orbGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = orbGlow;
    ctx.beginPath();
    ctx.arc(orbCx, orbCy, orbRadius * 2.25, 0, Math.PI * 2);
    ctx.fill();

    const orbCore = ctx.createLinearGradient(orbCx, orbCy - orbRadius, orbCx, orbCy + orbRadius);
    orbCore.addColorStop(0, `rgba(230, 242, 255, ${0.64 * stateBrightness})`);
    orbCore.addColorStop(0.52, `rgba(92, 124, 170, ${0.36 * stateBrightness})`);
    orbCore.addColorStop(1, `rgba(20, 32, 52, ${0.90 * stateBrightness})`);
    ctx.fillStyle = orbCore;
    ctx.beginPath();
    ctx.arc(orbCx, orbCy, orbRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = tileState === 'taken'
      ? 'rgba(142, 156, 184, 0.40)'
      : `rgba(234, 246, 255, ${0.56 + finalChannelRatio * 0.20})`;
    ctx.lineWidth = tileState === 'channeling' ? 2.3 : 1.8;
    ctx.beginPath();
    ctx.arc(orbCx, orbCy, orbRadius, 0, Math.PI * 2);
    ctx.stroke();

    const iconImage = getDraftSpellOrbIcon(tile.id);
    ctx.save();
    ctx.beginPath();
    ctx.arc(orbCx, orbCy, iconRadius, 0, Math.PI * 2);
    ctx.clip();

    if (iconImage) {
      const iconSize = iconRadius * 2.28;
      ctx.globalAlpha = tileState === 'taken' ? 0.42 : Math.min(1, 0.92 + (stateBrightness - 1) * 0.28);
      ctx.drawImage(iconImage, orbCx - iconSize * 0.5, orbCy - iconSize * 0.5, iconSize, iconSize);
    } else {
      const fallbackGrad = ctx.createLinearGradient(orbCx, orbCy - iconRadius, orbCx, orbCy + iconRadius);
      fallbackGrad.addColorStop(0, `rgba(${spellRgb}, 0.40)`);
      fallbackGrad.addColorStop(1, `rgba(${spellRgb}, 0.12)`);
      ctx.fillStyle = fallbackGrad;
      ctx.fillRect(orbCx - iconRadius, orbCy - iconRadius, iconRadius * 2, iconRadius * 2);
      ctx.fillStyle = tileState === 'taken' ? 'rgba(216, 222, 236, 0.54)' : 'rgba(238, 245, 255, 0.95)';
      ctx.font = 'bold 12px Arial';
      const fallbackIcon = SPELL_DEFS?.[tile.id]?.icon || tile.label.slice(0, 1);
      ctx.fillText(fallbackIcon, orbCx, orbCy + 0.5);
    }
    ctx.restore();

    const orbGloss = ctx.createLinearGradient(
      orbCx,
      orbCy - orbRadius * 1.05,
      orbCx,
      orbCy + orbRadius * 0.10
    );
    orbGloss.addColorStop(0, 'rgba(255,255,255,0.36)');
    orbGloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(orbCx, orbCy, orbRadius * 0.92, Math.PI * 1.08, Math.PI * 1.92);
    ctx.lineTo(orbCx, orbCy);
    ctx.closePath();
    ctx.fillStyle = orbGloss;
    ctx.fill();
    ctx.restore();

    if (tileState === 'channeling') {
      const startA = -Math.PI * 0.5;
      const endA = startA + Math.PI * 2 * holdRatio;
      ctx.strokeStyle = `rgba(198, 255, 236, ${0.58 + finalChannelRatio * 0.28})`;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(orbCx, orbCy, orbRadius + 4, startA, endA);
      ctx.stroke();
    } else if (tileState === 'selectable') {
      ctx.strokeStyle = `rgba(${spellRgb}, ${0.32 + idlePulse * 0.20})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(orbCx, orbCy, orbRadius + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tileState === 'taken') {
      ctx.strokeStyle = 'rgba(198, 206, 224, 0.36)';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(orbCx - orbRadius * 0.52, orbCy - orbRadius * 0.52);
      ctx.lineTo(orbCx + orbRadius * 0.52, orbCy + orbRadius * 0.52);
      ctx.moveTo(orbCx + orbRadius * 0.52, orbCy - orbRadius * 0.52);
      ctx.lineTo(orbCx - orbRadius * 0.52, orbCy + orbRadius * 0.52);
      ctx.stroke();
    }

    if (isHoldTarget && finalChannelRatio > 0) {
      const chargeOverlay = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + tile.h);
      chargeOverlay.addColorStop(0, `rgba(190, 255, 236, ${0.06 + finalChannelRatio * 0.16})`);
      chargeOverlay.addColorStop(1, `rgba(116, 236, 198, ${0.03 + finalChannelRatio * 0.14})`);
      drawDraftRoundedRect(tile.x + 1, tile.y + 1, tile.w - 2, tile.h - 2, style.tileRadius - 1);
      ctx.fillStyle = chargeOverlay;
      ctx.fill();
    }

    if (tileState === 'taken' && tileBurstStrength > 0) {
      const settleGlow = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + tile.h);
      settleGlow.addColorStop(0, `rgba(172, 226, 255, ${0.08 + tileBurstStrength * 0.24})`);
      settleGlow.addColorStop(1, `rgba(110, 164, 224, ${0.02 + tileBurstStrength * 0.16})`);
      drawDraftRoundedRect(tile.x + 1, tile.y + 1, tile.w - 2, tile.h - 2, style.tileRadius - 1);
      ctx.fillStyle = settleGlow;
      ctx.fill();
    }

    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = tileState === 'channeling' ? 1.8 : tileState === 'selectable' ? 1.5 : 1.1;
    drawDraftRoundedRect(tile.x, tile.y, tile.w, tile.h, style.tileRadius);
    ctx.stroke();

    ctx.strokeStyle = palette.inner;
    ctx.lineWidth = 0.8;
    drawDraftRoundedRect(tile.x + 2, tile.y + 2, tile.w - 4, tile.h - 4, style.tileRadius - 2);
    ctx.stroke();

    if (tileState === 'selectable' || tileState === 'channeling') {
      const accent = tileState === 'channeling'
        ? style.channelAccent
        : `rgba(184, 226, 255, ${0.65 + idlePulse * 0.20})`;
      const cornerLen = 7;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(tile.x + 6, tile.y + 10);
      ctx.lineTo(tile.x + 6, tile.y + 6);
      ctx.lineTo(tile.x + 6 + cornerLen, tile.y + 6);
      ctx.moveTo(tile.x + tile.w - 6, tile.y + 10);
      ctx.lineTo(tile.x + tile.w - 6, tile.y + 6);
      ctx.lineTo(tile.x + tile.w - 6 - cornerLen, tile.y + 6);
      ctx.moveTo(tile.x + 6, tile.y + tile.h - 10);
      ctx.lineTo(tile.x + 6, tile.y + tile.h - 6);
      ctx.lineTo(tile.x + 6 + cornerLen, tile.y + tile.h - 6);
      ctx.moveTo(tile.x + tile.w - 6, tile.y + tile.h - 10);
      ctx.lineTo(tile.x + tile.w - 6, tile.y + tile.h - 6);
      ctx.lineTo(tile.x + tile.w - 6 - cornerLen, tile.y + tile.h - 6);
      ctx.stroke();
    }

    if (tileState === 'taken') {
      ctx.save();
      drawDraftRoundedRect(tile.x + 1, tile.y + 1, tile.w - 2, tile.h - 2, style.tileRadius - 1);
      ctx.clip();
      ctx.strokeStyle = 'rgba(148, 158, 178, 0.16)';
      ctx.lineWidth = 1;
      for (let hx = tile.x - tile.h; hx < tile.x + tile.w + tile.h; hx += 10) {
        ctx.beginPath();
        ctx.moveTo(hx, tile.y + tile.h);
        ctx.lineTo(hx + tile.h, tile.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.fillStyle = palette.label;
    ctx.font = 'bold 11px Arial';
    ctx.fillText(tile.label, tile.cx, tile.y + tile.h - 17);

    if (tileState === 'taken') {
      const holderId = String(holder || '').trim().toUpperCase();
      if (holderId) {
        const holderColor = draftPickerColors[holderId] || 'rgba(198, 206, 220, 0.92)';
        const badgeW = 16;
        const badgeH = 14;
        const badgeX = tile.x + 6;
        const badgeY = tile.y + tile.h - badgeH - 5;
        ctx.fillStyle = 'rgba(10, 14, 22, 0.58)';
        drawDraftRoundedRect(badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();

        ctx.strokeStyle = 'rgba(168, 184, 210, 0.24)';
        ctx.lineWidth = 1;
        drawDraftRoundedRect(badgeX, badgeY, badgeW, badgeH, 4);
        ctx.stroke();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = holderColor;
        ctx.font = 'bold 10px Arial';
        ctx.fillText(holderId, badgeX + badgeW * 0.5, badgeY + badgeH * 0.5 + 0.5);
        ctx.restore();
      }
    } else if (tileState === 'channeling') {
      const overlayW = Math.max(0, (tile.w - 6) * holdRatio);
      ctx.fillStyle = `rgba(102, 236, 194, ${0.14 + holdRatio * 0.20})`;
      drawDraftRoundedRect(tile.x + 3, tile.y + 3, overlayW, tile.h - 6, style.tileRadius - 2);
      ctx.fill();

      const barW = Math.max(14, (tile.w - 14) * holdRatio);
      const barX = tile.x + 7;
      const barY = tile.y + tile.h - 9;
      ctx.fillStyle = 'rgba(104, 236, 194, 0.98)';
      drawDraftRoundedRect(barX, barY, barW, 4, 2);
      ctx.fill();

      const tipX = Math.min(tile.x + tile.w - 7, barX + barW);
      ctx.fillStyle = 'rgba(224, 255, 244, 0.90)';
      drawDraftRoundedRect(tipX - 2, barY - 1, 4, 6, 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(222, 255, 246, 0.88)';
      ctx.font = 'bold 10px Arial';
      ctx.fillText('CHANNELING', tile.cx, tile.y + tile.h - 11);
    } else if (tileState === 'selectable') {
      ctx.fillStyle = 'rgba(192, 224, 255, 0.72)';
      ctx.font = 'bold 10px Arial';
      ctx.fillText('SELECTABLE', tile.cx, tile.y + tile.h - 10);
    }
  }

  for (const fx of activeTransfers) {
    const duration = Math.max(1, Number(fx.durationMs) || 1);
    const t = Math.max(0, Math.min(1, (nowMs - (fx.startedAt || 0)) / duration));
    const tailT = Math.max(0, t - 0.22);

    const targetActor = draftState.players?.[fx.pickerId];
    const toX = Number.isFinite(fx.toX) ? fx.toX : (Number.isFinite(targetActor?.x) ? targetActor.x : 0);
    const toY = Number.isFinite(fx.toY) ? fx.toY : (Number.isFinite(targetActor?.y) ? targetActor.y : 0);
    const fromX = Number.isFinite(fx.fromX) ? fx.fromX : toX;
    const fromY = Number.isFinite(fx.fromY) ? fx.fromY : toY;
    const spellRgb = getDraftSpellOrbRgb(fx.spellId);
    const dist = Math.hypot(toX - fromX, toY - fromY) || 1;
    const dirX = (toX - fromX) / dist;
    const dirY = (toY - fromY) / dist;
    const sideX = -dirY;
    const sideY = dirX;
    const arcAmp = Math.max(18, Math.min(84, dist * 0.22));

    const sampleArcPoint = (progress) => {
      const p = Math.max(0, Math.min(1, progress));
      const e = draftEaseOutCubic(p);
      const sideOffset = Math.sin(p * Math.PI) * arcAmp;
      return {
        x: fromX + (toX - fromX) * e + sideX * sideOffset,
        y: fromY + (toY - fromY) * e + sideY * sideOffset,
      };
    };

    const head = sampleArcPoint(t);
    const tail = sampleArcPoint(tailT);
    const headX = head.x;
    const headY = head.y;
    const tailX = tail.x;
    const tailY = tail.y;
    const controlX = (tailX + headX) * 0.5 + sideX * arcAmp * 0.26;
    const controlY = (tailY + headY) * 0.5 + sideY * arcAmp * 0.26;
    const alpha = 1 - t;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(${spellRgb}, ${0.20 + alpha * 0.44})`;
    ctx.lineWidth = 11 + alpha * 7.5;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.quadraticCurveTo(controlX, controlY, headX, headY);
    ctx.stroke();

    ctx.strokeStyle = `rgba(236, 248, 255, ${0.34 + alpha * 0.52})`;
    ctx.lineWidth = 4.3 + alpha * 2.2;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.quadraticCurveTo(controlX, controlY, headX, headY);
    ctx.stroke();

    ctx.strokeStyle = `rgba(${spellRgb}, ${0.36 + alpha * 0.54})`;
    ctx.lineWidth = 2 + alpha * 1.4;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.quadraticCurveTo(controlX, controlY, headX, headY);
    ctx.stroke();

    for (let i = 0; i < 4; i += 1) {
      const sparkT = Math.max(0, t - i * 0.055);
      const spark = sampleArcPoint(sparkT);
      const sparkAlpha = (0.14 + (1 - i / 4) * 0.42) * alpha;
      const sparkRadius = Math.max(1.4, 2.2 + (1 - i / 4) * 2.4 + alpha * 1.6);
      ctx.fillStyle = `rgba(${spellRgb}, ${sparkAlpha})`;
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, sparkRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    const headRadius = 4 + alpha * 4.6;
    const headGlow = ctx.createRadialGradient(headX, headY, 0, headX, headY, headRadius * 3.8);
    headGlow.addColorStop(0, `rgba(255,255,255,${0.56 + alpha * 0.38})`);
    headGlow.addColorStop(0.34, `rgba(${spellRgb}, ${0.42 + alpha * 0.42})`);
    headGlow.addColorStop(1, `rgba(${spellRgb}, 0)`);
    ctx.fillStyle = headGlow;
    ctx.beginPath();
    ctx.arc(headX, headY, headRadius * 3.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(244, 252, 255, ${0.72 + alpha * 0.22})`;
    ctx.beginPath();
    ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
    ctx.fill();

    const targetPulse = Math.max(0, Math.sin((nowMs - (fx.startedAt || 0)) * 0.03));
    const targetHalo = 6 + targetPulse * 3 + alpha * 2;
    ctx.strokeStyle = `rgba(${spellRgb}, ${0.18 + targetPulse * 0.14})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(toX, toY, targetHalo, 0, Math.PI * 2);
    ctx.stroke();

    if (t >= 0.72) {
      const land = Math.max(0, Math.min(1, (t - 0.72) / 0.28));
      const landAlpha = (1 - land) * 0.86;
      const impactRadius = 12 + land * 22;

      ctx.strokeStyle = `rgba(${spellRgb}, ${0.22 + landAlpha * 0.40})`;
      ctx.lineWidth = 2 + (1 - land) * 1.8;
      ctx.beginPath();
      ctx.arc(toX, toY, impactRadius, 0, Math.PI * 2);
      ctx.stroke();

      const impactGlow = ctx.createRadialGradient(toX, toY, 0, toX, toY, impactRadius * 2.2);
      impactGlow.addColorStop(0, `rgba(255,255,255,${0.06 + landAlpha * 0.32})`);
      impactGlow.addColorStop(0.42, `rgba(${spellRgb}, ${0.04 + landAlpha * 0.24})`);
      impactGlow.addColorStop(1, `rgba(${spellRgb}, 0)`);
      ctx.fillStyle = impactGlow;
      ctx.beginPath();
      ctx.arc(toX, toY, impactRadius * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawDraftTurnFlashOverlay();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
