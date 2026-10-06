// Stylised low-poly models of the AWS services, built from primitives (no external assets):
// EC2 server tower, ELB splitter, S3 bucket, RDS disk stack, DynamoDB partitions, Lambda λ,
// API Gateway arch, CloudFront globe and the Route 53 signpost.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CAT_COLOR, COLOR } from '../palette.js';
import { Model } from './base.js';

const cOk = new THREE.Color(COLOR.ok);
const cWarn = new THREE.Color(COLOR.warn);
const cBad = new THREE.Color(COLOR.bad);
const cTmp = new THREE.Color();
const cEnv = new THREE.Color('#ffb366');
const cCold = new THREE.Color(COLOR.cold);
const UP = new THREE.Vector3(0, 1, 0);

function loadColor(out, v) {
  if (v < 0.7) return out.copy(cOk).lerp(cWarn, Math.max(0, (v - 0.45) / 0.25));
  return out.copy(cWarn).lerp(cBad, Math.min(1, (v - 0.7) / 0.3));
}

// ── EC2: server tower with blinking LEDs and a CPU gauge ─────────────────────
export class EC2Model extends Model {
  constructor(opts = {}) {
    super('ec2', { category: 'compute', ...opts });
    this.color = CAT_COLOR.compute;
    this.height = 1.6;
    this.radius = 0.8;
    this.anchorY = 1.0;
    this.cpu = 0;
    this._cpu = 0;
    const body = this.mat(COLOR.serverBody, { roughness: 0.42, metalness: 0.3 });
    const slot = this.mat(COLOR.serverSlot, { roughness: 0.7 });
    this.capMat = this.mat(this.color, { emissive: this.color, emissiveIntensity: 0.12 });
    this.add(new THREE.BoxGeometry(1.3, 0.12, 1.3), this.mat('#3b475c'), [0, 0.06, 0]);
    this.add(new RoundedBoxGeometry(1.0, 1.32, 1.0, 3, 0.08), body, [0, 0.78, 0]);
    this.add(new RoundedBoxGeometry(1.06, 0.14, 1.06, 2, 0.05), this.capMat, [0, 1.47, 0]);
    this.add(new THREE.BoxGeometry(0.03, 1.05, 0.16), this.capMat, [-0.51, 0.8, 0.3]);
    this.leds = [];
    for (let k = 0; k < 3; k++) {
      const y = 0.4 + k * 0.36;
      this.add(new THREE.BoxGeometry(0.8, 0.22, 0.05), slot, [-0.03, y, 0.5]);
      for (let j = 0; j < 2; j++) {
        const m = this.glow(COLOR.ok, 2.4);
        m.userData.noLook = true;
        this.add(new THREE.BoxGeometry(0.07, 0.07, 0.03), m, [0.22 + j * 0.12, y, 0.535], { shadow: false });
        this.leds.push({ m, phase: Math.random() * 10, rate: 2 + Math.random() * 5 });
      }
      // vent lines
      this.add(new THREE.BoxGeometry(0.34, 0.025, 0.02), this.mat('#59657a'), [-0.2, y, 0.53], { shadow: false });
    }
    if (opts.gauge !== false) {
      const g = new THREE.Group();
      g.position.set(0, 1.86, 0);
      this.group.add(g);
      const bg = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: '#0f172a' }));
      g.add(bg);
      this.gaugeMat = new THREE.MeshBasicMaterial({ color: COLOR.ok, toneMapped: false });
      this.gauge = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.11), this.gaugeMat);
      this.gauge.position.x = -0.5;
      this.gauge.geometry.translate(0.5, 0, 0);
      g.add(this.gauge);
      this.gaugeGroup = g;
    }
    this.ringMat = new THREE.MeshBasicMaterial({ color: COLOR.ok, transparent: true, opacity: 0.6, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.92, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.group.add(this.ring);
    this.finish();
  }

  setLoad(cpu) {
    this.cpu = cpu;
  }

  animate(dt, t) {
    this._cpu += (this.cpu - this._cpu) * Math.min(1, dt * 4);
    const cpu = this._cpu;
    const st = this.state;
    const pending = st === 'pending';
    const failed = st === 'failed';
    const off = st === 'off' || st === 'terminating';
    const over = !failed && !pending && cpu > 1;
    for (const [k, led] of this.leds.entries()) {
      let on;
      let col;
      if (failed) {
        on = k === 0 && Math.sin(t * 4) > 0.3;
        col = cBad;
      } else if (off) {
        on = false;
        col = cOk;
      } else if (pending) {
        on = Math.sin(t * 6 + k) > 0;
        col = cWarn;
      } else {
        const speed = led.rate * (0.5 + Math.min(cpu, 1.5) * 3);
        on = Math.sin(t * speed + led.phase) > -0.2 + Math.min(cpu, 1) * 0.3;
        col = over ? cBad : cpu > 0.8 ? cWarn : cOk;
      }
      led.m.color.copy(col);
      led.m.emissive.copy(col);
      led.m.emissiveIntensity = on ? 2.6 : 0.05;
    }
    // overloaded servers glow red and tremble
    if (over) {
      const p = 0.5 + 0.5 * Math.sin(t * 14);
      this.capMat.emissive.copy(cBad);
      this.capMat.emissiveIntensity = 0.4 + p * 1.2;
      this.body.position.x = (Math.random() - 0.5) * 0.05;
      this.body.position.z = (Math.random() - 0.5) * 0.05;
    } else if (this._wasOver) {
      this._lookDirty = true;
      this.body.position.x = 0;
      this.body.position.z = 0;
    }
    this._wasOver = over;
    if (this.gauge) {
      this.gaugeGroup.visible = !failed && !off && this._spawn >= 1;
      this.gauge.scale.x = Math.max(0.02, Math.min(1, cpu));
      loadColor(this.gaugeMat.color, Math.min(cpu, 1));
      if (over) this.gaugeMat.color.copy(cBad).multiplyScalar(0.7 + 0.3 * Math.sin(t * 14));
    }
    const ringCol = failed ? cBad : pending ? cWarn : over ? cBad : cpu > 0.8 ? cWarn : cOk;
    this.ringMat.color.copy(ringCol);
    this.ringMat.opacity = (failed || over ? 0.45 + 0.35 * Math.sin(t * 8) : 0.55) * (off ? 0.2 : 1);
  }
}

