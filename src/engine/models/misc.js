// Supporting models: the crowd of users, a single user, AZ / Region platforms, dashed
// boundaries (VPC, Auto Scaling group), subnet tiles, the globe, generic tokens (files,
// AMIs, messages…) and the explore-only services: CloudWatch, SQS and IAM.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CAT_COLOR, COLOR } from '../palette.js';
import { crackTexture, gridTexture, textTexture, windowsTexture, worldTexture } from '../textures.js';
import { Model, roundedRect, roundedRectPoints, slabGeometry } from './base.js';

const SHIRTS = ['#60a5fa', '#f472b6', '#facc15', '#34d399', '#fb923c', '#a78bfa', '#f87171', '#2dd4bf', '#e2e8f0'];
const SKIN = ['#f5d0b5', '#e8b996', '#c98e6b', '#9c6b4e'];
const UP = new THREE.Vector3(0, 1, 0);

// ── crowd of users on a floating island ─────────────────────────────────────
const CROWD_MAX = 560;
export class UsersModel extends Model {
  constructor(opts = {}) {
    super('users', { category: 'users', ...opts });
    this.color = CAT_COLOR.users;
    this.height = 1.3;
    this.radius = 6;
    this.anchorY = 1.0;
    const R = opts.radius || 6;
    this.islandR = R;
    this.add(new THREE.CylinderGeometry(R, R - 0.6, 0.9, 56), [this.mat('#cfd9ea'), this.mat('#eef3fb'), this.mat('#eef3fb')], [0, -0.45, 0]);
    this.add(new THREE.TorusGeometry(R, 0.06, 8, 96), this.glow('#7dd3fc', 1.4), [0, 0.0, 0], { rot: [Math.PI / 2, 0, 0], shadow: false });
    const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.34, 4, 10);
    bodyGeo.translate(0, 0.34, 0);
    const headGeo = new THREE.SphereGeometry(0.15, 14, 10);
    headGeo.translate(0, 0.83, 0);
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const headMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    bodyMat.userData.noLook = headMat.userData.noLook = true;
    this.bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, CROWD_MAX);
    this.heads = new THREE.InstancedMesh(headGeo, headMat, CROWD_MAX);
    for (const m of [this.bodies, this.heads]) {
      m.castShadow = true;
      m.count = 0;
      this.body.add(m);
    }
    this.people = [];
    const c = new THREE.Color();
    for (let i = 0; i < CROWD_MAX; i++) {
      const r = 0.38 * Math.sqrt(i + 1.5);
      const a = i * 2.39996;
      this.people.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, ph: Math.random() * 10, s: 0, skin: SKIN[i % SKIN.length], rot: Math.random() * 6 });
      this.bodies.setColorAt(i, c.set(SHIRTS[(i * 7) % SHIRTS.length]));
      this.heads.setColorAt(i, c.set(SKIN[(i * 3) % SKIN.length]));
    }
    this.target = 0;
    this.mood = 'ok';
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._angry = new THREE.Color('#ff6b6b');
    this._skin = new THREE.Color();
    this._moodT = 0;
    this.finish();
  }

  // users online → visible people (≈ users^0.45, so 10k ≈ 63, 1M ≈ 500)
  setUsers(users) {
    this.target = Math.max(1, Math.min(CROWD_MAX, Math.round(Math.pow(Math.max(1, users), 0.45))));
  }

  setCount(n) {
    this.target = Math.max(0, Math.min(CROWD_MAX, n));
  }

  setMood(m) {
    if (m === this.mood) return;
    this.mood = m;
    this._moodDirty = true;
  }

  // a random visible person's position (packets start there)
  randomPerson(out) {
    const n = Math.max(1, Math.min(this.target, CROWD_MAX));
    const p = this.people[Math.floor(Math.random() * n)];
    out.set(p.x, 0.9, p.z);
    return this.group.localToWorld(out);
  }

  animate(dt, t) {
    const angry = this.mood === 'angry';
    const slow = this.mood === 'slow';
    let n = 0;
    for (let i = 0; i < CROWD_MAX; i++) {
      const p = this.people[i];
      const want = i < this.target ? 1 : 0;
      if (p.s === 0 && want === 0) continue;
      p.s += (want - p.s) * Math.min(1, dt * (want ? 5 + (i % 7) : 4));
      if (p.s < 0.01 && !want) {
        p.s = 0;
        continue;
      }
      const outside = Math.hypot(p.x, p.z) > this.islandR - 0.3;
      const jump = angry ? Math.abs(Math.sin(t * 7 + p.ph)) * 0.32 : Math.abs(Math.sin(t * 2.2 + p.ph)) * (slow ? 0.03 : 0.07);
      this._p.set(p.x, (outside ? -0.18 : 0) + jump, p.z);
      this._q.setFromAxisAngle(UP, p.rot + (angry ? Math.sin(t * 9 + p.ph) * 0.5 : 0));
      this._s.setScalar(p.s);
      this._m.compose(this._p, this._q, this._s);
      this.bodies.setMatrixAt(n, this._m);
      this.heads.setMatrixAt(n, this._m);
      if (this._moodDirty || angry) {
        this._skin.set(SKIN[(i * 3) % SKIN.length]);
        if (angry) this._skin.lerp(this._angry, 0.55 + 0.2 * Math.sin(t * 6 + p.ph));
        this.heads.setColorAt(n, this._skin);
      }
      n++;
    }
    this._moodDirty = false;
    this.bodies.count = n;
    this.heads.count = n;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
  }
}

