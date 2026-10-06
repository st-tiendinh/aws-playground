// Supporting models: the crowd of users, a single user, AZ / Region platforms, dashed
// boundaries (VPC, Auto Scaling group), subnet tiles, the globe, generic tokens (files,
// AMIs, messages…) and the explore-only services: CloudWatch, SQS, IAM, EBS, KMS,
// CloudTrail, EventBridge, CloudFormation, AWS Budgets, ACM, Step Functions, EFS, ECR,
// Aurora, Network ACL, Kinesis Data Streams, Systems Manager, AWS Backup — and the Shared
// Responsibility Model stack.
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

// ── CloudWatch: monitor with a live chart and an alarm light (also Cost Explorer) ──
export class CloudWatchModel extends Model {
  constructor(opts = {}) {
    super(opts.kind || 'cloudwatch', { category: 'management', ...opts });
    this.title = opts.title || 'CPU %';
    this.color = CAT_COLOR.management;
    this.height = 2.5;
    this.radius = 1.2;
    this.anchorY = 1.4;
    this.add(new THREE.CylinderGeometry(0.6, 0.75, 0.2, 24), this.mat('#16264a'), [0, 0.1, 0]);
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
    g.strokeStyle = this.alarm ? '#f87171' : '#60a5fa';
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
    g.fillText(this.title, 10, 22);
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

const cOk = new THREE.Color(COLOR.ok);
const cWarn = new THREE.Color(COLOR.warn);
const cBad = new THREE.Color(COLOR.bad);

// ── EBS: a volume built from data blocks, activity LEDs on its base ──────────
export class EBSModel extends Model {
  constructor(opts = {}) {
    super('ebs', { category: 'storage', ...opts });
    this.color = CAT_COLOR.storage;
    this.height = 1.1;
    this.radius = 1.0;
    this.anchorY = 0.85;
    this.add(new RoundedBoxGeometry(1.6, 0.22, 1.6, 2, 0.06), this.mat('#2f4a0a'), [0, 0.11, 0]);
    this.add(new RoundedBoxGeometry(1.66, 0.05, 1.66, 2, 0.02), this.glow(this.color, 1.1), [0, 0.245, 0], { shadow: false });
    // 3 × 3 × 2 blocks: block storage, literally
    const mats = [this.mat('#9bc53d', { roughness: 0.45 }), this.mat('#6f9a1c', { roughness: 0.45 })];
    const geo = new RoundedBoxGeometry(0.4, 0.36, 0.4, 2, 0.05);
    this.blocks = [];
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const y = 0.47 + layer * 0.4;
          const m = this.add(geo, mats[(i + j + layer) % 2], [(i - 1) * 0.44, y, (j - 1) * 0.44]);
          if (layer) this.blocks.push({ m, y, ph: (i + j) * 0.8 });
        }
      }
    }
    this.leds = [];
    for (let k = 0; k < 3; k++) {
      const m = this.glow(COLOR.ok, 2);
      m.userData.noLook = true;
      this.add(new THREE.BoxGeometry(0.16, 0.06, 0.03), m, [-0.36 + k * 0.22, 0.11, 0.815], { shadow: false });
      this.leds.push({ m, ph: Math.random() * 6, rate: 3 + Math.random() * 4 });
    }
    this.load = 0;
    this.ping = 0;
    this.finish();
  }

  setLoad(v) {
    this.load = v;
  }

  // a packet arrived: a write ripples across the top blocks
  pulse() {
    this.ping = 1;
  }

  animate(dt, t) {
    this.ping = Math.max(0, this.ping - dt * 1.2);
    const failed = this.state === 'failed';
    for (const b of this.blocks) b.m.position.y = b.y + (failed ? 0 : Math.max(0, Math.sin(t * 10 - b.ph)) * 0.08 * this.ping);
    const busy = Math.min(1, this.load + this.ping * 0.6);
    for (const [k, l] of this.leds.entries()) {
      const on = failed ? k === 0 && Math.sin(t * 4) > 0.3 : Math.sin(t * l.rate * (0.4 + busy * 3) + l.ph) > 0.5 - busy * 0.8;
      const c = failed ? cBad : cOk;
      l.m.color.copy(c);
      l.m.emissive.copy(c);
      l.m.emissiveIntensity = on ? 2.4 : 0.06;
    }
  }
}

// ── KMS: a key floating under a glass dome — it never leaves the HSM ─────────
export class KMSModel extends Model {
  constructor(opts = {}) {
    super('kms', { category: 'security', ...opts });
    this.color = CAT_COLOR.security;
    this.height = 1.4;
    this.radius = 1.1;
    this.anchorY = 0.95;
    this.add(new THREE.CylinderGeometry(0.98, 1.1, 0.3, 40), this.mat('#4c1220'), [0, 0.15, 0]);
    this.add(new THREE.TorusGeometry(0.99, 0.04, 8, 64), this.glow(this.color, 1.6), [0, 0.31, 0], { rot: [Math.PI / 2, 0, 0], shadow: false });
    const glass = new THREE.MeshStandardMaterial({ color: '#fecdd3', transparent: true, opacity: 0.2, roughness: 0.08, depthWrite: false, side: THREE.DoubleSide });
    this.add(new THREE.SphereGeometry(0.93, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glass, [0, 0.3, 0], { shadow: false });
    // the key: ring bow, shaft and two teeth, centred on the spin axis
    this.key = new THREE.Group();
    this.key.position.y = 0.8;
    this.body.add(this.key);
    this.keyMat = this.mat('#fbbf24', { metalness: 0.6, roughness: 0.3, emissive: '#f59e0b', emissiveIntensity: 0.3 });
    this.add(new THREE.TorusGeometry(0.19, 0.065, 10, 28), this.keyMat, [-0.27, 0, 0], { parent: this.key });
    this.add(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 12), this.keyMat, [0.22, 0, 0], { rot: [0, 0, Math.PI / 2], parent: this.key });
    this.add(new THREE.BoxGeometry(0.07, 0.18, 0.06), this.keyMat, [0.39, -0.1, 0], { parent: this.key });
    this.add(new THREE.BoxGeometry(0.07, 0.12, 0.06), this.keyMat, [0.49, -0.07, 0], { parent: this.key });
    this.flashColor = new THREE.Color();
    this.flashT = 0;
    this.finish();
  }

  // allow / deny verdict on GenerateDataKey, Decrypt…
  flash(kind) {
    this.flashColor.set(kind === 'allow' ? COLOR.ok : COLOR.bad);
    this.flashT = 1;
  }

  animate(dt, t) {
    this.key.rotation.y = t * 0.7;
    this.key.position.y = 0.8 + Math.sin(t * 1.5) * 0.05;
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 1.5);
      this.keyMat.emissive.copy(this.flashColor);
      this.keyMat.emissiveIntensity = 0.3 + this.flashT * 1.8;
      if (this.flashT === 0) this._lookDirty = true;
    }
  }
}

// ── CloudTrail: an event log on a stand; every packet that lands adds a row ──
const TRAIL_ROWS = 7;
const clock = (s) => [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, '0')).join(':');

