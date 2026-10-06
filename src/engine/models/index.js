// Model factory: kind string → 3D model instance.
import { CAT_COLOR } from '../palette.js';
import {
  CloudWatchModel,
  ExternalModel,
  GlobeModel,
  IAMModel,
  OutlineModel,
  PersonModel,
  RegionModel,
  SQSModel,
  TileModel,
  TokenModel,
  UsersModel,
  ZoneModel,
} from './misc.js';
import {
  CloudFrontModel,
  DynamoDBModel,
  EC2Model,
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
  cloudwatch: (o) => new CloudWatchModel(o),
  sqs: (o) => new SQSModel(o),
  iam: (o) => new IAMModel(o),
};

export function createModel(kind, opts = {}) {
  const make = FACTORY[kind];
  if (!make) throw new Error(`unknown model kind: ${kind}`);
  return make(opts);
}

export const MODEL_KINDS = Object.keys(FACTORY);
