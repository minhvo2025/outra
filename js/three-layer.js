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
      states: new Map(),
      currentState: 'idle',
    },
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
    console.log('[Outra3D]', ...args);
  }

  function getGLTFLoaderClass() {
    if (typeof THREE !== 'undefined' && typeof THREE.GLTFLoader !== 'undefined') return THREE.GLTFLoader;
    if (typeof GLTFLoader !== 'undefined') return GLTFLoader;
    return null;
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

  function tintModel(root, bodyColorHex, wandColorHex) {
    const body = new THREE.Color(bodyColorHex || '#d9d9ff');
    const wand = new THREE.Color(wandColorHex || '#7c4dff');

    let meshIndex = 0;
    traverseMeshes(root, (obj) => {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        if (!mat || !('color' in mat)) return;
        if (meshIndex === 0) {
          mat.color.copy(body);
        } else if (meshIndex === 1) {
          mat.color.copy(wand);
        } else {
          mat.color.lerp(body, 0.65);
        }
      });
      meshIndex++;
    });
  }

  function centerAndScaleModel(root, targetHeightOverride) {
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

    let box = computeBox(root);
    let center = new THREE.Vector3();
    let size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    if (size.y < size.z) {
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
    });
  }

  function prepareArenaModel(root, stateName, parentGroup) {
    centerAndScaleModel(root, cfg.actorHeight || 95);
    tintModel(root, player.bodyColor, player.wandColor);
    root.visible = false;
    parentGroup.add(root);
    log('Prepared state:', stateName);
  }

  function preparePreviewModel(root, stateName, parentGroup) {
    centerAndScaleModel(root, 118);
    tintModel(root, player.bodyColor, player.wandColor);
    root.visible = false;
    parentGroup.add(root);
    log('Prepared preview state:', stateName);
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

    state.preview.camera = new THREE.PerspectiveCamera(
      28,
      Math.max(1, canvas2d.clientWidth) / Math.max(1, canvas2d.clientHeight),
      0.1,
      1000
    );
    state.preview.camera.position.set(0, 64, 250);
    state.preview.camera.lookAt(0, 56, 0);

    state.preview.renderer = new THREE.WebGLRenderer({
      canvas: canvas3d,
      antialias: true,
      alpha: true,
    });
    state.preview.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.preview.renderer.setSize(canvas2d.clientWidth || canvas2d.width, canvas2d.clientHeight || canvas2d.height, false);
    state.preview.renderer.setClearColor(0x000000, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 1.75);
    state.preview.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(120, 160, 160);
    state.preview.scene.add(key);

    const fill = new THREE.DirectionalLight(0xa8c4ff, 1.0);
    fill.position.set(-110, 80, 120);
    state.preview.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.95);
    rim.position.set(-90, 120, -150);
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
    state.preview.shadow.scale.set(1.7, 0.8, 1);
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

      state.preview.camera.aspect = width / Math.max(1, height);
      state.preview.camera.updateProjectionMatrix();
      state.preview.renderer.setSize(width, height, false);
    }
  }

  function loadCharacterStates() {
    const paths = cfg.playerCharacter || {};
    const entries = Object.entries(paths);

    if (!entries.length) {
      state.failed = true;
      console.error('[Outra3D] No GLB paths configured.');
      return;
    }

    let remaining = entries.length;

    entries.forEach(([name, url]) => {
      state.loader.load(
        url,
        (gltf) => {
          try {
            const arenaRoot = gltf.scene;
            prepareArenaModel(arenaRoot, name, state.player.rootGroup);

            const arenaMixer = gltf.animations && gltf.animations.length
              ? new THREE.AnimationMixer(arenaRoot)
              : null;

            const arenaAction = arenaMixer && gltf.animations[0]
              ? arenaMixer.clipAction(gltf.animations[0])
              : null;

            if (arenaAction) {
              arenaAction.enabled = true;
              arenaAction.clampWhenFinished = false;
              arenaAction.setLoop(THREE.LoopRepeat, Infinity);
              arenaAction.play();
            }

            state.player.states.set(name, {
              root: arenaRoot,
              mixer: arenaMixer,
              action: arenaAction,
            });

            if (state.preview.rootGroup) {
              state.loader.load(
                url,
                (previewGltf) => {
                  try {
                    const previewRoot = previewGltf.scene;
                    preparePreviewModel(previewRoot, name, state.preview.rootGroup);

                    const previewMixer = previewGltf.animations && previewGltf.animations.length
                      ? new THREE.AnimationMixer(previewRoot)
                      : null;

                    const previewAction = previewMixer && previewGltf.animations[0]
                      ? previewMixer.clipAction(previewGltf.animations[0])
                      : null;

                    if (previewAction) {
                      previewAction.enabled = true;
                      previewAction.clampWhenFinished = false;
                      previewAction.setLoop(THREE.LoopRepeat, Infinity);
                      previewAction.play();
                    }

                    state.preview.states.set(name, {
                      root: previewRoot,
                      mixer: previewMixer,
                      action: previewAction,
                    });

                    if (!state.preview.ready && state.preview.states.size > 0) {
                      state.preview.ready = true;
                      const firstPreview = state.preview.states.has('idle')
                        ? 'idle'
                        : Array.from(state.preview.states.keys())[0];
                      setPreviewState(firstPreview, true);
                    }
                  } catch (e) {
                    console.error('[Outra3D] Error preparing preview state', name, e);
                  }
                },
                undefined,
                (error) => {
                  console.error('[Outra3D] Failed to load preview state', url, error);
                }
              );
            }
          } catch (e) {
            console.error('[Outra3D] Error preparing state', name, e);
          }

          remaining -= 1;

          if (remaining === 0) {
            if (state.player.states.size === 0) {
              state.failed = true;
              console.error('[Outra3D] No states loaded.');
              return;
            }

            state.ready = true;
            state.preview.ready = state.preview.states.size > 0;
            state.player.lastHp = typeof player !== 'undefined' ? player.hp : 100;

            if (state.debugBox) state.debugBox.visible = false;

            const firstArena = state.player.states.has('idle')
              ? 'idle'
              : Array.from(state.player.states.keys())[0];

            const firstPreview = state.preview.states.has('idle')
              ? 'idle'
              : Array.from(state.preview.states.keys())[0];

            setArenaPlayerState(firstArena, true);
            setPreviewState(firstPreview, true);

            log('3D player ready');
          }
        },
        undefined,
        (error) => {
          remaining -= 1;
          console.error('[Outra3D] Failed to load', url, error);

          if (remaining === 0 && state.player.states.size === 0) {
            state.failed = true;
          }
        }
      );
    });
  }

  function getWorldPosition(actor) {
    const worldScale = cfg.worldScale || 1;

    const centerX = canvas.width * 0.5;
    const centerY = canvas.height * 0.5;

    return {
      x: (actor.x - centerX) * worldScale,
      z: (actor.y - centerY) * worldScale,
    };
  }

  function setArenaPlayerState(name, force = false) {
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

  function setPreviewState(name, force = false) {
    if (!state.preview.ready) return;
    if (!force && state.preview.currentState === name) return;

    state.preview.currentState = name;

    state.preview.states.forEach((entry, entryName) => {
      const visible = entryName === name;
      entry.root.visible = visible;

      if (visible && entry.action) {
        entry.action.reset();
        entry.action.play();
      }
    });
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

  function tintAllLoadedModels() {
    state.player.states.forEach((entry) => tintModel(entry.root, player.bodyColor, player.wandColor));
    state.preview.states.forEach((entry) => tintModel(entry.root, player.bodyColor, player.wandColor));
  }

  function updateArenaPlayerPose(dt) {
    if (!state.ready) return;

    const p = player;
    if (!p) return;

    const pos = getWorldPosition(p);
    const stateName = chooseState(dt);

    const baseYOffset = isTouchDevice
      ? (cfg.modelYOffsetMobile || 0)
      : (cfg.modelYOffset || 0);

    state.player.rootGroup.visible = gameState !== 'lobby';
    state.player.rootGroup.position.set(pos.x, baseYOffset, pos.z);

    const aimAngle = Math.atan2(p.aimY, p.aimX);
    state.player.rootGroup.rotation.y = -aimAngle + Math.PI / 2;

    setArenaPlayerState(stateName);

    const bob = stateName === 'run' ? Math.sin(performance.now() * 0.012) * 1.5 : 0;
    state.player.rootGroup.position.y = baseYOffset + bob;

    if (state.player.shadow) {
      state.player.shadow.scale.setScalar(stateName === 'dash' ? 1.25 : 1);
      state.player.shadow.material.opacity = p.alive ? 0.22 : 0.12;
    }

    tintAllLoadedModels();
  }

  function updatePreviewPose() {
    if (!state.preview.ready || !state.preview.rootGroup) return;

    state.preview.rootGroup.visible = gameState === 'lobby';
    if (!state.preview.rootGroup.visible) return;

    state.preview.currentRotationY += (state.preview.targetRotationY - state.preview.currentRotationY) * 0.14;
    state.preview.rootGroup.rotation.y = state.preview.currentRotationY;
    state.preview.rootGroup.position.set(0, 0, 0);

    setPreviewState('idle');
    tintAllLoadedModels();
  }

  function updateMixers(dt) {
    if (!state.ready) return;

    state.player.states.forEach((entry) => {
      if (entry.mixer) entry.mixer.update(dt);
    });

    state.preview.states.forEach((entry) => {
      if (entry.mixer) entry.mixer.update(dt);
    });
  }

  window.outraThree = {
    init() {
      if (!cfg.enabled) return;
      initScene();
      initPreviewScene();
      if (!state.failed) loadCharacterStates();
    },

    update(dt) {
      if (!state.ready) return;
      updateArenaPlayerPose(dt);
      updatePreviewPose();
      updateMixers(dt);
    },

    render() {
      if (state.renderer && state.scene && state.camera) {
        state.renderer.render(state.scene, state.camera);
      }

      if (
        state.preview.renderer &&
        state.preview.scene &&
        state.preview.camera &&
        gameState === 'lobby'
      ) {
        state.preview.renderer.render(state.preview.scene, state.preview.camera);
      }
    },

    renderLobbyPreview() {
      if (!state.preview.renderer || !state.preview.scene || !state.preview.camera) return;
      state.preview.renderer.render(state.preview.scene, state.preview.camera);
    },

    isPlayerRenderedIn3D() {
      return !!state.ready;
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
  };
})();
