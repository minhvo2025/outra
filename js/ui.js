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

let spellTooltipEl = null;

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
  mobileControls.classList.toggle('show', isTouchDevice && gameState !== 'lobby');
}

// ── Ranked Panel (replaces color chooser) ─────────────────────
function getRankStarsHtml(stars) {
  let html = '';
  for (let i = 0; i < RANKED_CONFIG.promoStarCount; i++) {
    html += `<span style="font-size:18px; letter-spacing:1px; color:${i < stars ? '#ffd36b' : 'rgba(255,255,255,0.24)'}">★</span>`;
  }
  return html;
}

function getRankBadgeHtml(snapshot) {
  const colors = {
    bronze: '#b98157',
    silver: '#bfc7d8',
    gold: '#f0c45c',
    crystal: '#7ed7ff',
    master: '#d58cff',
  };

  const glow = colors[snapshot.tier.key] || '#ffffff';
  return `
    <div style="
      width:64px;
      height:64px;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:800;
      font-size:18px;
      color:#111;
      background:radial-gradient(circle at 35% 30%, #fff, ${glow});
      box-shadow:0 0 24px ${glow}55, inset 0 0 10px rgba(255,255,255,0.35);
      border:2px solid rgba(255,255,255,0.65);
      flex:0 0 auto;
    ">
      ${snapshot.tier.name.charAt(0)}
    </div>
  `;
}

function buildRankedPanel() {
  if (!colorRow) return;

const snapshot = getRankedSnapshot();

  colorRow.innerHTML = `
    <div style="
      width:100%;
      padding:14px 16px;
      border-radius:16px;
      background:linear-gradient(180deg, rgba(22,24,34,0.95), rgba(12,14,22,0.95));
      border:1px solid rgba(255,255,255,0.10);
      box-shadow:0 12px 30px rgba(0,0,0,0.28);
      color:#fff;
    ">
      <div style="font-size:12px; letter-spacing:1.4px; text-transform:uppercase; opacity:.7; margin-bottom:10px;">
        Ranked
      </div>

      <div style="display:flex; align-items:center; gap:14px;">
        ${getRankBadgeHtml(snapshot)}

        <div style="min-width:0; flex:1;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px;">
            <div style="font-size:22px; font-weight:800; white-space:nowrap;">${escapeHtml(snapshot.tier.name)}</div>
            <div style="font-size:13px; opacity:.75; white-space:nowrap;">MMR ${snapshot.mmr}</div>
          </div>

          <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
            <div>${getRankStarsHtml(snapshot.stars)}</div>
            <div style="font-size:12px; opacity:.78;">
              ${snapshot.promo ? 'Rank Up Match' : `${snapshot.stars}/${RANKED_CONFIG.promoStarCount} stars`}
            </div>
          </div>

<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
  <div style="font-size:12px; opacity:.78;">W ${snapshot.wins} • L ${snapshot.losses}</div>
</div>
      </div>
    </div>
  `;
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

  leaderboardList.innerHTML = entries.slice(0, 5).map((entry, i) => {
    let badgeHtml = '';

    if (i === 0) {
      badgeHtml = '<div class="rankBadge rankGold"></div>';
    } else if (i === 1) {
      badgeHtml = '<div class="rankBadge rankSilver"></div>';
    } else if (i === 2) {
      badgeHtml = '<div class="rankBadge rankBronze"></div>';
    } else {
      badgeHtml = `<div class="rankBadge rankDefault" data-rank="${i + 1}"></div>`;
    }

    return `
      <div class="aaaLbRow">
        ${badgeHtml}
        <div class="lbMeta">
          <div class="lbName">${escapeHtml(entry.name)}</div>
          <div class="lbPoints">${entry.points} pts</div>
        </div>
      </div>
    `;
  }).join('');
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

  bindDesktopSpellTooltips();
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