// ── Elastic Load Balancer: disc with a spinning three-way splitter ───────────
export class ELBModel extends Model {
  constructor(opts = {}) {
    super('elb', { category: 'network', ...opts });
    this.color = CAT_COLOR.network;
    this.height = 1.3;
    this.radius = 1.6;
    this.anchorY = 0.9;
    this.add(new THREE.CylinderGeometry(1.5, 1.62, 0.36, 48), this.mat('#3a2d6c'), [0, 0.18, 0]);
    this.add(new THREE.CylinderGeometry(1.36, 1.36, 0.06, 48), this.mat('#5a46b4'), [0, 0.39, 0]);
    this.add(new THREE.TorusGeometry(1.48, 0.05, 8, 72), this.glow('#a78bfa', 1.8), [0, 0.37, 0], { rot: [Math.PI / 2, 0, 0] });
    this.add(new THREE.SphereGeometry(0.3, 24, 16), this.glow(this.color, 1.1), [0, 0.86, 0]);
    this.spinner = new THREE.Group();
    this.spinner.position.y = 0.86;
    this.body.add(this.spinner);
    const arrowMat = this.mat('#d9ccff', { emissive: '#8C4FFF', emissiveIntensity: 0.5 });
    for (let k = 0; k < 3; k++) {
      const a = new THREE.Group();
      a.rotation.y = (k * Math.PI * 2) / 3;
      this.add(new THREE.CylinderGeometry(0.055, 0.055, 0.62, 10), arrowMat, [0.6, 0, 0], { rot: [0, 0, Math.PI / 2], parent: a });
      this.add(new THREE.ConeGeometry(0.15, 0.3, 14), arrowMat, [1.02, 0, 0], { rot: [0, 0, -Math.PI / 2], parent: a });
      this.spinner.add(a);
    }
    this.activity = 0.3;
    this.finish();
  }

