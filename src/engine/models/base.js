// Base class for every 3D service model. A model owns a group (placed in the world) and an
// inner `body` that the base class animates: build-up when it appears, sinking when it is
// removed, tilting/darkening when it breaks, a translucent "ghost" look for standbys and a
// glow when hovered. Subclasses only build geometry and add their own idle animation.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const GRAY = new THREE.Color('#4b5563');
const HL = new THREE.Color('#ffffff');
const tmp = new THREE.Color();

export const easeOutBack = (x) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export class Model {
  constructor(kind, opts = {}) {
    this.kind = kind;
    this.opts = opts;
    this.id = opts.id || kind;
    this.category = opts.category || 'foundation';
    this.group = new THREE.Group();
    this.group.name = this.id;
    this.group.userData.model = this;
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.height = 2;
    this.radius = 1;
    this.state = 'ok';
    this.time = Math.random() * 100;
    this.highlighted = false;
    this.selected = false;
    this.ghost = false;
    this._mats = [];
    this._fail = 0;
    this._ghost = 0;
    this._hl = 0;
    this._lookDirty = true;
    this._spawn = 1;
    this._spawnDur = 0.9;
    this._despawn = null;
    this._tilt = 0;
    this._tiltDir = Math.random() < 0.5 ? -1 : 1;
    this.tiltAmount = 0.2;
    this._jolt = 0;
    this.label = null;
    this._labelSub = null;
    if (opts.position) this.group.position.set(...opts.position);
    if (opts.rotation) this.group.rotation.y = opts.rotation;
    if (opts.scale) this.group.scale.setScalar(opts.scale);
  }

  // ── building helpers ──
  mat(color, o = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08, ...o });
  }

  glow(color, intensity = 1.6, o = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.4,
      metalness: 0,
      ...o,
    });
  }

  add(geo, material, pos = [0, 0, 0], o = {}) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(...pos);
    if (o.rot) m.rotation.set(...o.rot);
    if (o.scale) m.scale.set(...o.scale);
    m.castShadow = o.shadow !== false;
    m.receiveShadow = true;
    (o.parent || this.body).add(m);
    return m;
  }

  // call once the geometry is built: remembers base colours for the state looks
  finish() {
    const seen = new Set();
    this.body.traverse((o) => {
      const list = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of list) {
        if (seen.has(m) || m.userData.noLook) continue;
        seen.add(m);
        this._mats.push({
          m,
          color: m.color ? m.color.clone() : null,
          emissive: m.emissive ? m.emissive.clone() : null,
          ei: m.emissiveIntensity ?? 0,
          opacity: m.opacity,
          transparent: m.transparent,
          depthWrite: m.depthWrite,
        });
      }
    });
    return this;
  }

  // ── labels ──
  setLabel(title, sub = '', opts = {}) {
    if (!this.label) {
      const el = document.createElement('div');
      el.className = 'lbl';
      el.innerHTML = '<span class="lbl-dot"></span><span class="lbl-text"><b></b><small></small></span>';
      this.label = new CSS2DObject(el);
      this.label.center.set(0.5, 1);
      this.group.add(this.label);
      this._labelEl = el;
    }
    const el = this._labelEl;
    el.style.setProperty('--c', opts.color || this.color || '#94a3b8');
    el.classList.toggle('lbl--small', !!opts.small);
    el.classList.toggle('lbl--zone', !!opts.zone);
    el.querySelector('b').textContent = title;
    this.setLabelSub(sub);
    this.label.position.set(0, opts.y ?? this.height + 0.45, 0);
    return this.label;
  }

  setLabelSub(sub) {
    if (!this._labelEl || sub === this._labelSub) return;
    this._labelSub = sub;
    const s = this._labelEl.querySelector('small');
    s.textContent = sub || '';
    s.style.display = sub ? '' : 'none';
  }

  setLabelState(kind) {
    if (!this._labelEl || this._labelState === kind) return;
    if (this._labelState) this._labelEl.classList.remove('lbl--' + this._labelState);
    this._labelState = kind;
    if (kind) this._labelEl.classList.add('lbl--' + kind);
  }

  setLabelVisible(v) {
    this.labelWanted = v;
    if (this.label && !this._despawn) this.label.visible = v;
  }

  // ── state ──
  setState(s) {
    if (s === this.state) return;
    const was = this.state;
    this.state = s;
    if (s === 'failed') this._jolt = 1;
    this.onState?.(s, was);
  }

  setGhost(v) {
    this.ghost = !!v;
  }

  spawn(delay = 0) {
    this._spawn = -delay / this._spawnDur;
    this._despawn = null;
    this.body.scale.set(1, 0.001, 1);
    if (this.label) this.label.visible = this.labelWanted !== false;
  }

  despawn(onDone) {
    if (this._despawn) return;
    this._despawn = { t: 0, onDone };
    if (this.label) this.label.visible = false;
  }

  get removing() {
    return !!this._despawn;
  }

  // world position packets fly to/from (top centre)
  anchor(out = new THREE.Vector3(), lift = 0) {
    this.group.updateWorldMatrix(true, false);
    out.set(0, (this.anchorY ?? this.height * 0.75) + lift, 0);
    return this.group.localToWorld(out);
  }

  // ── per frame ──
  update(dt) {
    this.time += dt;
    const failed = this.state === 'failed';
    const fTarget = failed ? 1 : this.state === 'off' ? 0.55 : 0;
    const gTarget = this.ghost ? 1 : 0;
    const hTarget = this.highlighted || this.selected ? 1 : 0;
    const step = (cur, tgt, speed) => {
      const d = tgt - cur;
      if (Math.abs(d) < 0.002) return tgt;
      return cur + d * Math.min(1, dt * speed);
    };
    const f = step(this._fail, fTarget, 4);
    const g = step(this._ghost, gTarget, 5);
    const h = step(this._hl, hTarget, 10);
    if (f !== this._fail || g !== this._ghost || h !== this._hl || this._lookDirty) {
      this._fail = f;
      this._ghost = g;
      this._hl = h;
      this._lookDirty = false;
      this._applyLook();
    }

    // build-up / removal
    let sy = 1;
    let py = 0;
    if (this._spawn < 1) {
      this._spawn += dt / this._spawnDur;
      const s = Math.max(0, Math.min(1, this._spawn));
      sy = Math.max(0.001, easeOutBack(s));
    }
    if (this._despawn) {
      this._despawn.t += dt / 0.7;
      const s = Math.min(1, this._despawn.t);
      sy = Math.max(0.001, 1 - easeInOut(s));
      py = -0.3 * s;
      if (s >= 1 && !this._despawn.fired) {
        this._despawn.fired = true;
        this._despawn.onDone?.(this);
      }
    }
    this.body.scale.y = sy;
    this.body.position.y = py;

    // broken models lean over and twitch once
    const tiltTarget = failed ? this.tiltAmount * this._tiltDir : 0;
    this._tilt += (tiltTarget - this._tilt) * Math.min(1, dt * 3);
    this._jolt = Math.max(0, this._jolt - dt * 1.6);
    const j = this._jolt * this._jolt;
    this.body.rotation.z = this._tilt + Math.sin(this.time * 55) * 0.06 * j;
    this.body.rotation.x = this._tilt * 0.35 + Math.cos(this.time * 47) * 0.04 * j;
    this.animate?.(dt, this.time);
  }

  _applyLook() {
    const f = this._fail;
    const g = this._ghost;
    const h = this._hl;
    for (const e of this._mats) {
      const m = e.m;
      if (e.color) {
        m.color.copy(e.color).lerp(GRAY, f * 0.7).multiplyScalar(1 - f * 0.45);
      }
      if (e.emissive) {
        tmp.copy(e.emissive);
        m.emissive.copy(tmp).lerp(HL, h * 0.35);
        m.emissiveIntensity = e.ei * (1 - f * 0.92) + h * 0.35;
      }
      const ghostly = g > 0.01;
      const transparent = e.transparent || ghostly;
      if (m.transparent !== transparent) {
        // transparency is baked into the shader program: rebuild it
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = e.opacity * (1 - g * 0.62);
      m.depthWrite = ghostly ? g < 0.5 && e.depthWrite : e.depthWrite;
    }
  }

  dispose() {
    if (this.label) {
      this.label.removeFromParent();
      this._labelEl?.remove();
    }
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      const list = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of list) {
        if (m.userData.shared) continue;
        for (const t of [m.map, m.emissiveMap]) if (t && !t.userData.shared) t.dispose();
        m.dispose();
      }
    });
  }
}

// rounded rectangle shape centred on the origin (x = width, y = depth)
export function roundedRect(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// flat slab with rounded corners, top face at y = 0
export function slabGeometry(w, d, h, r, bevel = 0.12) {
  const geo = new THREE.ExtrudeGeometry(roundedRect(w - bevel * 2, d - bevel * 2, Math.max(0.01, r - bevel)), {
    depth: Math.max(0.01, h - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -h + bevel, 0);
  // ExtrudeGeometry UVs are in shape units; map the top face into 0..1
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / d + 0.5);
  return geo;
}

// closed outline of a rounded rectangle on the XZ plane (for dashed boundaries)
export function roundedRectPoints(w, d, r, y = 0, segs = 8) {
  const pts = [];
  const hw = w / 2;
  const hd = d / 2;
  const corners = [
    [hw - r, hd - r, 0],
    [-hw + r, hd - r, Math.PI / 2],
    [-hw + r, -hd + r, Math.PI],
    [hw - r, -hd + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (i / segs) * (Math.PI / 2);
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
    }
  }
  pts.push(pts[0].clone());
  return pts;
}
