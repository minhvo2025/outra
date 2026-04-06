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
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCtx.fillStyle = '#242630';
  previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

  previewCtx.fillStyle = 'rgba(255,120,30,0.22)';
  previewCtx.beginPath();
  previewCtx.ellipse(previewCanvas.width / 2, previewCanvas.height - 2, 130, 34, 0, 0, Math.PI * 2);
  previewCtx.fill();

  previewCtx.fillStyle = '#3a4047';
  previewCtx.beginPath();
  previewCtx.ellipse(previewCanvas.width / 2, previewCanvas.height - 18, 96, 26, 0, 0, Math.PI * 2);
  previewCtx.fill();

  previewCtx.strokeStyle = '#8a939e';
  previewCtx.lineWidth = 4;
  previewCtx.beginPath();
  previewCtx.ellipse(previewCanvas.width / 2, previewCanvas.height - 18, 96, 26, 0, 0, Math.PI * 2);
  previewCtx.stroke();

  previewCtx.fillStyle = 'rgba(255,255,255,0.95)';
  previewCtx.font = 'bold 18px Arial';
  previewCtx.textAlign = 'center';
  previewCtx.fillText(player.name || 'Player', previewCanvas.width / 2, 34);

  previewCtx.font = '13px Arial';
  previewCtx.fillStyle = 'rgba(255,255,255,0.72)';
  previewCtx.fillText('Drag to rotate', previewCanvas.width / 2, previewCanvas.height - 16);
  previewCtx.textAlign = 'left';

  if (
    window.outraThree &&
    typeof window.outraThree.renderLobbyPreview === 'function'
  ) {
    window.outraThree.renderLobbyPreview();
  } else {
    // fallback if 3D preview has not loaded yet
    const x = previewCanvas.width / 2;
    const y = previewCanvas.height / 2 + 18;

    previewCtx.fillStyle = 'rgba(0,0,0,0.25)';
    previewCtx.beginPath();
    previewCtx.ellipse(x, y + 42, 32, 12, 0, 0, Math.PI * 2);
    previewCtx.fill();

    previewCtx.fillStyle = player.bodyColor;
    previewCtx.beginPath();
    previewCtx.arc(x, y, 32, 0, Math.PI * 2);
    previewCtx.fill();

    drawCosmetics(previewCtx, x, y, 1);

    previewCtx.fillStyle = player.wandColor;
    previewCtx.save();
    previewCtx.translate(x, y);
    previewCtx.rotate(-0.3);
    previewCtx.fillRect(2, -5, 34, 10);
    previewCtx.restore();
  }
}

// ── Arena ─────────────────────────────────────────────────────
function drawArena() {
  ctx.fillStyle = '#23140f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 55; i++) {
    const angle = (i / 55) * Math.PI * 2 + performance.now() * 0.0002;
    const r = arena.radius + 55 + Math.sin(i + performance.now() * 0.003) * 20;
    const x = arena.cx + Math.cos(angle) * r;
    const y = arena.cy + Math.sin(angle) * r;
    ctx.fillStyle = 'rgba(255,120,30,0.14)';
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#ff5f1f';
  ctx.beginPath();
  ctx.arc(arena.cx, arena.cy, arena.radius + 170, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffaa40';
  for (let i = 0; i < 46; i++) {
    const angle = (i / 46) * Math.PI * 2 + performance.now() * 0.00035;
    const r = arena.radius + 110 + Math.sin(i * 1.7 + performance.now() * 0.004) * 12;
    const x = arena.cx + Math.cos(angle) * r;
    const y = arena.cy + Math.sin(angle) * r;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
  }

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

function drawActor(actor, bodyColor, wandColor, aimAngle = 0, healthColor = '#6cff74', cosmetics = false) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(actor.x, actor.y + actor.r + 8, actor.r, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  drawHealthBar(actor, healthColor);
  drawNameTag(actor);

  ctx.save();
  ctx.translate(actor.x, actor.y);
  ctx.rotate(aimAngle);
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(0, 0, actor.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = wandColor;
  ctx.fillRect(0, -4, 18, 8);
  ctx.restore();

  if (cosmetics) drawCosmetics(ctx, actor.x, actor.y, actor.r / 32);
}

function drawPlayer() {
    if (window.outraThree && window.outraThree.isPlayerRenderedIn3D && window.outraThree.isPlayerRenderedIn3D()) {
    return;
  }
  const angle = Math.atan2(player.aimY, player.aimX);
  drawActor(player, player.alive ? player.bodyColor : '#777', player.wandColor, angle, '#62f36d', true);

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
  const angle = Math.atan2(player.y - dummy.y, player.x - dummy.x);
  drawActor(dummy, dummy.alive ? '#ffd8b8' : '#666', '#ff7a1a', angle, '#ff8c5a', false);
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
  } else if (skillAimPreview.type === 'rewind') {
    const rawTarget = getRewindTarget();
    const target = rawTarget ? findSafeRewindTarget(rawTarget) : null;
    if (rawTarget) {
      ctx.strokeStyle = target ? 'rgba(200,180,255,0.78)' : 'rgba(255,120,120,0.78)';
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(rawTarget.x, rawTarget.y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(rawTarget.x, rawTarget.y, player.r + 8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.12;
      ctx.fillStyle = target ? 'rgba(190,170,255,1)' : 'rgba(255,100,100,1)';
      ctx.beginPath();
      ctx.arc(rawTarget.x, rawTarget.y, player.r + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

  } else if (skillAimPreview.type === 'wall') {
    const centerDistance = player.r + 42;
    const centerX = player.x + dir.x * centerDistance;
    const centerY = player.y + dir.y * centerDistance;
    const perp = { x: -dir.y, y: dir.x };
    const halfLen = 75;

    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(170,210,255,0.82)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(centerX - perp.x * halfLen, centerY - perp.y * halfLen);
    ctx.lineTo(centerX + perp.x * halfLen, centerY + perp.y * halfLen);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(235,245,255,0.52)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - perp.x * halfLen, centerY - perp.y * halfLen);
    ctx.lineTo(centerX + perp.x * halfLen, centerY + perp.y * halfLen);
    ctx.stroke();
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
function drawResultOverlay() {
  if (gameState !== 'result') return;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(winnerText, canvas.width / 2, canvas.height / 2 - 10);
  ctx.font = '18px Arial';
  ctx.fillText('Returning to lobby...', canvas.width / 2, canvas.height / 2 + 28);
  ctx.textAlign = 'left';
}

// ── Main Render ───────────────────────────────────────────────
function render() {
  drawArena();
  drawObstacles();
  drawWalls();
  drawPotions();
  drawParticles();
  drawHooks();
  drawWalls();
  drawProjectiles();
  if (dummyEnabled && dummy.alive) drawDummy();
  drawPlayer();
  drawSkillAimPreview();
  drawDamageTexts();
  drawCrosshair();
  drawResultOverlay();

  if (window.outraThree && window.outraThree.render) {
    window.outraThree.render();
  }
}