  animate(dt) {
    if (this.state !== 'failed') this.spinner.rotation.y += dt * (0.5 + this.activity * 2.5);
  }
}

// ── S3: bucket full of objects ───────────────────────────────────────────────
export class S3Model extends Model {
  constructor(opts = {}) {
    super('s3', { category: 'storage', ...opts });
    this.color = CAT_COLOR.storage;
    this.height = 1.6;
    this.radius = 1.1;
    this.anchorY = 1.25;
    const prof = [
      [0, 0],
      [0.78, 0],
      [0.82, 0.05],
      [1.02, 1.3],
      [1.09, 1.33],
      [1.09, 1.4],
      [0.98, 1.4],
      [0.93, 1.3],
      [0.74, 0.14],
      [0, 0.14],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    this.add(new THREE.LatheGeometry(prof, 48), this.mat(this.color, { roughness: 0.45, side: THREE.DoubleSide }));
    const band = this.mat('#55780c', { roughness: 0.5 });
    this.add(new THREE.TorusGeometry(0.885, 0.035, 8, 48), band, [0, 0.42, 0], { rot: [Math.PI / 2, 0, 0] });
    this.add(new THREE.TorusGeometry(0.975, 0.035, 8, 48), band, [0, 1.02, 0], { rot: [Math.PI / 2, 0, 0] });
    const handle = this.add(new THREE.TorusGeometry(1.0, 0.035, 8, 40, Math.PI), this.mat('#9aa6b8', { metalness: 0.6 }), [0, 1.4, 0]);
    handle.rotation.x = -0.55;
    this.objects = [];
    const cols = ['#fde68a', '#93c5fd', '#fca5a5', '#a7f3d0', '#e9d5ff', '#fdba74'];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const r = k === 0 ? 0 : 0.42;
      const m = this.add(new RoundedBoxGeometry(0.3, 0.3, 0.3, 2, 0.05), this.mat(cols[k]), [Math.cos(a) * r, 1.08 + (k % 2) * 0.06, Math.sin(a) * r]);
      m.rotation.set(Math.random(), Math.random(), Math.random());
      this.objects.push(m);
    }
    this.finish();
  }

  animate(dt, t) {
    for (const [k, o] of this.objects.entries()) o.position.y = 1.1 + Math.sin(t * 1.5 + k) * 0.04 + (k % 2) * 0.05;
  }
}

// ── RDS: stack of database disks ─────────────────────────────────────────────
export class RDSModel extends Model {
  constructor(opts = {}) {
    super('rds', { category: 'database', ...opts });
    this.color = CAT_COLOR.database;
    this.height = 1.45;
    this.radius = 0.95;
    this.anchorY = 1.0;
    this.load = 0;
    const disk = this.mat(this.color, { roughness: 0.38, metalness: 0.1 });
    this.add(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 32), this.mat('#3d1245'), [0, 0.66, 0]);
    this.rings = [];
    for (let k = 0; k < 3; k++) {
      const y = 0.24 + k * 0.42;
      this.add(new THREE.CylinderGeometry(0.88, 0.88, 0.34, 40), disk, [0, y, 0]);
      const rm = this.glow('#f5c2ff', 1.1);
      this.add(new THREE.TorusGeometry(0.885, 0.025, 6, 48), rm, [0, y + 0.17, 0], { rot: [Math.PI / 2, 0, 0], shadow: false });
      this.rings.push(rm);
    }
    this.add(new THREE.CylinderGeometry(0.45, 0.45, 0.02, 32), this.glow('#f0abfc', 0.9), [0, 1.08, 0], { shadow: false });
    this.finish();
  }

  animate(dt, t) {
    if (this.state === 'failed') return;
    const busy = Math.min(1.2, this.load);
    const promoting = this.state === 'promoting';
    for (const [k, m] of this.rings.entries()) {
      const p = 0.5 + 0.5 * Math.sin(t * (2 + busy * 10) - k * 0.9);
      m.emissiveIntensity = promoting ? 1 + 2.5 * (0.5 + 0.5 * Math.sin(t * 12)) : this.ghost ? 0.4 : 0.7 + p * (0.4 + busy);
      if (busy > 0.85) m.emissive.set(COLOR.warn);
      else if (!this._hl) m.emissive.set('#f5c2ff');
    }
  }
}

