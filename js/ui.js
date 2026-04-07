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

// ── Tab Switching ─────────────────────────────────────────────
function setMenuTab(tab) {
  activeMenuTab = tab;
  document.querySelectorAll('[data-menu-tab]').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.menuTab === tab)
  );
  document.querySelectorAll('.menuPage').forEach(page => page.classList.remove('active'));
  const page = document.getElementById('menu' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (page) page.classList.add('active');
}

function setLobbyTab(tab) {
  activeLobbyTab = tab;
  document.querySelectorAll('[data-lobby-tab]').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.lobbyTab === tab)
  );
  document.querySelectorAll('.lobbyPage').forEach(page => page.classList.remove('active'));
  const page = document.getElementById('lobby' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (page) page.classList.add('active');
}

// ── Mobile Controls Visibility ────────────────────────────────
function refreshMobileControls() {
  mobileControls.classList.toggle('show', isTouchDevice && gameState !== 'lobby');
}

// ── Color Chooser ─────────────────────────────────────────────
function buildColorChoices() {
  colorRow.innerHTML = '';
  colorChoices.forEach((choice, index) => {
    const btn = document.createElement('button');
    btn.className = 'colorChoice' + (index === selectedColorIndex ? ' selected' : '');
    btn.style.background = `radial-gradient(circle at 30% 30%, ${choice.body}, ${choice.wand})`;
    btn.addEventListener('click', () => {
      selectedColorIndex = index;
      applyPlayerColors();
      buildColorChoices();
      drawLobbyPreview();
      saveProfile();
    });
    colorRow.appendChild(btn);
  });
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
  if (!entries.length) {
    leaderboardList.innerHTML = '<div class="subtle">No entries yet. Win a match to get 3 points.</div>';
    return;
  }

  leaderboardList.innerHTML = entries
    .map((entry, i) =>
      `<div class="lbRow"><div>#${i + 1}</div><div>${escapeHtml(entry.name)}</div><div>${entry.points} pts</div></div>`
    )
    .join('');
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
  const ownedHats = storeItems.filter(item => item.type === 'hat' && profile.store[item.id]);
  const ownedWearables = storeItems.filter(item =>
    (item.type === 'sweater' || item.type === 'boots') && profile.store[item.id]
  );

  const hatRows = ownedHats.length
    ? ownedHats.map(item => {
        const wearing = profile.equipped.hat === item.id;
        return `<div class="inventoryItemRow">
          <span>${escapeHtml(item.name)}</span>
          <span>${wearing
            ? `<button class="secondary miniBtn" data-inv-unwear="${item.id}">Unwear</button>`
            : `<button class="secondary miniBtn" data-inv-wear="${item.id}">Wear</button>`}</span>
        </div>`;
      }).join('')
    : '<div class="hint">No hats owned yet.</div>';

  const outfitRows = ownedWearables.length
    ? ownedWearables.map(item => {
        const wearing = item.type === 'sweater' ? profile.equipped.sweater : profile.equipped.boots;
        return `<div class="inventoryItemRow">
          <span>${escapeHtml(item.name)}</span>
          <span>${wearing
            ? `<button class="secondary miniBtn" data-inv-unwear="${item.id}">Unwear</button>`
            : `<button class="secondary miniBtn" data-inv-wear="${item.id}">Wear</button>`}</span>
        </div>`;
      }).join('')
    : '<div class="hint">No outfit items owned yet.</div>';

  inventoryList.innerHTML =
    `<div class="inventoryCard"><div class="inventoryTitle">${BRAND.name} Hats</div>${hatRows}</div>` +
    `<div class="inventoryCard"><div class="inventoryTitle">${BRAND.name} Outfit</div>${outfitRows}</div>`;

  inventoryList.querySelectorAll('[data-inv-wear]').forEach(btn =>
    btn.addEventListener('click', () => equipItem(btn.getAttribute('data-inv-wear')))
  );
  inventoryList.querySelectorAll('[data-inv-unwear]').forEach(btn =>
    btn.addEventListener('click', () => unwearItem(btn.getAttribute('data-inv-unwear')))
  );
}

