// Sandbox view: lays out the architecture chosen in the simulation (Region, AZs, VPC and
// every component), keeps the 3D models in sync with the simulation each frame, streams
// request packets along the routes the simulation reports and turns simulation events
// (earthquake, failures, scaling, failover…) into effects and sounds.
import * as THREE from 'three';
import { AZ_CODE, AZ_IDS, AZ_LABEL } from '../sim/constants.js';
import { Fx, arc } from './fx.js';
import { createModel } from './models/index.js';
import { CAT_COLOR, COLOR } from './palette.js';

const AZ_Y = 0.25;

export const LAYOUT = {
  users: [-33, 0, 0],
  route53: [-21.5, 0, -8],
  cloudfront: [-21, 0, 5.5],
  region: { x: 5, z: 0, w: 39, d: 32 },
  vpc: { x: 9, z: 0, w: 28.6, d: 30.4 },
  az: { a: { x: 11.25, z: -9.4 }, b: { x: 11.25, z: 9.4 }, w: 22.5, d: 10 },
  elb: [-2.6, 0, 0],
  apigw: [-9.6, 0, 0],
  s3: [-10, 0, 10],
  lambda: [8, 0, 0],
  dynamodb: [18.6, 0, 0],
  rdsX: 17.7,
  natX: 1.8,
  external: [-15, 0, -20],
  // subnet tiles inside each AZ strip: [public (NAT) | app servers | data]
  tiles: { pub: { x: 1.8, w: 3.0 }, app: { x: 9.05, w: 10.9 }, data: { x: 17.7, w: 5.6 } },
  asg: { x: 9.05, z: 0, w: 11.4, d: 26.4 },
};

export const HOME_VIEW = {
  target: new THREE.Vector3(-9.5, 0, 1.5),
  dir: new THREE.Vector3(-0.2, 0.66, 0.72).normalize(),
  radius: 37,
  portraitTarget: new THREE.Vector3(-6, 0, 0),
  portraitDir: new THREE.Vector3(-0.72, 0.68, 0.16).normalize(),
};

export function ec2Slot(az, slot, out = new THREE.Vector3()) {
  const col = slot % 5;
  const row = Math.floor(slot / 5);
  const zc = LAYOUT.az[az].z;
  const dz = az === 'a' ? (row === 0 ? 1.9 : -1.9) : row === 0 ? -1.9 : 1.9;
  return out.set(4.8 + col * 2.2, AZ_Y, zc + dz);
}

const TITLES = {
  users: ['Người dùng', 'Internet'],
  route53: ['Route 53', 'DNS'],
  cloudfront: ['CloudFront', 'CDN'],
  s3: ['S3', 'file tĩnh'],
  elb: ['Load Balancer', 'ALB'],
  apigw: ['API Gateway', ''],
  lambda: ['Lambda', ''],
  dynamodb: ['DynamoDB', 'NoSQL'],
};

const pickWeighted = (list) => {
  let r = Math.random();
  for (const x of list) {
    r -= x.w;
    if (r <= 0) return x;
  }
  return list[list.length - 1];
};

const fmtUsers = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + ' triệu' : Math.round(n).toLocaleString('vi-VN'));

export class SandboxScene {
  constructor({ sim, world, sfx, rig }) {
    this.sim = sim;
    this.world = world;
    this.sfx = sfx;
    this.rig = rig;
    this.root = new THREE.Group();
    this.root.name = 'sandbox';
    this.fx = new Fx(this.root);
    this.nodes = new Map();
    this.dying = new Set();
    this.links = new Map();
    this.arcCache = new Map();
    this._spawnAcc = 0;
    this._dnsAcc = 0;
    this._syncAcc = 0;
    this._labelAcc = 0;
    this._calloutClock = new Map();
    this._tmp = new THREE.Vector3();
    this.active = true;
    this.labelsOn = true;
    this._buildStatic();
    this.unsub = sim.on((e) => this._onEvent(e));
  }

