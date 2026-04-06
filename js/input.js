let desktopWallPrimed = false;
// ── Joystick Factory ──────────────────────────────────────────
function makeStickController(stickEl, thumbEl, state) {
  const maxBase = () => Math.max(28, stickEl.clientWidth * 0.3);

  const reset = () => {
    thumbEl.style.transform = 'translate(0px, 0px)';
    state.active    = false;
    state.dx        = 0;
    state.dy        = 0;
    state.touchId   = null;
    state.mouseDown = false;
  };

  const updateFromPoint = (clientX, clientY) => {
    const rect = stickEl.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    let dx = clientX - cx, dy = clientY - cy;
    const max  = maxBase();
    const dist = Math.hypot(dx, dy);
    if (dist > max) { dx = (dx / dist) * max; dy = (dy / dist) * max; }
    const outX = dx / max, outY = dy / max;
    if (Math.hypot(outX, outY) > 0.08) {
      state.dx = outX; state.dy = outY; state.active = true;
    } else {
      state.active = false; state.dx = 0; state.dy = 0;
    }
    thumbEl.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  stickEl.addEventListener('touchstart', (e) => {
    if (state.touchId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    e.preventDefault();
    state.touchId = t.identifier;
    updateFromPoint(t.clientX, t.clientY);
  }, { passive: false });

  stickEl.addEventListener('touchmove', (e) => {
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === state.touchId);
    if (!t) return;
    e.preventDefault();
    updateFromPoint(t.clientX, t.clientY);
  }, { passive: false });

  const endTouch = (e) => {
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === state.touchId);
    if (!t) return;
    e.preventDefault();
    reset();
  };
  stickEl.addEventListener('touchend', endTouch, { passive: false });
  stickEl.addEventListener('touchcancel', endTouch, { passive: false });

  stickEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    state.mouseDown = true;
    updateFromPoint(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', (e) => {
    if (!state.mouseDown) return;
    updateFromPoint(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => {
    if (!state.mouseDown) return;
    reset();
  });

  reset();
  return reset;
}

// ── Pull-to-Cast Mobile Button ────────────────────────────────
function bindPullCastButton(btn, handler, skillType) {
  const arrow = btn.querySelector('.mobileDragArrow');
  let touchId = null, mouseDown = false, aiming = false;

  function showArrow(dx, dy) {
    const len = Math.min(56, Math.max(18, Math.hypot(dx, dy)));
    const ang = Math.atan2(dy, dx);
    arrow.style.display   = 'block';
    arrow.style.width     = `${len}px`;
    arrow.style.transform = `translate(0px, -2px) rotate(${ang}rad)`;
  }
  function hideArrow() { arrow.style.display = 'none'; }

  function setAimFromPoint(clientX, clientY) {
    const rect        = btn.getBoundingClientRect();
    const cx          = rect.left + rect.width  / 2;
    const cy          = rect.top  + rect.height / 2;
    const sensitivity = Number(profile.aimSensitivity) || 0.7;
    const dx          = (clientX - cx) * sensitivity;
    const dy          = (clientY - cy) * sensitivity;
    const len         = Math.hypot(dx, dy);
    if (len > 8) {
      player.aimX = dx / len;
      player.aimY = dy / len;
      mouse.x = player.x + player.aimX * 140;
      mouse.y = player.y + player.aimY * 140;
      showArrow(dx, dy);
      skillAimPreview.active = true;
      skillAimPreview.type   = skillType;
      skillAimPreview.dx     = player.aimX;
      skillAimPreview.dy     = player.aimY;
    } else {
      hideArrow();
      skillAimPreview.active = false;
      skillAimPreview.type   = null;
    }
  }

  function begin(clientX, clientY) {
    aiming = true;
    btn.classList.add('aiming');
    setAimFromPoint(clientX, clientY);
  }

  function finish(clientX, clientY) {
    if (!aiming) return;
    setAimFromPoint(clientX, clientY);
    btn.classList.remove('aiming');
    hideArrow();
    aiming = false;
    skillAimPreview.active = false;
    skillAimPreview.type   = null;
    startMusicIfNeeded();
    handler();
  }

  function cancel() {
    btn.classList.remove('aiming');
    hideArrow();
    aiming    = false;
    touchId   = null;
    mouseDown = false;
    skillAimPreview.active = false;
    skillAimPreview.type   = null;
  }

  btn.addEventListener('touchstart', (e) => {
    if (touchId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    e.preventDefault();
    touchId = t.identifier;
    begin(t.clientX, t.clientY);
  }, { passive: false });

  btn.addEventListener('touchmove', (e) => {
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === touchId);
    if (!t || !aiming) return;
    e.preventDefault();
    setAimFromPoint(t.clientX, t.clientY);
  }, { passive: false });

  btn.addEventListener('touchend', (e) => {
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === touchId);
    if (!t || !aiming) return;
    e.preventDefault();
    finish(t.clientX, t.clientY);
    touchId = null;
  }, { passive: false });

  btn.addEventListener('touchcancel', (e) => {
    const t = Array.from(e.changedTouches).find(touch => touch.identifier === touchId);
    if (!t) return;
    e.preventDefault();
    cancel();
  }, { passive: false });

  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    mouseDown = true;
    begin(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', (e) => {
    if (!mouseDown || !aiming) return;
    setAimFromPoint(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', (e) => {
    if (!mouseDown || !aiming) return;
    finish(e.clientX, e.clientY);
    mouseDown = false;
  });
}

