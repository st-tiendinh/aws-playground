// Backdrop shared by every view: gradient sky dome with stars, a sea of clouds the
// platforms float on (the "cloud" in cloud computing), drifting cloud clusters, sun/moon
// lighting and a day ⇄ night blend.
import * as THREE from 'three';

const SKY_VS = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const SKY_FS = /* glsl */ `
  uniform vec3 topDay; uniform vec3 midDay; uniform vec3 lowDay;
  uniform vec3 topNight; uniform vec3 midNight; uniform vec3 lowNight;
  uniform float night;
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 top = mix(topDay, topNight, night);
    vec3 mid = mix(midDay, midNight, night);
    vec3 low = mix(lowDay, lowNight, night);
    vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, low, smoothstep(0.0, -0.35, h));
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

const DAY = { top: '#1d4ea8', mid: '#86aee8', low: '#5f82c4', fog: '#9fbbe6', hemiSky: '#e8f1ff', hemiGround: '#55688f', hemi: 0.8, sun: 1.75, sunColor: '#fff1dc' };
const NIGHT = { top: '#03061a', mid: '#18224a', low: '#10183a', fog: '#141d42', hemiSky: '#7d8fd6', hemiGround: '#141a36', hemi: 0.42, sun: 0.55, sunColor: '#9fb5ff' };

export class World {
  constructor(renderer, { low = false } = {}) {
    this.renderer = renderer;
    this.low = low;
    const scene = new THREE.Scene();
    this.scene = scene;
    this.night = 0;
    this.nightTarget = 0;

    this.skyUniforms = {
      topDay: { value: new THREE.Color(DAY.top) },
      midDay: { value: new THREE.Color(DAY.mid) },
      lowDay: { value: new THREE.Color(DAY.low) },
      topNight: { value: new THREE.Color(NIGHT.top) },
      midNight: { value: new THREE.Color(NIGHT.mid) },
      lowNight: { value: new THREE.Color(NIGHT.low) },
      night: { value: 0 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.skyUniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);
    this.sky = sky;

    scene.fog = new THREE.Fog(DAY.fog, 120, 330);
    this._fogDay = new THREE.Color(DAY.fog);
    this._fogNight = new THREE.Color(NIGHT.fog);

    this._stars();
    this._lights();
    this._clouds();
  }

  _stars() {
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(0.15 + Math.random() * 0.85);
      const r = 520;
      pos[i * 3] = Math.sin(v) * Math.cos(u) * r;
      pos[i * 3 + 1] = Math.cos(v) * r;
      pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.renderOrder = -9;
    this.scene.add(this.stars);
  }

  _lights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemi);
    s.add(this.hemi);
    const sun = new THREE.DirectionalLight(DAY.sunColor, DAY.sun);
    sun.position.set(-26, 52, 30);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = !this.low;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -48;
    sc.right = 48;
    sc.top = 36;
    sc.bottom = -36;
    sc.near = 10;
    sc.far = 140;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    s.add(sun, sun.target);
    this.sun = sun;
    const fill = new THREE.DirectionalLight('#c7d8ff', 0.32);
    fill.position.set(30, 20, -25);
    s.add(fill);
    this.fill = fill;
  }

  // cloud puffs: one instanced mesh for the sea below and the clusters drifting around
  _clouds() {
    const puffGeo = new THREE.IcosahedronGeometry(1, 2);
    const mat = new THREE.MeshStandardMaterial({ color: '#f3f6ff', roughness: 1, metalness: 0, emissive: '#c3d1f0', emissiveIntensity: 0.14, flatShading: true });
    this.cloudMat = mat;
    const puffs = [];
    const rand = (a, b) => a + Math.random() * (b - a);
    // the sea: a loose ring of big puffs under and around the stage
    for (let i = 0; i < 190; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 95 + 6;
      puffs.push({ x: Math.cos(a) * r * 1.25, y: rand(-11, -6.5) - r * 0.03, z: Math.sin(a) * r, s: rand(3.2, 7), drift: 0 });
    }
    // cushions right under the platforms so they read as floating on clouds
    for (const [cx, cz, w, d] of [
      [6, 0, 36, 30],
      [-30, 0, 14, 14],
    ]) {
      for (let i = 0; i < 26; i++) {
        puffs.push({ x: cx + rand(-w / 2, w / 2), y: rand(-3.8, -2.4), z: cz + rand(-d / 2, d / 2), s: rand(2.2, 4.2), drift: 0 });
      }
    }
    // drifting clusters in the sky
    this.clusters = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rand(-0.2, 0.2);
      const r = rand(48, 85);
      const c = { x: Math.cos(a) * r, y: rand(10, 26), z: Math.sin(a) * r * 0.8, v: rand(0.4, 1.0), start: puffs.length };
      const n = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) puffs.push({ ox: rand(-4, 4), oy: rand(-0.6, 1.4), oz: rand(-2, 2), s: rand(1.6, 3.2), cluster: c });
      c.end = puffs.length;
      this.clusters.push(c);
    }
    const mesh = new THREE.InstancedMesh(puffGeo, mat, puffs.length);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.puffs = puffs;
    this.cloudMesh = mesh;
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    puffs.forEach((p, i) => this._writePuff(p, i, 0));
    this.scene.add(mesh);
  }

  _writePuff(p, i, t) {
    if (p.cluster) {
      const c = p.cluster;
      this._p.set(c.x + p.ox, c.y + p.oy, c.z + p.oz);
    } else {
      this._p.set(p.x + Math.sin(t * 0.05 + i) * 0.4, p.y + Math.sin(t * 0.3 + i * 1.7) * 0.15, p.z);
    }
    this._s.set(p.s, p.s * 0.62, p.s);
    this._m.compose(this._p, this._q, this._s);
    this.cloudMesh.setMatrixAt(i, this._m);
  }

  setNight(v) {
    this.nightTarget = v ? 1 : 0;
  }

  update(dt, t) {
    // clusters drift slowly across the sky and wrap around
    for (const c of this.clusters) {
      c.x += c.v * dt;
      if (c.x > 110) c.x = -110;
    }
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (p.cluster || (i % 3 === Math.floor(t * 10) % 3)) this._writePuff(p, i, t);
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;

    if (this.night !== this.nightTarget) {
      const d = this.nightTarget - this.night;
      this.night = Math.abs(d) < 0.005 ? this.nightTarget : this.night + d * Math.min(1, dt * 1.4);
      const n = this.night;
      this.skyUniforms.night.value = n;
      this.starMat.opacity = n;
      this.scene.fog.color.copy(this._fogDay).lerp(this._fogNight, n);
      this.hemi.intensity = DAY.hemi + (NIGHT.hemi - DAY.hemi) * n;
      this.hemi.color.set(DAY.hemiSky).lerp(new THREE.Color(NIGHT.hemiSky), n);
      this.sun.intensity = DAY.sun + (NIGHT.sun - DAY.sun) * n;
      this.sun.color.set(DAY.sunColor).lerp(new THREE.Color(NIGHT.sunColor), n);
      this.fill.intensity = 0.32 * (1 - n * 0.5);
      this.cloudMat.emissiveIntensity = 0.14 - n * 0.08;
      this.cloudMat.color.set('#f3f6ff').lerp(new THREE.Color('#56628f'), n);
    }
  }
}
