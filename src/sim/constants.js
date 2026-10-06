// Tuning for the sandbox simulation. Time is compressed: a few simulated seconds stand in for
// minutes in real AWS (instance boot, RDS failover…). Capacities and prices are illustrative
// round numbers close to real defaults/quotas, not an official AWS price list.

export const AZ_IDS = ['a', 'b'];
export const AZ_LABEL = { a: 'AZ A', b: 'AZ B' };
export const AZ_CODE = { a: 'ap-southeast-1a', b: 'ap-southeast-1b' };
export const OTHER_AZ = { a: 'b', b: 'a' };

// online users; every user sends about one request per 100 s
export const USERS = { normal: 10_000, spike: 1_000_000, night: 500, min: 100, max: 2_000_000 };
export const REQ_PER_USER = 0.01;
// share of requests that are static files (images, CSS, JS) — the rest hit the app + database
export const STATIC_SHARE = 0.6;
// network round trip from a user in Vietnam to the Singapore region (ms)
export const REGION_MS = 40;

export const EC2 = {
  capacity: 500, // requests/s one instance can handle
  bootTime: 5, // Auto Scaling launch → InService (real life: 1–3 minutes)
  provisionTime: 1.6, // instances created from the palette (just long enough to see them build)
  terminateTime: 1.5,
  procMs: 30,
  maxPerAz: 4, // manual instance count per AZ (without Auto Scaling)
  slotsPerAz: 10,
  costPerHour: 0.0416, // t3.medium on-demand
};

export const HEALTH = { interval: 1, unhealthyThreshold: 2 };

export const ASG = { targetCpu: 0.6, scaleInDelay: 5, scaleInEvery: 1.5, min: 2, max: 10, limit: 10 };

export const RDS = {
  capacity: 4500, // queries/s
  failoverTime: 6, // Multi-AZ failover (real life: 60–120 s)
  recoverTime: 25, // Single-AZ host replacement (real life: tens of minutes)
  standbyCreate: 6,
  restoreTime: 3,
  queryMs: 5,
  costPerHour: 0.068, // db.t3.medium per node (Multi-AZ = 2 nodes)
};

export const DDB = { queryMs: 6, costPerMillion: 0.225 };
export const LAMBDA = { duration: 0.2, limit: 1000, warmMs: 40, coldMs: 400, keepWarm: 6, costPerMillion: 0.62 };
export const APIGW = { limit: 10_000, ms: 10, costPerMillion: 1.0 };
export const CF = { hitRatio: 0.9, warmTime: 3, edgeMs: 15, originMs: 30, costPerMillion: 1.2 };
// ElastiCache: share of RDS reads a warmed-up cache absorbs before they reach the database
export const CACHE = { hitRatio: 0.8, warmTime: 4, queryMs: 1, costPerHour: 0.017 };
// DDoS: a flood of junk requests thrown at the edge (ELB/CloudFront), on top of real traffic.
// Shield is the dedicated network-layer defence; a WAF rate-based rule helps some on its own
// but is not a substitute for it.
export const DDOS = { floodRps: 15_000, hold: 24, shieldMitigation: 0.97, wafOnlyMitigation: 0.5 };
// SQL injection: a share of dynamic requests carry a malicious payload aimed at the database.
// Only a WAF rule (inspecting the request body) can catch this — Shield only looks at network
// traffic volume, not content.
export const SQLI = { maliciousShare: 0.45, mitigation: 0.95, hold: 20 };
// WAF: a web ACL + rules, billed hourly plus per request. Shield Standard (DDoS protection) is
// included free with every AWS account — only Shield Advanced costs money, not modelled here.
export const WAF = { costPerHour: 0.007, costPerMillion: 0.6 };
export const S3 = { ms: 25, costPerMillion: 0.4, storagePerHour: 0.003 };
export const ELB = { ms: 2, costPerHour: 0.0225, lcuPerRps: 1 / 250, lcuCost: 0.008 };
export const R53 = { costPerHour: 0.0007, queryRatio: 0.01, costPerMillion: 0.4 };
// share of dynamic requests that call an outside API (payment, email…) and so need a way out
// to the Internet; servers in a private subnet only have one through a NAT Gateway
export const NAT = { outboundShare: 0.15, kbPerCall: 10, costPerHour: 0.059, costPerGB: 0.059 };

// how long each scenario is watched before the lesson card appears (simulated seconds)
export const SCENARIO_TIME = { quake: 22, serverFail: 16, spike: 38, dbFail: 32, night: 26, ddos: 30, sqlInjection: 26 };
export const SPIKE_HOLD = 30;
export const NIGHT_HOLD = 18;

export const STEP = 0.1; // fixed simulation step (s)