  // ── static layout ──────────────────────────────────────────────────────────
  _buildStatic() {
    const L = LAYOUT;
    const region = createModel('region', { id: 'region', w: L.region.w, d: L.region.d, position: [L.region.x, 0, L.region.z] });
    region.setLabel('AWS Region · ap-southeast-1', 'Singapore', { zone: true, y: 0.4 });
    region.label.position.set(-L.region.w / 2 + 6.5, 0.4, L.region.d / 2 - 0.3);
    this._static('region', region);

    for (const az of AZ_IDS) {
      const zone = createModel('az', {
        id: 'az-' + az,
        w: L.az.w,
        d: L.az.d,
        position: [L.az[az].x, AZ_Y, L.az[az].z],
        buildings: 2,
        buildingsAt: 'right',
        seed: az === 'a' ? 3 : 7,
      });
      zone.setLabel(AZ_LABEL[az], AZ_CODE[az], { zone: true, y: 0.5 });
      // just outside the strip's outer-left corner, clear of the NAT Gateway and servers
      zone.label.position.set(-L.az.w / 2 - 1.2, 0.5, az === 'a' ? -L.az.d / 2 + 0.7 : L.az.d / 2 - 0.7);
      zone.azId = az;
      this._static('az-' + az, zone);
      // subnet names are painted on the floor so they never fight the floating labels
      const edge = az === 'a' ? -3.25 : 3.25;
      const tile = (key, t, color, border, text) =>
        this._static(key + az, createModel('subnet', { id: key + az, w: t.w, d: 7.6, color, border, position: [t.x, AZ_Y, L.az[az].z], text, textAt: [0, 0, edge], textSize: 0.42 }));
      const T = L.tiles;
      tile('pubn-', T.pub, COLOR.publicSubnet, '#16a34a', 'PUBLIC');
      tile('appPub-', T.app, COLOR.publicSubnet, '#16a34a', 'PUBLIC SUBNET · WEB');
      tile('appPriv-', T.app, COLOR.privateSubnet, '#2563eb', 'PRIVATE SUBNET · APP');
      tile('data-', T.data, COLOR.privateSubnet, '#2563eb', 'PRIVATE SUBNET · DATA');
    }
    const vpc = createModel('outline', { id: 'vpc', kind: 'vpc', w: L.vpc.w, d: L.vpc.d, r: 1.6, color: '#8C4FFF', position: [L.vpc.x, 0, L.vpc.z] });
    vpc.setLabel('VPC', '10.0.0.0/16', { small: true, zone: true, y: 0.3 });
    vpc.label.position.set(-L.vpc.w / 2 + 1.4, 0.3, L.vpc.d / 2);
    this._static('vpc', vpc);

    const ext = createModel('external', { id: 'external', position: L.external });
    ext.setLabel('Internet · dịch vụ bên ngoài', 'API thanh toán, email…');
    this._static('external', ext);

    const users = createModel('users', { id: 'users', position: L.users });
    users.setLabel(...TITLES.users);
    users.label.position.y = 2.2;
    this._static('users', users);
    this.users = users;
  }

  _static(key, m) {
    this.nodes.set(key, m);
    this.root.add(m.group);
    m.isStatic = true;
  }

  _add(key, m, { beam = true } = {}) {
    this.nodes.set(key, m);
    this.root.add(m.group);
    m.spawn();
    m.setLabelVisible(this.labelsOn);
    if (beam) {
      const p = m.group.position;
      this.fx.beam(p, { color: m.color || '#7dd3fc', r: Math.max(0.9, (m.radius || 1) * 0.9), h: 16, dur: 1.1 });
      this.fx.ring(p, { color: m.color || '#7dd3fc', r0: 0.4, r1: (m.radius || 1) * 2.2, dur: 0.9 });
    }
    return m;
  }

  _remove(key) {
    const m = this.nodes.get(key);
    if (!m) return;
    this.nodes.delete(key);
    this.dying.add(m);
    m.despawn(() => {
      this.dying.delete(m);
      m.dispose();
    });
    this.fx.setEmitter('smoke:' + key, null);
    this.fx.setEmitter('heat:' + key, null);
    for (const k of this.arcCache.keys()) if (k.startsWith(key + '>') || k.endsWith('>' + key)) this.arcCache.delete(k);
  }

  node(key) {
    return this.nodes.get(key) || null;
  }

  // ── keep models in step with the simulation ───────────────────────────────
  _ensure(key, want, make) {
    const m = this.nodes.get(key);
    if (want && !m) {
      const model = make();
      if (TITLES[key]) model.setLabel(...TITLES[key]);
      this._add(key, model);
      this.sfx?.play('build');
    } else if (!want && m) this._remove(key);
  }