export class CloudTrailModel extends Model {
  constructor(opts = {}) {
    super('cloudtrail', { category: 'management', ...opts });
    this.color = CAT_COLOR.management;
    this.height = 2.55;
    this.radius = 1.2;
    this.anchorY = 1.5;
    this.add(new THREE.CylinderGeometry(0.6, 0.75, 0.2, 24), this.mat('#16264a'), [0, 0.1, 0]);
    this.add(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 10), this.mat('#94a3b8'), [0, 0.45, 0]);
    this.add(new RoundedBoxGeometry(1.56, 1.82, 0.14, 2, 0.06), this.mat('#1e1b2e'), [0, 1.58, 0]);
    this.add(new RoundedBoxGeometry(1.62, 0.12, 0.18, 2, 0.04), this.mat(this.color), [0, 2.5, 0]);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 300;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    scr.userData.noLook = true;
    this.add(new THREE.PlaneGeometry(1.42, 1.66), scr, [0, 1.58, 0.075], { shadow: false });
    // magnifying glass drifting over the log
    this.lens = new THREE.Group();
    this.lens.position.set(0.72, 1.2, 0.3);
    this.body.add(this.lens);
    const rim = this.mat('#93c5fd', { metalness: 0.4, roughness: 0.3 });
    this.add(new THREE.TorusGeometry(0.24, 0.045, 10, 32), rim, [0, 0, 0], { parent: this.lens });
    this.add(new THREE.CylinderGeometry(0.04, 0.05, 0.36, 10), rim, [0.2, -0.28, 0], { rot: [0, 0, 0.7], parent: this.lens });
    const lensGlass = new THREE.MeshBasicMaterial({ color: '#bfdbfe', transparent: true, opacity: 0.25, depthWrite: false });
    lensGlass.userData.noLook = true;
    this.add(new THREE.CircleGeometry(0.22, 28), lensGlass, [0, 0, 0], { parent: this.lens, shadow: false });
    this.clock = 9 * 3600 + 12 * 60;
    const seed = opts.rows || ['ListBuckets · app-role', 'DescribeInstances · lan', 'ConsoleLogin · lan'];
    this.rows = seed.map((text, i) => ({ text, color: '#60a5fa', time: this.clock - (i + 1) * 47 }));
    this.fresh = 0;
    this._acc = 0;
    this.finish();
    this._draw();
  }

  // an explore packet arrived: its label becomes the newest event
  pulse(a) {
    this.clock += 3 + Math.floor(Math.random() * 40);
    this.rows.unshift({ text: a?.label || 'API call', color: a?.color || '#60a5fa', time: this.clock });
    this.rows.length = Math.min(this.rows.length, TRAIL_ROWS);
    this.fresh = 1;
    this._draw();
  }

  _draw() {
    const g = this.canvas.getContext('2d');
    const W = this.canvas.width;
    const H = this.canvas.height;
    const font = '"Be Vietnam Pro", sans-serif';
    g.fillStyle = '#0f1424';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#60a5fa';
    g.font = `700 17px ${font}`;
    g.fillText('Event history', 12, 26);
    g.fillStyle = 'rgba(148,163,184,0.25)';
    g.fillRect(12, 36, W - 24, 2);
    this.rows.forEach((r, i) => {
      const y = 46 + i * 36;
      if (i === 0 && this.fresh > 0) {
        g.fillStyle = `rgba(96,165,250,${0.32 * this.fresh})`;
        g.fillRect(6, y, W - 12, 32);
      }
      g.fillStyle = r.color;
      g.beginPath();
      g.arc(18, y + 16, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#94a3b8';
      g.font = `500 11px ${font}`;
      g.fillText(clock(r.time), 30, y + 12);
      g.fillStyle = '#e2e8f0';
      g.font = `600 14px ${font}`;
      let text = r.text;
      while (text.length > 4 && g.measureText(text).width > W - 42) text = text.slice(0, -2) + '…';
      g.fillText(text, 30, y + 28);
    });
    this.tex.needsUpdate = true;
  }

  animate(dt, t) {
    this.lens.position.x = 0.72 + Math.sin(t * 0.7) * 0.06;
    this.lens.position.y = 1.2 + Math.sin(t * 1.1) * 0.12;
    if (this.fresh > 0) {
      this.fresh = Math.max(0, this.fresh - dt * 0.8);
      this._acc += dt;
      if (this._acc > 0.08 || this.fresh === 0) {
        this._acc = 0;
        this._draw();
      }
    }
  }
}

// ── EventBridge: a hub that routes events down lanes to target sockets ───────
export class EventBridgeModel extends Model {
  constructor(opts = {}) {
    super('eventbridge', { category: 'integration', ...opts });
    this.color = CAT_COLOR.integration;
    this.height = 1.5;
    this.radius = 1.4;
    this.anchorY = 0.9;
    this.add(new THREE.CylinderGeometry(1.3, 1.42, 0.3, 6), this.mat('#4a1530'), [0, 0.15, 0]);
    this.add(new THREE.TorusGeometry(1.27, 0.045, 6, 6), this.glow(this.color, 1.5), [0, 0.31, 0], { rot: [Math.PI / 2, 0, Math.PI / 6], shadow: false });
    this.hubMat = this.mat(this.color, { roughness: 0.4, emissive: this.color, emissiveIntensity: 0.35 });
    this.add(new THREE.CylinderGeometry(0.36, 0.4, 0.5, 6), this.hubMat, [0, 0.55, 0]);
    this.gem = this.add(new THREE.OctahedronGeometry(0.2), this.glow('#fbcfe8', 1.4), [0, 1.15, 0], { shadow: false });
    // one lane in (from -x), three lanes out (towards +x), each ending in a target socket
    const lane = this.mat('#f9a8d4', { roughness: 0.5 });
    const socket = this.mat('#831843');
    const tip = this.glow('#fbcfe8', 1.6);
    this.events = [];
    for (const [deg, inbound] of [[180, true], [-60, false], [0, false], [60, false]]) {
      const a = (deg * Math.PI) / 180;
      const dir = [Math.cos(a), Math.sin(a)];
      this.add(new THREE.BoxGeometry(0.78, 0.05, 0.16), lane, [dir[0] * 0.8, 0.33, dir[1] * 0.8], { rot: [0, -a, 0], shadow: false });
      if (!inbound) {
        this.add(new THREE.CylinderGeometry(0.11, 0.13, 0.22, 12), socket, [dir[0] * 1.14, 0.41, dir[1] * 1.14]);
        this.add(new THREE.CylinderGeometry(0.115, 0.115, 0.04, 12), tip, [dir[0] * 1.14, 0.54, dir[1] * 1.14], { shadow: false });
      }
      const m = this.glow('#fde68a', 1.2);
      m.userData.noLook = true;
      const cube = this.add(new RoundedBoxGeometry(0.16, 0.16, 0.16, 2, 0.03), m, [0, 0.43, 0], { shadow: false });
      this.events.push({ m: cube, dir, inbound, u: Math.random() });
    }
    this.ping = 0;
    this.flashColor = new THREE.Color();
    this.flashT = 0;
    this.finish();
  }