// ── one person at a laptop (explore flows) ───────────────────────────────────
export class PersonModel extends Model {
  constructor(opts = {}) {
    super('user', { category: 'users', ...opts });
    this.color = CAT_COLOR.users;
    this.height = 1.9;
    this.radius = 0.9;
    this.anchorY = 1.1;
    const shirt = this.mat(opts.shirt || '#60a5fa');
    this.add(new THREE.CylinderGeometry(0.75, 0.85, 0.16, 28), this.mat('#dbe4f2'), [0, 0.08, 0]);
    this.add(new THREE.CapsuleGeometry(0.3, 0.55, 6, 12), shirt, [0, 0.75, 0]);
    this.add(new THREE.SphereGeometry(0.27, 20, 14), this.mat(opts.skin || '#f5d0b5'), [0, 1.48, 0]);
    this.add(new THREE.SphereGeometry(0.285, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2.2), this.mat('#3f2a1d'), [0, 1.52, 0]);
    // laptop in front, screen facing the person (and the camera behind them)
    this.add(new THREE.BoxGeometry(0.42, 0.035, 0.62), this.mat('#94a3b8', { metalness: 0.5 }), [0.5, 0.9, 0]);
    this.add(new THREE.BoxGeometry(0.03, 0.42, 0.62), this.mat('#334155'), [0.72, 1.12, 0]);
    this.screen = this.glow('#7dd3fc', 1.2);
    this.add(new THREE.PlaneGeometry(0.56, 0.36), this.screen, [0.70, 1.12, 0], { rot: [0, -Math.PI / 2, 0], shadow: false });
    this.finish();
  }
}

// ── data-centre building (inside AZs) ───────────────────────────────────────
function building(model, x, z, w, h, d) {
  const win = windowsTexture();
  const side = new THREE.MeshStandardMaterial({ map: win, emissive: '#ffffff', emissiveMap: win, emissiveIntensity: 0.35, roughness: 0.6 });
  const top = model.mat('#3d4a63');
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = model.add(geo, [side, side, top, top, side, side], [x, h / 2, z]);
  model.add(new THREE.BoxGeometry(w * 0.3, 0.18, d * 0.3), model.mat('#9aa6b8', { metalness: 0.5 }), [x - w * 0.2, h + 0.09, z]);
  model.add(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 16), model.mat('#9aa6b8', { metalness: 0.5 }), [x + w * 0.22, h + 0.11, z]);
  return { mesh, mat: side };
}

