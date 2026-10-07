// Analytics models: a table of data stored by row or by column (CSV vs Parquet, a row-store
// database vs Redshift), the Redshift cluster, a Quick Sight dashboard and a results board
// (a query's bill, search hits, an inverted index).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CAT_COLOR } from '../palette.js';
import { Model } from './base.js';

const FONT = '"Be Vietnam Pro", sans-serif';

// ── a table of data laid out as stored: rows (one per month — a partition) × columns. By row (CSV,
// a row-store database) the cells of a row sit together, so reading one column still means reading
// whole rows; by column (Parquet, Redshift) each column is its own compressed block. `state` picks
// the layout and what a query reads: 'row' / 'col' (idle), 'row-all' (everything), 'row-one' (one
// row — an OLTP lookup), 'col-some' (only the columns in `pick`), 'col-part' (those columns, only
// in the partitions in `part`). `count` = rows of data landed so far. ──
const TINTS = ['#94a3b8', '#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb923c', '#e879f9'];
const DARK = new THREE.Color('#1e2533');
const MODES = {
  row: { layout: 0 },
  col: { layout: 1 },
  'row-all': { layout: 0, lit: () => true },
  'row-one': { layout: 0, lit: (m, i) => i === m.one },
  'col-some': { layout: 1, lit: (m, i, j) => m.pick.includes(j) },
  'col-part': { layout: 1, lit: (m, i, j) => m.pick.includes(j) && m.part.includes(i) },
};

export class TableModel extends Model {
  constructor(opts = {}) {
    super('table', { category: 'analytics', ...opts });
    this.color = CAT_COLOR.analytics;
    this.rows = opts.rows || 6;
    this.cols = opts.cols || 6;
    this.pick = opts.pick || [3, 5];
    this.part = opts.part || [this.rows - 1];
    this.one = opts.one ?? this.rows - 1;
    this.layout0 = opts.layout === 'col' ? 1 : 0;
    this.cw = 0.6;
    this.cd = 0.32;
    this.ch = 0.24;
    const W = this.cols * this.cw + (this.cols - 1) * 0.18 + 0.5;
    const D = this.rows * this.cd + (this.rows - 1) * 0.16 + 0.5;
    this.height = 0.45;
    this.radius = Math.max(W, D) / 2;
    this.anchorY = 0.45;
    this.add(new RoundedBoxGeometry(W, 0.16, D, 2, 0.05), this.mat('#273041'), [0, 0.08, 0]);
    // a thin glowing rim around the foot of the base
    this.add(new RoundedBoxGeometry(W + 0.1, 0.04, D + 0.1, 2, 0.02), this.glow(this.color, 0.8), [0, 0.02, 0], { shadow: false });
    const geo = new RoundedBoxGeometry(this.cw, this.ch, this.cd, 2, 0.04);
    this.cells = [];
    this.rowS = [];
    for (let i = 0; i < this.rows; i++) {
      this.rowS.push(i < (opts.count ?? this.rows) ? 1 : 0);
      for (let j = 0; j < this.cols; j++) {
        const tint = new THREE.Color(TINTS[j % TINTS.length]);
        const m = new THREE.MeshStandardMaterial({ color: tint.clone(), emissive: tint.clone(), emissiveIntensity: 0.15, roughness: 0.5 });
        m.userData.noLook = true;
        const mesh = this.add(geo, m, [0, 0, 0], { shadow: false });
        this.cells.push({ i, j, m, mesh, tint, idle: tint.clone().lerp(DARK, 0.45), dim: tint.clone().lerp(DARK, 0.86), glow: 0.1 });
      }
    }
    this.count = opts.count ?? this.rows;
    this.k = this.layout0;
    this.finish();
    this._place();
  }

  get mode() {
    return MODES[this.state] || { layout: this.layout0 };
  }

  // rows of data landed so far
  setCount(n) {
    this.count = Math.max(0, Math.min(this.rows, Math.round(n)));
  }

  _x(j, k) {
    const gap = 0.01 + k * 0.17;
    return (j - (this.cols - 1) / 2) * (this.cw + gap);
  }

  _z(i, k) {
    const gap = 0.16 - k * 0.11;
    return (i - (this.rows - 1) / 2) * (this.cd + gap);
  }

  _place() {
    const sh = 1 - this.k * 0.45; // a column of Parquet is compressed
    for (const c of this.cells) {
      const s = this.rowS[c.i];
      c.mesh.visible = s > 0.02;
      c.mesh.position.set(this._x(c.j, this.k), 0.16 + (this.ch * sh * s) / 2, this._z(c.i, this.k));
      c.mesh.scale.set(1, Math.max(0.001, sh * s), 1);
    }
  }

