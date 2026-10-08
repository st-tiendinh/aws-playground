// Storage and database models for the FSx, Storage Gateway and purpose-built database lessons:
// an FSx file server (one look, a nameplate per file system type), the Storage Gateway
// appliance with its local cache, and a small Neptune graph whose edges light up.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CAT_COLOR, COLOR } from '../palette.js';
import { textTexture } from '../textures.js';
import { Model } from './base.js';

const cOk = new THREE.Color(COLOR.ok);
const cOff = new THREE.Color('#1f2937');

function plate(model, text, bg, w, h, pos) {
  const m = new THREE.MeshBasicMaterial({ map: textTexture(text, { w: 320, h: 112, bg, font: `800 ${text.length > 6 ? 62 : 76}px "Be Vietnam Pro", sans-serif` }), toneMapped: false });
  m.userData.noLook = true;
  return model.add(new THREE.PlaneGeometry(w, h), m, pos, { shadow: false });
}

// ── Amazon FSx: a managed file server; `text` names the file system (Windows, Lustre, ONTAP,
// OpenZFS) and `tint` colours its nameplate and trim. Reads and writes blink the drive bays ──
export class FSxModel extends Model {
  constructor(opts = {}) {
    super('fsx', { category: 'storage', ...opts });
    const tint = opts.tint || '#4d7c0f';
    this.color = CAT_COLOR.storage;
    this.height = 1.95;
    this.radius = 1.0;
    this.anchorY = 1.2;
    this.add(new RoundedBoxGeometry(1.75, 0.2, 1.35, 2, 0.06), this.mat('#2f4a0a'), [0, 0.1, 0]);
    this.add(new RoundedBoxGeometry(1.8, 0.05, 1.4, 2, 0.02), this.glow(this.color, 1.1), [0, 0.225, 0], { shadow: false });
    this.add(new RoundedBoxGeometry(1.45, 1.55, 1.05, 3, 0.08), this.mat('#365314', { roughness: 0.5 }), [0, 1.02, 0]);
    this.add(new RoundedBoxGeometry(1.5, 0.12, 1.1, 2, 0.04), this.mat(tint, { emissive: tint, emissiveIntensity: 0.25 }), [0, 1.84, 0]);
    plate(this, opts.text || 'FSx', tint, 1.12, 0.39, [0, 1.52, 0.531]);
    const bay = this.mat('#1a2e05', { roughness: 0.7 });
    this.leds = [];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const x = -0.42 + c * 0.42;
        const y = 0.55 + r * 0.42;
        this.add(new RoundedBoxGeometry(0.36, 0.32, 0.05, 2, 0.02), bay, [x, y, 0.53]);
        const m = this.glow(COLOR.ok, 2.2);
        m.userData.noLook = true;
        this.add(new THREE.BoxGeometry(0.06, 0.06, 0.03), m, [x + 0.11, y - 0.09, 0.56], { shadow: false });
        this.leds.push({ m, phase: Math.random() * 10, hit: 0 });
      }
    }
    this.finish();
  }

  // a read or write arrived: a few drive lights flash
  pulse() {
    for (const l of this.leds) if (Math.random() < 0.5) l.hit = 1;
  }

  animate(dt, t) {
    const live = this.state !== 'failed' && this.state !== 'off';
    for (const l of this.leds) {
      l.hit = Math.max(0, l.hit - dt * 3);
      const on = live && (l.hit > 0.2 || Math.sin(t * 2.2 + l.phase) > 0.75);
      l.m.color.copy(on ? cOk : cOff);
      l.m.emissive.copy(on ? cOk : cOff);
      l.m.emissiveIntensity = on ? 2.2 + l.hit * 2 : 0;
    }
  }
}

// ── AWS Storage Gateway: an appliance (a VM in your server room) with a local cache on top.
// `load` is how full the cache is ──
export class GatewayModel extends Model {
  constructor(opts = {}) {
    super('storagegateway', { category: 'storage', ...opts });
    this.color = CAT_COLOR.storage;
    this.height = 1.7;
    this.radius = 1.0;
    this.anchorY = 1.1;
    this.load = opts.load ?? 0.3;
    this._load = this.load;
    this.add(new RoundedBoxGeometry(1.8, 0.16, 1.2, 2, 0.05), this.mat('#334155'), [0, 0.08, 0]);
    this.add(new RoundedBoxGeometry(1.7, 0.62, 1.05, 3, 0.07), this.mat('#1f2937', { roughness: 0.45, metalness: 0.3 }), [0, 0.47, 0]);
    this.add(new RoundedBoxGeometry(1.74, 0.07, 1.09, 2, 0.03), this.glow(this.color, 1.0), [0, 0.8, 0], { shadow: false });
    plate(this, 'Gateway', '#3f6212', 1.0, 0.35, [-0.25, 0.47, 0.53]);
    this.lights = [];
    for (let k = 0; k < 3; k++) {
      const m = this.glow(COLOR.ok, 2.2);
      m.userData.noLook = true;
      this.add(new THREE.SphereGeometry(0.045, 10, 8), m, [0.42 + k * 0.14, 0.47, 0.535], { shadow: false });
      this.lights.push({ m, phase: k * 1.7 });
    }
    // local cache: a glass drum on top that fills with the data kept close to your users
    const glass = new THREE.MeshStandardMaterial({ color: '#d9f99d', transparent: true, opacity: 0.25, roughness: 0.2, depthWrite: false });
    glass.userData.noLook = true;
    this.add(new THREE.CylinderGeometry(0.42, 0.42, 0.8, 28, 1, true), glass, [0, 1.23, 0], { shadow: false });
    this.add(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 28), this.mat('#64748b'), [0, 1.65, 0]);
    this.fill = this.add(new THREE.CylinderGeometry(0.38, 0.38, 1, 24), this.glow('#84cc16', 0.6), [0, 0.85, 0], { shadow: false });
    this.finish();
  }

  setLoad(v) {
    this.load = v;
  }

  animate(dt, t) {
    this._load += (this.load - this._load) * Math.min(1, dt * 3);
    const h = Math.max(0.02, Math.min(1, this._load)) * 0.76;
    this.fill.scale.y = h;
    this.fill.position.y = 0.85 + h / 2;
    const live = this.state !== 'failed' && this.state !== 'off';
    for (const l of this.lights) {
      const on = live && Math.sin(t * 5 + l.phase) > 0;
      l.m.emissiveIntensity = on ? 2.2 : 0.1;
    }
  }
}

