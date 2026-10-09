// Static checks for the explore flows: every service has a flow, every action names a known
// action type and refers to nodes that exist on that flow's stage, and every deep link (a 3D
// object explained at one step of a lesson) lands on a real step. usage: node test/flows.test.mjs
import { FLOWS } from '../src/data/flows.js';
import * as catalogue from '../src/data/services.js';

const { SERVICES } = catalogue;
const SANDBOX_ACTIONS = new Set([null, 'quake', 'serverFail', 'spike', 'dbFail', 'ddos', 'sqlInjection', 'paymentDown', 'dataDelete', 'leakedKey', 'badDeploy', 'regionDown', 'report']);

const KINDS = new Set(['ec2', 'elb', 's3', 'rds', 'dynamodb', 'lambda', 'apigw', 'igw', 'nat', 'external', 'cloudfront', 'edge', 'route53', 'users', 'user', 'az', 'zone', 'region', 'outline', 'subnet', 'globe', 'token', 'cloudwatch', 'sqs', 'iam', 'sns', 'cache', 'waf', 'shield', 'ecs', 'secrets', 'cognito', 'ebs', 'snapshot', 'kms', 'cloudtrail', 'eventbridge', 'cloudformation', 'budgets', 'costexplorer', 'acm', 'stepfunctions', 'efs', 'mount', 'ecr', 'aurora', 'resp', 'vpce', 'eni', 'sg', 'nacl', 'org', 'account', 'ou', 'scp', 'kinesis', 'firehose', 'ssm', 'param', 'backup', 'idc', 'permset', 'guardduty', 'finding', 'config', 'rule', 'advisor', 'miner', 'eks', 'pod', 'beanstalk', 'codepipeline', 'codebuild', 'codedeploy', 'xray', 'pcx', 'tgw', 'vgw', 'cgw', 'dx', 'drs', 'ga', 'athena', 'glue', 'catalog', 'lakeformation', 'table', 'board', 'redshift', 'quicksight', 'osdash', 'opensearch', 'onprem', 'server', 'localzone', 'wavelength', 'tower', 'outposts', 'pricing', 'cur', 'fsx', 'storagegateway', 'tape', 'docdb', 'neptune', 'keyspaces', 'memorydb', 'timestream', 'mgn', 'agent', 'dsagent', 'staging', 'dms', 'sct', 'datasync', 'transfer', 'snowball', 'rekognition', 'textract', 'transcribe', 'comprehend', 'translate', 'polly', 'lex', 'sagemaker', 'notebook', 'mlmodel', 'endpoint', 'bedrock', 'amazonq', 'root', 'mfa', 'lightsail', 'amplify', 'ses', 'kb', 'guardrail', 'agentcore', 'inspector', 'macie', 'securityhub', 'sts', 'health', 'quotas', 'optimizer', 'controltower', 'cdk', 'rdsproxy', 'clientvpn', 'netfw', 'fms', 'dnsfw', 'mq', 'appsync', 'detective', 'cloudhsm', 'directory', 'ram', 'servicecatalog', 'grafana', 'prometheus', 'appconfig', 'sam', 'codeartifact', 'reachability', 'resolver', 'imagebuilder', 'batch', 'emr', 'msk', 'dax', 'eigw', 'connect', 'workspaces', 'appstream', 'iotcore', 'licensemanager']);
const ACTIONS = new Set(['packet', 'stream', 'pulse', 'callout', 'beam', 'break', 'fix', 'quake', 'show', 'hide', 'state', 'ghost', 'label', 'load', 'count', 'flash', 'focus', 'shake', 'sound']);
const STEP_KEYS = new Set(['key', 'advanced', 'link', 'title', 'text', 'dur', 'cam', 'run', 'loop', 'show', 'hide', 'state', 'ghost', 'label', 'load', 'count']);

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
    // a step that hands over to a lesson of its own (Bedrock inside SageMaker AI…)
    if (st.link != null && (st.link === id || !FLOWS[st.link])) err(where, `link → no other lesson "${st.link}"`);
  });
  // advanced steps can be skipped, so a lesson must open on a basic one
  if (flow.steps.some((st) => st.advanced != null && typeof st.advanced !== 'boolean')) err(id, 'step advanced must be true or false');
  if (flow.steps[0]?.advanced) err(id, 'the first step cannot be advanced');
  const keys = flow.steps.map((st) => st.key).filter((k) => k != null);
  if (keys.some((k) => typeof k !== 'string' || !k)) err(id, 'step key must be a non-empty string');
  if (new Set(keys).size !== keys.length) err(id, 'duplicate step keys');
  if (!SERVICES.some((s) => s.id === id)) err(id, 'flow has no service');
}

// a 3D object explained inside a bigger lesson: [service id, step key]
for (const [kind, [sid, key]] of Object.entries(catalogue.LESSON_FOR || {})) {
  if (!KINDS.has(kind)) err(`LESSON_FOR.${kind}`, 'unknown model kind');
  if (!FLOWS[sid]?.steps.some((st) => st.key === key)) err(`LESSON_FOR.${kind}`, `no step "${key}" in flow "${sid}"`);
}

// the beginner path: real lessons, each once
const pathIds = (catalogue.BEGINNER_PATH || []).map((p) => p.id);
if (new Set(pathIds).size !== pathIds.length) err('BEGINNER_PATH', 'a lesson is listed twice');
for (const p of catalogue.BEGINNER_PATH || []) {
  if (!SERVICES.some((s) => s.id === p.id)) err('BEGINNER_PATH', `no lesson "${p.id}"`);
  if (!p.why) err('BEGINNER_PATH', `"${p.id}" needs a why`);
}

// "try it in the sandbox": one suggestion, or a list of labelled ones
for (const s of SERVICES) {
  if (!s.sandbox) continue;
  const list = Array.isArray(s.sandbox) ? s.sandbox : [s.sandbox];
  for (const sb of list) {
    if (!sb.preset && !sb.config) err(`${s.id}.sandbox`, 'needs a preset or a config');
    if (!SANDBOX_ACTIONS.has(sb.action ?? null)) err(`${s.id}.sandbox`, `unknown action "${sb.action}"`);
    if (Array.isArray(s.sandbox) && !sb.label) err(`${s.id}.sandbox`, 'each suggestion in a list needs a label');
  }
}

if (errors.length) {
  console.log(errors.map((e) => 'FAIL ' + e).join('\n'));
  process.exit(1);
}
console.log(`ok   ${Object.keys(FLOWS).length} flows, ${Object.values(FLOWS).reduce((n, f) => n + f.steps.length, 0)} steps checked`);
