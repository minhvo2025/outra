// ── Brand ─────────────────────────────────────────────────────
const BRAND = {
  name: 'Outra',
  lobbyTitle: 'Outra',
  storagePrefix: 'outra',
  legacyStoragePrefix: 'warlock_mvp',
};

// ── Storage Keys ──────────────────────────────────────────────
const STORAGE_KEY = `${BRAND.storagePrefix}_leaderboard_v1`;
const PROFILE_KEY = `${BRAND.storagePrefix}_profile_v2`;

const LEGACY_STORAGE_KEY = 'warlock_mvp_leaderboard_v1';
const LEGACY_PROFILE_KEY = 'warlock_mvp_profile_v14';

// ── Device Detection ──────────────────────────────────────────
const isTouchDevice =
  window.matchMedia('(pointer: coarse)').matches ||
  window.innerWidth <= 900;

// ── Auto Player Colors (assigned automatically) ───────────────
const autoPlayerColors = [
  { name: 'Arcane Violet', body: '#d9d9ff', wand: '#7c4dff' },
  { name: 'Azure Storm', body: '#9be7ff', wand: '#008cff' },
  { name: 'Ember Gold', body: '#ffd8b8', wand: '#ff7a1a' },
  { name: 'Verdant Surge', body: '#b8ffcb', wand: '#10c45c' },
];

// ── Ranked System ─────────────────────────────────────────────
const RANKED_CONFIG = {
  mmrPerStar: 20,
  promoStarCount: 5,
  derankProtectionLossesAtZero: 1,
  winMmr: 20,
  lossMmr: 20,
  tiers: [
    { key: 'bronze',  name: 'Bronze',  min: 0,   max: 99,   iconIndex: 0 },
    { key: 'silver',  name: 'Silver',  min: 100, max: 199,  iconIndex: 1 },
    { key: 'gold',    name: 'Gold',    min: 200, max: 299,  iconIndex: 2 },
    { key: 'crystal', name: 'Crystal', min: 300, max: 399,  iconIndex: 2 },
    { key: 'master',  name: 'Master',  min: 400, max: Infinity, iconIndex: 2 },
  ],
};

