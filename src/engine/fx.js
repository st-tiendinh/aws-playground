// Visual effects shared by the sandbox and the explore flows: request packets (instanced),
// labelled movers, smoke / sparks / dust particles, ground rings, light beams and floating
// callout texts.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { COLOR } from './palette.js';
import { smokeTexture, softDot } from './textures.js';

const HDR = 2.6;
const ERR = new THREE.Color(COLOR.error).multiplyScalar(HDR);

// quadratic arc between two points, lifted in the middle
export function arc(a, b, lift = null) {
  const d = a.distanceTo(b);
  const c = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  c.y += lift ?? Math.min(5, 0.5 + d * 0.18);
  return { a: a.clone(), c, b: b.clone(), len: d * 1.1 + 0.01 };
}

export function arcPoint(seg, t, out) {
  const u = 1 - t;
  const k0 = u * u;
  const k1 = 2 * u * t;
  const k2 = t * t;
  out.set(
    k0 * seg.a.x + k1 * seg.c.x + k2 * seg.b.x,
    k0 * seg.a.y + k1 * seg.c.y + k2 * seg.b.y,
    k0 * seg.a.z + k1 * seg.c.z + k2 * seg.b.z,
  );
  return out;
}

export function pathFrom(points, lift) {
  const segs = [];
  for (let i = 0; i + 1 < points.length; i++) segs.push(arc(points[i], points[i + 1], lift));
  return segs;
}

// ── many small glowing request packets (one draw call) ───────────────────────
export class PacketSystem {
  constructor(parent, max = 1200) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial(), max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent.add(this.mesh);
    this.items = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this.timeScale = 1;
  }

  // path: list of arc segments; failSeg: index of the segment whose target drops the request
  spawn(path, { color = '#ffffff', speed = 10, size = 1, failSeg = -1, onHop = null, onDone = null } = {}) {
    if (this.items.length >= this.max || !path.length) return null;
    // colours above 1 are HDR: they survive tone mapping as bright glows and feed the bloom
    const it = { path, seg: 0, t: 0, speed, size, color: new THREE.Color(color).multiplyScalar(HDR), failSeg, falling: false, vel: null, life: 0, age: 0, pos: new THREE.Vector3(), onHop, onDone };
    arcPoint(path[0], 0, it.pos);
    this.items.push(it);
    return it;
  }

  update(dt) {
    dt *= this.timeScale;
    const items = this.items;
    let w = 0;
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.age += dt;
      if (it.falling) {
        it.vel.y -= 14 * dt;
        it.pos.addScaledVector(it.vel, dt);
        it.life -= dt;
        if (it.life <= 0) continue;
      } else {
        const seg = it.path[it.seg];
        it.t += (it.speed * dt) / seg.len;
        if (it.t >= 1) {
          it.onHop?.(it.seg, it);
          if (it.seg === it.failSeg) {
            arcPoint(seg, 1, it.pos);
            it.falling = true;
            it.life = 0.9;
            it.color.copy(ERR);
            it.vel = new THREE.Vector3((Math.random() - 0.5) * 3.5, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 3.5);
          } else if (it.seg + 1 < it.path.length) {
            it.seg++;
            it.t = 0;
          } else {
            it.onDone?.(it);
            continue;
          }
        }
        if (!it.falling) arcPoint(it.path[it.seg], Math.min(1, it.t), it.pos);
      }
      items[w++] = it;
      const s = it.size * (it.falling ? Math.max(0.25, it.life / 0.9) : Math.min(1, it.age * 8));
      this._s.setScalar(s);
      this._m.compose(it.pos, this._q, this._s);
      this.mesh.setMatrixAt(n, this._m);
      this.mesh.setColorAt(n, it.color);
      n++;
    }
    items.length = w;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }
}

// ── labelled packets / objects for the explore flows ─────────────────────────
const MOVER_GEO = {
  orb: new THREE.SphereGeometry(0.22, 16, 12),
  cube: new RoundedBoxGeometry(0.5, 0.5, 0.5, 2, 0.08),
  card: new RoundedBoxGeometry(0.62, 0.12, 0.44, 2, 0.04),
  disc: new THREE.CylinderGeometry(0.32, 0.32, 0.12, 24),
};
for (const g of Object.values(MOVER_GEO)) g.userData.shared = true;

export class Movers {
  constructor(parent) {
    this.root = new THREE.Group();
    parent.add(this.root);
    this.items = [];
    this.timeScale = 1;
  }