// ── Availability Zone / generic zone platform ───────────────────────────────
export class ZoneModel extends Model {
  constructor(opts = {}) {
    super(opts.kind || 'az', { category: 'foundation', ...opts });
    const w = opts.w || 10;
    const d = opts.d || 6;
    this.w = w;
    this.d = d;
    this.color = opts.color || '#64748b';
    this.height = 0.3;
    this.radius = Math.max(w, d) / 2;
    this.anchorY = 0.3;
    this.tiltAmount = 0.035;
    const grid = gridTexture('rgba(90,110,150,0.13)', opts.top || COLOR.azTop);
    grid.repeat.set(w / 2.5, d / 2.5);
    this.topMat = new THREE.MeshStandardMaterial({ map: grid, roughness: 0.85 });
    const side = this.mat(opts.side || '#a4b2ca');
    this.slab = this.add(slabGeometry(w, d, opts.thick || 0.45, 0.7, 0.1), [this.topMat, side], [0, 0, 0], { shadow: false });
    this.slab.receiveShadow = true;
    this.buildings = [];
    if (opts.buildings) {
      const n = opts.buildings === true ? 3 : opts.buildings;
      for (let k = 0; k < n; k++) {
        if (opts.buildingsAt === 'right') {
          const z = n === 1 ? 0 : -d / 2 + 1.6 + (k * (d - 3.2)) / (n - 1);
          this.buildings.push(building(this, w / 2 - 1.05, z, 1.2, 1.0 + (k % 2) * 0.45, 1.5));
        } else {
          const x = -w / 2 + 1.4 + k * 1.9;
          this.buildings.push(building(this, x, -d / 2 + 0.85, 1.4, 1.1 + (k % 2) * 0.5, 0.9));
        }
      }
    }
    // earthquake damage overlay
    this.crackMat = new THREE.MeshBasicMaterial({ map: crackTexture(opts.seed || 3), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.crackMat.userData.noLook = true;
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.95, d * 0.95), this.crackMat);
    crack.rotation.x = -Math.PI / 2;
    crack.position.y = 0.025;
    this.body.add(crack);
    this._crack = 0;
    this.finish();
  }

  animate(dt, t) {
    const target = this.state === 'failed' ? 1 : 0;
    this._crack += (target - this._crack) * Math.min(1, dt * (target ? 2.5 : 1.2));
    this.crackMat.opacity = this._crack * (0.85 + 0.15 * Math.sin(t * 5));
    this.body.position.y = -0.25 * this._crack;
    for (const b of this.buildings) {
      b.mat.emissiveIntensity = this.state === 'failed' ? (Math.random() < 0.04 ? 0.5 : 0.02) : this.night ? 1.1 : 0.35;
    }
  }
}

// ── the big Region platform floating on clouds ───────────────────────────────
export class RegionModel extends Model {
  constructor(opts = {}) {
    super('region', { category: 'foundation', ...opts });
    const w = opts.w || 30;
    const d = opts.d || 26;
    this.color = '#7c8db0';
    this.height = 0.2;
    this.radius = Math.max(w, d) / 2;
    const grid = gridTexture('rgba(70,90,130,0.10)', COLOR.platformTop);
    grid.repeat.set(w / 4, d / 4);
    const top = new THREE.MeshStandardMaterial({ map: grid, roughness: 0.9 });
    this.add(slabGeometry(w, d, 1.3, 2.2, 0.3), [top, this.mat(COLOR.platformSide)], [0, 0, 0], { shadow: false }).receiveShadow = true;
    const pts = roundedRectPoints(w - 0.1, d - 0.1, 2.0, 0.02, 10);
    const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#a5b8e3' }));
    this.body.add(edge);
    this.finish();
  }
}

