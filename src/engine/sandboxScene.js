// Sandbox view: lays out the architecture chosen in the simulation (Region, AZs, VPC and
// every component), keeps the 3D models in sync with the simulation each frame, streams
// request packets along the routes the simulation reports and turns simulation events
// (earthquake, failures, scaling, failover…) into effects and sounds.
import * as THREE from 'three';
import { AZ_CODE, AZ_IDS, AZ_LABEL, LAMBDA, SQS } from '../sim/constants.js';
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
  cache: [22.6, 0, 0],
  waf: [-14, 0, 3],
  shield: [-14, 0, -3],
  rdsX: 17.7,
  natX: 1.8,
  external: [-15, 0, -20],
  // account-level, outside the Region: AWS Budgets
  budgets: [-27, 0, 11],
  // background work beside the data tier: the SQS queue and the Lambda worker draining it
  sqs: [20.5, 0, -3],
  worker: [20.5, 0, 3],
  // the S3 Gateway Endpoint sits on the VPC edge, on the way to S3
  vpce: [-5.3, 0, 7.5],
  // AWS Backup vault, outside the VPC
  backup: [-10, 0, -9],
  // account-level threat detection, and the miners someone runs with a leaked key in another Region
  guardduty: [-27, 0, -6],
  miners: { x: -27, z: -18.5 },
  // a release being canary-tested: a small EC2 group behind the ALB's second target group, next to
  // the load balancer, or the new Lambda version beside the old one
  canary: [2.5, 0, -3.5],
  lambdaV2: [8.5, 0, -7],
  // subnet tiles inside each AZ strip: [public (NAT) | app servers | data]
  tiles: { pub: { x: 1.8, w: 3.0 }, app: { x: 9.05, w: 10.9 }, data: { x: 17.7, w: 5.6 } },
  asg: { x: 9.05, z: 0, w: 11.4, d: 26.4 },
};

// GuardDuty and the miners sit at the far left of the home view: their callouts lean right so the
// text does not slip under the left panel
const LEAK_TEXT_DX = 2.5;

// everything the sandbox can show, users island to data tier plus the packets arcing above:
// the drifting sky clouds stay out of the way of this box
const BOUNDS = new THREE.Box3(
  new THREE.Vector3(LAYOUT.users[0] - 6.5, -0.5, LAYOUT.external[2] - 2.5),
  new THREE.Vector3(LAYOUT.region.x + LAYOUT.region.w / 2 + 0.5, 8, LAYOUT.region.z + LAYOUT.region.d / 2 + 0.5),
);

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
  cache: ['ElastiCache', 'in-memory'],
  waf: ['AWS WAF', 'lọc request'],
  shield: ['AWS Shield', 'chống DDoS'],
  budgets: ['AWS Budgets', ''],
  sqs: ['Amazon SQS', 'hàng đợi đơn hàng'],
  worker: ['Lambda worker', 'xử lý đơn nền'],
  vpce: ['VPC Endpoint', 'S3 · SQS'],
  backup: ['AWS Backup', 'sao lưu + PITR'],
  guardduty: ['Amazon GuardDuty', 'đọc CloudTrail · Flow Logs · DNS'],
};

const pickWeighted = (list) => {
  let r = Math.random();
  for (const x of list) {
    r -= x.w;
    if (r <= 0) return x;
  }
  return list[list.length - 1];
};

// label of the app tier while a release rolls out all at once
const deploySub = (d) => (d.phase === 'rollback' ? 'đang quay về bản cũ…' : d.share < 1 ? 'đang cài bản v2…' : 'bản v2 · lỗi 500');

const fmtUsers = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + ' triệu' : Math.round(n).toLocaleString('vi-VN'));

