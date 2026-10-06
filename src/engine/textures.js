// Small canvas-generated textures: soft dots for smoke/glow, platform grids, cracks for the
// earthquake, a stylised world map for the globe and text decals.
import * as THREE from 'three';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function done(c, key, opts = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  t.anisotropy = 4;
  if (key) {
    // cached textures are shared between models and must survive a model's dispose()
    t.userData.shared = true;
    cache.set(key, t);
  }
  return t;
}

// soft round blob, white → transparent (tinted by the material colour)
export function softDot() {
  if (cache.has('dot')) return cache.get('dot');
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return done(c, 'dot');
}

// puffy smoke blob with some lumps
export function smokeTexture() {
  if (cache.has('smoke')) return cache.get('smoke');
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 64 + Math.cos(i * 2.4) * 18 * (i % 3);
    const y = 64 + Math.sin(i * 2.4) * 18 * (i % 3);
    const r = 34 - (i % 3) * 6;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  return done(c, 'smoke');
}

// light grid for platform tops
export function gridTexture(line = 'rgba(80,100,140,0.16)', bg = '#ffffff') {
  const key = 'grid' + line + bg;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line;
  g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 256);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(256, i);
    g.stroke();
  }
  return done(c, null, { repeat: [1, 1] });
}

// jagged glowing cracks on a transparent canvas (earthquake damage decal)
export function crackTexture(seed = 1) {
  const key = 'crack' + seed;
  if (cache.has(key)) return cache.get(key);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const c = canvas(512, 512);
  const g = c.getContext('2d');
  const crack = (x, y, ang, len, w, depth) => {
    g.beginPath();
    g.moveTo(x, y);
    let cx = x;
    let cy = y;
    const steps = 6 + Math.floor(rnd() * 5);
    for (let i = 0; i < steps; i++) {
      ang += (rnd() - 0.5) * 0.9;
      cx += Math.cos(ang) * (len / steps);
      cy += Math.sin(ang) * (len / steps);
      g.lineTo(cx, cy);
      if (depth < 2 && rnd() < 0.3) {
        const sx = cx;
        const sy = cy;
        const sa = ang + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6);
        g.stroke();
        crack(sx, sy, sa, len * 0.45, w * 0.6, depth + 1);
        g.beginPath();
        g.moveTo(cx, cy);
      }
    }
    g.lineWidth = w;
    g.stroke();
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // dark gash with a hot glowing core
  for (const pass of [
    { color: 'rgba(30,10,5,0.9)', w: 1 },
    { color: 'rgba(255,120,40,0.95)', w: 0.35 },
  ]) {
    s = seed * 9301 + 49297;
    g.strokeStyle = pass.color;
    for (let i = 0; i < 5; i++) {
      const x = 80 + rnd() * 352;
      const y = 80 + rnd() * 352;
      crack(x, y, rnd() * Math.PI * 2, 160 + rnd() * 140, 14 * pass.w, 0);
    }
  }
  return done(c, key);
}

// lit windows for the data-centre buildings
export function windowsTexture() {
  if (cache.has('windows')) return cache.get('windows');
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#26324a';
  g.fillRect(0, 0, 128, 128);
  for (let y = 10; y < 120; y += 22) {
    for (let x = 8; x < 120; x += 16) {
      const lit = (x * 7 + y * 13) % 5 !== 0;
      g.fillStyle = lit ? '#9ee7ff' : '#3a4866';
      g.fillRect(x, y, 9, 11);
    }
  }
  return done(c, 'windows');
}

// stylised equirectangular world map: blobby continents on a dark ocean
export function worldTexture() {
  if (cache.has('world')) return cache.get('world');
  const W = 1024;
  const H = 512;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#1d3a72';
  g.fillRect(0, 0, W, H);
  const px = (lon) => ((lon + 180) / 360) * W;
  const py = (lat) => ((90 - lat) / 180) * H;
  // [lon, lat, rx(deg), ry(deg), rotation]
  const land = [
    [-105, 50, 32, 16, -0.3], [-95, 35, 18, 12, 0.2], [-120, 62, 25, 10, 0], [-75, 50, 12, 10, 0],
    [-100, 20, 8, 8, 0.5], [-42, 70, 14, 8, 0],
    [-60, -12, 16, 20, 0.2], [-65, -35, 8, 14, 0.15], [-48, -8, 10, 10, 0],
    [15, 50, 18, 9, 0], [25, 60, 16, 8, 0], [0, 45, 8, 6, 0], [-3, 54, 3, 4, 0],
    [20, 5, 20, 22, 0], [30, -20, 13, 14, 0.2], [45, 10, 8, 6, 0.4],
    [90, 55, 50, 14, 0], [100, 35, 30, 14, 0], [78, 20, 10, 10, 0.3], [105, 15, 8, 9, 0],
    [138, 37, 3, 7, 0.6], [120, 0, 14, 5, 0.2], [45, 25, 10, 8, 0],
    [134, -25, 18, 12, 0], [172, -42, 3, 6, 0.4],
  ];
  g.fillStyle = '#3fae7a';
  for (const [lon, lat, rx, ry, rot] of land) {
    g.save();
    g.translate(px(lon), py(lat));
    g.rotate(rot);
    g.beginPath();
    g.ellipse(0, 0, (rx / 360) * W, (ry / 180) * H, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // dotted texture over the land for a "data" look
  const img = g.getImageData(0, 0, W, H);
  g.fillStyle = '#1d3a72';
  g.fillRect(0, 0, W, H);
  for (let y = 4; y < H; y += 8) {
    for (let x = 4; x < W; x += 8) {
      const i = (y * W + x) * 4;
      const isLand = img.data[i + 1] > 120;
      g.fillStyle = isLand ? '#7ee0b0' : 'rgba(120,160,230,0.25)';
      g.beginPath();
      g.arc(x, y, isLand ? 2.6 : 1.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  return done(c, 'world');
}

// text decal, e.g. the λ on Lambda or a label on a token
export function textTexture(text, { size = 256, color = '#ffffff', bg = null, font = '800 150px "Be Vietnam Pro", sans-serif', w, h } = {}) {
  const key = ['txt', text, size, color, bg, font, w, h].join('|');
  if (cache.has(key)) return cache.get(key);
  const c = canvas(w || size, h || size);
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
  }
  g.fillStyle = color;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + c.height * 0.04);
  return done(c, key);
}
