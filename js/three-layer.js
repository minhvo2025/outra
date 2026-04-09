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
    debugBox: null,
    lastTintKey: '',
    arenaFloorReady: false,
    debugAnim: {
      text: '',
      timer: 0,
    },
    preview: {
      host: null,
      canvas2d: null,
      canvas3d: null,
      scene: null,
      camera: null,
      renderer: null,
      rootGroup: null,
      shadow: null,
      ready: false,
      currentRotationY: 0,
      targetRotationY: 0,
      dragging: false,
      lastX: 0,
      root: null,
      mixer: null,
      states: new Map(),
      currentState: 'idle',
      rigFixNode: null,
    },
    floor: {
      root: null,
      rootGroup: null,
      baseScale: 1,
      sourceDiameter: 1,
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
    },
  };

function getArenaModelBaseEuler() {
  const charCfg = cfg.arenaCharacter || {};
  const baseRotation = charCfg.baseRotation || {};

  return new THREE.Euler(
    typeof baseRotation.x === 'number' ? baseRotation.x : 0,
    typeof baseRotation.y === 'number' ? baseRotation.y : 0,
    typeof baseRotation.z === 'number' ? baseRotation.z : 0,
    'XYZ'
  );
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

  function getLobbyCharacterConfig() {
    const charCfg = cfg.lobbyCharacter || {};
    return {
      glb: charCfg.glb || '',
      animations: {
        idle: charCfg.animations?.idle || 'idle',
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

function prepareArenaModelTransform(root, targetHeightOverride) {
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

  // Reset root completely.
  // Arena orientation should come only from config baseRotation.
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  let box = computeBox(root);
  let size = new THREE.Vector3();
  box.getSize(size);

  // Scale by the tallest dimension after import reset.
  const sourceHeight = Math.max(size.y || 1, 1);
  const targetHeight = targetHeightOverride || cfg.actorHeight || 95;
  const scale = targetHeight / sourceHeight;

  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  // Recompute after scale.
  box = computeBox(root);

  const center = new THREE.Vector3();
  const min = new THREE.Vector3();
  box.getCenter(center);
  min.copy(box.min);

  // IMPORTANT:
  // Center only on X/Z so turning happens around the character body center,
  // but anchor Y to the bottom so the model stands on the arena instead of
  // orbiting around its own middle.
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= min.y;
  root.position.y += (cfg.hoverHeight || 0);

  root.updateMatrixWorld(true);

  log('Prepared arena model transform', {
    size: size.x.toFixed(1) + ' x ' + size.y.toFixed(1) + ' x ' + size.z.toFixed(1),
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

    const baseEuler = getArenaModelBaseEuler();

    mount.rotation.set(
      baseEuler.x,
      baseEuler.y,
      baseEuler.z
    );

    mount.position.set(0, 0, 0);
    mount.updateMatrixWorld(true);
  }

  function prepareArenaModel(root, mountGroup) {
    prepareArenaModelTransform(root, cfg.actorHeight || 95);
    tintModel(root, player.bodyColor, player.wandColor);
    root.visible = true;
    mountGroup.add(root);

    state.player.rigFixNode = null;

    log('Prepared arena model');
  }

  function prepareDummyModel(root, mountGroup) {
    prepareArenaModelTransform(root, cfg.actorHeight || 95);
    tintModel(root, '#ffd8b8', '#ff7a1a');
    root.visible = true;
    mountGroup.add(root);

    state.dummy.rigFixNode = null;

    log('Prepared dummy model');
  }

  function preparePreviewModel(root, parentGroup) {
    const previewSettings = getPreviewSettings();

    centerAndScaleModel(root, previewSettings.targetHeight, {
      autoRotateZUpToYUp: true
    });

    tintModel(root, player.bodyColor, player.wandColor);
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

    state.floor.rootGroup = new THREE.Group();
    state.scene.add(state.floor.rootGroup);

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
    state.player.shadow = shadow;
    state.player.rootGroup.add(shadow);

    const dummyShadow = new THREE.Mesh(
      shadowGeo.clone(),
      shadowMat.clone()
    );
    dummyShadow.rotation.x = -Math.PI / 2;
    dummyShadow.position.y = -1;
    state.dummy.shadow = dummyShadow;
    state.dummy.rootGroup.add(dummyShadow);

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

    const key = new THREE.DirectionalLight(0xfff0dd, 1.25);
    key.position.set(120, 170, 150);
    state.preview.scene.add(key);

    const fill = new THREE.DirectionalLight(0xa785ff, 0.42);
    fill.position.set(-120, 90, 130);
    state.preview.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffb15b, 0.38);
    rim.position.set(0, 110, -170);
    state.preview.scene.add(rim);

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

    bindPreviewInput();
    log('Lobby preview scene initialized');
  }

  function bindPreviewInput() {
    const canvas = state.preview.canvas3d;
    if (!canvas) return;

    function getClientX(e) {
      if (e.touches && e.touches[0]) return e.touches[0].clientX;
      return e.clientX;
    }

    function down(e) {
      state.preview.dragging = true;
      state.preview.lastX = getClientX(e);
    }

    function move(e) {
      if (!state.preview.dragging) return;
      const x = getClientX(e);
      const dx = x - state.preview.lastX;
      state.preview.lastX = x;
      state.preview.targetRotationY += dx * 0.012;
    }

    function up() {
      state.preview.dragging = false;
    }

    canvas.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);

    canvas.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up, { passive: true });
    window.addEventListener('touchcancel', up, { passive: true });
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
      : getArenaCharacterConfig();

    const result = new Map();

    const wantedStates = {
      idle: charCfg.animations.idle,
      walk: charCfg.animations.walk,
      run: charCfg.animations.run,
      cast: charCfg.animations.cast,
      dash: charCfg.animations.dash,
      hit: charCfg.animations.hit,
    };

    const fallbackAliases = {
      idle: ['idle', 'Idle', 'idle_1'],
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

      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.clampWhenFinished = false;
      action.setLoop(THREE.LoopRepeat, Infinity);

      result.set(stateName, {
        clipName: clip.name,
        clip,
        action,
      });
    });

    if (!result.size && animations.length && mixer) {
      const fallback = animations[0];
      const action = mixer.clipAction(fallback);
      action.enabled = true;
      action.clampWhenFinished = false;
      action.setLoop(THREE.LoopRepeat, Infinity);

      result.set('idle', {
        clipName: fallback.name,
        clip: fallback,
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

  function crossFadeState(mixerState, nextName, force = false) {
    if (!mixerState || !mixerState.states || !mixerState.states.has(nextName)) return;

    if (!force && mixerState.currentState === nextName) {
      const same = mixerState.states.get(nextName)?.action;
      if (same) {
        applyActionTimeScale(same, nextName);
      }
      return;
    }

    const next = mixerState.states.get(nextName)?.action;
    if (!next) return;

    const prev =
      mixerState.currentState &&
      mixerState.states.get(mixerState.currentState)?.action;

    if (prev === next) {
      mixerState.currentState = nextName;
      next.enabled = true;
      applyActionTimeScale(next, nextName);
      next.play();
      return;
    }

    next.reset();
    next.enabled = true;
    applyActionTimeScale(next, nextName);
    next.setEffectiveWeight(1);
    next.play();

    if (prev) {
      prev.crossFadeTo(next, 0.12, true);
    } else {
      next.fadeIn(0.12);
    }

    mixerState.currentState = nextName;
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

  function loadCharacterStates() {
    const arenaCfg = getArenaCharacterConfig();
    const previewCfg = getLobbyCharacterConfig();

    if (!state.loader) return;

    const attachArenaInstance = (slot, gltf, prepareFn, setStateFn) => {
      const sourceScene = gltf.scene || gltf.scenes?.[0];
      if (!sourceScene) {
        console.error('[Outra3D] Arena GLB loaded without a scene.');
        return;
      }

      const slotState = state[slot];
      if (!slotState || !slotState.modelMount) return;

      if (slotState.root) {
        slotState.modelMount.remove(slotState.root);
      }

      const root = sourceScene;
      prepareFn(root, slotState.modelMount);
      slotState.root = root;

      const arenaAnimations = gltf.animations || [];
      if (arenaAnimations.length) {
        slotState.mixer = new THREE.AnimationMixer(root);
        slotState.states = buildAnimationStateMap(arenaAnimations, slotState.mixer, 'arena');
        const firstState = slotState.states.has('idle')
          ? 'idle'
          : (slotState.states.keys().next().value || null);

        if (firstState) setStateFn(firstState, true);
      } else {
        slotState.mixer = null;
        slotState.states = new Map();
      }
    };

    if (arenaCfg.glb) {
      state.loader.load(
        arenaCfg.glb,
        (gltf) => {
          attachArenaInstance('player', gltf, prepareArenaModel, setArenaPlayerState);
          state.ready = !!state.player.root;
          tintAllLoadedModelsIfNeeded();
          log('Arena player character loaded');
        },
        undefined,
        (error) => {
          console.error('[Outra3D] Failed to load arena player GLB:', error);
        }
      );

      state.loader.load(
        arenaCfg.glb,
        (gltf) => {
          attachArenaInstance('dummy', gltf, prepareDummyModel, setDummyState);
          tintAllLoadedModelsIfNeeded();
          log('Arena dummy character loaded');
        },
        undefined,
        (error) => {
          console.error('[Outra3D] Failed to load arena dummy GLB:', error);
        }
      );
    }

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
            const firstState = state.preview.states.has('idle')
              ? 'idle'
              : (state.preview.states.keys().next().value || null);

            if (firstState) setPreviewState(firstState, true);
          } else {
            state.preview.mixer = null;
            state.preview.states = new Map();
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

  function tintAllLoadedModelsIfNeeded() {
    const nextKey = `${player.bodyColor}|${player.wandColor}`;
    if (state.lastTintKey === nextKey) return;

    if (state.player.root) tintModel(state.player.root, player.bodyColor, player.wandColor);
    if (state.preview.root) tintModel(state.preview.root, player.bodyColor, player.wandColor);
    if (state.dummy.root) tintModel(state.dummy.root, '#ffd8b8', '#ff7a1a');

    state.lastTintKey = nextKey;
  }

  function updateArenaFloorPose() {
    if (!state.floor.rootGroup || !state.arenaFloorReady) return;

    state.floor.rootGroup.visible = gameState !== 'lobby';

    if (!state.floor.root) return;

    const targetDiameter = Math.max((arena.radius || arena.baseRadius || 200) * 2, 1);
    const scale = targetDiameter / Math.max(state.floor.sourceDiameter || 1, 1);

    state.floor.root.scale.setScalar(scale);
  }

  function updateArenaPlayerPose(dt) {
    if (!state.player.rootGroup) return;

    const visible = gameState !== 'lobby' && player.alive;
    state.player.rootGroup.visible = visible;
    if (!visible) return;

    const world = getWorldPosition(player);

    state.player.rootGroup.position.set(
      world.x,
      cfg.modelYOffset || 0,
      world.z
    );

    if (state.player.shadow) {
      state.player.shadow.visible = true;
      state.player.shadow.scale.setScalar(player.chargeActive ? 1.15 : 1.0);
    }

    const aimAngle = Math.atan2(player.aimY, player.aimX);
    if (state.player.yawGroup) {
            state.player.yawGroup.rotation.y = -aimAngle - Math.PI * 0.5;
    }

    const moved =
      Math.abs(player.vx) > 24 ||
      Math.abs(player.vy) > 24;

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

    const visible = gameState !== 'lobby' && dummyEnabled && dummy.alive;
    state.dummy.rootGroup.visible = visible;
    if (!visible) return;

    const world = getWorldPosition(dummy);
    state.dummy.rootGroup.position.set(
      world.x,
      cfg.modelYOffset || 0,
      world.z
    );

    if (state.dummy.shadow) {
      state.dummy.shadow.visible = true;
      state.dummy.shadow.scale.setScalar(1.0);
    }

    const dx = player.x - dummy.x;
    const dy = player.y - dummy.y;
    const aimAngle = Math.atan2(dy, dx);
    if (state.dummy.yawGroup) {
            state.dummy.yawGroup.rotation.y = -aimAngle - Math.PI * 0.5;
    }

    const moved =
      Math.abs(dummy.vx) > 24 ||
      Math.abs(dummy.vy) > 24;

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
    if (!state.preview.rootGroup.visible) return;

    const previewSettings = getPreviewSettings();

    state.preview.currentRotationY += (state.preview.targetRotationY - state.preview.currentRotationY) * 0.14;
    state.preview.rootGroup.rotation.y = state.preview.currentRotationY;
    state.preview.rootGroup.position.set(0, previewSettings.modelYOffset, 0);

    setPreviewState('idle');
    tintAllLoadedModelsIfNeeded();
  }

  function updateMixers(dt) {
    if (state.player.mixer) {
      state.player.mixer.update(dt);
    }

    if (state.dummy.mixer) {
      state.dummy.mixer.update(dt);
    }

    if (state.preview.mixer) {
      state.preview.mixer.update(dt);
    }

    // IMPORTANT:
    // Do not force arena rig quaternions every frame.
    // That can preserve or reapply a wrong bone orientation.
    // Leave preview untouched if needed later.

    if (state.debugAnim.timer > 0) {
      state.debugAnim.timer = Math.max(0, state.debugAnim.timer - dt);
    }
  }

  function renderAnimationDebugLabel() {
    if (gameState === 'lobby') return;
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
        loadArenaFloor();
        loadCharacterStates();
      }
    },

    update(dt) {
      updateArenaFloorPose();

      if (state.ready) {
        updateArenaPlayerPose(dt);
        updateDummyPose(dt);
      }

      updatePreviewPose();
      updateMixers(dt);

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

    renderLobbyPreview() {
      if (!state.preview.renderer || !state.preview.scene || !state.preview.camera) return;
      state.preview.renderer.render(state.preview.scene, state.preview.camera);
    },

    isArenaFloorRenderedIn3D() {
      return !!(state.arenaFloorReady && state.floor.root && gameState !== 'lobby');
    },

    isPlayerRenderedIn3D() {
      return !!(state.ready && state.player.root && gameState !== 'lobby' && player.alive);
    },

    isDummyRenderedIn3D() {
      return !!(state.ready && state.dummy.root && gameState !== 'lobby' && dummyEnabled && dummy.alive);
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