  // an event arrived: route faster for a moment
  pulse() {
    this.ping = 1;
  }

  // rule matched (allow) or no rule matched (deny)
  flash(kind) {
    this.flashColor.set(kind === 'allow' ? COLOR.ok : COLOR.bad);
    this.flashT = 1;
  }

  animate(dt, t) {
    this.ping = Math.max(0, this.ping - dt * 1.2);
    const failed = this.state === 'failed';
    const v = 0.35 + this.ping * 2.2;
    for (const e of this.events) {
      e.m.visible = !failed;
      if (failed) continue;
      e.u = (e.u + dt * v) % 1;
      const r = e.inbound ? 1.15 - e.u * 0.72 : 0.43 + e.u * 0.72;
      e.m.position.set(e.dir[0] * r, 0.43, e.dir[1] * r);
    }
    this.gem.rotation.y += dt * (0.8 + this.ping * 4);
    this.gem.position.y = 1.15 + Math.sin(t * 1.6) * 0.05;
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 1.5);
      this.hubMat.emissive.copy(this.flashColor);
      this.hubMat.emissiveIntensity = 0.35 + this.flashT * 1.5;
      if (this.flashT === 0) this._lookDirty = true;
    }
  }
}

// ── CloudFormation: a stack that grows one layer per resource it creates ─────
// default layer colours follow the resources created in the lesson: VPC, Security Group,
// EC2, S3, RDS, a second EC2 and a second bucket
const STACK_LAYERS = [CAT_COLOR.network, CAT_COLOR.security, CAT_COLOR.compute, CAT_COLOR.storage, CAT_COLOR.database, CAT_COLOR.compute, CAT_COLOR.storage];

export class CloudFormationModel extends Model {
  constructor(opts = {}) {
    super('cloudformation', { category: 'management', ...opts });
    this.color = CAT_COLOR.management;
    const colors = opts.layers || STACK_LAYERS;
    this.height = 0.4 + colors.length * 0.25;
    this.radius = 1.2;
    this.anchorY = 1.0;
    this.add(new RoundedBoxGeometry(2.0, 0.26, 1.6, 2, 0.07), this.mat('#16264a'), [0, 0.13, 0]);
    // status strip: green = COMPLETE, blinking amber = IN_PROGRESS, blinking red = ROLLBACK
    this.statusMat = this.glow(COLOR.ok, 1.3);
    this.statusMat.userData.noLook = true;
    this.add(new RoundedBoxGeometry(2.06, 0.05, 1.66, 2, 0.02), this.statusMat, [0, 0.285, 0], { shadow: false });
    this.layers = colors.map((c, k) => {
      const g = new THREE.Group();
      g.position.y = 0.33 + k * 0.25;
      g.visible = false;
      this.body.add(g);
      this.add(new RoundedBoxGeometry(1.7 - k * 0.07, 0.2, 1.3 - k * 0.05, 2, 0.05), this.mat(c, { roughness: 0.45 }), [0, 0.1, 0], { parent: g });
      return { g, s: 0 };
    });
    this.count = 0;
    this.finish();
  }

  // number of resources the stack has created
  setCount(n) {
    this.count = Math.max(0, Math.min(this.layers.length, Math.round(n)));
  }

  animate(dt, t) {
    for (const [k, l] of this.layers.entries()) {
      l.s += ((k < this.count ? 1 : 0) - l.s) * Math.min(1, dt * 6);
      l.g.visible = l.s > 0.02;
      if (l.g.visible) l.g.scale.setScalar(l.s);
    }
    const st = this.state;
    const blink = Math.sin(t * 8) > 0 ? 2.4 : 0.3;
    let c = cOk;
    let i = 1.3;
    if (st === 'pending') [c, i] = [cWarn, blink];
    else if (st === 'rollback') [c, i] = [cBad, blink];
    else if (st === 'drift') [c, i] = [cWarn, 1.2 + 0.8 * Math.sin(t * 3)];
    else if (st === 'failed') [c, i] = [cBad, 0.4];
    this.statusMat.color.copy(c);
    this.statusMat.emissive.copy(c);
    this.statusMat.emissiveIntensity = i;
  }
}

// ── AWS Budgets: a glass gauge filling up towards the budget, a $ coin on top ─
const GAUGE_H = 1.7;
const cIdle = new THREE.Color('#475569');
const cWait = new THREE.Color('#38bdf8');

export class BudgetsModel extends Model {
  constructor(opts = {}) {
    super('budgets', { category: 'management', ...opts });
    this.color = CAT_COLOR.management;
    this.height = 2.75;
    this.radius = 1.0;
    this.anchorY = 1.35;
    this.add(new THREE.CylinderGeometry(0.72, 0.88, 0.26, 32), this.mat('#16264a'), [0, 0.13, 0]);
    this.add(new THREE.TorusGeometry(0.74, 0.04, 8, 48), this.glow(this.color, 1.4), [0, 0.27, 0], { rot: [Math.PI / 2, 0, 0], shadow: false });
    // gauge: glass tube, a fill coloured by how close the forecast is, marks at 80% and 100%
    const glass = new THREE.MeshStandardMaterial({ color: '#bfdbfe', transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide });
    this.add(new THREE.CylinderGeometry(0.34, 0.34, GAUGE_H + 0.12, 28, 1, true), glass, [0, 0.3 + (GAUGE_H + 0.12) / 2, 0], { shadow: false });
    this.fillMat = new THREE.MeshStandardMaterial({ color: COLOR.ok, emissive: COLOR.ok, emissiveIntensity: 0.55, roughness: 0.35 });
    this.fillMat.userData.noLook = true;
    const fillGeo = new THREE.CylinderGeometry(0.28, 0.28, 1, 28);
    fillGeo.translate(0, 0.5, 0);
    this.fill = this.add(fillGeo, this.fillMat, [0, 0.32, 0], { shadow: false });
    for (const [v, c] of [
      [0.8, COLOR.warn],
      [1, COLOR.bad],
    ]) {
      this.add(new THREE.TorusGeometry(0.36, 0.03, 6, 32), this.glow(c, 1.6), [0, this._y(v), 0], { rot: [Math.PI / 2, 0, 0], shadow: false });
    }
    this.coin = new THREE.Group();
    this.coin.position.y = 2.42;
    this.body.add(this.coin);
    const face = textTexture('$', { color: '#78350f', bg: '#fbbf24', font: '800 170px "Be Vietnam Pro", sans-serif' });
    this.coinMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: face, metalness: 0.4, roughness: 0.35, emissive: '#f59e0b', emissiveIntensity: 0.2 });
    this.add(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 36), [this.mat('#d97706', { metalness: 0.5, roughness: 0.3 }), this.coinMat, this.coinMat], [0, 0, 0], { rot: [Math.PI / 2, 0, 0], parent: this.coin });
    this.level = 0;
    this._level = 0;
    this.flashColor = new THREE.Color();
    this.flashT = 0;
    this.finish();
  }

  _y(v) {
    return 0.32 + (Math.min(v, 1.25) / 1.25) * GAUGE_H;
  }

  // forecast ÷ budget: 1 = exactly on budget
  setLevel(v) {
    this.level = Math.max(0, v);
  }

  // an alert went out (deny) or the forecast is back under budget (allow)
  flash(kind) {
    this.flashColor.set(kind === 'allow' ? COLOR.ok : COLOR.bad);
    this.flashT = 1;
  }

  animate(dt, t) {
    this._level += (this.level - this._level) * Math.min(1, dt * 3);
    const v = this._level;
    this.fill.scale.y = Math.max(0.01, this._y(v) - 0.32);
    const c = v >= 1 ? cBad : v >= 0.8 ? cWarn : cOk;
    this.fillMat.color.copy(c);
    this.fillMat.emissive.copy(c);
    this.fillMat.emissiveIntensity = v >= 1 ? 0.6 + 0.5 * Math.sin(t * 8) : 0.55;
    this.coin.rotation.y = t * 1.2;
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 1.2);
      this.coinMat.emissive.copy(this.flashColor);
      this.coinMat.emissiveIntensity = 0.2 + this.flashT * 1.8;
      if (this.flashT === 0) this._lookDirty = true;
    }
  }
}

