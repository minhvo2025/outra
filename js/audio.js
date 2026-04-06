// ── Audio Context ─────────────────────────────────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let musicGain       = null;
let musicMasterGain = null;
let musicStarted    = false;
let musicTimer      = 0;
let musicStep       = 0;
const musicNotes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 349.23];

// ── Core Audio Helpers ────────────────────────────────────────
function ensureAudioReady() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!musicMasterGain) {
    musicMasterGain = audioCtx.createGain();
    musicMasterGain.gain.value = musicMuted ? 0 : 0.035;
    musicMasterGain.connect(audioCtx.destination);
  }
  if (!musicGain) {
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 1;
    musicGain.connect(musicMasterGain);
  }
}

function playTone(type, frequency, duration, volume, frequencyEnd = null, outputGain = null) {
  ensureAudioReady();
  const now = audioCtx.currentTime;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  if (frequencyEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequencyEnd), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(outputGain || audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.03);
}

// ── Music ─────────────────────────────────────────────────────
function playMusicStep() {
  if (musicMuted) return;
  ensureAudioReady();
  const note = musicNotes[musicStep % musicNotes.length];
  playTone('triangle', note,     0.28, 0.5,  null, musicGain);
  playTone('sine',     note / 2, 0.38, 0.18, null, musicGain);
  musicStep++;
}

function updateMusic(dt) {
  if (!musicStarted) return;
  musicTimer -= dt;
  if (musicTimer <= 0) {
    playMusicStep();
    musicTimer = 0.42;
  }
}

function setMusicMuted(value) {
  musicMuted = value;
  profile.musicMuted = value;
  ensureAudioReady();
  if (musicMasterGain) musicMasterGain.gain.value = musicMuted ? 0 : 0.035;
  musicToggleBtn.textContent = `Music: ${musicMuted ? 'Off' : 'On'}`;
  musicToggleBtn.className   = musicMuted ? 'musicToggleOff' : 'musicToggleOn';
  saveProfile();
}

function startMusicIfNeeded() {
  if (!musicStarted) {
    ensureAudioReady();
    musicStarted = true;
    musicTimer   = 0.1;
  }
}

// ── Sound Effects ─────────────────────────────────────────────
const soundFire     = () => playTone('sawtooth',  320, 0.12, 0.050, 120);
const soundHook     = () => playTone('square',    180, 0.12, 0.035, 320);
const soundTeleport = () => playTone('triangle',  220, 0.18, 0.060, 660);
const soundHit      = () => playTone('square',    260, 0.08, 0.045, 140);
const soundLava     = () => playTone('sine',       90, 0.08, 0.012,  60);
const soundWin      = () => playTone('triangle',  420, 0.22, 0.060, 860);
const soundLose     = () => playTone('sawtooth',  180, 0.20, 0.050,  70);
const soundHeal     = () => playTone('triangle',  520, 0.16, 0.040, 760);
const soundShock    = () => playTone('square', 240, 0.12, 0.05, 80);
const soundGust     = () => playTone('triangle', 540, 0.11, 0.032, 180);
const soundCharge   = () => playTone('sawtooth',  180, 0.16, 0.050, 540);
const soundChargeHit = () => {
  playTone('square', 210, 0.09, 0.050, 120);
  playTone('triangle', 320, 0.12, 0.032, 720);
};
