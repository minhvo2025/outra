// ── Storage Keys ──────────────────────────────────────────────
const STORAGE_KEY = 'warlock_mvp_leaderboard_v1';
const PROFILE_KEY = 'warlock_mvp_profile_v14';

// ── Device Detection ──────────────────────────────────────────
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 900;

// ── Color Choices ─────────────────────────────────────────────
const colorChoices = [
  { body: '#d9d9ff', wand: '#7c4dff' },
  { body: '#9be7ff', wand: '#008cff' },
  { body: '#ffd8b8', wand: '#ff7a1a' },
  { body: '#b8ffcb', wand: '#10c45c' },
  { body: '#ffc1e3', wand: '#d43186' },
  { body: '#fff0a8', wand: '#c89b00' },
];

// ── Spell Definitions ─────────────────────────────────────────
const SPELL_DEFS = {
  fire: {
    id: 'fire',
    name: 'Fireblast',
    icon: '🔥',
    cooldownKey: 'fireReadyAt',
  },
  hook: {
    id: 'hook',
    name: 'Hook',
    icon: '🪝',
    cooldownKey: 'hookReadyAt',
  },
  blink: {
    id: 'blink',
    name: 'Blink',
    icon: '✦',
    cooldownKey: 'teleportReadyAt',
  },
  shield: {
    id: 'shield',
    name: 'Shield',
    icon: '🛡️',
    cooldownKey: 'shieldReadyAt',
  },
  charge: {
    id: 'charge',
    name: 'Arcane Charge',
    icon: '⚡',
    cooldownKey: 'chargeReadyAt',
  },
};

// ── Store Items ───────────────────────────────────────────────
const storeItems = [
  { id: 'potionBoost',    type: 'upgrade', name: 'Potion Boost',     cost: 3, description: '+5 extra heal from potions',            apply: (p) => p.store.potionBoost = true },
  { id: 'cooldownCharm',  type: 'upgrade', name: 'Cooldown Charm',   cost: 5, description: 'Slightly faster hook cooldown',         apply: (p) => p.store.cooldownCharm = true },
  { id: 'musicPack',      type: 'upgrade', name: 'Music Pack',       cost: 2, description: 'Just for flavor. Unlocks nothing yet.', apply: (p) => p.store.musicPack = true },
  { id: 'wizardHat',      type: 'hat',     name: 'Wizard Hat',       cost: 4, description: 'Classic pointy mage hat',               apply: (p) => p.store.wizardHat = true },
  { id: 'beanie',         type: 'hat',     name: 'Beanie',           cost: 3, description: 'Soft round cap',                        apply: (p) => p.store.beanie = true },
  { id: 'crown',          type: 'hat',     name: 'Crown',            cost: 7, description: 'Royal shiny crown',                     apply: (p) => p.store.crown = true },
  { id: 'strawHat',       type: 'hat',     name: 'Straw Hat',        cost: 5, description: 'Wide brim straw hat',                   apply: (p) => p.store.strawHat = true },
  { id: 'sweater',        type: 'sweater', name: 'Sweater',          cost: 4, description: 'Cozy warlock sweater',                  apply: (p) => p.store.sweater = true },
  { id: 'boots',          type: 'boots',   name: 'Boots',            cost: 4, description: 'Adventurer boots',                      apply: (p) => p.store.boots = true },
];

// ── Keybinds ──────────────────────────────────────────────────
const defaultBinds = {
  up: 'w', down: 's', left: 'a', right: 'd',
  hook: 'e', teleport: 'space', shield: 'q', charge: 'f', reset: 'r', menu: 'escape'
};
const bindLabels = {
  up: 'Move Up', down: 'Move Down', left: 'Move Left', right: 'Move Right',
  hook: 'Hook', teleport: 'Teleport', shield: 'Shield', charge: 'Arcane Charge', reset: 'Reset Round', menu: 'Menu'
};

let keybinds = { ...defaultBinds };

// ── Game State ────────────────────────────────────────────────
let waitingForBind = null;
let selectedColorIndex = 0;
let gameState = 'lobby';
let menuOpen = false;
let winnerText = '';
let resultTimer = 0;
let lavaSoundTimer = 0;
let musicMuted = false;
let activeMenuTab = 'main';
let activeLobbyTab = 'play';
let dummyEnabled = true;
let hudVisible = true;

const skillAimPreview = { active: false, type: null, dx: 1, dy: 0 };


// ── 3D Character Layer ───────────────────────────────────────
window.WARLOCK_3D_CONFIG = {
  enabled: true,
  playerCharacter: {
    idle: 'docs/art/character/idle.glb',
    run: 'docs/art/character/run.glb',
    cast: 'docs/art/character/cast.glb',
    dash: 'docs/art/character/dash.glb',
    hit: 'docs/art/character/hit.glb',
  },
  worldScale: 1,
  actorScale: 28,
  hoverHeight: 0,
  shadowSize: 18,
  castHoldTime: 0.22,
  hitHoldTime: 0.28,
  dashHoldTime: 0.30,
  actorHeight: 45,
  modelYOffset: 0,
  modelYOffsetMobile: -200,
};

// ── Input State ───────────────────────────────────────────────
const keys = {};
const mouse = { x: 0, y: 0 };
const moveStick = { active: false, dx: 0, dy: 0, touchId: null, mouseDown: false };