// ── DynamoDB: three partition columns linked together ────────────────────────
export class DynamoDBModel extends Model {
  constructor(opts = {}) {
    super('dynamodb', { category: 'database', ...opts });
    this.color = CAT_COLOR.database;
    this.height = 1.6;
    this.radius = 1.2;
    this.anchorY = 1.1;
    this.add(new THREE.CylinderGeometry(1.15, 1.25, 0.3, 6), this.mat('#561a63'), [0, 0.15, 0]);
    this.add(new THREE.TorusGeometry(1.12, 0.04, 6, 6), this.glow('#f0abfc', 1.4), [0, 0.31, 0], { rot: [Math.PI / 2, 0, Math.PI / 6] });
    const col = this.mat('#d046e0', { roughness: 0.35 });
    this.items = [];
    const pts = [];
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k * Math.PI * 2) / 3;
      const x = Math.cos(a) * 0.56;
      const z = Math.sin(a) * 0.56;
      this.add(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 6), col, [x, 0.75, z]);
      this.add(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 6), this.glow('#fbcfe8', 1.6), [x, 1.22, z], { shadow: false });
      pts.push(new THREE.Vector3(x, 1.26, z));
      const it = this.add(new RoundedBoxGeometry(0.2, 0.2, 0.2, 2, 0.04), this.glow('#fdf4ff', 0.6), [x, 1.5, z], { shadow: false });
      this.items.push(it);
    }
    pts.push(pts[0].clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#f9a8d4' }));
    this.body.add(line);
    this.finish();
  }

  animate(dt, t) {
    for (const [k, it] of this.items.entries()) {
      it.position.y = 1.5 + Math.sin(t * 2 + k * 2) * 0.08;
      it.rotation.y += dt * 1.2;
    }
  }
}

// λ glyph outline (unit height ≈ 2)
function lambdaShape() {
  const s = new THREE.Shape();
  const P = [
    [-0.6, 1.0],
    [-0.2, 1.0],
    [0.7, -1.0],
    [0.3, -1.0],
    [0.0075, -0.35],
    [-0.45, -1.0],
    [-0.85, -1.0],
    [-0.195, 0.1],
  ];
  s.moveTo(...P[0]);
  for (const p of P.slice(1)) s.lineTo(...p);
  s.closePath();
  return s;
}

