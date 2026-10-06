// Explore view: plays a service "flow" — a short scripted lesson made of steps. Each step
// sets which models are visible and in what state, moves the camera and runs timed
// actions (packets, failures, callouts…), optionally on a loop. Steps are deterministic:
// jumping to step N rebuilds the state from the persistent actions of steps 0…N-1.
import * as THREE from 'three';
import { Fx } from './fx.js';
import { createModel } from './models/index.js';
import { COLOR } from './palette.js';

const PERSISTENT = new Set(['state', 'show', 'hide', 'ghost', 'label', 'load', 'count', 'break', 'fix', 'quake']);
// models whose "count" (people, Lambda environments, queued messages) starts at zero
const COUNTED = new Set(['users', 'lambda', 'sqs']);

const v3 = (a) => (a ? new THREE.Vector3(a[0], a[1] ?? 0, a[2] ?? 0) : null);

export class ExploreScene {
  constructor({ world, rig, sfx, onStep }) {
    this.world = world;
    this.rig = rig;
    this.sfx = sfx;
    this.onStep = onStep;
    this.root = new THREE.Group();
    this.root.name = 'explore';
    this.fx = new Fx(this.root);
    this.nodes = new Map();
    this.defs = new Map();
    this.flow = null;
    this.index = 0;
    this.time = 0;
    this.playing = true;
    this.pending = [];
    this.loopClock = 0;
    this.active = false;
    this.labelsOn = true;
    this.autoAdvance = true;
    this.done = false;
  }

  // ── loading ────────────────────────────────────────────────────────────────
  load(flow) {
    this._clear();
    this.flow = flow;
    if (flow.stage !== false) {
      const st = flow.stage || {};
      const stage = createModel('region', { id: '__stage', w: st.w || 28, d: st.d || 18, position: st.pos || [0, 0, 0] });
      this._put('__stage', stage, { id: '__stage', kind: 'region' });
      stage.isStage = true;
    }
    for (const n of flow.nodes) {
      const m = createModel(n.kind, { ...n, id: n.id, position: n.pos });
      if (n.label) {
        m.setLabel(n.label, n.sub || '', { small: n.small, zone: n.zone || n.kind === 'az' || n.kind === 'zone', y: n.labelY });
        if (n.labelPos) m.label.position.set(...n.labelPos);
      }
      this._put(n.id, m, n);
    }
    this.goto(0, { cameraInstant: true });
  }

  _put(id, m, def) {
    this.nodes.set(id, m);
    this.defs.set(id, def);
    this.root.add(m.group);
    m.setLabelVisible(this.labelsOn);
  }

  _clear() {
    this.fx.clear();
    for (const m of this.nodes.values()) m.dispose();
    this.nodes.clear();
    this.defs.clear();
    this.pending = [];
    this.flow = null;
  }

  // ── state ──────────────────────────────────────────────────────────────────
  _initialState() {
    const st = {};
    for (const [id, def] of this.defs) {
      st[id] = {
        visible: !def.hidden,
        state: def.state || 'ok',
        ghost: !!def.ghost,
        title: def.label || null,
        sub: def.sub || '',
        load: def.load ?? 0,
        count: def.count ?? (COUNTED.has(def.kind) ? 0 : null),
      };
    }
    return st;
  }

  _applyPersistent(st, a) {
    const s = st[a.node];
    if (!s) return;
    switch (a.do) {
      case 'show':
        s.visible = true;
        break;
      case 'hide':
        s.visible = false;
        break;
      case 'state':
        s.state = a.value;
        break;
      case 'break':
      case 'quake':
        s.state = 'failed';
        break;
      case 'fix':
        s.state = 'ok';
        break;
      case 'ghost':
        s.ghost = !!a.value;
        break;
      case 'label':
        if (a.title !== undefined) s.title = a.title;
        if (a.sub !== undefined) s.sub = a.sub;
        break;
      case 'load':
        s.load = a.value;
        break;
      case 'count':
        s.count = a.value;
        break;
      default:
        break;
    }
  }

  // shorthand fields on a step (show/hide/state/ghost/label/load/count) as actions
  _stepSets(step) {
    const out = [];
    for (const id of step.show || []) out.push({ do: 'show', node: id });
    for (const id of step.hide || []) out.push({ do: 'hide', node: id });
    for (const [id, v] of Object.entries(step.state || {})) out.push({ do: 'state', node: id, value: v });
    for (const [id, v] of Object.entries(step.ghost || {})) out.push({ do: 'ghost', node: id, value: v });
    for (const [id, v] of Object.entries(step.label || {})) out.push({ do: 'label', node: id, title: v[0], sub: v[1] });
    for (const [id, v] of Object.entries(step.load || {})) out.push({ do: 'load', node: id, value: v });
    for (const [id, v] of Object.entries(step.count || {})) out.push({ do: 'count', node: id, value: v });
    return out;
  }