// ── Spell Definitions ─────────────────────────────────────────
const SPELL_DEFS = {
  fire: {
    id: 'fire',
    name: 'Fireblast',
    icon: '🔥',
    cooldownKey: 'fireReadyAt',
  },
  shock: {
    id: 'shock',
    name: 'Shock Blast',
    icon: '💥',
    cooldownKey: 'shockReadyAt',
  },
  gust: {
    id: 'gust',
    name: 'Gust',
    icon: '🌪️',
    cooldownKey: 'gustReadyAt',
  },
  wall: {
    id: 'wall',
    name: 'Wall',
    icon: '🧱',
    cooldownKey: 'wallReadyAt',
  },
  rewind: {
    id: 'rewind',
    name: 'Rewind',
    icon: '⏪',
    cooldownKey: 'rewindReadyAt',
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

// ── Spell Icons ───────────────────────────────────────────────
const SPELL_ICONS = {
  fire:    '/docs/art/spells/fireball.jpeg',
  hook:    '/docs/art/spells/hook.jpeg',
  blink:   '/docs/art/spells/blink.jpeg',
  shield:  '/docs/art/spells/shield.jpeg',
  charge:  '/docs/art/spells/charge.jpeg',
  shock:   '/docs/art/spells/shock.jpeg',
  gust:    '/docs/art/spells/gust.jpeg',
  wall:    '/docs/art/spells/wall.jpeg',
  rewind:  '/docs/art/spells/rewind.jpeg'
};

// ── Store Items ───────────────────────────────────────────────
const storeItems = [
  {
    id: 'potionBoost',
    type: 'upgrade',
    name: 'Potion Boost',
    cost: 3,
    description: '+5 extra heal from potions',
    apply: (p) => p.store.potionBoost = true
  },
  {
    id: 'cooldownCharm',
    type: 'upgrade',
    name: 'Cooldown Charm',
    cost: 5,
    description: 'Slightly faster hook cooldown',
    apply: (p) => p.store.cooldownCharm = true
  },
  {
    id: 'musicPack',
    type: 'upgrade',
    name: 'Music Pack',
    cost: 2,
    description: 'Just for flavor. Unlocks nothing yet.',
    apply: (p) => p.store.musicPack = true
  },
  {
    id: 'wizardHat',
    type: 'hat',
    name: 'Wizard Hat',
    cost: 4,
    description: 'Classic pointy mage hat',
    apply: (p) => p.store.wizardHat = true
  },
  {
    id: 'beanie',
    type: 'hat',
    name: 'Beanie',
    cost: 3,
    description: 'Soft round cap',
    apply: (p) => p.store.beanie = true
  },
  {
    id: 'crown',
    type: 'hat',
    name: 'Crown',
    cost: 7,
    description: 'Royal shiny crown',
    apply: (p) => p.store.crown = true
  },
  {
    id: 'strawHat',
    type: 'hat',
    name: 'Straw Hat',
    cost: 5,
    description: 'Wide brim straw hat',
    apply: (p) => p.store.strawHat = true
  },
  {
    id: 'sweater',
    type: 'sweater',
    name: 'Sweater',
    cost: 4,
    description: 'Cozy sweater',
    apply: (p) => p.store.sweater = true
  },
  {
    id: 'boots',
    type: 'boots',
    name: 'Boots',
    cost: 4,
    description: 'Adventurer boots',
    apply: (p) => p.store.boots = true
  },
];

// ── Keybinds ──────────────────────────────────────────────────
const defaultBinds = {
  up: 'w',
  down: 's',
  left: 'a',
  right: 'd',
  hook: 'e',
  teleport: 'space',
  shield: 'q',
  charge: 'f',
  shock: 'c',
  gust: 'x',
  wall: 'v',
  rewind: 'z',
  reset: 'r',
  menu: 'escape',
};

const bindLabels = {
  up: 'Move Up',
  down: 'Move Down',
  left: 'Move Left',
  right: 'Move Right',
  hook: 'Hook',
  teleport: 'Teleport',
  shield: 'Shield',
  charge: 'Arcane Charge',
  shock: 'Shock',
  gust: 'Gust',
  wall: 'Wall',
  rewind: 'Rewind',
  reset: 'Reset Round',
  menu: 'Menu'
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
let dummyEnabled = false;
let dummyBehavior = 'active'; // 'active' | 'standing'
let hudVisible = false;

const skillAimPreview = {
  active: false,
  type: null,
  dx: 1,
  dy: 0
};

// ── 3D Character Layer ───────────────────────────────────────
window.OUTRA_3D_CONFIG = {
  enabled: true,

  lobbyArt: {
    bg: '/docs/art/Lobby/BG.jpeg',
    button: '/docs/art/Lobby/Button.png',
    currency: '/docs/art/Lobby/Currency.png',
    frame: '/docs/art/Lobby/Frame.png',
    emberOrange: '/docs/art/Lobby/Orange.png',
    emberPurple: '/docs/art/Lobby/Purple.png',
    ranks: '/docs/art/Lobby/Ranks.png',
  },

  lobbyCharacter: {
    glb: '/docs/art/Lobby/Outron_lobby.glb',
    animations: {
      idle: 'idle',
    },
  },

 arenaCharacter: {
    glb: '/docs/art/character/Outron_arena.glb',

    // Leave clip names as they are for now since these are the names
    // your current model setup is using.
    animations: {
      idle: 'Hit_Reaction_1',
      walk: 'Idle_5',
      run: 'Idle_5',
      cast: 'Walking',
      dash: 'Running',
      hit: 'mage_soell_cast_4',
    },

    // IMPORTANT:
    // Arena model was getting flipped twice.
    // Keep base rotation neutral here.
    baseRotation: {
      x: 0,
      y: 0,
      z: 0,
    },

    // Speed multipliers to make arena feel snappier again.
    animationSpeeds: {
      idle: 1.3,
      walk: 1.15,
      run: 1.3,
      cast: 1.5,
      dash: 1.35,
      hit: 2.1,
    },
  },

  arenaFloor: {
    enabled: false,
    glb: '/docs/Objects/floor.glb',
    yOffset: 1,
    opacity: 1,
    brightness: 0.1,
    lockRotationX: 0,
    lockRotationY: 0,
    lockRotationZ: 0,
  },

  floorEnergyEnabled: true,
  floorEnergySpeedX: 0.0035,
  floorEnergySpeedY: 0.0055,
  floorEnergyStrength: 1.0,

  worldScale: 1,
  actorScale: 28,
  hoverHeight: 0,
  shadowSize: 18,
  castHoldTime: 0.22,
  hitHoldTime: 0.28,
  dashHoldTime: 0.30,
  actorHeight: 45,
  modelYOffset: 14,
  modelYOffsetMobile: 14,

  previewCharacter: {
    targetHeightDesktop: 112,
    targetHeightMobile: 84,

    cameraFovDesktop: 30,
    cameraFovMobile: 34,

    cameraYDesktop: 96,
    cameraYMobile: 68,

    cameraZDesktop: 368,
    cameraZMobile: 392,

    lookAtYDesktop: 74,
    lookAtYMobile: 54,

    modelYOffsetDesktop: -28,
    modelYOffsetMobile: -20,

    shadowScaleXDesktop: 1.8,
    shadowScaleXMobile: 1.55,
    shadowScaleYDesktop: 0.82,
    shadowScaleYMobile: 0.74,
  },
};

// ── Input State ───────────────────────────────────────────────
const keys = {};
const mouse = { x: 0, y: 0 };
const moveStick = {
  active: false,
  dx: 0,
  dy: 0,
  touchId: null,
  mouseDown: false
};

// ── Profile ───────────────────────────────────────────────────
const profile = {
  wlk: 0,
  musicMuted: false,
  musicVolume: 0.38,
  aimSensitivity: 0.7,
  ranked: {
    mmr: 0,
    wins: 0,
    losses: 0,
    zeroStarLossBuffer: 0,
  },
  store: {
    potionBoost: false,
    cooldownCharm: false,
    musicPack: false,
    wizardHat: false,
    beanie: false,
    crown: false,
    strawHat: false,
    sweater: false,
    boots: false
  },
  equipped: {
    hat: null,
    sweater: false,
    boots: false
  }
};

// ── Arena ─────────────────────────────────────────────────────
const arena = {
  cx: 0,
  cy: 0,
  baseRadius: 0,
  radius: 0,
  shrinkInterval: 20,
  shrinkTimer: 20,
  shrinkStep: 26,
  minRadius: 190
};

const playerSpawn = { x: 0, y: 0 };
const dummySpawn  = { x: 0, y: 0 };

// ── Player ────────────────────────────────────────────────────
const player = {
  name: 'Player',
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  r: 18,
  speed: 280,
  hp: 100,
  maxHp: 100,

  fireCooldown: 0.45,
  hookCooldown: 1.8,
  teleportCooldown: 2.5,
  shieldCooldown: 4.5,
  chargeCooldown: 5.5,
  shockCooldown: 3.2,
  gustCooldown: 6.0,
  wallCooldown: 8.0,
  rewindCooldown: 9.0,

  fireReadyAt: 0,
  hookReadyAt: 0,
  teleportReadyAt: 0,
  shieldReadyAt: 0,
  chargeReadyAt: 0,
  shockReadyAt: 0,
  gustReadyAt: 0,
  wallReadyAt: 0,
  rewindReadyAt: 0,

  teleportDistance: 150,
  shieldUntil: 0,

  chargeActive: false,
  chargeDirX: 0,
  chargeDirY: 0,
  chargeTimer: 0,
  chargeHit: false,

  alive: true,
  deadReason: '',
  score: 0,

  bodyColor: autoPlayerColors[0].body,
  wandColor: autoPlayerColors[0].wand,

  aimX: 1,
  aimY: 0,

  rewindSeconds: 1.0,
};

// ── Active Spell Loadout (order = slots) ─────────────────────
let activeSpellLoadout = [
  'fire',
  'hook',
  'blink',
  'shield',
  'charge',
  'shock',
  'gust',
  'wall',
  'rewind'
];

// ── Dummy ─────────────────────────────────────────────────────
const dummy = {
  name: 'Dummy',
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  r: 18,
  speed: 185,
  hp: 100,
  maxHp: 100,

  alive: true,
  deadReason: '',

  fireCooldown: 0.9,
  hookCooldown: 3.1,
  fireReadyAt: 0,
  hookReadyAt: 0,

  aiStrafeDir: 1,
  aiSwitchTimer: 0,
  aiMoveTimer: 0,
  targetX: 0,
  targetY: 0,
};

// ── World Collections ─────────────────────────────────────────
const projectiles = [];
const particles = [];
const damageTexts = [];
const obstacles = [];
const walls = [];
const hooks = [];
const potions = [];
const rewindHistory = [];
let rewindLastSampleAt = 0;

// ── Misc Timers ───────────────────────────────────────────────
let lastTime = performance.now();
let lavaTick = 0;
let potionSpawnTimer = 6;

// ── DOM References ────────────────────────────────────────────
const canvas = document.getElementById('game');
const bgCtx = canvas.getContext('2d');

const fxCanvas = document.getElementById('gameFx');
const fxCtx = fxCanvas.getContext('2d');

let ctx = bgCtx;

const hud = document.getElementById('hud');
const topbar = document.getElementById('topbar');
const overlay = document.getElementById('overlay');
const menuPanel = document.getElementById('menuPanel');

const hpEl = document.getElementById('hp');
const dummyHpEl = document.getElementById('dummyHp');
const scoreHudEl = document.getElementById('scoreHud');
const wlkHudEl = document.getElementById('wlkHud');
const roundTimerHudEl = document.getElementById('roundTimerHud');
const controlsHudEl = document.getElementById('controlsHud');
const playerNameHudEl = document.getElementById('playerNameHud');

const hudToggleBtn = document.getElementById('hudToggleBtn');
const menuBtn = document.getElementById('menuBtn');
const lobbyMenuBtn = document.getElementById('lobbyMenuBtn');

const resumeBtn = document.getElementById('resumeBtn');
const musicToggleBtn = document.getElementById('musicToggleBtn');
const standingDummyBtn = document.getElementById('standingDummyBtn');
const activeDummyBtn = document.getElementById('activeDummyBtn');
const removeDummyBtn = document.getElementById('removeDummyBtn');
const toLobbyBtn = document.getElementById('toLobbyBtn');
const resetBtn = document.getElementById('resetBtn');
const menuResetBindsBtn = document.getElementById('menuResetBindsBtn');

const bindList = document.getElementById('menuBindList');

const aimSensitivitySlider = document.getElementById('aimSensitivitySlider');
const aimSensitivityValue = document.getElementById('aimSensitivityValue');
const musicVolumeSlider = document.getElementById('musicVolumeSlider');
const musicVolumeValue = document.getElementById('musicVolumeValue');

const nameInput = document.getElementById('nameInput');
const colorRow = document.getElementById('colorRow');
const inventoryList = document.getElementById('inventoryList');
const leaderboardList = document.getElementById('leaderboardList');
const storeList = document.getElementById('storeList');
const startBtn = document.getElementById('startBtn');

const wlkLobbyEl = document.getElementById('wlkLobby');
const wlkLobbyTopEl = document.getElementById('wlkLobbyTop');

const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas ? previewCanvas.getContext('2d') : null;

// ── Mobile Controls ───────────────────────────────────────────
const mobileControls = document.getElementById('mobileControls');
const moveJoystick = document.getElementById('moveJoystick');
const moveJoystickThumb = document.getElementById('moveJoystickThumb');

const mobileFireBtn = document.getElementById('mobileFireBtn');
const mobileHookBtn = document.getElementById('mobileHookBtn');
const mobileTeleportBtn = document.getElementById('mobileTeleportBtn');
const mobileShieldBtn = document.getElementById('mobileShieldBtn');
const mobileChargeBtn = document.getElementById('mobileChargeBtn');
const mobileShockBtn = document.getElementById('mobileShockBtn');
const mobileGustBtn = document.getElementById('mobileGustBtn');
const mobileWallBtn = document.getElementById('mobileWallBtn');
const mobileRewindBtn = document.getElementById('mobileRewindBtn');

const skillButtons = {
  fire: mobileFireBtn,
  hook: mobileHookBtn,
  blink: mobileTeleportBtn,
  shield: mobileShieldBtn,
  charge: mobileChargeBtn,
  shock: mobileShockBtn,
  gust: mobileGustBtn,
  wall: mobileWallBtn,
  rewind: mobileRewindBtn,
};