// ── Lambda: floating λ with a ring of execution environments around it ──────
const ENV_MAX = 64;
export class LambdaModel extends Model {
  constructor(opts = {}) {
    super('lambda', { category: 'compute', ...opts });
    this.color = CAT_COLOR.compute;
    this.height = 2.3;
    this.radius = 1.3;
    this.anchorY = 1.2;
    this.add(new THREE.CylinderGeometry(1.1, 1.2, 0.32, 6), this.mat('#3b2412'), [0, 0.16, 0]);
    this.add(new THREE.TorusGeometry(1.06, 0.045, 6, 6), this.glow(this.color, 1.6), [0, 0.33, 0], { rot: [Math.PI / 2, 0, Math.PI / 6] });
    const geo = new THREE.ExtrudeGeometry(lambdaShape(), { depth: 0.24, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2 });
    geo.center();
    this.lambda = this.add(geo, this.glow(this.color, 0.55, { roughness: 0.3 }), [0, 1.35, 0], { scale: [0.62, 0.62, 0.62] });
    // execution environments (instanced cubes) on rings around the pedestal
    const envGeo = new RoundedBoxGeometry(0.26, 0.26, 0.26, 2, 0.05);
    this.envMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffb366', emissiveIntensity: 0.35, roughness: 0.4 });
    this.envMat.userData.noLook = true;
    this.envs = new THREE.InstancedMesh(envGeo, this.envMat, ENV_MAX);
    this.envs.castShadow = true;
    this.envs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ENV_MAX * 3), 3);
    this.group.add(this.envs);
    this.slots = [];
    const rings = [
      [1.75, 14],
      [2.3, 22],
      [2.85, 28],
    ];
    for (const [r, n] of rings) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r;
        this.slots.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0, cold: 0, ph: Math.random() * 6 });
      }
    }
    this.envTarget = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._sc = new THREE.Vector3();
    this.finish();
  }

  // concurrency → number of visible cubes (log scale above a dozen)
  setEnvs(conc, coldRate = 0) {
    let n = conc <= 12 ? Math.round(conc) : Math.round(12 + 52 * (Math.log10(conc / 12) / Math.log10(1000 / 12)));
    n = Math.max(0, Math.min(ENV_MAX, n));
    if (conc > 0 && n === 0) n = 1;
    for (let k = this.envTarget; k < n; k++) this.slots[k].cold = 1;
    if (coldRate > 0 && Math.random() < Math.min(0.5, coldRate * 0.02) && n) this.slots[Math.floor(Math.random() * n)].cold = 1;
    this.envTarget = n;
    this.conc = conc;
  }

  animate(dt, t) {
    this.lambda.rotation.y = Math.sin(t * 0.6) * 0.5;
    this.lambda.position.y = 1.35 + Math.sin(t * 1.4) * 0.08;
    let count = 0;
    for (let k = 0; k < this.slots.length; k++) {
      const s = this.slots[k];
      const want = k < this.envTarget ? 1 : 0;
      s.s += (want - s.s) * Math.min(1, dt * 6);
      s.cold = Math.max(0, s.cold - dt * 1.2);
      if (s.s < 0.02) continue;
      this._v.set(s.x, 0.25 + Math.sin(t * 2 + s.ph) * 0.05, s.z);
      this._q.setFromAxisAngle(UP, t * 0.8 + s.ph);
      this._sc.setScalar(s.s);
      this._m.compose(this._v, this._q, this._sc);
      this.envs.setMatrixAt(count, this._m);
      cTmp.copy(cEnv).lerp(cCold, s.cold);
      this.envs.setColorAt(count, cTmp);
      count++;
    }
    this.envs.count = count;
    this.envs.instanceMatrix.needsUpdate = true;
    if (this.envs.instanceColor) this.envs.instanceColor.needsUpdate = true;
  }
}