  // persistent actions anywhere in a run list, including the ones nested in packets
  _collect(list, out) {
    for (const a of list || []) {
      if (PERSISTENT.has(a.do)) out.push(a);
      for (const id of a.breaks || []) out.push({ do: 'break', node: id });
      if (a.then) this._collect(a.then, out);
      if (a.backThen) this._collect(a.backThen, out);
    }
    return out;
  }

  _stateAt(i) {
    const st = this._initialState();
    const steps = this.flow.steps;
    for (let j = 0; j <= i; j++) {
      for (const a of this._stepSets(steps[j])) this._applyPersistent(st, a);
      if (j < i) for (const a of this._collect(steps[j].run, [])) this._applyPersistent(st, a);
    }
    return st;
  }

  _commit(st, animate) {
    for (const [id, s] of Object.entries(st)) {
      const m = this.nodes.get(id);
      if (!m) continue;
      const wasVisible = m.group.visible && !m.removing;
      if (s.visible && !wasVisible) this._show(m, animate);
      else if (!s.visible && wasVisible) {
        if (animate) m.despawn(() => (m.group.visible = false));
        else m.group.visible = false;
      }
      m.setState(s.state);
      if (!animate) {
        m._fail = s.state === 'failed' ? 1 : 0;
        m._tilt = s.state === 'failed' ? m.tiltAmount * m._tiltDir : 0;
        m._jolt = 0;
        m._lookDirty = true;
      }
      m.setGhost(s.ghost);
      if (s.title) {
        m.setLabel(s.title, s.sub, { zone: m.kind === 'az' || m.kind === 'zone', small: this.defs.get(id)?.small });
        const def = this.defs.get(id);
        if (def?.labelPos) m.label.position.set(...def.labelPos);
        m.setLabelVisible(this.labelsOn);
      }
      if (s.load != null) this._setLoad(m, s.load);
      if (s.count != null) this._setCount(m, s.count);
      this._failFx(id, m, s.state === 'failed' && s.visible);
    }
  }

  _show(m, animate) {
    m.group.visible = true;
    if (animate) {
      m.spawn();
      const p = m.group.position;
      if (m.kind !== 'outline' && m.kind !== 'subnet' && m.kind !== 'vpc' && m.kind !== 'asg') {
        this.fx.beam(p, { color: m.color || '#7dd3fc', r: Math.max(0.8, (m.radius || 1) * 0.8), h: 12, dur: 1 });
      }
      this.fx.ring(p, { color: m.color || '#7dd3fc', r0: 0.3, r1: Math.max(2, (m.radius || 1) * 1.8), dur: 0.8 });
    } else {
      m._despawn = null;
      m._spawn = 1;
      m.body.scale.set(1, 1, 1);
      m.body.position.y = 0;
      if (m.label) m.label.visible = this.labelsOn;
    }
  }

  _failFx(id, m, failed) {
    if (m.kind === 'az' || m.kind === 'zone') {
      for (let k = 0; k < 2; k++) {
        const key = `quake:${id}:${k}`;
        if (!failed) {
          this.fx.setEmitter(key, null);
          continue;
        }
        const p = m.group.position;
        const w = m.w || 6;
        this.fx.setEmitter(key, { kind: 'smoke', rate: 1.3, pos: new THREE.Vector3(p.x - w * 0.2 + k * w * 0.4, p.y + 0.2, p.z), color: '#57534e', size: 1.8, alpha: 0.4 });
      }
      return;
    }
    this.fx.setEmitter('smoke:' + id, failed ? { kind: 'smoke', rate: 2, pos: m.anchor(new THREE.Vector3(), 0.5), size: 1.2 } : null);
  }

  _setLoad(m, v) {
    if (m.setLoad) m.setLoad(v);
    else if (m.setLevel) m.setLevel(v);
    else m.load = v;
  }

  _setCount(m, v) {
    if (m.setCount) m.setCount(v);
    else if (m.setEnvs) m.setEnvs(v, v > 0 ? 50 : 0);
    else if (m.setQueue) m.setQueue(v);
  }