// ── Profile ───────────────────────────────────────────────────
const profile = {
  wlk: 0,
  musicMuted: false,
  store: {
    potionBoost: false, cooldownCharm: false, musicPack: false,
    wizardHat: false, beanie: false, crown: false, strawHat: false,
    sweater: false, boots: false
  },
  equipped: { hat: null, sweater: false, boots: false }
};

// ── Arena ─────────────────────────────────────────────────────
const arena = {
  cx: 0, cy: 0, baseRadius: 0, radius: 0,
  shrinkInterval: 20, shrinkTimer: 20, shrinkStep: 26, minRadius: 190
};
const playerSpawn = { x: 0, y: 0 };
const dummySpawn  = { x: 0, y: 0 };

// ── Player ────────────────────────────────────────────────────
const player = {
  name: 'Player', x: 0, y: 0, vx: 0, vy: 0, r: 18, speed: 280, hp: 100, maxHp: 100,
  fireCooldown: 0.45, hookCooldown: 1.8, teleportCooldown: 2.5, shieldCooldown: 4.5, chargeCooldown: 5.5,
  fireReadyAt: 0, hookReadyAt: 0, teleportReadyAt: 0, shieldReadyAt: 0, chargeReadyAt: 0,
  teleportDistance: 150, shieldUntil: 0,
  chargeActive: false, chargeDirX: 0, chargeDirY: 0, chargeTimer: 0, chargeHit: false,
  alive: true, deadReason: '', score: 0,
  bodyColor: colorChoices[0].body, wandColor: colorChoices[0].wand,
  aimX: 1, aimY: 0,
};

// ── Active Spell Loadout (order = slots) ─────────────────────
let activeSpellLoadout = ['fire', 'hook', 'blink', 'shield', 'charge'];

// ── Dummy ─────────────────────────────────────────────────────
const dummy = {
  name: 'Dummy', x: 0, y: 0, vx: 0, vy: 0, r: 18, speed: 185, hp: 100, maxHp: 100,
  alive: true, deadReason: '', fireCooldown: 0.9, hookCooldown: 3.1,
  fireReadyAt: 0, hookReadyAt: 0,
  aiStrafeDir: 1, aiSwitchTimer: 0, aiMoveTimer: 0, targetX: 0, targetY: 0,
};

// ── World Collections ─────────────────────────────────────────
const projectiles = [];
const particles   = [];
const damageTexts = [];
const obstacles   = [];
const hooks       = [];
const potions     = [];

// ── Misc Timers ───────────────────────────────────────────────
let lastTime         = performance.now();
let lavaTick         = 0;
let potionSpawnTimer = 6;

// ── DOM References ────────────────────────────────────────────
const canvas        = document.getElementById('game');
const ctx           = canvas.getContext('2d');
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx    = previewCanvas.getContext('2d');

const hud               = document.getElementById('hud');
const overlay           = document.getElementById('overlay');
const topbar            = document.getElementById('topbar');
const menuPanel         = document.getElementById('menuPanel');
const menuBtn           = document.getElementById('menuBtn');
const hudToggleBtn      = document.getElementById('hudToggleBtn');
const lobbyMenuBtn      = document.getElementById('lobbyMenuBtn');
const mobileControls    = document.getElementById('mobileControls');
const moveJoystick      = document.getElementById('moveJoystick');
const moveJoystickThumb = document.getElementById('moveJoystickThumb');
const mobileFireBtn     = document.getElementById('mobileFireBtn');
const mobileHookBtn     = document.getElementById('mobileHookBtn');
const mobileTeleportBtn = document.getElementById('mobileTeleportBtn');
const mobileShieldBtn   = document.getElementById('mobileShieldBtn');
const mobileChargeBtn   = document.getElementById('mobileChargeBtn');

const skillButtons = {
  fire:   mobileFireBtn,
  hook:   mobileHookBtn,
  blink:  mobileTeleportBtn,
  shield: mobileShieldBtn,
  charge: mobileChargeBtn,
};

const resumeBtn         = document.getElementById('resumeBtn');
const toLobbyBtn        = document.getElementById('toLobbyBtn');
const resetBtn          = document.getElementById('resetBtn');
const musicToggleBtn    = document.getElementById('musicToggleBtn');
const toggleDummyBtn    = document.getElementById('toggleDummyBtn');
const menuResetBindsBtn = document.getElementById('menuResetBindsBtn');

const hpEl              = document.getElementById('hp');
const dummyHpEl         = document.getElementById('dummyHp');
const scoreHudEl        = document.getElementById('scoreHud');
const wlkHudEl          = document.getElementById('wlkHud');
const playerNameHudEl   = document.getElementById('playerNameHud');
const roundTimerHudEl   = document.getElementById('roundTimerHud');
const controlsHudEl     = document.getElementById('controlsHud');

const nameInput         = document.getElementById('nameInput');
const colorRow          = document.getElementById('colorRow');
const startBtn          = document.getElementById('startBtn');
const leaderboardList   = document.getElementById('leaderboardList');
const bindList          = document.getElementById('menuBindList');
const wlkLobbyEl        = document.getElementById('wlkLobby');
const storeList         = document.getElementById('storeList');
const inventoryList     = document.getElementById('inventoryList');
const aimSensitivitySlider = document.getElementById('aimSensitivitySlider');
const aimSensitivityValue  = document.getElementById('aimSensitivityValue');
