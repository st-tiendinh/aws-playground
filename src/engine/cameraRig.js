// Orbit camera with smooth fly-to transitions, screen shake and a view offset that keeps
// the scene centred in the area left free by the side panels.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    const c = new OrbitControls(camera, dom);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 5;
    c.maxDistance = 150;
    c.maxPolarAngle = 1.42;
    c.rotateSpeed = 0.6;
    c.zoomSpeed = 0.9;
    c.panSpeed = 0.8;
    c.screenSpacePanning = false;
    this.controls = c;
    this.tween = null;
    this.shakeAmt = 0;
    this.shakeDecay = 1;
    this._offset = new THREE.Vector3();
    this.insets = { left: 0, right: 0, top: 0, bottom: 0 };
    this.size = { w: 1, h: 1 };
    this.distScale = 1;
    c.addEventListener('start', () => {
      this.tween = null;
      this.onUserMove?.();
    });
  }

  // fly to a target; either an explicit camera position or a distance along a direction
  flyTo({ target, position = null, dir = null, dist = null, duration = 1.3 }) {
    const toT = new THREE.Vector3().copy(target);
    let toP;
    if (position) toP = new THREE.Vector3().copy(position);
    else {
      const d = dir ? new THREE.Vector3().copy(dir) : new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
      d.normalize();
      toP = toT.clone().addScaledVector(d, dist ?? this.camera.position.distanceTo(this.controls.target));
    }
    if (duration <= 0) {
      this.camera.position.copy(toP);
      this.controls.target.copy(toT);
      this.tween = null;
      this.controls.update();
      return;
    }
    this.tween = { fromP: this.camera.position.clone(), fromT: this.controls.target.clone(), toP, toT, t: 0, dur: duration };
  }

  shake(amount = 0.6, duration = 1.5) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
    this.shakeDecay = this.shakeAmt / duration;
  }

  setSize(w, h) {
    this.size = { w, h };
    this._applyProjection();
  }

  setInsets(insets) {
    this.insets = { ...this.insets, ...insets };
    this._applyProjection();
  }

  _applyProjection() {
    const { w, h } = this.size;
    const cam = this.camera;
    cam.aspect = w / h;
    const ox = (this.insets.left - this.insets.right) / 2;
    const oy = (this.insets.top - this.insets.bottom) / 2;
    if (ox || oy) cam.setViewOffset(w, h, -ox, -oy, w, h);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }

  update(dt) {
    this.camera.position.sub(this._offset);
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt / tw.dur;
      const e = ease(Math.min(1, tw.t));
      this.camera.position.lerpVectors(tw.fromP, tw.toP, e);
      this.controls.target.lerpVectors(tw.fromT, tw.toT, e);
      if (tw.t >= 1) this.tween = null;
    }
    this.controls.update();
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt;
      this._offset.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a * 0.6, (Math.random() - 0.5) * a);
      this.camera.position.add(this._offset);
      this.shakeAmt = Math.max(0, this.shakeAmt - this.shakeDecay * dt);
    } else this._offset.set(0, 0, 0);
  }
}