  // packet anchors: 'c0'… the top of a column, 'r0'… the middle of a row
  pinWorld(name, out = new THREE.Vector3()) {
    const m = /^([cr])(\d+)$/.exec(name || '');
    const y = 0.16 + this.ch + 0.1;
    if (!m) out.set(0, y, 0);
    else if (m[1] === 'c') out.set(this._x(Math.min(+m[2], this.cols - 1), this.k), y, 0);
    else out.set(0, y, this._z(Math.min(+m[2], this.rows - 1), this.k));
    this.group.updateWorldMatrix(true, false);
    return this.group.localToWorld(out);
  }

  animate(dt, t) {
    const mode = this.mode;
    this.k += (mode.layout - this.k) * Math.min(1, dt * 3);
    for (let i = 0; i < this.rows; i++) this.rowS[i] += ((i < this.count ? 1 : 0) - this.rowS[i]) * Math.min(1, dt * 5);
    this._place();
    const scanning = !!mode.lit;
    const alive = 1 - this._fail * 0.85;
    // a whole table lit at once would bloom into a white sheet: the more cells a read covers, the
    // softer each one glows
    let litCount = 0;
    if (scanning) for (const c of this.cells) if (mode.lit(this, c.i, c.j)) litCount++;
    const soft = 1 - 0.55 * (litCount / this.cells.length);
    for (const c of this.cells) {
      const lit = scanning && mode.lit(this, c.i, c.j);
      // a read sweeps from the oldest row (back) to the newest (front)
      const wave = Math.max(0, Math.sin(t * 3.2 - c.i * 0.7));
      const target = lit ? c.tint : scanning ? c.dim : c.idle;
      c.m.color.lerp(target, Math.min(1, dt * 6));
      c.m.emissive.copy(c.m.color);
      const want = lit ? (0.45 + wave * wave * 0.75) * soft : scanning ? 0 : 0.1;
      c.glow += (want - c.glow) * Math.min(1, dt * (lit ? 12 : 6));
      c.m.emissiveIntensity = c.glow * alive;
    }
  }
}

// ── Redshift: a leader node in front of up to eight compute nodes. The leader plans a query and
// hands each node its slice of the data; the nodes scan their columns in parallel. `count` =
// compute nodes (Serverless: capacity follows the queries, none while idle), `load` = how hard
// they are scanning ──
const RS_MAX = 8;
const RS_SPOTS = [
  [-0.42, -0.2],
  [0.42, -0.2],
  [-1.26, -0.2],
  [1.26, -0.2],
  [-0.42, -0.95],
  [0.42, -0.95],
  [-1.26, -0.95],
  [1.26, -0.95],
];

export class RedshiftModel extends Model {
  constructor(opts = {}) {
    super('redshift', { category: 'analytics', ...opts });
    this.color = CAT_COLOR.analytics;
    this.height = 1.5;
    this.radius = 1.9;
    this.anchorY = 1.05;
    this.add(new RoundedBoxGeometry(3.5, 0.24, 2.9, 2, 0.08), this.mat('#30260a'), [0, 0.12, -0.2]);
    // a thin glowing rim around the foot of the base
    this.add(new RoundedBoxGeometry(3.6, 0.04, 3.0, 2, 0.02), this.glow(this.color, 0.9), [0, 0.02, -0.2], { shadow: false });
    // the leader node at the front: it takes the SQL, plans it and merges the results
    this.add(new RoundedBoxGeometry(1.2, 0.62, 0.62, 2, 0.08), this.mat('#5b4a12'), [0, 0.56, 0.78]);
    this.leaderMat = this.glow('#fbbf24', 0.4);
    this.leaderMat.userData.noLook = true;
    this.add(new RoundedBoxGeometry(1.0, 0.05, 0.42, 2, 0.02), this.leaderMat, [0, 0.89, 0.78], { shadow: false });
    // compute nodes: stacks of column blocks
    const body = this.mat('#7a5c0e', { roughness: 0.4 });
    const bandGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24);
    this.nodes = [];
    for (let k = 0; k < RS_MAX; k++) {
      const g = new THREE.Group();
      g.position.set(RS_SPOTS[k][0], 0.26, RS_SPOTS[k][1]);
      this.body.add(g);
      this.add(new THREE.CylinderGeometry(0.28, 0.3, 0.86, 24), body, [0, 0.43, 0], { parent: g });
      const bands = [];
      for (let b = 0; b < 3; b++) {
        const m = this.glow('#fde68a', 0.6);
        m.userData.noLook = true;
        this.add(bandGeo, m, [0, 0.2 + b * 0.25, 0], { parent: g, shadow: false });
        bands.push(m);
      }
      this.nodes.push({ g, s: 0, bands });
    }
    this.count = Math.max(0, Math.min(RS_MAX, opts.count ?? 4));
    for (const [k, n] of this.nodes.entries()) n.s = k < this.count ? 1 : 0;
    this.load = opts.load ?? 0.2;
    this.bump = 0;
    this.finish();
    this.animate(0, 0);
  }

  setCount(n) {
    this.count = Math.max(0, Math.min(RS_MAX, Math.round(n)));
  }

  setLoad(v) {
    this.load = v;
  }

  // a query (or a batch of changes) arrived
  pulse() {
    this.bump = 1;
  }

  // packet anchors: 'leader', 'n0'…'n7' (the top of a compute node)
  pinWorld(name, out = new THREE.Vector3()) {
    const m = /^n(\d)$/.exec(name || '');
    if (m) {
      const [x, z] = RS_SPOTS[Math.min(+m[1], RS_MAX - 1)];
      out.set(x, 1.25, z);
    } else out.set(0, 1.0, 0.78);
    this.group.updateWorldMatrix(true, false);
    return this.group.localToWorld(out);
  }

  animate(dt, t) {
    this.bump = Math.max(0, this.bump - dt * 1.5);
    const alive = this.state === 'failed' ? 0.1 : this.state === 'off' ? 0.35 : 1;
    this.leaderMat.emissiveIntensity = (0.4 + this.bump * 1.2) * alive;
    const speed = 1.5 + this.load * 9;
    for (const [k, n] of this.nodes.entries()) {
      n.s += ((k < this.count ? 1 : 0) - n.s) * Math.min(1, dt * 4);
      n.g.visible = n.s > 0.02;
      if (!n.g.visible) continue;
      n.g.scale.set(n.s, n.s, n.s);
      for (const [b, m] of n.bands.entries()) {
        const p = Math.max(0, Math.sin(t * speed - b * 1.1 + k * 0.6));
        m.emissiveIntensity = (0.35 + p * p * (0.4 + this.load * 1.6)) * alive;
      }
    }
  }
}

