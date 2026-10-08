// Physical infrastructure outside the usual Region picture: a server rack (your own data
// centre, or an AWS Outposts rack delivered to it) and a 5G mobile mast (the telecom network
// an AWS Wavelength Zone sits in).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CAT_COLOR, COLOR } from '../palette.js';
import { textTexture } from '../textures.js';
import { Model } from './base.js';

const cOk = new THREE.Color(COLOR.ok);
const cWarn = new THREE.Color(COLOR.warn);
const cBad = new THREE.Color(COLOR.bad);
const cOff = new THREE.Color('#1f2937');

// ── server rack: a tall cabinet of servers with blinking LEDs. `load` speeds the LEDs up;
// over 1 they turn red (requests are being dropped), near 0 they barely blink (idle) ──
export class RackModel extends Model {
  constructor(opts = {}) {
    super(opts.kind || 'server', { category: opts.category || 'foundation', ...opts });
    const aws = this.kind === 'outposts';
    this.color = aws ? CAT_COLOR.compute : '#64748b';
    this.height = 2.35;
    this.radius = 0.8;
    this.anchorY = 1.6;
    this.load = opts.load ?? 0.4;
    this._load = this.load;
    const frame = this.mat(aws ? '#232f3e' : '#3f4756', { roughness: 0.45, metalness: 0.35 });
    const slot = this.mat(COLOR.serverSlot, { roughness: 0.7 });
    this.add(new THREE.BoxGeometry(1.25, 0.1, 1.05), this.mat('#3b475c'), [0, 0.05, 0]);
    this.add(new RoundedBoxGeometry(1.05, 2.1, 0.9, 3, 0.06), frame, [0, 1.15, 0]);
    if (aws) {
      // AWS-orange cap and a sign: the rack is AWS hardware, installed and looked after by AWS
      this.add(new RoundedBoxGeometry(1.1, 0.12, 0.95, 2, 0.04), this.mat(this.color, { emissive: this.color, emissiveIntensity: 0.25 }), [0, 2.24, 0]);
      const sign = new THREE.MeshBasicMaterial({ map: textTexture('AWS', { w: 256, h: 96, bg: '#232f3e', color: '#ff9900', font: '800 70px "Be Vietnam Pro", sans-serif' }), toneMapped: false });
      sign.userData.noLook = true;
      this.add(new THREE.PlaneGeometry(0.62, 0.23), sign, [0, 2.02, 0.456], { shadow: false });
    }
    this.leds = [];
    const rows = aws ? 5 : 6;
    for (let k = 0; k < rows; k++) {
      const y = 0.38 + k * 0.29;
      this.add(new THREE.BoxGeometry(0.86, 0.21, 0.04), slot, [0, y, 0.45]);
      this.add(new THREE.BoxGeometry(0.4, 0.025, 0.02), this.mat('#59657a'), [-0.16, y, 0.475], { shadow: false });
      for (let j = 0; j < 2; j++) {
        const m = this.glow(COLOR.ok, 2.4);
        m.userData.noLook = true;
        this.add(new THREE.BoxGeometry(0.07, 0.07, 0.03), m, [0.2 + j * 0.12, y, 0.48], { shadow: false });
        this.leds.push({ m, phase: Math.random() * 10, rate: 2 + Math.random() * 5 });
      }
    }
    this.finish();
  }

  setLoad(v) {
    this.load = v;
  }

  animate(dt, t) {
    this._load += (this.load - this._load) * Math.min(1, dt * 4);
    const L = this._load;
    const st = this.state;
    for (const [k, led] of this.leds.entries()) {
      let on;
      let col = cOk;
      if (st === 'failed') {
        on = k === 0 && Math.sin(t * 4) > 0.3;
        col = cBad;
      } else if (st === 'off') {
        on = false;
      } else if (st === 'pending') {
        on = Math.sin(t * 6 + k) > 0;
        col = cWarn;
      } else if (L > 1) {
        on = Math.sin(t * 22 + led.phase) > -0.3;
        col = k % 3 ? cBad : cWarn;
      } else {
        on = Math.sin(t * led.rate * (0.15 + L * 3) + led.phase) > (L < 0.1 ? 0.85 : 0.1);
      }
      led.m.color.copy(on ? col : cOff);
      led.m.emissive.copy(on ? col : cOff);
      led.m.emissiveIntensity = on ? 2.4 : 0;
    }
  }
}

// ── 5G mast: a tapered pole with three antenna panels, a blinking beacon and signal rings ──
export class TowerModel extends Model {
  constructor(opts = {}) {
    super('tower', { category: 'compute', ...opts });
    this.color = '#0ea5e9';
    this.height = 3.6;
    this.radius = 0.9;
    this.anchorY = 2.9;
    const steel = this.mat('#94a3b8', { metalness: 0.5, roughness: 0.35 });
    this.add(new THREE.CylinderGeometry(0.75, 0.9, 0.18, 6), this.mat('#475569'), [0, 0.09, 0]);
    this.add(new THREE.CylinderGeometry(0.07, 0.17, 3.2, 10), steel, [0, 1.75, 0]);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
      const p = this.add(new RoundedBoxGeometry(0.2, 0.62, 0.08, 2, 0.03), this.mat('#e2e8f0'), [Math.sin(a) * 0.24, 2.95, Math.cos(a) * 0.24]);
      p.rotation.y = a;
    }
    // cabinet with the 5G sign at the foot of the mast
    this.add(new RoundedBoxGeometry(0.75, 0.6, 0.5, 2, 0.05), this.mat('#334155'), [0.55, 0.48, 0.15]);
    const sign = new THREE.MeshBasicMaterial({ map: textTexture('5G', { w: 256, h: 176, bg: '#0369a1', font: '800 128px "Be Vietnam Pro", sans-serif' }), toneMapped: false });
    sign.userData.noLook = true;
    this.add(new THREE.PlaneGeometry(0.46, 0.32), sign, [0.55, 0.5, 0.405], { shadow: false });
    this.beacon = this.glow('#ef4444', 2);
    this.beacon.userData.noLook = true;
    this.add(new THREE.SphereGeometry(0.07, 12, 8), this.beacon, [0, 3.42, 0], { shadow: false });
    // two signal rings that grow and fade around the antennas
    this.rings = [0, 0.5].map((phase) => {
      const mat = new THREE.MeshBasicMaterial({ color: '#7dd3fc', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      mat.userData.noLook = true;
      const ring = this.add(new THREE.TorusGeometry(0.5, 0.025, 6, 40), mat, [0, 2.95, 0], { rot: [Math.PI / 2, 0, 0], shadow: false });
      return { ring, mat, phase };
    });
    this.finish();
  }

  animate(dt, t) {
    const live = this.state !== 'failed' && this.state !== 'off';
    this.beacon.emissiveIntensity = live && Math.sin(t * 3) > 0.6 ? 2.6 : 0.2;
    for (const r of this.rings) {
      const s = (t * 0.7 + r.phase) % 1;
      r.ring.scale.setScalar(1 + s * 2.6);
      r.mat.opacity = live ? 0.55 * (1 - s) : 0;
    }
  }
}
