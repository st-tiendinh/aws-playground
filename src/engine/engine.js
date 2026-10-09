// Engine bootstrap: renderer (+ optional bloom), world backdrop, camera, the two views
// (explore flows / sandbox simulation), picking and the frame loop. React drives it through
// the returned API and reads its state from the ui / sim stores.
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Sfx } from '../audio.js';
import { FLOWS } from '../data/flows.js';
import { presetById } from '../sim/presets.js';
import { Simulation } from '../sim/simulation.js';
import { writePref } from '../state/store.js';
import { CameraRig } from './cameraRig.js';
import { ExploreScene } from './exploreScene.js';
import { PLATFORM_KINDS } from './models/index.js';
import { HOME_VIEW, SandboxScene } from './sandboxScene.js';
import { World } from './world.js';

const NOT_PICKABLE = new Set(['region', 'outline', 'subnet', 'vpc']);

export function createEngine({ host, ui, simStore }) {
  const params = new URLSearchParams(location.search);
  const forcedLow = params.get('fx') === 'low';
  let quality = forcedLow ? 'low' : ui.get().quality;

  const canvas = document.createElement('canvas');
  canvas.className = 'scene-canvas';
  canvas.setAttribute('aria-label', 'Mô phỏng 3D các dịch vụ AWS');
  host.appendChild(canvas);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    canvas.remove();
    throw e;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'labels-layer';
  host.appendChild(labels.domElement);

  const world = new World(renderer, { low: quality === 'low' });
  const scene = world.scene;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1500);
  camera.position.copy(HOME_VIEW.target).addScaledVector(HOME_VIEW.dir, 70);
  const rig = new CameraRig(camera, canvas);
  rig.controls.target.copy(HOME_VIEW.target);

  // aspect of the area the panels leave free; narrow areas need the camera further back
  function freeAspect() {
    const i = rig.insets;
    return Math.max(0.3, (W - i.left - i.right) / Math.max(1, H - i.top - i.bottom));
  }
  function sandboxHome(duration = 1.2) {
    const aspect = freeAspect();
    const vfov = (camera.fov * Math.PI) / 180;
    const view = sandbox.homeView();
    if (aspect < 0.85) {
      // portrait: look along the request path (users at the bottom, data tier at the top)
      const dist = Math.max(60, (view.radius / Math.sin(vfov / 2)) * 0.9);
      rig.flyTo({ target: view.portraitTarget, dir: view.portraitDir, dist, duration });
      return;
    }
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const dist = Math.max(48, (view.radius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.8);
    rig.flyTo({ target: view.target, dir: view.dir, dist, duration });
  }
  // a DR Region appearing or going away changes what the home view must take in
  let drShown = false;
  function reframe() {
    const on = sim.config.dr !== 'none';
    if (on !== drShown) {
      drShown = on;
      if (mode === 'sandbox') sandboxHome();
    }
  }
  function updateDistScale() {
    rig.distScale = Math.min(1.9, Math.max(1, 1.35 / freeAspect()));
  }

  const sfx = new Sfx();
  sfx.enabled = ui.get().sound;

  // ── simulation + views ──
  const sim = new Simulation(presetById(simStore.get().presetId).config);
  const sandbox = new SandboxScene({ sim, world, sfx, rig });
  scene.add(sandbox.root);
  const explore = new ExploreScene({
    world,
    rig,
    sfx,
    onStep: (s) => {
      ui.set({ step: s.index, stepCount: s.count, playing: s.playing, flowDone: !!s.done });
      // reaching the last step counts the lesson as learnt (ticks it on the beginner path)
      const { serviceId, done } = ui.get();
      if (s.count && s.index === s.count - 1 && !done.includes(serviceId)) {
        const next = [...done, serviceId];
        writePref('done', next);
        ui.set({ done: next });
      }
    },
  });
  scene.add(explore.root);

  // ── post-processing ──
  let composer = null;
  let bloom = null;
  function buildComposer() {
    if (composer) {
      for (const pass of composer.passes) pass.dispose?.();
      composer.dispose();
    }
    composer = null;
    if (quality !== 'high') return;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.42, 1.0);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    resize();
  }

  // ── sizing ──
  let W = 1;
  let H = 1;
  let insetsKnown = false;
  function resize() {
    W = Math.max(1, host.clientWidth);
    H = Math.max(1, host.clientHeight);
    const pr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.25);
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    labels.setSize(W, H);
    rig.setSize(W, H);
    if (composer) {
      composer.setPixelRatio(pr);
      composer.setSize(W, H);
    }
    sandbox.fx.setViewport(H * pr, camera.fov);
    explore.fx.setViewport(H * pr, camera.fov);
    updateDistScale();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  buildComposer();
  resize();

  // ── modes ──
  let mode = null;
  function clearSelection() {
    const prev = ui.get().picked;
    if (!prev) return;
    const pm = (prev.mode === 'sandbox' ? sandbox.nodes : explore.nodes).get(prev.key);
    if (pm) pm.selected = false;
  }

  function setMode(m) {
    if (m === mode) return;
    clearSelection();
    mode = m;
    sandbox.setActive(m === 'sandbox');
    explore.setActive(m === 'explore');
    ui.set({ mode: m, picked: null });
    if (m === 'sandbox') {
      world.setNight(sim.night);
      drShown = sim.config.dr !== 'none';
      sandboxHome();
    } else {
      world.setNight(false);
      if (!explore.flow) loadService(ui.get().serviceId);
      else explore.replay();
    }
  }

  // `step`: the `key` of the step to open at — a deep link such as the NAT Gateway part of the
  // VPC lesson — otherwise the lesson starts from its first step
  function loadService(id, { step } = {}) {
    const flow = FLOWS[id];
    if (!flow) return;
    ui.set({ serviceId: id, picked: null });
    explore.load(flow);
    const at = step ? flow.steps.findIndex((s) => s.key === step) : -1;
    if (at > 0) explore.goto(at, { cameraInstant: true });
    explore.setPlaying(true);
  }

  // ── sandbox actions ──
  function pushSim(full = false) {
    const patch = { snap: sim.snapshot(), config: sim.config };
    if (full) patch.history = sim.history.slice();
    simStore.set(patch);
  }
  sim.on((e) => {
    if (e.type === 'lesson') simStore.set({ lesson: e.lesson, lessonOpen: true });
    simStore.set((s) => ({ events: [...s.events.slice(-59), e] }));
  });

  // fire an event (also used by a pending replay)
  function fire(action, opts) {
    sfx.play('click');
    const ok = sim.trigger(action, opts);
    if (ok !== false && action !== 'repair') simStore.set({ lessonOpen: false });
    if (action === 'repair') simStore.set({ lesson: null, lessonOpen: false });
    pushSim();
    return ok;
  }

  const sandboxApi = {
    applyPreset(id) {
      const p = presetById(id);
      pendingReplay = null;
      // the budget belongs to the account, not to the architecture: keep it
      sim.reset({ ...p.config, budget: sim.config.budget });
      sandbox.rebuild();
      simStore.set({ presetId: id, lesson: null, lessonOpen: false, events: [] });
      pushSim(true);
      reframe();
    },
    applyConfig(config) {
      pendingReplay = null;
      sim.reset({ budget: sim.config.budget, ...config });
      sandbox.rebuild();
      simStore.set({ presetId: null, lesson: null, lessonOpen: false, events: [] });
      pushSim(true);
      reframe();
    },
    setConfig(patch) {
      sim.setConfig(patch);
      simStore.set({ presetId: null });
      pushSim();
      reframe();
    },
    trigger(action, opts) {
      pendingReplay = null;
      return fire(action, opts);
    },
    // repair, optionally change the architecture, then replay an event once things settle
    replay(action, opts, patch) {
      sim.trigger('repair');
      if (patch) sim.setConfig(patch);
      simStore.set({ lesson: null, lessonOpen: false, presetId: patch ? null : simStore.get().presetId });
      pendingReplay = { action, opts, since: sim.t };
      pushSim();
      reframe();
    },
    setUsers(n) {
      sim.setUsers(n);
      pushSim();
    },
    setSpeed(x) {
      simStore.set({ speed: x });
    },
    setPaused(v) {
      simStore.set({ paused: v });
    },
    focus(key) {
      const f = sandbox.focusInfo(key);
      if (f) rig.flyTo({ target: f.target, dir: new THREE.Vector3(-0.38, 0.62, 0.68), dist: f.dist, duration: 1.1 });
    },
    highlight(key) {
      sandbox.highlight(key);
    },
  };

  const exploreApi = {
    load: loadService,
    goto: (i) => explore.goto(i),
    next: () => explore.next(),
    prev: () => explore.prev(),
    replay: () => explore.replay(),
    setPlaying: (v) => explore.setPlaying(v),
    setAutoAdvance: (v) => (explore.autoAdvance = v),
    get autoAdvance() {
      return explore.autoAdvance;
    },
    get progress() {
      return explore.progress;
    },
  };

  // ── picking ──
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  let hovered = null;
  let hoverClock = 0;
  let pointer = null;

  function pickAt(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const root = mode === 'sandbox' ? sandbox.root : explore.root;
    const hits = raycaster.intersectObject(root, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.model) o = o.parent;
      if (!o) continue;
      const m = o.userData.model;
      if (NOT_PICKABLE.has(m.kind) || m.isStage || m.removing) continue;
      if (!o.visible) continue;
      return m;
    }
    return null;
  }

  function describe(m) {
    return {
      kind: m.kind,
      key: m.id,
      mode,
      instId: m.instId || null,
      dbId: m.dbId || null,
      azId: m.azId || null,
      natId: m.natId || null,
      title: m._labelEl?.querySelector('b')?.textContent || null,
      sub: m._labelSub || null,
    };
  }

  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 6) return;
    const m = pickAt(e.clientX, e.clientY);
    const prev = ui.get().picked;
    if (prev) {
      const pm = (mode === 'sandbox' ? sandbox.nodes : explore.nodes).get(prev.key);
      if (pm) pm.selected = false;
    }
    if (m) {
      m.selected = true;
      sfx.play('click');
    }
    ui.set({ picked: m ? describe(m) : null });
  });
  canvas.addEventListener('pointermove', (e) => (pointer = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerleave', () => (pointer = null));

  function updateHover(dt) {
    hoverClock -= dt;
    if (hoverClock > 0) return;
    hoverClock = 0.08;
    const m = pointer && !down ? pickAt(pointer.x, pointer.y) : null;
    if (m !== hovered) {
      if (hovered && !PLATFORM_KINDS.has(hovered.kind)) hovered.highlighted = false;
      hovered = m;
      if (m && !PLATFORM_KINDS.has(m.kind) && m.kind !== 'users') m.highlighted = true;
      canvas.style.cursor = m ? 'pointer' : '';
    }
  }

  // ── loop ──
  let pendingReplay = null;
  let raf = 0;
  let last = performance.now();
  let t = 0;
  let pushClock = 0;
  let histClock = 0;
  // `render` draws one frame on demand: tests can check visuals while rAF is paused (hidden tab)
  const debug = { sim, sandbox, explore, world, rig, camera, renderer, scene, render };
  window.__aws = debug;

  function render() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    t += dt;
    const s = simStore.get();
    if (mode === 'sandbox') {
      const speed = s.paused ? 0 : s.speed;
      if (speed > 0) sim.step(dt * speed);
      if (pendingReplay && sim.t - pendingReplay.since > 1.2 && (sim.settled() || sim.t - pendingReplay.since > 12)) {
        const r = pendingReplay;
        pendingReplay = null;
        fire(r.action, r.opts);
      }
      sandbox.update(dt, speed);
      pushClock -= dt;
      histClock -= dt;
      if (pushClock <= 0) {
        pushClock = 0.2;
        const full = histClock <= 0;
        if (full) histClock = 0.5;
        pushSim(full);
      }
    } else if (mode === 'explore') {
      explore.update(dt);
    }
    rig.update(dt);
    world.update(dt, t, camera, mode === 'sandbox' ? sandbox.bounds : explore.bounds);
    updateHover(dt);
    render();
    if (!document.body.dataset.ready) document.body.dataset.ready = '1';
  }

  setMode(ui.get().mode);
  raf = requestAnimationFrame(frame);

  return {
    setMode,
    sandbox: sandboxApi,
    explore: exploreApi,
    home() {
      if (mode === 'sandbox') sandboxHome(1);
      else explore.flow && explore._camera(explore._lastCam(explore.index), 1);
    },
    setInsets(insets) {
      const first = !insetsKnown;
      insetsKnown = true;
      rig.setInsets(insets);
      updateDistScale();
      // the first real layout arrives after the opening shot was framed: frame it again
      if (first) {
        if (mode === 'sandbox') sandboxHome(0);
        else if (explore.flow) explore._camera(explore._lastCam(explore.index), 0);
      }
    },
    setLabels(v) {
      sandbox.setLabels(v);
      explore.setLabels(v);
      labels.domElement.style.display = '';
      ui.set({ labels: v });
    },
    setSound(v) {
      sfx.enabled = v;
      if (v) sfx.play('click');
      writePref('sound', v);
      ui.set({ sound: v });
    },
    setQuality(q) {
      if (forcedLow) return;
      quality = q;
      renderer.shadowMap.enabled = q === 'high';
      world.sun.castShadow = q === 'high';
      scene.traverse((o) => {
        if (o.material) {
          const list = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of list) m.needsUpdate = true;
        }
      });
      buildComposer();
      resize();
      writePref('quality', q);
      ui.set({ quality: q });
    },
    clearPick() {
      clearSelection();
      ui.set({ picked: null });
    },
    playSound: (n) => sfx.play(n),
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      rig.controls.dispose();
      sandbox.dispose();
      explore.dispose();
      if (composer) {
        for (const pass of composer.passes) pass.dispose?.();
        composer.dispose();
      }
      renderer.dispose();
      canvas.remove();
      labels.domElement.remove();
      delete window.__aws;
    },
  };
}
