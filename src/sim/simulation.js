// Sandbox simulation: a small model of a web app running on AWS. Every step it routes the
// incoming traffic through the chosen architecture (CDN → load balancer → servers →
// database), works out load, failures, latency and cost, and runs the AWS behaviours a
// beginner should see: health checks, Auto Scaling, RDS Multi-AZ failover, Lambda scaling,
// an SQS backlog draining in the background, a restore from AWS Backup.
// Pure JS (no three.js) so it runs under Node tests; the 3D scene only reads its state.
import {
  APIGW,
  ASG,
  AZ_CODE,
  AZ_IDS,
  AZ_LABEL,
  BACKUP,
  BUDGET,
  CACHE,
  CF,
  DDB,
  DDOS,
  DEPLOY,
  DR,
  EC2,
  ELB,
  EXT,
  HEALTH,
  GUARDDUTY,
  LAMBDA,
  LEAK,
  NAT,
  NIGHT_HOLD,
  OTHER_AZ,
  R53,
  RDS,
  REGION,
  REGION_MS,
  REPORT,
  REQ_PER_USER,
  S3,
  S3APP,
  SCENARIO_TIME,
  SPIKE_HOLD,
  SQLI,
  SQS,
  STATIC_SHARE,
  STEP,
  USERS,
  VPCE,
  WAF,
  WIPE,
} from './constants.js';
import { evaluateLesson, natlessFailures } from './lessons.js';

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
  nat: 'none', // 'none' | 'single' | 'perAz' | 'regional' — NAT Gateways for a private fleet
  database: 'none', // 'none' | 'rds' | 'dynamodb'
  rdsMultiAz: false,
  cache: false, // ElastiCache in front of RDS
  waf: false, // AWS WAF: app-layer rules (blocks SQL injection, rate-based rules)
  shield: false, // AWS Shield: dedicated network-layer DDoS defence
  budget: 0, // AWS Budgets: monthly budget in $ (0 = none), alerts on the forecast
  queue: false, // SQS + Lambda worker: orders are queued and processed in the background
  vpce: false, // VPC Endpoints: a private fleet reaches S3 (Gateway) and SQS (Interface) without NAT
  backup: false, // AWS Backup: daily backups + point-in-time recovery of the data store
  guardduty: false, // Amazon GuardDuty: threat detection on CloudTrail, VPC Flow Logs and DNS logs
  canary: false, // CodeDeploy canary: a new release gets 10% of traffic first, a 5xx alarm rolls it back
  dr: 'none', // 'none' | 'backup' | 'pilot' | 'warm' | 'active' — disaster recovery in a second Region
  analytics: 'none', // 'none' | 'athena' | 'redshift' — where reports run: the production database, S3 + Athena, Redshift (zero-ETL)
};

const DR_MODES = ['backup', 'pilot', 'warm', 'active'];
const ANALYTICS_MODES = ['athena', 'redshift'];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// queueing delay multiplier: requests wait longer as a resource gets busy
const queue = (rho) => 1 / (1 - Math.min(rho, 0.9));
const perHour = (rps) => (rps * 3600) / 1e6; // requests/s → millions of requests per hour
const gbPerHour = (kbps) => (kbps * 3600) / 1e6; // KB/s → GB per hour

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
  for (const k of ['route53', 'cloudfront', 's3', 'elb', 'asg', 'rdsMultiAz', 'cache', 'waf', 'shield', 'queue', 'vpce', 'backup', 'guardduty', 'canary']) out[k] = !!out[k];
  for (const az of AZ_IDS) out.ec2[az] = clamp(Math.round(out.ec2[az] || 0), 0, EC2.maxPerAz);
  if (out.compute === 'ec2' && !out.asg && out.ec2.a + out.ec2.b === 0) out.ec2.a = 1;
  out.budget = BUDGET.options.includes(Number(out.budget)) ? Number(out.budget) : 0;
  out.asgMin = clamp(Math.round(out.asgMin || 1), 1, ASG.limit);
  out.asgMax = clamp(Math.round(out.asgMax || 1), out.asgMin, ASG.limit);
  if (out.compute === 'lambda') {
    out.elb = false;
    out.asg = false;
  }
  // a canary splits traffic by weight: an ALB in front of EC2, or a Lambda alias
  if (out.compute === 'ec2' && !out.elb) out.canary = false;
  if (out.database !== 'rds') {
    out.rdsMultiAz = false;
    out.cache = false;
  }
  // servers in a private subnet are only reachable through a load balancer, and a NAT
  // Gateway only makes sense for a private fleet
  out.appSubnet = out.appSubnet === 'private' && out.compute === 'ec2' && out.elb ? 'private' : 'public';
  out.nat = out.appSubnet === 'private' && ['single', 'perAz', 'regional'].includes(out.nat) ? out.nat : 'none';
  // a public fleet reaches S3 and SQS directly: VPC Endpoints only matter for a private one
  if (out.appSubnet !== 'private') out.vpce = false;
  // moving users between Regions is Route 53's job (health checks + failover routing), and backup
  // & restore needs the backups it restores from (unless there is no data to keep at all)
  out.dr = DR_MODES.includes(out.dr) ? out.dr : 'none';
  if (!out.route53) out.dr = 'none';
  if (out.dr === 'backup' && !out.backup && hasData(out)) out.dr = 'none';
  // reports need data to read: a copy of the database in S3 (Athena) or in Redshift (zero-ETL)
  out.analytics = ANALYTICS_MODES.includes(out.analytics) && out.database !== 'none' ? out.analytics : 'none';
  return out;
}

// whether the architecture keeps data anywhere (a database, or the servers' own disks)
export const hasData = (c) => c.database !== 'none' || c.compute === 'ec2';

const NAMES = {
  route53: 'Route 53',
  cloudfront: 'CloudFront',
  s3: 'S3',
  elb: 'Elastic Load Balancer',
  asg: 'Auto Scaling',
  rdsMultiAz: 'RDS Multi-AZ',
  cache: 'ElastiCache',
  waf: 'AWS WAF',
  shield: 'AWS Shield',
  queue: 'SQS + Lambda worker',
  vpce: 'VPC Endpoint (S3, SQS)',
  backup: 'AWS Backup',
  guardduty: 'Amazon GuardDuty',
  canary: 'deploy canary + tự rollback',
};