export class SandboxScene {
  constructor({ sim, world, sfx, rig }) {
    this.sim = sim;
    this.world = world;
    this.sfx = sfx;
    this.rig = rig;
    this.root = new THREE.Group();
    this.root.name = 'sandbox';
    this.bounds = BOUNDS;
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
    this._ensure('cache', c.database === 'rds' && c.cache, () => createModel('cache', { id: 'cache', position: L.cache }));
    this._ensure('waf', c.waf, () => createModel('waf', { id: 'waf', position: L.waf }));
    this._ensure('shield', c.shield, () => createModel('shield', { id: 'shield', position: L.shield }));
    this._ensure('budgets', c.budget > 0, () => createModel('budgets', { id: 'budgets', position: L.budgets }));
    this._ensure('sqs', c.queue, () => createModel('sqs', { id: 'sqs', position: L.sqs }));
    this._ensure('worker', c.queue, () => createModel('lambda', { id: 'worker', position: L.worker, scale: 0.8 }));
    this._ensure('vpce', c.vpce, () => createModel('vpce', { id: 'vpce', position: L.vpce }));
    this._ensure('backup', c.backup, () => createModel('backup', { id: 'backup', position: L.backup }));
    this._ensure('guardduty', c.guardduty, () => createModel('guardduty', { id: 'guardduty', position: L.guardduty }));
    for (let i = 0; i < 6; i++) {
      this._ensure('miner:' + i, sim.leak.active, () => {
        const m = createModel('miner', { id: 'miner:' + i, position: [L.miners.x + (i % 3) * 1.8 - 1.8, 0, L.miners.z + Math.floor(i / 3) * 1.8] });
        if (i === 1) m.setLabel('Máy đào coin', 'us-east-1 · key bị lộ');
        return m;
      });
    }
    const dep = sim.deploy;
    this._ensure('canary', dep.active && dep.canary && ec2, () => {
      const m = createModel('ec2', { id: 'canary', position: L.canary, scale: 1.1 });
      m.setLabel('EC2 · bản v2', 'canary 10%', { small: true });
      return m;
    });
    this._ensure('lambdaV2', dep.active && dep.canary && !ec2, () => {
      const m = createModel('lambda', { id: 'lambdaV2', position: L.lambdaV2, scale: 0.8 });
      m.setLabel('Lambda · bản v2', 'canary 10%');
      return m;
    });
    // SQS backlog (log scale: 1 → 1 message, 10 → 4, 100 → 8, 1000+ → 12), vault, outside APIs
    this.node('sqs')?.setQueue(Math.min(12, Math.ceil(Math.log10(sim.queue.depth + 1) * 4)));
    this.node('backup')?.setState(sim.data.restoring ? 'restoring' : 'ok');
    this.node('external').setState(sim.extDown ? 'off' : 'ok');
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
      const buggy = dep.active && !dep.canary && dep.share > 0.5;
      m.setLabelState(failed || buggy ? 'bad' : i.cpu > 1 ? 'warn' : null);
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

    // NAT Gateways in the public subnet of their AZ — or a Regional NAT Gateway's presence in
    // each AZ, see-through while it is still expanding there
    const natSeen = new Set();
    for (const n of sim.nat) {
      const key = 'nat:' + n.id;
      natSeen.add(key);
      let m = this.nodes.get(key);
      if (!m) {
        m = createModel('nat', { id: key, position: [L.natX, AZ_Y, L.az[n.az].z], scale: 1.15 });
        m._title = n.regional ? 'Regional NAT' : 'NAT Gateway';
        m.setLabel(m._title, n.regional ? '' : 'Elastic IP');
        m.natId = n.id;
        this._add(key, m);
      }
      m.setState(n.state === 'failed' ? 'failed' : 'ok');
      m.setGhost(n.state === 'expanding');
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
    const cache = this.node('cache');
    if (cache) cache.setLabelSub(`cache hit ${Math.round(f.cacheHit * 100)}% · giảm tải RDS`);
    const waf = this.node('waf');
    if (waf) {
      waf.setLabelSub(f.sqliFail > 0.01 ? `đang chặn SQL injection` : 'đang lọc request');
      waf.setLabelState(f.sqliFail > 0.01 ? 'warn' : null);
    }
    const shield = this.node('shield');
    if (shield) {
      shield.setLabelSub(f.ddosBlocked > 1 ? `chặn ${Math.round(f.ddosBlocked).toLocaleString('vi-VN')} req/s DDoS` : 'đang giám sát');
      shield.setLabelState(f.ddosBlocked > 1 ? 'warn' : null);
    }
    const budget = this.node('budgets');
    if (budget && sim.config.budget) {
      const ratio = sim.budget.forecast / sim.config.budget;
      budget.setLevel(ratio);
      budget.setLabelSub(`$${sim.config.budget.toLocaleString('vi-VN')}/tháng · dự báo ${Math.round(ratio * 100)}%`);
      budget.setLabelState(ratio >= 1 ? 'bad' : ratio >= 0.8 ? 'warn' : null);
    }
    const sqs = this.node('sqs');
    if (sqs) {
      const d = sim.queue.depth;
      sqs.setLabelSub(d < 1 ? 'hàng đợi trống' : `${Math.round(d).toLocaleString('vi-VN')} đơn đang chờ`);
      sqs.setLabelState(d >= SQS.backlogWarn ? 'warn' : null);
    }
    const worker = this.node('worker');
    if (worker) {
      const waiting = sim.extDown && sim.queue.depth > 0;
      worker.setLabelSub(waiting ? 'đối tác sập · chờ thử lại' : f.queueOut > 0.5 ? `xử lý ${Math.round(f.queueOut)} đơn/giây` : 'chờ việc');
      worker.setLabelState(waiting ? 'warn' : null);
    }
    this.node('vpce')?.setLabelSub(sim.config.queue ? 'S3 miễn phí · SQS riêng tư' : 'S3 · miễn phí');
    const gd = this.node('guardduty');
    if (gd) {
      gd.setLabelSub(sim.leak.detected && sim.leak.active ? 'FINDING · High' : 'đọc CloudTrail · Flow Logs · DNS');
      gd.setLabelState(sim.leak.detected && sim.leak.active ? 'bad' : null);
    }
    const vault = this.node('backup');
    if (vault) {
      vault.setLabelSub(sim.data.restoring ? `đang khôi phục… ${Math.ceil(sim.data.timer)} giây` : 'hằng ngày + liên tục (PITR)');
      vault.setLabelState(sim.data.restoring ? 'warn' : null);
    }
    const ddb = this.node('dynamodb');
    if (ddb) {
      ddb.setLabelSub(sim.data.wiped ? 'DỮ LIỆU BỊ XOÁ' : 'NoSQL');
      ddb.setLabelState(sim.data.wiped ? 'bad' : null);
    }
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
      const v2 = sim.deploy.active && !sim.deploy.canary;
      lam.setLabelSub(v2 ? deploySub(sim.deploy) : conc < 0.05 ? 'chờ sự kiện' : `${Math.max(1, Math.round(conc))} bản chạy song song`);
      lam.setLabelState(f.lambdaFail > 0.01 || (v2 && sim.deploy.share > 0.5) ? 'bad' : null);
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
      const wiped = sim.data.wiped && n.state === 'ok';
      const sub = wiped
        ? 'DỮ LIỆU BỊ XOÁ'
        : {
            ok: n.role === 'primary' ? `${Math.round(n.load * 100)}% tải` : 'đồng bộ dữ liệu',
            creating: n.role === 'primary' ? 'đang khôi phục…' : 'đang tạo…',
            promoting: 'đang failover…',
            failed: 'HỎNG',
          }[n.state];
      md.setLabelSub(sub);
      md.setLabelState(n.state === 'failed' || wiped ? 'bad' : n.state === 'promoting' ? 'warn' : null);
    }
    // with a big fleet the CPU gauges speak for themselves; keep the labels short
    const busy = sim.instances.length > 4;
    for (const n of sim.nat) {
      const md = this.node('nat:' + n.id);
      if (!md) continue;
      // switching between zonal and Regional NAT keeps the same models: retitle them
      const title = n.regional ? 'Regional NAT' : 'NAT Gateway';
      if (md._title !== title) {
        md._title = title;
        md.setLabel(title, '');
      }
      // while expanding, this AZ's traffic goes through the presence in another AZ (if ready)
      const via = n.state === 'expanding' && sim.nat.find((x) => x !== n && x.state === 'ok');
      let sub;
      if (n.state === 'failed') sub = 'HỎNG';
      else if (n.state === 'expanding') sub = via ? `đang mở rộng… · tạm đi qua ${AZ_LABEL[via.az]}` : 'đang mở rộng…';
      else if (n.regional) sub = `phần ở ${AZ_LABEL[n.az]}`;
      else sub = sim.config.nat === 'single' ? 'dùng chung cho cả 2 AZ' : `riêng cho ${AZ_LABEL[n.az]}`;
      md.setLabelSub(sub);
      md.setLabelState(n.state === 'failed' ? 'bad' : n.state === 'expanding' ? 'warn' : null);
    }
    const ext = this.node('external');
    ext.setLabelState(sim.extDown ? 'bad' : f.outFailRps > 0.01 ? 'warn' : null);
    ext.setLabelSub(sim.extDown ? 'đang sập — không phản hồi!' : f.outFailRps > 0.01 ? 'một số server không gọi ra được!' : 'API thanh toán, email…');
    const canary = this.node('canary') || this.node('lambdaV2');
    if (canary) {
      canary.setLabelSub(sim.deploy.phase === 'rollback' ? 'đang rollback…' : `canary ${Math.round(sim.deploy.share * 100)}% · lỗi 500`);
      canary.setLabelState('bad');
    }
    const v2 = sim.deploy.active && !sim.deploy.canary;
    for (const i of sim.instances) {
      const md = this.node('ec2:' + i.id);
      if (!md) continue;
      md.setLabelSub(i.state === 'failed' ? 'HỎNG' : i.state === 'pending' ? 'khởi động…' : v2 ? deploySub(sim.deploy) : `CPU ${Math.round(i.cpu * 100)}%`);
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
    // a release rolling out: with a canary, `share` of the requests go to the new version's own
    // target (it answers 500 to dynamic ones); all at once, the servers themselves run it
    const dep = f.deploy;
    const toCanary = dep && dep.canary && Math.random() < dep.share;
    const buggy = dep && !dep.canary && !isStatic && Math.random() < dep.share;
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
        if (toCanary && hop('canary')) {
          if (!isStatic) fail();
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
      if (Math.random() < t.fail || buggy) {
        fail();
        return this._emit(segs, color, failSeg);
      }
      // some dynamic requests also call an outside API (that call needs a way out) — or, with
      // SQS, only drop the order into the queue; some read or write files in S3
      const from = 'ec2:' + t.id;
      if (!isStatic && Math.random() < f.outboundShare) {
        const ok = f.queue ? this._toAws(from, 'sqs', t.out) : this._outbound(from, t.out, f.extDown);
        if (!ok) {
          fail();
          return this._emit(segs, color, failSeg);
        }
      }
      if (!isStatic && f.s3AppShare && Math.random() < f.s3AppShare && !this._toAws(from, 's3', t.out)) {
        fail();
        return this._emit(segs, color, failSeg);
      }
    } else {
      hop('apigw');
      if (Math.random() < f.gwFail) {
        fail();
        return this._emit(segs, color, failSeg);
      }
      if (toCanary && hop('lambdaV2')) {
        if (!isStatic) fail();
        return this._emit(segs, color, failSeg);
      }
      hop('lambda');
      if (Math.random() < f.lambdaFail || buggy) {
        fail();
        return this._emit(segs, color, failSeg);
      }
      if (!isStatic && Math.random() < f.outboundShare) {
        const ok = f.queue ? this._toAws('lambda', 'sqs', null) : this._outbound('lambda', { ok: true, via: null }, f.extDown);
        if (!ok) {
          fail();
          return this._emit(segs, color, failSeg);
        }
      }
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

  // an outside API call: server → (NAT Gateway) → Internet, or nowhere when there is no way out.
  // While a Regional NAT Gateway is still expanding into the server's AZ, `way.via` is its
  // presence in the other AZ, so the packet visibly crosses over there.
  // `down`: the provider itself is out, the call dies on arrival. Returns whether it worked.
  _outbound(fromKey, way, down = false) {
    const a = this._anchorOf(fromKey);
    if (!a || !way) return true;
    const opts = { color: COLOR.outbound, size: 0.75, speed: 12 };
    if (way.via) {
      const natKey = 'nat:' + way.via;
      const s1 = this._seg(fromKey, natKey);
      if (!s1) return way.ok && !down;
      if (!way.ok) {
        this.fx.packets.spawn([s1], { ...opts, failSeg: 0 });
        return false;
      }
      const s2 = this._seg(natKey, 'external');
      if (s2) this.fx.packets.spawn([s1, s2], { ...opts, failSeg: down ? 1 : -1, onHop: (k) => k === 0 && this.node(natKey)?.pulse() });
      return !down;
    }
    if (way.ok) {
      const s = this._seg(fromKey, 'external');
      if (s) this.fx.packets.spawn([s], { ...opts, failSeg: down ? 0 : -1 });
      return !down;
    }
    this._deadEnd(a, opts);
    return false;
  }

  // private subnet without a way out: the call has nowhere to go
  _deadEnd(a, opts) {
    const b = a.clone().add(new THREE.Vector3(-1.4, 0.6, 0));
    this.fx.packets.spawn([arc(a, b, 0.8)], { ...opts, speed: 5, failSeg: 0 });
  }

  // a call to an AWS service (S3, SQS) from the app tier. From a private subnet it takes the VPC
  // Endpoint (S3: the gateway on the VPC edge; SQS: an interface inside the subnet, drawn as a
  // direct hop) or else the NAT Gateway; from a public subnet or Lambda it goes straight there.
  _toAws(fromKey, toKey, way) {
    const a = this._anchorOf(fromKey);
    if (!a || !this.node(toKey)) return true;
    const f = this.sim.flows;
    const opts = { color: toKey === 's3' ? '#86efac' : '#f9a8d4', size: 0.7, speed: 12 };
    if (f.priv && f.vpce) {
      const path = toKey === 's3' && this.node('vpce') ? [this._seg(fromKey, 'vpce'), this._seg('vpce', 's3')] : [this._seg(fromKey, toKey)];
      if (path.every(Boolean)) this.fx.packets.spawn(path, opts);
      return true;
    }
    if (f.priv) {
      if (!way?.via) {
        this._deadEnd(a, opts);
        return false;
      }
      const natKey = 'nat:' + way.via;
      const s1 = this._seg(fromKey, natKey);
      if (!s1) return way.ok;
      if (!way.ok) {
        this.fx.packets.spawn([s1], { ...opts, failSeg: 0 });
        return false;
      }
      const s2 = this._seg(natKey, toKey);
      if (s2) this.fx.packets.spawn([s1, s2], { ...opts, onHop: (k) => k === 0 && this.node(natKey)?.pulse() });
      return true;
    }
    const s = this._seg(fromKey, toKey);
    if (s) this.fx.packets.spawn([s], opts);
    return true;
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
    // the Lambda worker pulls messages off the queue and calls the payment provider; while the
    // provider is down a few retries keep bouncing off it
    if (f.queue && this.node('sqs') && this.node('worker')) {
      const retrying = f.extDown && this.sim.queue.depth > 0;
      this._workAcc = (this._workAcc || 0) + dt * this.speed * (f.queueOut > 0.5 ? Math.min(6, 1 + Math.pow(f.queueOut, 0.35)) : retrying ? 1.2 : 0);
      while (this._workAcc >= 1) {
        this._workAcc -= 1;
        const s1 = this._seg('sqs', 'worker');
        const s2 = this._seg('worker', 'external');
        if (!s1 || !s2) break;
        this.fx.packets.spawn([s1, s2], { color: COLOR.outbound, size: 0.75, speed: 12, failSeg: retrying ? 1 : -1 });
      }
    }
    // AWS Backup: a recovery point now and then; a stream back to the data store while restoring
    const src = this._dataKey();
    if (this.sim.config.backup && src && this.node('backup')) {
      const restoring = this.sim.data.restoring;
      this._backupAcc = (this._backupAcc || 0) + dt * this.speed * (restoring ? 2.5 : 0.4);
      if (this._backupAcc >= 1) {
        this._backupAcc = 0;
        const seg = restoring ? this._seg('backup', src) : this._seg(src, 'backup');
        if (seg) this.fx.packets.spawn([seg], { color: '#a3e635', size: restoring ? 1.1 : 0.8, speed: 10, onDone: restoring ? null : () => this.node('backup')?.pulse() });
      }
    }
    // the miners talk to their mining pool; GuardDuty reads the logs that reveal them
    if (this.sim.leak.active) {
      this._leakAcc = (this._leakAcc || 0) + dt * this.speed * 1.5;
      if (this._leakAcc >= 1) {
        this._leakAcc = 0;
        const i = Math.floor(Math.random() * 6);
        const seg = this._seg('miner:' + i, 'external');
        if (seg) this.fx.packets.spawn([seg], { color: '#f87171', size: 0.7, speed: 12 });
        const log = this.node('guardduty') && this._seg('miner:' + i, 'guardduty');
        if (log) this.fx.packets.spawn([log], { color: '#fca5a5', size: 0.6, speed: 10 });
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

  // where the app's data lives: the RDS primary, DynamoDB, or the first server's EBS disk
  _dataKey() {
    const c = this.sim.config;
    if (c.database === 'rds') {
      const p = this.sim.db.find((n) => n.role === 'primary') || this.sim.db[0];
      return p ? 'rds:' + p.id : null;
    }
    if (c.database === 'dynamodb') return 'dynamodb';
    const i = c.compute === 'ec2' && this.sim.instances.find((x) => x.state !== 'terminating');
    return i ? 'ec2:' + i.id : null;
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
        if (t.out && !t.out.ok && (f.outFailRps > 0 || f.awsFailRps > 0)) {
          if (t.out.via) say('nat:' + t.out.via, 'NAT hỏng · mất đường ra Internet', 'bad', 2.4);
          else if (t.out.expanding) say('nat:' + t.out.expanding, 'Đang mở rộng · chưa ra Internet được', 'warn', 2.4);
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
    if (f.extDown && !f.queue && f.outFailRps > 0) say('external', '503 · đối tác không phản hồi', 'bad', 2.4);
    if (this.sim.data.wiped) {
      const key = this._dataKey();
      if (key) say(key, this.sim.data.restoring ? 'đang khôi phục dữ liệu…' : '404 · không tìm thấy đơn hàng', this.sim.data.restoring ? 'warn' : 'bad', 2.4);
    }
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
        if (!e.instId) break;
        const a = pos('ec2:' + e.instId);
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
        const a = pos('ec2:' + e.instId);
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
        const n = this.sim.db.find((d) => d.id === e.dbId);
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
      case 'ddos': {
        const a = pos('shield') || pos('cloudfront') || pos('elb') || this.users.group.position;
        this.fx.callout(new THREE.Vector3(a.x, a.y + 2.6, a.z), 'DDoS!', { kind: 'bad', dur: 3, rise: 2 });
        this.fx.sparks(a, { n: 30, speed: 6 });
        this.sfx?.play('crowd');
        break;
      }
      case 'ddosEnd':
        this.sfx?.play('good');
        break;
      case 'sqlInjection': {
        const primary = this.sim.db.find((d) => d.role === 'primary');
        const a = pos('waf') || (primary && pos('rds:' + primary.id));
        if (a) {
          this.fx.callout(new THREE.Vector3(a.x, a.y + 2.2, a.z), 'SQL injection!', { kind: 'bad', dur: 2.8 });
          this.fx.sparks(a, { n: 20, speed: 5 });
        }
        this.sfx?.play('alert');
        break;
      }
      case 'sqlInjectionEnd':
        this.sfx?.play('good');
        break;
      case 'deployStart':
      case 'deployLive':
      case 'deployManual':
      case 'deployAlarm':
      case 'deployRolledBack':
      case 'deployStopped': {
        // canary: speak where the new version runs; all at once: at the app tier's front door
        const at = e.type === 'deployAlarm' ? pos('canary') || pos('lambdaV2') : pos('elb') || pos('lambda') || pos('apigw');
        if (!at) break;
        const dep = this.sim.deploy;
        const text = {
          deployStart: dep.canary ? 'Deploy v2 · canary 10%' : 'Deploy v2 · mọi máy cùng lúc',
          deployLive: '100% chạy bản lỗi!',
          deployManual: 'Deploy lại bản cũ…',
          deployAlarm: 'Alarm 5xx → rollback',
          deployRolledBack: 'Rollback xong ✓',
          deployStopped: 'Đã về bản cũ',
        }[e.type];
        const kind = { deployStart: 'warn', deployLive: 'bad', deployManual: 'warn', deployAlarm: 'bad' }[e.type] || 'good';
        this.fx.callout(new THREE.Vector3(at.x, at.y + 2.4, at.z), text, { kind, dur: 2.8 });
        if (e.type === 'deployAlarm') this.fx.ring({ x: at.x, y: 0, z: at.z }, { color: '#f87171', r0: 1, r1: 5, dur: 1.2 });
        if (e.type === 'deployRolledBack' || e.type === 'deployStopped') this.fx.ring({ x: at.x, y: 0, z: at.z }, { color: COLOR.ok, r0: 1, r1: 5, dur: 1.2 });
        this.sfx?.play(kind === 'bad' ? 'alarm' : kind === 'good' ? 'good' : 'build');
        break;
      }
      case 'paymentDown': {
        const a = pos('external');
        if (a) {
          this.fx.callout(new THREE.Vector3(a.x, a.y + 2.6, a.z), 'Đối tác thanh toán sập!', { kind: 'bad', dur: 3, rise: 2 });
          this.fx.sparks(a, { n: 20, speed: 5 });
        }
        this.sfx?.play('alert');
        break;
      }
      case 'paymentUp': {
        const a = pos('external');
        if (a) {
          this.fx.ring({ x: a.x, y: 0, z: a.z }, { color: COLOR.ok, r0: 1, r1: 5, dur: 1.2 });
          this.fx.callout(new THREE.Vector3(a.x, a.y + 2.6, a.z), 'Hoạt động lại ✓', { kind: 'good', dur: 2.4 });
        }
        this.sfx?.play('good');
        break;
      }
      case 'natExpanded': {
        const n = this.sim.nat.find((x) => x.az === e.az);
        const a = n && pos('nat:' + n.id);
        if (a) {
          this.fx.ring({ x: a.x, y: AZ_Y, z: a.z }, { color: '#c4b5fd', r0: 0.5, r1: 3.5, dur: 1.2 });
          this.fx.callout(new THREE.Vector3(a.x, a.y + 2.2, a.z), 'Đã có mặt ở AZ này ✓', { kind: 'good', dur: 2.4 });
        }
        break;
      }
      case 'queueBacklog':
      case 'queueDrained': {
        const a = pos('sqs');
        if (a) this.fx.callout(new THREE.Vector3(a.x, a.y + 2, a.z), e.type === 'queueDrained' ? 'Hàng đợi trống ✓' : 'Đơn dồn lại · không mất', { kind: e.type === 'queueDrained' ? 'good' : 'warn', dur: 2.6 });
        break;
      }
      case 'dataDelete': {
        const key = this._dataKey();
        const a = key && pos(key);
        if (a) {
          this.fx.callout(new THREE.Vector3(a.x, a.y + 2.4, a.z), 'DELETE FROM orders…', { kind: 'bad', dur: 3, rise: 2 });
          this.fx.sparks(a, { n: 24, speed: 5 });
          this.fx.glowBurst(a, { color: '#ef4444', size: 3.5, life: 0.5 });
        }
        this.sfx?.play('alert');
        break;
      }
      case 'replicatedDelete': {
        const sb = this.sim.db.find((d) => d.role === 'standby');
        const a = sb && pos('rds:' + sb.id);
        if (a) this.fx.callout(new THREE.Vector3(a.x, a.y + 2.2, a.z), 'Standby cũng bị xoá!', { kind: 'warn', dur: 3 });
        break;
      }
      case 'restoreStart': {
        const a = pos('backup');
        if (a) {
          this.fx.callout(new THREE.Vector3(a.x, a.y + 2.4, a.z), 'Khôi phục về trước lúc xoá…', { kind: 'info', dur: 3 });
          this.fx.beam(new THREE.Vector3(a.x, 0, a.z), { color: '#a3e635', r: 1.2, h: 10, dur: 1.8 });
        }
        this.sfx?.play('build');
        break;
      }
      case 'restoreDone': {
        const key = this._dataKey();
        const a = key && pos(key);
        if (a) {
          this.fx.ring({ x: a.x, y: AZ_Y, z: a.z }, { color: '#a3e635', r0: 0.5, r1: 4, dur: 1.2 });
          this.fx.callout(new THREE.Vector3(a.x, a.y + 2.2, a.z), 'Dữ liệu đã về ✓', { kind: 'good', dur: 2.6 });
        }
        this.sfx?.play('good');
        break;
      }
      case 'noBackup': {
        const key = this._dataKey();
        const a = key && pos(key);
        if (a) this.fx.callout(new THREE.Vector3(a.x, a.y + 2.4, a.z), 'Không có backup · mất vĩnh viễn', { kind: 'bad', dur: 3.2 });
        this.sfx?.play('alarm');
        break;
      }
      case 'leakedKey': {
        const a = new THREE.Vector3(LAYOUT.miners.x, 0, LAYOUT.miners.z + 0.9);
        this.fx.callout(new THREE.Vector3(a.x + LEAK_TEXT_DX, 2.8, a.z), 'Key bị lộ → máy đào coin!', { kind: 'bad', dur: 3.2, rise: 2 });
        this.fx.glowBurst(a, { color: '#ef4444', size: 4, life: 0.6 });
        this.sfx?.play('alert');
        break;
      }
      case 'gdFinding': {
        const m = this.node('guardduty');
        const a = pos('guardduty');
        if (m && a) {
          m.flash('deny');
          this.fx.callout(new THREE.Vector3(a.x + LEAK_TEXT_DX, a.y + 2.4, a.z), 'Finding: đào coin! → EventBridge', { kind: 'bad', dur: 3 });
          this.fx.ring({ x: a.x, y: 0, z: a.z }, { color: '#f87171', r0: 1, r1: 6, dur: 1.2 });
        }
        this.sfx?.play('alarm');
        break;
      }
      case 'leakContained':
      case 'leakStopped': {
        const a = pos('guardduty') || new THREE.Vector3(LAYOUT.miners.x, 0, LAYOUT.miners.z);
        this.fx.callout(new THREE.Vector3(a.x + LEAK_TEXT_DX, a.y + 2.4, a.z), e.type === 'leakContained' ? 'Lambda: tắt key, dừng máy ✓' : 'Đã xoá máy đào', { kind: 'good', dur: 2.8 });
        this.sfx?.play('good');
        break;
      }
      case 'leakBilled': {
        const a = new THREE.Vector3(LAYOUT.miners.x, 0, LAYOUT.miners.z);
        this.fx.callout(new THREE.Vector3(a.x + LEAK_TEXT_DX, 2.8, a.z), 'Hoá đơn đang chạy: $400/giờ', { kind: 'warn', dur: 3 });
        break;
      }
      case 'budgetWarn':
      case 'budgetOver': {
        // an alert can fire on the very step the budget was set, before the gauge was built
        if (!this.node('budgets')) this._sync();
        const m = this.node('budgets');
        const a = pos('budgets');
        if (m && a) {
          m.flash('deny');
          this.fx.callout(new THREE.Vector3(a.x, a.y + 2.4, a.z), e.type === 'budgetOver' ? 'Vượt ngân sách! ✉ đã báo' : '80% ngân sách · ✉ đã báo', { kind: e.type === 'budgetOver' ? 'bad' : 'warn', dur: 3 });
        }
        this.sfx?.play('alert');
        break;
      }
      case 'budgetOk': {
        const m = this.node('budgets');
        if (m) m.flash('allow');
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
      cache: [L.cache, 11],
      waf: [L.waf, 11],
      shield: [L.shield, 11],
      // aimed a little above the ground so the tall gauge and its label stay in view
      budgets: [[L.budgets[0], 1.2, L.budgets[2]], 14],
      sqs: [[L.sqs[0], 0, 0], 14],
      worker: [[L.worker[0], 0, 0], 14],
      vpce: [L.vpce, 12],
      backup: [[L.backup[0], 1, L.backup[2]], 12],
      guardduty: [L.guardduty, 12],
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
    this.node('lambdaV2')?.setEnvs(this.sim.lambda.conc * this.sim.deploy.share);
    // the worker gets messages in batches: concurrency ≈ batches per second × run time
    this.node('worker')?.setEnvs((this.sim.flows.queueOut / SQS.batch) * LAMBDA.duration);
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