  _sync() {
    const sim = this.sim;
    const c = sim.config;
    const L = LAYOUT;
    const ec2 = c.compute === 'ec2';
    this._ensure('route53', c.route53, () => createModel('route53', { id: 'route53', position: L.route53 }));
    this._ensure('cloudfront', c.cloudfront, () => createModel('cloudfront', { id: 'cloudfront', position: L.cloudfront }));
    this._ensure('s3', c.s3, () => createModel('s3', { id: 's3', position: L.s3 }));
    this._ensure('elb', ec2 && c.elb, () => createModel('elb', { id: 'elb', position: L.elb }));
    this._ensure('apigw', !ec2, () => createModel('apigw', { id: 'apigw', position: L.apigw }));
    this._ensure('lambda', !ec2, () => createModel('lambda', { id: 'lambda', position: L.lambda }));
    this._ensure('dynamodb', c.database === 'dynamodb', () => createModel('dynamodb', { id: 'dynamodb', position: L.dynamodb }));
    this._ensure('asg', ec2 && c.asg, () => {
      const m = createModel('outline', { id: 'asg', kind: 'asg', category: 'compute', w: L.asg.w, d: L.asg.d, r: 1.2, color: CAT_COLOR.compute, fill: 0.07, speed: 0.6, thick: 0.16, position: [L.asg.x, AZ_Y + 0.02, L.asg.z] });
      m.setLabel('Auto Scaling Group', '', { color: CAT_COLOR.compute, y: 0.4 });
      m.label.position.set(L.asg.w / 2 - 1.2, 0.4, 0);
      return m;
    });

    // VPC and subnets matter only when something runs inside the VPC
    const inVpc = ec2 || c.database === 'rds';
    const priv = ec2 && c.appSubnet === 'private';
    this.node('vpc').group.visible = inVpc;
    for (const az of AZ_IDS) {
      this.node('pubn-' + az).group.visible = priv;
      this.node('appPub-' + az).group.visible = ec2 && !priv;
      this.node('appPriv-' + az).group.visible = priv;
      this.node('data-' + az).group.visible = c.database === 'rds';
      // smoke keeps rising from a destroyed AZ until it is repaired
      const down = sim.az[az] === 'destroyed';
      const zc = L.az[az];
      for (let k = 0; k < 3; k++) {
        this.fx.setEmitter(`quake:${az}:${k}`, down ? { kind: 'smoke', rate: 1.6, pos: new THREE.Vector3(zc.x - 6 + k * 7, AZ_Y + 0.2, zc.z + (k - 1) * 1.6), color: '#57534e', size: 2.2, alpha: 0.45 } : null);
      }
      const zone = this.node('az-' + az);
      zone.setState(sim.az[az] === 'destroyed' ? 'failed' : 'ok');
      zone.night = this.world.night > 0.5;
      zone.setLabelSub(sim.az[az] === 'destroyed' ? 'MẤT KẾT NỐI' : AZ_CODE[az]);
      zone.setLabelState(sim.az[az] === 'destroyed' ? 'bad' : null);
    }

    // EC2 fleet
    const seen = new Set();
    for (const i of sim.instances) {
      const key = 'ec2:' + i.id;
      let m = this.nodes.get(key);
      if (i.state === 'terminating') {
        if (m) this._remove(key);
        continue;
      }
      seen.add(key);
      if (!m) {
        m = createModel('ec2', { id: key, scale: 1.2 });
        ec2Slot(i.az, i.slot, m.group.position);
        m.setLabel(`EC2 #${i.n}`, '', { small: true });
        m.instId = i.id;
        this._add(key, m, { beam: i.state === 'pending' });
        if (i.state === 'pending') this.sfx?.play('build');
      }
      m.setState(i.state === 'running' ? 'ok' : i.state);
      m.setLoad(i.state === 'running' ? i.cpu : 0);
      const failed = i.state === 'failed';
      m.setLabelState(failed ? 'bad' : i.cpu > 1 ? 'warn' : null);
      this.fx.setEmitter('smoke:' + key, failed ? { kind: 'smoke', rate: 2.2, pos: m.anchor(new THREE.Vector3(), 0.4), size: 1.3 } : null);
      this.fx.setEmitter('heat:' + key, !failed && i.cpu > 1 ? { kind: 'heat', rate: 3, pos: m.anchor(new THREE.Vector3(), 0.9) } : null);
    }
    for (const key of [...this.nodes.keys()]) if (key.startsWith('ec2:') && !seen.has(key)) this._remove(key);

    // RDS primary / standby
    const dbSeen = new Set();
    for (const n of sim.db) {
      const key = 'rds:' + n.id;
      dbSeen.add(key);
      let m = this.nodes.get(key);
      if (!m) {
        m = createModel('rds', { id: key, position: [L.rdsX, AZ_Y, L.az[n.az].z] });
        m.setLabel('RDS', '');
        m.dbId = n.id;
        this._add(key, m);
      }
      m.setState(n.state === 'ok' || n.state === 'creating' ? 'ok' : n.state);
      m.setGhost(n.role === 'standby' || n.state === 'creating');
      m.load = n.load;
      this.fx.setEmitter('smoke:' + key, n.state === 'failed' ? { kind: 'smoke', rate: 2, pos: m.anchor(new THREE.Vector3(), 0.5) } : null);
    }
    for (const key of [...this.nodes.keys()]) if (key.startsWith('rds:') && !dbSeen.has(key)) this._remove(key);

    // NAT Gateways in the public subnet of their AZ
    const natSeen = new Set();
    for (const n of sim.nat) {
      const key = 'nat:' + n.id;
      natSeen.add(key);
      let m = this.nodes.get(key);
      if (!m) {
        m = createModel('nat', { id: key, position: [L.natX, AZ_Y, L.az[n.az].z], scale: 1.15 });
        m.setLabel('NAT Gateway', 'Elastic IP');
        m.natId = n.id;
        this._add(key, m);
      }
      m.setState(n.state === 'ok' ? 'ok' : 'failed');
      this.fx.setEmitter('smoke:' + key, n.state === 'failed' ? { kind: 'smoke', rate: 1.8, pos: m.anchor(new THREE.Vector3(), 0.6) } : null);
    }
    for (const key of [...this.nodes.keys()]) if (key.startsWith('nat:') && !natSeen.has(key)) this._remove(key);

    // day / night
    this.world.setNight(sim.night);
  }

