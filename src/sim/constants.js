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
// to the Internet; servers in a private subnet only have one through a NAT Gateway. A Regional
// NAT Gateway (one for the whole VPC) joins an AZ that gets servers in `regionalExpandTime`
// (real life: 15–20 min on average, up to 60 min) and bills one NAT Gateway-hour per AZ it is in
export const NAT = { outboundShare: 0.15, kbPerCall: 10, costPerHour: 0.059, costPerGB: 0.059, regionalExpandTime: 15 };
// the outside APIs themselves (payment provider, email…): a synchronous call adds this much to
// the request, and a provider outage lasts `downHold` seconds
export const EXT = { ms: 220, downHold: 20 };
// app servers also read/write files in S3 (product photos, uploads): from a private subnet that
// traffic goes through the NAT Gateway (billed per GB) unless a Gateway VPC Endpoint carries it
export const S3APP = { share: 0.1, kbPerCall: 60 };
// SQS between the web tier and the slow work (payment, email): the web tier only enqueues the
// order and answers at once; a Lambda worker drains the queue at its own pace and simply retries
// while the payment provider is down — messages wait in the queue, nothing is lost
export const SQS = { enqueueMs: 8, workerRate: 450, costPerMillion: 0.4, callsPerMsg: 3, batch: 10, backlogWarn: 100 };
// VPC Endpoints for a private fleet: a Gateway Endpoint for S3 (free) and an Interface Endpoint
// for SQS in each AZ (billed hourly and per GB, far below the NAT per-GB charge)
export const VPCE = { ifaceCostPerHour: 0.013, costPerGB: 0.01 };
// AWS Backup: daily backups + point-in-time recovery. A restore builds a new copy of the data
// store (real life: tens of minutes to hours); only the last few minutes before the chosen
// point in time are lost
export const BACKUP = { detectTime: 2, restoreTime: 10, rpoMinutes: 5, costPerHour: 0.012 };
// "accidental delete": a bad deploy wipes most of the data — this share of dynamic requests
// needs the deleted rows and fails until the data is back
export const WIPE = { share: 0.7 };
// AWS Budgets: monthly budget choices ($), forecast = smoothed current run-rate × hours in a
// month; alerts at 80% and 100% of the budget, re-armed once the forecast falls below 70%
export const BUDGET = { options: [200, 1000, 5000], warnAt: 0.8, rearmAt: 0.7, smoothing: 3, hoursPerMonth: 730 };

// "leaked access key": a long-term IAM user key pushed to a public Git repo is used within
// minutes to launch GPU crypto miners in other Regions. `costPerHour` is an illustrative bill for
// a few dozen big GPU instances. GuardDuty (reads CloudTrail, VPC Flow Logs and DNS logs, no
// agent) raises a finding after `gdDetect`; an EventBridge rule runs a Lambda that disables the
// key and stops the miners `gdRespond` later. Billing data lags by hours, so AWS Budgets only
// sees the new spend after `billingLag`. `realHours`: how long the miners run in real life before
// someone notices — GuardDuty minutes, Budgets about half a day, the monthly bill about two weeks
export const LEAK = { miners: 6, costPerHour: 400, gdDetect: 3, gdRespond: 2, billingLag: 12, realHours: { guardduty: 0.25, budgets: 10, bill: 360 } };
// GuardDuty: billed by the volume of logs and events it analyses — a small app is a few dollars a
// month (illustrative); the first 30 days are a free trial
export const GUARDDUTY = { costPerHour: 0.006 };

// "bad deploy": a new release answers 500 on every dynamic request. All at once, it reaches the
// whole fleet in `rollout` and stays until someone notices — users complain, the on-call engineer
// checks the dashboards — after `manualDetect` (real life 15–30 minutes) and redeploys the old
// version in `manualRollback`. With a canary, CodeDeploy first sends `canaryShare` of the traffic to
// it (ALB weighted target groups for EC2, alias weights for Lambda); a CloudWatch alarm on the 5xx
// rate fires after `alarmTime` (real life 1–3 minutes) and CodeDeploy shifts everything back
// within `shiftBack`
export const DEPLOY = { rollout: 2, manualDetect: 12, manualRollback: 4, canaryShare: 0.1, alarmTime: 3, shiftBack: 1 };

// Disaster recovery in a second Region (Tokyo). What runs there before a disaster depends on the
// strategy: backup copies only (backup & restore), a live copy of the data with the servers switched
// off (pilot light), a small copy that is always on (warm standby, `warmFleet` EC2) or a full copy
// serving half the users all the time (active-active). Route 53 health checks need `detect` to call
// the primary Region dead (3 failed checks 30 s apart plus the DNS TTL: 1–2 min in real life); warm
// standby and active-active then fail over on their own. Pilot light and backup & restore wait for
// someone to confirm the disaster and run the runbook (`decide`, real life 15–30 min); backup &
// restore then rebuilds the whole stack from CloudFormation and the backup copies (`rebuild`, real
// life hours). A database replica takes `promote` to accept writes (Aurora Global < 1 min, an RDS
// read replica a few minutes) — until then the `writeShare` of dynamic requests that write fails.
// Users in Vietnam reach Tokyo `extraMs` slower than Singapore. `copyCostPerHour`: the backup copies
// kept in Tokyo. `passOutage`: the longest outage (simulated) still graded as "a few minutes"
export const DR = { code: 'ap-northeast-1', city: 'Tokyo', detect: 3, decide: 3, promote: 2.5, rebuild: 14, warmFleet: 1, writeShare: 0.3, extraMs: 35, copyCostPerHour: 0.006, passOutage: 8 };
export const REGION = { code: 'ap-southeast-1', city: 'Singapore' };

// "month-end report": the sales team wants revenue by province and month over two years. On the
// production RDS (a row store that is also taking orders) the query scans hundreds of millions of
// rows for `prodTime` (real life: tens of minutes); every query that reaches the database waits
// behind it (`extraMs`) and `failShare` of them time out. A Multi-AZ standby takes no queries, so it
// cannot share the load. DynamoDB has no GROUP BY: the report becomes a full-table Scan summed up in
// code — the site barely notices, but it takes `scanTime` and burns read units (`scanCostPerHour`
// while it runs: about $3 for a 200 GB table). Off the production database it takes seconds: Athena
// on last night's Parquet export in S3 (`athenaTime`), or Redshift Serverless kept seconds behind by
// a zero-ETL integration (`redshiftTime`). Running costs are illustrative: the lake (S3 + the nightly
// export) and Redshift Serverless at its 4 RPU base ($0.375 per RPU-hour), kept busy by the stream
// of changes — zero-ETL has no fee of its own
export const REPORT = { prodTime: 16, extraMs: 900, failShare: 0.3, scanTime: 14, scanCostPerHour: 6, athenaTime: 3, redshiftTime: 2, lakeCostPerHour: 0.012, redshiftCostPerHour: 1.5 };

// how long each scenario is watched before the lesson card appears (simulated seconds)
export const SCENARIO_TIME = { quake: 22, serverFail: 16, spike: 38, dbFail: 32, night: 26, ddos: 30, sqlInjection: 26, paymentDown: 30, dataDelete: 30, leakedKey: 24, badDeploy: 26, regionDown: 40, report: 26 };
export const SPIKE_HOLD = 30;
export const NIGHT_HOLD = 18;

export const STEP = 0.1; // fixed simulation step (s)
