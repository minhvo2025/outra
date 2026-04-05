// ── Three.js Character Layer ─────────────────────────────────
(function () {
  const cfg = window.WARLOCK_3D_CONFIG || {};

  const state = {
    container: null,
    renderer: null,
    scene: null,
    camera: null,
    loader: null,
    ready: false,
    failed: false,
    debugBox: null,
    player: {
      states: new Map(),
      currentState: 'idle',
      castTimer: 0,
      hitTimer: 0,
      dashTimer: 0,
      lastHp: null,
      shadow: null,
      rootGroup: null,
    },
  };

  function log(...args) {
    console.log('[Warlock3D]', ...args);
  }

  function getGLTFLoaderClass() {
    if (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader !== 'undefined') return THREE.GLTFLoader;
    if (typeof GLTFLoader !== 'undefined') return GLTFLoader;
    return null;
  }

  function initScene() {
    state.container = document.getElementById('threeLayer');

    if (!state.container) {
      state.failed = true;
      console.error('[Warlock3D] Missing #threeLayer element.');
      return;
    }

    if (typeof THREE === 'undefined') {
      state.failed = true;
      console.error('[Warlock3D] THREE is not loaded.');
      return;
    }

    const LoaderClass = getGLTFLoaderClass();
    if (!LoaderClass) {
      state.failed = true;
      console.error('[Warlock3D] GLTFLoader is not loaded.');
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

    // Straight top-down camera
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

    state.container.innerHTML = '';
    state.container.appendChild(state.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 2.6);
    hemi.position.set(0, 500, 0);
    state.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.9);
    dir.position.set(180, 360, 120);
    state.scene.add(dir);

    const fill = new THREE.DirectionalLight(0x88aaff, 1.1);
    fill.position.set(-180, 220, -60);
    state.scene.add(fill);

    state.loader = new LoaderClass();

    state.player.rootGroup = new THREE.Group();
    state.scene.add(state.player.rootGroup);

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

    // Visible debug marker so we know where the player origin is.
    const debugGeo = new THREE.BoxGeometry(24, 80, 24);
    const debugMat = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.22,
    });
    state.debugBox = new THREE.Mesh(debugGeo, debugMat);
    state.debugBox.position.set(0, 40, 0);
    state.player.rootGroup.add(state.debugBox);

    window.addEventListener('resize', onResize);

    log('Three.js scene initialized');
  }

  function onResize() {
    if (!state.camera || !state.renderer) return;

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

  function centerAndScaleModel(root) {
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

    // First box
    let box = computeBox(root);
    let center = new THREE.Vector3();
    let size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    // Auto-fix likely Z-up exports
    if (size.y < size.z) {
      root.rotation.x = -Math.PI / 2;
      box = computeBox(root);
      box.getCenter(center);
      box.getSize(size);
      log('Auto-rotated model from Z-up to Y-up');
    }

    root.position.sub(center);

    // Recompute after centering
    box = computeBox(root);
    box.getCenter(center);
    box.getSize(size);

    const targetHeight = cfg.actorHeight || 95;
    const sourceHeight = Math.max(size.y || 1, 1);
    const scale = targetHeight / sourceHeight;

    root.scale.setScalar(scale);

    // Recompute once more after scale
    box = computeBox(root);
    box.getCenter(center);
    box.getSize(size);

    root.position.y += (size.y * 0.5) + (cfg.hoverHeight || 0);

    log('Prepared model size:', {
      x: size.x.toFixed(2),
      y: size.y.toFixed(2),
      z: size.z.toFixed(2),
      scale: scale.toFixed(2),
    });
  }

  function prepareModel(root, stateName) {
    centerAndScaleModel(root);
    root.visible = false;
    state.player.rootGroup.add(root);
    log('Prepared state:', stateName);
  }

  function loadCharacterStates() {
    const paths = cfg.playerCharacter || {};
    const entries = Object.entries(paths);

    if (!entries.length) {
      state.failed = true;
      console.error('[Warlock3D] No GLB paths configured.');
      return;
    }

    let remaining = entries.length;

    entries.forEach(([name, url]) => {
      state.loader.load(
        url,
        (gltf) => {
          try {
            const root = gltf.scene;
            console.log('[Warlock3D] loaded state:', name, root);

            prepareModel(root, name);

            const mixer = gltf.animations && gltf.animations.length
              ? new THREE.AnimationMixer(root)
              : null;

            const action = mixer && gltf.animations[0]
              ? mixer.clipAction(gltf.animations[0])
              : null;

            if (action) {
              action.enabled = true;
              action.clampWhenFinished = false;
              action.setLoop(THREE.LoopRepeat, Infinity);
              action.play();
              log(`Animation attached for ${name}:`, gltf.animations[0].name || '(unnamed)');
            } else {
              log(`No animation clip found for ${name}`);
            }

            state.player.states.set(name, { root, mixer, action });
          } catch (e) {
            console.error('[Warlock3D] Error preparing state', name, e);
          }

          remaining -= 1;

          if (remaining === 0) {
            if (state.player.states.size === 0) {
              state.failed = true;
              console.error('[Warlock3D] No states loaded.');
              return;
            }

            state.ready = true;
            state.player.lastHp = typeof player !== 'undefined' ? player.hp : 100;

            // Hide debug box once at least one model is ready
            if (state.debugBox) state.debugBox.visible = false;

            const first = state.player.states.has('idle')
              ? 'idle'
              : Array.from(state.player.states.keys())[0];

            setPlayerState(first, true);

            console.log('[Warlock3D] states loaded:', Array.from(state.player.states.keys()));
            log('3D player ready');
          }
        },
        undefined,
        (error) => {
          remaining -= 1;
          console.error('[Warlock3D] Failed to load', url, error);

          if (remaining === 0 && state.player.states.size === 0) {
            state.failed = true;
          }
        }
      );
    });
  }

  function getWorldPosition(actor) {
    const worldScale = cfg.worldScale || 1;
    return {
      x: (actor.x - window.innerWidth / 2) * worldScale,
      z: (actor.y - window.innerHeight / 2) * worldScale,
    };
  }

  function setPlayerState(name, force = false) {
    if (!state.ready) return;
    if (!force && state.player.currentState === name) return;

    state.player.currentState = name;

    state.player.states.forEach((entry, entryName) => {
      const visible = entryName === name;
      entry.root.visible = visible;

      if (visible && entry.action) {
        entry.action.reset();
        entry.action.play();
      }
    });

    log('Switched state to:', name);
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

    return moving && state.player.states.has('run') ? 'run' : 'idle';
  }

  function updatePlayerPose(dt) {
    if (!state.ready) return;

    const p = player;
    if (!p) return;

    const pos = getWorldPosition(p);
    const stateName = chooseState(dt);

    state.player.rootGroup.visible = gameState !== 'lobby';

const baseYOffset = isTouchDevice
  ? (cfg.modelYOffsetMobile || 0)
  : (cfg.modelYOffset || 0);

state.player.rootGroup.position.set(pos.x, baseYOffset, pos.z);

const bob = stateName === 'run' ? Math.sin(performance.now() * 0.012) * 1.5 : 0;
state.player.rootGroup.position.y = baseYOffset + bob;

    const aimAngle = Math.atan2(p.aimY, p.aimX);
    state.player.rootGroup.rotation.y = -aimAngle + Math.PI / 2;

    setPlayerState(stateName);

    const bob = stateName === 'run' ? Math.sin(performance.now() * 0.012) * 1.5 : 0;
    state.player.rootGroup.position.y = bob;

    if (state.player.shadow) {
      state.player.shadow.scale.setScalar(stateName === 'dash' ? 1.25 : 1);
      state.player.shadow.material.opacity = p.alive ? 0.22 : 0.12;
    }
  }

  function updateMixers(dt) {
    if (!state.ready) return;
    state.player.states.forEach((entry) => {
      if (entry.mixer) entry.mixer.update(dt);
    });
  }

  window.warlockThree = {
    init() {
      if (!cfg.enabled) return;
      initScene();
      if (!state.failed) loadCharacterStates();
    },

    update(dt) {
      if (!state.ready) return;
      updatePlayerPose(dt);
      updateMixers(dt);
    },

    render() {
      if (!state.renderer || !state.scene || !state.camera) return;
      state.renderer.render(state.scene, state.camera);
    },

    isPlayerRenderedIn3D() {
      return !!state.ready;
    },

    triggerCast() {
      if (!state.ready || !state.player.states.has('cast')) return;
      state.player.castTimer = cfg.castHoldTime || 0.22;
      setPlayerState('cast', true);
    },

    triggerDash() {
      if (!state.ready || !state.player.states.has('dash')) return;
      state.player.dashTimer = cfg.dashHoldTime || 0.30;
      setPlayerState('dash', true);
    },

    triggerHit() {
      if (!state.ready || !state.player.states.has('hit')) return;
      state.player.hitTimer = cfg.hitHoldTime || 0.28;
      setPlayerState('hit', true);
    },
  };
})();
