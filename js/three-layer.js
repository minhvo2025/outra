// ── Three.js Character Layer ─────────────────────────────────
(function () {
  const cfg = window.OUTRA_3D_CONFIG || {};

  const state = {
    container: null,
    renderer: null,
    scene: null,
    camera: null,
    loader: null,
    ready: false,
    failed: false,
    lastTintKey: '',
    arenaFloorReady: false,
    activeCharacterSet: null,
    characterLoadToken: 0,
    debugAnim: {
      text: '',
      timer: 0,
    },
    hitFlash: {
      texture: null,
      textureRequested: false,
      active: [],
      pool: [],
      maxActive: 18,
    },
    chargeAfterimage: {
      group: null,
      slots: [],
      sourceVisual: null,
      sourceBones: [],
      sourceMeshes: [],
      active: false,
      refreshTime: 0,
      releaseTimeLeft: 0,
    },
    preview: {
      host: null,
      canvas2d: null,
      canvas3d: null,
      scene: null,
      camera: null,
      renderer: null,
      ambientLight: null,
      keyLight: null,
      fillLight: null,
      rimLight: null,
      baseAmbientIntensity: 1,
      baseKeyIntensity: 1,
      baseFillIntensity: 1,
      baseRimIntensity: 1,
      rootGroup: null,
      shadow: null,
      groundLight: null,
      aura: null,
      auraGlow: null,
      auraHaze: null,
      auraActive: false,
      hoverActive: false,
      auraPulse: 0,
      ambientPulse: 0,
      groundLightPulse: 0,
      ready: false,
      currentRotationY: 0,
      targetRotationY: 0,
      dragging: false,
      activePointerId: null,
      lastX: 0,
      root: null,
      mixer: null,
      states: new Map(),
      currentState: 'idle',
      rigFixNode: null,
      rootBasePosition: null,
      rigFixBasePosition: null,
      positionTrackLocks: [],
    },
    floor: {
      root: null,
      rootGroup: null,
      baseScale: 1,
      sourceDiameter: 1,
    },
    draft: {
      platformRoot: null,
      platformGroup: null,
      platformReady: false,
      platformSourceDiameter: 1,
      platformSourceHeight: 1,
      platformTopY: null,
      platformBaseRotation: { x: 0, y: 0, z: 0 },
    },
    player: {
      root: null,
      mixer: null,
      states: new Map(),
      currentState: 'idle',
      castTimer: 0,
      hitTimer: 0,
      dashTimer: 0,
      lastHp: null,
      shadow: null,
      rootGroup: null,
      yawGroup: null,
      modelMount: null,
      rigFixNode: null,
      rootBasePosition: null,
      rigFixBasePosition: null,
      positionTrackLocks: [],
      lastWorldX: null,
lastWorldZ: null,
      lastDraftWorldX: null,
      lastDraftWorldZ: null,
      draftTurnRing: null,
      draftPlatform: null,
    },
    dummy: {
      root: null,
      mixer: null,
      states: new Map(),
      currentState: 'idle',
      castTimer: 0,
      hitTimer: 0,
      dashTimer: 0,
      lastHp: null,
      shadow: null,
      rootGroup: null,
      yawGroup: null,
      modelMount: null,
      rigFixNode: null,
      rootBasePosition: null,
      rigFixBasePosition: null,
      positionTrackLocks: [],
        lastWorldX: null,
  lastWorldZ: null,
      lastDraftWorldX: null,
      lastDraftWorldZ: null,
      draftTurnRing: null,
      draftPlatform: null,
    },
  };

  const HIT_FLASH_TEXTURE_CANDIDATES = [
    'docs/art/spells/FX/flash.png',
    'docs/art/spells/FX/hit_flash.png',
  ];
  const HIT_FLASH_DURATION_SEC = 0.11;
  const HIT_FLASH_BASE_SCALE = 34;
  const HIT_FLASH_HEIGHT_OFFSET = 46;
  const CHARGE_AFTERIMAGE_CONFIG = {
    ghostCount: 3,
    spacingPlayerLengths: [0.10, 0.22, 0.34],
    opacity: [0.35, 0.20, 0.10],
    scale: [0.98, 0.96, 0.94],
    tintHex: '#a98eff',
    tintStrength: 0.14,
    emissiveStrength: 0.07,
    refreshIntervalSec: 0.09,
    releaseFadeSec: 0.10,
  };
  const PREVIEW_Y_AXIS = new THREE.Vector3(0, 1, 0);
  const DRAFT_PLATFORM_RAY_DIR = new THREE.Vector3(0, -1, 0);
  const draftPlatformRaycaster = new THREE.Raycaster();
  const draftPlatformRayOrigin = new THREE.Vector3();
  const draftPlatformRayNormal = new THREE.Vector3();

function getArenaManualRotationEuler() {
  const charCfg = cfg.arenaCharacter || {};
  const importRotation = charCfg.importRotation || {};

  return new THREE.Euler(
    typeof importRotation.x === 'number' ? importRotation.x : 0,
    typeof importRotation.y === 'number' ? importRotation.y : 0,
    typeof importRotation.z === 'number' ? importRotation.z : 0,
    'XYZ'
  );
}

function getArenaFacingOffset() {
  const charCfg = cfg.arenaCharacter || {};
  const facingOffset = Number(charCfg.facingOffsetY);
  return Number.isFinite(facingOffset) ? facingOffset : 0;
}
function getArenaStateRotationOffset(stateName) {
  const charCfg = cfg.arenaCharacter || {};
  const offsets = charCfg.stateRotationOffsets || {};
  const stateOffset = offsets?.[stateName] || {};

  return {
    x: Number.isFinite(Number(stateOffset.x)) ? Number(stateOffset.x) : 0,
    y: Number.isFinite(Number(stateOffset.y)) ? Number(stateOffset.y) : 0,
    z: Number.isFinite(Number(stateOffset.z)) ? Number(stateOffset.z) : 0,
  };
}

function applyArenaRotationForState(mixerState) {
  if (!mixerState || !mixerState.modelMount) return;

  const baseY = getArenaFacingOffset();
  const stateOffset = getArenaStateRotationOffset(mixerState.currentState || 'idle');

  mixerState.modelMount.rotation.set(
    stateOffset.x,
    baseY + stateOffset.y,
    stateOffset.z
  );
  mixerState.modelMount.position.set(0, 0, 0);
  mixerState.modelMount.updateMatrixWorld(true);
}
  function log(...args) {
    console.log('[Outra3D]', ...args);
  }

  function showAnimationDebug(clipName) {
    if (!clipName) return;
    state.debugAnim.text = clipName;
    state.debugAnim.timer = 1.0;
  }

  function getGLTFLoaderClass() {
    if (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader !== 'undefined') return THREE.GLTFLoader;
    if (typeof GLTFLoader !== 'undefined') return GLTFLoader;
    return null;
  }

  function getArenaCharacterConfig() {
    const charCfg = cfg.arenaCharacter || {};
    return {
      glb: charCfg.glb || '',
      animations: {
        idle: charCfg.animations?.idle || 'idle',
        walk: charCfg.animations?.walk || 'run',
        run: charCfg.animations?.run || 'run',
        cast: charCfg.animations?.cast || 'cast',
        dash: charCfg.animations?.dash || 'dash',
        hit: charCfg.animations?.hit || 'hit',
      },
    };
  }
    function getArenaAnimationSpeed(stateName) {
    const charCfg = cfg.arenaCharacter || {};
    const speeds = charCfg.animationSpeeds || {};
    const speed = Number(speeds[stateName]);
    return Number.isFinite(speed) && speed > 0 ? speed : 1;
  }

  function applyActionTimeScale(action, stateName) {
    if (!action) return;
    action.setEffectiveTimeScale(getArenaAnimationSpeed(stateName));
  }

  function sanitizePreviewClip(clip) {
    if (!clip || !Array.isArray(clip.tracks) || !clip.tracks.length) return clip;

    const sanitized = clip.clone();
    const filtered = sanitized.tracks.filter((track) => {
      const name = String(track?.name || '').toLowerCase();
      if (!name) return true;

      const lastDot = name.lastIndexOf('.');
      const nodePart = lastDot > 0 ? name.slice(0, lastDot) : '';
      const propPart = lastDot > 0 ? name.slice(lastDot + 1) : '';
      const isTransformTrack =
        propPart === 'position' ||
        propPart === 'translation' ||
        propPart === 'quaternion' ||
        propPart === 'rotation';
      const isTranslationTrack =
        propPart === 'position' ||
        propPart === 'translation';
      const isRootMotionNode =
        nodePart.includes('hips') ||
        nodePart.includes('hip') ||
        nodePart.includes('pelvis') ||
        nodePart.includes('root') ||
        nodePart.includes('armature');

      // Remove all translation tracks in preview/draft to prevent locomotion drift/snaps.
      if (isTranslationTrack) {
        return false;
      }

      // Prevent lobby root-motion/orientation resets from hip/root tracks.
      if (isTransformTrack && isRootMotionNode) {
        return false;
      }

      return true;
    });

    if (!filtered.length) {
      return clip;
    }

    sanitized.tracks = filtered;
    sanitized.resetDuration();
    return sanitized;
  }

  function sanitizeArenaClip(clip) {
    if (!clip || !Array.isArray(clip.tracks) || !clip.tracks.length) return clip;

    const sanitized = clip.clone();
    const filtered = sanitized.tracks.filter((track) => {
      const name = String(track?.name || '').toLowerCase();
      if (!name) return true;

      const lastDot = name.lastIndexOf('.');
      const nodePart = lastDot > 0 ? name.slice(0, lastDot) : '';
      const propPart = lastDot > 0 ? name.slice(lastDot + 1) : '';
      const isTranslationTrack =
        propPart === 'position' ||
        propPart === 'translation';

      // Arena actor world position is gameplay-driven, so strip all translation tracks
      // to prevent animation root-motion drift/orbiting.
      if (isTranslationTrack) {
        return false;
      }

      return true;
    });

    if (!filtered.length) {
      return clip;
    }

    sanitized.tracks = filtered;
    sanitized.resetDuration();
    return sanitized;
  }

  function getLobbyCharacterConfig() {
    const charCfg = cfg.lobbyCharacter || {};
    return {
      glb: charCfg.glb || '',
      animations: {
        idle: charCfg.animations?.idle || 'idle',
        hover: charCfg.animations?.hover || null,
        walk: null,
        run: null,
        cast: null,
        dash: null,
        hit: null,
      },
    };
  }

  function getDraftCharacterConfig() {
    const draftCfg = cfg.draftRoom || {};
    const lobbyCfg = getLobbyCharacterConfig();
    const draftCharacterCfg = draftCfg.character || {};

    return {
      glb: draftCharacterCfg.glb || '',
      animations: {
        idle: lobbyCfg.animations?.idle || 'Running',
        hover: lobbyCfg.animations?.hover || 'Idle_11',
        walk: null,
        run: null,
        cast: null,
        dash: null,
        hit: null,
      },
    };
  }

  function getArenaFloorConfig() {
    const floorCfg = cfg.arenaFloor || {};
    return {
      enabled: floorCfg.enabled !== false,
      glb: floorCfg.glb || '',
      yOffset: typeof floorCfg.yOffset === 'number' ? floorCfg.yOffset : -6,
      opacity: typeof floorCfg.opacity === 'number' ? floorCfg.opacity : 1,
      brightness: typeof floorCfg.brightness === 'number' ? floorCfg.brightness : 0.2,
      lockRotationX: typeof floorCfg.lockRotationX === 'number' ? floorCfg.lockRotationX : 0,
      lockRotationY: typeof floorCfg.lockRotationY === 'number' ? floorCfg.lockRotationY : 0,
      lockRotationZ: typeof floorCfg.lockRotationZ === 'number' ? floorCfg.lockRotationZ : 0,
    };
  }

  function getDraftRoomConfig() {
    const draftCfg = cfg.draftRoom || {};
    const platformCfg = draftCfg.platform || {};
    const tiltCfg = draftCfg.playerTilt || {};
    const frontViewCfg = draftCfg.frontView || {};

    return {
      enabled: draftCfg.enabled !== false,
      platform: {
        enabled: platformCfg.enabled !== false,
        glb: platformCfg.glb || '',
        attachToPlayers: platformCfg.attachToPlayers !== false,
        playerDiameter: Number.isFinite(Number(platformCfg.playerDiameter)) ? Number(platformCfg.playerDiameter) : 84,
        playerScale: Number.isFinite(Number(platformCfg.playerScale)) ? Number(platformCfg.playerScale) : 1,
        playerFootClearance: Number.isFinite(Number(platformCfg.playerFootClearance))
          ? Number(platformCfg.playerFootClearance)
          : 0.65,
        playerLocalYOffset: Number.isFinite(Number(platformCfg.playerLocalYOffset))
          ? Number(platformCfg.playerLocalYOffset)
          : -0.2,
        playerFloatAmplitude: Number.isFinite(Number(platformCfg.playerFloatAmplitude))
          ? Number(platformCfg.playerFloatAmplitude)
          : 0.2,
        playerFloatSpeed: Number.isFinite(Number(platformCfg.playerFloatSpeed))
          ? Number(platformCfg.playerFloatSpeed)
          : 0.95,
        offsetX: Number.isFinite(Number(platformCfg.offsetX)) ? Number(platformCfg.offsetX) : 0,
        offsetY: Number.isFinite(Number(platformCfg.offsetY)) ? Number(platformCfg.offsetY) : -6,
        offsetZ: Number.isFinite(Number(platformCfg.offsetZ)) ? Number(platformCfg.offsetZ) : 0,
        rotationX: Number.isFinite(Number(platformCfg.rotationX)) ? Number(platformCfg.rotationX) : 0,
        rotationY: Number.isFinite(Number(platformCfg.rotationY)) ? Number(platformCfg.rotationY) : 0,
        rotationZ: Number.isFinite(Number(platformCfg.rotationZ)) ? Number(platformCfg.rotationZ) : 0,
        scale: Number.isFinite(Number(platformCfg.scale)) ? Number(platformCfg.scale) : 1,
        fitToLayoutRadius: Number.isFinite(Number(platformCfg.fitToLayoutRadius))
          ? Number(platformCfg.fitToLayoutRadius)
          : 1.95,
        brightness: Number.isFinite(Number(platformCfg.brightness)) ? Number(platformCfg.brightness) : 1,
        opacity: Number.isFinite(Number(platformCfg.opacity)) ? Number(platformCfg.opacity) : 1,
      },
      playerTiltX: Number.isFinite(Number(tiltCfg.x)) ? Number(tiltCfg.x) : -0.12,
      playerTiltZ: Number.isFinite(Number(tiltCfg.z)) ? Number(tiltCfg.z) : 0.04,
      frontView: {
        enabled: frontViewCfg.enabled !== false,
        rotationX: Number.isFinite(Number(frontViewCfg.rotationX)) ? Number(frontViewCfg.rotationX) : (Math.PI * 0.5),
        rotationY: Number.isFinite(Number(frontViewCfg.rotationY)) ? Number(frontViewCfg.rotationY) : Math.PI,
        rotationZ: Number.isFinite(Number(frontViewCfg.rotationZ)) ? Number(frontViewCfg.rotationZ) : 0,
        scale: Number.isFinite(Number(frontViewCfg.scale)) ? Number(frontViewCfg.scale) : 1.75,
      },
      playerYawOffset: Number.isFinite(Number(draftCfg.playerYawOffset)) ? Number(draftCfg.playerYawOffset) : 0,
      playerYOffset: Number.isFinite(Number(draftCfg.playerYOffset))
        ? Number(draftCfg.playerYOffset)
        : (Number.isFinite(Number(cfg.modelYOffset)) ? Number(cfg.modelYOffset) : 0),
      playerIdleYOffset: Number.isFinite(Number(draftCfg.playerIdleYOffset))
        ? Number(draftCfg.playerIdleYOffset)
        : 8,
      playerFloatAmplitude: Number.isFinite(Number(draftCfg.playerFloatAmplitude))
        ? Number(draftCfg.playerFloatAmplitude)
        : 1.1,
      playerFloatSpeed: Number.isFinite(Number(draftCfg.playerFloatSpeed))
        ? Number(draftCfg.playerFloatSpeed)
        : 0.9,
    };
  }

  function getPreviewSettings() {
    const previewCfg = cfg.previewCharacter || {};
    const mobile = isTouchDevice;

    return {
      targetHeight: mobile
        ? (previewCfg.targetHeightMobile || 70)
        : (previewCfg.targetHeightDesktop || 98),

      cameraFov: mobile
        ? (previewCfg.cameraFovMobile || 40)
        : (previewCfg.cameraFovDesktop || 36),

      cameraY: mobile
        ? (previewCfg.cameraYMobile || 52)
        : (previewCfg.cameraYDesktop || 80),

      cameraZ: mobile
        ? (previewCfg.cameraZMobile || 420)
        : (previewCfg.cameraZDesktop || 380),

      lookAtY: mobile
        ? (previewCfg.lookAtYMobile || 42)
        : (previewCfg.lookAtYDesktop || 64),

      modelYOffset: mobile
        ? (previewCfg.modelYOffsetMobile || -8)
        : (previewCfg.modelYOffsetDesktop || -14),

      shadowScaleX: mobile
        ? (previewCfg.shadowScaleXMobile || 1.45)
        : (previewCfg.shadowScaleXDesktop || 1.7),

      shadowScaleY: mobile
        ? (previewCfg.shadowScaleYMobile || 0.72)
        : (previewCfg.shadowScaleYDesktop || 0.8),
    };
  }

  function isArenaPhase() {
    return gameState === 'playing' || gameState === 'result';
  }

  function isDraftPhase() {
    return gameState === 'draft';
  }

  function isDraft3DEnabled() {
    return !!getDraftRoomConfig().enabled;
  }

  function createAuraTexture(kind) {
    if (typeof THREE === 'undefined') return null;

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const center = size * 0.5;
    const radius = size * 0.5;

    ctx.clearRect(0, 0, size, size);
    let gradient = null;

    if (kind === 'ring') {
      gradient = ctx.createRadialGradient(
        center,
        center,
        radius * 0.18,
        center,
        center,
        radius * 0.98
      );
      gradient.addColorStop(0.00, 'rgba(255,255,255,0.00)');
      gradient.addColorStop(0.38, 'rgba(255,255,255,0.00)');
      gradient.addColorStop(0.54, 'rgba(255,255,255,0.34)');
      gradient.addColorStop(0.70, 'rgba(255,255,255,0.56)');
      gradient.addColorStop(0.88, 'rgba(255,255,255,0.18)');
      gradient.addColorStop(1.00, 'rgba(255,255,255,0.00)');
    } else if (kind === 'haze') {
      gradient = ctx.createRadialGradient(
        center,
        center,
        radius * 0.06,
        center,
        center,
        radius
      );
      gradient.addColorStop(0.00, 'rgba(255,255,255,0.36)');
      gradient.addColorStop(0.32, 'rgba(255,255,255,0.22)');
      gradient.addColorStop(0.72, 'rgba(255,255,255,0.10)');
      gradient.addColorStop(1.00, 'rgba(255,255,255,0.00)');
    } else {
      gradient = ctx.createRadialGradient(
        center,
        center,
        radius * 0.08,
        center,
        center,
        radius * 0.96
      );
      gradient.addColorStop(0.00, 'rgba(255,255,255,0.34)');
      gradient.addColorStop(0.24, 'rgba(255,255,255,0.25)');
      gradient.addColorStop(0.62, 'rgba(255,255,255,0.13)');
      gradient.addColorStop(1.00, 'rgba(255,255,255,0.00)');
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  function createGroundLightTexture() {
    if (typeof THREE === 'undefined') return null;

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const center = size * 0.5;
    const radius = size * 0.5;
    const gradient = ctx.createRadialGradient(
      center,
      center,
      radius * 0.06,
      center,
      center,
      radius * 0.98
    );

    gradient.addColorStop(0.00, 'rgba(255,245,210,0.42)');
    gradient.addColorStop(0.18, 'rgba(255,208,130,0.30)');
    gradient.addColorStop(0.44, 'rgba(255,146,64,0.20)');
    gradient.addColorStop(0.70, 'rgba(255,108,32,0.11)');
    gradient.addColorStop(1.00, 'rgba(255,84,18,0.00)');

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  function createDraftTurnRingMesh(colorHex = 0x8dd3ff) {
    const baseRadius = Math.max(12, Number(cfg.shadowSize) || 18);
    const ringTexture = createAuraTexture('ring');
    const glowTexture = createAuraTexture('glow');
    const hazeTexture = createAuraTexture('haze');

    const aura = new THREE.Group();
    aura.position.y = -1.02;
    aura.visible = false;

    const ringGeo = new THREE.CircleGeometry(baseRadius * 1.12, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      map: ringTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = -2;

    const glowGeo = new THREE.CircleGeometry(baseRadius * 1.32, 64);
    const glowMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      map: glowTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.01;
    glow.renderOrder = -3;

    const hazeGeo = new THREE.CircleGeometry(baseRadius * 1.48, 64);
    const hazeMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      map: hazeTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const haze = new THREE.Mesh(hazeGeo, hazeMat);
    haze.rotation.x = -Math.PI / 2;
    haze.position.y = -0.02;
    haze.renderOrder = -4;

    aura.add(haze);
    aura.add(glow);
    aura.add(ring);
    aura.userData = { ring, glow, haze };
    return aura;
  }

  function setShadowScaleMultiplier(shadow, multiplier = 1) {
    if (!shadow) return;
    const mult = Number.isFinite(Number(multiplier)) ? Number(multiplier) : 1;
    const baseScale = shadow.userData?.baseScale;
    if (baseScale && Number.isFinite(baseScale.x) && Number.isFinite(baseScale.y)) {
      shadow.scale.set(baseScale.x * mult, baseScale.y * mult, baseScale.z || 1);
      return;
    }
    shadow.scale.setScalar(mult);
  }

  function cloneMaterial(mat) {
    if (!mat) return mat;
    const cloned = mat.clone();
    if ('skinning' in mat) cloned.skinning = mat.skinning;
    return cloned;
  }

  function traverseMeshes(root, fn) {
    root.traverse((obj) => {
      if (obj.isMesh || obj.isSkinnedMesh) fn(obj);
    });
  }

  function computeBox(root) {
    return new THREE.Box3().setFromObject(root);
  }

  function applyStylizedMaterial(mat) {
    if (!mat) return;

    if ('metalness' in mat) mat.metalness = 0.0;
    if ('roughness' in mat) mat.roughness = Math.max(mat.roughness ?? 0, 0.86);
    if ('envMapIntensity' in mat) mat.envMapIntensity = 0.0;

    if ('clearcoat' in mat) mat.clearcoat = 0.0;
    if ('clearcoatRoughness' in mat) mat.clearcoatRoughness = 1.0;
    if ('sheen' in mat) mat.sheen = 0.0;
    if ('sheenRoughness' in mat) mat.sheenRoughness = 1.0;
    if ('transmission' in mat) mat.transmission = 0.0;
    if ('thickness' in mat) mat.thickness = 0.0;
    if ('ior' in mat) mat.ior = 1.0;
    if ('specularIntensity' in mat) mat.specularIntensity = 0.18;
    if ('specularColor' in mat && mat.specularColor) {
      mat.specularColor.setRGB(0.25, 0.25, 0.25);
    }

    if ('transparent' in mat && mat.opacity >= 0.999) {
      mat.transparent = false;
    }

    if ('emissiveIntensity' in mat) {
      mat.emissiveIntensity = Math.min(mat.emissiveIntensity ?? 1, 0.75);
    }

    if ('flatShading' in mat) {
      mat.flatShading = false;
    }

    if (mat.map) {
      mat.map.anisotropy = 4;
    }

    mat.needsUpdate = true;
  }

  function stylizeModel(root) {
    traverseMeshes(root, (obj) => {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(applyStylizedMaterial);
    });
  }

  function tintModel(root, bodyColorHex, wandColorHex) {
    if (!root || typeof THREE === 'undefined') return;

    const bodyTarget = new THREE.Color(bodyColorHex || '#d9d9ff');
    const wandTarget = new THREE.Color(wandColorHex || '#7c4dff');

    function shouldPreserveMaterial(meshName, matName, mat) {
      const name = `${meshName || ''} ${matName || ''}`.toLowerCase();

      if (
        name.includes('skin') ||
        name.includes('face') ||
        name.includes('head') ||
        name.includes('hair') ||
        name.includes('eye') ||
        name.includes('brow') ||
        name.includes('lash') ||
        name.includes('mouth') ||
        name.includes('tooth') ||
        name.includes('teeth')
      ) {
        return true;
      }

      if (mat && mat.color) {
        const hsl = { h: 0, s: 0, l: 0 };
        mat.color.getHSL(hsl);

        const warmHue =
          (hsl.h >= 0.02 && hsl.h <= 0.12) ||
          (hsl.h >= 0.95 && hsl.h <= 1.0);

        const looksLikeSkin =
          warmHue &&
          hsl.s >= 0.18 &&
          hsl.s <= 0.75 &&
          hsl.l >= 0.35 &&
          hsl.l <= 0.88;

        if (looksLikeSkin) return true;
      }

      return false;
    }

    function isWandMaterial(meshName, matName) {
      const name = `${meshName || ''} ${matName || ''}`.toLowerCase();
      return (
        name.includes('wand') ||
        name.includes('staff') ||
        name.includes('weapon') ||
        name.includes('rod')
      );
    }

    function tintSingleMaterial(mat, meshName) {
      if (!mat || !mat.color) return;

      if (!mat.userData._outraBaseColor) {
        mat.userData._outraBaseColor = mat.color.clone();
      }
      if ('emissive' in mat && mat.emissive && !mat.userData._outraBaseEmissive) {
        mat.userData._outraBaseEmissive = mat.emissive.clone();
      }

      const preserve = shouldPreserveMaterial(meshName, mat.name, mat);
      const wand = isWandMaterial(meshName, mat.name);
      const target = wand ? wandTarget : bodyTarget;

      if (preserve) {
        mat.color.copy(mat.userData._outraBaseColor);
        if ('emissive' in mat && mat.emissive && mat.userData._outraBaseEmissive) {
          mat.emissive.copy(mat.userData._outraBaseEmissive);
        }
        mat.needsUpdate = true;
        return;
      }

      mat.color.copy(target);

      if (mat.map && THREE.SRGBColorSpace) {
        mat.map.colorSpace = THREE.SRGBColorSpace;
      }

      if ('metalness' in mat) mat.metalness = 0.0;
      if ('roughness' in mat) mat.roughness = Math.max(mat.roughness ?? 0, 0.82);
      if ('envMapIntensity' in mat) mat.envMapIntensity = 0.0;

      if ('emissive' in mat && mat.emissive) {
        mat.emissive.copy(target).multiplyScalar(wand ? 0.20 : 0.05);
        if ('emissiveIntensity' in mat) {
          mat.emissiveIntensity = wand ? 1.1 : 0.35;
        }
      }

      mat.needsUpdate = true;
    }

    traverseMeshes(root, (obj) => {
      if (!obj.material) return;

      if (Array.isArray(obj.material)) {
        obj.material.forEach((mat) => tintSingleMaterial(mat, obj.name || ''));
      } else {
        tintSingleMaterial(obj.material, obj.name || '');
      }
    });
  }

  function normalizeRootUpAxis(root, options = {}) {
    const allowAutoRotate = options.allowAutoRotate !== false;
    if (!allowAutoRotate) {
      return { rotated: false, sourceAxis: 'y' };
    }

    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);

    let box = computeBox(root);
    let size = new THREE.Vector3();
    box.getSize(size);

    const dims = {
      x: Math.abs(size.x || 0),
      y: Math.abs(size.y || 0),
      z: Math.abs(size.z || 0),
    };

    let rotated = false;
    let sourceAxis = 'y';

    if (dims.z > dims.y * 1.12 && dims.z >= dims.x) {
      root.rotation.x = Math.PI / 2;
      rotated = true;
      sourceAxis = 'z';
    } else if (dims.x > dims.y * 1.12 && dims.x >= dims.z) {
      root.rotation.z = -Math.PI / 2;
      rotated = true;
      sourceAxis = 'x';
    }

    if (rotated) {
      root.updateMatrixWorld(true);
      log(`Auto-rotated model from ${sourceAxis.toUpperCase()}-up to Y-up`);
    }

    return { rotated, sourceAxis };
  }

  
  function centerAndScaleModel(root, targetHeightOverride, options = {}) {
    const autoRotateToYUp = options.autoRotateZUpToYUp !== false;

    traverseMeshes(root, (obj) => {
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.frustumCulled = false;

      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(cloneMaterial);
      } else if (obj.material) {
        obj.material = cloneMaterial(obj.material);
      }
    });

    stylizeModel(root);

    root.position.set(0, 0, 0);
    root.scale.set(1, 1, 1);

    const normalizeInfo = normalizeRootUpAxis(root, {
      allowAutoRotate: autoRotateToYUp
    });

    let box = computeBox(root);
    let center = new THREE.Vector3();
    let size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    root.position.sub(center);

    box = computeBox(root);
    box.getCenter(center);
    box.getSize(size);

    const targetHeight = targetHeightOverride || cfg.actorHeight || 95;
    const sourceHeight = Math.max(size.y || 1, 1);
    const scale = targetHeight / sourceHeight;

    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);

    box = computeBox(root);
    box.getCenter(center);
    box.getSize(size);

    root.position.y += (size.y * 0.5) + (cfg.hoverHeight || 0);
    root.updateMatrixWorld(true);

    log('Prepared model size:', {
      x: size.x.toFixed(2),
      y: size.y.toFixed(2),
      z: size.z.toFixed(2),
      scale: scale.toFixed(2),
      autoRotateToYUp,
      rotatedFromAxis: normalizeInfo.sourceAxis
    });
  }

function prepareArenaModelTransform(root, mountGroup, targetHeightOverride) {
  traverseMeshes(root, (obj) => {
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.frustumCulled = false;

    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map(cloneMaterial);
    } else if (obj.material) {
      obj.material = cloneMaterial(obj.material);
    }
  });

  stylizeModel(root);

  // Leave the raw GLTF root clean.
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  // Wrapper hierarchy:
  // mountGroup (already controlled by yaw/facing)
  //   -> pivotGroup (stable local pivot at 0,0,0)
  //      -> orientGroup (manual import rotation + centered visual)
  //         -> root (raw animated GLTF)
  const pivotGroup = new THREE.Group();
  const orientGroup = new THREE.Group();

  pivotGroup.position.set(0, 0, 0);
  pivotGroup.rotation.set(0, 0, 0);
  pivotGroup.scale.set(1, 1, 1);

  orientGroup.position.set(0, 0, 0);
  orientGroup.scale.set(1, 1, 1);

  const importEuler = getArenaManualRotationEuler();
  orientGroup.rotation.set(importEuler.x, importEuler.y, importEuler.z);

  orientGroup.add(root);
  pivotGroup.add(orientGroup);
  mountGroup.add(pivotGroup);

  orientGroup.updateMatrixWorld(true);

  let box = computeBox(pivotGroup);
  let size = new THREE.Vector3();
  box.getSize(size);

  const sourceHeight = Math.max(size.y || 1, 1);
  const targetHeight = targetHeightOverride || cfg.actorHeight || 95;
  const scale = targetHeight / sourceHeight;

  orientGroup.scale.setScalar(scale);
  orientGroup.updateMatrixWorld(true);

  box = computeBox(pivotGroup);

  const center = new THREE.Vector3();
  const min = new THREE.Vector3();
  const sizeAfterScale = new THREE.Vector3();

  box.getCenter(center);
  box.getSize(sizeAfterScale);
  min.copy(box.min);

  // IMPORTANT:
  // Offset the visual wrapper, not the raw root.
  // This keeps the pivot stable when yawGroup rotates.
  orientGroup.position.x -= center.x;
  orientGroup.position.z -= center.z;
  orientGroup.position.y -= min.y;
  orientGroup.position.y += (cfg.hoverHeight || 0);

  orientGroup.updateMatrixWorld(true);

  log('Prepared arena model transform', {
    importRotation: {
      x: importEuler.x,
      y: importEuler.y,
      z: importEuler.z,
    },
    size: `${sizeAfterScale.x.toFixed(1)} x ${sizeAfterScale.y.toFixed(1)} x ${sizeAfterScale.z.toFixed(1)}`,
    scale: scale.toFixed(2),
  });
}
  
  function findRigFixNode(root) {
    if (!root) return null;

    let firstSkinnedMesh = null;
    root.traverse((obj) => {
      if (!firstSkinnedMesh && obj.isSkinnedMesh) {
        firstSkinnedMesh = obj;
      }
    });

    if (firstSkinnedMesh && firstSkinnedMesh.skeleton && firstSkinnedMesh.skeleton.bones.length) {
      let bone = firstSkinnedMesh.skeleton.bones[0];
      while (bone.parent && bone.parent.isBone) {
        bone = bone.parent;
      }
      return bone;
    }

    let namedRig = null;
    root.traverse((obj) => {
      if (namedRig) return;
      const n = String(obj.name || '').toLowerCase();
      if (
        n.includes('armature') ||
        n === 'root' ||
        n.includes('rig') ||
        n.includes('skeleton')
      ) {
        namedRig = obj;
      }
    });

    return namedRig || root;
  }

function applyArenaModelBaseRotation(mount) {
  if (!mount) return;

  mount.rotation.set(0, getArenaFacingOffset(), 0);
  mount.position.set(0, 0, 0);
  mount.scale.set(1, 1, 1);
  mount.updateMatrixWorld(true);
}

function prepareArenaModel(root, mountGroup) {
  prepareArenaModelTransform(root, mountGroup, cfg.actorHeight || 95);
  if (state.activeCharacterSet !== 'draft') {
    tintModel(root, player.bodyColor, player.wandColor);
  }
  root.visible = true;

  log('Prepared arena model');
}

function prepareDummyModel(root, mountGroup) {
  prepareArenaModelTransform(root, mountGroup, cfg.actorHeight || 95);
  if (state.activeCharacterSet !== 'draft') {
    tintModel(root, '#ffd8b8', '#ff7a1a');
  }
  root.visible = true;

  log('Prepared dummy model');
}

  function preparePreviewModel(root, parentGroup) {
    const previewSettings = getPreviewSettings();

    centerAndScaleModel(root, previewSettings.targetHeight, {
      autoRotateZUpToYUp: true
    });

    root.visible = true;
    parentGroup.add(root);

    state.preview.rigFixNode = findRigFixNode(root);
    log('Prepared preview model');
  }

  function prepareArenaFloorModel(root, parentGroup) {
    const floorCfg = getArenaFloorConfig();

    traverseMeshes(root, (obj) => {
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.frustumCulled = false;

      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(cloneMaterial);
      } else if (obj.material) {
        obj.material = cloneMaterial(obj.material);
      }

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyStylizedMaterial(mat);

        if (mat.color) {
          mat.color.multiplyScalar(floorCfg.brightness ?? 0.2);
        }

        mat.side = THREE.DoubleSide;
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        mat.needsUpdate = true;
      });
    });

    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, 1);

    const candidates = [
      { x: 0, y: 0, z: 0, name: 'none' },
      { x: Math.PI / 2, y: 0, z: 0, name: '+x90' },
      { x: -Math.PI / 2, y: 0, z: 0, name: '-x90' },
      { x: 0, y: 0, z: Math.PI / 2, name: '+z90' },
      { x: 0, y: 0, z: -Math.PI / 2, name: '-z90' },
      { x: Math.PI, y: 0, z: 0, name: 'x180' },
      { x: 0, y: 0, z: Math.PI, name: 'z180' },
      { x: Math.PI / 2, y: 0, z: Math.PI / 2, name: '+x90+z90' },
      { x: Math.PI / 2, y: 0, z: -Math.PI / 2, name: '+x90-z90' },
      { x: -Math.PI / 2, y: 0, z: Math.PI / 2, name: '-x90+z90' },
      { x: -Math.PI / 2, y: 0, z: -Math.PI / 2, name: '-x90-z90' },
    ];

    let best = null;

    for (const c of candidates) {
      root.rotation.set(c.x, c.y, c.z);

      const box = computeBox(root);
      const size = new THREE.Vector3();
      box.getSize(size);

      const thickness = Math.max(size.y, 0.0001);
      const footprint = Math.max(size.x * size.z, 0.0001);
      const score = footprint / thickness;

      if (!best || score > best.score) {
        best = { ...c, score, size: size.clone() };
      }
    }

    root.rotation.set(
      best.x + (floorCfg.lockRotationX || 0),
      best.y + (floorCfg.lockRotationY || 0),
      best.z + (floorCfg.lockRotationZ || 0)
    );

    let box = computeBox(root);
    let center = new THREE.Vector3();
    let size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    root.position.sub(center);

    box = computeBox(root);
    box.getCenter(center);
    box.getSize(size);

    const sourceDiameter = Math.max(size.x || 1, size.z || 1, 1);
    const targetDiameter = Math.max((arena.baseRadius || arena.radius || 200) * 2, 1);
    const scale = targetDiameter / sourceDiameter;

    root.scale.setScalar(scale);
    root.position.y += floorCfg.yOffset;

    state.floor.baseScale = scale;
    state.floor.sourceDiameter = sourceDiameter;
    parentGroup.add(root);

    log('Prepared arena floor', {
      chosenRotation: best.name,
      sourceSize: {
        x: size.x.toFixed(2),
        y: size.y.toFixed(2),
        z: size.z.toFixed(2),
      },
      targetDiameter: targetDiameter.toFixed(2),
      baseScale: scale.toFixed(3),
    });
  }

  function prepareDraftPlatformModel(root, parentGroup) {
    const draftCfg = getDraftRoomConfig();
    const platformCfg = draftCfg.platform;

    traverseMeshes(root, (obj) => {
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.frustumCulled = false;

      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(cloneMaterial);
      } else if (obj.material) {
        obj.material = cloneMaterial(obj.material);
      }

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        if (mat.color && platformCfg.brightness !== 1) {
          mat.color.multiplyScalar(platformCfg.brightness);
        }

        const opacity = Math.max(0.18, Math.min(1, platformCfg.opacity));
        mat.transparent = opacity < 0.995;
        mat.opacity = opacity;
        mat.depthWrite = opacity >= 0.995;
        mat.depthTest = true;
        mat.needsUpdate = true;
      });
    });

    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, 1);

    const candidates = [
      { x: 0, y: 0, z: 0, name: 'none' },
      { x: Math.PI / 2, y: 0, z: 0, name: '+x90' },
      { x: -Math.PI / 2, y: 0, z: 0, name: '-x90' },
      { x: 0, y: 0, z: Math.PI / 2, name: '+z90' },
      { x: 0, y: 0, z: -Math.PI / 2, name: '-z90' },
      { x: Math.PI, y: 0, z: 0, name: 'x180' },
      { x: 0, y: 0, z: Math.PI, name: 'z180' },
      { x: Math.PI / 2, y: 0, z: Math.PI / 2, name: '+x90+z90' },
      { x: Math.PI / 2, y: 0, z: -Math.PI / 2, name: '+x90-z90' },
      { x: -Math.PI / 2, y: 0, z: Math.PI / 2, name: '-x90+z90' },
      { x: -Math.PI / 2, y: 0, z: -Math.PI / 2, name: '-x90-z90' },
    ];

    let best = null;
    for (const c of candidates) {
      root.rotation.set(c.x, c.y, c.z);

      const box = computeBox(root);
      const size = new THREE.Vector3();
      box.getSize(size);

      const thickness = Math.max(size.y, 0.0001);
      const footprint = Math.max(size.x * size.z, 0.0001);
      const score = footprint / thickness;

      if (!best || score > best.score) {
        best = { ...c, score, size: size.clone() };
      }
    }

    const baseRotation = {
      x: best.x + platformCfg.rotationX,
      y: best.y + platformCfg.rotationY,
      z: best.z + platformCfg.rotationZ,
    };
    root.rotation.set(baseRotation.x, baseRotation.y, baseRotation.z);
    state.draft.platformBaseRotation = baseRotation;

    let box = computeBox(root);
    let center = new THREE.Vector3();
    let size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    root.position.sub(center);
    root.position.y -= box.min.y;

    box = computeBox(root);
    box.getSize(size);

    state.draft.platformSourceDiameter = Math.max(size.x || 1, size.z || 1, 1);
    state.draft.platformSourceHeight = Math.max(size.y || 1, 1);
    parentGroup.add(root);

    log('Prepared draft platform', {
      chosenRotation: best.name,
      sourceSize: {
        x: size.x.toFixed(2),
        y: size.y.toFixed(2),
        z: size.z.toFixed(2),
      },
      sourceDiameter: state.draft.platformSourceDiameter.toFixed(2),
      sourceHeight: state.draft.platformSourceHeight.toFixed(2),
    });
  }

  function initScene() {
    state.container = document.getElementById('threeLayer');

    if (!state.container) {
      state.failed = true;
      console.error('[Outra3D] Missing #threeLayer element.');
      return;
    }

    if (typeof THREE === 'undefined') {
      state.failed = true;
      console.error('[Outra3D] THREE is not loaded.');
      return;
    }

    const LoaderClass = getGLTFLoaderClass();
    if (!LoaderClass) {
      state.failed = true;
      console.error('[Outra3D] GLTFLoader is not loaded.');
      return;
    }

    state.scene = new THREE.Scene();

    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;
    const frustumSize = height;

    state.camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      5000
    );

    state.camera.position.set(0, 1200, 0);
    state.camera.up.set(0, 0, -1);
    state.camera.lookAt(0, 0, 0);

    state.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.renderer.setSize(width, height);
    state.renderer.setClearColor(0x000000, 0);

    if ('outputColorSpace' in state.renderer && THREE.SRGBColorSpace) {
      state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in state.renderer && THREE.sRGBEncoding) {
      state.renderer.outputEncoding = THREE.sRGBEncoding;
    }

    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = 1.0;

    state.container.innerHTML = '';
    state.container.appendChild(state.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x405060, 2.2);
    hemi.position.set(0, 500, 0);
    state.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.35);
    dir.position.set(180, 360, 120);
    state.scene.add(dir);

    const fill = new THREE.DirectionalLight(0x9ab7ff, 0.65);
    fill.position.set(-180, 220, -60);
    state.scene.add(fill);

    state.loader = new LoaderClass();
    ensureHitFlashTextureLoaded();

    state.floor.rootGroup = new THREE.Group();
    state.scene.add(state.floor.rootGroup);

    state.draft.platformGroup = new THREE.Group();
    state.scene.add(state.draft.platformGroup);

    state.chargeAfterimage.group = new THREE.Group();
    state.chargeAfterimage.group.visible = true;
    state.scene.add(state.chargeAfterimage.group);

    state.player.rootGroup = new THREE.Group();
    state.player.yawGroup = new THREE.Group();
    state.player.modelMount = new THREE.Group();
    state.player.rootGroup.add(state.player.yawGroup);
    state.player.yawGroup.add(state.player.modelMount);
    state.scene.add(state.player.rootGroup);

    applyArenaModelBaseRotation(state.player.modelMount);

    state.dummy.rootGroup = new THREE.Group();
    state.dummy.yawGroup = new THREE.Group();
    state.dummy.modelMount = new THREE.Group();
    state.dummy.rootGroup.add(state.dummy.yawGroup);
    state.dummy.yawGroup.add(state.dummy.modelMount);
    state.scene.add(state.dummy.rootGroup);

    applyArenaModelBaseRotation(state.dummy.modelMount);

    const shadowGeo = new THREE.CircleGeometry(cfg.shadowSize || 24, 32);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });

    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1;
    shadow.scale.set(1.6, 0.78, 1);
    shadow.userData.baseScale = shadow.scale.clone();
    state.player.shadow = shadow;
    state.player.rootGroup.add(shadow);

    const playerDraftRing = createDraftTurnRingMesh(0xa8dbff);
    state.player.draftTurnRing = playerDraftRing;
    state.player.rootGroup.add(playerDraftRing);

    const dummyShadow = new THREE.Mesh(
      shadowGeo.clone(),
      shadowMat.clone()
    );
    dummyShadow.rotation.x = -Math.PI / 2;
    dummyShadow.position.y = -1;
    dummyShadow.scale.copy(shadow.scale);
    dummyShadow.userData.baseScale = dummyShadow.scale.clone();
    state.dummy.shadow = dummyShadow;
    state.dummy.rootGroup.add(dummyShadow);

    const dummyDraftRing = createDraftTurnRingMesh(0xffc88a);
    state.dummy.draftTurnRing = dummyDraftRing;
    state.dummy.rootGroup.add(dummyDraftRing);

    window.addEventListener('resize', onResize);

    log('Three.js arena scene initialized');
  }

  function initPreviewScene() {
    const canvas2d = document.getElementById('previewCanvas');
    if (!canvas2d || typeof THREE === 'undefined') return;

    state.preview.canvas2d = canvas2d;
    state.preview.host = canvas2d.parentElement;
    if (!state.preview.host) return;

    const hostStyle = window.getComputedStyle(state.preview.host);
    if (hostStyle.position === 'static') {
      state.preview.host.style.position = 'relative';
    }

    const oldCanvas = document.getElementById('previewCanvas3d');
    if (oldCanvas) oldCanvas.remove();

    const canvas3d = document.createElement('canvas');
    canvas3d.id = 'previewCanvas3d';
    canvas3d.setAttribute('aria-hidden', 'true');
    canvas3d.style.position = 'absolute';
    canvas3d.style.left = `${canvas2d.offsetLeft}px`;
    canvas3d.style.top = `${canvas2d.offsetTop}px`;
    canvas3d.style.width = `${canvas2d.clientWidth}px`;
    canvas3d.style.height = `${canvas2d.clientHeight}px`;
    canvas3d.style.pointerEvents = 'auto';
    canvas3d.style.background = 'transparent';
    canvas3d.style.borderRadius = '0px';
    canvas3d.style.zIndex = '3';

    state.preview.host.appendChild(canvas3d);
    state.preview.canvas3d = canvas3d;

    state.preview.scene = new THREE.Scene();

    const previewSettings = getPreviewSettings();

    state.preview.camera = new THREE.PerspectiveCamera(
      previewSettings.cameraFov,
      Math.max(1, canvas2d.clientWidth) / Math.max(1, canvas2d.clientHeight),
      0.1,
      1000
    );
    state.preview.camera.position.set(0, previewSettings.cameraY, previewSettings.cameraZ);
    state.preview.camera.lookAt(0, previewSettings.lookAtY, 0);

    state.preview.renderer = new THREE.WebGLRenderer({
      canvas: canvas3d,
      antialias: true,
      alpha: true,
    });
    state.preview.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.preview.renderer.setSize(canvas2d.clientWidth || canvas2d.width, canvas2d.clientHeight || canvas2d.height, false);
    state.preview.renderer.setClearColor(0x000000, 0);

    if ('outputColorSpace' in state.preview.renderer && THREE.SRGBColorSpace) {
      state.preview.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in state.preview.renderer && THREE.sRGBEncoding) {
      state.preview.renderer.outputEncoding = THREE.sRGBEncoding;
    }

    state.preview.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.preview.renderer.toneMappingExposure = 1.0;

    const ambient = new THREE.AmbientLight(0xffffff, 1.35);
    state.preview.scene.add(ambient);
    state.preview.ambientLight = ambient;
    state.preview.baseAmbientIntensity = ambient.intensity;

    const key = new THREE.DirectionalLight(0xfff0dd, 1.25);
    key.position.set(120, 170, 150);
    state.preview.scene.add(key);
    state.preview.keyLight = key;
    state.preview.baseKeyIntensity = key.intensity;

    const fill = new THREE.DirectionalLight(0xa785ff, 0.42);
    fill.position.set(-120, 90, 130);
    state.preview.scene.add(fill);
    state.preview.fillLight = fill;
    state.preview.baseFillIntensity = fill.intensity;

    const rim = new THREE.DirectionalLight(0xffb15b, 0.38);
    rim.position.set(0, 110, -170);
    state.preview.scene.add(rim);
    state.preview.rimLight = rim;
    state.preview.baseRimIntensity = rim.intensity;

    state.preview.rootGroup = new THREE.Group();
    state.preview.scene.add(state.preview.rootGroup);

    const shadowGeo = new THREE.CircleGeometry(34, 40);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    state.preview.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    state.preview.shadow.rotation.x = -Math.PI / 2;
    state.preview.shadow.position.y = 0;

    state.preview.shadow.scale.set(
      previewSettings.shadowScaleX,
      previewSettings.shadowScaleY,
      1
    );

    state.preview.rootGroup.add(state.preview.shadow);

    const groundLightTexture = createGroundLightTexture();
    const groundLightGeo = new THREE.CircleGeometry(62, 72);
    const groundLightMat = new THREE.MeshBasicMaterial({
      color: 0xffb357,
      map: groundLightTexture,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    state.preview.groundLight = new THREE.Mesh(groundLightGeo, groundLightMat);
    state.preview.groundLight.rotation.x = -Math.PI / 2;
    state.preview.groundLight.position.set(0, -0.015, 0);
    state.preview.groundLight.visible = true;
    state.preview.groundLight.renderOrder = -4;
    state.preview.groundLight.scale.set(
      previewSettings.shadowScaleX * 1.56,
      previewSettings.shadowScaleY * 1.24,
      1
    );
    state.preview.rootGroup.add(state.preview.groundLight);

    const auraRingTexture = createAuraTexture('ring');
    const auraGlowTexture = createAuraTexture('glow');
    const auraHazeTexture = createAuraTexture('haze');

    const auraGeo = new THREE.CircleGeometry(36, 72);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xd9a7ff,
      map: auraRingTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    state.preview.aura = new THREE.Mesh(auraGeo, auraMat);
    state.preview.aura.rotation.x = -Math.PI / 2;
    state.preview.aura.position.y = -0.02;
    state.preview.aura.visible = false;
    state.preview.aura.renderOrder = -1;
    state.preview.aura.scale.set(
      previewSettings.shadowScaleX * 1.12,
      previewSettings.shadowScaleY * 1.02,
      1
    );
    state.preview.rootGroup.add(state.preview.aura);

    const auraGlowGeo = new THREE.CircleGeometry(44, 72);
    const auraGlowMat = new THREE.MeshBasicMaterial({
      color: 0xb48cff,
      map: auraGlowTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    state.preview.auraGlow = new THREE.Mesh(auraGlowGeo, auraGlowMat);
    state.preview.auraGlow.rotation.x = -Math.PI / 2;
    state.preview.auraGlow.position.y = -0.03;
    state.preview.auraGlow.visible = false;
    state.preview.auraGlow.renderOrder = -2;
    state.preview.auraGlow.scale.set(
      previewSettings.shadowScaleX * 1.26,
      previewSettings.shadowScaleY * 1.1,
      1
    );
    state.preview.rootGroup.add(state.preview.auraGlow);

    const auraHazeGeo = new THREE.CircleGeometry(56, 72);
    const auraHazeMat = new THREE.MeshBasicMaterial({
      color: 0xc1a0ff,
      map: auraHazeTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    state.preview.auraHaze = new THREE.Mesh(auraHazeGeo, auraHazeMat);
    state.preview.auraHaze.rotation.x = -Math.PI / 2;
    state.preview.auraHaze.position.y = -0.035;
    state.preview.auraHaze.visible = false;
    state.preview.auraHaze.renderOrder = -3;
    state.preview.auraHaze.scale.set(
      previewSettings.shadowScaleX * 1.34,
      previewSettings.shadowScaleY * 1.18,
      1
    );
    state.preview.rootGroup.add(state.preview.auraHaze);

    bindPreviewInput();
    log('Lobby preview scene initialized');
  }

  function bindPreviewInput() {
    const canvas = state.preview.canvas3d;
    if (!canvas) return;
    const dragRotateSensitivity = 0.018;

    function getClientX(e) {
      return typeof e.clientX === 'number' ? e.clientX : 0;
    }

    function down(e) {
      if (typeof e.button === 'number' && e.button !== 0) return;
      state.preview.dragging = true;
      state.preview.activePointerId =
        typeof e.pointerId === 'number' ? e.pointerId : null;
      state.preview.lastX = getClientX(e);

      if (state.preview.activePointerId != null && canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(state.preview.activePointerId);
        } catch {}
      }
    }

    function move(e) {
      if (!state.preview.dragging) return;
      if (
        state.preview.activePointerId != null &&
        typeof e.pointerId === 'number' &&
        e.pointerId !== state.preview.activePointerId
      ) {
        return;
      }

      const x = getClientX(e);
      const dx = x - state.preview.lastX;
      state.preview.lastX = x;

      if (!Number.isFinite(dx) || dx === 0) return;
      state.preview.targetRotationY += dx * dragRotateSensitivity;
      // Keep drag rotation 1:1 with pointer movement to avoid springy resets.
      state.preview.currentRotationY = state.preview.targetRotationY;
    }

    function up(e) {
      if (
        state.preview.activePointerId != null &&
        typeof e.pointerId === 'number' &&
        e.pointerId !== state.preview.activePointerId
      ) {
        return;
      }

      if (state.preview.activePointerId != null && canvas.releasePointerCapture) {
        try {
          canvas.releasePointerCapture(state.preview.activePointerId);
        } catch {}
      }
      state.preview.dragging = false;
      state.preview.activePointerId = null;
    }

    function onWindowBlur() {
      state.preview.dragging = false;
      state.preview.activePointerId = null;
    }

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('blur', onWindowBlur);
  }

  function onResize() {
    if (state.camera && state.renderer) {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const aspect = width / height;
      const frustumSize = height;

      state.camera.left = (-frustumSize * aspect) / 2;
      state.camera.right = (frustumSize * aspect) / 2;
      state.camera.top = frustumSize / 2;
      state.camera.bottom = -frustumSize / 2;
      state.camera.updateProjectionMatrix();

      state.renderer.setSize(width, height);
    }

    if (state.preview.camera && state.preview.renderer && state.preview.canvas2d && state.preview.canvas3d) {
      const width = state.preview.canvas2d.clientWidth || state.preview.canvas2d.width || 320;
      const height = state.preview.canvas2d.clientHeight || state.preview.canvas2d.height || 240;

      state.preview.canvas3d.style.left = `${state.preview.canvas2d.offsetLeft}px`;
      state.preview.canvas3d.style.top = `${state.preview.canvas2d.offsetTop}px`;
      state.preview.canvas3d.style.width = `${width}px`;
      state.preview.canvas3d.style.height = `${height}px`;

      const previewSettings = getPreviewSettings();

      state.preview.camera.fov = previewSettings.cameraFov;
      state.preview.camera.aspect = width / Math.max(1, height);
      state.preview.camera.position.set(0, previewSettings.cameraY, previewSettings.cameraZ);
      state.preview.camera.lookAt(0, previewSettings.lookAtY, 0);
      state.preview.camera.updateProjectionMatrix();

      if (state.preview.shadow) {
        state.preview.shadow.scale.set(
          previewSettings.shadowScaleX,
          previewSettings.shadowScaleY,
          1
        );
      }

      if (state.preview.groundLight) {
        state.preview.groundLight.scale.set(
          previewSettings.shadowScaleX * 1.56,
          previewSettings.shadowScaleY * 1.24,
          1
        );
      }

      if (state.preview.aura) {
        state.preview.aura.scale.set(
          previewSettings.shadowScaleX * 1.12,
          previewSettings.shadowScaleY * 1.02,
          1
        );
      }

      if (state.preview.auraGlow) {
        state.preview.auraGlow.scale.set(
          previewSettings.shadowScaleX * 1.26,
          previewSettings.shadowScaleY * 1.1,
          1
        );
      }

      if (state.preview.auraHaze) {
        state.preview.auraHaze.scale.set(
          previewSettings.shadowScaleX * 1.34,
          previewSettings.shadowScaleY * 1.18,
          1
        );
      }

      state.preview.renderer.setSize(width, height, false);
    }
  }

  function findClipByNames(animations, names) {
    for (const name of names) {
      if (!name) continue;
      const exact = THREE.AnimationClip.findByName(animations, name);
      if (exact) return exact;
    }

    const lowered = animations.map((clip) => ({ clip, name: String(clip.name || '').toLowerCase() }));

    for (const wanted of names) {
      const target = String(wanted || '').toLowerCase().trim();
      if (!target) continue;

      let found = lowered.find(({ name }) => name === target);
      if (found) return found.clip;

      found = lowered.find(({ name }) => name.includes(target));
      if (found) return found.clip;

      const tokens = target.split(/[_\-\s]+/).filter(Boolean);
      found = lowered.find(({ name }) => tokens.every((t) => name.includes(t)));
      if (found) return found.clip;
    }

    return null;
  }

  function buildAnimationStateMap(animations, mixer, mode = 'arena') {
    const charCfg = mode === 'preview'
      ? getLobbyCharacterConfig()
      : mode === 'draft'
      ? getDraftCharacterConfig()
      : getArenaCharacterConfig();

    const result = new Map();

    const wantedStates = {
      idle: charCfg.animations.idle,
      hover: charCfg.animations.hover,
      walk: charCfg.animations.walk,
      run: charCfg.animations.run,
      cast: charCfg.animations.cast,
      dash: charCfg.animations.dash,
      hit: charCfg.animations.hit,
    };

    const fallbackAliases = {
      idle: ['idle', 'Idle', 'idle_1'],
      hover: ['hover', 'Hover', 'idle_11', 'Idle_11', 'idle11', 'Idle11'],
      walk: ['walk', 'Walk', 'run'],
      run: ['run', 'Run', 'walk'],
      cast: ['cast', 'Cast', 'attack', 'spell', 'magic'],
      dash: ['dash', 'Dash', 'roll', 'charge'],
      hit: ['hit', 'Hit', 'damage', 'hurt', 'react'],
    };

    Object.entries(wantedStates).forEach(([stateName, clipName]) => {
      if (!mixer) return;

      // Preview model is allowed to not have these states.
      if (clipName == null || clipName === '') {
        return;
      }

      const searchNames = [clipName, ...(fallbackAliases[stateName] || [])];
      const clip = findClipByNames(animations, searchNames);

      if (!clip) {
        console.warn(
          `[Outra3D] Missing animation clip "${clipName}" for state "${stateName}" (${mode})`
        );
        return;
      }

      let resolvedClip = clip;
      if (mode === 'preview' || mode === 'draft') {
        resolvedClip = sanitizePreviewClip(clip);
      } else if (mode === 'arena') {
        resolvedClip = sanitizeArenaClip(clip);
      }
      const action = mixer.clipAction(resolvedClip);
      action.enabled = true;
      action.clampWhenFinished = false;
      action.setLoop(THREE.LoopRepeat, Infinity);

      result.set(stateName, {
        clipName: resolvedClip.name || clip.name,
        clip: resolvedClip,
        action,
      });
    });

    if (!result.size && animations.length && mixer) {
      const fallback = animations[0];
      let resolvedFallback = fallback;
      if (mode === 'preview' || mode === 'draft') {
        resolvedFallback = sanitizePreviewClip(fallback);
      } else if (mode === 'arena') {
        resolvedFallback = sanitizeArenaClip(fallback);
      }

      const action = mixer.clipAction(resolvedFallback);
      action.enabled = true;
      action.clampWhenFinished = false;
      action.setLoop(THREE.LoopRepeat, Infinity);

      result.set('idle', {
        clipName: resolvedFallback.name || fallback.name,
        clip: resolvedFallback,
        action,
      });
    }

    return result;
  }

  function getWorldPosition(actor) {
    return getWorldPositionFromCoords(actor.x, actor.y);
  }

  function getWorldPositionFromCoords(x, y) {
    const wx = x - arena.cx;
    const wz = y - arena.cy;
    return { x: wx, z: wz };
  }

  function getDraftLayoutSnapshot() {
    const layout = draftState?.layout;
    if (
      layout &&
      Number.isFinite(Number(layout.cx)) &&
      Number.isFinite(Number(layout.cy)) &&
      Number.isFinite(Number(layout.platformRadius))
    ) {
      return {
        cx: Number(layout.cx),
        cy: Number(layout.cy),
        platformRadius: Number(layout.platformRadius),
      };
    }

    const fallbackWidth = window.innerWidth || 1280;
    const fallbackHeight = window.innerHeight || 720;
    const fallbackRadius = Math.max(170, Math.min(fallbackWidth, fallbackHeight) * 0.24);

    return {
      cx: fallbackWidth * 0.5,
      cy: fallbackHeight * 0.57,
      platformRadius: fallbackRadius,
    };
  }

  function getDraftWorldPositionFromCoords(x, y) {
    const layout = getDraftLayoutSnapshot();
    return {
      x: Number(x) - layout.cx,
      z: Number(y) - layout.cy,
    };
  }

  function getDraftPlatformSurfaceHit(worldX, worldZ) {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return null;
    if (!state.draft.platformReady || !state.draft.platformRoot || !state.draft.platformGroup?.visible) {
      return null;
    }

    const platformTopY = Number(state.draft.platformTopY);
    const originY = Number.isFinite(platformTopY) ? platformTopY + 420 : 420;
    draftPlatformRayOrigin.set(worldX, originY, worldZ);

    draftPlatformRaycaster.set(draftPlatformRayOrigin, DRAFT_PLATFORM_RAY_DIR);
    draftPlatformRaycaster.near = 0;
    draftPlatformRaycaster.far = 2200;

    const hits = draftPlatformRaycaster.intersectObject(state.draft.platformRoot, true);
    if (!hits.length) return null;

    const STRICT_WALKABLE_NORMAL_Y = 0.50;
    const RELAXED_WALKABLE_NORMAL_Y = 0.12;
    let bestStrictHit = null;
    let bestRelaxedHit = null;

    for (const hit of hits) {
      if (!hit?.object || !hit.point) continue;
      const pointY = Number(hit.point.y);
      if (!Number.isFinite(pointY)) continue;

      let normalY = 1;
      if (hit.face) {
        draftPlatformRayNormal
          .copy(hit.face.normal)
          .transformDirection(hit.object.matrixWorld);
        normalY = draftPlatformRayNormal.y;
      }

      if (normalY >= STRICT_WALKABLE_NORMAL_Y) {
        if (!bestStrictHit || pointY > bestStrictHit.point.y) {
          bestStrictHit = hit;
        }
      }

      if (normalY >= RELAXED_WALKABLE_NORMAL_Y) {
        if (!bestRelaxedHit || pointY > bestRelaxedHit.point.y) {
          bestRelaxedHit = hit;
        }
      }
    }

    return bestStrictHit || bestRelaxedHit || null;
  }

  function isDraftWorldPointOnPlatform(worldX, worldZ) {
    return !!getDraftPlatformSurfaceHit(worldX, worldZ);
  }

  function getDraftPlatformSurfaceHeight(worldX, worldZ) {
    const hit = getDraftPlatformSurfaceHit(worldX, worldZ);
    if (!hit || !hit.point) return null;
    const y = Number(hit.point.y);
    return Number.isFinite(y) ? y : null;
  }

  function recycleHitFlash(flash) {
    if (!flash || !flash.sprite) return;
    if (flash.sprite.parent) {
      flash.sprite.parent.remove(flash.sprite);
    }
    flash.sprite.visible = false;
    if (flash.material) {
      flash.material.opacity = 0;
    }
    state.hitFlash.pool.push(flash);
  }

  function updateHitFlashes(dt) {
    const active = state.hitFlash.active;
    if (!active.length) return;

    for (let i = active.length - 1; i >= 0; i--) {
      const flash = active[i];
      flash.life -= dt;

      if (flash.life <= 0) {
        active.splice(i, 1);
        recycleHitFlash(flash);
        continue;
      }

      const t = 1 - (flash.life / flash.duration);
      const popT = Math.min(1, t * 2.7);
      const popEase = 1 - Math.pow(1 - popT, 3);
      const scale = flash.startScale + (flash.endScale - flash.startScale) * popEase;
      const opacity = Math.max(0, 1 - Math.pow(t, 0.7));

      flash.sprite.scale.set(scale, scale, 1);
      flash.material.opacity = opacity;
    }
  }

  function loadHitFlashTexture(pathIndex = 0) {
    if (pathIndex >= HIT_FLASH_TEXTURE_CANDIDATES.length) {
      console.error('[Outra3D] Failed to load hit flash texture from all configured paths.');
      return;
    }

    const texturePath = HIT_FLASH_TEXTURE_CANDIDATES[pathIndex];
    const loader = new THREE.TextureLoader();

    loader.load(
      texturePath,
      (texture) => {
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;

        if ('colorSpace' in texture && THREE.SRGBColorSpace) {
          texture.colorSpace = THREE.SRGBColorSpace;
        } else if ('encoding' in texture && THREE.sRGBEncoding) {
          texture.encoding = THREE.sRGBEncoding;
        }

        state.hitFlash.texture = texture;
      },
      undefined,
      () => {
        loadHitFlashTexture(pathIndex + 1);
      }
    );
  }

  function ensureHitFlashTextureLoaded() {
    if (state.hitFlash.texture || state.hitFlash.textureRequested || typeof THREE === 'undefined') {
      return;
    }

    state.hitFlash.textureRequested = true;
    loadHitFlashTexture(0);
  }

  function createHitFlashInstance() {
    if (!state.hitFlash.texture) return null;

    const material = new THREE.SpriteMaterial({
      map: state.hitFlash.texture,
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    material.alphaTest = 0.02;

    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 20;
    sprite.visible = false;

    return {
      sprite,
      material,
      life: 0,
      duration: HIT_FLASH_DURATION_SEC,
      startScale: HIT_FLASH_BASE_SCALE * 0.5,
      endScale: HIT_FLASH_BASE_SCALE * 1.8,
    };
  }

  function getTargetHitFlashBaseY(target) {
    if (target === 'player' && state.player.rootGroup) {
      return state.player.rootGroup.position.y;
    }
    if (target === 'dummy' && state.dummy.rootGroup) {
      return state.dummy.rootGroup.position.y;
    }
    return cfg.modelYOffset || 0;
  }

  function spawnArenaHitFlashSprite(position, options = {}) {
    if (!state.scene || !isArenaPhase()) return;

    ensureHitFlashTextureLoaded();
    if (!state.hitFlash.texture) return;

    const x = Number(position?.x);
    const y = Number(position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const world = getWorldPositionFromCoords(x, y);
    const duration = Math.max(0.08, Math.min(0.15, Number(options.duration) || HIT_FLASH_DURATION_SEC));
    const baseScale = Math.max(10, Number(options.baseScale) || HIT_FLASH_BASE_SCALE);
    const heightOffset = Number.isFinite(Number(options.heightOffset))
      ? Number(options.heightOffset)
      : HIT_FLASH_HEIGHT_OFFSET;
    const baseY = getTargetHitFlashBaseY(options.target);

    if (state.hitFlash.active.length >= state.hitFlash.maxActive) {
      const oldest = state.hitFlash.active.shift();
      recycleHitFlash(oldest);
    }

    let flash = state.hitFlash.pool.pop();
    if (!flash) {
      flash = createHitFlashInstance();
    }
    if (!flash) return;

    flash.duration = duration;
    flash.life = duration;
    flash.startScale = baseScale * 0.5;
    flash.endScale = baseScale * 1.8;

    flash.sprite.position.set(world.x, baseY + heightOffset, world.z);
    flash.sprite.scale.set(flash.startScale, flash.startScale, 1);
    flash.sprite.visible = true;
    flash.material.opacity = 1;

    if (!flash.sprite.parent) {
      state.scene.add(flash.sprite);
    }

    state.hitFlash.active.push(flash);
  }

  function getPlayerModelVisualSource() {
    if (!state.player || !state.player.modelMount) return null;
    return state.player.modelMount.children[0] || null;
  }

  function collectBones(root) {
    const bones = [];
    if (!root) return bones;
    root.traverse((obj) => {
      if (obj && obj.isBone) bones.push(obj);
    });
    return bones;
  }

  function collectRenderableMeshes(root) {
    const meshes = [];
    if (!root) return meshes;
    root.traverse((obj) => {
      if (obj && (obj.isMesh || obj.isSkinnedMesh)) meshes.push(obj);
    });
    return meshes;
  }

  function createChargeAfterimageMaterial(baseMat) {
    if (!baseMat) return baseMat;

    const mat = cloneMaterial(baseMat);
    const tintColor = new THREE.Color(CHARGE_AFTERIMAGE_CONFIG.tintHex);

    if (mat.color) {
      const hsl = { h: 0, s: 0, l: 0 };
      mat.color.getHSL(hsl);
      hsl.s *= 0.46;
      hsl.l = Math.min(1, hsl.l * 0.98);
      mat.color.setHSL(hsl.h, hsl.s, hsl.l);
      mat.color.lerp(tintColor, CHARGE_AFTERIMAGE_CONFIG.tintStrength);
    }

    if ('emissive' in mat && mat.emissive) {
      mat.emissive.lerp(tintColor, 0.20);
      mat.emissiveIntensity = Math.min(
        1,
        Math.max(Number(mat.emissiveIntensity) || 0, CHARGE_AFTERIMAGE_CONFIG.emissiveStrength)
      );
    }

    mat.transparent = true;
    mat.opacity = 0;
    mat.depthWrite = false;
    mat.depthTest = true;
    mat.needsUpdate = true;
    return mat;
  }

  function buildChargeAfterimageSlot(slotIndex, sourceVisual, sourceBones, sourceMeshes) {
    const rootGroup = new THREE.Group();
    const yawGroup = new THREE.Group();
    const modelMount = new THREE.Group();
    rootGroup.add(yawGroup);
    yawGroup.add(modelMount);

    const visualClone = sourceVisual.clone(true);
    const materials = [];
    traverseMeshes(visualClone, (obj) => {
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.frustumCulled = false;
      obj.renderOrder = -1;

      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((mat) => {
          const ghostMat = createChargeAfterimageMaterial(mat);
          if (ghostMat) materials.push(ghostMat);
          return ghostMat;
        });
      } else if (obj.material) {
        const ghostMat = createChargeAfterimageMaterial(obj.material);
        obj.material = ghostMat;
        if (ghostMat) materials.push(ghostMat);
      }
    });

    modelMount.add(visualClone);
    rootGroup.visible = false;
    if (state.chargeAfterimage.group) {
      state.chargeAfterimage.group.add(rootGroup);
    }

    const ghostBones = collectBones(visualClone);
    const bonePairs = [];
    const boneCount = Math.min(sourceBones.length, ghostBones.length);
    for (let i = 0; i < boneCount; i += 1) {
      bonePairs.push({
        source: sourceBones[i],
        target: ghostBones[i],
      });
    }

    const ghostMeshes = collectRenderableMeshes(visualClone);
    const meshPairs = [];
    const meshCount = Math.min(sourceMeshes.length, ghostMeshes.length);
    for (let i = 0; i < meshCount; i += 1) {
      meshPairs.push({
        source: sourceMeshes[i],
        target: ghostMeshes[i],
      });
    }

    return {
      index: slotIndex,
      rootGroup,
      yawGroup,
      modelMount,
      visualClone,
      materials,
      bonePairs,
      meshPairs,
    };
  }

  function disposeChargeAfterimageSlot(slot) {
    if (!slot) return;
    if (slot.rootGroup && slot.rootGroup.parent) {
      slot.rootGroup.parent.remove(slot.rootGroup);
    }

    if (Array.isArray(slot.materials)) {
      for (const mat of slot.materials) {
        if (mat && typeof mat.dispose === 'function') {
          mat.dispose();
        }
      }
    }
  }

  function clearChargeAfterimagePool() {
    const fx = state.chargeAfterimage;
    if (!fx) return;

    if (Array.isArray(fx.slots)) {
      for (const slot of fx.slots) {
        disposeChargeAfterimageSlot(slot);
      }
    }

    fx.slots = [];
    fx.sourceVisual = null;
    fx.sourceBones = [];
    fx.sourceMeshes = [];
    fx.active = false;
    fx.refreshTime = 0;
    fx.releaseTimeLeft = 0;
  }

  function setChargeAfterimageOpacity(slot, opacity) {
    if (!slot || !Array.isArray(slot.materials)) return;
    for (const mat of slot.materials) {
      if (!mat) continue;
      mat.opacity = opacity;
      mat.transparent = true;
    }
  }

  function hideChargeAfterimages() {
    const fx = state.chargeAfterimage;
    if (!fx || !Array.isArray(fx.slots)) return;
    for (const slot of fx.slots) {
      if (!slot || !slot.rootGroup) continue;
      setChargeAfterimageOpacity(slot, 0);
      slot.rootGroup.visible = false;
    }
  }

  function syncChargeAfterimageSlotPose(slot) {
    if (!slot) return;

    for (const pair of slot.bonePairs || []) {
      if (!pair?.source || !pair?.target) continue;
      pair.target.position.copy(pair.source.position);
      pair.target.quaternion.copy(pair.source.quaternion);
      pair.target.scale.copy(pair.source.scale);
      pair.target.matrixWorldNeedsUpdate = true;
    }

    for (const pair of slot.meshPairs || []) {
      if (!pair?.source || !pair?.target) continue;
      const srcMorph = pair.source.morphTargetInfluences;
      const dstMorph = pair.target.morphTargetInfluences;
      if (!srcMorph || !dstMorph) continue;
      const count = Math.min(srcMorph.length, dstMorph.length);
      for (let i = 0; i < count; i += 1) {
        dstMorph[i] = srcMorph[i];
      }
    }

    if (slot.visualClone) {
      slot.visualClone.updateMatrixWorld(true);
    }
  }

  function ensureChargeAfterimagePool() {
    const fx = state.chargeAfterimage;
    if (!fx || !state.scene) return false;

    const sourceVisual = getPlayerModelVisualSource();
    if (!sourceVisual) {
      clearChargeAfterimagePool();
      return false;
    }

    const desiredCount = Math.max(1, Number(CHARGE_AFTERIMAGE_CONFIG.ghostCount) || 3);
    const sameSource = fx.sourceVisual === sourceVisual;
    const sameCount = Array.isArray(fx.slots) && fx.slots.length === desiredCount;
    if (sameSource && sameCount) return true;

    clearChargeAfterimagePool();

    fx.sourceVisual = sourceVisual;
    fx.sourceBones = collectBones(sourceVisual);
    fx.sourceMeshes = collectRenderableMeshes(sourceVisual);
    fx.slots = [];

    for (let i = 0; i < desiredCount; i += 1) {
      fx.slots.push(
        buildChargeAfterimageSlot(i, sourceVisual, fx.sourceBones, fx.sourceMeshes)
      );
    }

    return fx.slots.length > 0;
  }

  function updateChargeAfterimageEffect(dt) {
    const fx = state.chargeAfterimage;
    if (!fx || !fx.group) return;

    const validArenaState =
      isArenaPhase() &&
      state.ready &&
      state.activeCharacterSet === 'arena' &&
      !!state.player.rootGroup &&
      !!state.player.yawGroup &&
      !!state.player.modelMount &&
      player.alive;

    if (!validArenaState) {
      fx.active = false;
      fx.releaseTimeLeft = 0;
      hideChargeAfterimages();
      return;
    }

    if (!ensureChargeAfterimagePool()) {
      hideChargeAfterimages();
      return;
    }

    const chargingNow = !!player.chargeActive;
    if (chargingNow) {
      fx.active = true;
      fx.releaseTimeLeft = CHARGE_AFTERIMAGE_CONFIG.releaseFadeSec;
      fx.refreshTime += Math.max(0, dt);
    } else if (fx.active) {
      fx.active = false;
      fx.releaseTimeLeft = CHARGE_AFTERIMAGE_CONFIG.releaseFadeSec;
    } else if (fx.releaseTimeLeft > 0) {
      fx.releaseTimeLeft = Math.max(0, fx.releaseTimeLeft - Math.max(0, dt));
    } else {
      hideChargeAfterimages();
      return;
    }

    let dirX = Number(player.chargeDirX);
    let dirY = Number(player.chargeDirY);
    if (!Number.isFinite(dirX) || !Number.isFinite(dirY) || (dirX * dirX + dirY * dirY) < 0.0001) {
      dirX = Number(player.aimX) || 1;
      dirY = Number(player.aimY) || 0;
    }
    const dirLen = Math.hypot(dirX, dirY) || 1;
    const backwardX = -(dirX / dirLen);
    const backwardZ = -(dirY / dirLen);

    const playerLength = Math.max(20, Number(cfg.actorHeight) || 45);
    const refreshInterval = Math.max(0.05, Number(CHARGE_AFTERIMAGE_CONFIG.refreshIntervalSec) || 0.09);
    const releaseDuration = Math.max(0.001, Number(CHARGE_AFTERIMAGE_CONFIG.releaseFadeSec) || 0.10);
    const releaseAlpha =
      chargingNow ? 1 : Math.max(0, Math.min(1, fx.releaseTimeLeft / releaseDuration));

    const basePos = state.player.rootGroup.position;
    const baseYaw = state.player.yawGroup.rotation;
    const chargeYaw = -Math.atan2(dirY, dirX) - Math.PI * 0.5;
    const baseMountRot = state.player.modelMount.rotation;
    const baseMountScale = state.player.modelMount.scale;
    const baseMountPos = state.player.modelMount.position;

    for (let i = 0; i < fx.slots.length; i += 1) {
      const slot = fx.slots[i];
      if (!slot || !slot.rootGroup || !slot.yawGroup || !slot.modelMount) continue;

      const spacingFactor = CHARGE_AFTERIMAGE_CONFIG.spacingPlayerLengths[i] ?? (0.12 * (i + 1));
      const distanceBehind = Math.max(0.01, spacingFactor) * playerLength;

      slot.rootGroup.position.set(
        basePos.x + backwardX * distanceBehind,
        basePos.y,
        basePos.z + backwardZ * distanceBehind
      );
      slot.yawGroup.rotation.set(baseYaw.x, chargeYaw, baseYaw.z);
      slot.modelMount.rotation.copy(baseMountRot);
      slot.modelMount.position.copy(baseMountPos);
      slot.modelMount.scale.copy(baseMountScale);

      const spectralScale = CHARGE_AFTERIMAGE_CONFIG.scale[i] ?? Math.max(0.75, 1 - (i + 1) * 0.04);
      slot.rootGroup.scale.setScalar(spectralScale);

      syncChargeAfterimageSlotPose(slot);

      const opacityBase = CHARGE_AFTERIMAGE_CONFIG.opacity[i] ?? Math.max(0.05, 0.35 - i * 0.12);
      const phaseOffset = i * (refreshInterval * 0.25);
      const refreshPhase = (fx.refreshTime + phaseOffset) % refreshInterval;
      const refreshAlpha = 1 - (refreshPhase / refreshInterval);
      const alpha = Math.max(0, opacityBase * refreshAlpha * releaseAlpha);

      setChargeAfterimageOpacity(slot, alpha);
      slot.rootGroup.visible = alpha > 0.003;
    }
  }

  function crossFadeState(mixerState, nextName, force = false) {
    if (!mixerState || !mixerState.states || !mixerState.states.has(nextName)) return;

    if (!force && mixerState.currentState === nextName) {
      const same = mixerState.states.get(nextName)?.action;
      if (same) {
        applyActionTimeScale(same, nextName);
      }
      applyArenaRotationForState(mixerState);
      return;
    }

    const next = mixerState.states.get(nextName)?.action;
    if (!next) return;
    const fadeDuration = mixerState === state.preview ? 0.24 : 0.12;

    const prev =
      mixerState.currentState &&
      mixerState.states.get(mixerState.currentState)?.action;

    if (prev === next) {
      mixerState.currentState = nextName;
      next.enabled = true;
      applyActionTimeScale(next, nextName);
      next.play();
      applyArenaRotationForState(mixerState);
      return;
    }

    next.reset();
    next.enabled = true;
    applyActionTimeScale(next, nextName);
    next.setEffectiveWeight(1);
    next.play();

    if (prev) {
      prev.crossFadeTo(next, fadeDuration, true);
    } else {
      next.fadeIn(fadeDuration);
    }

    mixerState.currentState = nextName;
    applyArenaRotationForState(mixerState);
    showAnimationDebug(mixerState.states.get(nextName)?.clipName || nextName);
  }

  function setArenaPlayerState(nextName, force = false) {
    crossFadeState(state.player, nextName, force);
  }

  function setDummyState(nextName, force = false) {
    crossFadeState(state.dummy, nextName, force);
  }

  function setPreviewState(nextName, force = false) {
    crossFadeState(state.preview, nextName, force);
  }

  function getTrackTargetNode(root, trackName) {
    if (!root || !trackName || typeof trackName !== 'string') return null;

    const suffixes = ['.position', '.translation'];
    let idx = -1;
    let matchedSuffix = '';
    for (const suffix of suffixes) {
      idx = trackName.lastIndexOf(suffix);
      if (idx > 0) {
        matchedSuffix = suffix;
        break;
      }
    }
    if (idx <= 0 || !matchedSuffix) return null;

    const nodePath = trackName.slice(0, idx);
    if (!nodePath) return null;

    if (THREE.PropertyBinding && typeof THREE.PropertyBinding.findNode === 'function') {
      const resolved = THREE.PropertyBinding.findNode(root, nodePath);
      if (resolved) return resolved;
    }

    return root.getObjectByName(nodePath) || null;
  }

  function buildPositionTrackLocks(root, animations) {
    const locks = [];
    if (!root || !Array.isArray(animations) || !animations.length) return locks;

    const seen = new Set();
    for (const clip of animations) {
      if (!clip || !Array.isArray(clip.tracks)) continue;

      for (const track of clip.tracks) {
        if (!track || typeof track.name !== 'string') continue;
        const isPositionLikeTrack =
          track.name.endsWith('.position') || track.name.endsWith('.translation');
        if (!isPositionLikeTrack) continue;

        const values = track.values;
        if (!values || values.length < 3) continue;

        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let minZ = Number.POSITIVE_INFINITY;
        let maxZ = Number.NEGATIVE_INFINITY;

        for (let i = 0; i + 2 < values.length; i += 3) {
          const x = Number(values[i]);
          const y = Number(values[i + 1]);
          const z = Number(values[i + 2]);
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }

        if (
          !Number.isFinite(minX) || !Number.isFinite(maxX) ||
          !Number.isFinite(minY) || !Number.isFinite(maxY) ||
          !Number.isFinite(minZ) || !Number.isFinite(maxZ)
        ) {
          continue;
        }

        const driftRange = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
        if (driftRange < 0.01) continue;

        const targetNode = getTrackTargetNode(root, track.name);
        if (!targetNode || !targetNode.position) continue;

        const lockKey = targetNode.uuid || track.name;
        if (seen.has(lockKey)) continue;
        seen.add(lockKey);

        locks.push({
          node: targetNode,
          basePosition: targetNode.position.clone(),
        });
      }
    }

    return locks;
  }

  function captureSlotRootMotionBase(slotState) {
    if (!slotState) return;

    if (slotState.root && slotState.root.position) {
      slotState.rootBasePosition = slotState.root.position.clone();
    } else {
      slotState.rootBasePosition = null;
    }

    if (slotState.rigFixNode && slotState.rigFixNode.position) {
      slotState.rigFixBasePosition = slotState.rigFixNode.position.clone();
    } else {
      slotState.rigFixBasePosition = null;
    }
  }

  function capturePreviewRootMotionBase() {
    if (!state.preview) return;

    if (state.preview.root && state.preview.root.position) {
      state.preview.rootBasePosition = state.preview.root.position.clone();
    } else {
      state.preview.rootBasePosition = null;
    }

    if (state.preview.rigFixNode && state.preview.rigFixNode.position) {
      state.preview.rigFixBasePosition = state.preview.rigFixNode.position.clone();
    } else {
      state.preview.rigFixBasePosition = null;
    }
  }

  function lockSlotRootMotion(slotState) {
    if (!slotState) return;

    if (slotState.root && slotState.root.position && slotState.rootBasePosition) {
      slotState.root.position.copy(slotState.rootBasePosition);
    }

    if (slotState.rigFixNode && slotState.rigFixNode.position && slotState.rigFixBasePosition) {
      slotState.rigFixNode.position.copy(slotState.rigFixBasePosition);
    }

    for (const lock of slotState.positionTrackLocks || []) {
      const node = lock?.node;
      const base = lock?.basePosition;
      if (!node || !base || !node.position) continue;
      node.position.copy(base);
    }
  }

  function lockPreviewRootMotion() {
    if (!state.preview) return;

    if (state.preview.root && state.preview.root.position && state.preview.rootBasePosition) {
      state.preview.root.position.copy(state.preview.rootBasePosition);
    }

    if (state.preview.rigFixNode && state.preview.rigFixNode.position && state.preview.rigFixBasePosition) {
      state.preview.rigFixNode.position.copy(state.preview.rigFixBasePosition);
    }

    for (const lock of state.preview.positionTrackLocks || []) {
      const node = lock?.node;
      const base = lock?.basePosition;
      if (!node || !base || !node.position) continue;
      node.position.copy(base);
    }
  }

  function stabilizeGameplayRootMotion() {
    if (gameState === 'lobby') return;
    lockSlotRootMotion(state.player);
    lockSlotRootMotion(state.dummy);
  }

  function resetSlotForCharacterSwap(slotState) {
    if (!slotState) return;

    if (slotState.modelMount) {
      while (slotState.modelMount.children.length) {
        slotState.modelMount.remove(slotState.modelMount.children[0]);
      }
      applyArenaModelBaseRotation(slotState.modelMount);
    }

    if (slotState.draftPlatform) {
      if (slotState.draftPlatform.parent) {
        slotState.draftPlatform.parent.remove(slotState.draftPlatform);
      }
      slotState.draftPlatform = null;
    }
    if (slotState.draftTurnRing) {
      slotState.draftTurnRing.visible = false;
    }
    if (slotState.shadow) {
      slotState.shadow.visible = true;
    }
    if (slotState.yawGroup) {
      slotState.yawGroup.rotation.set(0, 0, 0);
    }
    if (slotState.rootGroup) {
      slotState.rootGroup.position.set(0, 0, 0);
      slotState.rootGroup.rotation.set(0, 0, 0);
    }

    slotState.root = null;
    slotState.mixer = null;
    slotState.states = new Map();
    slotState.currentState = 'idle';
    slotState.rigFixNode = null;
    slotState.rootBasePosition = null;
    slotState.rigFixBasePosition = null;
    slotState.positionTrackLocks = [];
    slotState.lastWorldX = null;
    slotState.lastWorldZ = null;
    slotState.lastDraftWorldX = null;
    slotState.lastDraftWorldZ = null;
    if (slotState.rootGroup) slotState.rootGroup.visible = false;
  }

  function attachCharacterInstance(slot, gltf, prepareFn, setStateFn, animationMode = 'arena') {
    const sourceScene = gltf.scene || gltf.scenes?.[0];
    if (!sourceScene) {
      console.error('[Outra3D] Character GLB loaded without a scene.');
      return false;
    }

    const slotState = state[slot];
    if (!slotState || !slotState.modelMount) return false;

    while (slotState.modelMount.children.length) {
      slotState.modelMount.remove(slotState.modelMount.children[0]);
    }
    applyArenaModelBaseRotation(slotState.modelMount);

    const root = sourceScene;
    prepareFn(root, slotState.modelMount);
    slotState.root = root;
    slotState.rigFixNode = findRigFixNode(root);
    captureSlotRootMotionBase(slotState);

    const animations = gltf.animations || [];
    if (animations.length) {
      slotState.mixer = new THREE.AnimationMixer(root);
      slotState.states = buildAnimationStateMap(animations, slotState.mixer, animationMode);
      slotState.positionTrackLocks = buildPositionTrackLocks(root, animations);
      const firstState = slotState.states.has('idle')
        ? 'idle'
        : (slotState.states.keys().next().value || null);
      if (firstState) setStateFn(firstState, true);
    } else {
      slotState.mixer = null;
      slotState.states = new Map();
      slotState.positionTrackLocks = [];
    }

    return true;
  }

  function switchCharacterSet(nextSet = 'arena') {
    if (!state.loader) return;

    const desiredSet = nextSet === 'draft' ? 'draft' : 'arena';
    if (state.activeCharacterSet === desiredSet) return;

    const charCfg = desiredSet === 'draft'
      ? getDraftCharacterConfig()
      : getArenaCharacterConfig();
    const animationMode = desiredSet === 'draft' ? 'draft' : 'arena';
    const glbPath = charCfg.glb || '';
    if (!glbPath) return;

    const token = ++state.characterLoadToken;
    state.activeCharacterSet = desiredSet;
    state.ready = false;
    clearChargeAfterimagePool();
    resetSlotForCharacterSwap(state.player);
    resetSlotForCharacterSwap(state.dummy);
    let playerLoaded = false;
    let dummyLoaded = false;

    const tryMarkReady = () => {
      if (token !== state.characterLoadToken) return;
      if (!playerLoaded) return;
      state.ready = !!state.player.root;
      tintAllLoadedModelsIfNeeded();
    };

    state.loader.load(
      glbPath,
      (gltf) => {
        if (token !== state.characterLoadToken) return;
        const ok = attachCharacterInstance('player', gltf, prepareArenaModel, setArenaPlayerState, animationMode);
        playerLoaded = !!ok;
        tryMarkReady();
        log(`Loaded ${desiredSet} player character`);
      },
      undefined,
      (error) => {
        console.error(`[Outra3D] Failed to load ${desiredSet} player GLB:`, error);
      }
    );

    state.loader.load(
      glbPath,
      (gltf) => {
        if (token !== state.characterLoadToken) return;
        const ok = attachCharacterInstance('dummy', gltf, prepareDummyModel, setDummyState, animationMode);
        dummyLoaded = !!ok;
        tryMarkReady();
        log(`Loaded ${desiredSet} dummy character`);
      },
      undefined,
      (error) => {
        console.error(`[Outra3D] Failed to load ${desiredSet} dummy GLB:`, error);
      }
    );
  }

  function syncCharacterSetForPhase() {
    const desiredSet = (isDraftPhase() && isDraft3DEnabled()) ? 'draft' : 'arena';
    if (state.activeCharacterSet !== desiredSet) {
      switchCharacterSet(desiredSet);
    }
  }

  function forceCharacterSet(nextSet = 'arena') {
    state.activeCharacterSet = null;
    switchCharacterSet(nextSet);
  }

  function loadCharacterStates() {
    const previewCfg = getLobbyCharacterConfig();
    if (!state.loader) return;

    switchCharacterSet('arena');

    if (previewCfg.glb) {
      state.loader.load(
        previewCfg.glb,
        (gltf) => {
          if (state.preview.root) {
            state.preview.rootGroup.remove(state.preview.root);
          }

          const sourceScene = gltf.scene || gltf.scenes?.[0];
          if (!sourceScene) {
            console.error('[Outra3D] Preview GLB loaded without a scene.');
            return;
          }

          const previewRoot = sourceScene;
          preparePreviewModel(previewRoot, state.preview.rootGroup);
          state.preview.root = previewRoot;

          const previewAnimations = gltf.animations || [];
          if (previewAnimations.length) {
            state.preview.mixer = new THREE.AnimationMixer(previewRoot);
            state.preview.states = buildAnimationStateMap(previewAnimations, state.preview.mixer, 'preview');
            state.preview.positionTrackLocks = buildPositionTrackLocks(previewRoot, previewAnimations);
            capturePreviewRootMotionBase();
            const firstState = state.preview.states.has('idle')
              ? 'idle'
              : (state.preview.states.keys().next().value || null);

            if (firstState) setPreviewState(firstState, true);
          } else {
            state.preview.mixer = null;
            state.preview.states = new Map();
            state.preview.positionTrackLocks = [];
            capturePreviewRootMotionBase();
          }

          state.preview.ready = true;
          tintAllLoadedModelsIfNeeded();
          onResize();
          log('Preview character loaded');
        },
        undefined,
        (error) => {
          console.error('[Outra3D] Failed to load preview character GLB:', error);
        }
      );
    }
  }

  function loadArenaFloor() {
    const floorCfg = getArenaFloorConfig();
    if (!floorCfg.enabled || !floorCfg.glb || !state.loader || !state.floor.rootGroup) return;

    state.loader.load(
      floorCfg.glb,
      (gltf) => {
        if (state.floor.root) {
          state.floor.rootGroup.remove(state.floor.root);
        }

        const sourceScene = gltf.scene || gltf.scenes?.[0];
        if (!sourceScene) {
          console.error('[Outra3D] Arena floor GLB loaded without a scene.');
          return;
        }

        const floorRoot = sourceScene.clone(true);
        prepareArenaFloorModel(floorRoot, state.floor.rootGroup);
        state.floor.root = floorRoot;
        state.arenaFloorReady = true;
        log('Arena floor loaded');
      },
      undefined,
      (error) => {
        console.error('[Outra3D] Failed to load arena floor GLB:', error);
      }
    );
  }

  function loadDraftPlatform() {
    const draftCfg = getDraftRoomConfig();
    if (!draftCfg.enabled || !draftCfg.platform.enabled || !draftCfg.platform.glb || !state.loader || !state.draft.platformGroup) {
      state.draft.platformReady = false;
      if (state.draft.platformGroup) {
        state.draft.platformGroup.visible = false;
      }
      state.draft.platformTopY = null;
      return;
    }

    state.loader.load(
      draftCfg.platform.glb,
      (gltf) => {
        if (state.draft.platformRoot) {
          state.draft.platformGroup.remove(state.draft.platformRoot);
        }

        const sourceScene = gltf.scene || gltf.scenes?.[0];
        if (!sourceScene) {
          console.error('[Outra3D] Draft platform GLB loaded without a scene.');
          return;
        }

        const platformRoot = sourceScene.clone(true);
        prepareDraftPlatformModel(platformRoot, state.draft.platformGroup);
        state.draft.platformRoot = platformRoot;
        state.draft.platformReady = true;
        log('Draft platform loaded');
      },
      undefined,
      (error) => {
        console.error('[Outra3D] Failed to load draft platform GLB:', error);
      }
    );
  }

  function tintAllLoadedModelsIfNeeded() {
    if (state.activeCharacterSet === 'draft') {
      state.lastTintKey = '';
      return;
    }

    const nextKey = `${player.bodyColor}|${player.wandColor}`;
    if (state.lastTintKey === nextKey) return;

    if (state.player.root) tintModel(state.player.root, player.bodyColor, player.wandColor);
    if (state.dummy.root) tintModel(state.dummy.root, '#ffd8b8', '#ff7a1a');

    state.lastTintKey = nextKey;
  }

  function updateArenaFloorPose() {
    if (!state.floor.rootGroup || !state.arenaFloorReady) return;

    state.floor.rootGroup.visible = isArenaPhase();

    if (!state.floor.root) return;

    const targetDiameter = Math.max((arena.radius || arena.baseRadius || 200) * 2, 1);
    const scale = targetDiameter / Math.max(state.floor.sourceDiameter || 1, 1);

    state.floor.root.scale.setScalar(scale);
  }

  function updateDraftPlatformPose() {
    if (!state.draft.platformGroup) return;

    const draftCfg = getDraftRoomConfig();
    const renderCenterPlatform = !draftCfg.platform.attachToPlayers;
    const visible =
      isDraftPhase() &&
      draftCfg.enabled &&
      draftCfg.platform.enabled &&
      state.draft.platformReady &&
      renderCenterPlatform;
    state.draft.platformGroup.visible = visible;
    if (!visible) {
      state.draft.platformTopY = null;
    }

    if (!visible || !state.draft.platformRoot) return;

    const layout = getDraftLayoutSnapshot();
    const fitRadius = Math.max(0.1, draftCfg.platform.fitToLayoutRadius);
    const targetDiameter = Math.max(layout.platformRadius * 2 * fitRadius, 1);
    const sourceDiameter = Math.max(state.draft.platformSourceDiameter || 1, 1);
    const scale = (targetDiameter / sourceDiameter) * Math.max(0.01, draftCfg.platform.scale);

    state.draft.platformRoot.scale.setScalar(scale);
    state.draft.platformRoot.position.set(
      draftCfg.platform.offsetX,
      draftCfg.platform.offsetY,
      draftCfg.platform.offsetZ
    );
    state.draft.platformTopY =
      draftCfg.platform.offsetY +
      (Math.max(1, Number(state.draft.platformSourceHeight) || 1) * scale);
  }

  function applyDraftTiltToModel(mixerState) {
    if (!mixerState || !mixerState.modelMount) return;
    const draftCfg = getDraftRoomConfig();
    if (draftCfg.frontView?.enabled) {
      mixerState.modelMount.rotation.set(
        draftCfg.frontView.rotationX,
        draftCfg.frontView.rotationY,
        draftCfg.frontView.rotationZ
      );
      mixerState.modelMount.scale.setScalar(
        Math.max(0.2, Number(draftCfg.frontView.scale) || 1.75)
      );
      return;
    }
    mixerState.modelMount.rotation.x += draftCfg.playerTiltX;
    mixerState.modelMount.rotation.z += draftCfg.playerTiltZ;
    mixerState.modelMount.scale.setScalar(1);
  }

  function updateDraftActorPlatform(slotState, draftCfg, actorId, nowSec) {
    if (!slotState || !slotState.rootGroup) return;
    const platformCfg = draftCfg?.platform || {};
    const shouldShow =
      isDraftPhase() &&
      draftCfg.enabled &&
      platformCfg.enabled &&
      platformCfg.attachToPlayers &&
      state.draft.platformReady &&
      !!state.draft.platformRoot;

    if (!shouldShow) {
      if (slotState.draftPlatform) {
        slotState.draftPlatform.visible = false;
      }
      return;
    }

    if (!slotState.draftPlatform) {
      const actorPlatform = state.draft.platformRoot.clone(true);
      traverseMeshes(actorPlatform, (obj) => {
        obj.castShadow = false;
        obj.receiveShadow = false;
        obj.frustumCulled = false;
      });
      slotState.draftPlatform = actorPlatform;
      slotState.rootGroup.add(actorPlatform);
    }

    const sourceDiameter = Math.max(1, Number(state.draft.platformSourceDiameter) || 1);
    const sourceHeight = Math.max(1, Number(state.draft.platformSourceHeight) || 1);
    const targetDiameter = Math.max(14, Number(platformCfg.playerDiameter) || 84);
    const baseScale = (targetDiameter / sourceDiameter) * Math.max(0.01, Number(platformCfg.playerScale) || 1);
    const scaledHeight = sourceHeight * baseScale;
    const footClearance = Number.isFinite(Number(platformCfg.playerFootClearance))
      ? Number(platformCfg.playerFootClearance)
      : 0.65;
    const localYOffset = Number.isFinite(Number(platformCfg.playerLocalYOffset))
      ? Number(platformCfg.playerLocalYOffset)
      : -0.2;
    const phaseSeed = (String(actorId || 'A').charCodeAt(0) % 13) * 0.38;
    const floatSpeed = Math.max(0.01, Number(platformCfg.playerFloatSpeed) || 0.95);
    const floatAmp = Math.max(0, Number(platformCfg.playerFloatAmplitude) || 0.2);
    const bob = Math.sin(nowSec * floatSpeed + phaseSeed) * floatAmp;

    slotState.draftPlatform.visible = true;
    slotState.draftPlatform.scale.setScalar(baseScale);
    slotState.draftPlatform.position.set(0, -scaledHeight - footClearance + localYOffset + bob, 0);
  }

  function updateDraftActorPose(slotState, actor, setStateFn, actorId, activePlayerId) {
    if (!slotState || !slotState.rootGroup) return;

    const draftCfg = getDraftRoomConfig();
    const visible = isDraftPhase() && draftCfg.enabled && state.ready && !!actor;
    slotState.rootGroup.visible = visible;

    if (!visible) {
      slotState.lastDraftWorldX = null;
      slotState.lastDraftWorldZ = null;
      if (slotState.draftTurnRing) {
        slotState.draftTurnRing.visible = false;
      }
      if (slotState.draftPlatform) {
        slotState.draftPlatform.visible = false;
      }
      return;
    }

    const world = getDraftWorldPositionFromCoords(actor.x, actor.y);
    const baseActorY = Number.isFinite(Number(draftCfg.playerYOffset)) ? Number(draftCfg.playerYOffset) : 0;
    const idleActorYBias = slotState.currentState === 'idle'
      ? (Number.isFinite(Number(draftCfg.playerIdleYOffset)) ? Number(draftCfg.playerIdleYOffset) : 0)
      : 0;
    const platformSurfaceY = getDraftPlatformSurfaceHeight(world.x, world.z);
    const platformTopY = Number(state.draft.platformTopY);
    const actorY = Number.isFinite(platformSurfaceY)
      ? (platformSurfaceY + baseActorY + idleActorYBias)
      : Number.isFinite(platformTopY)
      ? (platformTopY + baseActorY + idleActorYBias)
      : (baseActorY + idleActorYBias);
    const nowSec = performance.now() * 0.001;
    const actorPhase = (String(actorId || 'A').charCodeAt(0) % 17) * 0.41;
    const actorFloatSpeed = Math.max(0.01, Number(draftCfg.playerFloatSpeed) || 0.9);
    const actorFloatAmp = Math.max(0, Number(draftCfg.playerFloatAmplitude) || 1.1);
    const actorBob = Math.sin(nowSec * actorFloatSpeed + actorPhase) * actorFloatAmp;
    slotState.rootGroup.position.set(world.x, actorY + actorBob, world.z);

    updateDraftActorPlatform(slotState, draftCfg, actorId, nowSec);

    const isTurnActive =
      !!actorId &&
      !!activePlayerId &&
      actorId === activePlayerId &&
      !draftState?.complete;
    if (slotState.draftTurnRing) {
      if (slotState.shadow) {
        slotState.draftTurnRing.position.copy(slotState.shadow.position);
        slotState.draftTurnRing.position.y -= 0.02;
        slotState.draftTurnRing.rotation.copy(slotState.shadow.rotation);
      }
      slotState.draftTurnRing.visible = isTurnActive;
      const ringLayer = slotState.draftTurnRing.userData?.ring;
      const glowLayer = slotState.draftTurnRing.userData?.glow;
      const hazeLayer = slotState.draftTurnRing.userData?.haze;
      if (isTurnActive) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.008 + (actorId.charCodeAt(0) % 5));
        const baseScale = slotState.shadow?.userData?.baseScale;
        const baseX = Number.isFinite(baseScale?.x) ? baseScale.x : 1.6;
        const baseY = Number.isFinite(baseScale?.y) ? baseScale.y : 0.78;
        const scale = 1.02 + pulse * 0.22;
        slotState.draftTurnRing.scale.set(baseX * scale, baseY * scale, 1);
        if (ringLayer?.material) ringLayer.material.opacity = 0.30 + pulse * 0.28;
        if (glowLayer?.material) glowLayer.material.opacity = 0.18 + pulse * 0.20;
        if (hazeLayer?.material) hazeLayer.material.opacity = 0.12 + pulse * 0.17;
      } else {
        if (ringLayer?.material) ringLayer.material.opacity = 0;
        if (glowLayer?.material) glowLayer.material.opacity = 0;
        if (hazeLayer?.material) hazeLayer.material.opacity = 0;
      }
    }

    if (slotState.shadow) {
      slotState.shadow.visible = true;
      setShadowScaleMultiplier(slotState.shadow, 1.0);
    }

    if (slotState.yawGroup) {
      if (draftCfg.frontView?.enabled) {
        slotState.yawGroup.rotation.y = draftCfg.playerYawOffset;
      } else {
        const layout = getDraftLayoutSnapshot();
        const toCenterX = layout.cx - actor.x;
        const toCenterY = layout.cy - actor.y;
        const faceAngle = Math.atan2(toCenterY, toCenterX);
        slotState.yawGroup.rotation.y = -faceAngle - Math.PI * 0.5 + draftCfg.playerYawOffset;
      }
    }

    let moved = false;
    if (slotState.lastDraftWorldX != null && slotState.lastDraftWorldZ != null) {
      const dx = world.x - slotState.lastDraftWorldX;
      const dz = world.z - slotState.lastDraftWorldZ;
      moved = (dx * dx + dz * dz) > 0.01;
    }
    slotState.lastDraftWorldX = world.x;
    slotState.lastDraftWorldZ = world.z;

    if (moved) {
      setStateFn(slotState.states.has('run') ? 'run' : (slotState.states.has('walk') ? 'walk' : 'idle'));
    } else {
      setStateFn('idle');
    }

    applyArenaRotationForState(slotState);
    applyDraftTiltToModel(slotState);
  }

  function updateDraftActorsPose() {
    if (!isDraftPhase()) {
      if (state.player.shadow) state.player.shadow.visible = true;
      if (state.dummy.shadow) state.dummy.shadow.visible = true;
      if (state.player.draftTurnRing) state.player.draftTurnRing.visible = false;
      if (state.dummy.draftTurnRing) state.dummy.draftTurnRing.visible = false;
      if (state.player.draftPlatform) state.player.draftPlatform.visible = false;
      if (state.dummy.draftPlatform) state.dummy.draftPlatform.visible = false;
      if (state.activeCharacterSet !== 'arena') {
        if (state.player.modelMount) applyArenaModelBaseRotation(state.player.modelMount);
        if (state.dummy.modelMount) applyArenaModelBaseRotation(state.dummy.modelMount);
      } else {
        if (state.player.modelMount) {
          state.player.modelMount.scale.setScalar(1);
          state.player.modelMount.position.set(0, 0, 0);
        }
        if (state.dummy.modelMount) {
          state.dummy.modelMount.scale.setScalar(1);
          state.dummy.modelMount.position.set(0, 0, 0);
        }
      }
      return;
    }

    const localId = String(draftState?.localPlayerId || 'A');
    const order = Array.isArray(draftState?.order) ? draftState.order : [];
    const activeIndex = Math.max(0, Math.min(order.length - 1, Number(draftState?.turnIndex) || 0));
    const activePlayerId = order.length ? (order[activeIndex] || null) : null;
    const participantIds = Array.isArray(draftState?.layout?.participantIds) && draftState.layout.participantIds.length
      ? draftState.layout.participantIds
      : (() => {
          const ids = [];
          const seen = new Set();
          for (const id of Array.isArray(draftState?.order) ? draftState.order : []) {
            if (typeof id !== 'string' || !id || seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
          }
          if (!seen.has(localId)) {
            ids.unshift(localId);
          }
          return ids;
        })();
    const opponentId = participantIds.find((id) => id !== localId) || null;

    const localActor = draftState?.players?.[localId] || null;
    const opponentActor = opponentId ? (draftState?.players?.[opponentId] || null) : null;

    updateDraftActorPose(state.player, localActor, setArenaPlayerState, localId, activePlayerId);
    updateDraftActorPose(state.dummy, opponentActor, setDummyState, opponentId, activePlayerId);
  }

  function updateArenaPlayerPose(dt) {
    if (!state.player.rootGroup) return;

    const visible = isArenaPhase() && player.alive;
    state.player.rootGroup.visible = visible;
    if (!visible) return;

    // Safety: ensure no draft front-view transform leaks into arena rendering.
    if (state.activeCharacterSet === 'arena' && state.player.modelMount) {
      state.player.modelMount.scale.setScalar(1);
      state.player.modelMount.position.set(0, 0, 0);
    }

    const world = getWorldPosition(player);

    state.player.rootGroup.position.set(
      world.x,
      cfg.modelYOffset || 0,
      world.z
    );

    if (state.player.shadow) {
      state.player.shadow.visible = true;
      setShadowScaleMultiplier(state.player.shadow, player.chargeActive ? 1.15 : 1.0);
    }

    const aimAngle = Math.atan2(player.aimY, player.aimX);
    if (state.player.yawGroup) {
            state.player.yawGroup.rotation.y = -aimAngle - Math.PI * 0.5;
    }

let moved = false;

if (state.player.lastWorldX != null && state.player.lastWorldZ != null) {
  const dxWorld = world.x - state.player.lastWorldX;
  const dzWorld = world.z - state.player.lastWorldZ;
  const distSq = (dxWorld * dxWorld) + (dzWorld * dzWorld);

  // Detect real visible movement from frame to frame.
  moved = distSq > 0.01;
}

state.player.lastWorldX = world.x;
state.player.lastWorldZ = world.z;

    if (state.player.hitTimer > 0) {
      state.player.hitTimer = Math.max(0, state.player.hitTimer - dt);
      setArenaPlayerState('hit');
    } else if (state.player.dashTimer > 0 || player.chargeActive) {
      state.player.dashTimer = Math.max(0, state.player.dashTimer - dt);
      setArenaPlayerState(state.player.states.has('dash') ? 'dash' : 'run');
    } else if (state.player.castTimer > 0) {
      state.player.castTimer = Math.max(0, state.player.castTimer - dt);
      setArenaPlayerState(state.player.states.has('cast') ? 'cast' : 'idle');
    } else if (moved) {
      setArenaPlayerState(state.player.states.has('run') ? 'run' : 'walk');
    } else {
      setArenaPlayerState('idle');
    }

    tintAllLoadedModelsIfNeeded();

    if (state.player.lastHp == null) {
      state.player.lastHp = player.hp;
    } else if (player.hp < state.player.lastHp) {
      state.player.hitTimer = cfg.hitHoldTime || 0.28;
      setArenaPlayerState('hit', true);
      state.player.lastHp = player.hp;
    } else {
      state.player.lastHp = player.hp;
    }
  }

  function updateDummyPose(dt) {
    if (!state.dummy.rootGroup) return;

    const visible = isArenaPhase() && dummyEnabled && dummy.alive;
    state.dummy.rootGroup.visible = visible;
    if (!visible) return;

    // Safety: ensure no draft front-view transform leaks into arena rendering.
    if (state.activeCharacterSet === 'arena' && state.dummy.modelMount) {
      state.dummy.modelMount.scale.setScalar(1);
      state.dummy.modelMount.position.set(0, 0, 0);
    }

    const world = getWorldPosition(dummy);
    state.dummy.rootGroup.position.set(
      world.x,
      cfg.modelYOffset || 0,
      world.z
    );

    if (state.dummy.shadow) {
      state.dummy.shadow.visible = true;
      setShadowScaleMultiplier(state.dummy.shadow, 1.0);
    }

    const dx = player.x - dummy.x;
    const dy = player.y - dummy.y;
    const aimAngle = Math.atan2(dy, dx);
    if (state.dummy.yawGroup) {
            state.dummy.yawGroup.rotation.y = -aimAngle - Math.PI * 0.5;
    }

let moved = false;

if (state.dummy.lastWorldX != null && state.dummy.lastWorldZ != null) {
  const dxWorld = world.x - state.dummy.lastWorldX;
  const dzWorld = world.z - state.dummy.lastWorldZ;
  const distSq = (dxWorld * dxWorld) + (dzWorld * dzWorld);

  moved = distSq > 0.01;
}

state.dummy.lastWorldX = world.x;
state.dummy.lastWorldZ = world.z;

    if (state.dummy.hitTimer > 0) {
      state.dummy.hitTimer = Math.max(0, state.dummy.hitTimer - dt);
      setDummyState('hit');
    } else if (state.dummy.dashTimer > 0) {
      state.dummy.dashTimer = Math.max(0, state.dummy.dashTimer - dt);
      setDummyState(state.dummy.states.has('dash') ? 'dash' : 'run');
    } else if (state.dummy.castTimer > 0) {
      state.dummy.castTimer = Math.max(0, state.dummy.castTimer - dt);
      setDummyState(state.dummy.states.has('cast') ? 'cast' : 'idle');
    } else if (moved) {
      setDummyState(state.dummy.states.has('run') ? 'run' : 'walk');
    } else {
      setDummyState('idle');
    }

    if (state.dummy.lastHp == null) {
      state.dummy.lastHp = dummy.hp;
    } else if (dummy.hp < state.dummy.lastHp) {
      state.dummy.hitTimer = cfg.hitHoldTime || 0.28;
      setDummyState('hit', true);
      state.dummy.lastHp = dummy.hp;
    } else {
      state.dummy.lastHp = dummy.hp;
    }
  }

  function updatePreviewPose() {
    if (!state.preview.rootGroup || !state.preview.root) return;

    state.preview.rootGroup.visible = gameState === 'lobby';
    if (!state.preview.rootGroup.visible) {
      state.preview.hoverActive = false;
      return;
    }

    const previewSettings = getPreviewSettings();

    if (!state.preview.dragging) {
      state.preview.currentRotationY += (state.preview.targetRotationY - state.preview.currentRotationY) * 0.14;
    }
    state.preview.rootGroup.quaternion.setFromAxisAngle(
      PREVIEW_Y_AXIS,
      state.preview.currentRotationY
    );
    state.preview.rootGroup.position.set(0, previewSettings.modelYOffset, 0);

    setPreviewState('idle');
    tintAllLoadedModelsIfNeeded();
  }

  function updatePreviewAura(dt) {
    if (!state.preview.aura || !state.preview.shadow) return;

    const active =
      state.preview.auraActive &&
      gameState === 'lobby' &&
      !!state.preview.rootGroup &&
      state.preview.rootGroup.visible;

    state.preview.aura.visible = active;
    state.preview.shadow.visible = !active;
    if (state.preview.auraGlow) state.preview.auraGlow.visible = active;
    if (state.preview.auraHaze) state.preview.auraHaze.visible = active;
    if (!active) {
      state.preview.auraPulse = 0;
      if (state.preview.aura.material) {
        state.preview.aura.material.opacity = 0;
      }
      if (state.preview.auraGlow?.material) {
        state.preview.auraGlow.material.opacity = 0;
      }
      if (state.preview.auraHaze?.material) {
        state.preview.auraHaze.material.opacity = 0;
      }
      return;
    }

    state.preview.auraPulse += dt * 2.7;
    const wave = 0.5 + 0.5 * Math.sin(state.preview.auraPulse);
    const hazeWave = 0.5 + 0.5 * Math.sin(state.preview.auraPulse * 0.6 + 1.9);
    const previewSettings = getPreviewSettings();

    state.preview.aura.scale.set(
      previewSettings.shadowScaleX * (1.03 + wave * 0.10),
      previewSettings.shadowScaleY * (0.95 + wave * 0.08),
      1
    );

    if (state.preview.aura.material) {
      state.preview.aura.material.opacity = 0.33 + wave * 0.27;
    }

    if (state.preview.auraGlow) {
      state.preview.auraGlow.scale.set(
        previewSettings.shadowScaleX * (1.14 + wave * 0.16),
        previewSettings.shadowScaleY * (1.00 + wave * 0.12),
        1
      );
      if (state.preview.auraGlow.material) {
        state.preview.auraGlow.material.opacity = 0.21 + wave * 0.21;
      }
    }

    if (state.preview.auraHaze) {
      state.preview.auraHaze.scale.set(
        previewSettings.shadowScaleX * (1.24 + hazeWave * 0.20),
        previewSettings.shadowScaleY * (1.10 + hazeWave * 0.16),
        1
      );
      if (state.preview.auraHaze.material) {
        state.preview.auraHaze.material.opacity = 0.15 + hazeWave * 0.18;
      }
    }
  }

  function updatePreviewAtmosphere(dt) {
    if (!state.preview.rootGroup) return;

    const active = gameState === 'lobby' && state.preview.rootGroup.visible;
    const ambient = state.preview.ambientLight;
    const key = state.preview.keyLight;
    const fill = state.preview.fillLight;
    const rim = state.preview.rimLight;

    if (!active) {
      if (ambient) ambient.intensity = state.preview.baseAmbientIntensity;
      if (key) key.intensity = state.preview.baseKeyIntensity;
      if (fill) fill.intensity = state.preview.baseFillIntensity;
      if (rim) rim.intensity = state.preview.baseRimIntensity;
      if (state.preview.groundLight) state.preview.groundLight.visible = false;
      return;
    }

    state.preview.ambientPulse += dt;
    state.preview.groundLightPulse += dt;

    const breathePrimary = 0.5 + 0.5 * Math.sin(state.preview.ambientPulse * 0.38);
    const breatheSecondary = 0.5 + 0.5 * Math.sin(state.preview.ambientPulse * 0.17 + 1.2);
    const fireBreath = 0.92 + breathePrimary * 0.10 + breatheSecondary * 0.05;

    if (ambient) ambient.intensity = state.preview.baseAmbientIntensity * fireBreath;
    if (key) key.intensity = state.preview.baseKeyIntensity * (0.95 + breathePrimary * 0.09);
    if (fill) fill.intensity = state.preview.baseFillIntensity * (0.94 + breatheSecondary * 0.08);
    if (rim) rim.intensity = state.preview.baseRimIntensity * (0.96 + breathePrimary * 0.08);

    if (!state.preview.groundLight) return;

    const previewSettings = getPreviewSettings();
    const pulse = 0.5 + 0.5 * Math.sin(state.preview.groundLightPulse * 1.6);
    const flickerA = 0.5 + 0.5 * Math.sin(state.preview.groundLightPulse * 7.4 + 0.9);
    const flickerB = 0.5 + 0.5 * Math.sin(state.preview.groundLightPulse * 4.1 + 2.2);
    const flicker = 0.7 * flickerA + 0.3 * flickerB;

    state.preview.groundLight.visible = true;
    state.preview.groundLight.position.x = Math.sin(state.preview.groundLightPulse * 0.52) * 1.8;
    state.preview.groundLight.position.z = Math.cos(state.preview.groundLightPulse * 0.46 + 0.8) * 1.2;
    state.preview.groundLight.rotation.z = Math.sin(state.preview.groundLightPulse * 0.36) * 0.08;
    state.preview.groundLight.scale.set(
      previewSettings.shadowScaleX * (1.52 + pulse * 0.12),
      previewSettings.shadowScaleY * (1.20 + pulse * 0.10),
      1
    );

    if (state.preview.groundLight.material) {
      state.preview.groundLight.material.opacity = 0.12 + pulse * 0.05 + flicker * 0.05;
    }
  }

  function updateMixers(dt) {
    if (state.player.mixer) {
      state.player.mixer.update(dt);
    }

    if (state.dummy.mixer) {
      state.dummy.mixer.update(dt);
    }

    const previewActive =
      gameState === 'lobby' ||
      !!(state.preview.rootGroup && state.preview.rootGroup.visible);

    if (previewActive && state.preview.mixer) {
      state.preview.mixer.update(dt);
    }
    if (previewActive) {
      lockPreviewRootMotion();
    }

    // Arena quaternions are intentionally untouched each frame.

    if (state.debugAnim.timer > 0) {
      state.debugAnim.timer = Math.max(0, state.debugAnim.timer - dt);
    }
  }

  function renderAnimationDebugLabel() {
    if (!isArenaPhase()) return;
    if (!state.debugAnim.text || state.debugAnim.timer <= 0) return;
    if (!state.camera || !state.player.rootGroup) return;

    const screen = getWorldPosition(player);
    const liftY = 90;
    const vector = new THREE.Vector3(
      screen.x,
      (cfg.modelYOffset || 0) + liftY,
      screen.z
    );

    vector.project(state.camera);

    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;

    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const drawCtx = document.getElementById('gameFx')?.getContext('2d');
    if (!drawCtx) return;

    drawCtx.save();
    drawCtx.textAlign = 'center';
    drawCtx.font = 'bold 16px Arial';
    drawCtx.lineWidth = 4;
    drawCtx.strokeStyle = 'rgba(0,0,0,0.75)';
    drawCtx.fillStyle = '#ffffff';
    drawCtx.strokeText(state.debugAnim.text, x, y - 40);
    drawCtx.fillText(state.debugAnim.text, x, y - 40);
    drawCtx.restore();
  }

  window.outraThree = {
    init() {
      if (!cfg.enabled) return;
      initScene();
      initPreviewScene();
      if (!state.failed) {
        if (cfg.arenaFloor?.enabled) {
          loadArenaFloor();
        }
        loadDraftPlatform();
        loadCharacterStates();
      }
    },

    update(dt) {
      syncCharacterSetForPhase();
      if (state.arenaFloorReady) {
        updateArenaFloorPose();
      }
      updateDraftPlatformPose();

      if (state.ready) {
        updateArenaPlayerPose(dt);
        updateDummyPose(dt);
        updateDraftActorsPose();
      }

      const hadPreviewVisible = !!(state.preview.rootGroup && state.preview.rootGroup.visible);
      const shouldUpdatePreview =
        gameState === 'lobby' ||
        hadPreviewVisible ||
        !!state.preview.auraActive;

      if (shouldUpdatePreview) {
        updatePreviewPose();
        updatePreviewAtmosphere(dt);
        updatePreviewAura(dt);
      }
      updateMixers(dt);
      stabilizeGameplayRootMotion();
      updateChargeAfterimageEffect(dt);
      updateHitFlashes(dt);

      if (gameState === 'lobby') {
        if (state.preview.renderer && state.preview.scene && state.preview.camera) {
          state.preview.renderer.render(state.preview.scene, state.preview.camera);
        }
      } else {
        if (state.renderer && state.scene && state.camera) {
          state.renderer.render(state.scene, state.camera);
          renderAnimationDebugLabel();
        }
      }
    },

    render() {},

    forceCharacterSet(nextSet = 'arena') {
      forceCharacterSet(nextSet);
    },

    renderLobbyPreview() {
      if (!state.preview.renderer || !state.preview.scene || !state.preview.camera) return;
      state.preview.renderer.render(state.preview.scene, state.preview.camera);
    },

    isArenaFloorRenderedIn3D() {
      return !!(cfg.arenaFloor?.enabled && state.arenaFloorReady && state.floor.root && isArenaPhase());
    },

    isDraftPlatformRenderedIn3D() {
      return !!(
        isDraft3DEnabled() &&
        state.draft.platformReady &&
        state.draft.platformRoot &&
        isDraftPhase()
      );
    },

    areDraftActorsRenderedIn3D() {
      const localId = String(draftState?.localPlayerId || 'A');
      return !!(
        isDraft3DEnabled() &&
        state.ready &&
        isDraftPhase() &&
        state.activeCharacterSet === 'draft' &&
        state.player.root &&
        state.player.rootGroup?.visible &&
        draftState?.players?.[localId]
      );
    },

    isDraftWorldPointOnPlatform(worldX, worldZ) {
      if (!isDraft3DEnabled()) return false;
      return isDraftWorldPointOnPlatform(Number(worldX), Number(worldZ));
    },

    isPlayerRenderedIn3D() {
      return !!(state.ready && state.player.root && isArenaPhase() && player.alive);
    },

    isDummyRenderedIn3D() {
      return !!(state.ready && state.dummy.root && isArenaPhase() && dummyEnabled && dummy.alive);
    },

    setPreviewAuraActive(active) {
      state.preview.auraActive = !!active;
      if (state.preview.shadow) {
        state.preview.shadow.visible = !state.preview.auraActive;
      }
      if (!state.preview.auraActive && state.preview.aura) {
        state.preview.aura.visible = false;
        if (state.preview.aura.material) {
          state.preview.aura.material.opacity = 0;
        }
      }
      if (!state.preview.auraActive && state.preview.auraGlow) {
        state.preview.auraGlow.visible = false;
        if (state.preview.auraGlow.material) {
          state.preview.auraGlow.material.opacity = 0;
        }
      }
      if (!state.preview.auraActive && state.preview.auraHaze) {
        state.preview.auraHaze.visible = false;
        if (state.preview.auraHaze.material) {
          state.preview.auraHaze.material.opacity = 0;
        }
      }
    },

    setPreviewHoverActive(active) {
      state.preview.hoverActive = false;
      if (!state.preview.root || !state.preview.states || !state.preview.states.size) return;
      setPreviewState('idle');
    },

    spawnHitFlash(position, options = {}) {
      spawnArenaHitFlashSprite(position, options);
    },

    triggerCast() {
      if (!state.ready || !state.player.states.has('cast')) return;
      state.player.castTimer = cfg.castHoldTime || 0.22;
      setArenaPlayerState('cast', true);
    },

    triggerDash() {
      if (!state.ready || !state.player.states.has('dash')) return;
      state.player.dashTimer = cfg.dashHoldTime || 0.30;
      setArenaPlayerState('dash', true);
    },

    triggerHit() {
      if (!state.ready || !state.player.states.has('hit')) return;
      state.player.hitTimer = cfg.hitHoldTime || 0.28;
      setArenaPlayerState('hit', true);
    },

    triggerDummyCast() {
      if (!state.ready || !state.dummy.states.has('cast')) return;
      state.dummy.castTimer = cfg.castHoldTime || 0.22;
      setDummyState('cast', true);
    },

    triggerDummyDash() {
      if (!state.ready || !state.dummy.states.has('dash')) return;
      state.dummy.dashTimer = cfg.dashHoldTime || 0.30;
      setDummyState('dash', true);
    },

    triggerDummyHit() {
      if (!state.ready || !state.dummy.states.has('hit')) return;
      state.dummy.hitTimer = cfg.hitHoldTime || 0.28;
      setDummyState('hit', true);
    },
  };
})();
