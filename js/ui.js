// ── Helpers ───────────────────────────────────────────────────
function escapeHtml(value) {
  return String(value)
    .replaceAll('&',  '&amp;')
    .replaceAll('<',  '&lt;')
    .replaceAll('>',  '&gt;')
    .replaceAll('"',  '&quot;')
    .replaceAll("'",  '&#39;');
}

function normalizeKey(key) { return key === ' ' ? 'space' : String(key).toLowerCase(); }

function prettyKey(key) {
  if (key === ' ' || key === 'space') return 'Space';
  if (key === 'escape')     return 'Esc';
  if (key === 'arrowup')    return 'Arrow Up';
  if (key === 'arrowdown')  return 'Arrow Down';
  if (key === 'arrowleft')  return 'Arrow Left';
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
  if (item.type === 'hat')     profile.equipped.hat    = id;
  if (item.type === 'sweater') profile.equipped.sweater = true;
  if (item.type === 'boots')   profile.equipped.boots   = true;
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
  if (item.type === 'boots')   profile.equipped.boots   = false;
  saveProfile();
  renderStore();
  renderInventory();
  drawLobbyPreview();
}

function renderInventory() {
  const ownedHats      = storeItems.filter(item => item.type === 'hat'                            && profile.store[item.id]);
  const ownedWearables = storeItems.filter(item => (item.type === 'sweater' || item.type === 'boots') && profile.store[item.id]);

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
    `<div class="inventoryCard"><div class="inventoryTitle">Hats</div>${hatRows}</div>` +
    `<div class="inventoryCard"><div class="inventoryTitle">Outfit</div>${outfitRows}</div>`;

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
    const owned  = !!profile.store[item.id];
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
      const id   = btn.getAttribute('data-store-id');
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

// ── HUD ───────────────────────────────────────────────────────
function updateSkillCooldownButtons() {
  const now = performance.now() / 1000;
  const cooldowns = {
    fire:   Math.max(0, player.fireReadyAt - now),
    hook:   Math.max(0, player.hookReadyAt - now),
    blink:  Math.max(0, player.teleportReadyAt - now),
    shield: now < player.shieldUntil
      ? (player.shieldUntil - now)
      : Math.max(0, player.shieldReadyAt - now),
  };

  // Mobile buttons
  Object.entries(skillButtons).forEach(([key, btn]) => {
    if (!btn) return;
    const cdOverlay = btn.querySelector('.mobileBtnCooldown');
    if (!cdOverlay) return;
    const cd = cooldowns[key] || 0;
    if (cd > 0.02) {
      btn.classList.add('onCooldown');
      cdOverlay.textContent = String(Math.ceil(cd));
    } else {
      btn.classList.remove('onCooldown');
      cdOverlay.textContent = '';
    }
  });

  // Desktop spell bar
  Object.entries(cooldowns).forEach(([key, cd]) => {
    const cell = document.getElementById(`dspell-${key}`);
    const cdEl = document.getElementById(`dcd-${key}`);
    if (!cell || !cdEl) return;
    if (cd > 0.02) {
      cell.classList.add('onCooldown');
      cdEl.textContent = String(Math.ceil(cd));
    } else {
      cell.classList.remove('onCooldown');
      cdEl.textContent = '';
    }
  });

  // Keep keybind labels in sync with current bindings
  const keyMap = { hook: 'dkey-hook', blink: 'dkey-blink', shield: 'dkey-shield' };
  const bindMap = { hook: keybinds.hook, blink: keybinds.teleport, shield: keybinds.shield };
  Object.entries(keyMap).forEach(([skill, elId]) => {
    const el = document.getElementById(elId);
    if (el) el.textContent = prettyKey(bindMap[skill]);
  });
}

function updateHud() {
  hpEl.textContent           = `HP: ${Math.ceil(player.hp)}` + (player.alive ? '' : ' (dead)');
  dummyHpEl.textContent      = !dummyEnabled
    ? 'Dummy HP: removed'
    : (dummy.alive ? `Dummy HP: ${Math.ceil(dummy.hp)}` : `Dummy HP: dead (${dummy.deadReason})`);
  playerNameHudEl.textContent = `Name: ${player.name}`;
  scoreHudEl.textContent      = `Score: ${player.score}`;
  wlkHudEl.textContent        = `WLK: ${profile.wlk}`;
  roundTimerHudEl.textContent = `Shrink In: ${Math.ceil(arena.shrinkTimer)}s`;
  controlsHudEl.textContent   = isTouchDevice
    ? 'Touch: Move stick | Pull skill and release to cast | Menu'
    : `Fire: Mouse1 | Hook: ${prettyKey(keybinds.hook)} | Teleport: ${prettyKey(keybinds.teleport)} | Shield: ${prettyKey(keybinds.shield)} | Menu: ${prettyKey(keybinds.menu)}`;
  musicToggleBtn.textContent  = `Music: ${musicMuted ? 'Off' : 'On'}`;
  musicToggleBtn.className    = musicMuted ? 'musicToggleOff' : 'musicToggleOn';
  toggleDummyBtn.textContent  = dummyEnabled ? 'Remove Dummy' : 'Add Dummy';
  hudToggleBtn.textContent    = hudVisible ? 'Hide Info' : 'Show Info';
  hud.style.display           = (gameState !== 'lobby' && hudVisible) ? 'block' : 'none';
  const spellBar = document.getElementById('desktopSpellBar');
  if (spellBar) spellBar.style.display = (gameState !== 'lobby' && !isTouchDevice) ? 'flex' : 'none';
  updateSkillCooldownButtons();
}

// ── Aim Sensitivity UI ────────────────────────────────────────
function updateAimSensitivityUI() {
  const value = Math.min(1.4, Math.max(0.35, Number(profile.aimSensitivity) || 0.7));
  profile.aimSensitivity = value;
  if (aimSensitivitySlider) aimSensitivitySlider.value = String(value);
  if (aimSensitivityValue)  aimSensitivityValue.textContent = `${value.toFixed(2)}x`;
}
