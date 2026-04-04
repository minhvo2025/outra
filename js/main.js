// ── Game Loop ─────────────────────────────────────────────────
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  update(dt);
  if (window.warlockThree && window.warlockThree.update) window.warlockThree.update(dt);
  render();
  requestAnimationFrame(loop);
}

// ── Init ──────────────────────────────────────────────────────
const resetMoveStick = makeStickController(moveJoystick, moveJoystickThumb, moveStick);

if (window.warlockThree && window.warlockThree.init) window.warlockThree.init();

loadProfile();
applyPlayerColors();
resizeCanvas();
buildColorChoices();
buildKeybindsUI();
renderStore();
renderInventory();
nameInput.value  = player.name;
player.score     = getPlayerPoints(player.name);
renderLeaderboard();
updateAimSensitivityUI();
setMusicMuted(musicMuted);
drawLobbyPreview();
updateHud();
resetMoveStick();
enterLobby();
refreshMobileControls();
requestAnimationFrame(loop);