  // points: Vector3 waypoints. fail: 'drop' (falls at the end) | 'bounce' (rejected, flies back)
  spawn(points, opts = {}) {
    const shape = opts.shape || 'orb';
    const color = new THREE.Color(opts.color || '#fbbf24');
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: shape === 'orb' ? 1.6 : 0.5, roughness: 0.4 });
    const mesh = new THREE.Mesh(MOVER_GEO[shape] || MOVER_GEO.orb, mat);
    mesh.castShadow = shape !== 'orb';
    mesh.scale.setScalar((opts.size || 1) * 0.001);
    const g = new THREE.Group();
    g.add(mesh);
    let label = null;
    if (opts.label) {
      const el = document.createElement('div');
      el.className = 'pkt' + (opts.labelClass ? ' ' + opts.labelClass : '');
      el.textContent = opts.label;
      el.style.setProperty('--c', '#' + color.getHexString());
      label = new CSS2DObject(el);
      label.center.set(0.5, 1.4);
      g.add(label);
    }
    this.root.add(g);
    const it = {
      g,
      mesh,
      mat,
      label,
      path: pathFrom(points, opts.lift),
      seg: 0,
      t: 0,
      delay: opts.delay || 0,
      speed: opts.speed || 7,
      size: opts.size || 1,
      fail: opts.fail || null,
      back: opts.back || null,
      stay: !!opts.stay,
      onArrive: opts.onArrive,
      onHop: opts.onHop,
      phase: 'go',
      age: 0,
    };
    g.visible = it.delay <= 0;
    arcPoint(it.path[0], 0, g.position);
    this.items.push(it);
    return it;
  }

  _finish(it) {
    it.done = true;
    it.g.removeFromParent();
    it.label?.element.remove();
    it.mat.dispose();
  }

  update(dt) {
    dt *= this.timeScale;
    for (const it of this.items) {
      if (it.done) continue;
      if (it.delay > 0) {
        it.delay -= dt;
        if (it.delay > 0) continue;
        it.g.visible = true;
      }
      it.age += dt;
      const grow = Math.min(1, it.age * 6) * it.size;
      if (it.phase === 'go' || it.phase === 'back') {
        it.mesh.scale.setScalar(grow);
        const seg = it.path[it.seg];
        it.t += (it.speed * dt) / seg.len;
        if (it.t >= 1) {
          it.t = 1;
          arcPoint(seg, 1, it.g.position);
          it.onHop?.(it.seg, it);
          if (it.seg + 1 < it.path.length) {
            it.seg++;
            it.t = 0;
          } else if (it.phase === 'go') {
            it.onArrive?.(it);
            if (it.fail === 'drop') {
              it.phase = 'fall';
              it.vel = new THREE.Vector3((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2);
              it.life = 1.1;
              this._tint(it, COLOR.error);
            } else if (it.fail === 'bounce') {
              it.phase = 'bounce';
              it.life = 1.0;
              const s = it.path[it.path.length - 1];
              it.vel = new THREE.Vector3().subVectors(s.c, s.b).setY(0).normalize().multiplyScalar(4);
              it.vel.y = 3;
              this._tint(it, COLOR.error);
            } else if (it.back) {
              it.phase = 'back';
              const pts = [it.path[it.path.length - 1].b, ...it.path.map((s) => s.a).reverse()];
              it.path = pathFrom(pts);
              it.seg = 0;
              it.t = 0;
              if (it.back.color) this._tint(it, it.back.color);
              if (it.label && it.back.label) it.label.element.textContent = it.back.label;
              if (it.back.shape && MOVER_GEO[it.back.shape]) it.mesh.geometry = MOVER_GEO[it.back.shape];
            } else if (it.stay) {
              it.phase = 'stay';
            } else {
              it.phase = 'fade';
              it.life = 0.35;
            }
            continue;
          } else {
            it.back.onArrive?.(it);
            it.phase = 'fade';
            it.life = 0.35;
            continue;
          }
        }
        arcPoint(it.path[it.seg], it.t, it.g.position);
      } else if (it.phase === 'fall' || it.phase === 'bounce') {
        it.vel.y -= 12 * dt;
        it.g.position.addScaledVector(it.vel, dt);
        it.life -= dt;
        it.mesh.scale.setScalar(Math.max(0.05, it.life) * it.size);
        it.mesh.rotation.x += dt * 8;
        if (it.life <= 0) this._finish(it);
      } else if (it.phase === 'fade') {
        it.life -= dt;
        it.mesh.scale.setScalar(Math.max(0.01, it.life / 0.35) * it.size);
        if (it.life <= 0) this._finish(it);
      }
    }
    if (this.items.some((i) => i.done)) this.items = this.items.filter((i) => !i.done);
  }

  _tint(it, c) {
    it.mat.color.set(c);
    it.mat.emissive.set(c);
    if (it.label) it.label.element.style.setProperty('--c', c);
  }

  clear() {
    for (const it of this.items) if (!it.done) this._finish(it);
    this.items = [];
  }
}

