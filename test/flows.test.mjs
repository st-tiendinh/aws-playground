// Static checks for the explore flows: every service has a flow, every action names a known
// action type and refers to nodes that exist on that flow's stage. usage: node test/flows.test.mjs
import { FLOWS } from '../src/data/flows.js';
import { SERVICES } from '../src/data/services.js';

const KINDS = new Set(['ec2', 'elb', 's3', 'rds', 'dynamodb', 'lambda', 'apigw', 'igw', 'nat', 'external', 'cloudfront', 'edge', 'route53', 'users', 'user', 'az', 'zone', 'region', 'outline', 'subnet', 'globe', 'token', 'cloudwatch', 'sqs', 'iam', 'sns', 'cache', 'waf', 'shield', 'ecs', 'secrets', 'cognito', 'ebs', 'snapshot', 'kms', 'cloudtrail', 'eventbridge', 'cloudformation', 'budgets', 'costexplorer', 'acm', 'stepfunctions', 'efs', 'mount', 'ecr', 'aurora', 'resp']);
const ACTIONS = new Set(['packet', 'stream', 'pulse', 'callout', 'beam', 'break', 'fix', 'quake', 'show', 'hide', 'state', 'ghost', 'label', 'load', 'count', 'flash', 'focus', 'shake', 'sound']);
const STEP_KEYS = new Set(['title', 'text', 'dur', 'cam', 'run', 'loop', 'show', 'hide', 'state', 'ghost', 'label', 'load', 'count']);

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

for (const s of SERVICES) if (!FLOWS[s.id]) err(s.id, 'service has no flow');

function checkActions(list, ids, where) {
  for (const a of list || []) {
    if (!ACTIONS.has(a.do)) err(where, `unknown action "${a.do}"`);
    for (const k of ['node', 'from', 'to']) if (a[k] != null && !ids.has(a[k])) err(where, `${a.do}.${k} → unknown node "${a[k]}"`);
    for (const v of a.via || []) if (!ids.has(v)) err(where, `${a.do}.via → unknown node "${v}"`);
    for (const b of a.breaks || []) if (!ids.has(b)) err(where, `quake.breaks → unknown node "${b}"`);
    if (a.do === 'packet' && (!a.from || (!a.to && !a.toPos))) err(where, 'packet needs from and to (or toPos)');
    checkActions(a.then, ids, where + ' › then');
    checkActions(a.backThen, ids, where + ' › backThen');
  }
}

for (const [id, flow] of Object.entries(FLOWS)) {
  const ids = new Set(flow.nodes.map((n) => n.id));
  if (ids.size !== flow.nodes.length) err(id, 'duplicate node ids');
  for (const n of flow.nodes) if (!KINDS.has(n.kind)) err(id, `node ${n.id} has unknown kind "${n.kind}"`);
  if (!flow.steps.length) err(id, 'no steps');
  flow.steps.forEach((st, i) => {
    const where = `${id} step ${i + 1}`;
    if (!st.title || !st.text) err(where, 'missing title or text');
    for (const k of Object.keys(st)) if (!STEP_KEYS.has(k)) err(where, `unknown step key "${k}"`);
    for (const k of ['show', 'hide']) for (const n of st[k] || []) if (!ids.has(n)) err(where, `${k} → unknown node "${n}"`);
    for (const k of ['state', 'ghost', 'label', 'load', 'count']) for (const n of Object.keys(st[k] || {})) if (!ids.has(n)) err(where, `${k} → unknown node "${n}"`);
    if (st.cam?.node && !ids.has(st.cam.node)) err(where, `cam.node → unknown node "${st.cam.node}"`);
    checkActions(st.run, ids, where);
    checkActions(st.loop?.run, ids, where + ' loop');
  });
}

if (errors.length) {
  console.log(errors.map((e) => 'FAIL ' + e).join('\n'));
  process.exit(1);
}
console.log(`ok   ${Object.keys(FLOWS).length} flows, ${Object.values(FLOWS).reduce((n, f) => n + f.steps.length, 0)} steps checked`);