// ── ACM: a TLS certificate behind a padlock that snaps shut once it is issued ──
export class CertModel extends Model {
  constructor(opts = {}) {
    super('acm', { category: 'security', ...opts });
    this.color = CAT_COLOR.security;
    this.height = 1.85;
    this.radius = 1.0;
    this.anchorY = 1.0;
    this.add(new THREE.CylinderGeometry(0.78, 0.92, 0.24, 32), this.mat('#4c1220'), [0, 0.12, 0]);
    this.add(new THREE.TorusGeometry(0.8, 0.035, 8, 48), this.glow(this.color, 1.5), [0, 0.25, 0], { rot: [Math.PI / 2, 0, 0], shadow: false });
    // the certificate: a card with the domain name, leaning back behind the padlock
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 180;
    const g = cv.getContext('2d');
    const font = '"Be Vietnam Pro", sans-serif';
    g.fillStyle = '#fffbeb';
    g.fillRect(0, 0, 256, 180);
    g.fillStyle = '#DD344C';
    g.fillRect(0, 0, 256, 40);
    g.fillStyle = '#ffffff';
    g.font = `800 19px ${font}`;
    g.fillText('TLS CERTIFICATE', 14, 27);
    g.fillStyle = '#1e293b';
    g.font = `700 20px ${font}`;
    g.fillText(opts.domain || 'shop.example.com', 14, 76);
    g.fillStyle = '#64748b';
    g.font = `500 14px ${font}`;
    g.fillText('cấp bởi Amazon · ACM', 14, 102);
    g.fillStyle = '#cbd5e1';
    g.fillRect(14, 122, 140, 7);
    g.fillRect(14, 140, 110, 7);
    g.fillStyle = '#f59e0b';
    g.beginPath();
    g.arc(210, 138, 26, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#b45309';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(210, 138, 18, 0, Math.PI * 2);
    g.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const paper = this.mat('#fef3c7');
    const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    this.add(new THREE.BoxGeometry(1.36, 0.96, 0.04), [paper, paper, paper, paper, front, paper], [0, 1.22, -0.22], { rot: [-0.18, 0, 0] });
    this.add(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 10), this.mat('#94a3b8'), [0, 0.5, -0.3]);
    // padlock: open while the certificate is pending validation, shut once issued
    this.lock = new THREE.Group();
    this.lock.position.set(0, 0.25, 0.42);
    this.body.add(this.lock);
    this.add(new RoundedBoxGeometry(0.5, 0.42, 0.24, 2, 0.05), this.mat('#fbbf24', { metalness: 0.45, roughness: 0.3 }), [0, 0.23, 0], { parent: this.lock });
    this.shackle = this.add(new THREE.TorusGeometry(0.16, 0.045, 8, 24, Math.PI), this.mat('#cbd5e1', { metalness: 0.7, roughness: 0.25 }), [0, 0.46, 0], { parent: this.lock });
    this.holeMat = this.glow(COLOR.ok, 1.6);
    this.holeMat.userData.noLook = true;
    this.add(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 16), this.holeMat, [0, 0.25, 0.125], { rot: [Math.PI / 2, 0, 0], parent: this.lock, shadow: false });
    this._open = 0;
    this.flashColor = new THREE.Color();
    this.flashT = 0;
    this.finish();
  }

  flash(kind) {
    this.flashColor.set(kind === 'allow' ? COLOR.ok : COLOR.bad);
    this.flashT = 1;
  }

  animate(dt, t) {
    const pending = this.state === 'pending';
    this._open += ((pending ? 1 : 0) - this._open) * Math.min(1, dt * 5);
    this.shackle.position.y = 0.46 + 0.14 * this._open;
    this.shackle.rotation.y = 1.1 * this._open;
    let c = cOk;
    let i = 1.6;
    if (this.state === 'failed') [c, i] = [cBad, 0.4];
    else if (pending) [c, i] = [cWarn, Math.sin(t * 7) > 0 ? 2.2 : 0.3];
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 1.5);
      c = this.flashColor;
      i = 1.6 + this.flashT * 2;
    }
    this.holeMat.color.copy(c);
    this.holeMat.emissive.copy(c);
    this.holeMat.emissiveIntensity = i;
  }
}

// ── Step Functions: task states chained top to bottom, plus a Catch branch ────
const SFN_STATES = 4;