// ── dashed boundary drawn with small flat bars (VPC, Auto Scaling group) ─────
export class OutlineModel extends Model {
  constructor(opts = {}) {
    super(opts.kind || 'outline', { category: opts.category || 'network', ...opts });
    this.color = opts.color || '#8C4FFF';
    this.height = 0.2;
    this.w = opts.w;
    this.d = opts.d;
    const pts = roundedRectPoints(opts.w, opts.d, opts.r ?? 1.2, 0.06, 10).slice(0, -1);
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.len = this.curve.getLength();
    this.dash = opts.dash || 0.55;
    this.gap = opts.gap || 0.35;
    this.n = Math.floor(this.len / (this.dash + this.gap));
    this.dashMat = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: opts.opacity ?? 0.95, toneMapped: false });
    this.dashMat.userData.noLook = true;
    this.dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, opts.thick || 0.13), this.dashMat, this.n);
    this.body.add(this.dashes);
    if (opts.fill) {
      const fillMat = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: opts.fill, depthWrite: false });
      fillMat.userData.noLook = true;
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(opts.w, opts.d, opts.r ?? 1.2)), fillMat);
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = 0.03;
      this.body.add(fill);
      this.fillMat = fillMat;
      this.fillBase = opts.fill;
    }
    this.offset = 0;
    this.speed = opts.speed || 0;
    this._m = new THREE.Matrix4();
    this._layout();
    this.finish();
  }

  _layout() {
    const step = this.dash + this.gap;
    const p = new THREE.Vector3();
    const tng = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(this.dash, 1, 1);
    for (let k = 0; k < this.n; k++) {
      const u = (((k * step + this.offset) % this.len) + this.len) % this.len / this.len;
      this.curve.getPointAt(u, p);
      this.curve.getTangentAt(u, tng);
      q.setFromAxisAngle(UP, Math.atan2(-tng.z, tng.x));
      this._m.compose(p, q, s);
      this.dashes.setMatrixAt(k, this._m);
    }
    this.dashes.instanceMatrix.needsUpdate = true;
  }

  animate(dt, t) {
    if (this.speed) {
      this.offset += dt * this.speed;
      this._layout();
    }
    if (this.fillMat) this.fillMat.opacity = this.fillBase * (1 + (this.flash || 0) * 3);
    this.flash = Math.max(0, (this.flash || 0) - dt * 1.5);
  }
}

// ── flat tinted tile (public / private subnet) ───────────────────────────────
export class TileModel extends Model {
  constructor(opts = {}) {
    super(opts.kind || 'subnet', { category: 'network', ...opts });
    this.color = opts.color || COLOR.publicSubnet;
    this.height = 0.1;
    const m = new THREE.MeshStandardMaterial({ color: this.color, transparent: true, opacity: opts.opacity ?? 0.55, roughness: 0.9, depthWrite: false });
    const tile = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(opts.w, opts.d, 0.5)), m);
    tile.rotation.x = -Math.PI / 2;
    tile.position.y = 0.035;
    tile.receiveShadow = true;
    this.body.add(tile);
    const border = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(roundedRectPoints(opts.w, opts.d, 0.5, 0.04, 6)),
      new THREE.LineBasicMaterial({ color: opts.border || '#64748b', transparent: true, opacity: 0.6 }),
    );
    this.body.add(border);
    if (opts.text) this.body.add(floorText(opts.text, { color: opts.textColor || opts.border, at: opts.textAt, size: opts.textSize }));
    this.finish();
  }
}

// words painted on the floor, e.g. "PUBLIC SUBNET" (never overlaps the floating labels)
export function floorText(text, { color = '#334155', at = [0, 0, 0], size = 0.7, rot = 0 } = {}) {
  const w = Math.max(256, text.length * 46);
  const tex = textTexture(text, { color, w, h: 96, font: '800 64px "Be Vietnam Pro", sans-serif' });
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
  m.userData.noLook = true;
  const aspect = w / 96;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size * aspect, size), m);
  mesh.rotation.set(-Math.PI / 2, 0, rot);
  mesh.position.set(at[0], (at[1] ?? 0) + 0.05, at[2]);
  mesh.renderOrder = 1;
  return mesh;
}

