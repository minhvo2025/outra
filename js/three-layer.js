// ── Three.js Character Layer ─────────────────────────────────
(function () {
  const cfg = window.WARLOCK_3D_CONFIG || {};
  const state = {
    container: null,
    renderer: null,
    scene: null,
    camera: null,
    loader: null,
    clock: null,
    ready: false,
    failed: false,
    player: {
      states: new Map(),
      currentState: 'idle',
      previousAlive: true,
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

  function hasThree() {
    return typeof THREE !== 'undefined' && typeof THREE.GLTFLoader !== 'undefined';
  }

  function initScene() {
    state.container = document.getElementById('threeLayer');
    if (!state.container || !hasThree()) {
      state.failed = true;
      return;
    }

    state.scene = new THREE.Scene();
    state.clock = new THREE.Clock();

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
      4000,
    );
    state.camera.position.set(0, 900, 0);
    state.camera.up.set(0, 0, -1);
    state.camera.lookAt(0, 0, 0);

    state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.renderer.setSize(width, height);
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    state.container.innerHTML = '';
    state.container.appendChild(state.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 2.2);
    hemi.position.set(0, 500, 0);
    state.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(180, 360, 120);
    state.scene.add(dir);

    const fill = new THREE.DirectionalLight(0x88aaff, 0.8);
    fill.position.set(-180, 220, -60);
    state.scene.add(fill);

    state.loader = new THREE.GLTFLoader();

    state.player.rootGroup = new THREE.Group();
    state.scene.add(state.player.rootGroup);

    const shadowGeo = new THREE.CircleGeometry(cfg.shadowSize || 20, 24);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1;
    state.player.shadow = shadow;
    state.player.rootGroup.add(shadow);

    window.addEventListener('resize', onResize);
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
    const cloned = mat.clone();
    if ('skinning' in mat) cloned.skinning = mat.skinning;
    return cloned;
  }

  function prepareModel(root) {
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        if (Array.isArray(obj.material)) {
          obj.material = obj.material.map(cloneMaterial);
        } else if (obj.material) {
          obj.material = cloneMaterial(obj.material);
        }
      }
    });
    root.scale.setScalar(cfg.actorScale || 28);
    root.rotation.x = 0;
    root.rotation.y = 0;
    root.rotation.z = 0;
    root.position.set(0, cfg.hoverHeight || 0, 0);
    root.visible = false;
    state.player.rootGroup.add(root);
  }

  function loadCharacterStates() {
    const paths = (cfg.playerCharacter || {});
    const entries = Object.entries(paths);
    if (!entries.length) {
      state.failed = true;
      log('No GLB paths configured in WARLOCK_3D_CONFIG.playerCharacter');
      return;
    }

    let remaining = entries.length;

    entries.forEach(([name, url]) => {
      state.loader.load(
        url,
        (gltf) => {
          const root = gltf.scene;
          prepareModel(root);

          const mixer = gltf.animations && gltf.animations.length
            ? new THREE.AnimationMixer(root)
            : null;
          const action = mixer && gltf.animations[0]
            ? mixer.clipAction(gltf.animations[0])
            : null;

          if (action) {
            action.reset();
            action.enabled = true;
            action.clampWhenFinished = false;
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.play();
          }

          state.player.states.set(name, { root, mixer, action });
          remaining -= 1;
          if (remaining === 0) {
            state.ready = true;
            state.player.lastHp = typeof player !== 'undefined' ? player.hp : 100;
            setPlayerState('idle', true);
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
    const x = (actor.x - window.innerWidth / 2) * (cfg.worldScale || 1);
    const z = (actor.y - window.innerHeight / 2) * (cfg.worldScale || 1);
    return { x, z };
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
  }

  function chooseState(dt) {
    const p = window.player;
    if (!p) return 'idle';

    if (!p.alive) return 'hit';

    const hpDrop = state.player.lastHp !== null && p.hp < state.player.lastHp - 0.01;
    state.player.lastHp = p.hp;
    if (hpDrop) state.player.hitTimer = cfg.hitHoldTime || 0.28;

    if (p.chargeActive) state.player.dashTimer = cfg.dashHoldTime || 0.30;

    state.player.castTimer = Math.max(0, state.player.castTimer - dt);
    state.player.hitTimer = Math.max(0, state.player.hitTimer - dt);
    state.player.dashTimer = Math.max(0, state.player.dashTimer - dt);

    if (state.player.hitTimer > 0 && state.player.states.has('hit')) return 'hit';
    if (state.player.dashTimer > 0 && state.player.states.has('dash')) return 'dash';

    const moving = Math.hypot(p.vx || 0, p.vy || 0) > 20 || moveStick.active || keys[keybinds.left] || keys[keybinds.right] || keys[keybinds.up] || keys[keybinds.down];
    return moving && state.player.states.has('run') ? 'run' : 'idle';
  }

  function updatePlayerPose(dt) {
    if (!state.ready || !window.player) return;
    const p = window.player;
    const pos = getWorldPosition(p);
    state.player.rootGroup.position.set(pos.x, 0, pos.z);

    const aimAngle = Math.atan2(p.aimY, p.aimX);
    state.player.rootGroup.rotation.y = -aimAngle + Math.PI / 2;

    const stateName = chooseState(dt);
    setPlayerState(stateName);

    const bob = stateName === 'run' ? Math.sin(performance.now() * 0.012) * 1.6 : 0;
    state.player.rootGroup.position.y = bob;

    state.player.shadow.scale.setScalar(stateName === 'dash' ? 1.25 : 1);
    state.player.shadow.material.opacity = p.alive ? 0.24 : 0.12;
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