// ── a dashboard on a stand (Quick Sight; OpenSearch Dashboards with `chart: 'line'`): a chart and
// a headline number; a packet that lands (a SPICE refresh, new log lines) redraws it ──
export class DashboardModel extends Model {
  constructor(opts = {}) {
    super(opts.kind || 'quicksight', { category: 'analytics', ...opts });
    this.color = CAT_COLOR.analytics;
    this.title = opts.title || 'Doanh thu theo tháng';
    this.kpi = opts.kpi || '';
    this.chart = opts.chart || 'bars';
    this.values = opts.values || [0.32, 0.45, 0.4, 0.58, 0.66, 0.86];
    this.height = 2.6;
    this.radius = 1.4;
    this.anchorY = 1.5;
    this.add(new THREE.CylinderGeometry(0.6, 0.75, 0.2, 24), this.mat('#30260a'), [0, 0.1, 0]);
    this.add(new THREE.CylinderGeometry(0.08, 0.1, 0.62, 10), this.mat('#94a3b8'), [0, 0.5, 0]);
    this.add(new RoundedBoxGeometry(2.5, 1.5, 0.14, 2, 0.06), this.mat('#1e1b2e'), [0, 1.55, 0]);
    this.add(new RoundedBoxGeometry(2.56, 0.12, 0.18, 2, 0.04), this.mat(this.color), [0, 2.3, 0]);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 184;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    scr.userData.noLook = true;
    this.add(new THREE.PlaneGeometry(2.32, 1.33), scr, [0, 1.55, 0.075], { shadow: false });
    this.grow = 1;
    this.shift = 0;
    this.finish();
    this._draw();
  }

  pulse() {
    if (this.chart === 'line') this.shift += 1;
    else this.grow = 0;
  }