// ── globe with AWS Region pins (Region & AZ lesson) ──────────────────────────
export const REGION_PINS = {
  singapore: { lat: 1.35, lon: 103.8, name: 'Singapore' },
  tokyo: { lat: 35.7, lon: 139.7, name: 'Tokyo' },
  virginia: { lat: 38.9, lon: -77.4, name: 'N. Virginia' },
  oregon: { lat: 45.8, lon: -119.7, name: 'Oregon' },
  frankfurt: { lat: 50.1, lon: 8.7, name: 'Frankfurt' },
  saopaulo: { lat: -23.5, lon: -46.6, name: 'São Paulo' },
  sydney: { lat: -33.9, lon: 151.2, name: 'Sydney' },
  mumbai: { lat: 19.1, lon: 72.9, name: 'Mumbai' },
};

export class GlobeModel extends Model {
  constructor(opts = {}) {
    super('globe', { category: 'foundation', ...opts });
    const R = opts.radius || 3;
    this.R = R;
    this.color = '#38bdf8';
    this.height = R * 2 + 0.5;
    this.radius = R;
    this.anchorY = R + 0.5;
    this.spin = new THREE.Group();
    this.spin.position.y = R + 0.4;
    this.body.add(this.spin);
    const earth = new THREE.MeshStandardMaterial({ map: worldTexture(), roughness: 0.8, emissive: '#0b1e44', emissiveIntensity: 0.35 });
    this.add(new THREE.SphereGeometry(R, 64, 40), earth, [0, 0, 0], { parent: this.spin });
    const atmo = new THREE.MeshBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.12, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false });
    atmo.userData.noLook = true;
    const a = new THREE.Mesh(new THREE.SphereGeometry(R * 1.08, 48, 32), atmo);
    a.position.y = R + 0.4;
    this.body.add(a);
    this.pins = {};
    for (const [key, p] of Object.entries(REGION_PINS)) {
      const phi = ((90 - p.lat) * Math.PI) / 180;
      const theta = ((p.lon + 180) * Math.PI) / 180;
      const dir = new THREE.Vector3(-Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      const pin = new THREE.Group();
      pin.position.copy(dir).multiplyScalar(R);
      pin.quaternion.setFromUnitVectors(UP, dir);
      const hot = key === (opts.highlight || 'singapore');
      this.add(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), this.mat('#e2e8f0'), [0, 0.21, 0], { parent: pin, shadow: false });
      const headMat = this.glow(hot ? '#fb923c' : '#facc15', hot ? 2.4 : 1.4);
      this.add(new THREE.SphereGeometry(hot ? 0.13 : 0.09, 14, 10), headMat, [0, 0.45, 0], { parent: pin, shadow: false });
      this.spin.add(pin);
      this.pins[key] = pin;
    }
    // turn the highlighted region towards the default camera (from -x, +z)
    const d = this.pins[opts.highlight || 'singapore'].position;
    this.baseRot = Math.atan2(-0.45, 0.9) - Math.atan2(d.x, d.z);
    this.spin.rotation.y = this.baseRot;
    this.add(new THREE.CylinderGeometry(1.2, 1.5, 0.3, 32), this.mat('#334155'), [0, 0.15, 0]);
    this.add(new THREE.CylinderGeometry(0.15, 0.25, 0.4, 12), this.mat('#64748b'), [0, 0.45, 0]);
    this.finish();
  }

  pinWorld(key, out = new THREE.Vector3()) {
    const pin = this.pins[key];
    pin.updateWorldMatrix(true, false);
    return pin.localToWorld(out.set(0, 0.5, 0));
  }

  animate(dt, t) {
    this.spin.rotation.y = this.baseRot + Math.sin(t * 0.15) * 0.35;
  }
}