// ── point-sprite particles (smoke, dust, sparks, glows) ──────────────────────
const PARTICLE_VS = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  varying float vAlpha;
  varying vec3 vTint;
  uniform float scale;
  void main() {
    vAlpha = alpha;
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const PARTICLE_FS = /* glsl */ `
  uniform sampler2D map;
  varying float vAlpha;
  varying vec3 vTint;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    float a = t.a * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vTint * t.rgb, a);
    #include <colorspace_fragment>
  }
`;

class ParticlePool {
  constructor(parent, max, { texture, additive }) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, scale: { value: 600 } },
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    parent.add(this.points);
    this.parts = [];
  }

  emit(p) {
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push({
      x: p.pos.x,
      y: p.pos.y,
      z: p.pos.z,
      vx: p.vel?.x || 0,
      vy: p.vel?.y || 0,
      vz: p.vel?.z || 0,
      c: new THREE.Color(p.color || '#ffffff'),
      s0: p.size || 1,
      grow: p.grow ?? 1,
      life: p.life || 1,
      age: 0,
      a0: p.alpha ?? 1,
      drag: p.drag ?? 0.5,
      g: p.gravity ?? 0,
      fadeIn: p.fadeIn ?? 0.1,
    });
  }

  update(dt) {
    let n = 0;
    const keep = [];
    for (const p of this.parts) {
      p.age += dt;
      if (p.age >= p.life) continue;
      keep.push(p);
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const u = p.age / p.life;
      const fade = Math.min(1, p.age / Math.max(0.001, p.fadeIn * p.life)) * (1 - u * u);
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = p.c.r;
      this.col[n * 3 + 1] = p.c.g;
      this.col[n * 3 + 2] = p.c.b;
      this.size[n] = p.s0 * (1 + (p.grow - 1) * u);
      this.alpha[n] = p.a0 * fade;
      n++;
    }
    this.parts = keep;
    this.geo.setDrawRange(0, n);
    for (const a of ['position', 'tint', 'size', 'alpha']) this.geo.attributes[a].needsUpdate = true;
  }

  clear() {
    this.parts = [];
    this.geo.setDrawRange(0, 0);
  }
}

// ── the effects layer ────────────────────────────────────────────────────────
export class Fx {
  constructor(parent) {
    this.root = new THREE.Group();
    this.root.name = 'fx';
    parent.add(this.root);
    this.packets = new PacketSystem(this.root);
    this.movers = new Movers(this.root);
    this.smoke = new ParticlePool(this.root, 900, { texture: smokeTexture(), additive: false });
    this.glow = new ParticlePool(this.root, 900, { texture: softDot(), additive: true });
    this.rings = [];
    this.beams = [];
    this.callouts = [];
    this.emitters = new Map();
    this.ringGeo = new THREE.RingGeometry(0.86, 1, 56);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
    this.beamGeo.translate(0, 0.5, 0);
  }

  setViewport(height, fov) {
    const scale = height / (2 * Math.tan((fov * Math.PI) / 360));
    this.smoke.mat.uniforms.scale.value = scale;
    this.glow.mat.uniforms.scale.value = scale;
  }

  // ── one-shot effects ──
  smokePuff(pos, { color = '#4b5563', n = 1, size = 1.4, life = 2.4, spread = 0.4, rise = 1.2, alpha = 0.55 } = {}) {
    for (let i = 0; i < n; i++) {
      this.smoke.emit({
        pos: { x: pos.x + (Math.random() - 0.5) * spread, y: pos.y, z: pos.z + (Math.random() - 0.5) * spread },
        vel: { x: (Math.random() - 0.5) * 0.4, y: rise * (0.7 + Math.random() * 0.6), z: (Math.random() - 0.5) * 0.4 },
        color,
        size: size * (0.7 + Math.random() * 0.6),
        grow: 2.6,
        life: life * (0.7 + Math.random() * 0.6),
        alpha,
        drag: 0.6,
        fadeIn: 0.15,
      });
    }
  }

  sparks(pos, { n = 14, color = '#ffb347', speed = 4, life = 0.7, size = 0.35 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random();
      this.glow.emit({
        pos,
        vel: { x: Math.cos(a) * speed * Math.random(), y: up * speed, z: Math.sin(a) * speed * Math.random() },
        color,
        size: size * (0.6 + Math.random() * 0.8),
        grow: 0.3,
        life: life * (0.6 + Math.random() * 0.7),
        alpha: 1,
        drag: 1.2,
        gravity: -9,
        fadeIn: 0.01,
      });
    }
  }

  dust(center, { w = 8, d = 6, n = 40, color = '#a68a64' } = {}) {
    for (let i = 0; i < n; i++) {
      this.smoke.emit({
        pos: { x: center.x + (Math.random() - 0.5) * w, y: center.y + 0.2, z: center.z + (Math.random() - 0.5) * d },
        vel: { x: (Math.random() - 0.5) * 2.4, y: 0.8 + Math.random() * 1.8, z: (Math.random() - 0.5) * 2.4 },
        color,
        size: 1.6 + Math.random() * 1.6,
        grow: 2.2,
        life: 2 + Math.random() * 1.5,
        alpha: 0.5,
        drag: 0.9,
        fadeIn: 0.05,
      });
    }
  }