  _draw() {
    const g = this.canvas.getContext('2d');
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.fillStyle = '#0f1424';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#e2e8f0';
    g.font = `600 17px ${FONT}`;
    g.fillText(this.title, 12, 24);
    if (this.kpi) {
      g.fillStyle = '#fde68a';
      g.font = `800 20px ${FONT}`;
      g.textAlign = 'right';
      g.fillText(this.kpi, W - 12, 25);
      g.textAlign = 'left';
    }
    const top = 40;
    const bottom = H - 14;
    const v = this.values;
    if (this.chart === 'line') {
      g.strokeStyle = 'rgba(148,163,184,0.18)';
      for (let y = top + 10; y < bottom; y += 30) {
        g.beginPath();
        g.moveTo(10, y);
        g.lineTo(W - 10, y);
        g.stroke();
      }
      g.lineWidth = 4;
      g.strokeStyle = '#fbbf24';
      g.beginPath();
      const n = 24;
      for (let k = 0; k < n; k++) {
        const u = k + this.shift;
        const val = 0.25 + 0.18 * Math.sin(u * 0.9) + 0.12 * Math.sin(u * 2.3) + (u % 7 === 3 ? 0.35 : 0);
        const x = 12 + (k / (n - 1)) * (W - 24);
        const y = bottom - Math.min(1, val) * (bottom - top);
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
      g.lineWidth = 1;
    } else {
      const bw = (W - 24) / v.length;
      v.forEach((val, k) => {
        const h = val * this.grow * (bottom - top);
        g.fillStyle = k === v.length - 1 ? '#fbbf24' : '#a1873a';
        g.fillRect(14 + k * bw, bottom - h, bw - 10, h);
      });
    }
    this.tex.needsUpdate = true;
  }

  animate(dt) {
    if (this.grow < 1) {
      this.grow = Math.min(1, this.grow + dt * 1.2);
      this._draw();
    } else if (this.chart === 'line' && this._drawn !== this.shift) {
      this._drawn = this.shift;
      this._draw();
    }
  }
}

// ── a results board: a small monitor on a stand with a readout floating above it — the model's
// label is an HTML card (title, sub and rows of [text, value, colour?]) so it stays readable at any
// zoom, like the other labels. `count` = rows shown so far (the newest one highlighted); a packet
// sent to the pin 'r0'… lights that row up (a word looked up in an index) ──
export class BoardModel extends Model {
  constructor(opts = {}) {
    super(opts.kind || 'board', { category: 'analytics', ...opts });
    this.color = opts.color || CAT_COLOR.analytics;
    this.rows = opts.rows || [];
    this.height = 1.45;
    this.radius = 0.9;
    this.anchorY = 1.1;
    this.add(new THREE.CylinderGeometry(0.42, 0.55, 0.16, 24), this.mat('#30260a'), [0, 0.08, 0]);
    this.add(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 10), this.mat('#94a3b8'), [0, 0.4, 0]);
    this.add(new RoundedBoxGeometry(1.3, 0.78, 0.1, 2, 0.05), this.mat('#1e1b2e'), [0, 1.0, 0]);
    this.add(new RoundedBoxGeometry(1.34, 0.08, 0.13, 2, 0.03), this.mat(this.color), [0, 1.42, 0]);
    this.scr = this.glow('#fbbf24', 0.5);
    this.scr.userData.noLook = true;
    // abstract readout lines on the screen (the real text is in the card above)
    for (let k = 0; k < 3; k++) this.add(new THREE.BoxGeometry(0.9 - k * 0.22, 0.07, 0.02), this.scr, [-0.1 - k * 0.11, 1.18 - k * 0.17, 0.055], { shadow: false });
    this.count = Math.max(0, Math.min(this.rows.length, opts.count ?? this.rows.length));
    this.fresh = -1;
    this.hit = -1;
    this.finish();
  }

  // the label is the board's card: title + sub, then the rows
  setLabel(title, sub = '', opts = {}) {
    const first = !this.label;
    super.setLabel(title, sub, opts);
    if (first) {
      this._labelEl.classList.add('lbl--board');
      this._rowsEl = document.createElement('ol');
      this._rowsEl.className = 'board-rows';
      this._labelEl.querySelector('.lbl-text').appendChild(this._rowsEl);
    }
    this._drawRows();
    return this.label;
  }

  setCount(n) {
    const c = Math.max(0, Math.min(this.rows.length, Math.round(n)));
    if (c === this.count) return;
    this.fresh = c > this.count ? c - 1 : -1;
    this.count = c;
    this._drawRows();
  }

  pulse(a) {
    const m = /^r(\d+)$/.exec(a?.toPin || '');
    if (!m) return;
    this.hit = +m[1];
    this._drawRows();
    this.hit = -1;
  }

  // packet / callout anchor: the top of the monitor (the rows themselves are HTML)
  pinWorld(name, out = new THREE.Vector3()) {
    this.group.updateWorldMatrix(true, false);
    return this.group.localToWorld(out.set(0, 1.45, 0));
  }

  _drawRows() {
    const ol = this._rowsEl;
    if (!ol) return;
    ol.replaceChildren();
    ol.style.display = this.count ? '' : 'none';
    this.rows.slice(0, this.count).forEach((r, k) => {
      const li = document.createElement('li');
      if (k === this.fresh) li.className = 'is-new';
      if (k === this.hit) li.className = 'is-hit';
      const t = document.createElement('span');
      t.textContent = r[0];
      li.appendChild(t);
      if (r[1]) {
        const v = document.createElement('b');
        v.textContent = r[1];
        if (r[2]) v.style.color = r[2];
        li.appendChild(v);
      }
      ol.appendChild(li);
    });
    this.fresh = -1;
  }

  animate(dt, t) {
    this.scr.emissiveIntensity = (0.45 + 0.15 * Math.sin(t * 2.2)) * (1 - this._fail * 0.9);
  }
}