// ── token: cube / disc / card with text (files, AMIs, messages, keys…) ──────
export class TokenModel extends Model {
  constructor(opts = {}) {
    super(opts.kind || 'token', { category: opts.category || 'foundation', ...opts });
    this.color = opts.color || '#94a3b8';
    const shape = opts.shape || 'cube';
    const text = opts.text || '';
    const map = text ? textTexture(text, { color: opts.textColor || '#ffffff', bg: opts.color || '#475569', font: `800 ${opts.fontSize || 110}px "Be Vietnam Pro", sans-serif` }) : null;
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', map, roughness: 0.45, emissive: opts.glow ? this.color : '#000000', emissiveIntensity: opts.glow ? 0.25 : 0 });
    if (!map) m.color.set(this.color);
    const size = opts.size || 0.8;
    if (shape === 'disc') {
      const side = this.mat(this.color);
      this.add(new THREE.CylinderGeometry(size * 0.6, size * 0.6, size * 0.22, 32), [side, m, side], [0, size * 0.11 + 0.02, 0]);
      this.height = size * 0.3;
    } else if (shape === 'card') {
      this.add(new RoundedBoxGeometry(size, size * 0.12, size * 1.25, 2, 0.04), m, [0, size * 0.06 + 0.02, 0]);
      this.height = size * 0.2;
    } else {
      this.add(new RoundedBoxGeometry(size, size, size, 3, size * 0.12), m, [0, size / 2 + 0.02, 0]);
      this.height = size;
    }
    this.radius = size;
    this.anchorY = this.height * 0.6;
    this.bob = opts.bob ?? 0;
    this.faceMat = m;
    this.flashColor = new THREE.Color();
    this.flashT = 0;
    this.finish();
  }

  // allow / deny verdict in the explore flows (WAF, Shield, Secrets Manager, Cognito…)
  flash(kind) {
    this.flashColor.set(kind === 'allow' ? COLOR.ok : COLOR.bad);
    this.flashT = 1;
  }

  animate(dt, t) {
    if (this.bob) {
      this.body.position.y += Math.sin(t * 2) * this.bob;
      this.body.rotation.y = t * 0.6;
    }
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 1.5);
      this.faceMat.emissive.copy(this.flashColor);
      this.faceMat.emissiveIntensity = 0.25 + this.flashT;
      if (this.flashT === 0) this._lookDirty = true;
    }
  }
}

// ── CloudWatch: monitor with a live chart and an alarm light ─────────────────
export class CloudWatchModel extends Model {
  constructor(opts = {}) {
    super('cloudwatch', { category: 'management', ...opts });
    this.color = CAT_COLOR.management;
    this.height = 2.5;
    this.radius = 1.2;
    this.anchorY = 1.4;
    this.add(new THREE.CylinderGeometry(0.6, 0.75, 0.2, 24), this.mat('#3f1530'), [0, 0.1, 0]);
    this.add(new THREE.CylinderGeometry(0.08, 0.1, 0.7, 10), this.mat('#94a3b8'), [0, 0.5, 0]);
    this.add(new RoundedBoxGeometry(2.0, 1.3, 0.14, 2, 0.06), this.mat('#1e1b2e'), [0, 1.45, 0]);
    this.add(new RoundedBoxGeometry(2.06, 0.12, 0.18, 2, 0.04), this.mat(this.color), [0, 2.1, 0]);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 160;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    scr.userData.noLook = true;
    this.add(new THREE.PlaneGeometry(1.84, 1.14), scr, [0, 1.45, 0.075], { shadow: false });
    this.bell = this.glow('#22c55e', 1.5);
    this.add(new THREE.SphereGeometry(0.17, 16, 12), this.bell, [0, 2.36, 0], { shadow: false });
    this.series = Array.from({ length: 40 }, (_, i) => 0.3 + Math.sin(i * 0.4) * 0.05);
    this.level = 0.3;
    this.threshold = 0.7;
    this.alarm = false;
    this._acc = 0;
    this.finish();
    this._draw();
  }

  setLevel(v) {
    this.level = v;
  }

