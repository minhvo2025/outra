// ── Game Loop ─────────────────────────────────────────────────
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;

  update(dt);

  if (window.outraThree && window.outraThree.update) {
    window.outraThree.update(dt);
  }

  render();
  requestAnimationFrame(loop);
}

// ── Init ──────────────────────────────────────────────────────
const resetMoveStick = makeStickController(moveJoystick, moveJoystickThumb, moveStick);

if (window.outraThree && window.outraThree.init) {
  window.outraThree.init();
}

loadProfile();
applyPlayerColors();
resizeCanvas();
buildRankedPanel();
buildKeybindsUI();
renderStore();
renderInventory();

nameInput.value = player.name;
player.score = getPlayerPoints(player.name);

renderLeaderboard();
updateAimSensitivityUI();
updateMusicVolumeUI();
setMusicMuted(musicMuted);
drawLobbyPreview();
updateHud();
resetMoveStick();
enterLobby();
refreshMobileControls();

requestAnimationFrame(loop);