  glowBurst(pos, { color = '#ffffff', size = 3, life = 0.6, n = 1 } = {}) {
    for (let i = 0; i < n; i++) this.glow.emit({ pos, color, size, grow: 2, life, alpha: 0.9, fadeIn: 0.05 });
  }

  ring(pos, { color = '#38bdf8', r0 = 0.5, r1 = 3, dur = 1.1, y = 0.06, opacity = 0.85 } = {}) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(this.ringGeo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, pos.y + y, pos.z);
    this.root.add(mesh);
    this.rings.push({ mesh, m, t: 0, r0, r1, dur, opacity });
  }

  beam(pos, { color = '#7dd3fc', r = 0.9, h = 14, dur = 1.2, opacity = 0.45 } = {}) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(this.beamGeo, m);
    mesh.position.copy(pos);
    mesh.scale.set(r, h, r);
    this.root.add(mesh);
    this.beams.push({ mesh, m, t: 0, dur, opacity, r });
  }

  callout(pos, text, { kind = 'info', dur = 1.8, rise = 1.4 } = {}) {
    const el = document.createElement('div');
    el.className = `callout callout--${kind}`;
    el.textContent = text;
    el.style.animationDuration = dur + 's';
    const obj = new CSS2DObject(el);
    obj.position.copy(pos);
    obj.center.set(0.5, 1);
    this.root.add(obj);
    this.callouts.push({ obj, t: 0, dur, rise, y0: pos.y });
  }

  // continuous emitters, e.g. smoke rising from a broken server
  setEmitter(key, opts) {
    if (!opts) {
      this.emitters.delete(key);
      return;
    }
    const prev = this.emitters.get(key);
    this.emitters.set(key, { acc: prev ? prev.acc : 0, ...opts });
  }

  update(dt) {
    for (const [key, e] of this.emitters) {
      e.acc += dt * e.rate;
      const pos = typeof e.pos === 'function' ? e.pos() : e.pos;
      if (!pos) {
        this.emitters.delete(key);
        continue;
      }
      while (e.acc >= 1) {
        e.acc -= 1;
        if (e.kind === 'smoke') this.smokePuff(pos, { color: e.color || '#374151', size: e.size || 1.2, alpha: e.alpha ?? 0.5, rise: e.rise ?? 1.3 });
        else if (e.kind === 'sparks') this.sparks(pos, { n: 4, size: 0.3, speed: 3 });
        else if (e.kind === 'heat') this.smokePuff(pos, { color: '#ff7a45', size: 0.7, alpha: 0.18, rise: 1.6, life: 1.2 });
        else if (e.kind === 'glow') this.glowBurst(pos, { color: e.color, size: e.size || 1.5, life: 0.5 });
      }
    }
    this.packets.update(dt);
    this.movers.update(dt);
    this.smoke.update(dt);
    this.glow.update(dt);
    this.rings = this.rings.filter((r) => {
      r.t += dt / r.dur;
      if (r.t >= 1) {
        r.mesh.removeFromParent();
        r.m.dispose();
        return false;
      }
      const s = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - r.t, 2));
      r.mesh.scale.setScalar(s);
      r.m.opacity = r.opacity * (1 - r.t);
      return true;
    });
    this.beams = this.beams.filter((b) => {
      b.t += dt / b.dur;
      if (b.t >= 1) {
        b.mesh.removeFromParent();
        b.m.dispose();
        return false;
      }
      b.m.opacity = b.opacity * Math.sin(Math.PI * b.t);
      const s = b.r * (1 - b.t * 0.6);
      b.mesh.scale.x = b.mesh.scale.z = s;
      return true;
    });
    this.callouts = this.callouts.filter((c) => {
      c.t += dt;
      if (c.t >= c.dur) {
        c.obj.removeFromParent();
        c.obj.element.remove();
        return false;
      }
      c.obj.position.y = c.y0 + (c.t / c.dur) * c.rise;
      return true;
    });
  }

  clear() {
    this.packets.clear();
    this.movers.clear();
    this.smoke.clear();
    this.glow.clear();
    for (const r of this.rings) {
      r.mesh.removeFromParent();
      r.m.dispose();
    }
    for (const b of this.beams) {
      b.mesh.removeFromParent();
      b.m.dispose();
    }
    for (const c of this.callouts) {
      c.obj.removeFromParent();
      c.obj.element.remove();
    }
    this.rings = [];
    this.beams = [];
    this.callouts = [];
    this.emitters.clear();
  }
}
