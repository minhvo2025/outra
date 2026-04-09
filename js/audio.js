// ── Audio Context / Music ─────────────────────────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

let musicMasterGain = null;
let musicStarted = false;
let musicUnlocked = false;
let lobbyMusicAudio = null;
let lobbyMusicSource = null;

const LOBBY_MUSIC_SRC = '/docs/Music/Lobby_music.mp3';
const DEFAULT_LOBBY_MUSIC_VOLUME = 0.38;

function getMusicVolume() {
  const raw = Number(profile?.musicVolume);
  return Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : DEFAULT_LOBBY_MUSIC_VOLUME));
}

function applyMusicGain() {
  if (!musicMasterGain) return;
  musicMasterGain.gain.value = musicMuted ? 0 : getMusicVolume();
}

function setMusicVolume(value) {
  const next = Math.min(1, Math.max(0, Number(value) || 0));
  profile.musicVolume = next;

  ensureAudioReady();
  applyMusicGain();

  if (!musicMuted && musicUnlocked) {
    startLobbyMusicPlayback();
  }

  saveProfile();

  if (typeof updateMusicVolumeUI === 'function') {
    updateMusicVolumeUI();
  }
}

// ── Core Audio Helpers ────────────────────────────────────────
function ensureAudioReady() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

if (!musicMasterGain) {
  musicMasterGain = audioCtx.createGain();
  musicMasterGain.gain.value = musicMuted ? 0 : getMusicVolume();
  musicMasterGain.connect(audioCtx.destination);
}
}

function ensureLobbyMusicElement() {
  if (lobbyMusicAudio) return lobbyMusicAudio;

  lobbyMusicAudio = new Audio(LOBBY_MUSIC_SRC);
  lobbyMusicAudio.loop = true;
  lobbyMusicAudio.preload = 'auto';
  lobbyMusicAudio.crossOrigin = 'anonymous';
  lobbyMusicAudio.playsInline = true;

  return lobbyMusicAudio;
}

function connectLobbyMusicToAudioGraph() {
  ensureAudioReady();
  const audioEl = ensureLobbyMusicElement();

  if (!lobbyMusicSource) {
    lobbyMusicSource = audioCtx.createMediaElementSource(audioEl);
    lobbyMusicSource.connect(musicMasterGain);
  }
}

function startLobbyMusicPlayback() {
  if (musicMuted) return;

  ensureAudioReady();
  connectLobbyMusicToAudioGraph();

  const playPromise = lobbyMusicAudio.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      // Ignore blocked autoplay attempts; first user interaction will retry.
    });
  }

  musicStarted = true;
}

function pauseLobbyMusicPlayback() {
  if (lobbyMusicAudio) {
    lobbyMusicAudio.pause();
  }
}

// ── Music State ───────────────────────────────────────────────
function updateMusic(_dt) {
  // Kept because game.js already calls updateMusic(dt) every frame.
  // Real music is now handled by the HTMLAudio element instead of tone steps.
}

function setMusicMuted(value) {
  musicMuted = !!value;
  profile.musicMuted = musicMuted;

  ensureAudioReady();

applyMusicGain();

  if (musicMuted) {
    pauseLobbyMusicPlayback();
  } else if (musicUnlocked) {
    startLobbyMusicPlayback();
  }

  musicToggleBtn.textContent = `Music: ${musicMuted ? 'Off' : 'On'}`;
  musicToggleBtn.className = musicMuted ? 'musicToggleOff' : 'musicToggleOn';
  saveProfile();
}

function startMusicIfNeeded() {
  musicUnlocked = true;

  ensureAudioReady();
  connectLobbyMusicToAudioGraph();

  if (!musicMuted) {
    startLobbyMusicPlayback();
  }
}

// ── Unlock music on first user interaction in lobby ───────────
function unlockMusicFromGesture() {
  startMusicIfNeeded();

  window.removeEventListener('pointerdown', unlockMusicFromGesture);
  window.removeEventListener('keydown', unlockMusicFromGesture);
  window.removeEventListener('touchstart', unlockMusicFromGesture);
}

window.addEventListener('pointerdown', unlockMusicFromGesture, { passive: true });
window.addEventListener('keydown', unlockMusicFromGesture);
window.addEventListener('touchstart', unlockMusicFromGesture, { passive: true });

// ── Tone Helper for Sound Effects ─────────────────────────────
function playTone(type, frequency, duration, volume, frequencyEnd = null, outputGain = null) {
  ensureAudioReady();

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);

  if (frequencyEnd !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequencyEnd), now + duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(outputGain || audioCtx.destination);

  osc.start(now);
  osc.stop(now + duration + 0.03);
}

// ── Sound Effects ─────────────────────────────────────────────
const soundFire      = () => playTone('sawtooth', 320, 0.12, 0.050, 120);
const soundHook      = () => playTone('square',   180, 0.12, 0.035, 320);
const soundTeleport  = () => playTone('triangle', 220, 0.18, 0.060, 660);
const soundHit       = () => playTone('square',   260, 0.08, 0.045, 140);
const soundLava      = () => playTone('sine',      90, 0.08, 0.012,  60);
const soundWin       = () => playTone('triangle', 420, 0.22, 0.060, 860);
const soundLose      = () => playTone('sawtooth', 180, 0.20, 0.050,  70);
const soundHeal      = () => playTone('triangle', 520, 0.16, 0.040, 760);
const soundShock     = () => playTone('square',   240, 0.12, 0.050,  80);
const soundGust      = () => playTone('triangle', 540, 0.11, 0.032, 180);

const soundWall = () => {
  playTone('sawtooth', 150, 0.16, 0.032, 110);
  playTone('triangle', 220, 0.22, 0.024, 320);
};

const soundCharge = () => playTone('sawtooth', 180, 0.16, 0.050, 540);

const soundChargeHit = () => {
  playTone('square',   210, 0.09, 0.050, 120);
  playTone('triangle', 320, 0.12, 0.032, 720);
};

const soundRewind = () => playTone('triangle', 220, 0.16, 0.045, 120);