// ── Amazon Neptune: a small property graph on a plinth — customers (blue), products (amber),
// accounts (violet) and one shared card (red). `count` lights the first edges of the
// recommendation path, state 'breach' lights the accounts sharing the card in red ──
const GRAPH_NODES = [
  ['A', [-1.3, 1.25, 0.55], '#60a5fa'],
  ['B', [0.25, 1.6, -0.75], '#60a5fa'],
  ['C', [1.15, 1.2, 0.2], '#60a5fa'],
  ['P1', [-0.45, 0.8, -0.1], '#fbbf24'],
  ['P2', [0.95, 0.75, -0.95], '#fbbf24'],
  ['P3', [-1.25, 0.7, -0.85], '#fbbf24'],
  ['X', [0.35, 1.05, 1.1], '#a78bfa'],
  ['Y', [1.55, 1.55, 1.05], '#a78bfa'],
  ['K', [1.1, 0.6, 1.25], '#f87171'],
];
// edges as node indices; the first three are the path A → P1 → B → P2, the last three the shared card
const GRAPH_EDGES = [
  [0, 3],
  [3, 1],
  [1, 4],
  [0, 5],
  [2, 4],
  [2, 5],
  [6, 8],
  [7, 8],
  [2, 8],
];
const PATH = [0, 1, 2];
const RING = [6, 7, 8];
const cPath = new THREE.Color('#4ade80');
const cRing = new THREE.Color('#ef4444');
const cEdge = new THREE.Color('#94a3b8');

export class GraphModel extends Model {
  constructor(opts = {}) {
    super('neptune', { category: 'database', ...opts });
    this.color = CAT_COLOR.database;
    this.height = 2.0;
    this.radius = 1.8;
    this.anchorY = 1.6;
    this.count = opts.count ?? 0;
    this.add(new THREE.CylinderGeometry(1.9, 2.1, 0.22, 40), this.mat('#3b0764'), [0, 0.11, 0]);
    this.add(new THREE.TorusGeometry(1.95, 0.04, 8, 64), this.glow(this.color, 1.2), [0, 0.23, 0], { rot: [Math.PI / 2, 0, 0], shadow: false });
    const pts = GRAPH_NODES.map(([, p]) => new THREE.Vector3(...p));
    this.nodeMats = GRAPH_NODES.map(([, p, c]) => {
      const m = this.glow(c, 0.6);
      m.userData.noLook = true;
      this.add(new THREE.SphereGeometry(0.2, 18, 12), m, p);
      return m;
    });
    const up = new THREE.Vector3(0, 1, 0);
    this.edges = GRAPH_EDGES.map(([a, b]) => {
      const m = new THREE.MeshStandardMaterial({ color: cEdge, emissive: cEdge, emissiveIntensity: 0.1, roughness: 0.5 });
      m.userData.noLook = true;
      const d = new THREE.Vector3().subVectors(pts[b], pts[a]);
      const mesh = this.add(new THREE.CylinderGeometry(0.035, 0.035, d.length(), 8), m, [0, 0, 0], { shadow: false });
      mesh.position.copy(pts[a]).addScaledVector(d, 0.5);
      mesh.quaternion.setFromUnitVectors(up, d.clone().normalize());
      return { m, a, b, s: 0 };
    });
    this.finish();
  }

  // edges of the recommendation path lit so far
  setCount(n) {
    this.count = n;
  }

  animate(dt, t) {
    const lit = new Set(PATH.slice(0, Math.max(0, Math.round(this.count))));
    const ring = this.state === 'breach';
    const hot = new Set();
    for (const [k, e] of this.edges.entries()) {
      const onPath = lit.has(k);
      const onRing = ring && RING.includes(k);
      const tgt = onPath || onRing ? 1 : 0;
      e.s += (tgt - e.s) * Math.min(1, dt * 5);
      const col = onRing ? cRing : cPath;
      e.m.color.copy(cEdge).lerp(col, e.s);
      e.m.emissive.copy(cEdge).lerp(col, e.s);
      e.m.emissiveIntensity = 0.1 + e.s * (1.2 + 0.4 * Math.sin(t * 6));
      if (tgt) hot.add(e.a).add(e.b);
    }
    for (const [k, m] of this.nodeMats.entries()) m.emissiveIntensity = hot.has(k) ? 1.6 : 0.6;
  }
}