// ── ECS on Fargate: a deck of task containers, no server underneath ──────────
const TASK_MAX = 6;
export class ECSModel extends Model {
  constructor(opts = {}) {
    super('ecs', { category: 'compute', ...opts });
    this.color = CAT_COLOR.compute;
    this.height = 1.15;
    this.radius = 1.5;
    this.anchorY = 0.95;
    this.add(new RoundedBoxGeometry(2.7, 0.24, 1.9, 2, 0.08), this.mat('#3b2412'), [0, 0.12, 0]);
    this.deckMat = this.glow(this.color, 1.2);
    this.add(new RoundedBoxGeometry(2.74, 0.05, 1.94, 2, 0.02), this.deckMat, [0, 0.265, 0], { shadow: false });
    this.add(new RoundedBoxGeometry(2.56, 0.06, 1.76, 2, 0.03), this.mat('#4a2c16'), [0, 0.32, 0]);
    // tasks fill the front row first, left to right
    const shells = [this.mat('#f97316', { roughness: 0.5 }), this.mat('#ea580c', { roughness: 0.5 })];
    const door = this.mat('#7c2d12');
    const rib = this.mat('#9a3412');
    const shellGeo = new RoundedBoxGeometry(0.72, 0.46, 0.4, 2, 0.04);
    const doorGeo = new THREE.BoxGeometry(0.03, 0.38, 0.32);
    const ribGeo = new THREE.BoxGeometry(0.035, 0.36, 0.42);
    const ledGeo = new THREE.BoxGeometry(0.16, 0.03, 0.08);
    this.tasks = [];
    for (let k = 0; k < TASK_MAX; k++) {
      const g = new THREE.Group();
      g.position.set(((k % 3) - 1) * 0.82, 0.35, k < 3 ? 0.42 : -0.42);
      g.visible = false;
      this.body.add(g);
      this.add(shellGeo, shells[k % 2], [0, 0.23, 0], { parent: g });
      this.add(doorGeo, door, [0.36, 0.23, 0], { parent: g, shadow: false });
      for (const x of [-0.24, -0.08, 0.08, 0.24]) this.add(ribGeo, rib, [x, 0.23, 0], { parent: g, shadow: false });
      const led = this.glow(COLOR.ok, 2);
      led.userData.noLook = true;
      this.add(ledGeo, led, [-0.18, 0.475, 0], { parent: g, shadow: false });
      this.tasks.push({ g, led, s: 0, ph: Math.random() * 6 });
    }
    this.count = 0;
    this.ping = 0;
    this.finish();
  }

  setCount(n) {
    this.count = Math.max(0, Math.min(TASK_MAX, Math.round(n)));
  }

  pulse() {
    this.ping = 1;
  }

  animate(dt, t) {
    const failed = this.state === 'failed';
    const pending = this.state === 'pending';
    this.ping = Math.max(0, this.ping - dt * 2.5);
    this.deckMat.emissiveIntensity = (0.9 + this.ping * 1.5) * (1 - this._fail);
    for (const [k, task] of this.tasks.entries()) {
      task.s += ((k < this.count ? 1 : 0) - task.s) * Math.min(1, dt * 6);
      task.g.visible = task.s > 0.02;
      if (!task.g.visible) continue;
      task.g.scale.setScalar(task.s);
      // starting tasks blink amber, running ones glow green
      const col = failed ? cBad : pending ? cWarn : cOk;
      const on = failed ? 0.1 : pending ? (Math.sin(t * 8 + k) > 0 ? 2.6 : 0.1) : 1.4 + 0.8 * Math.sin(t * 2 + task.ph);
      task.led.color.copy(col);
      task.led.emissive.copy(col);
      task.led.emissiveIntensity = on;
    }
  }
}

// ── API Gateway: an arch requests walk through ───────────────────────────────
export class GateModel extends Model {
  constructor(opts = {}) {
    super(opts.kind || 'apigw', { category: opts.category || 'integration', ...opts });
    this.color = opts.color || CAT_COLOR.integration;
    this.height = 2.45;
    this.radius = 1.4;
    this.anchorY = 1.1;
    const dark = this.mat(opts.dark || '#4a1530');
    const main = this.mat(this.color, { roughness: 0.4 });
    this.add(new THREE.BoxGeometry(1.0, 0.16, 2.7), dark, [0, 0.08, 0]);
    this.add(new RoundedBoxGeometry(0.38, 1.9, 0.38, 2, 0.06), main, [0, 1.11, -1.08]);
    this.add(new RoundedBoxGeometry(0.38, 1.9, 0.38, 2, 0.06), main, [0, 1.11, 1.08]);
    this.add(new RoundedBoxGeometry(0.6, 0.34, 2.7, 2, 0.08), main, [0, 2.2, 0]);
    this.add(new THREE.OctahedronGeometry(0.17), this.glow('#ffffff', 1.4), [0, 2.55, 0]);
    this.portalMat = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.portalMat.userData.noLook = true;
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(1.78, 1.85), this.portalMat);
    portal.rotation.y = Math.PI / 2;
    portal.position.y = 1.1;
    this.body.add(portal);
    this.finish();
  }

  animate(dt, t) {
    this.portalMat.opacity = this.state === 'failed' ? 0.03 : 0.22 + 0.12 * Math.sin(t * 3) + (this.flash || 0) * 0.5;
    this.flash = Math.max(0, (this.flash || 0) - dt * 2);
  }
}