  // ── navigation ─────────────────────────────────────────────────────────────
  goto(i, { cameraInstant = false } = {}) {
    if (!this.flow) return;
    const steps = this.flow.steps;
    i = Math.max(0, Math.min(steps.length - 1, i));
    const forward = i === this.index + 1 && !cameraInstant;
    this.index = i;
    this.time = 0;
    this.done = false;
    this.loopClock = 0;
    this.fx.movers.clear();
    this.fx.packets.clear();
    this.pending = [];
    const st = this._stateAt(i);
    this._commit(st, forward);
    const step = steps[i];
    for (const a of step.run || []) this.pending.push({ at: a.at || 0, a });
    this.pending.sort((x, y) => x.at - y.at);
    // a step without its own camera keeps the framing of the last step that had one
    const cam = step.cam || (forward ? null : this._lastCam(i));
    if (cam) this._camera(cam, cameraInstant ? 0 : 1.4);
    this._report();
  }

  _lastCam(i) {
    for (let j = i; j >= 0; j--) if (this.flow.steps[j].cam) return this.flow.steps[j].cam;
    return this.flow.cam;
  }

  next() {
    if (this.flow && this.index < this.flow.steps.length - 1) this.goto(this.index + 1);
  }

  prev() {
    if (this.index > 0) this.goto(this.index - 1);
  }

  replay() {
    this.goto(this.index);
  }

  setPlaying(v) {
    this.playing = v;
    this._report();
  }

  _report() {
    this.onStep?.({ index: this.index, count: this.flow ? this.flow.steps.length : 0, playing: this.playing, done: this.done });
  }

  _camera(cam, duration) {
    let target = v3(cam.target);
    if (cam.node) {
      const m = this.nodes.get(cam.node);
      if (m) target = m.group.position.clone();
    }
    if (!target) target = new THREE.Vector3();
    if (cam.position) this.rig.flyTo({ target, position: v3(cam.position), duration });
    else this.rig.flyTo({ target, dir: v3(cam.dir) || new THREE.Vector3(-0.26, 0.6, 0.76), dist: (cam.dist || 26) * 1.15 * (this.rig.distScale || 1), duration });
  }

  // ── actions ────────────────────────────────────────────────────────────────
  _anchor(id, a = {}) {
    const m = this.nodes.get(id);
    if (!m) return null;
    if (a.pin && m.pinWorld) return m.pinWorld(a.pin, new THREE.Vector3());
    if (m.kind === 'users' && m.randomPerson) return m.randomPerson(new THREE.Vector3());
    return m.anchor(new THREE.Vector3(), a.lift || 0);
  }