  // labels change a few times per second only
  _labels() {
    const sim = this.sim;
    const f = sim.flows;
    const m = sim.metrics;
    this.users.setUsers(sim.users);
    const mood = m.status === 'down' || m.status === 'degraded' ? 'angry' : m.status === 'slow' ? 'slow' : 'ok';
    this.users.setMood(mood);
    const moodText = { ok: 'đang dùng vui vẻ', slow: 'thấy hơi chậm…', angry: 'không vào được web!' }[mood];
    this.users.setLabelSub(`${fmtUsers(sim.users)} online · ${moodText}`);
    this.users.setLabelState(mood === 'angry' ? 'bad' : mood === 'slow' ? 'warn' : null);
    const cf = this.node('cloudfront');
    if (cf) cf.setLabelSub(`CDN · cache hit ${Math.round(f.cfHit * 100)}%`);
    const elb = this.node('elb');
    if (elb) {
      const healthy = sim.instances.filter((i) => i.registered && i.state === 'running').length;
      elb.setLabelSub(`${healthy} máy khoẻ đang nhận traffic`);
      elb.setLabelState(f.noTarget ? 'bad' : null);
      elb.activity = Math.min(1, f.appRps / 2000);
    }
    const lam = this.node('lambda');
    if (lam) {
      const conc = sim.lambda.conc;
      lam.setLabelSub(conc < 0.05 ? 'chờ sự kiện' : `${Math.max(1, Math.round(conc))} bản chạy song song`);
      lam.setLabelState(f.lambdaFail > 0.01 ? 'bad' : null);
    }
    const gw = this.node('apigw');
    if (gw) gw.setLabelState(f.gwFail > 0.01 ? 'bad' : null);
    const asg = this.node('asg');
    if (asg) {
      const run = sim.instances.filter((i) => i.state === 'running' || i.state === 'pending').length;
      asg.setLabelSub(`min ${sim.config.asgMin} · max ${sim.config.asgMax} · đang có ${run}`);
    }
    for (const n of sim.db) {
      const md = this.node('rds:' + n.id);
      if (!md) continue;
      const title = n.role === 'primary' ? 'RDS Primary' : 'RDS Standby';
      if (md._title !== title) {
        md._title = title;
        md.setLabel(title, '');
      }
      const sub = {
        ok: n.role === 'primary' ? `${Math.round(n.load * 100)}% tải` : 'đồng bộ dữ liệu',
        creating: n.role === 'primary' ? 'đang khôi phục…' : 'đang tạo…',
        promoting: 'đang failover…',
        failed: 'HỎNG',
      }[n.state];
      md.setLabelSub(sub);
      md.setLabelState(n.state === 'failed' ? 'bad' : n.state === 'promoting' ? 'warn' : null);
    }
    // with a big fleet the CPU gauges speak for themselves; keep the labels short
    const busy = sim.instances.length > 4;
    for (const n of sim.nat) {
      const md = this.node('nat:' + n.id);
      if (!md) continue;
      md.setLabelSub(n.state === 'failed' ? 'HỎNG' : sim.config.nat === 'single' ? 'dùng chung cho cả 2 AZ' : `riêng cho ${AZ_LABEL[n.az]}`);
      md.setLabelState(n.state === 'failed' ? 'bad' : null);
    }
    const ext = this.node('external');
    ext.setLabelState(f.outFailRps > 0.01 ? 'warn' : null);
    ext.setLabelSub(f.outFailRps > 0.01 ? 'một số server không gọi ra được!' : 'API thanh toán, email…');
    for (const i of sim.instances) {
      const md = this.node('ec2:' + i.id);
      if (!md) continue;
      md.setLabelSub(i.state === 'failed' ? 'HỎNG' : i.state === 'pending' ? 'khởi động…' : `CPU ${Math.round(i.cpu * 100)}%`);
      if (!md.removing) md.setLabelVisible(this.labelsOn && (!busy || i.state === 'failed'));
    }
  }

