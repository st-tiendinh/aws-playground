// Scenario tests for the sandbox simulation: each architecture should react to the actions
// the way the lesson cards claim. usage: node test/sim.test.mjs [-v]
import assert from 'node:assert/strict';
import { normalizeConfig, Simulation } from '../src/sim/simulation.js';
import { NAT } from '../src/sim/constants.js';
import { presetById } from '../src/sim/presets.js';
import { wellArchitected } from '../src/sim/lessons.js';

const verbose = process.argv.includes('-v');
let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}\n     ${e.message}`);
  }
}

const sim = (preset, extra = {}) => new Simulation({ ...presetById(preset).config, ...extra });

// run until the scenario produced its lesson (or a time limit)
function runScenario(s, action, opts) {
  assert.ok(s.trigger(action, opts) !== false, `trigger ${action} refused`);
  for (let k = 0; k < 600 && !s.lesson; k++) s.run(0.1);
  assert.ok(s.lesson, `${action}: no lesson produced`);
  if (verbose) {
    const l = s.lesson;
    console.log(`     [${action}] ${l.grade} — ${l.headline}`);
    for (const st of l.stats) console.log(`       · ${st.label}: ${st.value}`);
    for (const p of l.points) console.log(`       ${p.kind === 'good' ? '+' : p.kind === 'bad' ? '-' : 'i'} ${p.text}`);
    for (const sg of l.suggestions) console.log(`       → ${sg.label} ${JSON.stringify(sg.patch)}`);
  }
  return s.lesson;
}

test('single server runs fine at normal traffic', () => {
  const s = sim('single');
  s.run(3);
  assert.equal(s.metrics.status, 'ok');
  assert.equal(s.instances.length, 1);
  assert.ok(s.instances[0].cpu > 0.1 && s.instances[0].cpu < 0.5, `cpu ${s.instances[0].cpu}`);
});

test('single server: hardware failure takes the site down', () => {
  const s = sim('single');
  s.run(2);
  const l = runScenario(s, 'serverFail');
  assert.equal(l.grade, 'fail');
  assert.ok(l.suggestions.some((x) => x.patch.elb), 'should suggest a load balancer');
});

test('single server: earthquake in AZ A = outage + data at risk', () => {
  const s = sim('single');
  s.run(2);
  const l = runScenario(s, 'quake', { az: 'a' });
  assert.equal(l.grade, 'fail');
  assert.equal(s.metrics.status, 'down');
  assert.ok(s.events.some((e) => e.type === 'dataLoss'));
});

test('single server: quake in the other AZ does nothing', () => {
  const s = sim('single');
  s.run(2);
  const l = runScenario(s, 'quake', { az: 'b' });
  assert.equal(l.grade, 'pass');
});

test('HA: losing AZ A — ELB shifts traffic, ASG rebuilds in AZ B, RDS fails over', () => {
  const s = sim('ha');
  s.run(3);
  assert.equal(s.metrics.status, 'ok');
  const l = runScenario(s, 'quake', { az: 'a' });
  assert.notEqual(l.grade, 'fail');
  assert.ok(s.events.some((e) => e.type === 'dbFailoverDone'), 'RDS should fail over');
  s.run(10);
  const active = s.instances.filter((i) => i.state === 'running');
  assert.ok(active.length >= 2 && active.every((i) => i.az === 'b'), 'fleet rebuilt in AZ B');
  assert.equal(s.metrics.status, 'ok');
});

test('HA: a broken server is replaced automatically', () => {
  const s = sim('ha');
  s.run(3);
  const before = s.instances.map((i) => i.id);
  const l = runScenario(s, 'serverFail');
  assert.equal(l.grade, 'pass');
  s.run(8);
  const now = s.instances.filter((i) => i.state === 'running');
  assert.equal(now.length, 2);
  assert.ok(now.some((i) => !before.includes(i.id)), 'a replacement instance exists');
});

test('ELB + 2 fixed servers survive one failure but do not heal', () => {
  const s = new Simulation({ elb: true, ec2: { a: 1, b: 1 } });
  s.run(3);
  const l = runScenario(s, 'serverFail');
  assert.equal(l.grade, 'pass');
  assert.equal(s.instances.filter((i) => i.state === 'failed').length, 1);
});

test('single server melts under 1M users', () => {
  const s = sim('single');
  s.run(2);
  const l = runScenario(s, 'spike');
  assert.equal(l.grade, 'fail');
});

test('HA scales out for 1M users, then back in', () => {
  const s = sim('ha');
  s.run(3);
  const l = runScenario(s, 'spike');
  assert.notEqual(l.grade, 'fail');
  const sc = l.stats;
  assert.ok(sc.length === 4);
  s.run(25);
  const running = s.instances.filter((i) => i.state === 'running' || i.state === 'pending').length;
  assert.ok(running <= 3, `should scale back in, still ${running}`);
});

test('HA with pre-scaled minimum handles the spike cleanly', () => {
  const s = sim('ha', { asgMin: 8 });
  s.run(8);
  const l = runScenario(s, 'spike');
  assert.equal(l.grade, 'pass');
});

test('ASG without ELB: new servers sit idle', () => {
  const s = new Simulation({ asg: true, s3: true });
  s.run(3);
  const l = runScenario(s, 'spike');
  assert.equal(l.grade, 'fail');
  assert.ok(l.suggestions.some((x) => x.patch.elb));
});

test('serverless shrugs off quake, server failure and the spike', () => {
  for (const action of ['quake', 'serverFail', 'spike']) {
    const s = sim('serverless');
    s.run(3);
    const l = runScenario(s, action, { az: 'a' });
    assert.equal(l.grade, 'pass', `${action}: ${l.grade}`);
  }
});

test('serverless without S3 hits the Lambda concurrency limit', () => {
  const s = new Simulation({ compute: 'lambda', database: 'dynamodb' });
  s.run(3);
  const l = runScenario(s, 'spike');
  assert.ok(s.events.some((e) => e.type === 'lambdaThrottle'));
  assert.notEqual(l.grade, 'pass');
});

test('RDS single-AZ disk failure = long outage; Multi-AZ = short failover', () => {
  const a = sim('classic');
  a.run(2);
  const la = runScenario(a, 'dbFail');
  assert.equal(la.grade, 'fail');
  assert.ok(la.suggestions.some((x) => x.patch.rdsMultiAz));

  const b = sim('ha');
  b.run(3);
  const lb = runScenario(b, 'dbFail');
  assert.equal(lb.grade, 'partial');
  assert.ok(b.events.some((e) => e.type === 'dbFailoverDone'));
});

test('ElastiCache absorbs reads so RDS survives a spike it would otherwise fail', () => {
  const cfg = { compute: 'ec2', elb: true, asg: true, asgMin: 10, asgMax: 10, s3: true, database: 'rds' };
  const a = new Simulation({ ...cfg, cache: false });
  a.run(3);
  const la = runScenario(a, 'spike');
  assert.ok(la.suggestions.some((x) => x.patch.cache), 'should suggest enabling ElastiCache when RDS is the bottleneck');

  const b = new Simulation({ ...cfg, cache: true });
  b.run(3);
  const lb = runScenario(b, 'spike');
  assert.ok(lb.points.some((p) => p.kind === 'good' && /ElastiCache/.test(p.text)), 'should credit ElastiCache for the lower RDS load');
  const rhoA = Math.max(...a.db.map((n) => n.load));
  const rhoB = Math.max(...b.db.map((n) => n.load));
  assert.ok(rhoB < rhoA, `cache should lower RDS load (no cache ${rhoA.toFixed(2)}, with cache ${rhoB.toFixed(2)})`);
});

test('AWS Shield absorbs a DDoS flood that would otherwise overload the fleet', () => {
  const cfg = { compute: 'ec2', elb: true, asg: true, asgMin: 2, asgMax: 4 };
  const a = new Simulation({ ...cfg, shield: false, waf: false });
  a.run(2);
  const la = runScenario(a, 'ddos');
  assert.ok(la.suggestions.some((x) => x.patch.shield), 'should suggest enabling Shield when unprotected');

  const b = new Simulation({ ...cfg, shield: true });
  b.run(2);
  const lb = runScenario(b, 'ddos');
  assert.ok(lb.points.some((p) => p.kind === 'good' && /Shield/.test(p.text)), 'should credit Shield for absorbing the flood');
  assert.notEqual(lb.grade, 'fail');
});

test('AWS WAF blocks SQL injection; Shield alone does not help', () => {
  const a = sim('classic'); // RDS, no WAF
  a.run(2);
  const la = runScenario(a, 'sqlInjection');
  assert.ok(la.suggestions.some((x) => x.patch.waf), 'should suggest enabling WAF');
  assert.ok(la.points.some((p) => /Shield không giúp/.test(p.text)), 'should clarify Shield does not stop SQL injection');

  const b = new Simulation({ ...presetById('classic').config, waf: true });
  b.run(2);
  const lb = runScenario(b, 'sqlInjection');
  assert.equal(lb.grade, 'pass');
  assert.ok(lb.points.some((p) => p.kind === 'good' && /WAF/.test(p.text)));
});

test('SQL injection is a no-op without a database', () => {
  const s = new Simulation({ compute: 'ec2', ec2: { a: 1, b: 0 }, database: 'none' });
  assert.equal(s.trigger('sqlInjection'), false);
});

test('night: fixed fleet wastes money, serverless cost drops', () => {
  const a = new Simulation({ elb: true, ec2: { a: 2, b: 2 } });
  a.run(2);
  const la = runScenario(a, 'night');
  assert.equal(la.grade, 'partial');
  assert.equal(la.badge, 'Lãng phí', 'the site never went down: the badge names the waste, not an outage');
  const b = sim('serverless');
  b.run(2);
  const lb = runScenario(b, 'night');
  assert.equal(lb.grade, 'pass');
});

test('repair restores AZ, servers and database', () => {
  const s = sim('classic');
  s.run(2);
  s.trigger('quake', { az: 'a' });
  s.run(5);
  assert.equal(s.metrics.status, 'down');
  s.trigger('repair');
  s.run(10);
  assert.equal(s.az.a, 'ok');
  assert.equal(s.metrics.status, 'ok');
  assert.ok(s.db.every((n) => n.state === 'ok'));
});

test('switching Auto Scaling off keeps the current fleet', () => {
  const s = sim('ha');
  s.run(3);
  s.setConfig({ asg: false });
  s.run(3);
  assert.deepEqual(s.config.ec2, { a: 1, b: 1 });
  assert.equal(s.instances.filter((i) => i.state === 'running').length, 2);
});

test('switching to Lambda retires EC2 and keeps serving', () => {
  const s = sim('ha');
  s.run(3);
  s.setConfig({ compute: 'lambda', database: 'dynamodb' });
  s.run(4);
  assert.equal(s.instances.length, 0);
  assert.equal(s.metrics.status, 'ok');
});

test('private fleet without NAT cannot call outside APIs', () => {
  const s = sim('ha', { nat: 'none' });
  s.run(3);
  assert.equal(s.metrics.status, 'degraded');
  // of the 40% dynamic requests, the outside API calls (15%) and the S3 calls (10%) need a way out
  assert.ok(Math.abs(s.metrics.successRaw - (1 - 0.4 * (0.15 + 0.1))) < 0.01, `success ${s.metrics.successRaw}`);
  const l = runScenario(s, 'serverFail');
  assert.ok(l.suggestions.some((x) => x.patch.nat === 'perAz'), 'should suggest NAT');
});

test('NAT per AZ: losing AZ A keeps the way out for AZ B', () => {
  const s = sim('ha');
  s.run(3);
  assert.equal(s.nat.length, 2);
  const l = runScenario(s, 'quake', { az: 'a' });
  assert.notEqual(l.grade, 'fail');
  s.run(10);
  assert.equal(s.flows.outFailRps, 0);
  assert.equal(s.metrics.status, 'ok');
});

test('single NAT in the lost AZ cuts outside calls for the survivors', () => {
  const s = sim('ha', { nat: 'single' });
  s.run(3);
  assert.deepEqual(s.nat.map((n) => n.az), ['a']);
  const l = runScenario(s, 'quake', { az: 'a' });
  assert.equal(l.grade, 'partial');
  assert.ok(l.suggestions.some((x) => x.patch.nat === 'perAz'));
  assert.ok(s.flows.outFailRps > 0);
  s.trigger('repair');
  s.run(10);
  assert.equal(s.flows.outFailRps, 0);
  assert.equal(s.metrics.status, 'ok');
});

test('turning the load balancer off brings a private fleet back to a public subnet', () => {
  const s = sim('ha');
  s.run(2);
  s.setConfig({ elb: false });
  assert.equal(s.config.appSubnet, 'public');
  assert.equal(s.config.nat, 'none');
  assert.equal(s.nat.length, 0);
});

test('NAT gateways show up in the bill', () => {
  const a = sim('ha');
  const b = sim('ha', { appSubnet: 'public', nat: 'none' });
  a.run(2);
  b.run(2);
  assert.ok(a.metrics.costBreakdown.nat > 0.1, `nat cost ${a.metrics.costBreakdown.nat}`);
  assert.equal(b.metrics.costBreakdown.nat, 0);
});

test('Regional NAT is kept only for a private fleet', () => {
  const ha = presetById('ha').config;
  assert.equal(normalizeConfig({ ...ha, nat: 'regional' }).nat, 'regional');
  assert.equal(normalizeConfig({ ...ha, appSubnet: 'public', nat: 'regional' }).nat, 'none');
  const s = sim('ha', { nat: 'regional' });
  s.run(1);
  assert.ok(s.nat.length === 2 && s.nat.every((n) => n.regional && n.state === 'ok'), 'ready at once in both AZs');
  s.setConfig({ elb: false });
  assert.equal(s.config.nat, 'none');
  assert.equal(s.nat.length, 0);
});

test('Regional NAT: losing AZ A keeps the way out for AZ B, unlike a single NAT', () => {
  const reg = sim('ha', { nat: 'regional' });
  const one = sim('ha', { nat: 'single' });
  for (const s of [reg, one]) {
    s.run(3);
    assert.ok(s.trigger('quake', { az: 'a' }));
    s.run(12);
  }
  assert.equal(reg.flows.outFailRps, 0, 'AZ B goes out through its own part of the Regional NAT');
  assert.equal(reg.metrics.status, 'ok');
  assert.ok(one.flows.outFailRps > 0, 'the single NAT sat in AZ A');
  for (let k = 0; k < 600 && !reg.lesson; k++) reg.run(0.1);
  const l = reg.lesson;
  assert.notEqual(l.grade, 'fail');
  assert.ok(l.points.some((p) => p.kind === 'good' && /Regional NAT/.test(p.text)), 'lesson credits the Regional NAT');
  assert.ok(!l.suggestions.some((x) => x.patch.nat), 'no NAT suggestion when Regional NAT is on');
  // once AZ A is back and gets servers again, the gateway has to expand into it again
  reg.trigger('repair');
  const natA = () => reg.nat.find((n) => n.az === 'a');
  for (let k = 0; k < 100 && !natA(); k++) reg.run(0.1);
  assert.equal(natA()?.state, 'expanding');
  reg.run(NAT.regionalExpandTime + 0.2);
  assert.equal(natA().state, 'ok');
});

test('Regional NAT bills each AZ it is in: like one NAT per AZ, less when servers sit in one AZ', () => {
  const natCost = (cfg) => {
    const s = new Simulation(cfg);
    s.run(2);
    return s.metrics.costBreakdown.nat;
  };
  const ha = presetById('ha').config;
  const perAz = natCost({ ...ha, nat: 'perAz' });
  const regional = natCost({ ...ha, nat: 'regional' });
  assert.ok(Math.abs(perAz - regional) < 1e-9, `perAz ${perAz} vs regional ${regional}`);
  const oneAz = { elb: true, appSubnet: 'private', ec2: { a: 2, b: 0 } };
  const a = natCost({ ...oneAz, nat: 'perAz' });
  const b = natCost({ ...oneAz, nat: 'regional' });
  assert.ok(Math.abs(a - b - NAT.costPerHour) < 1e-9, `perAz ${a} vs regional ${b}: one NAT-hour less`);
});

test('Regional NAT expands into a new AZ; meanwhile that AZ goes out through the other one', () => {
  const s = new Simulation({ elb: true, appSubnet: 'private', nat: 'regional', ec2: { a: 1, b: 0 } });
  s.run(2);
  assert.deepEqual(s.nat.map((n) => `${n.az}:${n.state}`), ['a:ok']);
  s.setConfig({ ec2: { a: 1, b: 1 } });
  s.run(0.1);
  const natB = () => s.nat.find((n) => n.az === 'b');
  assert.equal(natB()?.state, 'expanding');
  assert.ok(s.events.some((e) => e.type === 'natExpand' && e.az === 'b'));
  s.run(3.9); // the new server boots and joins the load balancer
  const ib = s.instances.find((i) => i.az === 'b');
  const out = () => s.flows.targets.find((t) => t.id === ib.id)?.out;
  assert.equal(natB().state, 'expanding');
  assert.deepEqual(out(), { ok: true, via: 'nat-a', cross: true }, 'AZ B goes out through AZ A meanwhile');
  assert.equal(s.flows.outFailRps, 0);
  s.run(NAT.regionalExpandTime - 3.9); // regionalExpandTime after it started expanding
  assert.equal(natB().state, 'ok');
  assert.equal(out().via, 'nat-b', 'AZ B now uses its own part of the gateway');
  assert.ok(s.events.some((e) => e.type === 'natExpanded' && e.az === 'b'));
  // no servers left in AZ B: the gateway leaves it again
  s.setConfig({ ec2: { a: 1, b: 0 } });
  s.run(0.1);
  assert.equal(natB(), undefined);
  assert.ok(s.events.some((e) => e.type === 'natContract' && e.az === 'b'));
});

test('Regional NAT not yet in the surviving AZ: its new servers wait for the gateway to expand', () => {
  const s = sim('ha', { nat: 'regional', asgMin: 1 });
  s.run(3);
  assert.deepEqual(s.nat.map((n) => n.az), ['a'], 'one server, in AZ A: the gateway is only there');
  const l = runScenario(s, 'quake', { az: 'a' });
  assert.ok(s.events.some((e) => e.type === 'natExpand' && e.az === 'b'));
  assert.ok(l.points.some((p) => p.kind === 'bad' && /Regional NAT/.test(p.text)), 'lesson explains the expansion wait');
  assert.ok(l.suggestions.some((x) => x.patch.asgMin === 2));
  assert.equal(s.flows.outFailRps, 0, 'fine once the gateway is present in AZ B');
});

test('repair during an RDS failover keeps exactly one primary and one standby', () => {
  const s = sim('ha');
  s.run(3);
  s.trigger('dbFail');
  s.run(2);
  assert.ok(s.db.some((n) => n.state === 'promoting'));
  s.trigger('repair');
  s.run(15);
  assert.deepEqual(s.db.map((n) => n.role).sort(), ['primary', 'standby']);
  s.setConfig({ s3: false });
  s.run(3);
  assert.equal(new Set(s.db.map((n) => n.id)).size, s.db.length, 'no duplicate database ids');
  assert.equal(s.db.length, 2);
});

test('a database waiting for a new host stays down once its AZ is destroyed', () => {
  const s = new Simulation({ elb: true, ec2: { a: 1, b: 1 }, database: 'rds' });
  s.run(2);
  s.trigger('dbFail');
  s.run(1);
  s.trigger('quake', { az: 'a' });
  s.run(30);
  assert.ok(s.db.every((n) => n.state === 'failed'));
  assert.notEqual(s.metrics.status, 'ok');
});

test('rebalancing after a repair goes at most one instance over the maximum', () => {
  const s = sim('ha');
  s.run(3);
  s.trigger('quake', { az: 'a' });
  s.setUsers(1_000_000);
  s.run(20);
  s.trigger('repair');
  s.setUsers(1_000_000);
  let peak = 0;
  for (let k = 0; k < 300; k++) {
    s.run(0.1);
    peak = Math.max(peak, s.instances.filter((i) => i.state === 'pending' || i.state === 'running').length);
  }
  assert.ok(peak <= s.config.asgMax + 1, `peak ${peak}`);
});

test('cost: HA costs more than one server', () => {
  const a = sim('single');
  const b = sim('ha');
  a.run(2);
  b.run(2);
  assert.ok(b.metrics.cost > a.metrics.cost);
});

test('AWS Budgets: the spike pushes the forecast over budget, then it re-arms', () => {
  const s = sim('ha', { budget: 1000 });
  s.run(3);
  const alerts = () => s.events.filter((e) => e.type === 'budgetWarn' || e.type === 'budgetOver');
  assert.equal(alerts().length, 0, 'no alert at normal traffic');
  const l = runScenario(s, 'spike');
  assert.ok(s.events.some((e) => e.type === 'budgetOver'), 'over-budget alert during the spike');
  assert.ok(l.points.some((p) => p.kind === 'good' && p.text.includes('AWS Budgets')), 'lesson credits the budget alert');
  for (let k = 0; k < 400 && !s.events.some((e) => e.type === 'budgetOk'); k++) s.run(0.1);
  assert.ok(s.events.some((e) => e.type === 'budgetOk'), 'forecast back under budget once the crowd is gone');
});

test('AWS Budgets: a budget below the running cost alerts right away; without one the spike lesson suggests it', () => {
  const s = sim('ha', { budget: 200 });
  s.run(1);
  assert.ok(s.events.some((e) => e.type === 'budgetOver'), 'HA costs more than $200/month');
  const t = sim('ha');
  t.run(2);
  const l = runScenario(t, 'spike');
  assert.ok(l.suggestions.some((x) => x.patch.budget), 'should suggest setting a budget');
});

test('payment outage: orders fail without SQS, wait in the queue and drain with it', () => {
  const a = sim('ha');
  a.run(3);
  const la = runScenario(a, 'paymentDown');
  assert.notEqual(la.grade, 'pass');
  assert.ok(la.suggestions.some((x) => x.patch.queue), 'should suggest SQS');

  const b = sim('ha', { queue: true });
  b.run(3);
  assert.ok(b.trigger('paymentDown') !== false);
  b.run(10);
  assert.ok(b.queue.depth > 50, `backlog builds while the provider is down (${b.queue.depth.toFixed(0)})`);
  assert.ok(b.metrics.success > 0.99, `orders are still accepted (${b.metrics.success})`);
  for (let k = 0; k < 600 && !b.lesson; k++) b.run(0.1);
  assert.equal(b.lesson.grade, 'pass');
  assert.ok(b.events.some((e) => e.type === 'queueDrained'), 'the worker drains the backlog once the provider is back');
  assert.ok(b.queue.depth < 1);
});

test('SQS soaks up the order backlog of a spike and the worker drains it afterwards', () => {
  const s = sim('ha', { queue: true });
  s.run(3);
  const l = runScenario(s, 'spike');
  assert.ok(l.points.some((p) => p.kind === 'good' && /SQS gom/.test(p.text)), 'lesson credits the queue for the backlog');
  for (let k = 0; k < 600 && s.queue.depth >= 1; k++) s.run(0.1);
  assert.ok(s.queue.depth < 1, 'backlog drained');
});

test('accidental delete: Multi-AZ copies the delete, only AWS Backup brings the data back', () => {
  const a = sim('ha'); // RDS Multi-AZ, no backup
  a.run(3);
  const la = runScenario(a, 'dataDelete');
  assert.equal(la.grade, 'fail');
  assert.ok(a.events.some((e) => e.type === 'replicatedDelete'), 'the standby gets the delete too');
  assert.ok(la.suggestions.some((x) => x.patch.backup), 'should suggest AWS Backup');
  assert.ok(a.data.lost);

  const b = sim('ha', { backup: true });
  b.run(3);
  const lb = runScenario(b, 'dataDelete');
  assert.equal(lb.grade, 'partial');
  assert.ok(b.events.some((e) => e.type === 'restoreDone'));
  assert.equal(b.metrics.status, 'ok');
});

test('accidental delete needs somewhere data lives; repair brings an unbacked site back empty', () => {
  const s = new Simulation({ compute: 'lambda', s3: true });
  assert.equal(s.trigger('dataDelete'), false);
  const t = sim('serverless');
  t.run(2);
  runScenario(t, 'dataDelete');
  assert.ok(t.events.some((e) => e.type === 'noBackup'));
  t.trigger('repair');
  t.run(3);
  assert.ok(t.events.some((e) => e.type === 'dataGone'));
  assert.equal(t.metrics.status, 'ok');
});

test('VPC Endpoint: S3 traffic leaves the NAT bill; with SQS nothing needs NAT any more', () => {
  const a = sim('ha');
  const b = sim('ha', { vpce: true });
  a.run(2);
  b.run(2);
  assert.ok(a.flows.s3NatRps > 0, 'S3 calls go through NAT without an endpoint');
  assert.equal(b.flows.s3NatRps, 0);
  assert.ok(b.metrics.costBreakdown.nat < a.metrics.costBreakdown.nat, 'the endpoint lowers the NAT bill');
  const c = sim('ha', { nat: 'none', queue: true, vpce: true });
  c.run(3);
  assert.equal(c.metrics.status, 'ok');
  assert.equal(c.flows.awsFailRps, 0);
  assert.ok(!c.events.some((e) => e.type === 'noNat'), 'nothing to warn about');
});

test('spike lesson points at the NAT bill for S3 traffic and suggests a VPC Endpoint', () => {
  const s = sim('ha');
  s.run(3);
  const l = runScenario(s, 'spike');
  assert.ok(l.suggestions.some((x) => x.patch.vpce), 'should suggest a VPC Endpoint');
  const t = sim('ha', { vpce: true });
  t.run(3);
  const lt = runScenario(t, 'spike');
  assert.ok(lt.points.some((p) => p.kind === 'good' && /VPC Endpoint/.test(p.text)));
});

test('events about one instance or database keep their own unique ids', () => {
  const s = sim('ha');
  s.run(3);
  runScenario(s, 'serverFail');
  s.trigger('repair');
  s.run(3);
  runScenario(s, 'spike');
  s.trigger('repair');
  s.run(30); // the fleet scales back in after the spike
  s.trigger('dbFail');
  s.run(5);
  const of = (type) => s.events.filter((e) => e.type === type);
  for (const type of ['serverFail', 'hcFail', 'scaleIn', 'dbFail']) assert.ok(of(type).length, `no ${type} event`);
  const [fail] = of('serverFail');
  assert.ok(of('hcFail').some((e) => e.instId === fail.instId), 'the health check names the broken instance');
  assert.ok(of('scaleIn').every((e) => typeof e.instId === 'string'));
  assert.ok(of('dbFail').every((e) => s.db.some((n) => n.id === e.dbId)));
  const ids = s.events.map((e) => e.id);
  assert.ok(ids.every(Number.isInteger), 'event ids are sequence numbers');
  assert.equal(new Set(ids).size, ids.length, 'no two events share an id (the event log keys on it)');
});

test('a leaked access key: GuardDuty stops the miners, Budgets only notices late, nothing = fail', () => {
  const grade = (patch) => {
    const s = sim('ha');
    s.setConfig(patch);
    s.run(3);
    const lt = runScenario(s, 'leakedKey');
    return { lt, s };
  };
  const gd = grade({ guardduty: true, budget: 1000 });
  assert.equal(gd.lt.grade, 'pass');
  assert.ok(gd.s.events.some((e) => e.type === 'leakContained'));
  assert.equal(gd.s.leak.active, false);
  const bud = grade({ guardduty: false, budget: 1000 });
  assert.equal(bud.lt.grade, 'partial');
  assert.equal(bud.lt.badge, 'Phát hiện muộn', 'the site never went down: the badge names the late detection');
  const alert = bud.s.events.find((e) => e.type === 'budgetOver');
  const start = bud.s.events.find((e) => e.type === 'leakedKey');
  assert.ok(alert && alert.t - start.t >= 12, 'billing data lags: Budgets alerts only after the lag');
  assert.ok(bud.lt.suggestions.some((x) => x.patch.guardduty));
  const none = grade({ guardduty: false, budget: 0 });
  assert.equal(none.lt.grade, 'fail');
  assert.ok(none.s.metrics.costBreakdown.leak > 0, 'the miners keep billing');
  none.s.trigger('repair');
  none.s.run(1);
  assert.equal(none.s.leak.active, false);
});

test('bad deploy all at once: every dynamic request fails until someone rolls back by hand', () => {
  const s = sim('ha');
  s.run(3);
  const lt = runScenario(s, 'badDeploy');
  assert.equal(lt.grade, 'fail');
  const types = s.events.map((e) => e.type);
  for (const t of ['deployStart', 'deployLive', 'deployManual', 'deployRolledBack']) assert.ok(types.includes(t), t);
  assert.ok(lt.suggestions.some((x) => x.patch.canary));
  assert.equal(s.deploy.active, false);
  // repair in the middle of a rollout puts the old version back at once
  s.trigger('badDeploy');
  s.run(4);
  assert.ok(s.deploy.share > 0.9);
  s.trigger('repair');
  s.run(1);
  assert.equal(s.deploy.active, false);
  assert.equal(s.deploy.share, 0);
});

test('bad deploy with a canary: 10% of traffic sees the bug and the 5xx alarm rolls it back', () => {
  for (const preset of ['ha', 'serverless']) {
    const s = sim(preset, { canary: true });
    s.run(3);
    assert.ok(s.trigger('badDeploy') !== false);
    let min = 1;
    for (let k = 0; k < 600 && !s.lesson; k++) {
      s.run(0.1);
      min = Math.min(min, s.metrics.success);
    }
    assert.equal(s.lesson.grade, 'pass', preset);
    assert.ok(min > 0.9, `${preset}: success fell to ${min}`);
    const start = s.events.find((e) => e.type === 'deployStart');
    const back = s.events.find((e) => e.type === 'deployRolledBack');
    assert.ok(back && back.t - start.t <= 5, 'rolled back within seconds');
  }
});

test('a canary splits traffic by weight: it needs a load balancer in front of EC2', () => {
  assert.equal(normalizeConfig({ canary: true }).canary, false);
  assert.equal(normalizeConfig({ canary: true, elb: true }).canary, true);
  assert.equal(normalizeConfig({ compute: 'lambda', canary: true }).canary, true);
});

test('a whole Region going down: no DR = down until repaired; each strategy recovers faster and costs more', () => {
  const run = (dr, preset = 'ha') => {
    const s = sim(preset, { route53: true, dr, backup: dr === 'backup' || undefined });
    s.run(3);
    const cost = s.metrics.costBreakdown.dr;
    const lt = runScenario(s, 'regionDown');
    return { s, lt, cost };
  };
  const none = run('none');
  assert.equal(none.lt.grade, 'fail');
  assert.equal(none.s.metrics.status, 'down', 'Multi-AZ does not help when every AZ is gone');
  assert.ok(none.lt.suggestions.some((x) => x.patch.dr === 'warm'));
  const backup = run('backup');
  const pilot = run('pilot');
  const warm = run('warm');
  const active = run('active');
  assert.equal(backup.lt.grade, 'partial');
  assert.equal(pilot.lt.grade, 'partial', 'pilot light waits for someone to decide');
  assert.equal(warm.lt.grade, 'pass');
  assert.equal(active.lt.grade, 'pass');
  for (const r of [backup, pilot, warm, active]) {
    assert.equal(r.s.dr.share, 1, 'every user is sent to the DR Region');
    assert.equal(r.s.dr.phase, 'live');
    assert.ok(['ok', 'slow'].includes(r.s.metrics.status));
  }
  // the outage shrinks and the standby bill grows, strategy by strategy
  const bad = (r) => r.s.lesson.stats[1].value;
  const secs = [backup, pilot, warm].map((r) => parseInt(bad(r), 10));
  assert.ok(secs[0] > secs[1] && secs[1] > secs[2], `outage ${secs}`);
  assert.ok(backup.cost < pilot.cost && pilot.cost < warm.cost && warm.cost < active.cost, `cost ${[backup, pilot, warm, active].map((r) => r.cost.toFixed(3))}`);
  // active-active never drops every user: the DR Region was already serving half of them
  assert.ok(active.lt.stats[0].value !== '0%' && active.s.events.every((e) => e.type !== 'siteDown'));
  assert.ok(warm.s.events.some((e) => e.type === 'drPromoted'), 'the RDS replica is promoted');
  assert.ok(backup.s.events.some((e) => e.type === 'drRebuilt'), 'backup & restore rebuilds the stack');
});

test('a Region outage: serverless pilot light is cheap; failback waits for the primary to be ready', () => {
  const s = sim('serverless', { dr: 'pilot' });
  s.run(3);
  assert.ok(s.metrics.costBreakdown.dr < 0.05, 'idle Lambda and a global table cost almost nothing');
  const lt = runScenario(s, 'regionDown');
  assert.equal(lt.grade, 'partial');
  const w = sim('ha', { dr: 'warm' });
  w.run(3);
  w.trigger('regionDown');
  w.run(12);
  assert.equal(w.trigger('quake', { az: 'a' }), false, 'nothing left to break in the lost Region');
  w.trigger('repair');
  let worst = 1;
  for (let k = 0; k < 80; k++) {
    w.run(0.1);
    worst = Math.min(worst, w.metrics.success);
  }
  assert.ok(worst > 0.97, `users moved back before the primary was ready (success ${worst})`);
  assert.equal(w.dr.share, 0);
  assert.equal(w.dr.phase, 'standby');
  assert.equal(w.dr.db, 'replica');
  assert.ok(w.settled());
});

test('DR needs Route 53 to move users, and backups for backup & restore; setting it up mid-outage is too late', () => {
  assert.equal(normalizeConfig({ dr: 'warm' }).dr, 'none');
  assert.equal(normalizeConfig({ route53: true, dr: 'warm' }).dr, 'warm');
  assert.equal(normalizeConfig({ route53: true, database: 'rds', dr: 'backup' }).dr, 'none');
  assert.equal(normalizeConfig({ route53: true, database: 'rds', backup: true, dr: 'backup' }).dr, 'backup');
  const s = sim('ha');
  s.run(2);
  s.trigger('regionDown');
  s.run(2);
  s.setConfig({ dr: 'warm' });
  s.run(10);
  assert.ok(s.events.some((e) => e.type === 'drTooLate'));
  assert.equal(s.dr.share, 0);
  assert.equal(s.metrics.status, 'down');
});

test('active-active splits the users and both Regions scale for a spike', () => {
  const s = sim('ha', { dr: 'active' });
  s.run(3);
  assert.equal(s.flows.drShare, 0.5);
  s.trigger('spike');
  s.run(20);
  const r1 = s.instances.filter((i) => i.state !== 'terminating').length;
  const r2 = s.dr.fleet.filter((i) => i.state !== 'terminating').length;
  assert.ok(r1 > 2 && r2 > 2, `fleets ${r1} / ${r2}`);
  assert.ok(Math.abs(r1 - r2) <= 1);
});

test('a month-end report on the production RDS makes orders time out; the Multi-AZ standby cannot share it', () => {
  const s = sim('ha');
  s.run(3);
  assert.ok(s.trigger('report') !== false);
  s.run(4);
  assert.ok(s.flows.reportHit);
  assert.ok(s.metrics.success < 0.97, `success ${s.metrics.success}`);
  assert.ok(s.db.find((n) => n.role === 'primary').load >= 1);
  assert.ok(s.events.some((e) => e.type === 'reportStandby'));
  for (let k = 0; k < 600 && !s.lesson; k++) s.run(0.1);
  const l = s.lesson;
  assert.equal(l.grade, 'fail');
  assert.ok(l.suggestions.some((x) => x.patch.analytics === 'athena'));
  assert.equal(s.metrics.status, 'ok', 'the site recovers once the report is done');
});

test('a report on S3 + Athena or on Redshift (zero-ETL) leaves the website alone; Redshift costs more to keep', () => {
  const cost = {};
  for (const analytics of ['athena', 'redshift']) {
    const s = sim('ha', { analytics });
    s.run(3);
    cost[analytics] = s.metrics.costBreakdown.analytics;
    assert.ok(s.trigger('report') !== false);
    let worst = 1;
    for (let k = 0; k < 600 && !s.lesson; k++) {
      s.run(0.1);
      worst = Math.min(worst, s.metrics.success);
    }
    assert.ok(worst > 0.99, `${analytics}: success ${worst}`);
    assert.equal(s.lesson.grade, 'pass');
    assert.ok(s.t < 20, `${analytics}: the lesson should come as soon as the quick report is done (t ${s.t})`);
  }
  assert.ok(cost.redshift > cost.athena + 1, JSON.stringify(cost));
});

test('DynamoDB has no GROUP BY: the report turns into a full Scan — the site is fine, the bill and the wait are not', () => {
  const s = sim('serverless');
  s.run(3);
  const before = s.metrics.cost;
  assert.ok(s.trigger('report') !== false);
  s.run(2);
  assert.ok(s.metrics.cost > before + 3, `${before} → ${s.metrics.cost}`);
  let worst = 1;
  for (let k = 0; k < 600 && !s.lesson; k++) {
    s.run(0.1);
    worst = Math.min(worst, s.metrics.success);
  }
  assert.ok(worst > 0.99);
  assert.equal(s.lesson.grade, 'partial');
  assert.equal(s.lesson.badge, 'Chậm & tốn');
});

test('reports need data: no database, no analytics and no report', () => {
  assert.equal(normalizeConfig({ analytics: 'redshift' }).analytics, 'none');
  assert.equal(normalizeConfig({ database: 'rds', analytics: 'redshift' }).analytics, 'redshift');
  assert.equal(normalizeConfig({ database: 'dynamodb', analytics: 'nope' }).analytics, 'none');
  const s = sim('single');
  s.run(1);
  assert.equal(s.trigger('report'), false);
  const r = sim('classic', { analytics: 'athena' });
  r.setConfig({ database: 'none' });
  assert.equal(r.config.analytics, 'none');
});

test('Well-Architected score rises as weak spots are fixed', () => {
  const avg = (c) => wellArchitected(normalizeConfig(c)).reduce((n, p) => n + p.score, 0) / 6;
  const weak = avg({});
  const strong = avg({ route53: true, cloudfront: true, s3: true, elb: true, asg: true, appSubnet: 'private', nat: 'perAz', vpce: true, database: 'rds', rdsMultiAz: true, cache: true, waf: true, shield: true, guardduty: true, budget: 1000, queue: true, backup: true, canary: true, dr: 'warm', analytics: 'athena' });
  assert.ok(strong > weak + 40, `${weak} → ${strong}`);
  for (const p of wellArchitected(normalizeConfig({}))) for (const x of p.checks) if (x.patch) assert.ok(typeof x.patch === 'object');
});

if (failures) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nall simulation tests passed');