export class StepFunctionsModel extends Model {
  constructor(opts = {}) {
    super('stepfunctions', { category: 'integration', ...opts });
    this.color = CAT_COLOR.integration;
    this.height = 2.65;
    this.radius = 1.2;
    this.anchorY = 1.3;
    this.add(new THREE.CylinderGeometry(1.0, 1.1, 0.26, 6), this.mat('#4a1530'), [0, 0.13, 0]);
    this.add(new THREE.TorusGeometry(0.98, 0.04, 6, 6), this.glow(this.color, 1.5), [0, 0.27, 0], { rot: [Math.PI / 2, 0, Math.PI / 6], shadow: false });
    const link = this.mat('#f9a8d4');
    this.add(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 8), link, [0, 1.3, 0], { shadow: false });
    this.add(new THREE.SphereGeometry(0.09, 14, 10), this.glow('#fbcfe8', 1.4), [0, 2.38, 0], { shadow: false });
    // one box per state; count = the state running now (1-based), above the last = done
    this.boxes = [];
    const geo = new RoundedBoxGeometry(0.78, 0.3, 0.3, 2, 0.06);
    for (let k = 0; k < SFN_STATES; k++) {
      const m = new THREE.MeshStandardMaterial({ color: cIdle, emissive: cIdle, emissiveIntensity: 0, roughness: 0.45 });
      m.userData.noLook = true;
      this.add(geo, m, [0, 2.1 - k * 0.55, 0]);
      this.boxes.push(m);
    }
    // Catch branch off the second state (the payment step in the lesson)
    this.add(new THREE.BoxGeometry(0.42, 0.035, 0.035), link, [0.6, 1.55, 0], { shadow: false });
    this.catchMat = new THREE.MeshStandardMaterial({ color: cIdle, emissive: cIdle, emissiveIntensity: 0, roughness: 0.45 });
    this.catchMat.userData.noLook = true;
    this.add(new RoundedBoxGeometry(0.42, 0.3, 0.3, 2, 0.06), this.catchMat, [0.98, 1.55, 0]);
    this.count = 0;
    this.finish();
  }

  setCount(n) {
    this.count = Math.max(0, Math.round(n));
  }

  animate(dt, t) {
    const st = this.state;
    const paint = (m, c, i) => {
      m.color.copy(c);
      m.emissive.copy(c);
      m.emissiveIntensity = i;
    };
    for (const [k, m] of this.boxes.entries()) {
      if (k < this.count - 1 || this.count > SFN_STATES) paint(m, cOk, 0.45);
      else if (k === this.count - 1) {
        // retrying (error), failed into the Catch branch, waiting for a person, or running
        if (st === 'error') paint(m, cBad, Math.sin(t * 10) > 0 ? 1.4 : 0.2);
        else if (st === 'catch') paint(m, cBad, 0.5);
        else if (st === 'wait') paint(m, cWait, 0.6 + 0.5 * Math.sin(t * 3));
        else paint(m, cWarn, 0.9 + 0.6 * Math.sin(t * 6));
      } else paint(m, cIdle, 0);
    }
    if (st === 'catch') paint(this.catchMat, cWarn, 0.9 + 0.6 * Math.sin(t * 6));
    else paint(this.catchMat, cIdle, 0);
  }
}

// ── EFS: a shared filing cabinet; a drawer slides out on every read or write ──
export class EFSModel extends Model {
  constructor(opts = {}) {
    super('efs', { category: 'storage', ...opts });
    this.color = CAT_COLOR.storage;
    this.height = 1.95;
    this.radius = 1.0;
    this.anchorY = 1.1;
    this.add(new RoundedBoxGeometry(1.7, 0.2, 1.3, 2, 0.06), this.mat('#2f4a0a'), [0, 0.1, 0]);
    this.add(new RoundedBoxGeometry(1.76, 0.05, 1.36, 2, 0.02), this.glow(this.color, 1.1), [0, 0.225, 0], { shadow: false });
    this.add(new RoundedBoxGeometry(1.3, 1.5, 0.95, 3, 0.07), this.mat('#4d7c0f', { roughness: 0.5 }), [0, 1.0, -0.05]);
    // folders peeking out of the top
    for (const [x, c] of [
      [-0.35, '#fde68a'],
      [0.05, '#93c5fd'],
      [0.4, '#fca5a5'],
    ]) {
      this.add(new RoundedBoxGeometry(0.3, 0.2, 0.7, 2, 0.03), this.mat(c), [x, 1.82, -0.05]);
    }
    const front = this.mat('#a3e635', { roughness: 0.45 });
    const handle = this.mat('#e2e8f0', { metalness: 0.6, roughness: 0.3 });
    this.drawers = [];
    for (let k = 0; k < 3; k++) {
      const g = new THREE.Group();
      g.position.set(0, 0.5 + k * 0.45, 0.45);
      this.body.add(g);
      this.add(new RoundedBoxGeometry(1.16, 0.38, 0.08, 2, 0.03), front, [0, 0, 0], { parent: g });
      this.add(new RoundedBoxGeometry(0.36, 0.06, 0.06, 2, 0.02), handle, [0, 0.04, 0.06], { parent: g });
      this.drawers.push({ g, t: 0 });
    }
    this.finish();
  }

  // a read or write arrived: one drawer slides out and back
  pulse() {
    this.drawers[Math.floor(Math.random() * this.drawers.length)].t = 1;
  }

  animate(dt) {
    for (const d of this.drawers) {
      d.t = Math.max(0, d.t - dt * 1.6);
      d.g.position.z = 0.45 + (this.state === 'failed' ? 0 : Math.sin(d.t * Math.PI) * 0.3);
    }
  }
}

// ── ECR: a registry rack; each box is a container image made of stacked layers ──
const ECR_SLOTS = 6;

export class ECRModel extends Model {
  constructor(opts = {}) {
    super('ecr', { category: 'compute', ...opts });
    this.color = CAT_COLOR.compute;
    this.height = 1.9;
    this.radius = 1.2;
    this.anchorY = 1.15;
    this.add(new RoundedBoxGeometry(2.0, 0.22, 1.3, 2, 0.07), this.mat('#3b2412'), [0, 0.11, 0]);
    this.add(new RoundedBoxGeometry(2.06, 0.05, 1.36, 2, 0.02), this.glow(this.color, 1.2), [0, 0.245, 0], { shadow: false });
    const metal = this.mat('#94a3b8', { metalness: 0.5, roughness: 0.35 });
    for (const x of [-0.92, 0.92]) for (const z of [-0.52, 0.52]) this.add(new THREE.BoxGeometry(0.07, 1.55, 0.07), metal, [x, 1.04, z]);
    for (const y of [0.9, 1.8]) this.add(new THREE.BoxGeometry(1.92, 0.05, 1.1), metal, [0, y, 0]);
    // an image = three layers stacked (base OS, runtime, your code)
    const shades = [this.mat('#c2410c'), this.mat('#f97316'), this.mat('#fdba74')];
    const layer = new RoundedBoxGeometry(0.48, 0.14, 0.78, 2, 0.03);
    this.images = [];
    for (let k = 0; k < ECR_SLOTS; k++) {
      const g = new THREE.Group();
      g.position.set(((k % 3) - 1) * 0.6, k < 3 ? 0.27 : 0.925, 0);
      g.visible = false;
      this.body.add(g);
      for (let j = 0; j < 3; j++) this.add(layer, shades[j], [0, 0.08 + j * 0.15, 0], { parent: g });
      this.images.push({ g, s: 0, bump: 0 });
    }
    this.count = 0;
    this.finish();
  }

  // number of images stored in the repository
  setCount(n) {
    this.count = Math.max(0, Math.min(ECR_SLOTS, Math.round(n)));
  }

  // a push or pull arrived: the newest image hops
  pulse() {
    const top = this.images[Math.max(0, this.count - 1)];
    if (top) top.bump = 1;
  }

  animate(dt) {
    for (const [k, im] of this.images.entries()) {
      im.s += ((k < this.count ? 1 : 0) - im.s) * Math.min(1, dt * 6);
      im.bump = Math.max(0, im.bump - dt * 2);
      im.g.visible = im.s > 0.02;
      if (im.g.visible) im.g.scale.setScalar(im.s * (1 + Math.sin(im.bump * Math.PI) * 0.18));
    }
  }
}

// ── Aurora: a writer and readers sharing one cluster volume (6 copies, 3 AZs) ──
const AURORA_READERS = 2;