  // ── request packets ───────────────────────────────────────────────────────
  _anchorOf(key) {
    const m = this.nodes.get(key);
    if (!m) return null;
    if (!m._anchor) m._anchor = m.anchor(new THREE.Vector3());
    return m._anchor;
  }

  _seg(fromKey, toKey) {
    const k = fromKey + '>' + toKey;
    let s = this.arcCache.get(k);
    if (!s) {
      const a = this._anchorOf(fromKey);
      const b = this._anchorOf(toKey);
      if (!a || !b) return null;
      s = arc(a, b);
      this.arcCache.set(k, s);
    }
    return s;
  }

  _spawnPacket() {
    const f = this.sim.flows;
    const segs = [];
    let from = null;
    let failSeg = -1;
    const start = this.users.randomPerson(new THREE.Vector3());
    const hop = (key) => {
      const b = this._anchorOf(key);
      if (!b) return false;
      segs.push(from ? this._seg(from, key) : arc(start, b));
      from = key;
      return true;
    };
    const fail = () => (failSeg = segs.length - 1);
    const isStatic = Math.random() < f.staticShare;
    let color = isStatic ? COLOR.static : COLOR.dynamic;
    if (f.cf) {
      hop('cloudfront');
      if (isStatic && Math.random() < f.cfHit) return this._emit(segs, color, -1, 'cloudfront');
    }
    if (isStatic && f.s3) {
      hop('s3');
      return this._emit(segs, color, -1);
    }
    if (f.compute === 'ec2') {
      if (f.elb) {
        hop('elb');
        if (f.noTarget) {
          fail();
          return this._emit(segs, color, failSeg);
        }
      }
      if (!f.targets.length) {
        if (!segs.length) return null;
        fail();
        return this._emit(segs, color, failSeg);
      }
      const t = pickWeighted(f.targets);
      if (!hop('ec2:' + t.id)) return null;
      if (Math.random() < t.fail) {
        fail();
        return this._emit(segs, color, failSeg);
      }
      // some dynamic requests also call an outside API: that call needs a way out
      if (!isStatic && Math.random() < f.outboundShare) {
        this._outbound('ec2:' + t.id, t.out);
        if (t.out && !t.out.ok) {
          fail();
          return this._emit(segs, color, failSeg);
        }
      }
    } else {
      hop('apigw');
      if (Math.random() < f.gwFail) {
        fail();
        return this._emit(segs, color, failSeg);
      }
      hop('lambda');
      if (Math.random() < f.lambdaFail) {
        fail();
        return this._emit(segs, color, failSeg);
      }
      if (!isStatic && Math.random() < f.outboundShare) this._outbound('lambda', { ok: true, via: null });
    }
    if (!isStatic && f.db !== 'none' && f.dbTarget) {
      const key = f.db === 'dynamodb' ? 'dynamodb' : 'rds:' + f.dbTarget;
      if (hop(key)) {
        color = COLOR.dynamic;
        if (Math.random() < f.dbFail) fail();
      }
    }
    return this._emit(segs, color, failSeg);
  }