  _run(a) {
    const node = a.node && this.nodes.get(a.node);
    switch (a.do) {
      case 'packet': {
        const end = a.toPos ? v3(a.toPos) : this._anchor(a.to, { pin: a.toPin });
        const pts = [this._anchor(a.from, { pin: a.fromPin }), ...(a.via || []).map((id) => this._anchor(id)), end];
        if (pts.some((p) => !p)) return;
        const self = this;
        this.fx.movers.spawn(pts, {
          color: a.color || COLOR.dynamic,
          label: a.label,
          shape: a.shape,
          speed: a.speed || 7,
          size: a.size || 1,
          lift: a.lift,
          fail: a.fail,
          back: a.back ? { ...a.back, onArrive: a.backThen ? () => self._schedule(a.backThen) : null } : null,
          onArrive: () => {
            if (a.pulse !== false) {
              const m = this.nodes.get(a.to);
              if (m && m.pulse) m.pulse();
              if (m && m.flash !== undefined && m.kind === 'apigw') m.flash = 1;
            }
            if (a.then) this._schedule(a.then);
          },
        });
        break;
      }
      case 'stream': {
        const n = a.n || 5;
        for (let k = 0; k < n; k++) this._schedule([{ ...a, do: 'packet', at: k * (a.every || 0.25) }]);
        break;
      }
      case 'pulse':
        if (node) this.fx.ring(node.group.position, { color: a.color || node.color || '#7dd3fc', r0: 0.4, r1: a.r || Math.max(2.2, (node.radius || 1) * 2), dur: a.dur || 1 });
        break;
      case 'callout': {
        const p = this._anchor(a.node, { pin: a.pin });
        if (p) this.fx.callout(new THREE.Vector3(p.x, p.y + (a.dy ?? 1.4), p.z), a.text, { kind: a.kind || 'info', dur: a.dur || 2.2, rise: a.rise ?? 1 });
        break;
      }
      case 'beam':
        if (node) this.fx.beam(node.group.position, { color: a.color || node.color, r: a.r || 1, h: a.h || 12, dur: a.dur || 1.2 });
        break;
      case 'break': {
        if (!node) break;
        node.setState('failed');
        const p = node.anchor(new THREE.Vector3());
        this.fx.sparks(p, { n: 24, speed: 5 });
        this.fx.glowBurst(p, { color: '#ff6b3d', size: 3.5, life: 0.5 });
        this.fx.smokePuff(p, { n: 5, size: 1.4, color: '#1f2937' });
        this._failFx(a.node, node, true);
        this.sfx?.play('zap');
        break;
      }
      case 'fix':
        if (!node) break;
        node.setState('ok');
        this._failFx(a.node, node, false);
        this.fx.ring(node.group.position, { color: COLOR.ok, r0: 0.4, r1: 3, dur: 1 });
        this.sfx?.play('good');
        break;
      case 'quake': {
        if (!node) break;
        node.setState('failed');
        this.rig.shake(a.amount || 0.8, 2.5);
        this.fx.dust(node.group.position, { w: node.w || 8, d: node.d || 6, n: 50 });
        this._failFx(a.node, node, true);
        // models standing on the zone break with it
        for (const id of a.breaks || []) this._run({ do: 'break', node: id });
        this.sfx?.play('quake');
        break;
      }
      case 'show': {
        if (!node) break;
        if (!node.group.visible || node.removing) this._show(node, true);
        break;
      }
      case 'hide':
        if (node && node.group.visible) {
          this._failFx(a.node, node, false);
          node.despawn(() => (node.group.visible = false));
        }
        break;
      case 'state':
        node?.setState(a.value);
        break;
      case 'ghost':
        node?.setGhost(a.value);
        break;
      case 'label':
        if (node) {
          if (a.title !== undefined) node.setLabel(a.title, a.sub ?? node._labelSub ?? '', { zone: node.kind === 'az' || node.kind === 'zone', small: this.defs.get(a.node)?.small });
          else if (a.sub !== undefined) node.setLabelSub(a.sub);
          const def = this.defs.get(a.node);
          if (def?.labelPos) node.label.position.set(...def.labelPos);
          node.setLabelVisible(this.labelsOn);
        }
        break;
      case 'load':
        if (node) this._setLoad(node, a.value);
        break;
      case 'count':
        if (node) this._setCount(node, a.value);
        break;
      case 'flash':
        node?.flash?.(a.kind);
        if (a.kind) this.sfx?.play(a.kind === 'allow' ? 'good' : 'alert');
        break;
      case 'focus':
        this._camera(a, a.duration ?? 1.2);
        break;
      case 'shake':
        this.rig.shake(a.amount || 0.5, a.dur || 1.5);
        break;
      case 'sound':
        this.sfx?.play(a.name);
        break;
      default:
        break;
    }
  }

  // queue actions relative to now
  _schedule(list) {
    for (const a of list) this.pending.push({ at: this.time + (a.at || 0), a });
    this.pending.sort((x, y) => x.at - y.at);
  }

  // ── per frame ──────────────────────────────────────────────────────────────
  update(dt) {
    if (!this.flow) return;
    const step = this.flow.steps[this.index];
    const sdt = this.playing ? dt : 0;
    this.fx.movers.timeScale = this.playing ? 1 : 0;
    this.fx.packets.timeScale = this.playing ? 1 : 0;
    if (this.playing) {
      this.time += sdt;
      while (this.pending.length && this.pending[0].at <= this.time) this._run(this.pending.shift().a);
      if (step.loop) {
        const start = step.loop.start ?? 0;
        if (this.time >= start) {
          this.loopClock -= sdt;
          if (this.loopClock <= 0) {
            this.loopClock = step.loop.every || 2;
            this._schedule(step.loop.run);
          }
        }
      }
      const dur = step.dur || 7;
      if (this.time >= dur && this.autoAdvance) {
        if (this.index < this.flow.steps.length - 1) this.goto(this.index + 1);
        else if (!this.done) {
          this.done = true;
          this._report();
        }
      }
    }
    for (const m of this.nodes.values()) if (m.group.visible) m.update(dt);
    this.fx.update(dt);
  }

  // progress through the current step (0…1) for the UI
  get progress() {
    if (!this.flow) return 0;
    return Math.min(1, this.time / (this.flow.steps[this.index].dur || 7));
  }

  setActive(v) {
    this.active = v;
    this.root.visible = v;
  }

  setLabels(v) {
    this.labelsOn = v;
    for (const m of this.nodes.values()) if (!m.isStage) m.setLabelVisible(v);
  }

  model(id) {
    return this.nodes.get(id);
  }

  dispose() {
    this._clear();
    this.root.removeFromParent();
  }
}