export class AuroraModel extends Model {
  constructor(opts = {}) {
    super('aurora', { category: 'database', ...opts });
    this.color = CAT_COLOR.database;
    this.height = 1.55;
    this.radius = 1.6;
    this.anchorY = 1.0;
    this.add(new RoundedBoxGeometry(3.0, 0.3, 1.7, 2, 0.08), this.mat('#3d1245'), [0, 0.15, 0]);
    this.add(new RoundedBoxGeometry(3.06, 0.05, 1.76, 2, 0.02), this.glow('#f0abfc', 1.2), [0, 0.32, 0], { shadow: false });
    // the cluster volume: six copies of the data, two in each of three AZs
    this.copies = [];
    const azColors = ['#f0abfc', '#c084fc', '#f472b6'];
    for (let k = 0; k < 6; k++) {
      const m = this.glow(azColors[Math.floor(k / 2)], 0.6);
      m.userData.noLook = true;
      this.add(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 20), m, [-1.15 + k * 0.46, 0.4, 0.58], { shadow: false });
      this.copies.push(m);
    }
    // writer instance in the middle, read-only replicas either side
    const disk = this.mat(this.color, { roughness: 0.38 });
    for (let k = 0; k < 3; k++) {
      this.add(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 32), disk, [0, 0.48 + k * 0.26, -0.2]);
      this.add(new THREE.TorusGeometry(0.425, 0.02, 6, 40), this.glow('#f5c2ff', 1.2), [0, 0.58 + k * 0.26, -0.2], { rot: [Math.PI / 2, 0, 0], shadow: false });
    }
    const replica = this.mat('#f5d0fe', { roughness: 0.4, transparent: true, opacity: 0.85 });
    this.readers = [];
    for (const x of [-1.05, 1.05]) {
      const g = new THREE.Group();
      g.position.set(x, 0.38, -0.2);
      g.visible = false;
      this.body.add(g);
      for (let k = 0; k < 2; k++) this.add(new THREE.CylinderGeometry(0.28, 0.28, 0.17, 28), replica, [0, 0.1 + k * 0.21, 0], { parent: g });
      this.readers.push({ g, s: 0 });
    }
    this.count = opts.count ?? AURORA_READERS;
    this.wave = 0;
    this.finish();
  }

  // number of reader instances (Aurora Replicas)
  setCount(n) {
    this.count = Math.max(0, Math.min(AURORA_READERS, Math.round(n)));
  }

  // a write arrived: it ripples across the six copies
  pulse() {
    this.wave = 1;
  }

  animate(dt, t) {
    this.wave = Math.max(0, this.wave - dt * 1.4);
    for (const [k, m] of this.copies.entries()) {
      const hit = Math.max(0, Math.sin((1 - this.wave) * Math.PI * 3 - k * 0.5));
      m.emissiveIntensity = this.state === 'failed' ? 0.1 : 0.6 + (this.wave > 0 ? hit * 1.8 : 0.2 * Math.sin(t * 2 + k));
    }
    for (const [k, r] of this.readers.entries()) {
      r.s += ((k < this.count ? 1 : 0) - r.s) * Math.min(1, dt * 5);
      r.g.visible = r.s > 0.02;
      if (r.g.visible) r.g.scale.setScalar(r.s);
    }
  }
}

// ── Shared Responsibility Model: a stack of labelled layers, coloured by who
// looks after each one (AWS amber, you blue, shared purple) ──
const OWNER = {
  aws: { color: '#f59e0b', tag: 'AWS' },
  you: { color: '#3b82f6', tag: 'BẠN' },
  both: { color: '#a855f7', tag: 'CHUNG' },
};

function layerTexture(text, owner) {
  const o = OWNER[owner];
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 80;
  const g = cv.getContext('2d');
  const font = '"Be Vietnam Pro", sans-serif';
  g.fillStyle = o.color;
  g.fillRect(0, 0, 512, 80);
  g.fillStyle = 'rgba(15,23,42,0.35)';
  g.beginPath();
  g.roundRect(12, 20, 92, 40, 20);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = `800 20px ${font}`;
  g.textAlign = 'center';
  g.fillText(o.tag, 58, 47);
  g.textAlign = 'left';
  let size = 28;
  g.font = `700 ${size}px ${font}`;
  while (size > 16 && g.measureText(text).width > 384) g.font = `700 ${--size}px ${font}`;
  g.fillText(text, 118, 50);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const cRed = new THREE.Color('#ef4444');
const cWhite = new THREE.Color('#ffffff');

export class ResponsibilityModel extends Model {
  constructor(opts = {}) {
    super('resp', { category: 'foundation', ...opts });
    const layers = opts.layers || [];
    this.color = '#94a3b8';
    this.height = 0.25 + layers.length * 0.46;
    this.radius = 1.5;
    this.anchorY = this.height * 0.6;
    this.add(new RoundedBoxGeometry(2.9, 0.2, 1.4, 2, 0.06), this.mat('#334155'), [0, 0.1, 0]);
    this.layers = layers.map(([text, owner], k) => {
      const base = new THREE.Color(OWNER[owner].color);
      const face = new THREE.MeshStandardMaterial({ map: layerTexture(text, owner), roughness: 0.5, emissive: base, emissiveIntensity: 0.1 });
      const side = new THREE.MeshStandardMaterial({ color: base, roughness: 0.5, emissive: base, emissiveIntensity: 0.1 });
      face.userData.noLook = side.userData.noLook = true;
      const g = new THREE.Group();
      g.position.y = 0.22 + k * 0.46;
      g.visible = false;
      this.body.add(g);
      this.add(new THREE.BoxGeometry(2.6, 0.4, 1.1), [side, side, side, side, face, side], [0, 0.2, 0], { parent: g });
      return { g, owner, base, face, side, s: 0 };
    });
    this.count = opts.count ?? layers.length;
    this.finish();
  }

  // layers built so far, from the bottom
  setCount(n) {
    this.count = Math.max(0, Math.min(this.layers.length, Math.round(n)));
  }

  // state 'aws' / 'you' lights up that side's layers, 'breach' flashes the top (data) layer
  animate(dt, t) {
    const st = this.state;
    const focus = st === 'aws' || st === 'you' ? st : null;
    const top = this.layers.length - 1;
    for (const [k, l] of this.layers.entries()) {
      l.s += ((k < this.count ? 1 : 0) - l.s) * Math.min(1, dt * 6);
      l.g.visible = l.s > 0.02;
      if (l.g.visible) l.g.scale.setScalar(l.s);
      const lit = focus && (l.owner === focus || l.owner === 'both');
      const dim = focus && !lit ? 0.45 : 1;
      l.face.color.copy(cWhite).multiplyScalar(dim);
      l.side.color.copy(l.base).multiplyScalar(dim);
      const alarm = st === 'breach' && k === top;
      const glow = alarm ? (Math.sin(t * 9) > 0 ? 1.2 : 0.2) : lit ? 0.45 + 0.3 * Math.sin(t * 4) : 0.1;
      for (const m of [l.face, l.side]) {
        m.emissive.copy(alarm ? cRed : l.base);
        m.emissiveIntensity = glow;
      }
    }
  }
}

// ── Network ACL: a checkpoint boom across the subnet entrance; it lifts for allowed
// traffic and rattles on a deny ──
export class NACLModel extends Model {
  constructor(opts = {}) {
    super('nacl', { category: 'network', ...opts });
    this.color = CAT_COLOR.network;
    const span = opts.span || 2.6;
    const z0 = -span / 2;
    this.height = 1.75;
    this.radius = span / 2;
    this.anchorY = 1.05;
    const dark = this.mat('#2e2366');
    this.add(new THREE.CylinderGeometry(0.42, 0.5, 0.2, 8), dark, [0, 0.1, z0]);
    this.add(new RoundedBoxGeometry(0.3, 1.2, 0.3, 2, 0.05), this.mat(this.color, { roughness: 0.4 }), [0, 0.7, z0]);
    this.add(new RoundedBoxGeometry(0.24, 0.52, 0.24, 2, 0.05), dark, [0, 0.26, -z0]);
    const sign = new THREE.MeshBasicMaterial({ map: textTexture('NACL', { w: 256, h: 112, bg: '#2e2366', font: '800 72px "Be Vietnam Pro", sans-serif' }), toneMapped: false });
    sign.userData.noLook = true;
    this.add(new THREE.PlaneGeometry(0.9, 0.39), sign, [0, 1.52, z0 + 0.17], { shadow: false });
    // striped boom pivoting on the post, lying across the lane (traffic crosses along x)
    this.boom = new THREE.Group();
    this.boom.position.set(0, 1.0, z0);
    this.body.add(this.boom);
    const segs = 6;
    const seg = (span - 0.1) / segs;
    this.barMats = [];
    for (let k = 0; k < segs; k++) {
      const m = k % 2 ? this.mat('#f8fafc', { roughness: 0.4 }) : this.mat(this.color, { emissive: this.color, emissiveIntensity: 0.25, roughness: 0.4 });
      this.add(new THREE.BoxGeometry(0.14, 0.14, seg), m, [0, 0, 0.08 + (k + 0.5) * seg], { parent: this.boom });
      this.barMats.push(m);
    }
    this.flashColor = new THREE.Color();
    this.flashT = 0;
    this.open = 0;
    this.shakeT = 0;
    this.finish();
  }

  // verdict in the explore flows: 'allow' lifts the boom, 'deny' rattles it
  flash(kind) {
    this.flashColor.set(kind === 'allow' ? COLOR.ok : COLOR.bad);
    this.flashT = 1;
    if (kind === 'allow') this.open = 1;
    else this.shakeT = 1;
  }

  animate(dt, t) {
    this.open = Math.max(0, this.open - dt * 1.2);
    this.shakeT = Math.max(0, this.shakeT - dt * 2.2);
    this.boom.rotation.x = -Math.sin(this.open * Math.PI) * 1.05;
    this.boom.rotation.y = Math.sin(t * 38) * 0.06 * this.shakeT;
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 1.5);
      for (const m of this.barMats) {
        m.emissive.copy(this.flashColor);
        m.emissiveIntensity = 0.2 + this.flashT * 1.4;
      }
      if (this.flashT === 0) this._lookDirty = true;
    }
  }
}