// ── Keyboard ──────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  const norm = normalizeKey(e.key);

  if (waitingForBind) {
    e.preventDefault();
    if (!['shift', 'control', 'alt', 'meta'].includes(norm)) {
      keybinds[waitingForBind] = norm;
      waitingForBind = null;
      buildKeybindsUI();
      saveProfile();
      updateHud();
    }
    return;
  }

  keys[norm] = true;

  if (gameState !== 'lobby' && norm === keybinds.teleport) {
    e.preventDefault();
    startMusicIfNeeded();
    castPlayerSpell('blink');
  }

  if (gameState === 'playing' && norm === keybinds.hook) {
    startMusicIfNeeded();
    castPlayerSpell('hook');
  }

  if (gameState === 'playing' && norm === keybinds.shield) {
    startMusicIfNeeded();
    castPlayerSpell('shield');
  }

  if (gameState === 'playing' && norm === keybinds.charge) {
    startMusicIfNeeded();
    castPlayerSpell('charge');
  }

  if (gameState === 'playing' && norm === keybinds.shock) {
    startMusicIfNeeded();
    castPlayerSpell('shock');
  }

  if (gameState === 'playing' && norm === keybinds.gust) {
    startMusicIfNeeded();
    castPlayerSpell('gust');
  }

  if (gameState === 'playing' && norm === keybinds.wall) {
    e.preventDefault();
    if (!desktopWallPrimed) {
      desktopWallPrimed = true;
      skillAimPreview.active = true;
      skillAimPreview.type = 'wall';
      skillAimPreview.dx = player.aimX;
      skillAimPreview.dy = player.aimY;
    }
  }

  if (gameState === 'playing' && norm === keybinds.rewind) {
    e.preventDefault();
    startMusicIfNeeded();
    castPlayerSpell('rewind');
  }

  if (gameState !== 'lobby' && norm === keybinds.reset) resetRound();

  if (norm === keybinds.menu) {
    menuOpen = !menuOpen;
    menuPanel.style.display = menuOpen ? 'block' : 'none';
    setMenuTab(activeMenuTab);
  }
});

window.addEventListener('keyup', (e) => {
  const norm = normalizeKey(e.key);
  keys[norm] = false;

  if (norm === keybinds.wall) {
    if (desktopWallPrimed && gameState === 'playing') {
      startMusicIfNeeded();
      castPlayerSpell('wall');
    }
    desktopWallPrimed = false;
    if (skillAimPreview.type === 'wall') {
      skillAimPreview.active = false;
      skillAimPreview.type = null;
    }
  }
});