const instName = (i) => `EC2 #${i.n}`;
const usd = (x) => '$' + Math.round(x).toLocaleString('vi-VN');
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
    if (prev.budget !== next.budget) this.budget.alerted = 0;
    if (this.scenario) this.scenario.cfgChanged = true;
    this._apply(prev, {});
    // what the patch itself asked for: DR switched off by hand needs no explanation
    this._drAsked = patch.dr;
    this._announceConfig(prev, next);
    this._route(0);
  }

  setUsers(n) {
    this._clearTimers('traffic');
    this.night = false;
    this.targetUsers = clamp(Math.round(n), USERS.min, USERS.max);
  }

  trigger(action, opts = {}) {
    // with the whole primary Region gone there is nothing left there to break or attack
    if (this.regionDown && !['repair', 'spike', 'night', 'regionDown'].includes(action)) {
      this._emit('noop', 'warn', `Region ${REGION.code} đang sập — bấm Phục hồi trước khi thử sự kiện khác.`);
      return false;
    }
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
      case 'ddos':
        return this._ddos();
      case 'sqlInjection':
        return this._sqlInjection();
      case 'paymentDown':
        return this._paymentDown();
      case 'dataDelete':
        return this._dataDelete();
      case 'leakedKey':
        return this._leakedKey();
      case 'badDeploy':
        return this._badDeploy();
      case 'regionDown':
        return this._regionDown();
      case 'report':
        return this._report();
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
      nat: this.nat.map((n) => ({ id: n.id, az: n.az, state: n.state, regional: !!n.regional, remaining: n.state === 'expanding' ? Math.max(0, n.timer) : 0 })),
      outbound: { rps: this.flows.outRps || 0, failing: this.flows.outFailRps || 0 },
      totals: { ...this.totals },
      cfHit: this.flows.cfHit,
      cacheHit: this.flows.cacheHit,
      budget: this.config.budget ? { amount: this.config.budget, forecast: this.budget.forecast } : null,
      ddosRps: this.flows.ddosRps,
      ddosBlocked: this.flows.ddosBlocked,
      sqliFail: this.flows.sqliFail,
      queue: this.config.queue ? { depth: this.queue.depth, inRate: this.flows.queueIn, outRate: this.flows.queueOut } : null,
      extDown: this.extDown,
      leak: { active: this.leak.active, detected: this.leak.detected, seen: this.t - this.leak.start >= LEAK.billingLag },
      deploy: { active: this.deploy.active, phase: this.deploy.phase, share: this.deploy.share, canary: this.deploy.canary },
      data: { wiped: this.data.wiped, restoring: this.data.restoring, remaining: this.data.restoring ? Math.max(0, this.data.timer) : 0, lost: this.data.lost },
      s3App: { rps: this.flows.s3AppRps, viaNat: this.flows.s3NatRps, viaEndpoint: this.flows.s3VpceRps, failing: this.flows.awsFailRps },
      region: this.regionDown ? 'down' : 'ok',
      report: this.report.active ? { where: this.report.where, remaining: Math.max(0, this.report.timer) } : null,
      dr: this._drSnapshot(),
      scenario: sc ? { action: sc.action, az: sc.az, remaining: Math.max(0, sc.end - this.t) } : null,
    };
  }

  // the DR Region as the HUD and the pick card see it
  _drSnapshot() {
    const d = this.dr;
    if (this.config.dr === 'none') return null;
    const fleet = d.fleet.filter((i) => i.state !== 'terminating');
    const r = this.flows.dr;
    return {
      strategy: this.config.dr,
      phase: d.phase,
      share: d.share,
      db: d.db,
      s3: d.s3,
      lambda: d.lambda,
      elb: d.elb,
      vault: d.vault,
      fleet: fleet.map((i) => ({ id: i.id, n: i.n, state: i.state, cpu: i.state === 'running' ? r?.cpu || 0 : 0 })),
      running: fleet.filter((i) => i.state === 'running').length,
      rps: r ? r.rps : 0,
      remaining: d.phase === 'rebuilding' ? Math.max(0, d.timer) : d.db === 'promoting' ? Math.max(0, d.promoteTimer) : 0,
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
    this.cacheSince = -100;
    this._ddosRps = 0;
    this._sqliActive = false;
    this.extDown = false; // the payment provider / email API is down
    this.queue = { depth: 0, warned: false }; // SQS backlog: messages waiting for the worker
    this.data = { wiped: false, restoring: false, timer: 0, lost: false, hadBackup: false };
    this.leak = { active: false, detected: false, start: -100 }; // crypto miners running on a leaked access key
    // a release being rolled out: `share` of the app traffic runs the new (buggy) version
    this.deploy = { active: false, phase: 'idle', share: 0, start: -100, canary: false };
    this.regionDown = false; // the whole primary Region is unreachable
    this.dr = this._drEmpty();
    // a report running: on the production database ('prod'), as a DynamoDB Scan ('scan'), in Athena or Redshift
    this.report = { active: false, where: null, start: -100, timer: 0 };
    this.asgDesired = 0;
    this._overSince = null;
    this._lastScaleIn = -100;
    this._asgClock = 0;
    this._hcClock = 0;
    this._histClock = 0;
    this._maxWarned = false;
    this._noAzWarned = false;
    this._rebalancing = false;
    this.flows = { rps: 0, targets: [], cfHit: 0, cacheHit: 0, ddosRps: 0, ddosBlocked: 0, sqliFail: 0, appRps: 0, avgCpu: 0, queueIn: 0, queueOut: 0, s3AppRps: 0, s3NatRps: 0, s3VpceRps: 0, awsFailRps: 0, drShare: 0, dr: null };
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
    this.budget = { forecast: 0, alerted: 0 }; // alerted: 0 none, 1 over 80%, 2 over 100%
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

    // NAT Gateways: one in AZ A for the whole VPC, one per AZ, or one Regional NAT Gateway.
    // Switching to the Regional one starts it out ready in every AZ that runs servers; from
    // then on _regionalNat follows the fleet each step
    if (c.nat === 'regional') {
      if (!prev || prev.nat !== 'regional') {
        this.nat = [];
        this._regionalNat(0, true);
      }
    } else {
      const zonal = this.nat.filter((n) => !n.regional);
      const natAzs = c.nat === 'perAz' ? AZ_IDS : c.nat === 'single' ? [zonal[0]?.az || (this.az.a === 'ok' ? 'a' : 'b')] : [];
      this.nat = zonal.filter((n) => natAzs.includes(n.az));
      for (const az of natAzs) {
        if (!this.nat.some((n) => n.az === az) && this.az[az] === 'ok') this.nat.push({ id: `nat-${az}`, az, state: 'ok' });
      }
    }

    // CloudFront starts with an empty cache when it is switched on mid-run
    if (c.cloudfront && !(prev && prev.cloudfront)) this.cfSince = initial ? -100 : this.t;
    // ElastiCache likewise starts cold when it is switched on mid-run
    if (c.cache && !(prev && prev.cache)) this.cacheSince = initial ? -100 : this.t;

    this._drApply(prev, initial);
  }

  // how an instance reaches the Internet for its outside API calls
  _wayOut(inst) {
    if (this.config.appSubnet !== 'private') return { ok: true, via: null };
    const n = this.config.nat === 'single' ? this.nat[0] : this.nat.find((x) => x.az === inst.az);
    if (!n) return { ok: false, via: null };
    // a Regional NAT Gateway still expanding into this AZ: the traffic crosses to its presence
    // in another AZ, or has no way out while there is none ready
    if (n.state === 'expanding') {
      const other = this.nat.find((x) => x !== n && x.state === 'ok' && this.az[x.az] === 'ok');
      return other ? { ok: true, via: other.id, cross: true } : { ok: false, via: null, expanding: n.id };
    }
    return { ok: n.state === 'ok' && this.az[n.az] === 'ok', via: n.id };
  }

  // Regional NAT Gateway: one gateway for the VPC, present in every healthy AZ that runs app
  // servers. Joining a new AZ takes NAT.regionalExpandTime; it leaves an AZ with no servers
  // left. A destroyed AZ keeps its lost presence until the repair. `instant`: presences created
  // along with the gateway itself are ready at once.
  _regionalNat(dt, instant = false) {
    if (this.config.nat !== 'regional') return;
    for (const az of AZ_IDS) {
      if (this.az[az] !== 'ok') continue;
      let n = this.nat.find((x) => x.az === az);
      const used = this.instances.some((i) => i.az === az && i.state !== 'terminating');
      if (n && !used) {
        this.nat = this.nat.filter((x) => x !== n);
        this._emit('natContract', 'info', `Không còn EC2 ở ${AZ_LABEL[az]} → Regional NAT Gateway rút khỏi AZ đó, bớt một giờ NAT phải trả.`, { az });
      } else if (!n && used) {
        n = { id: `nat-${az}`, az, state: instant ? 'ok' : 'expanding', timer: instant ? 0 : NAT.regionalExpandTime, regional: true };
        this.nat.push(n);
        if (instant) continue;
        const via = this.nat.find((x) => x !== n && x.state === 'ok' && this.az[x.az] === 'ok');
        this._emit(
          'natExpand',
          via || !natlessFailures(this.config).length ? 'info' : 'warn',
          via
            ? `Regional NAT Gateway đang mở rộng sang ${AZ_LABEL[az]} (thực tế thường 15–20 phút) — trong lúc chờ, EC2 ở ${AZ_LABEL[az]} ra Internet nhờ qua ${AZ_LABEL[via.az]}.`
            : `Regional NAT Gateway đang mở rộng sang ${AZ_LABEL[az]} (thực tế thường 15–20 phút) — chưa AZ nào có NAT sẵn để đi nhờ, EC2 ở ${AZ_LABEL[az]} tạm chưa ra Internet được.`,
          { az },
        );
      } else if (n && n.state === 'expanding') {
        n.timer -= dt;
        if (n.timer > 1e-9) continue;
        n.state = 'ok';
        n.timer = 0;
        this._emit('natExpanded', 'success', `Regional NAT Gateway đã có mặt ở ${AZ_LABEL[az]}: EC2 ở đó ra Internet ngay trong AZ của mình.`, { az });
      }
    }
  }

  // NAT Gateway-hours billed right now: every zonal gateway, or each AZ a Regional NAT Gateway
  // is present in (ready or still expanding)
  _natHours() {
    return this.config.nat === 'regional' ? this.nat.filter((n) => n.state !== 'failed').length : this.nat.length;
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
      const label = {
        none: 'không dùng NAT Gateway',
        single: '1 NAT Gateway (ở AZ A) dùng chung',
        perAz: 'mỗi AZ một NAT Gateway',
        regional: 'Regional NAT Gateway — một NAT cho cả VPC, tự có mặt ở từng AZ có EC2',
      };
      this._emit('config', 'info', `Đường ra Internet của EC2: ${label[next.nat]}.`);
    }
    // what a private fleet without NAT can no longer reach — re-announced when that changes
    const natless = (c) => (c.appSubnet === 'private' && c.nat === 'none' ? natlessFailures(c) : []);
    const lost = natless(next);
    if (lost.length && lost.join() !== natless(prev).join()) {
      this._emit('noNat', 'error', `EC2 ở private subnet chưa có NAT Gateway → không gọi được ${lost.join(', ')}; các request cần tới đó bị lỗi.`);
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
    if (prev.budget !== next.budget) {
      this._emit(
        'config',
        'info',
        next.budget
          ? `AWS Budgets: ngân sách ${usd(next.budget)}/tháng — gửi cảnh báo khi chi phí dự báo vượt 80% và 100%.`
          : 'Đã gỡ AWS Budgets.',
      );
    }
    if (prev.dr !== next.dr) {
      const label = {
        none: 'không có Region dự phòng',
        backup: `backup & restore — bản sao lưu được chép sang ${DR.city}, chưa dựng gì ở đó`,
        pilot: `pilot light — dữ liệu sao chép liên tục sang ${DR.city}, máy chủ để tắt`,
        warm: `warm standby — một bản thu nhỏ luôn chạy sẵn ở ${DR.city}`,
        active: `active-active — ${REGION.city} và ${DR.city} cùng phục vụ người dùng`,
      };
      this._emit('config', 'info', `Dự phòng thảm hoạ (DR): ${label[next.dr]}.`);
      // switched off as a side effect: say why
      const asked = this._drAsked;
      if (next.dr === 'none' && prev.dr !== 'none' && asked !== 'none') {
        if (!next.route53) this._emit('config', 'warn', 'Không có Route 53 thì không có gì chuyển người dùng sang Region khác — DR đã tắt theo.');
        else if (!next.backup) this._emit('config', 'warn', 'Backup & restore cần AWS Backup chép bản sao sang Region khác — DR đã tắt theo.');
      }
    }
    if (prev.analytics !== next.analytics) {
      const label = {
        none: next.database === 'none' ? 'đã gỡ — không còn database để lấy dữ liệu' : 'báo cáo chạy thẳng trên database production',
        athena: 'database xuất sang S3 (Parquet) mỗi đêm, báo cáo chạy bằng Athena',
        redshift: 'zero-ETL chép mọi thay đổi sang Redshift Serverless sau vài giây, báo cáo chạy ở đó',
      };
      this._emit('config', 'info', `Phân tích dữ liệu: ${label[next.analytics]}.`);
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
    // `extra` adds details (az, instId, dbId…) but never overrides the event's own fields: `id`
    // keys the event log, so it must stay unique
    const e = { ...extra, id: ++this._eventSeq, t: this.t, type, level, text };
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
    this._restoreTick(dt);
    this._deployTick(dt);
    this._reportTick(dt);
    this._drTick(dt);
    this._hcClock += dt;
    // with the whole Region gone its load balancer and Auto Scaling are gone too
    if (this._hcClock >= HEALTH.interval - 1e-9) {
      this._hcClock = 0;
      if (!this.regionDown) this._healthChecks();
    }
    if (this.config.compute === 'ec2' && this.config.asg && !this.regionDown) {
      this._asgClock += dt;
      if (this._asgClock >= 1 - 1e-9) {
        this._asgClock = 0;
        this._autoscale();
      }
    }
    this._regionalNat(dt);
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

  // AWS Backup restore in progress: the data is back once the new copy is ready
  _restoreTick(dt) {
    const d = this.data;
    // (the restore runs in the primary Region: it waits for the Region like everything else)
    if (!d.restoring || this.regionDown) return;
    d.timer -= dt;
    if (d.timer > 0) return;
    d.restoring = false;
    d.wiped = false;
    d.timer = 0;
    this._emit('restoreDone', 'success', 'Khôi phục xong: dữ liệu trở về thời điểm ngay trước lệnh xoá, ứng dụng chuyển sang bản vừa dựng lại.');
  }

  // a release rolling out (all at once: share climbs to 1) or rolling back (share falls to 0)
  _deployTick(dt) {
    const d = this.deploy;
    if (!d.active) return;
    if (d.phase === 'rolling') {
      d.share = Math.min(1, d.share + dt / DEPLOY.rollout);
      if (d.share >= 1) {
        d.phase = 'live';
        const where = this.config.compute === 'ec2' ? 'mọi EC2' : 'hàm Lambda';
        this._emit('deployLive', 'error', `Bản v2 đã chạy trên ${where}: mọi request động (đặt hàng, đăng nhập…) trả lỗi 500!`);
      }
    } else if (d.phase === 'rollback') {
      d.share = Math.max(0, d.share - (d.from * dt) / d.backTime);
      if (d.share <= 0) {
        this.deploy = { active: false, phase: 'idle', share: 0, start: -100, canary: false };
        this._emit(
          'deployRolledBack',
          'success',
          d.canary
            ? 'Đã rollback: 100% traffic về lại bản cũ. Bản lỗi chỉ chạm khoảng 10% request trong vài giây.'
            : 'Đã deploy lại bản cũ lên mọi máy — website hoạt động bình thường trở lại.',
        );
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
            { instId: i.id, az: i.az },
          );
        } else if (!c.asg) {
          this._emit(
            'hcFail',
            'warn',
            `${instName(i)} không phản hồi. Không có Auto Scaling nên máy này nằm đó chờ quản trị viên xử lý.`,
            { instId: i.id, az: i.az },
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
          { instId: victim.id },
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
    const total = this.users * REQ_PER_USER;
    // Route 53 sends `drShare` of the users to the DR Region — half of them when active-active, all
    // of them after a failover. Everything below up to the DR part is the primary Region's share.
    const drShare = c.dr === 'none' ? 0 : this.dr.share;
    const down = this.regionDown;
    const rps = total * (1 - drShare);
    const staticRps = rps * STATIC_SHARE;
    const dynRps = rps - staticRps;
    const f = {
      rps: total,
      drShare,
      regionDown: down,
      dr: null,
      staticShare: STATIC_SHARE,
      route53: c.route53,
      cf: c.cloudfront,
      cfHit: 0,
      cache: c.cache,
      cacheHit: 0,
      ddosRps: 0,
      ddosBlocked: 0,
      sqliFail: 0,
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
      reportHit: false, // a report is hogging the production database
      appRps: 0,
      avgCpu: 0,
      outboundShare: NAT.outboundShare,
      outRps: 0,
      outFailRps: 0,
      natMode: c.nat,
      priv: c.compute === 'ec2' && c.appSubnet === 'private',
      queue: c.queue,
      vpce: c.vpce,
      extDown: this.extDown,
      deploy: this.deploy.active ? { phase: this.deploy.phase, share: this.deploy.share, canary: this.deploy.canary } : null,
      queueIn: 0,
      queueOut: 0,
      s3AppShare: c.s3 && c.compute === 'ec2' ? S3APP.share : 0,
      s3AppRps: 0,
      s3NatRps: 0,
      s3VpceRps: 0,
      awsFailRps: 0,
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
    // the primary Region's bucket is gone with it; CloudFront's origin group then fetches the misses
    // from the replica bucket in the DR Region, request by request
    f.s3Failover = down && c.cloudfront && this.dr.s3 === 'ready';
    const s3 = c.s3 && (!down || f.s3Failover) ? miss : 0;

    // DDoS: a flood of junk requests hits the same entry point as real traffic. Shield is the
    // dedicated defence (blocks almost all of it); a WAF rate-based rule alone helps some but
    // is not a substitute.
    const ddosRaw = this._ddosRps || 0;
    const ddosMitigation = c.shield ? DDOS.shieldMitigation : c.waf ? DDOS.wafOnlyMitigation : 0;
    const ddosBlocked = ddosRaw * ddosMitigation;
    const ddosThrough = ddosRaw - ddosBlocked;
    f.ddosRps = ddosRaw;
    f.ddosBlocked = ddosBlocked;

    const appRps = dynRps + (c.s3 ? 0 : miss) + ddosThrough;
    f.appRps = appRps;

    let appServed = 0;
    let appMsSum = 0;
    let entryMs = 0;
    // what a dynamic request reaches beyond the app tier: an outside API (payment, email…) and,
    // when there is a bucket, S3 (product photos, uploads)
    const dynFrac = appRps > 0 ? dynRps / appRps : 0;
    const outPerReq = dynFrac * NAT.outboundShare;
    const s3PerReq = c.s3 ? dynFrac * S3APP.share : 0;
    let outRps = 0; // outside API calls the app tier makes itself, inside the request
    let outFail = 0;
    let natRps = 0; // …of which through a NAT Gateway
    let enqRps = 0; // orders handed to SQS instead
    let enqNatRps = 0;
    let awsFail = 0; // S3 / SQS calls that found no way out
    let s3AppRps = 0;
    let s3NatRps = 0;
    let s3VpceRps = 0;
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
        const priv = c.appSubnet === 'private';
        const calls = served * outPerReq;
        if (c.queue) {
          // the order just goes into SQS — an AWS API, reached through the SQS Interface
          // Endpoint, the NAT Gateway, or directly from a public subnet
          if (!priv || c.vpce || out.ok) enqRps += calls;
          else awsFail += calls;
          if (priv && !c.vpce && out.via) enqNatRps += calls;
        } else {
          outRps += calls;
          if (out.via) natRps += calls;
          if (!out.ok || this.extDown) outFail += calls;
        }
        // S3 from a private subnet: free through the Gateway Endpoint, otherwise via NAT
        const s3Calls = served * s3PerReq;
        s3AppRps += s3Calls;
        if (priv && c.vpce) s3VpceRps += s3Calls;
        else if (priv) {
          if (out.via) s3NatRps += s3Calls;
          if (!out.ok) awsFail += s3Calls;
        }
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
      // with the Region gone, API Gateway and Lambda there answer nothing at all
      const allowed = down ? 0 : Math.min(appRps, APIGW.limit);
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
      // Lambda outside a VPC reaches the Internet, S3 and SQS directly
      const calls = appServed * outPerReq;
      if (c.queue) enqRps += calls;
      else {
        outRps = calls;
        if (this.extDown) outFail += calls;
      }
      s3AppRps = appServed * s3PerReq;
      if (f.lambdaFail > 0.01 && !this._lambdaWarned) {
        this._lambdaWarned = true;
        this._emit(
          'lambdaThrottle',
          'error',
          `Lambda chạm giới hạn ${LAMBDA.limit} bản chạy đồng thời → request vượt mức bị từ chối (lỗi 429).`,
        );
      } else if (f.lambdaFail === 0) this._lambdaWarned = false;
      if (f.gwFail > 0.01 && !down && !this._gwWarned) {
        this._gwWarned = true;
        this._emit('gwThrottle', 'error', 'API Gateway chạm giới hạn 10.000 request/giây → trả lỗi 429 Too Many Requests.');
      } else if (f.gwFail === 0) this._gwWarned = false;
    }

    // SQS: the Lambda worker drains the backlog at its own pace. While the payment provider is
    // down its calls fail, so the messages simply stay in the queue to be retried later.
    let deqRps = 0;
    if (c.queue) {
      const q = this.queue;
      // (the queue and its worker live in the primary Region: they wait for it with everything else)
      if (!this.extDown && !down) deqRps = Math.min(SQS.workerRate, enqRps + (dt > 0 ? q.depth / dt : 0));
      if (dt > 0) {
        q.depth = Math.max(0, q.depth + (enqRps - deqRps) * dt);
        if (q.depth >= SQS.backlogWarn && !q.warned) {
          q.warned = true;
          this._emit('queueBacklog', 'warn', `SQS đang giữ ${Math.round(q.depth).toLocaleString('vi-VN')} đơn chờ xử lý — khách vẫn đặt hàng được, Lambda worker xử lý dần, không mất đơn nào.`);
        } else if (q.warned && q.depth < 1) {
          q.warned = false;
          this._emit('queueDrained', 'success', 'Lambda worker đã xử lý hết hàng đợi SQS.');
        }
      }
    } else {
      this.queue.depth = 0;
      this.queue.warned = false;
    }
    f.queueIn = enqRps;
    f.queueOut = deqRps;

    // database tier (only the dynamic part needs it). appServed is shared fairly across every
    // kind of request hitting the app tier — legit dynamic, legit static-miss, and (during a
    // DDoS) junk traffic — so each gets its proportional share of whatever capacity served.
    const dynServed = appRps > 0 ? (appServed * dynRps) / appRps : 0;
    const ddosServed = appRps > 0 ? (appServed * ddosThrough) / appRps : 0;
    const appStaticServed = appServed - dynServed - ddosServed;
    let dynOk = dynServed;
    let dbMs = 1;
    for (const n of this.db) n.load = 0;
    if (c.database === 'rds') {
      // ElastiCache sits in front of RDS: it absorbs a share of reads straight from
      // memory, so only the rest (`dbLoad`) ever reaches the database.
      if (c.cache && !down) f.cacheHit = CACHE.hitRatio * (1 - Math.exp(-(this.t - this.cacheSince) / CACHE.warmTime));
      const cacheServed = dynServed * f.cacheHit;
      const dbLoad = dynServed - cacheServed;
      const p = this.db.find((n) => n.role === 'primary' && n.state === 'ok');
      if (!p) {
        // the cache itself is independent of RDS, so cached reads keep working even
        // while the database is down
        dynOk = cacheServed;
        f.dbFail = dynServed > 0 ? 1 - dynOk / dynServed : 0;
        f.dbTarget = (this.db.find((n) => n.role === 'primary') || this.db[0] || {}).id || null;
        dbMs = CACHE.queryMs;
      } else {
        // a heavy report on the same database: every query waits behind its scan, some time out
        const report = this.report.active && this.report.where === 'prod';
        const rho = dbLoad / RDS.capacity;
        p.load = report ? Math.max(1, rho) : rho;
        let dbOk = Math.min(dbLoad, RDS.capacity);
        if (report) dbOk *= 1 - REPORT.failShare;
        const queryMs = RDS.queryMs * queue(rho) + (report ? REPORT.extraMs : 0);
        dynOk = cacheServed + dbOk;
        f.dbFail = dynServed > 0 ? 1 - dynOk / dynServed : 0;
        f.reportHit = report;
        dbMs = dynServed > 0 ? (cacheServed * CACHE.queryMs + dbOk * queryMs) / dynServed : queryMs;
        f.dbTarget = p.id;
      }
    } else if (c.database === 'dynamodb') {
      dbMs = DDB.queryMs;
      f.dbTarget = 'dynamodb';
    }
    // SQL injection: a share of dynamic requests carries a malicious payload aimed at the
    // database. Only a WAF rule (it inspects the request content) catches this — DynamoDB
    // has no SQL to inject into, so it is immune by construction either way.
    if (c.database === 'rds' && this._sqliActive) {
      const blocked = c.waf ? SQLI.mitigation : 0;
      f.sqliFail = SQLI.maliciousShare * (1 - blocked);
      dynOk *= Math.max(0, 1 - f.sqliFail);
    }

    // an accidental delete: most dynamic requests need rows that are gone until a restore
    if (this.data.wiped) dynOk *= 1 - WIPE.share;
    // a buggy release answers 500 on every dynamic request it serves
    if (this.deploy.share > 0) dynOk *= 1 - this.deploy.share;
    // requests whose outside API call (payment, email…) found no way out — or a provider that
    // is down — fail as well, and so do the ones whose S3 / SQS call found no way out
    if ((outFail > 0 || awsFail > 0) && dynServed > 0) dynOk *= Math.max(0, 1 - (outFail + awsFail) / dynServed);
    f.outRps = outRps;
    f.outFailRps = outFail;
    f.awsFailRps = awsFail;
    f.s3AppRps = s3AppRps;
    f.s3NatRps = s3NatRps;
    f.s3VpceRps = s3VpceRps;
    // a synchronous outside call keeps the user waiting; dropping the order into SQS does not
    const extMs = NAT.outboundShare * (c.queue ? SQS.enqueueMs : EXT.ms);

    const appMs = appServed > 0 ? appMsSum / appServed : 0;
    const cfPass = c.cloudfront ? 5 : 0;
    const s3Ms = (c.cloudfront ? CF.edgeMs + CF.originMs + S3.ms : REGION_MS + S3.ms) + (f.s3Failover ? DR.extraMs : 0);
    const toApp = REGION_MS + cfPass + entryMs + appMs;
    const latency1 = edge * CF.edgeMs + s3 * s3Ms + appStaticServed * toApp + dynOk * (toApp + dbMs + extMs);

    // the DR Region's share goes through its own copy of the stack
    const dr = drShare > 0 ? this._routeDr(total * drShare, f) : null;
    f.dr = dr;
    const ok = edge + s3 + appStaticServed + dynOk + (dr ? dr.ok : 0);
    const latencySum = latency1 + (dr ? dr.latencySum : 0);
    f.served = { edge: edge + (dr ? dr.edge : 0), s3, app: appServed, appStatic: appStaticServed, dyn: dynOk, total: ok };
    this.flows = f;
    this._last = { ok, total, latencySum, s3, dynOk, appServed, allowed: down ? 0 : Math.min(appRps, APIGW.limit), natRps, enqRps, enqNatRps, deqRps, s3NatRps };
  }

  // the DR Region's part of the traffic, through the same pipeline simplified: CloudFront (global,
  // shares its cache), the replica bucket, the fleet or Lambda there and its copy of the data
  _routeDr(rps, f) {
    const c = this.config;
    const d = this.dr;
    const staticRps = rps * STATIC_SHARE;
    const dynRps = rps - staticRps;
    const edge = staticRps * f.cfHit;
    const miss = staticRps - edge;
    const s3 = c.s3 && d.s3 === 'ready' ? miss : 0;
    const appRps = dynRps + (c.s3 ? 0 : miss);
    const running = d.fleet.filter((i) => i.state === 'running').length;
    let appServed = 0;
    let cpu = 0;
    let appMs = 0;
    if (c.compute === 'ec2') {
      // no load balancer: users only reach one server there too
      const serving = c.elb ? running : Math.min(1, running);
      appServed = Math.min(appRps, serving * EC2.capacity);
      cpu = serving ? appRps / (serving * EC2.capacity) : 0;
      appMs = (c.elb ? ELB.ms : 0) + EC2.procMs * queue(cpu);
    } else if (d.lambda) {
      appServed = Math.min(appRps, APIGW.limit, LAMBDA.limit / LAMBDA.duration);
      appMs = APIGW.ms + LAMBDA.warmMs;
    }
    const dynServed = appRps > 0 ? (appServed * dynRps) / appRps : 0;
    const appStatic = appServed - dynServed;
    // a global table, a promoted replica or a restored copy takes everything; a replica not promoted
    // yet still reads, but the writes it forwards to the primary fail while that Region is gone
    let dynOk = 0;
    if (d.db === 'ready') dynOk = dynServed;
    else if (d.db === 'replica' || d.db === 'promoting') dynOk = this.regionDown ? dynServed * (1 - DR.writeShare) : dynServed;
    if (c.database === 'rds') dynOk = Math.min(dynOk, RDS.capacity);
    // the outside API (payment, email) is the same provider whichever Region calls it
    if (this.extDown && !c.queue) dynOk *= 1 - NAT.outboundShare;
    const ms = REGION_MS + DR.extraMs + (c.cloudfront ? 5 : 0);
    const dbMs = c.database === 'rds' ? RDS.queryMs : c.database === 'dynamodb' ? DDB.queryMs : 1;
    const extMs = NAT.outboundShare * (c.queue ? SQS.enqueueMs : EXT.ms);
    const s3Ms = c.cloudfront ? CF.edgeMs + CF.originMs + S3.ms + DR.extraMs : REGION_MS + DR.extraMs + S3.ms;
    const latencySum = edge * CF.edgeMs + s3 * s3Ms + appStatic * (ms + appMs) + dynOk * (ms + appMs + dbMs + extMs);
    const ok = edge + s3 + appStatic + dynOk;
    return { rps, edge, s3, appRps, appServed, dynServed, dynOk, ok, latencySum, running, cpu, appFail: appRps > 0 ? 1 - appServed / appRps : 0, dbFail: dynServed > 0 ? 1 - dynOk / dynServed : 0 };
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
      cache: c.database === 'rds' && c.cache ? CACHE.costPerHour : 0,
      // (plus the read units of a report's full-table Scan while it runs)
      dynamodb: c.database === 'dynamodb' ? perHour(r.dynOk) * DDB.costPerMillion + (this.report.active && this.report.where === 'scan' ? REPORT.scanCostPerHour : 0) : 0,
      lambda: c.compute === 'lambda' ? perHour(r.appServed) * LAMBDA.costPerMillion : 0,
      apigw: c.compute === 'lambda' ? perHour(r.allowed) * APIGW.costPerMillion : 0,
      s3: c.s3 ? S3.storagePerHour + perHour(r.s3) * S3.costPerMillion : 0,
      cloudfront: c.cloudfront ? perHour(f.rps) * CF.costPerMillion : 0,
      route53: c.route53 ? R53.costPerHour + perHour(f.rps * R53.queryRatio) * R53.costPerMillion : 0,
      // hourly per gateway (Regional: per AZ it is in) + per GB processed: outside API calls,
      // SQS messages and S3 files
      nat: this._natHours() * NAT.costPerHour + gbPerHour((r.natRps + r.enqNatRps) * NAT.kbPerCall + r.s3NatRps * S3APP.kbPerCall) * NAT.costPerGB,
      // the S3 Gateway Endpoint is free; the SQS Interface Endpoint is billed per AZ-hour and per GB
      vpce: c.vpce && c.queue ? AZ_IDS.length * VPCE.ifaceCostPerHour + gbPerHour(r.enqRps * NAT.kbPerCall) * VPCE.costPerGB : 0,
      // SQS requests (send, receive, delete) + the Lambda worker invocations (batches of messages)
      sqs: c.queue ? perHour(r.enqRps * SQS.callsPerMsg) * SQS.costPerMillion + perHour(r.deqRps / SQS.batch) * LAMBDA.costPerMillion : 0,
      backup: c.backup ? BACKUP.costPerHour : 0,
      guardduty: c.guardduty ? GUARDDUTY.costPerHour : 0,
      // GPU miners someone else launched with the leaked key — your bill all the same
      leak: this.leak.active ? LEAK.costPerHour : 0,
      waf: c.waf ? WAF.costPerHour + perHour(f.rps) * WAF.costPerMillion : 0,
      // Shield Standard is free — only Shield Advanced costs money, not modelled here
      // the whole copy of the stack in the DR Region, idle or not
      dr: this._drCost(r),
      // where reports run: the lake (S3 + nightly export; Athena queries cost cents), or Redshift
      // Serverless kept busy by the zero-ETL stream of changes
      analytics: c.analytics === 'athena' ? REPORT.lakeCostPerHour : c.analytics === 'redshift' ? REPORT.redshiftCostPerHour : 0,
    };
    m.costBreakdown = b;
    m.cost = Object.values(b).reduce((x, y) => x + y, 0);
    this._budgets(dt);

    this._histClock += dt;
    if (this._histClock >= 0.5 - 1e-9 || !this.history.length) {
      this._histClock = 0;
      this.history.push({ t: this.t, success: m.success, latency: m.timeout ? null : m.latency, users: this.users, cost: m.cost });
      if (this.history.length > 120) this.history.shift();
    }
  }

  // AWS Budgets: forecast this month's bill from the current (smoothed) run-rate and alert
  // when it crosses 80% / 100% of the budget, like a forecasted-spend budget alert
  _budgets(dt) {
    const b = this.budget;
    // billing data lags by hours: the miners' spend reaches the forecast only after `billingLag`
    const unseen = this.leak.active && this.t - this.leak.start < LEAK.billingLag ? LEAK.costPerHour : 0;
    const monthly = (this.metrics.cost - unseen) * BUDGET.hoursPerMonth;
    b.forecast = this.history.length ? b.forecast + (monthly - b.forecast) * (1 - Math.exp(-dt / BUDGET.smoothing)) : monthly;
    const amount = this.config.budget;
    // judged from the first step on, so an alert never comes before the architecture is up
    if (!amount || this.t <= 0) return;
    const ratio = b.forecast / amount;
    if (ratio >= 1 && b.alerted < 2) {
      b.alerted = 2;
      this._emit('budgetOver', 'error', `AWS Budgets: chi phí dự báo ≈ ${usd(b.forecast)}/tháng VƯỢT ngân sách ${usd(amount)}! Đã gửi cảnh báo qua SNS — mở Cost Explorer xem khoản nào tăng.`);
    } else if (ratio >= BUDGET.warnAt && b.alerted < 1) {
      b.alerted = 1;
      this._emit('budgetWarn', 'warn', `AWS Budgets: chi phí dự báo ≈ ${usd(b.forecast)}/tháng, đã vượt 80% ngân sách ${usd(amount)}. Email cảnh báo đã được gửi qua SNS.`);
    } else if (ratio < BUDGET.rearmAt && b.alerted > 0) {
      b.alerted = 0;
      this._emit('budgetOk', 'success', `AWS Budgets: chi phí dự báo đã về ≈ ${usd(b.forecast)}/tháng, dưới ngân sách ${usd(amount)}.`);
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
      const lost = natlessFailures(this.config);
      if (this.config.nat === 'single' && lost.length) {
        this._emit('natLost', 'error', `NAT Gateway duy nhất (ở ${AZ_LABEL[az]}) mất kết nối → EC2 ở ${other} cũng không gọi được ${lost.join(', ')}.`, { az });
      } else if (this.config.nat === 'single') {
        this._emit('natLost', 'info', `NAT Gateway duy nhất (ở ${AZ_LABEL[az]}) mất theo AZ — nhưng EC2 không còn cần NAT nhờ SQS + VPC Endpoint.`, { az });
      } else if (this.config.nat === 'regional') {
        // the gateway lives on in the other AZ only if it is already present (and ready) there
        const rest = this.nat.find((x) => x.az !== az && x.state !== 'failed');
        const head = `Regional NAT Gateway mất phần ở ${AZ_LABEL[az]} theo AZ`;
        if (!rest) {
          this._emit('natLost', 'info', this.az[OTHER_AZ[az]] === 'ok' ? `${head}; ${other} chưa có EC2 nên NAT cũng chưa có mặt ở đó.` : `${head}.`, { az });
        } else if (rest.state === 'ok') {
          this._emit('natLost', 'info', `${head} — EC2 ở ${other} vẫn ra Internet qua phần NAT ở chính AZ đó.`, { az });
        } else if (lost.length) {
          this._emit('natLost', 'error', `${head} khi còn đang mở rộng sang ${other} → EC2 ở ${other} tạm không gọi được ${lost.join(', ')} cho tới khi mở rộng xong.`, { az });
        } else {
          this._emit('natLost', 'info', `${head} — nhưng EC2 không còn cần NAT nhờ SQS + VPC Endpoint.`, { az });
        }
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
      instId: victim.id,
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
    this._emit('dbFail', 'error', `Ổ đĩa của database primary (RDS ở ${AZ_LABEL[p.az]}) bị hỏng!`, { az: p.az, dbId: p.id });
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

  // DDoS/SQL injection run on their own 'attack' timer tag, separate from 'traffic' (spike/
  // night), so an attack can overlap a traffic scenario without cancelling its reversion.
  _ddos() {
    this._startScenario('ddos', {});
    this._clearTimers('attack');
    this._ddosRps = DDOS.floodRps;
    this._emit('ddos', 'error', `Một mạng lưới botnet dội ${Math.round(DDOS.floodRps).toLocaleString('vi-VN')} request rác/giây vào hệ thống — một cuộc tấn công DDoS.`);
    this._schedule(
      DDOS.hold,
      () => {
        this._ddosRps = 0;
        this._emit('ddosEnd', 'info', 'Đợt tấn công DDoS kết thúc.');
      },
      'attack',
    );
    return true;
  }

  _sqlInjection() {
    const c = this.config;
    if (c.database === 'none') {
      this._emit('noop', 'warn', 'Kiến trúc này chưa có database riêng — không có gì để SQL injection nhắm tới.');
      return false;
    }
    this._startScenario('sqlInjection', {});
    this._clearTimers('attack');
    this._sqliActive = true;
    this._emit('sqlInjection', 'error', 'Kẻ tấn công gửi hàng loạt request chứa mã SQL độc hại nhắm vào database.');
    this._schedule(
      SQLI.hold,
      () => {
        this._sqliActive = false;
        this._emit('sqlInjectionEnd', 'info', 'Đợt tấn công SQL injection kết thúc.');
      },
      'attack',
    );
    return true;
  }

  // the payment provider and the email API go down for a while
  _paymentDown() {
    this._startScenario('paymentDown', {});
    this._clearTimers('ext');
    this.extDown = true;
    this._emit('paymentDown', 'error', 'Đối tác thanh toán và dịch vụ email ngừng hoạt động — mọi lời gọi API ra ngoài đều lỗi.');
    if (this.config.queue) {
      this._emit('queueHold', 'info', 'Đơn hàng vẫn được nhận và nằm chờ trong SQS; Lambda worker sẽ thử lại khi đối tác hoạt động trở lại.');
    }
    this._schedule(
      EXT.downHold,
      () => {
        this.extDown = false;
        this._emit('paymentUp', 'success', 'Đối tác thanh toán hoạt động trở lại.');
      },
      'ext',
    );
    return true;
  }

  // a bad deploy runs DELETE against the production data. Replicas copy the delete at once
  // (Multi-AZ, DynamoDB's copies); only a backup can bring the data back.
  _dataDelete() {
    const c = this.config;
    if (c.compute === 'lambda' && c.database === 'none') {
      this._emit('noop', 'warn', 'Kiến trúc này chưa lưu dữ liệu ở đâu cả — hãy thêm DynamoDB hoặc RDS trước.');
      return false;
    }
    if (this.data.wiped) {
      this._emit('noop', 'warn', 'Dữ liệu vẫn đang trong tình trạng bị xoá.');
      return false;
    }
    this._startScenario('dataDelete', { hadBackup: c.backup });
    this.data = { wiped: true, restoring: false, timer: 0, lost: false, hadBackup: c.backup };
    const where = c.database === 'rds' ? 'database RDS' : c.database === 'dynamodb' ? 'bảng DynamoDB' : 'ổ đĩa EBS của EC2';
    this._emit('dataDelete', 'error', `Một bản deploy lỗi chạy nhầm lệnh xoá trên ${where}: phần lớn đơn hàng và tài khoản biến mất!`);
    if (c.database === 'rds' && c.rdsMultiAz) {
      this._emit('replicatedDelete', 'warn', 'RDS Multi-AZ đồng bộ ngay lệnh xoá sang bản standby — standby cũng mất dữ liệu y hệt primary.');
    } else if (c.database === 'dynamodb') {
      this._emit('replicatedDelete', 'warn', 'DynamoDB nhân bản lệnh xoá sang mọi AZ ngay lập tức — bản sao nào cũng mất dữ liệu.');
    }
    this._schedule(
      BACKUP.detectTime,
      () => {
        const d = this.data;
        if (!d.wiped) return;
        if (d.hadBackup) {
          d.restoring = true;
          d.timer = BACKUP.restoreTime;
          this._emit('restoreStart', 'info', 'Phát hiện sự cố: khôi phục từ AWS Backup về thời điểm ngay trước lệnh xoá (point-in-time recovery)…');
        } else {
          d.lost = true;
          this._emit('noBackup', 'error', 'Không có bản sao lưu nào: phần dữ liệu bị xoá đã mất vĩnh viễn.');
        }
      },
      'data',
    );
    return true;
  }

  // a long-term access key leaks (pushed to a public Git repo): within minutes someone launches GPU
  // crypto miners with it. The website itself keeps working — only the bill grows. GuardDuty
  // spots it and an EventBridge rule + Lambda shuts it down; without it, AWS Budgets notices only
  // once the billing data catches up, and Budgets only warns, it does not stop anything.
  _leakedKey() {
    const c = this.config;
    if (this.leak.active) {
      this._emit('noop', 'warn', 'Các máy đào coin vẫn đang chạy bằng access key bị lộ.');
      return false;
    }
    this._startScenario('leakedKey', { hadGuardDuty: c.guardduty, hadBudget: c.budget > 0 });
    this.leak = { active: true, detected: false, start: this.t };
    this._emit('leakedKey', 'error', 'Một access key dài hạn của IAM user bị đẩy lên GitHub công khai. Vài phút sau, kẻ gian dùng nó tạo hàng loạt máy GPU đào coin ở Region khác!');
    if (c.guardduty) {
      this._schedule(
        LEAK.gdDetect,
        () => {
          this.leak.detected = true;
          this._emit('gdFinding', 'error', 'GuardDuty: finding mức High — access key được dùng từ IP lạ, EC2 mới liên lạc với pool đào Bitcoin (CryptoCurrency:EC2/BitcoinTool.B!DNS). EventBridge chuyển finding cho Lambda xử lý.');
          this._schedule(
            LEAK.gdRespond,
            () => {
              this.leak.active = false;
              this._emit('leakContained', 'success', 'Lambda đã vô hiệu hoá access key bị lộ và dừng các máy đào coin. Thiệt hại chỉ tính bằng phút.');
            },
            'leak',
          );
        },
        'leak',
      );
    } else {
      this._schedule(
        LEAK.billingLag,
        () => {
          if (!this.leak.active) return;
          this._emit(
            'leakBilled',
            'warn',
            c.budget
              ? 'Dữ liệu chi phí vừa cập nhật (thực tế: sau vài giờ) — khoản chi của máy đào coin hiện ra trong AWS Budgets.'
              : 'Dữ liệu chi phí đã cập nhật, nhưng không có AWS Budgets nên chẳng ai được báo. Máy đào coin vẫn chạy…',
          );
        },
        'leak',
      );
    }
    return true;
  }

  // a release with a bug: every dynamic request it serves answers 500. All at once, the whole fleet
  // runs it until someone notices and redeploys the old version by hand. With a canary only 10% of
  // traffic reaches it, a CloudWatch alarm on the 5xx rate trips and CodeDeploy rolls it back.
  // Health checks stay green either way: the servers are up, only the new code fails.
  _badDeploy() {
    const c = this.config;
    if (this.deploy.active) {
      this._emit('noop', 'warn', 'Bản deploy trước vẫn chưa xong — đợi nó kết thúc đã.');
      return false;
    }
    this._startScenario('badDeploy', { hadCanary: c.canary });
    const ec2 = c.compute === 'ec2';
    if (c.canary) {
      this.deploy = { active: true, phase: 'canary', share: DEPLOY.canaryShare, start: this.t, canary: true, backTime: DEPLOY.shiftBack };
      this._emit(
        'deployStart',
        'warn',
        ec2
          ? 'Deploy bản v2 kiểu canary: ALB chỉ chuyển 10% traffic sang nhóm máy chạy bản mới, 90% vẫn ở bản cũ.'
          : 'CodeDeploy deploy bản v2 kiểu canary: alias Lambda chỉ chuyển 10% lời gọi sang phiên bản mới, 90% vẫn ở bản cũ.',
      );
      this._schedule(
        DEPLOY.alarmTime,
        () => {
          const d = this.deploy;
          if (!d.active || d.phase !== 'canary') return;
          d.phase = 'rollback';
          d.from = d.share;
          this._emit('deployAlarm', 'error', 'CloudWatch alarm: tỉ lệ lỗi 5xx của bản mới vượt ngưỡng → dừng deploy và tự rollback về bản cũ.');
        },
        'deploy',
      );
    } else {
      this.deploy = { active: true, phase: 'rolling', share: 0, start: this.t, canary: false, backTime: DEPLOY.manualRollback };
      this._emit('deployStart', 'warn', `Deploy bản v2 một lần (all at once) lên ${ec2 ? 'mọi EC2' : 'hàm Lambda'}…`);
      this._schedule(
        DEPLOY.manualDetect,
        () => {
          const d = this.deploy;
          if (!d.active || d.canary) return;
          d.phase = 'rollback';
          d.from = d.share;
          this._emit('deployManual', 'warn', 'Khách phàn nàn, người trực mở dashboard thấy lỗi 5xx tăng vọt — bắt đầu deploy lại bản cũ…');
        },
        'deploy',
      );
    }
    return true;
  }

  // the sales team's month-end report: revenue by province and month over two years. Where it runs
  // decides who pays: the production database (every order waits behind it), a DynamoDB Scan (slow
  // and billed per read), or a copy built for analytics — Athena on S3, Redshift via zero-ETL
  _report() {
    const c = this.config;
    if (c.database === 'none') {
      this._emit('noop', 'warn', 'Kiến trúc này chưa có database nên chưa có dữ liệu đơn hàng để làm báo cáo — hãy thêm RDS hoặc DynamoDB trước.');
      return false;
    }
    if (this.report.active) {
      this._emit('noop', 'warn', 'Báo cáo trước vẫn đang chạy.');
      return false;
    }
    const where = c.analytics !== 'none' ? c.analytics : c.database === 'rds' ? 'prod' : 'scan';
    const time = { prod: REPORT.prodTime, scan: REPORT.scanTime, athena: REPORT.athenaTime, redshift: REPORT.redshiftTime }[where];
    this._startScenario('report', { where });
    this.report = { active: true, where, start: this.t, timer: time };
    const text = {
      prod: 'Đội kinh doanh chạy báo cáo doanh thu 2 năm theo tỉnh, theo tháng ngay trên RDS production: database phải quét hàng trăm triệu dòng đơn hàng…',
      scan: 'Đội kinh doanh cần doanh thu 2 năm theo tỉnh: DynamoDB không có GROUP BY nên phải Scan cả bảng rồi cộng trong code…',
      athena: 'Đội kinh doanh chạy báo cáo doanh thu 2 năm bằng Athena, trên file Parquet xuất từ database đêm qua.',
      redshift: 'Đội kinh doanh chạy báo cáo doanh thu 2 năm trên Redshift — bản sao do zero-ETL giữ, chỉ trễ vài giây.',
    }[where];
    this._emit('reportStart', where === 'prod' || where === 'scan' ? 'warn' : 'info', text);
    if (where === 'prod' && c.rdsMultiAz) this._emit('reportStandby', 'info', 'Standby của RDS Multi-AZ không nhận truy vấn — nó chỉ chờ failover, nên không chia được tải của báo cáo.');
    return true;
  }

  // ── disaster recovery in a second Region ──────────────────────────────────

  _drEmpty() {
    return { phase: 'none', share: 0, fleet: [], seq: 0, clock: 0, overSince: null, lastScaleIn: -100, db: 'none', s3: 'none', lambda: false, elb: false, vault: false, built: false, timer: 0, promoteTimer: 0 };
  }

  // the standby copy of the stack each strategy keeps in the DR Region
  _drApply(prev, initial) {
    const c = this.config;
    if (c.dr === 'none') {
      this.dr = this._drEmpty();
      return;
    }
    const d = this.dr;
    if (this.regionDown) {
      // chosen while the primary Region is down: there is nothing left to copy the data from
      if (d.phase === 'none') {
        d.phase = 'standby';
        this._emit('drTooLate', 'error', `Region ${REGION.code} đã sập: không còn gì để sao chép sang ${DR.city}. DR phải dựng — và sao chép dữ liệu — trước khi thảm hoạ xảy ra.`);
      }
      return;
    }
    // failing back: the DR Region keeps every user until the primary Region can serve them again
    if (d.share === 1 && d.phase !== 'none') {
      d.phase = 'failback';
      return;
    }
    // every strategy but backup & restore keeps a live copy of the data (database replica or global
    // table, S3 Cross-Region Replication, replicated server disks); backup & restore only copies backups
    const live = c.dr !== 'backup';
    d.phase = 'standby';
    d.share = c.dr === 'active' ? 0.5 : 0;
    d.vault = c.dr === 'backup';
    d.built = live;
    d.lambda = c.compute === 'lambda' && live;
    d.elb = c.compute === 'ec2' && c.elb && live;
    d.db = !live ? 'none' : c.database === 'rds' ? 'replica' : 'ready';
    d.s3 = c.s3 && live ? 'ready' : 'none';
    d.timer = 0;
    d.promoteTimer = 0;
    this._drScale(initial ? 'instant' : 'config');
  }

  // EC2 the DR Region should run now: none until the stack exists; on passive standby warm keeps a
  // small copy and pilot light none; while it serves users, what Auto Scaling (or the fixed fleet) gives
  _drWant() {
    const c = this.config;
    const d = this.dr;
    if (c.compute !== 'ec2' || c.dr === 'none' || !d.built) return 0;
    if (d.share === 0) return c.dr === 'warm' ? DR.warmFleet : 0;
    if (!c.asg) return Math.max(1, c.ec2.a + c.ec2.b);
    const byLoad = Math.ceil((this.flows.dr?.appRps || 0) / (EC2.capacity * ASG.targetCpu));
    return clamp(byLoad, c.asgMin, c.asgMax);
  }

  // launch or retire DR servers toward _drWant and return how many were launched. `mode`: 'instant'
  // (built with the architecture), 'config' (a palette change: quick, extras go at once) or 'scale'
  // (Auto Scaling: full boot time, scale-in after a delay)
  _drScale(mode = 'scale') {
    const d = this.dr;
    const want = Math.min(this._drWant(), ASG.limit);
    const active = d.fleet.filter((i) => i.state !== 'terminating');
    if (active.length < want) {
      const boot = mode === 'instant' ? 0 : mode === 'config' ? EC2.provisionTime : EC2.bootTime;
      const used = new Set(d.fleet.map((i) => i.slot));
      let slot = 0;
      for (let k = active.length; k < want; k++) {
        while (used.has(slot)) slot++;
        used.add(slot);
        d.fleet.push({ id: `i-0${this._hexId()}`, n: ++d.seq, slot, state: boot > 0 ? 'pending' : 'running', timer: boot });
      }
      d.overSince = null;
      return want - active.length;
    }
    if (active.length > want) {
      const newest = active.sort((x, y) => y.n - x.n);
      if (mode !== 'scale') {
        newest.slice(0, active.length - want).forEach((i) => Object.assign(i, { state: 'terminating', timer: EC2.terminateTime }));
      } else {
        if (d.overSince == null) d.overSince = this.t;
        if (this.t - d.overSince >= ASG.scaleInDelay && this.t - d.lastScaleIn >= ASG.scaleInEvery) {
          Object.assign(newest[0], { state: 'terminating', timer: EC2.terminateTime });
          d.lastScaleIn = this.t;
        }
      }
      return 0;
    }
    d.overSince = null;
    return 0;
  }

  _drReady() {
    const d = this.dr;
    const app = this.config.compute === 'ec2' ? d.fleet.some((i) => i.state === 'running') : d.lambda;
    return app && d.db === 'ready';
  }

  _drTick(dt) {
    const c = this.config;
    const d = this.dr;
    if (c.dr === 'none') return;
    for (const i of d.fleet) {
      if (i.state !== 'pending' && i.state !== 'terminating') continue;
      i.timer -= dt;
      if (i.timer > 0) continue;
      if (i.state === 'pending') {
        i.state = 'running';
        i.timer = 0;
      } else i.removed = true;
    }
    if (d.fleet.some((i) => i.removed)) d.fleet = d.fleet.filter((i) => !i.removed);
    if (d.db === 'promoting') {
      d.promoteTimer -= dt;
      if (d.promoteTimer <= 0) {
        d.db = 'ready';
        d.promoteTimer = 0;
        this._emit('drPromoted', 'success', `Database ở ${DR.city} đã thành primary mới: nhận cả đọc lẫn ghi.`);
      }
    }
    if (d.phase === 'rebuilding') {
      d.timer -= dt;
      if (d.timer <= 0) this._drRebuilt();
    }
    d.clock += dt;
    if (d.clock >= 1 - 1e-9) {
      d.clock = 0;
      const n = this._drScale('scale');
      if (n > 0 && this.regionDown) this._emit('drScaleOut', 'info', `Auto Scaling ở ${DR.city} thêm ${n} EC2 vì CPU vượt mục tiêu — người dùng dồn cả sang đây.`);
    }
    if (d.phase === 'recovering' && this._drReady()) {
      d.phase = 'live';
      if (this.scenario) this.scenario.liveAt = this.t;
      this._emit('drLive', 'success', `${DR.city} đã gánh toàn bộ người dùng: website chạy lại từ Region dự phòng.`);
    }
    if (d.phase === 'failback' && this._primaryReady()) {
      d.share = 0;
      this._drApply(this.config, false);
      this._emit('drFailbackDone', 'success', `${REGION.city} đã sẵn sàng: Route 53 chuyển người dùng về, ${DR.city} trở lại vai trò dự phòng.`);
    }
  }

  // the primary Region can take its users back: servers in service and the database up
  _primaryReady() {
    const c = this.config;
    if (this.regionDown) return false;
    const app = c.compute !== 'ec2' || (c.elb ? this.instances.some((i) => i.registered && i.state === 'running') : this._primaryInstance()?.state === 'running');
    const db = c.database !== 'rds' || this.db.some((n) => n.role === 'primary' && n.state === 'ok');
    return app && db;
  }

  // the DR Region's running cost ($/hour): the copies, replica, servers and load balancer kept there
  _drCost(r) {
    const c = this.config;
    const d = this.dr;
    if (c.dr === 'none' || !r) return 0;
    const dr = this.flows.dr;
    const fleet = d.fleet.filter((i) => i.state !== 'terminating').length;
    let h = d.vault ? DR.copyCostPerHour : 0;
    h += fleet * EC2.costPerHour;
    if (d.elb) h += ELB.costPerHour + (dr ? dr.appRps : 0) * ELB.lcuPerRps * ELB.lcuCost;
    // a private fleet needs its own NAT Gateways there as well
    if (fleet > 0 && c.appSubnet === 'private') h += (c.nat === 'single' ? 1 : c.nat === 'none' ? 0 : 2) * NAT.costPerHour;
    if (c.database === 'rds' && d.db !== 'none') h += RDS.costPerHour;
    // a global table bills every write once more in each Region it is copied to
    if (c.database === 'dynamodb' && d.db !== 'none') h += perHour(r.dynOk + (dr ? dr.dynOk : 0)) * DDB.costPerMillion;
    if (c.s3 && d.s3 === 'ready') h += S3.storagePerHour + perHour(dr ? dr.s3 : 0) * S3.costPerMillion;
    if (c.compute === 'lambda' && d.lambda && dr) h += perHour(dr.appServed) * (LAMBDA.costPerMillion + APIGW.costPerMillion);
    return h;
  }

  // the whole primary Region drops off the network — a power or network event bigger than any AZ.
  // Every regional service there stops answering; only global ones (Route 53, CloudFront's edge
  // cache, IAM) keep working. What happens next is up to the DR strategy.
  _regionDown() {
    const c = this.config;
    if (this.regionDown) {
      this._emit('noop', 'warn', `Region ${REGION.code} vẫn đang sập.`);
      return false;
    }
    this._startScenario('regionDown', { strategy: c.dr, drCost: this._drCost(this._last) });
    this.regionDown = true;
    for (const az of AZ_IDS) {
      this.az[az] = 'destroyed';
      this.azSince[az] = this.t;
    }
    this._emit('regionDown', 'error', `Sự cố diện rộng: cả Region ${REGION.code} (${REGION.city}) mất kết nối — mọi AZ, mọi dịch vụ trong Region đều không phản hồi!`);
    for (const i of this.instances) this._failInstance(i, 'region');
    for (const n of this.db) Object.assign(n, { state: 'failed', cause: 'region', timer: 0, autoRecover: false });
    for (const n of this.nat) n.state = 'failed';
    const lost = c.compute === 'ec2' ? 'EC2, Load Balancer' : 'API Gateway, Lambda';
    const store = c.database === 'rds' ? ', RDS' : c.database === 'dynamodb' ? ', DynamoDB' : '';
    this._emit('regionLost', 'error', `${lost}${store}${c.s3 ? ', S3' : ''}${c.queue ? ', SQS' : ''} đều nằm trong Region này — Multi-AZ không đỡ được vì mọi AZ cùng sập. Chỉ dịch vụ toàn cầu (Route 53${c.cloudfront ? ', cache của CloudFront' : ''}) còn chạy.`);
    if (c.dr === 'none') {
      this._emit('drNone', 'error', `Không có Region dự phòng: chỉ còn cách chờ AWS khôi phục ${REGION.city} — có thể mất nhiều giờ.`);
      return true;
    }
    this.dr.phase = 'detecting';
    this._emit(
      'drDetecting',
      'info',
      c.dr === 'active'
        ? `${DR.city} vẫn phục vụ phần người dùng của mình. Route 53 health check bắt đầu báo lỗi cho ${REGION.city}…`
        : `Route 53 health check bắt đầu báo lỗi cho endpoint ở ${REGION.city}…`,
    );
    this._schedule(DR.detect, () => this._drDetected(), 'dr');
    return true;
  }

  _drDetected() {
    const c = this.config;
    const d = this.dr;
    if (!this.regionDown || c.dr === 'none') return;
    if (c.dr === 'warm' || c.dr === 'active') {
      this._emit(
        'drFailover',
        'warn',
        c.dr === 'active'
          ? `Route 53: ${REGION.city} trượt health check 3 lần liên tiếp → không trả địa chỉ ở đó nữa, mọi người dùng vào ${DR.city}.`
          : `Route 53 failover: ${REGION.city} trượt health check 3 lần liên tiếp → chuyển toàn bộ traffic sang bản warm standby ở ${DR.city}.`,
      );
      this._drActivate();
      return;
    }
    d.phase = 'deciding';
    this._emit('drDecide', 'warn', `Health check báo ${REGION.city} sập, nhưng ${c.dr === 'pilot' ? 'pilot light' : 'backup & restore'} không tự chuyển: người trực xác nhận thảm hoạ rồi chạy runbook (thực tế 15–30 phút)…`);
    this._schedule(DR.decide, () => this._drActivate(), 'dr');
  }

  // fail over: Route 53 (or the runbook, flipping an ARC routing control) sends every user to the DR Region
  _drActivate() {
    const c = this.config;
    const d = this.dr;
    if (!this.regionDown || c.dr === 'none') return;
    d.share = 1;
    if (c.dr === 'backup') {
      d.phase = 'rebuilding';
      d.timer = DR.rebuild;
      this._emit('drRebuild', 'warn', `Dựng lại toàn bộ hạ tầng ở ${DR.city} từ CloudFormation và khôi phục dữ liệu từ bản sao lưu gần nhất (thực tế vài giờ)…`);
      return;
    }
    d.phase = 'recovering';
    if (c.dr === 'pilot') {
      this._emit(
        'drSwitchOn',
        'info',
        c.compute === 'ec2'
          ? `Runbook: bật máy chủ ở ${DR.city} từ AMI có sẵn (Auto Scaling từ 0 máy lên), chuyển DNS sang ${DR.city}.`
          : `Runbook: API Gateway và Lambda ở ${DR.city} đã triển khai sẵn — chỉ cần chuyển DNS sang.`,
      );
    }
    if (d.db === 'replica') {
      d.db = 'promoting';
      d.promoteTimer = DR.promote;
      this._emit('drPromote', 'info', `Promote bản sao database ở ${DR.city} thành primary để nhận ghi (Aurora Global Database: dưới 1 phút)…`);
    }
    const n = this._drScale('scale');
    if (n > 0 && c.dr !== 'pilot') this._emit('drScaleOut', 'info', `Auto Scaling ở ${DR.city} thêm ${n} EC2 để gánh toàn bộ người dùng.`);
  }

  // backup & restore: the stack exists again in the DR Region, its servers now booting
  _drRebuilt() {
    const c = this.config;
    const d = this.dr;
    Object.assign(d, { built: true, phase: 'recovering', timer: 0, lambda: c.compute === 'lambda', elb: c.compute === 'ec2' && c.elb, db: 'ready', s3: c.s3 ? 'ready' : 'none' });
    this._drScale('scale');
    this._emit('drRebuilt', 'info', `Hạ tầng ở ${DR.city} đã dựng xong, dữ liệu khôi phục tới bản sao lưu gần nhất${c.compute === 'ec2' ? ' — máy chủ đang khởi động' : ''}.`);
  }

  // a report running somewhere: done once its time is up
  _reportTick(dt) {
    const r = this.report;
    if (!r.active) return;
    // the database it was reading is gone: nothing left to report on
    if (this.config.database === 'none') {
      this.report = { active: false, where: null, start: -100, timer: 0 };
      this._emit('reportStopped', 'warn', 'Không còn database — báo cáo bị huỷ giữa chừng.');
      return;
    }
    r.timer -= dt;
    if (r.timer > 0) return;
    r.active = false;
    r.timer = 0;
    const done = {
      prod: 'Báo cáo xong sau khoảng 25 phút (mô phỏng 16 giây): database được thả ra, website nhanh trở lại.',
      scan: 'Scan xong cả bảng DynamoDB và cộng số liệu trong code: có báo cáo, nhưng mất nửa giờ và tốn đơn vị đọc cho cả bảng.',
      athena: 'Athena trả báo cáo sau vài giây: chỉ quét cột cần trong file Parquet của đêm qua, database không hề hay biết.',
      redshift: 'Redshift trả báo cáo sau vài giây: dữ liệu chỉ trễ vài giây so với database, website không bị ảnh hưởng.',
    }[r.where];
    this._emit('reportDone', 'success', done);
  }

  _repair() {
    if (this.scenario) this._finishScenario(true);
    this.lesson = null;
    const c = this.config;
    // a Region coming back brings its servers, databases and NAT back as they were: nothing was
    // destroyed, only cut off
    if (this.regionDown) {
      this.regionDown = false;
      for (const az of AZ_IDS) {
        this.az[az] = 'ok';
        this.azSince[az] = this.t;
      }
      this._emit('regionRestored', 'success', `Region ${REGION.code} (${REGION.city}) hoạt động trở lại.`);
      if (c.dr !== 'none' && this.dr.share === 1) {
        this._emit('drFailback', 'info', `Failback: chép dữ liệu mới từ ${DR.city} ngược về ${REGION.city} rồi mới chuyển người dùng về — thực tế làm có kế hoạch, vào giờ vắng khách.`);
      }
      for (const n of this.db) if (n.cause === 'region') Object.assign(n, { state: 'ok', cause: null });
      for (const n of this.nat) n.state = 'ok';
    }
    this._clearTimers('dr');
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
      if (c.asg && i.cause !== 'region') this._terminate(i);
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
    // a zonal NAT Gateway comes back with its AZ; a Regional one drops the presence it lost
    // there and has to expand into the AZ again once servers run in it
    if (c.nat === 'regional') this.nat = this.nat.filter((n) => n.state !== 'failed');
    else for (const n of this.nat) n.state = 'ok';
    this._clearTimers('traffic');
    this._clearTimers('attack');
    this._clearTimers('ext');
    this._clearTimers('data');
    this._clearTimers('leak');
    this._clearTimers('deploy');
    if (this.deploy.active) this._emit('deployStopped', 'warn', 'Quản trị viên dừng bản deploy và đưa mọi máy về bản cũ.');
    this.deploy = { active: false, phase: 'idle', share: 0, start: -100, canary: false };
    if (this.leak.active) this._emit('leakStopped', 'warn', 'Quản trị viên vô hiệu hoá access key bị lộ và xoá các máy đào coin — sau khi chúng đã chạy một lúc.');
    this.leak = { active: false, detected: false, start: -100 };
    if (this.report.active) this._emit('reportStopped', 'warn', 'Quản trị viên huỷ báo cáo đang chạy.');
    this.report = { active: false, where: null, start: -100, timer: 0 };
    this.night = false;
    this.targetUsers = USERS.normal;
    this._ddosRps = 0;
    this._sqliActive = false;
    this.extDown = false;
    if (this.data.wiped) {
      this._emit(
        this.data.hadBackup ? 'restoreDone' : 'dataGone',
        this.data.hadBackup ? 'success' : 'warn',
        this.data.hadBackup
          ? 'Khôi phục xong từ AWS Backup: dữ liệu trở về thời điểm ngay trước lệnh xoá.'
          : 'Website chạy lại với dữ liệu trống — phần đã xoá không lấy lại được vì không có bản sao lưu.',
      );
    }
    this.data = { wiped: false, restoring: false, timer: 0, lost: false, hadBackup: false };
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
      budgetAlertedStart: this.budget.alerted,
      dbMaxLoad: 0,
      edgeShareMax: 0,
      cacheHitMax: 0,
      ddosRawMax: 0,
      ddosThroughMax: 0,
      sqliFailMax: 0,
      queueMax: this.queue.depth,
      natS3CostMax: 0,
      primaryAz: primary ? primary.az : null,
      natAz: this.nat[0] ? this.nat[0].az : null,
      natReady: this.nat.filter((n) => n.state === 'ok').map((n) => n.az), // AZs with a NAT ready to use
      natHoursMin: this._natHours(),
      natWaited: false, // servers had no way out while a Regional NAT Gateway was still expanding
      dbPrimaryAz: dbPrimary ? dbPrimary.az : null,
      drPeak: 0, // most servers the DR Region ran
      liveAt: null, // when the DR Region took every user
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
    sc.cacheHitMax = Math.max(sc.cacheHitMax, f.cacheHit);
    sc.ddosRawMax = Math.max(sc.ddosRawMax, f.ddosRps);
    sc.ddosThroughMax = Math.max(sc.ddosThroughMax, f.ddosRps - f.ddosBlocked);
    sc.sqliFailMax = Math.max(sc.sqliFailMax, f.sqliFail);
    sc.queueMax = Math.max(sc.queueMax, this.queue.depth);
    sc.natS3CostMax = Math.max(sc.natS3CostMax, gbPerHour(f.s3NatRps * S3APP.kbPerCall) * NAT.costPerGB);
    sc.natHoursMin = Math.min(sc.natHoursMin, this._natHours());
    if ((f.outFailRps > 0 || f.awsFailRps > 0) && f.targets.some((t) => t.out?.expanding)) sc.natWaited = true;
    sc.drPeak = Math.max(sc.drPeak, this.dr.fleet.filter((i) => i.state !== 'terminating').length);
    // overloaded even though Auto Scaling already runs every instance it is allowed
    const c = this.config;
    if (c.compute === 'ec2' && c.asg && f.avgCpu > 1) {
      const running = this.instances.filter((i) => i.state === 'running').length;
      if (running >= c.asgMax) sc.overAtMax = true;
    }

    const elapsed = this.t - sc.start;
    const quick = sc.action === 'quake' || sc.action === 'serverFail' || sc.action === 'dbFail' || sc.action === 'regionDown' || sc.action === 'report';
    const settled = quick && elapsed >= 8 && sc.okStreak >= 5 && !this._busy();
    if (this.t >= sc.end - 1e-9 || settled) this._finishScenario(false);
  }

  // nothing booting, failing over or broken: a good moment to start the next event
  settled() {
    return (
      !this._busy() &&
      !this.regionDown &&
      AZ_IDS.every((az) => this.az[az] === 'ok') &&
      !this.instances.some((i) => i.state === 'failed') &&
      !this.db.some((n) => n.state === 'failed') &&
      !this.nat.some((n) => n.state === 'failed') &&
      !this.extDown &&
      !this.data.wiped &&
      !this.leak.active &&
      !this.deploy.active &&
      !this.report.active &&
      (this.metrics.status === 'ok' || this.metrics.status === 'slow')
    );
  }

  _busy() {
    return (
      this.instances.some((i) => i.state === 'pending' || i.state === 'terminating') ||
      this.db.some((n) => n.state === 'promoting' || n.state === 'creating' || n.autoRecover) ||
      this.nat.some((n) => n.state === 'expanding') ||
      this.data.restoring ||
      this.report.active ||
      this.dr.fleet.some((i) => i.state === 'pending' || i.state === 'terminating') ||
      this.dr.db === 'promoting' ||
      ['detecting', 'deciding', 'rebuilding', 'recovering', 'failback'].includes(this.dr.phase)
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