// ── Kinesis Data Streams: parallel shard lanes with records streaming through them ──
const KDS_MAX = 4;
const KDS_DOTS = 6;
const KDS_GAP = 0.82;
const kdsZ = (k, n) => (k - (n - 1) / 2) * KDS_GAP;

export class KinesisModel extends Model {
  constructor(opts = {}) {
    super('kinesis', { category: 'integration', ...opts });
    this.color = CAT_COLOR.integration;
    this.L = 4.4;
    this.height = 0.8;
    this.radius = 2.7;
    this.anchorY = 0.55;
    // the base stretches in depth with the number of shards (geometry is 1 deep)
    this.base = this.add(new RoundedBoxGeometry(this.L + 0.9, 0.24, 1, 2, 0.08), this.mat('#4a1530'), [0, 0.12, 0]);
    const laneGeo = new RoundedBoxGeometry(this.L, 0.1, 0.6, 2, 0.04);
    const railGeo = new THREE.BoxGeometry(this.L, 0.025, 0.04);
    const dotGeo = new RoundedBoxGeometry(0.24, 0.16, 0.3, 2, 0.04);
    const laneMat = this.mat('#6b1d45');
    this.railMat = this.glow(this.color, 1.2);
    const dotMat = this.glow('#fde68a', 0.8);
    this.count = Math.max(1, Math.min(KDS_MAX, opts.count ?? 1));
    this.lanes = [];
    for (let k = 0; k < KDS_MAX; k++) {
      const g = new THREE.Group();
      const on = k < this.count;
      g.position.set(0, 0.24, kdsZ(Math.min(k, this.count - 1), this.count));
      g.visible = on;
      this.body.add(g);
      this.add(laneGeo, laneMat, [0, 0.05, 0], { parent: g });
      for (const z of [-0.31, 0.31]) this.add(railGeo, this.railMat, [0, 0.11, z], { parent: g, shadow: false });
      const dots = [];
      for (let j = 0; j < KDS_DOTS; j++) dots.push(this.add(dotGeo, dotMat, [0, 0.18, 0], { parent: g, shadow: false }));
      this.lanes.push({ g, s: on ? 1 : 0, dots, phase: k * 0.37 });
    }
    this._depth = this.count * KDS_GAP + 0.5;
    this.base.scale.z = this._depth;
    this.load = opts.load ?? 0.4;
    this.flow = 0;
    this.bump = 0;
    this.finish();
  }

  // number of shards (1–4)
  setCount(n) {
    this.count = Math.max(1, Math.min(KDS_MAX, Math.round(n)));
  }

  setLoad(v) {
    this.load = v;
  }

  // packet anchors: 'in0'…'in3' where a shard takes records in, 'out0'…'out3' where consumers read
  pinWorld(name, out = new THREE.Vector3()) {
    const m = /^(in|out)(\d)$/.exec(name || '');
    const k = Math.min(m ? +m[2] : 0, this.count - 1);
    const x = (m && m[1] === 'out' ? 1 : -1) * (this.L / 2 - 0.1);
    this.group.updateWorldMatrix(true, false);
    return this.group.localToWorld(out.set(x, 0.5, kdsZ(k, this.count)));
  }

  pulse() {
    this.bump = 1;
  }

  animate(dt) {
    const n = this.count;
    if (this.state !== 'failed') this.flow += dt * (0.12 + this.load * 0.5);
    this.bump = Math.max(0, this.bump - dt * 2);
    this.railMat.emissiveIntensity = (1.2 + this.bump * 1.5) * (1 - this._fail * 0.9);
    for (const [k, l] of this.lanes.entries()) {
      l.s += ((k < n ? 1 : 0) - l.s) * Math.min(1, dt * 5);
      l.g.visible = l.s > 0.02;
      if (!l.g.visible) continue;
      l.g.position.z += (kdsZ(Math.min(k, n - 1), n) - l.g.position.z) * Math.min(1, dt * 4);
      l.g.scale.set(1, l.s, l.s);
      for (const [j, d] of l.dots.entries()) {
        const u = (((j / KDS_DOTS + this.flow + l.phase) % 1) + 1) % 1;
        d.position.x = -this.L / 2 + 0.2 + u * (this.L - 0.4);
      }
    }
    this._depth += (n * KDS_GAP + 0.5 - this._depth) * Math.min(1, dt * 4);
    this.base.scale.z = this._depth;
  }
}