  _draw() {
    const g = this.canvas.getContext('2d');
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.fillStyle = '#0f1424';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(148,163,184,0.18)';
    for (let y = 20; y < H; y += 28) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    const ty = H - this.threshold * H * 0.85 - 10;
    g.strokeStyle = '#f87171';
    g.setLineDash([8, 6]);
    g.beginPath();
    g.moveTo(0, ty);
    g.lineTo(W, ty);
    g.stroke();
    g.setLineDash([]);
    g.lineWidth = 4;
    g.strokeStyle = this.alarm ? '#f87171' : '#f472b6';
    g.beginPath();
    this.series.forEach((v, i) => {
      const x = (i / (this.series.length - 1)) * W;
      const y = H - v * H * 0.85 - 10;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
    g.lineWidth = 1;
    g.fillStyle = '#e2e8f0';
    g.font = '600 18px "Be Vietnam Pro", sans-serif';
    g.fillText('CPU %', 10, 22);
    this.tex.needsUpdate = true;
  }

  animate(dt, t) {
    this._acc += dt;
    if (this._acc > 0.15) {
      this._acc = 0;
      this.series.shift();
      this.series.push(Math.max(0.02, Math.min(1, this.level + (Math.random() - 0.5) * 0.06)));
      this.alarm = this.series[this.series.length - 1] > this.threshold;
      this._draw();
    }
    const c = this.alarm ? '#ef4444' : '#22c55e';
    this.bell.color.set(c);
    this.bell.emissive.set(c);
    this.bell.emissiveIntensity = this.alarm ? 1.5 + 1.5 * Math.sin(t * 12) : 1.2;
  }
}

// ── SQS: a glass tube holding a queue of messages ────────────────────────────
const SQS_MAX = 12;
export class SQSModel extends Model {
  constructor(opts = {}) {
    super('sqs', { category: 'integration', ...opts });
    this.color = CAT_COLOR.integration;
    this.height = 1.6;
    this.radius = 2;
    this.anchorY = 0.9;
    const L = 3.6;
    this.L = L;
    this.add(new THREE.BoxGeometry(L + 0.4, 0.2, 1.1), this.mat('#4a1530'), [0, 0.1, 0]);
    for (const x of [-L / 2 + 0.2, L / 2 - 0.2]) this.add(new THREE.BoxGeometry(0.2, 0.55, 0.3), this.mat('#6b1d45'), [x, 0.45, 0]);
    const glass = new THREE.MeshStandardMaterial({ color: '#fbcfe8', transparent: true, opacity: 0.25, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide });
    this.add(new THREE.CylinderGeometry(0.5, 0.5, L, 32, 1, true), glass, [0, 0.95, 0], { rot: [0, 0, Math.PI / 2], shadow: false });
    for (const x of [-L / 2, L / 2]) this.add(new THREE.TorusGeometry(0.5, 0.06, 8, 32), this.glow(this.color, 1.2), [x, 0.95, 0], { rot: [0, Math.PI / 2, 0] });
    this.msgs = [];
    for (let k = 0; k < SQS_MAX; k++) {
      const m = this.add(new RoundedBoxGeometry(0.26, 0.26, 0.26, 2, 0.05), this.glow('#fde68a', 0.35), [0, 0.95, 0], { shadow: false });
      m.visible = false;
      this.msgs.push({ m, x: L / 2 - 0.3 });
    }
    this.queue = 0;
    this.finish();
  }

  setQueue(n) {
    this.queue = Math.max(0, Math.min(SQS_MAX, Math.round(n)));
  }

  animate(dt) {
    // messages pack towards the +x end (the consumer side)
    for (let k = 0; k < SQS_MAX; k++) {
      const msg = this.msgs[k];
      const vis = k < this.queue;
      const targetX = this.L / 2 - 0.35 - k * 0.29;
      if (vis && !msg.m.visible) msg.x = -this.L / 2 + 0.2;
      msg.m.visible = vis;
      msg.x += (targetX - msg.x) * Math.min(1, dt * 4);
      msg.m.position.x = msg.x;
    }
  }
}

// ── IAM: shield with a keyhole that flashes allow / deny ─────────────────────
export class IAMModel extends Model {
  constructor(opts = {}) {
    super('iam', { category: 'security', ...opts });
    this.color = CAT_COLOR.security;
    this.height = 2.3;
    this.radius = 1.1;
    this.anchorY = 1.3;
    const s = new THREE.Shape();
    s.moveTo(0, 0.95);
    s.quadraticCurveTo(0.45, 0.8, 0.8, 0.85);
    s.lineTo(0.78, 0.1);
    s.quadraticCurveTo(0.7, -0.55, 0, -0.95);
    s.quadraticCurveTo(-0.7, -0.55, -0.78, 0.1);
    s.lineTo(-0.8, 0.85);
    s.quadraticCurveTo(-0.45, 0.8, 0, 0.95);
    const hole = new THREE.Path();
    hole.absarc(0, 0.18, 0.17, 0, Math.PI * 2, true);
    s.holes.push(hole);
    const slot = new THREE.Path();
    slot.moveTo(-0.07, 0.05);
    slot.lineTo(-0.12, -0.45);
    slot.lineTo(0.12, -0.45);
    slot.lineTo(0.07, 0.05);
    slot.closePath();
    s.holes.push(slot);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 });
    geo.center();
    this.shieldMat = this.mat(this.color, { emissive: this.color, emissiveIntensity: 0.2, roughness: 0.35 });
    this.shield = this.add(geo, this.shieldMat, [0, 1.35, 0], { rot: [0, -0.3, 0] });
    this.add(new THREE.CylinderGeometry(0.75, 0.9, 0.24, 24), this.mat('#4c1220'), [0, 0.12, 0]);
    this.add(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 12), this.mat('#94a3b8'), [0, 0.42, 0]);
    this.flashColor = new THREE.Color();
    this.flashT = 0;
    this.finish();
  }

  flash(kind) {
    this.flashColor.set(kind === 'allow' ? COLOR.ok : COLOR.bad);
    this.flashT = 1;
  }

  animate(dt, t) {
    this.shield.position.y = 1.35 + Math.sin(t * 1.3) * 0.06;
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 1.5);
      this.shieldMat.emissive.copy(this.flashColor);
      this.shieldMat.emissiveIntensity = 0.2 + this.flashT * 1.6;
      if (this.flashT === 0) this._lookDirty = true;
    }
  }
}