  // an outside API call: server → (NAT Gateway) → Internet, or nowhere when there is no way out
  _outbound(fromKey, way) {
    const a = this._anchorOf(fromKey);
    if (!a || !way) return;
    const opts = { color: COLOR.outbound, size: 0.75, speed: 12 };
    if (way.via) {
      const natKey = 'nat:' + way.via;
      const s1 = this._seg(fromKey, natKey);
      if (!s1) return;
      if (!way.ok) {
        this.fx.packets.spawn([s1], { ...opts, failSeg: 0 });
        return;
      }
      const s2 = this._seg(natKey, 'external');
      if (s2) this.fx.packets.spawn([s1, s2], { ...opts, onHop: (k) => k === 0 && this.node(natKey)?.pulse() });
    } else if (way.ok) {
      const s = this._seg(fromKey, 'external');
      if (s) this.fx.packets.spawn([s], opts);
    } else {
      // private subnet without NAT: the call has nowhere to go
      const b = a.clone().add(new THREE.Vector3(-1.4, 0.6, 0));
      this.fx.packets.spawn([arc(a, b, 0.8)], { ...opts, speed: 5, failSeg: 0 });
    }
  }

  _emit(segs, color, failSeg, endKey) {
    if (!segs.length || segs.some((s) => !s)) return null;
    const speed = 13 + Math.random() * 3;
    return this.fx.packets.spawn(segs, {
      color,
      speed,
      size: 0.9 + Math.random() * 0.3,
      failSeg,
      onDone: endKey === 'cloudfront' ? () => this._edgeHit() : null,
    });
  }

  _edgeHit() {
    const cf = this.node('cloudfront');
    if (cf && Math.random() < 0.08) this.fx.glowBurst(this._anchorOf('cloudfront'), { color: '#c4b5fd', size: 2.2, life: 0.4 });
  }

  _packets(dt) {
    const f = this.sim.flows;
    if (!f || !(f.rps > 0)) return;
    const rate = Math.min(170, 5 * Math.pow(f.rps, 0.36)) * this.speed;
    this._spawnAcc += dt * rate;
    let guard = 0;
    while (this._spawnAcc >= 1 && guard++ < 20) {
      this._spawnAcc -= 1;
      this._spawnPacket();
    }
    // DNS lookups go to Route 53 first (most are cached, so only a trickle)
    if (f.route53 && this.node('route53')) {
      this._dnsAcc += dt * rate * 0.12;
      while (this._dnsAcc >= 1) {
        this._dnsAcc -= 1;
        const a = this.users.randomPerson(new THREE.Vector3());
        const b = this._anchorOf('route53');
        this.fx.packets.spawn([arc(a, b)], { color: COLOR.dns, speed: 12, size: 0.7, onDone: () => this.node('route53')?.pulse() });
      }
    }
    // synchronous replication stream primary → standby
    const db = this.sim.db;
    const p = db.find((n) => n.role === 'primary' && n.state === 'ok');
    const s = db.find((n) => n.role === 'standby' && n.state === 'ok');
    if (p && s) {
      this._replAcc = (this._replAcc || 0) + dt * 2.5 * this.speed;
      if (this._replAcc >= 1) {
        this._replAcc = 0;
        const seg = this._seg('rds:' + p.id, 'rds:' + s.id);
        if (seg) this.fx.packets.spawn([seg], { color: COLOR.db, speed: 9, size: 0.7 });
      }
    }
  }