// ── Systems Manager: an operations console (terminal) under a turning gear ────
const SSM_LINES = 4;

export class SSMModel extends Model {
  constructor(opts = {}) {
    super('ssm', { category: 'management', ...opts });
    this.color = CAT_COLOR.management;
    this.height = 2.45;
    this.radius = 1.2;
    this.anchorY = 1.3;
    this.add(new RoundedBoxGeometry(1.9, 0.24, 1.2, 2, 0.07), this.mat('#16264a'), [0, 0.12, 0]);
    this.add(new RoundedBoxGeometry(1.96, 0.05, 1.26, 2, 0.02), this.glow(this.color, 1.2), [0, 0.265, 0], { shadow: false });
    this.add(new THREE.CylinderGeometry(0.08, 0.1, 0.45, 10), this.mat('#94a3b8'), [0, 0.5, -0.1]);
    this.add(new RoundedBoxGeometry(1.8, 1.2, 0.14, 2, 0.06), this.mat('#1e1b2e'), [0, 1.3, -0.1]);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 168;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    scr.userData.noLook = true;
    this.add(new THREE.PlaneGeometry(1.64, 1.06), scr, [0, 1.3, -0.025], { shadow: false });
    // gear: a toothed ring that turns faster while a command runs
    this.gear = new THREE.Group();
    this.gear.position.set(0, 2.18, -0.1);
    this.body.add(this.gear);
    const gm = this.glow(this.color, 0.9);
    this.add(new THREE.TorusGeometry(0.2, 0.07, 8, 24), gm, [0, 0, 0], { parent: this.gear, shadow: false });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      this.add(new THREE.BoxGeometry(0.12, 0.1, 0.1), gm, [Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0], { rot: [0, 0, a], parent: this.gear, shadow: false });
    }
    this.lines = (opts.lines || ['$ aws ssm start-session', 'Starting session…', '$ uptime']).slice(-SSM_LINES);
    this.spin = 0;
    this.cursor = true;
    this._acc = 0;
    this.finish();
    this._draw();
  }

  // an explore packet arrived: its label becomes the newest command on the screen
  pulse(a) {
    if (a?.label) {
      this.lines.push('$ ' + a.label);
      this.lines = this.lines.slice(-SSM_LINES);
    }
    this.spin = 1;
    this._draw();
  }

  _draw() {
    const g = this.canvas.getContext('2d');
    const W = this.canvas.width;
    g.fillStyle = '#0f1424';
    g.fillRect(0, 0, W, this.canvas.height);
    g.fillStyle = '#60a5fa';
    g.font = '700 16px "Be Vietnam Pro", sans-serif';
    g.fillText('Systems Manager', 12, 24);
    g.fillStyle = 'rgba(148,163,184,0.25)';
    g.fillRect(12, 33, W - 24, 2);
    g.font = '500 14px ui-monospace, Menlo, monospace';
    this.lines.forEach((line, i) => {
      g.fillStyle = line.startsWith('$') ? '#a7f3d0' : '#cbd5e1';
      let text = line;
      while (text.length > 4 && g.measureText(text).width > W - 24) text = text.slice(0, -2) + '…';
      g.fillText(text, 12, 58 + i * 24);
    });
    if (this.cursor) {
      g.fillStyle = '#a7f3d0';
      g.fillRect(12, 46 + this.lines.length * 24, 9, 15);
    }
    this.tex.needsUpdate = true;
  }

  animate(dt) {
    this.spin = Math.max(0, this.spin - dt * 0.8);
    if (this.state !== 'failed') this.gear.rotation.z -= dt * (0.6 + this.spin * 5);
    this._acc += dt;
    if (this._acc > 0.5) {
      this._acc = 0;
      this.cursor = !this.cursor;
      this._draw();
    }
  }
}

// ── AWS Backup: a vault — the lamp blinks when a recovery point is stored and the dial
// spins while a restore is running ──
export class VaultModel extends Model {
  constructor(opts = {}) {
    super('backup', { category: 'storage', ...opts });
    this.color = CAT_COLOR.storage;
    this.height = 2.1;
    this.radius = 1.15;
    this.anchorY = 1.15;
    this.add(new RoundedBoxGeometry(1.9, 0.22, 1.6, 2, 0.07), this.mat('#1f2d10'), [0, 0.11, 0]);
    this.add(new RoundedBoxGeometry(1.96, 0.05, 1.66, 2, 0.02), this.glow(this.color, 1.2), [0, 0.245, 0], { shadow: false });
    this.add(new RoundedBoxGeometry(1.5, 1.5, 1.2, 3, 0.12), this.mat('#64748b', { metalness: 0.6, roughness: 0.35 }), [0, 1.03, 0]);
    // round door on the front, with a dial of three spokes
    this.doorMat = this.mat('#94a3b8', { metalness: 0.7, roughness: 0.3, emissive: this.color, emissiveIntensity: 0.15 });
    this.add(new THREE.CylinderGeometry(0.52, 0.52, 0.08, 40), this.doorMat, [0, 1.03, 0.62], { rot: [Math.PI / 2, 0, 0] });
    this.dial = new THREE.Group();
    this.dial.position.set(0, 1.03, 0.68);
    this.body.add(this.dial);
    const knob = this.mat('#e2e8f0', { metalness: 0.7, roughness: 0.25 });
    this.add(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20), knob, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], parent: this.dial });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      this.add(new THREE.BoxGeometry(0.06, 0.34, 0.05), knob, [Math.sin(a) * 0.2, Math.cos(a) * 0.2, 0.02], { rot: [0, 0, -a], parent: this.dial });
    }
    this.lamp = this.glow(this.color, 1.0);
    this.add(new THREE.SphereGeometry(0.13, 16, 12), this.lamp, [0, 1.92, 0], { shadow: false });
    this.blink = 0;
    this.finish();
  }

  // a recovery point was stored
  pulse() {
    this.blink = 1;
  }

  animate(dt, t) {
    const restoring = this.state === 'restoring';
    if (this.state !== 'failed') this.dial.rotation.z += dt * (restoring ? 6 : 0.3);
    this.blink = Math.max(0, this.blink - dt * 1.5);
    this.lamp.emissiveIntensity = (restoring ? 1 + 1.5 * (0.5 + 0.5 * Math.sin(t * 10)) : 0.8 + this.blink * 2.2) * (1 - this._fail * 0.9);
    this.doorMat.emissiveIntensity = restoring ? 0.4 + 0.4 * Math.sin(t * 6) : 0.15;
  }
}