// ── the outside world: a small island of third-party servers (payment, email APIs…) ──
export class ExternalModel extends Model {
  constructor(opts = {}) {
    super('external', { category: 'users', ...opts });
    this.color = '#22d3ee';
    this.height = 2.5;
    this.radius = opts.radius || 2.3;
    this.anchorY = 1.3;
    const R = this.radius;
    this.add(new THREE.CylinderGeometry(R, R - 0.35, 0.7, 40), [this.mat('#cfd9ea'), this.mat('#eef3fb'), this.mat('#eef3fb')], [0, -0.35, 0]);
    this.add(new THREE.TorusGeometry(R, 0.05, 8, 72), this.glow('#67e8f9', 1.3), [0, 0, 0], { rot: [Math.PI / 2, 0, 0], shadow: false });
    const rack = this.mat('#1f2a3d', { roughness: 0.45, metalness: 0.3 });
    this.leds = [];
    for (const [x, z, h] of [
      [-0.55, -0.2, 1.4],
      [0.55, 0.25, 1.1],
    ]) {
      this.add(new RoundedBoxGeometry(0.8, h, 0.8, 2, 0.06), rack, [x, h / 2, z]);
      for (let k = 0; k < 3; k++) {
        const m = this.glow('#22d3ee', 1.8);
        m.userData.noLook = true;
        this.add(new THREE.BoxGeometry(0.5, 0.05, 0.02), m, [x, 0.3 + k * 0.3, z + 0.41], { shadow: false });
        this.leds.push({ m, ph: Math.random() * 6 });
      }
    }
    this.globe = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.42, 1)), new THREE.LineBasicMaterial({ color: '#a5f3fc' }));
    this.globe.position.set(0, 2.05, 0);
    this.body.add(this.globe);
    this.finish();
  }

  animate(dt, t) {
    this.globe.rotation.y += dt * 0.6;
    for (const l of this.leds) l.m.emissiveIntensity = 0.6 + 1.4 * (0.5 + 0.5 * Math.sin(t * 5 + l.ph));
  }
}
