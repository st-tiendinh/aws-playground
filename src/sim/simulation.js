// Sandbox simulation: a small model of a web app running on AWS. Every step it routes the
// incoming traffic through the chosen architecture (CDN → load balancer → servers →
// database), works out load, failures, latency and cost, and runs the AWS behaviours a
// beginner should see: health checks, Auto Scaling, RDS Multi-AZ failover, Lambda scaling.
// Pure JS (no three.js) so it runs under Node tests; the 3D scene only reads its state.
import {
  APIGW,
  ASG,
  AZ_CODE,
  AZ_IDS,
  AZ_LABEL,
  CF,
  DDB,
  EC2,
  ELB,
  HEALTH,
  LAMBDA,
  NAT,
  NIGHT_HOLD,
  OTHER_AZ,
  R53,
  RDS,
  REGION_MS,
  REQ_PER_USER,
  S3,
  SCENARIO_TIME,
  SPIKE_HOLD,
  STATIC_SHARE,
  STEP,
  USERS,
} from './constants.js';
import { evaluateLesson } from './lessons.js';

export const DEFAULT_CONFIG = {
  route53: false,
  cloudfront: false,
  s3: false,
  compute: 'ec2', // 'ec2' | 'lambda' (API Gateway + Lambda)
  elb: false,
  asg: false,
  asgMin: ASG.min,
  asgMax: ASG.max,
  ec2: { a: 1, b: 0 }, // fixed instance count per AZ when Auto Scaling is off
  appSubnet: 'public', // 'public' | 'private' — where the EC2 fleet lives
  nat: 'none', // 'none' | 'single' | 'perAz' — NAT Gateways for a private fleet
  database: 'none', // 'none' | 'rds' | 'dynamodb'
  rdsMultiAz: false,
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// queueing delay multiplier: requests wait longer as a resource gets busy
const queue = (rho) => 1 / (1 - Math.min(rho, 0.9));
const perHour = (rps) => (rps * 3600) / 1e6; // requests/s → millions of requests per hour

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeConfig(c = {}) {
  const out = { ...DEFAULT_CONFIG, ...c, ec2: { ...DEFAULT_CONFIG.ec2, ...(c.ec2 || {}) } };
  out.compute = out.compute === 'lambda' ? 'lambda' : 'ec2';
  out.database = out.database === 'rds' || out.database === 'dynamodb' ? out.database : 'none';
  for (const k of ['route53', 'cloudfront', 's3', 'elb', 'asg', 'rdsMultiAz']) out[k] = !!out[k];
  for (const az of AZ_IDS) out.ec2[az] = clamp(Math.round(out.ec2[az] || 0), 0, EC2.maxPerAz);
  if (out.compute === 'ec2' && !out.asg && out.ec2.a + out.ec2.b === 0) out.ec2.a = 1;
  out.asgMin = clamp(Math.round(out.asgMin || 1), 1, ASG.limit);
  out.asgMax = clamp(Math.round(out.asgMax || 1), out.asgMin, ASG.limit);
  if (out.compute === 'lambda') {
    out.elb = false;
    out.asg = false;
  }
  if (out.database !== 'rds') out.rdsMultiAz = false;
  // servers in a private subnet are only reachable through a load balancer, and a NAT
  // Gateway only makes sense for a private fleet
  out.appSubnet = out.appSubnet === 'private' && out.compute === 'ec2' && out.elb ? 'private' : 'public';
  out.nat = out.appSubnet === 'private' && (out.nat === 'single' || out.nat === 'perAz') ? out.nat : 'none';
  return out;
}

const NAMES = {
  route53: 'Route 53',
  cloudfront: 'CloudFront',
  s3: 'S3',
  elb: 'Elastic Load Balancer',
  asg: 'Auto Scaling',
  rdsMultiAz: 'RDS Multi-AZ',
};

const instName = (i) => `EC2 #${i.n}`;
const listNames = (arr) => arr.map(instName).join(', ');

export class Simulation {
  constructor(config = {}, opts = {}) {
    this.rand = mulberry32(opts.seed ?? 1234);
    this.listeners = new Set();
    this._eventSeq = 0;
    this._init(config);
  }

  // ── public API ────────────────────────────────────────────────────────────

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // advance by real dt (seconds × speed); runs fixed 0.1 s steps
  step(dt) {
    this._acc += Math.min(dt, 0.5);
    while (this._acc >= STEP - 1e-9) {
      this._tick(STEP);
      this._acc -= STEP;
    }
  }

  // run n seconds at once (tests)
  run(seconds) {
    const n = Math.round(seconds / STEP);
    for (let k = 0; k < n; k++) this._tick(STEP);
  }

  reset(config = this.config) {
    this._init(config);
    this._emit('reset', 'info', 'Đã dựng lại kiến trúc. Mọi thứ đang chạy bình thường.');
  }

  setConfig(patch) {
    const prev = this.config;
    const merged = { ...prev, ...patch, ec2: { ...prev.ec2, ...(patch.ec2 || {}) } };
    // switching Auto Scaling off keeps the fleet it had built
    if (prev.asg && patch.asg === false && !patch.ec2 && prev.compute === 'ec2') {
      const count = (az) => this._active().filter((i) => i.az === az).length;
      merged.ec2 = { a: Math.min(EC2.maxPerAz, count('a')), b: Math.min(EC2.maxPerAz, count('b')) };
    }
    const next = normalizeConfig(merged);
    this.config = next;
    if (this.scenario) this.scenario.cfgChanged = true;
    this._apply(prev, {});
    this._announceConfig(prev, next);
    this._route(0);
  }

  setUsers(n) {
    this._clearTimers('traffic');
    this.night = false;
    this.targetUsers = clamp(Math.round(n), USERS.min, USERS.max);
  }

  trigger(action, opts = {}) {
    switch (action) {
      case 'quake':
        return this._quake(opts.az || 'a');
      case 'serverFail':
        return this._serverFail(opts.id);
      case 'spike':
        return this._spike();
      case 'dbFail':
        return this._dbFail();
      case 'night':
        return this._night();
      case 'repair':
        return this._repair();
      default:
        return false;
    }
  }

  instance(id) {
    return this.instances.find((i) => i.id === id) || null;
  }

  // compact, render-friendly state for the HUD
  snapshot() {
    const m = this.metrics;
    const ins = this.instances.filter((i) => i.state !== 'terminating');
    const sc = this.scenario;
    return {
      t: this.t,
      users: this.users,
      targetUsers: this.targetUsers,
      rps: this.flows.rps,
      success: m.success,
      latency: m.latency,
      timeout: m.timeout,
      status: m.status,
      cost: m.cost,
      costBreakdown: m.costBreakdown,
      night: this.night,
      az: { ...this.az },
      instances: {
        total: ins.length,
        running: ins.filter((i) => i.state === 'running').length,
        pending: ins.filter((i) => i.state === 'pending').length,
        failed: ins.filter((i) => i.state === 'failed').length,
        avgCpu: this.flows.avgCpu,
      },
      asgDesired: this.asgDesired,
      lambda: { conc: this.lambda.conc, limit: LAMBDA.limit, coldFrac: this.lambda.coldFrac },
      db: this.db.map((n) => ({ id: n.id, az: n.az, role: n.role, state: n.state, load: n.load })),
      fleet: ins.map((i) => ({ id: i.id, n: i.n, az: i.az, state: i.state, cpu: i.cpu, registered: i.registered })),
      nat: this.nat.map((n) => ({ id: n.id, az: n.az, state: n.state })),
      outbound: { rps: this.flows.outRps || 0, failing: this.flows.outFailRps || 0 },
      totals: { ...this.totals },
      cfHit: this.flows.cfHit,
      scenario: sc ? { action: sc.action, az: sc.az, remaining: Math.max(0, sc.end - this.t) } : null,
    };
  }

  // ── setup ─────────────────────────────────────────────────────────────────

  _init(config) {
    this.t = 0;
    this._acc = 0;
    this.config = normalizeConfig(config);
    this.az = { a: 'ok', b: 'ok' };
    this.azSince = { a: -100, b: -100 };
    this.instances = [];
    this._seq = 0;
    this.db = [];
    this.nat = [];
    this.users = USERS.normal;
    this.targetUsers = USERS.normal;
    this.timers = [];
    this.night = false;
    this.lambda = { conc: 0, warm: 0, need: 0, coldFrac: 0, coldRate: 0 };
    this.cfSince = -100;
    this.asgDesired = 0;
    this._overSince = null;
    this._lastScaleIn = -100;
    this._asgClock = 0;
    this._hcClock = 0;
    this._histClock = 0;
    this._maxWarned = false;
    this._noAzWarned = false;
    this._rebalancing = false;
    this.flows = { rps: 0, targets: [], cfHit: 0, appRps: 0, avgCpu: 0 };
    this.metrics = {
      success: 1,
      successRaw: 1,
      latency: 0,
      timeout: false,
      status: 'ok',
      cost: 0,
      costBreakdown: {},
    };
    this._statusCand = 'ok';
    this._statusCandSince = 0;
    this.history = [];
    this.events = [];
    this.scenario = null;
    this.lesson = null;
    this.totals = { ok: 0, fail: 0 };
    this._apply(null, { initial: true });
    this._route(STEP);
    this.lambda.warm = this.lambda.conc;
    this.lambda.coldFrac = 0;
    this._route(STEP);
    this._metrics(STEP);
    this.metrics.success = this.metrics.successRaw;
  }

  // reconcile the running infrastructure with this.config
  _apply(prev, { initial = false }) {
    const c = this.config;
    const instant = initial;

    // EC2 fleet
    if (c.compute !== 'ec2') {
      for (const i of this.instances) this._terminate(i);
    } else if (c.asg) {
      const active = this._active();
      const want = clamp(Math.max(active.length, c.asgMin), c.asgMin, c.asgMax);
      for (let k = active.length; k < want; k++) {
        const az = this._pickAz();
        if (!az || !this._launch(az, { instant, reason: 'config' })) break;
      }
      const extra = this._active().length - c.asgMax;
      if (extra > 0) {
        this._active()
          .sort((x, y) => y.n - x.n)
          .slice(0, extra)
          .forEach((i) => this._terminate(i));
      }
      this.asgDesired = want;
    } else {
      for (const az of AZ_IDS) {
        const list = this.instances.filter((i) => i.az === az && i.state !== 'terminating').sort((x, y) => x.n - y.n);
        const want = c.ec2[az];
        let blocked = false;
        for (let k = list.length; k < want; k++) {
          if (!this._launch(az, { instant, reason: 'config' })) blocked = true;
        }
        if (blocked && !initial) {
          this._emit('blocked', 'warn', `${AZ_LABEL[az]} đang gặp sự cố nên chưa thể tạo EC2 ở đó.`, { az });
        }
        if (list.length > want) {
          const failed = list.filter((i) => i.state === 'failed');
          const healthy = list.filter((i) => i.state !== 'failed').reverse();
          [...failed, ...healthy].slice(0, list.length - want).forEach((i) => this._terminate(i));
        }
      }
    }
    if (c.elb && !(prev && prev.elb)) {
      for (const i of this.instances) if (i.state === 'running') i.registered = true;
    }
    if (!c.elb) for (const i of this.instances) i.registered = false;

    // RDS nodes (primary + optional Multi-AZ standby)
    if (c.database !== 'rds') {
      this.db = [];
    } else {
      if (!this.db.length) {
        const az = this.az.a === 'ok' ? 'a' : 'b';
        if (this.az[az] === 'ok') this.db.push(this._dbNode(az, 'primary', 'ok'));
      }
      const standby = this.db.find((n) => n.role === 'standby');
      if (c.rdsMultiAz && !standby) {
        const p = this.db.find((n) => n.role === 'primary');
        const az = p ? OTHER_AZ[p.az] : 'b';
        // one node per AZ: never stack a second one where a (failed) node already sits
        if (this.az[az] === 'ok' && !this.db.some((n) => n.az === az)) {
          this.db.push(this._dbNode(az, 'standby', initial ? 'ok' : 'creating', EC2.provisionTime));
        }
      }
      if (!c.rdsMultiAz && standby) this.db = this.db.filter((n) => n !== standby);
    }

    // NAT Gateways: one in AZ A for the whole VPC, or one per AZ
    const natAzs = c.nat === 'perAz' ? AZ_IDS : c.nat === 'single' ? [this.nat[0]?.az || (this.az.a === 'ok' ? 'a' : 'b')] : [];
    this.nat = this.nat.filter((n) => natAzs.includes(n.az));
    for (const az of natAzs) {
      if (!this.nat.some((n) => n.az === az) && this.az[az] === 'ok') this.nat.push({ id: `nat-${az}`, az, state: 'ok' });
    }

    // CloudFront starts with an empty cache when it is switched on mid-run
    if (c.cloudfront && !(prev && prev.cloudfront)) this.cfSince = initial ? -100 : this.t;
  }

  // how an instance reaches the Internet for its outside API calls
  _wayOut(inst) {
    if (this.config.appSubnet !== 'private') return { ok: true, via: null };
    const n = this.config.nat === 'perAz' ? this.nat.find((x) => x.az === inst.az) : this.nat[0];
    if (!n) return { ok: false, via: null };
    return { ok: n.state === 'ok' && this.az[n.az] === 'ok', via: n.id };
  }

  _announceConfig(prev, next) {
    for (const k of Object.keys(NAMES)) {
      if (prev[k] !== next[k]) {
        this._emit('config', 'info', next[k] ? `Đã thêm ${NAMES[k]}.` : `Đã gỡ ${NAMES[k]}.`);
      }
    }
    if (prev.compute !== next.compute) {
      this._emit(
        'config',
        'info',
        next.compute === 'lambda'
          ? 'Chuyển sang serverless: API Gateway + Lambda thay cho EC2.'
          : 'Chuyển sang máy chủ ảo EC2.',
      );
    }
    if (prev.appSubnet !== next.appSubnet && next.compute === 'ec2') {
      this._emit(
        'config',
        'info',
        next.appSubnet === 'private'
          ? 'EC2 chuyển vào private subnet: không còn IP public, chỉ nhận traffic qua Load Balancer.'
          : prev.elb && !next.elb
            ? 'Không còn Load Balancer nên EC2 phải ra public subnet (có IP public) để người dùng vào được.'
            : 'EC2 chuyển ra public subnet (có IP public).',
      );
    }
    if (prev.nat !== next.nat) {
      const label = { none: 'không dùng NAT Gateway', single: '1 NAT Gateway (ở AZ A) dùng chung', perAz: 'mỗi AZ một NAT Gateway' };
      this._emit('config', 'info', `Đường ra Internet của EC2: ${label[next.nat]}.`);
    }
    if (next.appSubnet === 'private' && next.nat === 'none' && (prev.appSubnet !== 'private' || prev.nat !== 'none')) {
      this._emit('noNat', 'error', 'EC2 ở private subnet chưa có NAT Gateway → không gọi được API bên ngoài (thanh toán, email…), các request đó bị lỗi.');
    }
    if (prev.database !== next.database) {
      const label = { none: 'không dùng database riêng', rds: 'database RDS', dynamodb: 'database DynamoDB' };
      this._emit('config', 'info', `Tầng dữ liệu: ${label[next.database]}.`);
    }
    if (!next.asg && next.compute === 'ec2' && (prev.ec2.a !== next.ec2.a || prev.ec2.b !== next.ec2.b)) {
      this._emit('config', 'info', `Số EC2: ${next.ec2.a} ở AZ A, ${next.ec2.b} ở AZ B.`);
    }
    if (next.asg && (prev.asgMin !== next.asgMin || prev.asgMax !== next.asgMax)) {
      this._emit('config', 'info', `Auto Scaling: tối thiểu ${next.asgMin}, tối đa ${next.asgMax} EC2.`);
    }
  }

  _dbNode(az, role, state, time = RDS.standbyCreate) {
    return { id: `db-${az}`, az, role, state, timer: state === 'creating' ? time : 0, load: 0, cause: null };
  }

  _hexId() {
    return Math.floor(this.rand() * 0xfffffff)
      .toString(16)
      .padStart(7, '0');
  }

  _launch(az, { instant = false, reason = 'config' } = {}) {
    if (this.az[az] !== 'ok') return null;
    const used = new Set(this.instances.filter((i) => i.az === az).map((i) => i.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    if (slot >= EC2.slotsPerAz) return null;
    const boot = instant ? 0 : reason === 'config' ? EC2.provisionTime : EC2.bootTime;
    const inst = {
      id: `i-0${this._hexId()}`,
      n: ++this._seq,
      az,
      slot,
      state: boot > 0 ? 'pending' : 'running',
      timer: boot,
      boot,
      reason,
      registered: false,
      detected: false,
      failSeen: 0,
      cpu: 0,
      load: 0,
      cause: null,
      born: this.t,
      since: this.t,
    };
    this.instances.push(inst);
    return inst;
  }

  _terminate(i) {
    if (i.state === 'terminating') return;
    i.state = 'terminating';
    i.timer = EC2.terminateTime;
    i.registered = false;
    i.cpu = 0;
    i.load = 0;
  }

  _failInstance(i, cause) {
    if (i.state === 'failed' || i.state === 'terminating') return false;
    i.state = 'failed';
    i.cause = cause;
    i.failSeen = 0;
    i.detected = false;
    i.failedAt = this.t;
    i.cpu = 0;
    return true;
  }

  _active() {
    return this.instances.filter((i) => i.state === 'pending' || i.state === 'running');
  }

  // where Auto Scaling puts the next instance: the healthy AZ with fewer instances
  _pickAz() {
    let best = null;
    let bestCount = Infinity;
    for (const az of AZ_IDS) {
      if (this.az[az] !== 'ok') continue;
      const inAz = this.instances.filter((i) => i.az === az);
      if (inAz.length >= EC2.slotsPerAz) continue;
      const count = inAz.filter((i) => i.state === 'pending' || i.state === 'running').length;
      if (count < bestCount) {
        best = az;
        bestCount = count;
      }
    }
    return best;
  }

  // without a load balancer users only know one server's address: the oldest one
  _primaryInstance() {
    let p = null;
    for (const i of this.instances) {
      if (i.state === 'terminating') continue;
      if (!p || i.n < p.n) p = i;
    }
    return p;
  }

  _emit(type, level, text, extra = {}) {
    const e = { id: ++this._eventSeq, t: this.t, type, level, text, ...extra };
    this.events.push(e);
    if (this.events.length > 160) this.events.shift();
    if (this.scenario) this.scenario.flags.add(type);
    for (const fn of this.listeners) fn(e);
    return e;
  }

  _schedule(delay, run, tag) {
    this.timers.push({ at: this.t + delay, run, tag });
  }

  _clearTimers(tag) {
    this.timers = this.timers.filter((t) => t.tag !== tag);
  }

  // ── the step ──────────────────────────────────────────────────────────────

  _tick(dt) {
    this.t = Math.round((this.t + dt) * 1000) / 1000;
    this._runTimers();
    this._traffic(dt);
    this._lifecycle(dt);
    this._hcClock += dt;
    if (this._hcClock >= HEALTH.interval - 1e-9) {
      this._hcClock = 0;
      this._healthChecks();
    }
    if (this.config.compute === 'ec2' && this.config.asg) {
      this._asgClock += dt;
      if (this._asgClock >= 1 - 1e-9) {
        this._asgClock = 0;
        this._autoscale();
      }
    }
    this._route(dt);
    this._metrics(dt);
    this._trackScenario(dt);
  }

  _runTimers() {
    const due = this.timers.filter((t) => t.at <= this.t + 1e-9);
    if (!due.length) return;
    this.timers = this.timers.filter((t) => t.at > this.t + 1e-9);
    for (const t of due) t.run();
  }

  // users drift toward the target on a log scale, so 10k → 1M takes a few seconds
  _traffic(dt) {
    const cur = Math.log10(this.users);
    const tgt = Math.log10(this.targetUsers);
    const maxStep = 0.75 * dt;
    const d = clamp(tgt - cur, -maxStep, maxStep);
    this.users = Math.abs(tgt - cur) <= maxStep ? this.targetUsers : Math.pow(10, cur + d);
  }

  _lifecycle(dt) {
    const c = this.config;
    const ready = [];
    for (const i of this.instances) {
      if (i.state === 'pending') {
        i.timer -= dt;
        if (i.timer <= 0) {
          i.state = 'running';
          i.since = this.t;
          i.registered = false;
          if (i.reason !== 'config') ready.push(i);
        }
      } else if (i.state === 'terminating') {
        i.timer -= dt;
        if (i.timer <= 0) i.removed = true;
      }
    }
    if (this.instances.some((i) => i.removed)) this.instances = this.instances.filter((i) => !i.removed);
    if (ready.length) {
      this._emit(
        'inService',
        'success',
        `${listNames(ready)} đã khởi động xong${c.elb ? ', chờ ELB kiểm tra sức khoẻ rồi nhận traffic' : ''}.`,
      );
    }

    for (const n of this.db) {
      if (!(n.timer > 0)) continue;
      n.timer -= dt;
      if (n.timer > 0) continue;
      n.timer = 0;
      if (n.state === 'promoting') {
        n.state = 'ok';
        n.role = 'primary';
        this._emit(
          'dbFailoverDone',
          'success',
          `Failover xong: RDS ở ${AZ_LABEL[n.az]} trở thành primary mới. Ứng dụng kết nối lại qua cùng một endpoint.`,
          { az: n.az },
        );
        for (const o of this.db) {
          if (o === n) continue;
          o.role = 'standby';
          if (o.state === 'failed' && this.az[o.az] === 'ok') {
            o.state = 'creating';
            o.timer = RDS.standbyCreate;
            o.cause = null;
          }
        }
      } else if (n.state === 'creating') {
        n.state = 'ok';
        this._emit(
          n.role === 'primary' ? 'dbRestored' : 'standbyReady',
          'success',
          n.role === 'primary'
            ? `Database RDS đã được khôi phục ở ${AZ_LABEL[n.az]}.`
            : `RDS: bản standby mới ở ${AZ_LABEL[n.az]} đã sẵn sàng và được đồng bộ dữ liệu.`,
          { az: n.az },
        );
      } else if (n.state === 'failed' && n.autoRecover && this.az[n.az] === 'ok') {
        n.state = 'ok';
        n.autoRecover = false;
        n.cause = null;
        this._emit('dbRecovered', 'success', 'AWS đã thay máy chủ mới cho RDS, database hoạt động trở lại.', {
          az: n.az,
        });
      }
    }
  }

  _healthChecks() {
    const c = this.config;
    const registered = [];
    for (const i of this.instances) {
      if (i.state === 'failed' && !i.detected) {
        i.failSeen++;
        if (i.failSeen < HEALTH.unhealthyThreshold) continue;
        i.detected = true;
        const wasServing = i.registered;
        i.registered = false;
        if (c.compute !== 'ec2') continue;
        if (c.elb && wasServing) {
          this._emit(
            'hcFail',
            'warn',
            `ELB health check: ${instName(i)} không phản hồi ${HEALTH.unhealthyThreshold} lần liên tiếp → ngừng gửi traffic tới máy này.`,
            { id: i.id, az: i.az },
          );
        } else if (!c.asg) {
          this._emit(
            'hcFail',
            'warn',
            `${instName(i)} không phản hồi. Không có Auto Scaling nên máy này nằm đó chờ quản trị viên xử lý.`,
            { id: i.id, az: i.az },
          );
        }
      } else if (i.state === 'running' && c.elb && !i.registered) {
        i.registered = true;
        if (this.t - i.since < 3) registered.push(i);
      }
    }
    if (registered.length) {
      this._emit('registered', 'info', `ELB bắt đầu chia traffic cho ${listNames(registered)}.`);
    }
  }

  _autoscale() {
    const c = this.config;
    const bad = this.instances.filter((i) => i.state === 'failed' && i.detected);
    for (const i of bad) this._terminate(i);
    if (bad.length) {
      this._emit(
        'asgReplace',
        'warn',
        `Auto Scaling: ${listNames(bad)} không khoẻ → huỷ và tạo máy thay thế (tự chữa lành).`,
      );
    }

    const byLoad = Math.ceil(this.flows.appRps / (EC2.capacity * ASG.targetCpu));
    const desired = clamp(byLoad, c.asgMin, c.asgMax);
    this.asgDesired = desired;
    const active = this._active();
    if (active.length < desired) {
      const launched = [];
      for (let k = active.length; k < desired; k++) {
        const az = this._pickAz();
        const inst = az && this._launch(az, { reason: 'asg' });
        if (!inst) break;
        launched.push(inst);
      }
      if (launched.length) {
        const running = Math.max(1, this.instances.filter((i) => i.state === 'running').length);
        const cpu = Math.round((this.flows.appRps / (running * EC2.capacity)) * 100);
        const why =
          bad.length && launched.length <= bad.length
            ? 'thay cho máy hỏng'
            : byLoad < c.asgMin
              ? `giữ đủ số máy tối thiểu (min ${c.asgMin})`
              : `CPU trung bình ${cpu}% > mục tiêu ${Math.round(ASG.targetCpu * 100)}%`;
        const where = AZ_IDS.map((az) => [az, launched.filter((i) => i.az === az).length])
          .filter(([, n]) => n)
          .map(([az, n]) => `${n} ở ${AZ_LABEL[az]}`)
          .join(', ');
        this._emit('scaleOut', 'info', `Auto Scaling thêm ${launched.length} EC2 (${where}) vì ${why}.`);
        this._noAzWarned = false;
      } else if (!this._noAzWarned) {
        this._noAzWarned = true;
        this._emit('asgBlocked', 'error', 'Auto Scaling muốn thêm EC2 nhưng không còn AZ nào hoạt động!');
      }
      if (byLoad > c.asgMax && !this._maxWarned) {
        this._maxWarned = true;
        this._emit('asgMax', 'warn', `Auto Scaling đã chạm mức tối đa ${c.asgMax} EC2 — không thể thêm nữa.`);
      }
      this._overSince = null;
      return;
    }
    if (byLoad <= c.asgMax) this._maxWarned = false;
    if (active.length > desired) {
      if (this._overSince == null) this._overSince = this.t;
      if (this.t - this._overSince >= ASG.scaleInDelay && this.t - this._lastScaleIn >= ASG.scaleInEvery) {
        const victim = this._scaleInVictim(active);
        this._terminate(victim);
        this._lastScaleIn = this.t;
        this._emit(
          'scaleIn',
          'info',
          this._rebalancing
            ? `Cân bằng AZ: tắt ${instName(victim)} ở ${AZ_LABEL[victim.az]}.`
            : `Tải giảm → Auto Scaling tắt ${instName(victim)} để tiết kiệm chi phí (còn ${active.length - 1} EC2).`,
          { id: victim.id },
        );
      }
      return;
    }
    this._overSince = null;
    this._rebalance(active);
  }

  _scaleInVictim(active) {
    const count = (az) => active.filter((i) => i.az === az).length;
    const az = count('a') >= count('b') ? 'a' : 'b';
    return active.filter((i) => i.az === az).sort((x, y) => y.n - x.n)[0];
  }

  // after an AZ comes back, spread the fleet across both AZs again
  _rebalance(active) {
    if (AZ_IDS.some((az) => this.az[az] !== 'ok') || active.some((i) => i.state === 'pending')) return;
    const a = active.filter((i) => i.az === 'a').length;
    const b = active.length - a;
    const diff = Math.abs(a - b);
    if (diff < 2) {
      this._rebalancing = false;
      return;
    }
    const small = a < b ? 'a' : 'b';
    // like real Auto Scaling, rebalancing may exceed the maximum by one instance at most
    const n = Math.min(Math.floor(diff / 2), Math.max(1, this.config.asgMax + 1 - active.length));
    for (let k = 0; k < n; k++) this._launch(small, { reason: 'asg' });
    this._rebalancing = true;
    this._emit('rebalance', 'info', `Auto Scaling cân bằng lại: thêm ${n} EC2 ở ${AZ_LABEL[small]} để hai AZ đều nhau.`);
  }

  // route this step's traffic through the architecture
  _route(dt) {
    const c = this.config;
    const rps = this.users * REQ_PER_USER;
    const staticRps = rps * STATIC_SHARE;
    const dynRps = rps - staticRps;
    const f = {
      rps,
      staticRps,
      dynRps,
      staticShare: STATIC_SHARE,
      route53: c.route53,
      cf: c.cloudfront,
      cfHit: 0,
      s3: c.s3,
      staticToApp: !c.s3,
      compute: c.compute,
      elb: c.elb,
      targets: [],
      noTarget: false,
      gwFail: 0,
      lambdaFail: 0,
      db: c.database,
      dbTarget: null,
      dbFail: 0,
      appRps: 0,
      avgCpu: 0,
      outboundShare: NAT.outboundShare,
      outRps: 0,
      outFailRps: 0,
      natMode: c.nat,
      served: {},
    };

    // static files: CloudFront cache → S3 (or the app servers when there is no S3)
    let edge = 0;
    let miss = staticRps;
    if (c.cloudfront) {
      f.cfHit = CF.hitRatio * (1 - Math.exp(-(this.t - this.cfSince) / CF.warmTime));
      edge = staticRps * f.cfHit;
      miss = staticRps - edge;
    }
    const s3 = c.s3 ? miss : 0;
    const appRps = dynRps + (c.s3 ? 0 : miss);
    f.appRps = appRps;

    let appServed = 0;
    let appMsSum = 0;
    let entryMs = 0;
    // part of each dynamic request that calls an outside API (needs a way out to the Internet)
    const outPerReq = appRps > 0 ? (dynRps / appRps) * NAT.outboundShare : 0;
    let outRps = 0;
    let outFail = 0;
    let natRps = 0;
    for (const i of this.instances) {
      i.load = 0;
      if (i.state === 'running') i.cpu = 0;
    }

    if (c.compute === 'ec2') {
      entryMs = c.elb ? ELB.ms : 0;
      let targets;
      if (c.elb) targets = this.instances.filter((i) => i.registered);
      else {
        const p = this._primaryInstance();
        targets = p ? [p] : [];
      }
      if (!targets.length) f.noTarget = true;
      const share = targets.length ? appRps / targets.length : 0;
      for (const i of targets) {
        i.load = share;
        const out = this._wayOut(i);
        if (i.state !== 'running') {
          f.targets.push({ id: i.id, w: 1 / targets.length, fail: 1, out });
          continue;
        }
        i.cpu = share / EC2.capacity;
        const served = Math.min(share, EC2.capacity);
        appServed += served;
        appMsSum += served * EC2.procMs * queue(i.cpu);
        outRps += served * outPerReq;
        if (out.via) natRps += served * outPerReq;
        if (!out.ok) outFail += served * outPerReq;
        f.targets.push({ id: i.id, w: 1 / targets.length, fail: share > 0 ? 1 - served / share : 0, out });
      }
      const running = this.instances.filter((i) => i.state === 'running').length;
      f.avgCpu = running ? appRps / (running * EC2.capacity) : 0;
      this.lambda.conc = 0;
      this.lambda.warm = 0;
      this.lambda.coldFrac = 0;
      this.lambda.coldRate = 0;
    } else {
      entryMs = APIGW.ms;
      const allowed = Math.min(appRps, APIGW.limit);
      f.gwFail = appRps > 0 ? 1 - allowed / appRps : 0;
      const need = allowed * LAMBDA.duration;
      const conc = Math.min(need, LAMBDA.limit);
      f.lambdaFail = need > 0 ? 1 - conc / need : 0;
      appServed = need > 0 ? (allowed * conc) / need : 0;
      const lam = this.lambda;
      const created = Math.max(0, conc - lam.warm);
      if (created > 0) lam.warm = conc;
      else if (dt > 0) lam.warm = Math.max(conc, lam.warm - (lam.warm - conc) * (dt / LAMBDA.keepWarm));
      if (lam.warm < 0.5 && conc === 0) lam.warm = 0;
      lam.conc = conc;
      lam.need = need;
      const reqs = allowed * Math.max(dt, STEP);
      lam.coldFrac = reqs > 0 ? Math.min(1, created / reqs) : 0;
      lam.coldRate = dt > 0 ? created / dt : 0;
      appMsSum = appServed * (LAMBDA.warmMs + lam.coldFrac * LAMBDA.coldMs);
      outRps = appServed * outPerReq; // Lambda outside a VPC reaches the Internet directly
      if (f.lambdaFail > 0.01 && !this._lambdaWarned) {
        this._lambdaWarned = true;
        this._emit(
          'lambdaThrottle',
          'error',
          `Lambda chạm giới hạn ${LAMBDA.limit} bản chạy đồng thời → request vượt mức bị từ chối (lỗi 429).`,
        );
      } else if (f.lambdaFail === 0) this._lambdaWarned = false;
      if (f.gwFail > 0.01 && !this._gwWarned) {
        this._gwWarned = true;
        this._emit('gwThrottle', 'error', 'API Gateway chạm giới hạn 10.000 request/giây → trả lỗi 429 Too Many Requests.');
      } else if (f.gwFail === 0) this._gwWarned = false;
    }

    // database tier (only the dynamic part needs it)
    const dynServed = appRps > 0 ? (appServed * dynRps) / appRps : 0;
    const appStaticServed = appServed - dynServed;
    let dynOk = dynServed;
    let dbMs = 1;
    for (const n of this.db) n.load = 0;
    if (c.database === 'rds') {
      const p = this.db.find((n) => n.role === 'primary' && n.state === 'ok');
      if (!p) {
        dynOk = 0;
        f.dbFail = dynServed > 0 ? 1 : 0;
        f.dbTarget = (this.db.find((n) => n.role === 'primary') || this.db[0] || {}).id || null;
      } else {
        const rho = dynServed / RDS.capacity;
        p.load = rho;
        dynOk = Math.min(dynServed, RDS.capacity);
        f.dbFail = dynServed > 0 ? 1 - dynOk / dynServed : 0;
        dbMs = RDS.queryMs * queue(rho);
        f.dbTarget = p.id;
      }
    } else if (c.database === 'dynamodb') {
      dbMs = DDB.queryMs;
      f.dbTarget = 'dynamodb';
    }

    // requests whose outside API call (payment, email…) found no way out fail as well
    if (outFail > 0 && dynServed > 0) dynOk *= Math.max(0, 1 - outFail / dynServed);
    f.outRps = outRps;
    f.outFailRps = outFail;

    const ok = edge + s3 + appStaticServed + dynOk;
    const appMs = appServed > 0 ? appMsSum / appServed : 0;
    const cfPass = c.cloudfront ? 5 : 0;
    const s3Ms = c.cloudfront ? CF.edgeMs + CF.originMs + S3.ms : REGION_MS + S3.ms;
    const toApp = REGION_MS + cfPass + entryMs + appMs;
    const latencySum =
      edge * CF.edgeMs + s3 * s3Ms + appStaticServed * toApp + dynOk * (toApp + dbMs);

    f.served = { edge, s3, app: appServed, appStatic: appStaticServed, dyn: dynOk, total: ok };
    this.flows = f;
    this._last = { ok, total: rps, latencySum, s3, dynOk, appServed, allowed: Math.min(appRps, APIGW.limit), natRps };
  }

  _metrics(dt) {
    const m = this.metrics;
    const c = this.config;
    const r = this._last;
    const raw = r.total > 0 ? r.ok / r.total : 1;
    const a = 1 - Math.exp(-dt / 0.5);
    m.successRaw = raw;
    m.success += (raw - m.success) * a;
    if (r.ok > 0) {
      const lat = r.latencySum / r.ok;
      m.latency = m.timeout || !m.latency ? lat : m.latency + (lat - m.latency) * a;
      m.timeout = false;
    } else {
      m.timeout = true;
    }
    this.totals.ok += r.ok * dt;
    this.totals.fail += (r.total - r.ok) * dt;

    // status with a short dwell so it does not flicker
    const s = m.success;
    let cand = 'ok';
    if (s < 0.4) cand = 'down';
    else if (s < 0.97) cand = 'degraded';
    else if (s < 0.995 || m.latency > 300) cand = 'slow';
    if (cand !== this._statusCand) {
      this._statusCand = cand;
      this._statusCandSince = this.t;
    }
    if (cand !== m.status && this.t - this._statusCandSince >= 0.6) {
      const prev = m.status;
      m.status = cand;
      this._announceStatus(prev, cand);
    }

    // estimated running cost ($/hour), illustrative
    const f = this.flows;
    const ec2Count = this.instances.filter((i) => i.state !== 'terminating').length;
    const b = {
      ec2: c.compute === 'ec2' ? ec2Count * EC2.costPerHour : 0,
      elb: c.compute === 'ec2' && c.elb ? ELB.costPerHour + f.appRps * ELB.lcuPerRps * ELB.lcuCost : 0,
      rds: c.database === 'rds' ? this.db.length * RDS.costPerHour : 0,
      dynamodb: c.database === 'dynamodb' ? perHour(r.dynOk) * DDB.costPerMillion : 0,
      lambda: c.compute === 'lambda' ? perHour(r.appServed) * LAMBDA.costPerMillion : 0,
      apigw: c.compute === 'lambda' ? perHour(r.allowed) * APIGW.costPerMillion : 0,
      s3: c.s3 ? S3.storagePerHour + perHour(r.s3) * S3.costPerMillion : 0,
      cloudfront: c.cloudfront ? perHour(f.rps) * CF.costPerMillion : 0,
      route53: c.route53 ? R53.costPerHour + perHour(f.rps * R53.queryRatio) * R53.costPerMillion : 0,
      // hourly per gateway + per GB processed
      nat: this.nat.length * NAT.costPerHour + ((r.natRps * NAT.kbPerCall * 3600) / 1e6) * NAT.costPerGB,
    };
    m.costBreakdown = b;
    m.cost = Object.values(b).reduce((x, y) => x + y, 0);

    this._histClock += dt;
    if (this._histClock >= 0.5 - 1e-9 || !this.history.length) {
      this._histClock = 0;
      this.history.push({ t: this.t, success: m.success, latency: m.timeout ? null : m.latency, users: this.users, cost: m.cost });
      if (this.history.length > 120) this.history.shift();
    }
  }

  _announceStatus(prev, next) {
    const pct = Math.round((1 - this.metrics.success) * 100);
    if (next === 'down') this._emit('siteDown', 'error', 'Website SẬP: phần lớn người dùng không truy cập được!');
    else if (next === 'degraded') this._emit('siteDegraded', 'warn', `Website gián đoạn: khoảng ${pct}% request bị lỗi.`);
    else if (next === 'slow') {
      if (prev === 'ok') this._emit('siteSlow', 'warn', `Website chậm lại (độ trễ ~${Math.round(this.metrics.latency)} ms).`);
      else this._emit('siteRecovering', 'info', 'Website đang hồi phục, vẫn còn chậm hoặc lỗi lẻ tẻ.');
    } else this._emit('siteOk', 'success', 'Website hoạt động bình thường trở lại.');
  }

  // ── actions ───────────────────────────────────────────────────────────────

  _quake(az) {
    if (this.az[az] !== 'ok') return false;
    this._startScenario('quake', { az });
    this.az[az] = 'destroyed';
    this.azSince[az] = this.t;
    this._emit(
      'quake',
      'error',
      `Động đất mạnh ở ${AZ_LABEL[az]} (${AZ_CODE[az]})! Trung tâm dữ liệu mất điện và mất kết nối.`,
      { az },
    );
    const hit = this.instances.filter((i) => i.az === az && this._failInstance(i, 'quake'));
    if (hit.length && this.config.compute === 'ec2') {
      this._emit('instancesLost', 'error', `${hit.length} EC2 ở ${AZ_LABEL[az]} hỏng cùng lúc.`, { az });
      if (this.config.database === 'none') {
        this._emit('dataLoss', 'error', 'Dữ liệu lưu trên ổ đĩa EBS của các EC2 này nằm trong AZ bị sập.', { az });
      }
    }
    for (const n of this.db.filter((n) => n.az === az)) this._failDb(n, 'quake');
    for (const n of this.nat.filter((n) => n.az === az)) {
      n.state = 'failed';
      const other = AZ_LABEL[OTHER_AZ[az]];
      if (this.config.nat === 'single') {
        this._emit('natLost', 'error', `NAT Gateway duy nhất (ở ${AZ_LABEL[az]}) mất kết nối → EC2 ở ${other} cũng không ra được Internet (API thanh toán, email…).`, { az });
      } else {
        this._emit('natLost', 'info', `NAT Gateway ở ${AZ_LABEL[az]} mất theo AZ — EC2 ở ${other} vẫn ra Internet qua NAT của chính AZ đó.`, { az });
      }
    }
    if (this.config.compute === 'lambda') {
      this._emit('lambdaAz', 'info', 'Lambda và API Gateway tự chạy tiếp ở các AZ còn lại.');
    }
    return true;
  }

  _serverFail(id) {
    const c = this.config;
    if (c.compute === 'lambda') {
      this._startScenario('serverFail', {});
      this._emit(
        'serverFail',
        'info',
        'Một máy chủ vật lý trong hạ tầng Lambda bị hỏng — AWS tự chuyển hàm sang máy khác, bạn không phải làm gì.',
      );
      return true;
    }
    const running = this.instances.filter((i) => i.state === 'running');
    let victim = id ? running.find((i) => i.id === id) : null;
    if (!victim && !id) {
      const primary = this._primaryInstance();
      if (!c.elb && primary && primary.state === 'running') victim = primary;
      else if (running.length) victim = running[Math.floor(this.rand() * running.length)];
    }
    if (!victim) {
      this._emit('noop', 'warn', 'Không có EC2 nào đang chạy để gây hỏng.');
      return false;
    }
    const sc = this._startScenario('serverFail', { victimPrimary: !c.elb && victim === this._primaryInstance() });
    sc.victimAz = victim.az;
    this._failInstance(victim, 'hardware');
    this._emit('serverFail', 'error', `${instName(victim)} ở ${AZ_LABEL[victim.az]} hỏng phần cứng (cháy nguồn, hỏng ổ đĩa…)!`, {
      id: victim.id,
      az: victim.az,
    });
    return true;
  }

  _spike() {
    this._startScenario('spike', {});
    this._clearTimers('traffic');
    this.night = false;
    this.targetUsers = USERS.spike;
    this._emit('spike', 'warn', 'Video về sản phẩm của bạn lan truyền khắp mạng xã hội: 1.000.000 người cùng truy cập!');
    this._schedule(
      SPIKE_HOLD,
      () => {
        this.targetUsers = USERS.normal;
        this._emit('spikeEnd', 'info', 'Cơn sốt qua đi, lượng truy cập giảm dần về bình thường.');
      },
      'traffic',
    );
    return true;
  }

  _dbFail() {
    const c = this.config;
    if (c.database === 'none') {
      this._emit('noop', 'warn', 'Kiến trúc này chưa có database riêng — hãy thêm RDS hoặc DynamoDB trước.');
      return false;
    }
    if (c.database === 'dynamodb') {
      this._startScenario('dbFail', {});
      this._emit(
        'dbFail',
        'info',
        'Một node lưu trữ của DynamoDB bị hỏng — dữ liệu đã có bản sao ở nhiều AZ nên AWS tự thay thế, ứng dụng không bị ảnh hưởng.',
      );
      return true;
    }
    const p = this.db.find((n) => n.role === 'primary' && n.state === 'ok');
    if (!p) {
      this._emit('noop', 'warn', 'Database đang không hoạt động sẵn rồi.');
      return false;
    }
    this._startScenario('dbFail', { dbAz: p.az });
    this._emit('dbFail', 'error', `Ổ đĩa của database primary (RDS ở ${AZ_LABEL[p.az]}) bị hỏng!`, { az: p.az, id: p.id });
    this._failDb(p, 'hardware');
    return true;
  }

  _failDb(n, cause) {
    if (n.state === 'failed') {
      // already down (e.g. waiting for a new host) and now its AZ is gone too: no auto-recovery
      if (cause === 'quake') {
        n.autoRecover = false;
        n.timer = 0;
        n.cause = 'quake';
      }
      return;
    }
    const wasPromoting = n.state === 'promoting';
    n.state = 'failed';
    n.cause = cause;
    n.timer = 0;
    n.autoRecover = false;
    if (n.role === 'primary' || wasPromoting) {
      const sb = this.db.find((o) => o !== n && o.role === 'standby' && o.state === 'ok');
      if (sb && !wasPromoting) {
        sb.state = 'promoting';
        sb.timer = RDS.failoverTime;
        this._emit(
          'dbFailoverStart',
          'warn',
          `RDS Multi-AZ phát hiện primary ở ${AZ_LABEL[n.az]} hỏng → tự chuyển sang standby ở ${AZ_LABEL[sb.az]} (failover)…`,
          { az: sb.az },
        );
      } else if (cause === 'hardware') {
        n.timer = RDS.recoverTime;
        n.autoRecover = true;
        this._emit(
          'dbDown',
          'error',
          'Database RDS (Single-AZ) ngừng hoạt động! Không có standby nên phải chờ AWS thay máy chủ mới (thực tế: hàng chục phút).',
          { az: n.az },
        );
      } else {
        this._emit(
          'dbDown',
          'error',
          `Database RDS nằm trong ${AZ_LABEL[n.az]} đã mất! Không có standby — phải khôi phục từ bản backup sang AZ khác.`,
          { az: n.az },
        );
      }
    } else {
      this._emit('standbyLost', 'warn', `Mất bản standby của RDS ở ${AZ_LABEL[n.az]} — primary vẫn chạy bình thường.`, {
        az: n.az,
      });
    }
  }

  _night() {
    this._startScenario('night', {});
    this._clearTimers('traffic');
    this.night = true;
    this.targetUsers = USERS.night;
    this._emit('night', 'info', 'Đêm khuya: chỉ còn khoảng 500 người dùng online.');
    this._schedule(
      NIGHT_HOLD,
      () => {
        this.night = false;
        this.targetUsers = USERS.normal;
        this._emit('day', 'info', 'Trời sáng: người dùng quay trở lại.');
      },
      'traffic',
    );
    return true;
  }

  _repair() {
    if (this.scenario) this._finishScenario(true);
    this.lesson = null;
    const c = this.config;
    for (const az of AZ_IDS) {
      if (this.az[az] !== 'ok') {
        this.az[az] = 'ok';
        this.azSince[az] = this.t;
        this._emit('azRestored', 'success', `${AZ_LABEL[az]} đã có điện và mạng trở lại.`, { az });
      }
    }
    const rebooted = [];
    for (const i of this.instances) {
      if (i.state !== 'failed') continue;
      if (c.asg) this._terminate(i);
      else {
        i.state = 'pending';
        i.timer = EC2.bootTime * 0.6;
        i.boot = i.timer;
        i.reason = 'repair';
        i.cause = null;
        i.detected = false;
        i.failSeen = 0;
        i.registered = false;
        rebooted.push(i);
      }
    }
    if (rebooted.length) this._emit('reboot', 'info', `Quản trị viên khởi động lại ${listNames(rebooted)}.`);
    if (c.database === 'rds') {
      // a standby that is being promoted already is the primary-to-be
      const hasPrimary = this.db.some((n) => (n.role === 'primary' && n.state !== 'failed') || n.state === 'promoting');
      let primarySet = hasPrimary;
      for (const n of this.db) {
        if (n.state !== 'failed') continue;
        if (!primarySet) {
          n.role = 'primary';
          n.state = 'creating';
          n.timer = RDS.restoreTime;
          primarySet = true;
          this._emit('dbRestore', 'info', `Khôi phục database RDS từ bản backup gần nhất (${AZ_LABEL[n.az]})…`, { az: n.az });
        } else if (c.rdsMultiAz) {
          n.role = 'standby';
          n.state = 'creating';
          n.timer = RDS.standbyCreate;
        } else n.remove = true;
        n.cause = null;
        n.autoRecover = false;
      }
      this.db = this.db.filter((n) => !n.remove);
    }
    for (const n of this.nat) n.state = 'ok';
    this._clearTimers('traffic');
    this.night = false;
    this.targetUsers = USERS.normal;
    this._apply(this.config, {});
    this._emit('repair', 'success', 'Đã khôi phục: mọi AZ hoạt động, lượng truy cập trở về bình thường.');
    return true;
  }

  // ── scenario bookkeeping (feeds the lesson card) ──────────────────────────

  _startScenario(action, extra) {
    if (this.scenario) this._finishScenario(true);
    this.lesson = null;
    const active = this._active().length;
    const primary = this._primaryInstance();
    const dbPrimary = this.db.find((n) => n.role === 'primary');
    const sc = {
      action,
      ...extra,
      start: this.t,
      end: this.t + SCENARIO_TIME[action],
      window: SCENARIO_TIME[action],
      overAtMax: false,
      cfg: JSON.parse(JSON.stringify(this.config)),
      flags: new Set(),
      minSuccess: 1,
      badTime: 0,
      heavyTime: 0,
      downTime: 0,
      okStreak: 0,
      maxLatency: 0,
      peakUsers: this.users,
      startActive: active,
      peakInstances: active,
      minInstances: active,
      peakLambda: 0,
      costStart: this.metrics.cost,
      costMax: this.metrics.cost,
      costMin: this.metrics.cost,
      dbMaxLoad: 0,
      edgeShareMax: 0,
      primaryAz: primary ? primary.az : null,
      natAz: this.nat[0] ? this.nat[0].az : null,
      dbPrimaryAz: dbPrimary ? dbPrimary.az : null,
      cfgChanged: false,
    };
    this.scenario = sc;
    return sc;
  }

  _trackScenario(dt) {
    const sc = this.scenario;
    if (!sc) return;
    const m = this.metrics;
    sc.minSuccess = Math.min(sc.minSuccess, m.success);
    if (m.status === 'degraded' || m.status === 'down') sc.badTime += dt;
    if (m.success < 0.7) sc.heavyTime += dt;
    if (m.status === 'down') sc.downTime += dt;
    sc.okStreak = m.status === 'ok' || m.status === 'slow' ? sc.okStreak + dt : 0;
    if (!m.timeout) sc.maxLatency = Math.max(sc.maxLatency, m.latency);
    sc.peakUsers = Math.max(sc.peakUsers, this.users);
    const active = this._active().length;
    sc.peakInstances = Math.max(sc.peakInstances, active);
    sc.minInstances = Math.min(sc.minInstances, active);
    sc.peakLambda = Math.max(sc.peakLambda, this.lambda.conc);
    sc.costMax = Math.max(sc.costMax, m.cost);
    sc.costMin = Math.min(sc.costMin, m.cost);
    for (const n of this.db) sc.dbMaxLoad = Math.max(sc.dbMaxLoad, n.load);
    const f = this.flows;
    if (f.rps > 0) sc.edgeShareMax = Math.max(sc.edgeShareMax, f.served.edge / f.rps);
    // overloaded even though Auto Scaling already runs every instance it is allowed
    const c = this.config;
    if (c.compute === 'ec2' && c.asg && f.avgCpu > 1) {
      const running = this.instances.filter((i) => i.state === 'running').length;
      if (running >= c.asgMax) sc.overAtMax = true;
    }

    const elapsed = this.t - sc.start;
    const quick = sc.action === 'quake' || sc.action === 'serverFail' || sc.action === 'dbFail';
    const settled = quick && elapsed >= 8 && sc.okStreak >= 5 && !this._busy();
    if (this.t >= sc.end - 1e-9 || settled) this._finishScenario(false);
  }

  // nothing booting, failing over or broken: a good moment to start the next event
  settled() {
    return (
      !this._busy() &&
      AZ_IDS.every((az) => this.az[az] === 'ok') &&
      !this.instances.some((i) => i.state === 'failed') &&
      !this.db.some((n) => n.state === 'failed') &&
      !this.nat.some((n) => n.state === 'failed') &&
      (this.metrics.status === 'ok' || this.metrics.status === 'slow')
    );
  }

  _busy() {
    return (
      this.instances.some((i) => i.state === 'pending' || i.state === 'terminating') ||
      this.db.some((n) => n.state === 'promoting' || n.state === 'creating' || n.autoRecover)
    );
  }

  _finishScenario(silent) {
    const sc = this.scenario;
    this.scenario = null;
    if (silent || !sc) return;
    sc.finalStatus = this.metrics.status;
    sc.duration = this.t - sc.start;
    sc.costEnd = this.metrics.cost;
    this.lesson = evaluateLesson(sc);
    this._emit('lesson', 'info', 'Xem bài học rút ra từ sự kiện vừa rồi.', { lesson: this.lesson });
  }
}