  // floating error codes over the nodes that are dropping requests
  _callouts(dt) {
    const f = this.sim.flows;
    for (const [k, v] of this._calloutClock) this._calloutClock.set(k, v - dt);
    const say = (key, text, kind = 'bad', every = 1.8) => {
      if ((this._calloutClock.get(key) ?? 0) > 0) return;
      this._calloutClock.set(key, every);
      const a = this._anchorOf(key);
      if (a) this.fx.callout(new THREE.Vector3(a.x, a.y + 1.6, a.z), text, { kind });
    };
    if (f.compute === 'ec2') {
      if (f.noTarget && f.elb) say('elb', '503 · không còn server');
      let noWayOut = false;
      for (const t of f.targets) {
        if (t.out && !t.out.ok && f.outFailRps > 0) {
          if (t.out.via) say('nat:' + t.out.via, 'NAT hỏng · mất đường ra Internet', 'bad', 2.4);
          else if (!noWayOut) {
            noWayOut = true;
            say('ec2:' + t.id, 'Không có đường ra Internet', 'bad', 2.4);
          }
        }
        if (t.fail < 0.05) continue;
        const inst = this.sim.instance(t.id);
        if (!inst) continue;
        say('ec2:' + t.id, inst.state === 'failed' ? 'Không phản hồi' : '503 · quá tải');
      }
    } else {
      if (f.gwFail > 0.02) say('apigw', '429 Too Many Requests');
      if (f.lambdaFail > 0.02) say('lambda', '429 · vượt giới hạn');
    }
    if (f.dbFail > 0.05 && f.dbTarget) say(f.db === 'dynamodb' ? 'dynamodb' : 'rds:' + f.dbTarget, '500 · lỗi database');
  }

  // ── simulation events → effects ───────────────────────────────────────────
  _onEvent(e) {
    if (!this.active) return;
    const pos = (key) => this._anchorOf(key);
    switch (e.type) {
      case 'quake': {
        const zone = this.node('az-' + e.az);
        const c = zone.group.position;
        this.rig?.shake(1.1, 3);
        this.fx.dust(c, { w: LAYOUT.az.w, d: LAYOUT.az.d, n: 70 });
        for (let k = 0; k < 6; k++) {
          const p = new THREE.Vector3(c.x + (Math.random() - 0.5) * 18, c.y + 0.3, c.z + (Math.random() - 0.5) * 7);
          this.fx.sparks(p, { n: 12, speed: 5 });
        }
        this.fx.callout(new THREE.Vector3(c.x, 3.5, c.z), `ĐỘNG ĐẤT · ${AZ_LABEL[e.az]}`, { kind: 'bad', dur: 3, rise: 2 });
        this.sfx?.play('quake');
        break;
      }
      case 'azRestored': {
        const zone = this.node('az-' + e.az);
        this.fx.ring(zone.group.position, { color: '#7dd3fc', r0: 1, r1: 14, dur: 1.6 });
        break;
      }
      case 'serverFail': {
        if (!e.id) break;
        const a = pos('ec2:' + e.id);
        if (!a) break;
        this.fx.sparks(a, { n: 26, speed: 5 });
        this.fx.glowBurst(a, { color: '#ff6b3d', size: 4, life: 0.5 });
        this.fx.smokePuff(a, { n: 6, size: 1.6, color: '#1f2937' });
        this.fx.callout(new THREE.Vector3(a.x, a.y + 2, a.z), 'Hỏng phần cứng!', { kind: 'bad', dur: 2.4 });
        this.sfx?.play('zap');
        break;
      }
      case 'instancesLost':
        this.sfx?.play('zap');
        break;
      case 'hcFail': {
        const a = pos('ec2:' + e.id);
        if (!a) break;
        this.fx.ring({ x: a.x, y: AZ_Y, z: a.z }, { color: COLOR.bad, r0: 0.6, r1: 2.6, dur: 1 });
        this.fx.callout(new THREE.Vector3(a.x, a.y + 2.2, a.z), 'Health check ✗', { kind: 'warn' });
        break;
      }
      case 'scaleOut':
      case 'asgReplace':
      case 'rebalance': {
        const asg = this.node('asg');
        if (asg) asg.flash = 1;
        break;
      }
      case 'dbFailoverStart': {
        const n = this.sim.db.find((d) => d.state === 'promoting');
        const a = n && pos('rds:' + n.id);
        if (a) {
          this.fx.callout(new THREE.Vector3(a.x, a.y + 2.2, a.z), 'Failover…', { kind: 'warn', dur: 2.5 });
          this.fx.beam(new THREE.Vector3(a.x, AZ_Y, a.z), { color: '#f0abfc', r: 1.1, h: 10, dur: 2 });
        }
        this.sfx?.play('alert');
        break;
      }
      case 'dbFailoverDone': {
        const n = this.sim.db.find((d) => d.role === 'primary' && d.state === 'ok');
        const a = n && pos('rds:' + n.id);
        if (a) {
          this.fx.ring({ x: a.x, y: AZ_Y, z: a.z }, { color: '#f0abfc', r0: 0.5, r1: 4, dur: 1.2 });
          this.fx.callout(new THREE.Vector3(a.x, a.y + 2.2, a.z), 'Primary mới ✓', { kind: 'good', dur: 2.5 });
        }
        this.sfx?.play('good');
        break;
      }
      case 'dbFail': {
        const n = this.sim.db.find((d) => d.id === e.id);
        const a = n && pos('rds:' + n.id);
        if (a) {
          this.fx.sparks(a, { n: 24, speed: 5 });
          this.fx.callout(new THREE.Vector3(a.x, a.y + 2.2, a.z), 'Hỏng ổ đĩa!', { kind: 'bad', dur: 2.4 });
        }
        this.sfx?.play('zap');
        break;
      }
      case 'spike': {
        const a = this.users.group.position;
        this.fx.callout(new THREE.Vector3(a.x, 4, a.z), '1.000.000 người!', { kind: 'warn', dur: 3, rise: 2 });
        this.sfx?.play('crowd');
        break;
      }
      case 'siteDown':
        this.sfx?.play('alarm');
        break;
      case 'siteOk':
        this.sfx?.play('good');
        break;
      case 'repair':
        this.sfx?.play('repair');
        break;
      case 'lesson':
        this.sfx?.play('lesson');
        break;
      default:
        break;
    }
  }