// ── CloudFront: wireframe globe with orbiting edge locations ─────────────────
export class CloudFrontModel extends Model {
  constructor(opts = {}) {
    super('cloudfront', { category: 'network', ...opts });
    this.color = CAT_COLOR.network;
    this.height = 2.6;
    this.radius = 1.4;
    this.anchorY = 1.45;
    this.add(new THREE.CylinderGeometry(0.55, 0.72, 0.3, 24), this.mat('#2e2366'), [0, 0.15, 0]);
    this.add(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 10), this.mat('#8d7fd1'), [0, 0.5, 0]);
    this.globe = new THREE.Group();
    this.globe.position.y = 1.45;
    this.body.add(this.globe);
    this.add(new THREE.SphereGeometry(0.92, 32, 24), this.mat('#7c5cff', { transparent: true, opacity: 0.45, emissive: '#5b3fd6', emissiveIntensity: 0.35 }), [0, 0, 0], { parent: this.globe });
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.97, 2)),
      new THREE.LineBasicMaterial({ color: '#d8ccff', transparent: true, opacity: 0.6 }),
    );
    this.globe.add(wire);
    this.orbits = [];
    for (let k = 0; k < 2; k++) {
      const o = new THREE.Group();
      o.position.y = 1.45;
      o.rotation.set(Math.PI / 2 + (k ? 0.45 : -0.45), 0, k ? 0.3 : -0.3);
      this.add(new THREE.TorusGeometry(1.32, 0.018, 6, 90), this.glow('#a78bfa', 1.4), [0, 0, 0], { parent: o, shadow: false });
      const nodes = [];
      for (let j = 0; j < 3; j++) {
        const n = this.add(new THREE.SphereGeometry(0.09, 12, 10), this.glow('#f3e8ff', 2.2), [0, 0, 0], { parent: o, shadow: false });
        nodes.push({ n, a: (j / 3) * Math.PI * 2 });
      }
      this.body.add(o);
      this.orbits.push({ o, nodes, speed: k ? 0.7 : -0.5 });
    }
    this.finish();
  }

  animate(dt, t) {
    this.globe.rotation.y += dt * 0.35;
    for (const { nodes, speed } of this.orbits) {
      for (const nd of nodes) {
        const a = nd.a + t * speed;
        nd.n.position.set(Math.cos(a) * 1.32, Math.sin(a) * 1.32, 0);
      }
    }
  }
}

// ── Route 53: a DNS signpost with a beacon ───────────────────────────────────
function arrowShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.15);
  s.lineTo(0.92, -0.15);
  s.lineTo(1.14, 0);
  s.lineTo(0.92, 0.15);
  s.lineTo(0, 0.15);
  s.closePath();
  return s;
}

