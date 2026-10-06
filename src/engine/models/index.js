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
  KMSModel,
  OutlineModel,
  PersonModel,
  RegionModel,
  ResponsibilityModel,
  SQSModel,
  StepFunctionsModel,
  TileModel,
  TokenModel,
  UsersModel,
  ZoneModel,
} from './misc.js';
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
};

export function createModel(kind, opts = {}) {
  const make = FACTORY[kind];
  if (!make) throw new Error(`unknown model kind: ${kind}`);
  return make(opts);
}

export const MODEL_KINDS = Object.keys(FACTORY);