  // ── public ────────────────────────────────────────────────────────────────
  // drop every dynamic model and effect (after a reset / preset load)
  rebuild() {
    for (const key of [...this.nodes.keys()]) {
      const m = this.nodes.get(key);
      if (m.isStatic) continue;
      this.nodes.delete(key);
      m.dispose();
    }
    for (const m of this.dying) m.dispose();
    this.dying.clear();
    this.arcCache.clear();
    this.fx.clear();
    this._calloutClock.clear();
    for (const az of AZ_IDS) this.node('az-' + az).setState('ok');
  }

  setActive(v) {
    this.active = v;
    this.root.visible = v;
    if (!v) this.fx.clear();
  }

  setLabels(v) {
    this.labelsOn = v;
    for (const m of this.nodes.values()) {
      if (m.label && !m.isStatic) m.setLabelVisible(v);
    }
  }

  // world position + framing distance for a component key (palette hover / focus)
  focusInfo(key) {
    const L = LAYOUT;
    const map = {
      users: [L.users, 18],
      route53: [L.route53, 11],
      cloudfront: [L.cloudfront, 11],
      s3: [L.s3, 11],
      elb: [L.elb, 13],
      apigw: [L.apigw, 11],
      lambda: [L.lambda, 14],
      dynamodb: [L.dynamodb, 11],
      asg: [[L.asg.x, 0, L.asg.z], 30],
      nat: [[L.natX, 0, 0], 26],
      external: [L.external, 14],
      ec2: [[9, 0, 0], 30],
      rds: [[L.rdsX, 0, 0], 26],
      'az-a': [[L.az.a.x, 0, L.az.a.z], 26],
      'az-b': [[L.az.b.x, 0, L.az.b.z], 26],
    };
    const v = map[key];
    if (!v) return null;
    return { target: new THREE.Vector3(...v[0]), dist: v[1] };
  }

  highlight(key) {
    for (const [k, m] of this.nodes) {
      const match = key && (k === key || k.startsWith(key + ':') || (key === 'rds' && k.startsWith('rds:')) || (key === 'ec2' && k.startsWith('ec2:')));
      m.highlighted = !!match;
    }
  }

  update(dt, speed = 1) {
    this.speed = speed;
    this._sync();
    this._labelAcc -= dt;
    if (this._labelAcc <= 0) {
      this._labelAcc = 0.25;
      this._labels();
    }
    if (speed > 0) {
      this._packets(dt);
      this._callouts(dt * speed);
    }
    for (const m of this.nodes.values()) m.update(dt);
    for (const m of this.dying) m.update(dt);
    const lam = this.node('lambda');
    if (lam) lam.setEnvs(this.sim.lambda.conc, this.sim.lambda.coldRate);
    this.fx.packets.timeScale = Math.max(0.0001, speed);
    this.fx.update(dt);
  }

  dispose() {
    this.unsub?.();
    this.fx.clear();
    for (const m of this.nodes.values()) m.dispose();
    this.root.removeFromParent();
  }
}