export class Route53Model extends Model {
  constructor(opts = {}) {
    super('route53', { category: 'network', ...opts });
    this.color = CAT_COLOR.network;
    this.height = 2.75;
    this.radius = 1.1;
    this.anchorY = 2.0;
    this.add(new THREE.CylinderGeometry(0.7, 0.82, 0.26, 6), this.mat('#2e2366'), [0, 0.13, 0]);
    this.add(new THREE.CylinderGeometry(0.07, 0.08, 2.35, 12), this.mat('#d5dbe6', { metalness: 0.5 }), [0, 1.4, 0]);
    const geo = new THREE.ExtrudeGeometry(arrowShape(), { depth: 0.07, bevelEnabled: false });
    geo.translate(0.05, 0, -0.035);
    this.signs = [];
    const specs = [
      [2.05, 0.3, '#8C4FFF'],
      [1.66, 2.5, '#a78bfa'],
      [1.27, -1.3, '#6d4bd8'],
    ];
    for (const [y, rot, c] of specs) {
      const m = this.add(geo, this.mat(c, { emissive: c, emissiveIntensity: 0.25 }), [0, y, 0]);
      m.rotation.y = rot;
      this.signs.push({ m, rot });
    }
    this.beacon = this.glow('#ede9fe', 2.2);
    this.add(new THREE.SphereGeometry(0.17, 16, 12), this.beacon, [0, 2.68, 0], { shadow: false });
    this.ping = 0;
    this.finish();
  }

  pulse() {
    this.ping = 1;
  }

  animate(dt, t) {
    this.ping = Math.max(0, this.ping - dt * 2.5);
    for (const [k, s] of this.signs.entries()) s.m.rotation.y = s.rot + Math.sin(t * 0.8 + k) * 0.08;
    if (this.state !== 'failed') this.beacon.emissiveIntensity = 1.4 + Math.sin(t * 3) * 0.4 + this.ping * 3;
  }
}

// ── NAT Gateway: a one-way turnstile under an arrow pointing out to the Internet ──
export class NATModel extends Model {
  constructor(opts = {}) {
    super('nat', { category: 'network', ...opts });
    this.color = CAT_COLOR.network;
    this.height = 2.15;
    this.radius = 1.0;
    this.anchorY = 1.05;
    this.add(new THREE.CylinderGeometry(0.85, 0.95, 0.26, 8), this.mat('#2e2366'), [0, 0.13, 0]);
    this.add(new THREE.CylinderGeometry(0.52, 0.6, 0.85, 8), this.mat(this.color, { roughness: 0.4 }), [0, 0.68, 0]);
    this.add(new THREE.TorusGeometry(0.56, 0.035, 6, 8), this.glow('#c4b5fd', 1.6), [0, 0.9, 0], { rot: [Math.PI / 2, 0, Math.PI / 8], shadow: false });
    this.turn = new THREE.Group();
    this.turn.position.y = 1.12;
    this.body.add(this.turn);
    const metal = this.mat('#e2e8f0', { metalness: 0.6, roughness: 0.3 });
    this.add(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 10), metal, [0, 0.25, 0], { parent: this.turn });
    for (let k = 0; k < 3; k++) {
      const arm = new THREE.Group();
      arm.rotation.y = (k * Math.PI * 2) / 3;
      this.add(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 8), metal, [0.31, 0.38, 0], { rot: [0, 0, Math.PI / 2], parent: arm });
      this.turn.add(arm);
    }
    const geo = new THREE.ExtrudeGeometry(arrowShape(), { depth: 0.12, bevelEnabled: false });
    geo.center();
    this.arrowMat = this.glow('#a78bfa', 1.1);
    this.arrow = this.add(geo, this.arrowMat, [0, 1.88, 0], { scale: [0.75, 0.9, 1], shadow: false });
    this.arrow.rotation.y = opts.out ?? Math.PI; // default: pointing to -x
    this.spin = 0;
    this.finish();
  }

  // a packet went through: spin the turnstile for a moment
  pulse() {
    this.spin = 1;
  }

  animate(dt, t) {
    if (this.state === 'failed') return;
    this.turn.rotation.y += dt * (0.5 + this.spin * 7);
    this.spin = Math.max(0, this.spin - dt * 1.5);
    this.arrow.position.y = 1.88 + Math.sin(t * 2.2) * 0.06;
    this.arrowMat.emissiveIntensity = (0.9 + this.spin * 2) * (1 - this._fail);
  }
}
