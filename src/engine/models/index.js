// Model factory: kind string → 3D model instance.
import { CAT_COLOR } from '../palette.js';
import {
  AuroraModel,
  BudgetsModel,
  CertModel,
  CloudFormationModel,
  CloudTrailModel,
  CloudWatchModel,
  EBSModel,
  ECRModel,
  EFSModel,
  EventBridgeModel,
  ExternalModel,
  GlobeModel,
  IAMModel,
  KinesisModel,
  KMSModel,
  NACLModel,
  OutlineModel,
  PersonModel,
  RegionModel,
  ResponsibilityModel,
  SQSModel,
  SSMModel,
  StepFunctionsModel,
  TileModel,
  TokenModel,
  UsersModel,
  VaultModel,
  ZoneModel,
} from './misc.js';
import { BoardModel, DashboardModel, RedshiftModel, TableModel } from './analytics.js';
import { FSxModel, GatewayModel, GraphModel } from './datastores.js';
import { RackModel, TowerModel } from './infra.js';
import {
  CloudFrontModel,
  DynamoDBModel,
  EC2Model,
  ECSModel,
  ELBModel,
  GateModel,
  LambdaModel,
  NATModel,
  RDSModel,
  Route53Model,
  S3Model,
} from './services.js';

const FACTORY = {
  ec2: (o) => new EC2Model(o),
  elb: (o) => new ELBModel(o),
  s3: (o) => new S3Model(o),
  rds: (o) => new RDSModel(o),
  dynamodb: (o) => new DynamoDBModel(o),
  lambda: (o) => new LambdaModel(o),
  ecs: (o) => new ECSModel(o),
  apigw: (o) => new GateModel(o),
  igw: (o) => new GateModel({ kind: 'igw', category: 'network', color: CAT_COLOR.network, dark: '#2e2366', ...o }),
  cloudfront: (o) => new CloudFrontModel(o),
  edge: (o) => {
    const m = new CloudFrontModel({ scale: 0.6, ...o });
    m.kind = 'edge';
    return m;
  },
  route53: (o) => new Route53Model(o),
  nat: (o) => new NATModel(o),
  external: (o) => new ExternalModel(o),
  users: (o) => new UsersModel(o),
  user: (o) => new PersonModel(o),
  az: (o) => new ZoneModel(o),
  zone: (o) => new ZoneModel({ kind: 'zone', ...o }),
  region: (o) => new RegionModel(o),
  outline: (o) => new OutlineModel(o),
  subnet: (o) => new TileModel(o),
  globe: (o) => new GlobeModel(o),
  token: (o) => new TokenModel(o),
  sns: (o) => new TokenModel({ shape: 'card', color: '#be185d', text: 'SNS', size: 1.2, ...o }),
  cache: (o) => new TokenModel({ kind: 'cache', category: 'database', color: CAT_COLOR.database, shape: 'disc', text: 'Cache', glow: true, size: 1.0, bob: 0.03, ...o }),
  waf: (o) => new TokenModel({ kind: 'waf', category: 'security', color: CAT_COLOR.security, shape: 'card', text: 'WAF', glow: true, size: 1.1, ...o }),
  shield: (o) => new TokenModel({ kind: 'shield', category: 'security', color: CAT_COLOR.security, shape: 'card', text: 'Shield', glow: true, size: 1.1, ...o }),
  secrets: (o) => new TokenModel({ kind: 'secrets', category: 'security', color: CAT_COLOR.security, shape: 'cube', text: 'Secrets', fontSize: 58, glow: true, size: 1.2, ...o }),
  cognito: (o) => new TokenModel({ kind: 'cognito', category: 'security', color: CAT_COLOR.security, shape: 'card', text: 'Cognito', fontSize: 56, glow: true, size: 1.5, ...o }),
  cloudwatch: (o) => new CloudWatchModel(o),
  sqs: (o) => new SQSModel(o),
  iam: (o) => new IAMModel(o),
  ebs: (o) => new EBSModel(o),
  snapshot: (o) => new TokenModel({ kind: 'snapshot', category: 'storage', color: '#3f6212', shape: 'disc', text: 'Snap', fontSize: 84, size: 0.9, ...o }),
  kms: (o) => new KMSModel(o),
  cloudtrail: (o) => new CloudTrailModel(o),
  eventbridge: (o) => new EventBridgeModel(o),
  cloudformation: (o) => new CloudFormationModel(o),
  budgets: (o) => new BudgetsModel(o),
  costexplorer: (o) => new CloudWatchModel({ kind: 'costexplorer', title: 'Chi phí $ / ngày', ...o }),
  acm: (o) => new CertModel(o),
  stepfunctions: (o) => new StepFunctionsModel(o),
  efs: (o) => new EFSModel(o),
  ecr: (o) => new ECRModel(o),
  aurora: (o) => new AuroraModel(o),
  resp: (o) => new ResponsibilityModel(o),
  mount: (o) => new TokenModel({ kind: 'mount', category: 'storage', color: '#3f6212', shape: 'disc', text: 'NFS', fontSize: 84, size: 0.8, ...o }),
  // VPC Endpoint: a small gate on the VPC edge (gateway type) or a network card in the subnet (interface type)
  vpce: (o) => new GateModel({ kind: 'vpce', category: 'network', color: '#a78bfa', dark: '#2e2366', scale: 0.75, ...o }),
  eni: (o) => new TokenModel({ kind: 'eni', category: 'network', color: CAT_COLOR.network, shape: 'card', text: 'ENI', glow: true, size: 1.0, ...o }),
  sg: (o) => new OutlineModel({ kind: 'sg', category: 'network', color: '#DD344C', ...o }),
  nacl: (o) => new NACLModel(o),
  // AWS Organizations: management account, member accounts, OUs and SCP cards
  org: (o) => new TokenModel({ kind: 'org', category: 'management', color: '#1e3a8a', shape: 'cube', text: 'Mgmt', fontSize: 76, glow: true, size: 1.4, ...o }),
  account: (o) => new TokenModel({ kind: 'account', category: 'management', color: '#2563eb', shape: 'cube', fontSize: 70, size: 1.25, ...o }),
  ou: (o) => new ZoneModel({ kind: 'ou', category: 'management', color: CAT_COLOR.management, top: '#e0e7ff', side: '#a5b4fc', ...o }),
  scp: (o) => new TokenModel({ kind: 'scp', category: 'management', color: '#b45309', shape: 'card', text: 'SCP', glow: true, size: 1.1, ...o }),
  kinesis: (o) => new KinesisModel(o),
  firehose: (o) => new TokenModel({ kind: 'firehose', category: 'analytics', color: '#8f6d07', shape: 'card', text: 'Firehose', fontSize: 50, glow: true, size: 1.4, ...o }),
  ssm: (o) => new SSMModel(o),
  backup: (o) => new VaultModel(o),
  // security & governance: IAM Identity Center, GuardDuty, AWS Config, Trusted Advisor
  idc: (o) => new TokenModel({ kind: 'idc', category: 'security', color: CAT_COLOR.security, shape: 'cube', text: 'SSO', fontSize: 80, glow: true, size: 1.4, ...o }),
  permset: (o) => new TokenModel({ kind: 'permset', category: 'security', color: '#9f1239', shape: 'card', text: 'PermSet', fontSize: 52, glow: true, size: 1.2, ...o }),
  guardduty: (o) => new TokenModel({ kind: 'guardduty', category: 'security', color: CAT_COLOR.security, shape: 'cube', text: 'GuardDuty', fontSize: 44, glow: true, size: 1.5, ...o }),
  finding: (o) => new TokenModel({ kind: 'finding', category: 'security', color: '#b91c1c', shape: 'card', text: 'Finding', fontSize: 56, glow: true, size: 1.1, ...o }),
  config: (o) => new TokenModel({ kind: 'config', category: 'management', color: CAT_COLOR.management, shape: 'cube', text: 'Config', fontSize: 64, glow: true, size: 1.4, ...o }),
  rule: (o) => new TokenModel({ kind: 'rule', category: 'management', color: '#1d4ed8', shape: 'card', text: 'Rule', fontSize: 72, glow: true, size: 1.0, ...o }),
  advisor: (o) => new TokenModel({ kind: 'advisor', category: 'management', color: '#1e40af', shape: 'cube', text: 'Advisor', fontSize: 56, glow: true, size: 1.4, ...o }),
  miner: (o) => new TokenModel({ kind: 'miner', category: 'compute', color: '#7f1d1d', shape: 'cube', text: 'Miner', fontSize: 62, glow: true, size: 1.0, ...o }),
  param: (o) => new TokenModel({ kind: 'param', category: 'management', color: '#1d4ed8', shape: 'card', text: 'Param', fontSize: 66, glow: true, size: 1.2, ...o }),
  // containers & PaaS: the EKS control plane, Kubernetes pods, Elastic Beanstalk
  eks: (o) => new TokenModel({ kind: 'eks', category: 'compute', color: CAT_COLOR.compute, shape: 'cube', text: 'EKS', fontSize: 84, glow: true, size: 1.4, ...o }),
  pod: (o) => new TokenModel({ kind: 'pod', category: 'compute', color: '#c2410c', shape: 'cube', text: 'Pod', fontSize: 70, glow: true, size: 0.75, ...o }),
  beanstalk: (o) => new TokenModel({ kind: 'beanstalk', category: 'compute', color: '#b45309', shape: 'cube', text: 'Beanstalk', fontSize: 40, glow: true, size: 1.4, ...o }),
  // developer tools: the CI/CD pipeline and its build / deploy stages, X-Ray tracing
  codepipeline: (o) => new TokenModel({ kind: 'codepipeline', category: 'devtools', color: CAT_COLOR.devtools, shape: 'cube', text: 'Pipeline', fontSize: 46, glow: true, size: 1.4, ...o }),
  codebuild: (o) => new TokenModel({ kind: 'codebuild', category: 'devtools', color: '#0f766e', shape: 'cube', text: 'Build', fontSize: 62, glow: true, size: 1.2, ...o }),
  codedeploy: (o) => new TokenModel({ kind: 'codedeploy', category: 'devtools', color: '#115e59', shape: 'cube', text: 'Deploy', fontSize: 54, glow: true, size: 1.2, ...o }),
  xray: (o) => new TokenModel({ kind: 'xray', category: 'devtools', color: CAT_COLOR.devtools, shape: 'cube', text: 'X-Ray', fontSize: 62, glow: true, size: 1.4, ...o }),
  // hybrid networking: a VPC peering connection, the Transit Gateway hub, both ends of a Site-to-Site
  // VPN (the virtual private gateway on the VPC, the customer gateway router) and a Direct Connect location
  pcx: (o) => new TokenModel({ kind: 'pcx', category: 'network', color: '#7c3aed', shape: 'card', text: 'Peering', fontSize: 50, glow: true, size: 1.1, ...o }),
  tgw: (o) => new TokenModel({ kind: 'tgw', category: 'network', color: CAT_COLOR.network, shape: 'disc', text: 'TGW', fontSize: 92, glow: true, size: 2.2, ...o }),
  vgw: (o) => new GateModel({ kind: 'vgw', category: 'network', color: '#7c3aed', dark: '#2e2366', scale: 0.85, ...o }),
  cgw: (o) => new TokenModel({ kind: 'cgw', category: 'network', color: '#334155', shape: 'cube', text: 'Router', fontSize: 58, size: 1.1, ...o }),
  dx: (o) => new TokenModel({ kind: 'dx', category: 'network', color: '#5b21b6', shape: 'cube', text: 'DX', fontSize: 96, glow: true, size: 1.4, ...o }),
  // disaster recovery: Elastic Disaster Recovery's replication, Global Accelerator's entry points
  drs: (o) => new TokenModel({ kind: 'drs', category: 'storage', color: '#4d7c0f', shape: 'cube', text: 'DRS', fontSize: 86, glow: true, size: 1.3, ...o }),
  ga: (o) => new TokenModel({ kind: 'ga', category: 'network', color: '#6d28d9', shape: 'disc', text: 'GA', fontSize: 96, glow: true, size: 1.6, ...o }),
  // analytics: the data lake's query engine and catalog, the warehouse, dashboards, search
  athena: (o) => new TokenModel({ kind: 'athena', category: 'analytics', color: '#a87e06', shape: 'cube', text: 'Athena', fontSize: 58, glow: true, size: 1.4, ...o }),
  glue: (o) => new TokenModel({ kind: 'glue', category: 'analytics', color: '#7d6008', shape: 'cube', text: 'Glue', fontSize: 80, glow: true, size: 1.2, ...o }),
  catalog: (o) => new TokenModel({ kind: 'catalog', category: 'analytics', color: '#6b520b', shape: 'card', text: 'Catalog', fontSize: 54, glow: true, size: 1.3, ...o }),
  lakeformation: (o) => new TokenModel({ kind: 'lakeformation', category: 'analytics', color: '#5b4a12', shape: 'card', text: 'LF', fontSize: 96, glow: true, size: 1.0, ...o }),
  table: (o) => new TableModel(o),
  board: (o) => new BoardModel(o),
  redshift: (o) => new RedshiftModel(o),
  quicksight: (o) => new DashboardModel(o),
  osdash: (o) => new DashboardModel({ kind: 'osdash', chart: 'line', title: 'Log lỗi 5xx', ...o }),
  opensearch: (o) => new TokenModel({ kind: 'opensearch', category: 'analytics', color: '#a87e06', shape: 'cube', text: 'OpenSearch', fontSize: 40, glow: true, size: 1.5, ...o }),
  // cloud basics & global infrastructure: your own server room and its racks, a Local Zone in a
  // city, a Wavelength Zone inside a 5G network (and the mast), an Outposts rack on your premises
  onprem: (o) => new ZoneModel({ kind: 'onprem', top: '#e7e5e4', side: '#a8a29e', ...o }),
  server: (o) => new RackModel(o),
  localzone: (o) => new ZoneModel({ kind: 'localzone', top: '#dbeafe', side: '#93c5fd', ...o }),
  wavelength: (o) => new ZoneModel({ kind: 'wavelength', top: '#cffafe', side: '#67e8f9', ...o }),
  tower: (o) => new TowerModel(o),
  outposts: (o) => new RackModel({ kind: 'outposts', category: 'compute', ...o }),
  // cost tools: estimate before building, the detailed billing export
  pricing: (o) => new TokenModel({ kind: 'pricing', category: 'management', color: '#1d4ed8', shape: 'cube', text: 'Calc', fontSize: 80, glow: true, size: 1.3, ...o }),
  cur: (o) => new TokenModel({ kind: 'cur', category: 'management', color: '#1e40af', shape: 'card', text: 'CUR', fontSize: 92, glow: true, size: 1.3, ...o }),
  // file storage and hybrid storage: an FSx file server, the Storage Gateway appliance, a virtual tape
  fsx: (o) => new FSxModel(o),
  storagegateway: (o) => new GatewayModel(o),
  tape: (o) => new TokenModel({ kind: 'tape', category: 'storage', color: '#3f6212', shape: 'cube', text: 'Tape', fontSize: 84, size: 0.9, ...o }),
  // purpose-built databases: document, graph, wide-column (Cassandra), durable in-memory, time series
  docdb: (o) => new TokenModel({ kind: 'docdb', category: 'database', color: '#a21caf', shape: 'cube', text: 'DocDB', fontSize: 64, glow: true, size: 1.4, ...o }),
  neptune: (o) => new GraphModel(o),
  keyspaces: (o) => new TokenModel({ kind: 'keyspaces', category: 'database', color: '#86198f', shape: 'cube', text: 'Keyspaces', fontSize: 42, glow: true, size: 1.4, ...o }),
  memorydb: (o) => new TokenModel({ kind: 'memorydb', category: 'database', color: '#c026d3', shape: 'cube', text: 'MemoryDB', fontSize: 44, glow: true, size: 1.3, ...o }),
  timestream: (o) => new TokenModel({ kind: 'timestream', category: 'database', color: '#701a75', shape: 'cube', text: 'Timestream', fontSize: 38, glow: true, size: 1.3, ...o }),
  // migration & transfer: MGN with its replication agent and staging area, DMS and schema
  // conversion, DataSync, Transfer Family (SFTP) and a Snowball device
  mgn: (o) => new TokenModel({ kind: 'mgn', category: 'migration', color: CAT_COLOR.migration, shape: 'cube', text: 'MGN', fontSize: 92, glow: true, size: 1.4, ...o }),
  agent: (o) => new TokenModel({ kind: 'agent', category: 'migration', color: '#166534', shape: 'disc', text: 'agent', fontSize: 64, glow: true, size: 0.9, ...o }),
  dsagent: (o) => new TokenModel({ kind: 'dsagent', category: 'migration', color: '#166534', shape: 'disc', text: 'agent', fontSize: 64, glow: true, size: 0.9, ...o }),
  staging: (o) => new ZoneModel({ kind: 'staging', category: 'migration', top: '#dcfce7', side: '#86efac', ...o }),
  dms: (o) => new TokenModel({ kind: 'dms', category: 'migration', color: CAT_COLOR.migration, shape: 'cube', text: 'DMS', fontSize: 96, glow: true, size: 1.4, ...o }),
  sct: (o) => new TokenModel({ kind: 'sct', category: 'migration', color: '#15803d', shape: 'card', text: 'Schema', fontSize: 56, glow: true, size: 1.3, ...o }),
  datasync: (o) => new TokenModel({ kind: 'datasync', category: 'migration', color: CAT_COLOR.migration, shape: 'cube', text: 'DataSync', fontSize: 46, glow: true, size: 1.4, ...o }),
  transfer: (o) => new TokenModel({ kind: 'transfer', category: 'migration', color: '#15803d', shape: 'cube', text: 'SFTP', fontSize: 84, glow: true, size: 1.3, ...o }),
  snowball: (o) => new TokenModel({ kind: 'snowball', category: 'migration', color: '#334155', shape: 'cube', text: 'Snowball', fontSize: 46, size: 1.3, ...o }),
  // AI services ready to call, and the parts of building your own model (SageMaker AI) or using
  // foundation models (Bedrock, Amazon Q)
  rekognition: (o) => new TokenModel({ kind: 'rekognition', category: 'ai', color: '#4338ca', shape: 'cube', text: 'Rekognition', fontSize: 34, glow: true, size: 1.4, ...o }),
  textract: (o) => new TokenModel({ kind: 'textract', category: 'ai', color: '#4f46e5', shape: 'cube', text: 'Textract', fontSize: 44, glow: true, size: 1.4, ...o }),
  transcribe: (o) => new TokenModel({ kind: 'transcribe', category: 'ai', color: '#3730a3', shape: 'cube', text: 'Transcribe', fontSize: 36, glow: true, size: 1.4, ...o }),
  comprehend: (o) => new TokenModel({ kind: 'comprehend', category: 'ai', color: '#4338ca', shape: 'cube', text: 'Comprehend', fontSize: 34, glow: true, size: 1.4, ...o }),
  translate: (o) => new TokenModel({ kind: 'translate', category: 'ai', color: '#4f46e5', shape: 'cube', text: 'Translate', fontSize: 40, glow: true, size: 1.4, ...o }),
  polly: (o) => new TokenModel({ kind: 'polly', category: 'ai', color: '#3730a3', shape: 'cube', text: 'Polly', fontSize: 64, glow: true, size: 1.4, ...o }),
  lex: (o) => new TokenModel({ kind: 'lex', category: 'ai', color: '#4338ca', shape: 'cube', text: 'Lex', fontSize: 90, glow: true, size: 1.4, ...o }),
  sagemaker: (o) => new TokenModel({ kind: 'sagemaker', category: 'ai', color: CAT_COLOR.ai, shape: 'cube', text: 'SageMaker', fontSize: 36, glow: true, size: 1.5, ...o }),
  notebook: (o) => new TokenModel({ kind: 'notebook', category: 'ai', color: '#312e81', shape: 'card', text: 'Notebook', fontSize: 50, size: 1.3, ...o }),
  mlmodel: (o) => new TokenModel({ kind: 'mlmodel', category: 'ai', color: '#6d28d9', shape: 'disc', text: 'model', fontSize: 72, glow: true, size: 1.1, ...o }),
  endpoint: (o) => new TokenModel({ kind: 'endpoint', category: 'ai', color: '#4338ca', shape: 'cube', text: 'Endpoint', fontSize: 44, glow: true, size: 1.3, ...o }),
  bedrock: (o) => new TokenModel({ kind: 'bedrock', category: 'ai', color: '#1e1b4b', shape: 'cube', text: 'Bedrock', fontSize: 48, glow: true, size: 1.5, ...o }),
  amazonq: (o) => new TokenModel({ kind: 'amazonq', category: 'ai', color: '#5b21b6', shape: 'cube', text: 'Q', fontSize: 120, glow: true, size: 1.2, ...o }),
  // your first account: the root user (the sign-up e-mail) and the MFA device that guards it
  root: (o) => {
    const m = new PersonModel({ shirt: '#f59e0b', ...o });
    m.kind = 'root';
    return m;
  },
  mfa: (o) => new TokenModel({ kind: 'mfa', category: 'security', color: '#be123c', shape: 'card', text: 'MFA', fontSize: 90, glow: true, size: 1.0, ...o }),
  // quick ways to put a website online: a Lightsail instance (a fixed monthly bundle) and Amplify Hosting
  lightsail: (o) => {
    const m = new EC2Model(o);
    m.kind = 'lightsail';
    return m;
  },
  amplify: (o) => new TokenModel({ kind: 'amplify', category: 'compute', color: '#c2410c', shape: 'cube', text: 'Amplify', fontSize: 50, glow: true, size: 1.4, ...o }),
  // e-mail to customers: Amazon SES
  ses: (o) => new TokenModel({ kind: 'ses', category: 'integration', color: CAT_COLOR.integration, shape: 'cube', text: 'SES', fontSize: 96, glow: true, size: 1.4, ...o }),
  // generative AI on Bedrock: a knowledge base over your documents, guardrails, agents
  kb: (o) => new TokenModel({ kind: 'kb', category: 'ai', color: '#3730a3', shape: 'card', text: 'KB', fontSize: 96, glow: true, size: 1.3, ...o }),
  guardrail: (o) => new TokenModel({ kind: 'guardrail', category: 'ai', color: '#be123c', shape: 'card', text: 'Guardrail', fontSize: 44, glow: true, size: 1.3, ...o }),
  agentcore: (o) => new TokenModel({ kind: 'agentcore', category: 'ai', color: '#312e81', shape: 'cube', text: 'AgentCore', fontSize: 40, glow: true, size: 1.4, ...o }),
  // finding weak spots: software flaws (Inspector), sensitive data in S3 (Macie), one place for
  // every finding and the security score (Security Hub)
  inspector: (o) => new TokenModel({ kind: 'inspector', category: 'security', color: '#b91c1c', shape: 'cube', text: 'Inspector', fontSize: 44, glow: true, size: 1.4, ...o }),
  macie: (o) => new TokenModel({ kind: 'macie', category: 'security', color: '#9f1239', shape: 'cube', text: 'Macie', fontSize: 66, glow: true, size: 1.4, ...o }),
  securityhub: (o) => new TokenModel({ kind: 'securityhub', category: 'security', color: CAT_COLOR.security, shape: 'cube', text: 'Sec Hub', fontSize: 52, glow: true, size: 1.5, ...o }),
  // parts taught inside bigger lessons: temporary credentials (STS), AWS's own incidents (Health),
  // account limits (Service Quotas), right-sizing (Compute Optimizer), a governed multi-account
  // setup (Control Tower), infrastructure in a programming language (CDK), a connection pool in
  // front of RDS (RDS Proxy), staff laptops into the VPC (Client VPN)
  sts: (o) => new TokenModel({ kind: 'sts', category: 'security', color: '#991b1b', shape: 'cube', text: 'STS', fontSize: 96, glow: true, size: 1.2, ...o }),
  health: (o) => new TokenModel({ kind: 'health', category: 'management', color: '#1d4ed8', shape: 'cube', text: 'Health', fontSize: 62, glow: true, size: 1.3, ...o }),
  quotas: (o) => new TokenModel({ kind: 'quotas', category: 'management', color: '#1e40af', shape: 'cube', text: 'Quotas', fontSize: 58, glow: true, size: 1.3, ...o }),
  optimizer: (o) => new TokenModel({ kind: 'optimizer', category: 'management', color: '#2563eb', shape: 'cube', text: 'Optimizer', fontSize: 42, glow: true, size: 1.3, ...o }),
  controltower: (o) => new TokenModel({ kind: 'controltower', category: 'management', color: '#1e3a8a', shape: 'cube', text: 'Tower', fontSize: 66, glow: true, size: 1.4, ...o }),
  cdk: (o) => new TokenModel({ kind: 'cdk', category: 'devtools', color: CAT_COLOR.devtools, shape: 'card', text: 'CDK', fontSize: 96, glow: true, size: 1.4, ...o }),
  rdsproxy: (o) => new TokenModel({ kind: 'rdsproxy', category: 'database', color: '#a21caf', shape: 'cube', text: 'Proxy', fontSize: 70, glow: true, size: 1.2, ...o }),
  clientvpn: (o) => new TokenModel({ kind: 'clientvpn', category: 'network', color: '#6d28d9', shape: 'cube', text: 'Client VPN', fontSize: 36, glow: true, size: 1.3, ...o }),
  // filtering whole VPCs: the Network Firewall endpoint in its own subnet, Firewall Manager rolling
  // rules out to every account, the DNS Firewall on Route 53 Resolver
  netfw: (o) => new TokenModel({ kind: 'netfw', category: 'security', color: '#b91c1c', shape: 'cube', text: 'Firewall', fontSize: 46, glow: true, size: 1.4, ...o }),
  fms: (o) => new TokenModel({ kind: 'fms', category: 'security', color: '#9f1239', shape: 'cube', text: 'FW Mgr', fontSize: 56, glow: true, size: 1.4, ...o }),
  dnsfw: (o) => new TokenModel({ kind: 'dnsfw', category: 'network', color: '#be123c', shape: 'card', text: 'DNS FW', fontSize: 52, glow: true, size: 1.2, ...o }),
  // parts taught inside bigger lessons (package B): a message broker (Amazon MQ), GraphQL (AppSync),
  // investigating a finding (Detective), a dedicated HSM, Active Directory, sharing resources
  // across accounts (RAM), approved products (Service Catalog), Grafana and Prometheus, feature
  // flags (AppConfig), serverless templates (SAM), a package repository (CodeArtifact), path
  // checks (Reachability Analyzer), hybrid DNS (Resolver), golden AMIs (Image Builder), batch jobs,
  // Spark clusters (EMR), Kafka (MSK)
  mq: (o) => new TokenModel({ kind: 'mq', category: 'integration', color: '#be185d', shape: 'cube', text: 'MQ', fontSize: 100, glow: true, size: 1.3, ...o }),
  appsync: (o) => new TokenModel({ kind: 'appsync', category: 'integration', color: '#db2777', shape: 'cube', text: 'AppSync', fontSize: 44, glow: true, size: 1.4, ...o }),
  detective: (o) => new TokenModel({ kind: 'detective', category: 'security', color: '#7f1d1d', shape: 'cube', text: 'Detective', fontSize: 40, glow: true, size: 1.4, ...o }),
  cloudhsm: (o) => new TokenModel({ kind: 'cloudhsm', category: 'security', color: '#881337', shape: 'cube', text: 'HSM', fontSize: 92, glow: true, size: 1.3, ...o }),
  directory: (o) => new TokenModel({ kind: 'directory', category: 'security', color: '#9f1239', shape: 'cube', text: 'AD', fontSize: 104, glow: true, size: 1.3, ...o }),
  ram: (o) => new TokenModel({ kind: 'ram', category: 'management', color: '#1d4ed8', shape: 'card', text: 'RAM', fontSize: 92, glow: true, size: 1.2, ...o }),
  servicecatalog: (o) => new TokenModel({ kind: 'servicecatalog', category: 'management', color: '#1e40af', shape: 'cube', text: 'Catalog', fontSize: 52, glow: true, size: 1.4, ...o }),
  grafana: (o) => new DashboardModel({ kind: 'grafana', category: 'management', chart: 'line', title: 'Grafana · p99', ...o }),
  prometheus: (o) => new TokenModel({ kind: 'prometheus', category: 'management', color: '#c2410c', shape: 'cube', text: 'Prometheus', fontSize: 34, glow: true, size: 1.4, ...o }),
  appconfig: (o) => new TokenModel({ kind: 'appconfig', category: 'management', color: '#1d4ed8', shape: 'card', text: 'AppConfig', fontSize: 42, glow: true, size: 1.4, ...o }),
  sam: (o) => new TokenModel({ kind: 'sam', category: 'compute', color: '#c2410c', shape: 'card', text: 'SAM', fontSize: 96, glow: true, size: 1.4, ...o }),
  codeartifact: (o) => new TokenModel({ kind: 'codeartifact', category: 'devtools', color: '#0f766e', shape: 'cube', text: 'Artifact', fontSize: 46, glow: true, size: 1.3, ...o }),
  reachability: (o) => new TokenModel({ kind: 'reachability', category: 'network', color: '#7c3aed', shape: 'cube', text: 'Analyzer', fontSize: 44, glow: true, size: 1.3, ...o }),
  resolver: (o) => new TokenModel({ kind: 'resolver', category: 'network', color: '#6d28d9', shape: 'cube', text: 'Resolver', fontSize: 44, glow: true, size: 1.2, ...o }),
  imagebuilder: (o) => new TokenModel({ kind: 'imagebuilder', category: 'compute', color: '#c2410c', shape: 'cube', text: 'Builder', fontSize: 52, glow: true, size: 1.3, ...o }),
  batch: (o) => new TokenModel({ kind: 'batch', category: 'compute', color: '#ea580c', shape: 'cube', text: 'Batch', fontSize: 68, glow: true, size: 1.4, ...o }),
  emr: (o) => new TokenModel({ kind: 'emr', category: 'analytics', color: '#8f6d07', shape: 'cube', text: 'EMR', fontSize: 92, glow: true, size: 1.4, ...o }),
  msk: (o) => new TokenModel({ kind: 'msk', category: 'analytics', color: '#a87e06', shape: 'cube', text: 'MSK', fontSize: 92, glow: true, size: 1.4, ...o }),
  // package C: a cache in front of DynamoDB (DAX), the IPv6 way out of a private subnet
  // (egress-only Internet Gateway), and the services the CLF exam only asks you to recognise: a
  // cloud contact centre, desktops and apps streamed from AWS, IoT devices, license tracking
  dax: (o) => new TokenModel({ kind: 'dax', category: 'database', color: '#a21caf', shape: 'disc', text: 'DAX', fontSize: 96, glow: true, size: 1.3, bob: 0.03, ...o }),
  eigw: (o) => new GateModel({ kind: 'eigw', category: 'network', color: '#0d9488', dark: '#134e4a', scale: 0.85, ...o }),
  connect: (o) => new TokenModel({ kind: 'connect', category: 'integration', color: '#be185d', shape: 'cube', text: 'Connect', fontSize: 50, glow: true, size: 1.4, ...o }),
  workspaces: (o) => new TokenModel({ kind: 'workspaces', category: 'compute', color: '#0369a1', shape: 'cube', text: 'WorkSpaces', fontSize: 36, glow: true, size: 1.4, ...o }),
  appstream: (o) => new TokenModel({ kind: 'appstream', category: 'compute', color: '#0e7490', shape: 'cube', text: 'AppStream', fontSize: 38, glow: true, size: 1.4, ...o }),
  iotcore: (o) => new TokenModel({ kind: 'iotcore', category: 'integration', color: '#15803d', shape: 'cube', text: 'IoT Core', fontSize: 46, glow: true, size: 1.4, ...o }),
  licensemanager: (o) => new TokenModel({ kind: 'licensemanager', category: 'management', color: '#1e40af', shape: 'cube', text: 'License', fontSize: 50, glow: true, size: 1.4, ...o }),
};

// flat platforms (AZ, Region, data centres…): zone-style labels, no hover glow, smoke when destroyed
export const PLATFORM_KINDS = new Set(['az', 'zone', 'onprem', 'localzone', 'wavelength', 'staging']);

export function createModel(kind, opts = {}) {
  const make = FACTORY[kind];
  if (!make) throw new Error(`unknown model kind: ${kind}`);
  return make(opts);
}

export const MODEL_KINDS = Object.keys(FACTORY);