// ── Mouse ─────────────────────────────────────────────────────
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x    = e.clientX - rect.left;
  mouse.y    = e.clientY - rect.top;
  if (!isTouchDevice) {
    const aim    = normalized(mouse.x - player.x, mouse.y - player.y);
    player.aimX  = aim.x;
    player.aimY  = aim.y;
    if (desktopWallPrimed) {
      skillAimPreview.active = true;
      skillAimPreview.type = 'wall';
      skillAimPreview.dx = aim.x;
      skillAimPreview.dy = aim.y;
    }
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (gameState !== 'playing') return;
  startMusicIfNeeded();
  if (e.button === 0) castPlayerSpell('fire');
  else if (e.button === 2) castPlayerSpell('blink');
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ── Touch (canvas) ────────────────────────────────────────────
canvas.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  if (!t) return;
  const rect = canvas.getBoundingClientRect();
  mouse.x    = t.clientX - rect.left;
  mouse.y    = t.clientY - rect.top;
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (!t) return;
  const rect = canvas.getBoundingClientRect();
  mouse.x    = t.clientX - rect.left;
  mouse.y    = t.clientY - rect.top;
}, { passive: true });

// ── UI Button Events ──────────────────────────────────────────
hudToggleBtn.addEventListener('click', () => { hudVisible = !hudVisible; updateHud(); });

menuBtn.addEventListener('click',       () => { menuOpen = !menuOpen; menuPanel.style.display = menuOpen ? 'block' : 'none'; setMenuTab(activeMenuTab); });
lobbyMenuBtn.addEventListener('click',  () => { menuOpen = !menuOpen; menuPanel.style.display = menuOpen ? 'block' : 'none'; setMenuTab(activeMenuTab); });

document.querySelectorAll('[data-menu-tab]').forEach(btn =>
  btn.addEventListener('click', () => setMenuTab(btn.dataset.menuTab))
);
document.querySelectorAll('[data-lobby-tab]').forEach(btn =>
  btn.addEventListener('click', () => setLobbyTab(btn.dataset.lobbyTab))
);

resumeBtn.addEventListener('click',  () => { menuOpen = false; menuPanel.style.display = 'none'; });
toLobbyBtn.addEventListener('click', () => enterLobby());
resetBtn.addEventListener('click',   () => { resetRound(); menuOpen = false; menuPanel.style.display = 'none'; });

musicToggleBtn.addEventListener('click', () => { startMusicIfNeeded(); setMusicMuted(!musicMuted); updateHud(); });

standingDummyBtn.addEventListener('click', () => {
  spawnDummy('standing');
  updateHud();
});

activeDummyBtn.addEventListener('click', () => {
  spawnDummy('active');
  updateHud();
});

removeDummyBtn.addEventListener('click', () => {
  removeDummy();
  updateHud();
});

menuResetBindsBtn.addEventListener('click', () => {
  keybinds       = { ...defaultBinds };
  waitingForBind = null;
  buildKeybindsUI();
  saveProfile();
  updateHud();
});

if (aimSensitivitySlider) {
  aimSensitivitySlider.addEventListener('input', () => {
    profile.aimSensitivity = Math.min(1.4, Math.max(0.35, Number(aimSensitivitySlider.value) || 0.7));
    updateAimSensitivityUI();
    saveProfile();
  });
}

startBtn.addEventListener('click', (e) => { e.preventDefault(); startMatch(); });

nameInput.addEventListener('input', () => {
  player.name = (nameInput.value || 'Player').trim().slice(0, 16) || 'Player';
  drawLobbyPreview();
});

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); startMatch(); }
});

// ── Mobile Skill Buttons ──────────────────────────────────────
bindPullCastButton(mobileFireBtn,     () => castPlayerSpell('fire'),   'fire');
bindPullCastButton(mobileHookBtn,     () => castPlayerSpell('hook'),   'hook');
bindPullCastButton(mobileTeleportBtn, () => castPlayerSpell('blink'),  'blink');
bindPullCastButton(mobileShieldBtn,   () => castPlayerSpell('shield'), 'shield');
bindPullCastButton(mobileChargeBtn,   () => castPlayerSpell('charge'), 'charge');
bindPullCastButton(mobileShockBtn, () => castPlayerSpell('shock'), 'shock');
bindPullCastButton(mobileGustBtn,  () => castPlayerSpell('gust'),  'gust');
bindPullCastButton(mobileWallBtn,  () => castPlayerSpell('wall'),  'wall');

// ── Window Resize ─────────────────────────────────────────────
window.addEventListener('resize', () => {
  resizeCanvas();
  refreshMobileControls();
  drawLobbyPreview();
});
