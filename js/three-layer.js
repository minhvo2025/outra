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
      currentRotationY: Math.PI * 0.9,
      targetRotationY: Math.PI * 0.9,
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
      rigFixNode: null,
    },
  };

const ARENA_MODEL_BASE_EULER = new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ');

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

function centerAndScaleModel(root, targetHeightOverride, options = {}) {
  const autoRotateZUpToYUp = options.autoRotateZUpToYUp !== false;

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

  let box = computeBox(root);
  let center = new THREE.Vector3();
  let size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  // IMPORTANT:
  // Only do this auto-rotation when explicitly allowed.
  // Your arena model is likely already in the correct up-axis,
  // and this was flipping it into the wrong orientation.
  if (autoRotateZUpToYUp && size.y < size.z) {
    root.rotation.x = -Math.PI / 2;
    box = computeBox(root);
    box.getCenter(center);
    box.getSize(size);
    log('Auto-rotated model from Z-up to Y-up');
  }

  root.position.sub(center);

  box = computeBox(root);
  box.getCenter(center);
  box.getSize(size);

  const targetHeight = targetHeightOverride || cfg.actorHeight || 95;
  const sourceHeight = Math.max(size.y || 1, 1);
  const scale = targetHeight / sourceHeight;

  root.scale.setScalar(scale);

  box = computeBox(root);
  box.getCenter(center);
  box.getSize(size);

  root.position.y += (size.y * 0.5) + (cfg.hoverHeight || 0);

  log('Prepared model size:', {
    x: size.x.toFixed(2),
    y: size.y.toFixed(2),
    z: size.z.toFixed(2),
    scale: scale.toFixed(2),
    autoRotateZUpToYUp
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

function applyArenaModelBaseRotation(root) {
  if (!root) return;
  root.rotation.set(
    ARENA_MODEL_BASE_EULER.x,
    ARENA_MODEL_BASE_EULER.y,
    ARENA_MODEL_BASE_EULER.z
  );
  root.updateMatrixWorld(true);
}

function prepareArenaModel(root, parentGroup) {
  centerAndScaleModel(root, cfg.actorHeight || 95, {
    autoRotateZUpToYUp: false
  });

  applyArenaModelBaseRotation(root);
  tintModel(root, player.bodyColor, player.wandColor);
  root.visible = true;
  parentGroup.add(root);

  // Do not use rig fix for arena model
  state.player.rigFixNode = null;

  log('Prepared arena model');
}

function prepareDummyModel(root, parentGroup) {
  centerAndScaleModel(root, cfg.actorHeight || 95, {
    autoRotateZUpToYUp: false
  });

  applyArenaModelBaseRotation(root);
  tintModel(root, '#ffd8b8', '#ff7a1a');
  root.visible = true;
  parentGroup.add(root);

  // Do not use rig fix for arena dummy
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
    state.scene.add(state.player.rootGroup);

    state.dummy.rootGroup = new THREE.Group();
    state.scene.add(state.dummy.rootGroup);

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
    canvas3d.style.borderRadius = '14px';
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

      const searchNames = [];
      if (clipName) searchNames.push(clipName);
      searchNames.push(...(fallbackAliases[stateName] || []));

      const clip = findClipByNames(animations, searchNames);

      if (!clip) {
        console.warn(`[Outra3D] Missing animation clip "${clipName}" for state "${stateName}" (${mode})`);
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
    const nx = x - arena.cx;
    const ny = y - arena.cy;
    return {
      x: nx * (cfg.worldScale || 1),
      z: ny * (cfg.worldScale || 1),
    };
  }

  function loadArenaFloor() {
    const floorCfg = getArenaFloorConfig();
    if (!state.loader || !floorCfg.enabled || !floorCfg.glb) return;

    state.loader.load(
      floorCfg.glb,
      (gltf) => {
        state.floor.root = gltf.scene || gltf.scenes?.[0];
        if (!state.floor.root || !state.floor.rootGroup) return;
        prepareArenaFloorModel(state.floor.root, state.floor.rootGroup);
        state.arenaFloorReady = true;
      },
      undefined,
      (err) => {
        console.warn('[Outra3D] Failed to load arena floor:', err);
      }
    );
  }

  function loadCharacterStates() {
    const arenaChar = getArenaCharacterConfig();
    const lobbyChar = getLobbyCharacterConfig();

    if (!state.loader) return;

    let arenaPlayerReady = false;
    let arenaDummyReady = false;

    function markArenaReady() {
      if (arenaPlayerReady && arenaDummyReady) {
        state.ready = true;
      }
    }

    if (arenaChar.glb) {
      state.loader.load(
        arenaChar.glb,
        (gltf) => {
          const root = gltf.scene || gltf.scenes?.[0];
          if (!root || !state.player.rootGroup) return;

          state.player.root = root;
          state.player.mixer = new THREE.AnimationMixer(state.player.root);
          state.player.states = buildAnimationStateMap(
            gltf.animations || [],
            state.player.mixer,
            'arena'
          );

          prepareArenaModel(state.player.root, state.player.rootGroup);
          playStateAction(state.player.states, 'idle', true);

          arenaPlayerReady = true;
          markArenaReady();
        },
        undefined,
        (err) => {
          console.error('[Outra3D] Failed to load arena player character:', err);
        }
      );

      state.loader.load(
        arenaChar.glb,
        (gltf) => {
          const root = gltf.scene || gltf.scenes?.[0];
          if (!root || !state.dummy.rootGroup) return;

          state.dummy.root = root;
          state.dummy.mixer = new THREE.AnimationMixer(state.dummy.root);
          state.dummy.states = buildAnimationStateMap(
            gltf.animations || [],
            state.dummy.mixer,
            'arena'
          );

          prepareDummyModel(state.dummy.root, state.dummy.rootGroup);
          playStateAction(state.dummy.states, 'idle', true);

          arenaDummyReady = true;
          markArenaReady();
        },
        undefined,
        (err) => {
          console.error('[Outra3D] Failed to load arena dummy character:', err);
        }
      );
    }

    if (lobbyChar.glb) {
      state.loader.load(
        lobbyChar.glb,
        (gltf) => {
          const root = gltf.scene || gltf.scenes?.[0];
          if (!root || !state.preview.rootGroup) return;

          state.preview.root = root;
          state.preview.mixer = new THREE.AnimationMixer(root);
          state.preview.states = buildAnimationStateMap(
            gltf.animations || [],
            state.preview.mixer,
            'preview'
          );

          preparePreviewModel(root, state.preview.rootGroup);
          playStateAction(state.preview.states, 'idle', true);
          state.preview.ready = true;
        },
        undefined,
        (err) => {
          console.error('[Outra3D] Failed to load lobby character:', err);
        }
      );
    }
  }

  function playStateAction(stateMap, targetState, force = false) {
    if (!stateMap || !stateMap.size) return null;

    const entry = stateMap.get(targetState) || stateMap.get('idle');
    if (!entry) return null;

    const resolvedState = stateMap.get(targetState) ? targetState : 'idle';

    stateMap.forEach((other, key) => {
      if (key === resolvedState) return;
      other.action.stop();
    });

    if (force) {
      entry.action.reset();
    }

    if (!entry.action.isRunning()) {
      entry.action.reset();
      entry.action.play();
    } else if (force) {
      entry.action.play();
    }

    return resolvedState;
  }

  function setArenaPlayerState(name, force = false) {
    if (!state.player.states.size) return;
    if (!force && state.player.currentState === name) return;

    const resolved = playStateAction(state.player.states, name, force);
    if (resolved) {
      state.player.currentState = resolved;
      const entry = state.player.states.get(resolved);
      if (entry && entry.clipName) {
        showAnimationDebug(entry.clipName);
      }
    }

    if (state.player.root) {
      state.player.root.visible = true;
    }
  }

  function setDummyState(name, force = false) {
    if (!state.dummy.states.size) return;
    if (!force && state.dummy.currentState === name) return;

    const resolved = playStateAction(state.dummy.states, name, force);
    if (resolved) state.dummy.currentState = resolved;

    if (state.dummy.root) {
      state.dummy.root.visible = true;
    }
  }

  function setPreviewState(name, force = false) {
    if (!state.preview.states.size) return;
    if (!force && state.preview.currentState === name) return;

    const resolved = playStateAction(state.preview.states, name, force);
    if (resolved) state.preview.currentState = resolved;

    if (state.preview.root) {
      state.preview.root.visible = true;
    }
  }

  function chooseState(dt) {
    const p = player;
    if (!p) return 'idle';

    if (!p.alive) return state.player.states.has('hit') ? 'hit' : 'idle';

    const hpDrop = state.player.lastHp !== null && p.hp < state.player.lastHp - 0.01;
    state.player.lastHp = p.hp;

    if (hpDrop) state.player.hitTimer = cfg.hitHoldTime || 0.28;
    if (p.chargeActive) state.player.dashTimer = cfg.dashHoldTime || 0.30;

    state.player.castTimer = Math.max(0, state.player.castTimer - dt);
    state.player.hitTimer = Math.max(0, state.player.hitTimer - dt);
    state.player.dashTimer = Math.max(0, state.player.dashTimer - dt);

    if (state.player.hitTimer > 0 && state.player.states.has('hit')) return 'hit';
    if (state.player.dashTimer > 0 && state.player.states.has('dash')) return 'dash';
    if (state.player.castTimer > 0 && state.player.states.has('cast')) return 'cast';

    const moving =
      Math.hypot(p.vx || 0, p.vy || 0) > 20 ||
      moveStick.active ||
      keys[keybinds.left] ||
      keys[keybinds.right] ||
      keys[keybinds.up] ||
      keys[keybinds.down];

    if (moving) {
      if (state.player.states.has('run')) return 'run';
      if (state.player.states.has('walk')) return 'walk';
    }

    return 'idle';
  }

  function chooseDummyState(dt) {
    if (!dummyEnabled || !dummy) return 'idle';

    if (!dummy.alive) return state.dummy.states.has('hit') ? 'hit' : 'idle';

    const hpDrop = state.dummy.lastHp !== null && dummy.hp < state.dummy.lastHp - 0.01;
    state.dummy.lastHp = dummy.hp;

    if (hpDrop) state.dummy.hitTimer = cfg.hitHoldTime || 0.28;

    state.dummy.castTimer = Math.max(0, state.dummy.castTimer - dt);
    state.dummy.hitTimer = Math.max(0, state.dummy.hitTimer - dt);
    state.dummy.dashTimer = Math.max(0, state.dummy.dashTimer - dt);

    if (state.dummy.hitTimer > 0 && state.dummy.states.has('hit')) return 'hit';
    if (state.dummy.dashTimer > 0 && state.dummy.states.has('dash')) return 'dash';
    if (state.dummy.castTimer > 0 && state.dummy.states.has('cast')) return 'cast';

    const moving = Math.hypot(dummy.vx || 0, dummy.vy || 0) > 20;

    if (moving) {
      if (state.dummy.states.has('run')) return 'run';
      if (state.dummy.states.has('walk')) return 'walk';
    }

    return 'idle';
  }

  function applyRigOrientationFix(rigNode) {
    if (!rigNode) return;

    if (!rigNode.userData.outraBaseQuaternion) {
      rigNode.userData.outraBaseQuaternion = rigNode.quaternion.clone();
    }

    rigNode.quaternion.copy(rigNode.userData.outraBaseQuaternion);
    rigNode.updateMatrixWorld(true);
  }

  function tintAllLoadedModelsIfNeeded() {
    const body = player?.bodyColor || '#d9d9ff';
    const wand = player?.wandColor || '#7c4dff';
    const tintKey = `${body}|${wand}`;

    if (tintKey === state.lastTintKey) return;
    state.lastTintKey = tintKey;

    if (state.player.root) tintModel(state.player.root, body, wand);
    if (state.preview.root) tintModel(state.preview.root, body, wand);
  }

  function updateArenaFloorPose() {
    if (!state.arenaFloorReady || !state.floor.rootGroup || !state.floor.root) return;

    const pos = getWorldPositionFromCoords(arena.cx, arena.cy);
    const baseRadius = Math.max(arena.baseRadius || arena.radius || 1, 1);
    const currentRadius = Math.max(arena.radius || baseRadius, 1);
    const radiusRatio = currentRadius / baseRadius;
    const floorCfg = getArenaFloorConfig();

    state.floor.rootGroup.visible = gameState !== 'lobby';
    state.floor.rootGroup.position.set(pos.x, 0, pos.z);

    const scale = Math.max(0.001, state.floor.baseScale * radiusRatio);
    state.floor.root.scale.setScalar(scale);

    state.floor.root.position.y = floorCfg.yOffset;
  }

  function updateArenaPlayerPose(dt) {
    if (!state.ready || !state.player.rootGroup) return;

    const p = player;
    if (!p) return;

    const pos = getWorldPosition(p);
    const stateName = chooseState(dt);

    const baseHeightOffset = cfg.modelYOffset || 0;
    const mobileHeightOffset = cfg.modelYOffsetMobile || 0;

    const mobileBaseScreenOffsetZ = 40;
    const mobileDriftStrength = 24;

    const normalizedScreenY = ((player.y / canvas.height) - 0.5) * 2;
    const mobileDynamicOffsetZ = isTouchDevice
      ? mobileBaseScreenOffsetZ - (normalizedScreenY * mobileDriftStrength)
      : 0;

    state.player.rootGroup.visible = gameState !== 'lobby';
    state.player.rootGroup.position.set(
      pos.x,
      isTouchDevice ? mobileHeightOffset : baseHeightOffset,
      pos.z + mobileDynamicOffsetZ
    );

    const aimAngle = Math.atan2(p.aimY, p.aimX);
    state.player.rootGroup.rotation.y = -aimAngle + Math.PI / 2;

    setArenaPlayerState(stateName);

    const bob = stateName === 'run' ? Math.sin(performance.now() * 0.012) * 1.5 : 0;
    state.player.rootGroup.position.y = (isTouchDevice ? mobileHeightOffset : baseHeightOffset) + bob;

    if (state.player.shadow) {
      state.player.shadow.scale.setScalar(stateName === 'dash' ? 1.25 : 1);
      state.player.shadow.material.opacity = p.alive ? 0.22 : 0.12;
    }

    tintAllLoadedModelsIfNeeded();
  }

  function updateDummyPose(dt) {
    if (!state.ready || !state.dummy.rootGroup) return;

    state.dummy.rootGroup.visible = gameState !== 'lobby' && dummyEnabled;

    if (!dummyEnabled || !dummy) return;

    const pos = getWorldPosition(dummy);
    const stateName = chooseDummyState(dt);

    const baseHeightOffset = cfg.modelYOffset || 0;
    const mobileHeightOffset = cfg.modelYOffsetMobile || 0;

    const mobileBaseScreenOffsetZ = 40;
    const mobileDriftStrength = 24;

    const normalizedScreenY = ((dummy.y / canvas.height) - 0.5) * 2;
    const mobileDynamicOffsetZ = isTouchDevice
      ? mobileBaseScreenOffsetZ - (normalizedScreenY * mobileDriftStrength)
      : 0;

    state.dummy.rootGroup.position.set(
      pos.x,
      isTouchDevice ? mobileHeightOffset : baseHeightOffset,
      pos.z + mobileDynamicOffsetZ
    );

    const aimAngle = Math.atan2(player.y - dummy.y, player.x - dummy.x);
    state.dummy.rootGroup.rotation.y = -aimAngle + Math.PI / 2;

    setDummyState(stateName);

    const bob = stateName === 'run' ? Math.sin(performance.now() * 0.012) * 1.5 : 0;
    state.dummy.rootGroup.position.y = (isTouchDevice ? mobileHeightOffset : baseHeightOffset) + bob;

    if (state.dummy.shadow) {
      state.dummy.shadow.scale.setScalar(stateName === 'dash' ? 1.25 : 1);
      state.dummy.shadow.material.opacity = dummy.alive ? 0.22 : 0.12;
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

    isPlayerRenderedIn3D() {
      return !!(state.ready && state.player.root && state.player.rootGroup && gameState !== 'lobby');
    },

    isDummyRenderedIn3D() {
      return !!(state.ready && dummyEnabled && state.dummy.root && state.dummy.rootGroup && gameState !== 'lobby');
    },

    isArenaFloorRenderedIn3D() {
      return !!state.arenaFloorReady;
    },

    triggerCast() {
      if (!state.ready || !state.player.states.has('cast')) return;
      state.player.castTimer = cfg.castHoldTime || 0.22;
      setArenaPlayerState('cast', true);
    },

    triggerDummyCast() {
      if (!state.ready || !state.dummy.states.has('cast')) return;
      state.dummy.castTimer = cfg.castHoldTime || 0.22;
      setDummyState('cast', true);
    },

    triggerDummyHit() {
      if (!state.ready || !state.dummy.states.has('hit')) return;
      state.dummy.hitTimer = cfg.hitHoldTime || 0.28;
      setDummyState('hit', true);
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
  };
})();