// ── Store ─────────────────────────────────────────────────────
function renderStore() {
  wlkLobbyEl.textContent = `WLK Points: ${profile.wlk}`;

  storeList.innerHTML = storeItems.map(item => {
    const owned = !!profile.store[item.id];
    const canBuy = profile.wlk >= item.cost && !owned;
    let actionHtml = '';

    if (!owned) {
      actionHtml = `<button class="secondary" data-store-id="${item.id}" ${canBuy ? '' : 'disabled'}>Buy</button>`;
    } else if (item.type === 'hat') {
      const wearing = profile.equipped.hat === item.id;
      actionHtml = `<div>
        <button class="secondary" data-wear-id="${item.id}">${wearing ? 'Wearing' : 'Wear'}</button>
        ${wearing ? ` <button class="secondary" data-unwear-id="${item.id}">Unwear</button>` : ''}
      </div>`;
    } else if (item.type === 'sweater') {
      const wearing = profile.equipped.sweater;
      actionHtml = `<div>
        <button class="secondary" data-wear-id="${item.id}">${wearing ? 'Wearing' : 'Wear'}</button>
        ${wearing ? ` <button class="secondary" data-unwear-id="${item.id}">Unwear</button>` : ''}
      </div>`;
    } else if (item.type === 'boots') {
      const wearing = profile.equipped.boots;
      actionHtml = `<div>
        <button class="secondary" data-wear-id="${item.id}">${wearing ? 'Wearing' : 'Wear'}</button>
        ${wearing ? ` <button class="secondary" data-unwear-id="${item.id}">Unwear</button>` : ''}
      </div>`;
    } else {
      actionHtml = '<button class="secondary" disabled>Owned</button>';
    }

    return `<div class="storeRow">
      <div>
        <div>${escapeHtml(item.name)} - ${item.cost} WLK</div>
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
}

// ── HUD ───────────────────────────────────────────────────────
function triggerReadyFlash(el) {
  if (!el) return;
  el.classList.remove('readyFlash');
  void el.offsetWidth;
  el.classList.add('readyFlash');
}

function updateSkillCooldownButtons() {
  const now = performance.now() / 1000;
  const cooldowns = {};

  activeSpellLoadout.forEach(spellId => {
    const def = SPELL_DEFS[spellId];
    if (!def) return;

    if (spellId === 'shield' && now < player.shieldUntil) {
      cooldowns[spellId] = player.shieldUntil - now;
    } else {
      cooldowns[spellId] = Math.max(0, (player[def.cooldownKey] || 0) - now);
    }
  });

  // Mobile buttons
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

  // Desktop spell bar
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

  // Keep keybind labels in sync
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

  Object.entries(keyMap).forEach(([skill, elId]) => {
    const el = document.getElementById(elId);
    if (el) el.textContent = prettyKey(bindMap[skill]);
  });
}

function updateHud() {
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

  hudToggleBtn.textContent = hudVisible ? 'Hide Info' : 'Show Info';
  playerNameHudEl.textContent = `Name: ${player.name}`;
  scoreHudEl.textContent = `Score: ${player.score}`;
  wlkHudEl.textContent = `WLK: ${profile.wlk}`;
  roundTimerHudEl.textContent = `Shrink In: ${Math.ceil(arena.shrinkTimer)}s`;

  controlsHudEl.textContent = isTouchDevice
    ? 'Touch: Move stick | Pull skill and release to cast | Top-right Menu'
    : `Fire: Mouse1 | Hook: ${prettyKey(keybinds.hook)} | Teleport: ${prettyKey(keybinds.teleport)} | Shield: ${prettyKey(keybinds.shield)} | Charge: ${prettyKey(keybinds.charge)} | Shock: ${prettyKey(keybinds.shock)} | Gust: ${prettyKey(keybinds.gust)} | Wall: hold ${prettyKey(keybinds.wall)} and release | Rewind: ${prettyKey(keybinds.rewind)} | Menu: ${prettyKey(keybinds.menu)}`;

  musicToggleBtn.textContent = `Music: ${musicMuted ? 'Off' : 'On'}`;
  musicToggleBtn.className = musicMuted ? 'musicToggleOff' : 'musicToggleOn';
  hud.style.display = (gameState !== 'lobby' && hudVisible) ? 'block' : 'none';

  const spellBar = document.getElementById('desktopSpellBar');
  if (spellBar) spellBar.style.display = (gameState !== 'lobby' && !isTouchDevice) ? 'flex' : 'none';

  updateSkillCooldownButtons();
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
