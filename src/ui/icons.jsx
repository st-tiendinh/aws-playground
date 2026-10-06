// Inline SVG icons (stroke style, 24×24). ServiceIcon draws a service glyph on a tile
// coloured by the service category.
import { CATEGORIES, serviceById } from '../data/services.js';

const GLYPH = {
  foundation: (
    <>
      <circle cx="12" cy="12" r="8" />
      <ellipse cx="12" cy="12" rx="3.5" ry="8" />
      <path d="M4 12h16M5.5 8h13M5.5 16h13" />
    </>
  ),
  shared: (
    <>
      <rect x="4" y="3.5" width="16" height="4" rx="1.2" />
      <rect x="4" y="9" width="16" height="4" rx="1.2" />
      <path d="M2.5 15.5h19" strokeDasharray="2 2" />
      <rect x="4" y="17.5" width="16" height="3.5" rx="1.2" fill="currentColor" />
    </>
  ),
  ec2: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M8 8h5M8 12h5M8 16h5" />
      <circle cx="16" cy="8" r="0.8" fill="currentColor" />
      <circle cx="16" cy="12" r="0.8" fill="currentColor" />
      <circle cx="16" cy="16" r="0.8" fill="currentColor" />
    </>
  ),
  s3: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="2.5" />
      <path d="M4.5 6l1.8 12.2c.2 1.3 2.7 2.3 5.7 2.3s5.5-1 5.7-2.3L19.5 6" />
      <path d="M5.5 11c1.5.9 3.9 1.4 6.5 1.4s5-.5 6.5-1.4" />
    </>
  ),
  ebs: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M3 11h18M6.5 14.5h6" />
      <circle cx="17" cy="14.5" r="1" fill="currentColor" />
    </>
  ),
  efs: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="8.5" cy="13" r="1.3" fill="currentColor" />
      <circle cx="15.5" cy="13" r="1.3" fill="currentColor" />
      <path d="M9.8 13h4.4" />
    </>
  ),
  backup: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4 3.5v3.7h3.7" />
      <path d="M12 8v4.2l3 1.8" />
    </>
  ),
  elb: (
    <>
      <circle cx="12" cy="12" r="2.6" />
      <path d="M3 12h6.4M14.4 11l5.6-5M14.6 12H21M14.4 13l5.6 5" />
      <path d="M18 5h2.2v2.2M18.8 19h1.4v-1.4" />
    </>
  ),
  asg: (
    <>
      <rect x="3.5" y="9" width="6" height="6" rx="1" />
      <rect x="14.5" y="9" width="6" height="6" rx="1" strokeDasharray="2 1.6" />
      <path d="M10.5 12h3M12 3.5v3M10.5 5h3M12 17.5v3" />
    </>
  ),
  rds: (
    <>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13" />
      <path d="M5 10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5M5 14.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </>
  ),
  aurora: (
    <>
      <ellipse cx="10" cy="6" rx="6.5" ry="2.4" />
      <path d="M3.5 6v11.6c0 1.3 2.9 2.4 6.5 2.4s6.5-1.1 6.5-2.4V6" />
      <path d="M3.5 11.8c0 1.3 2.9 2.4 6.5 2.4s6.5-1.1 6.5-2.4" />
      <path d="M19.5 2.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor" stroke="none" />
    </>
  ),
  dynamodb: (
    <>
      <ellipse cx="11" cy="5.5" rx="6.5" ry="2.4" />
      <path d="M4.5 5.5v12.5c0 1.3 2.9 2.4 6.5 2.4M17.5 5.5V10" />
      <path d="M4.5 10.5c0 1.3 2.9 2.4 6.5 2.4M4.5 15c0 1.3 2.9 2.4 6.5 2.4" />
      <path d="M17.5 12.5l-3 4.5h3.5l-1.5 4.5 4-6h-3.5l1.5-3z" />
    </>
  ),
  lambda: <path d="M7 4h3.2l7.8 16h-3.4l-3-6.6L8 20H4.6l5.6-10.2L8.9 7H7z" />,
  ecs: (
    <>
      <rect x="2.5" y="12.5" width="8.5" height="7" rx="1" />
      <rect x="13" y="12.5" width="8.5" height="7" rx="1" />
      <rect x="7.75" y="4.5" width="8.5" height="7" rx="1" />
      <path d="M5.3 15v2M8.2 15v2M15.8 15v2M18.7 15v2M10.5 7v2M13.5 7v2" />
    </>
  ),
  elasticache: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M13 7L8.5 13.2H12l-.8 3.8 4.3-6.2H12z" fill="currentColor" stroke="none" />
    </>
  ),
  apigw: (
    <>
      <path d="M4 20V8.5L12 4l8 4.5V20" />
      <path d="M8.5 20v-6.5a3.5 3.5 0 0 1 7 0V20" />
      <path d="M3 20h18" />
    </>
  ),
  cloudfront: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M4.5 12h15M12 4.5c2.2 2 3.2 4.6 3.2 7.5s-1 5.5-3.2 7.5c-2.2-2-3.2-4.6-3.2-7.5s1-5.5 3.2-7.5z" />
      <circle cx="19.5" cy="5" r="1.6" fill="currentColor" />
      <circle cx="4.5" cy="19" r="1.6" fill="currentColor" />
    </>
  ),
  route53: (
    <>
      <path d="M12 3v18M8 21h8" />
      <path d="M12 5h6.5l2 2-2 2H12zM12 11H5.5l-2 2 2 2H12z" />
    </>
  ),
  vpc: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" strokeDasharray="3 2" />
      <rect x="6.5" y="8" width="4.5" height="8" rx="1" />
      <rect x="13" y="8" width="4.5" height="8" rx="1" />
    </>
  ),
  sg: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19" />
    </>
  ),
  nat: (
    <>
      <rect x="3" y="5.5" width="9" height="13" rx="2" />
      <path d="M8 12h12.5M16.5 8l4 4-4 4" />
      <circle cx="6.5" cy="12" r="1.1" fill="currentColor" />
    </>
  ),
  vpce: (
    <>
      <rect x="2.5" y="6" width="8.5" height="12" rx="2" strokeDasharray="2.5 1.8" />
      <circle cx="18" cy="12" r="3.5" />
      <path d="M7.5 12h7" />
      <circle cx="7.5" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  iam: (
    <>
      <path d="M12 3l7 3v5.5c0 4.3-3 7.8-7 9.5-4-1.7-7-5.2-7-9.5V6z" />
      <circle cx="12" cy="10.5" r="1.8" />
      <path d="M12 12.3v3.4" />
    </>
  ),
  cognito: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <circle cx="8.5" cy="10.5" r="2.2" />
      <path d="M5 16c.6-1.6 1.9-2.5 3.5-2.5s2.9.9 3.5 2.5M14.5 9.5h4M14.5 13h3" />
    </>
  ),
  kms: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <circle cx="8.5" cy="12" r="2.5" />
      <path d="M11 12h7M16 12v2.2M18 12v1.6" />
    </>
  ),
  secrets: (
    <>
      <circle cx="8" cy="15.5" r="4" />
      <circle cx="8" cy="15.5" r="1.2" />
      <path d="M10.9 12.6L20 3.5M16.5 7l2.5 2.5M14 9.5l2 2" />
    </>
  ),
  acm: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M6.5 8.5h7M6.5 11.5h5" />
      <circle cx="16.5" cy="13" r="2.4" />
      <path d="M15.2 15.2l-.9 4.3 2.2-1.2 2.2 1.2-.9-4.3" />
    </>
  ),
  waf: (
    <>
      <path d="M12 3l7 3v5.5c0 4.3-3 7.8-7 9.5-4-1.7-7-5.2-7-9.5V6z" />
      <path d="M9 12.5l2 2 4-4.2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5.5c0 4.3-3 7.8-7 9.5-4-1.7-7-5.2-7-9.5V6z" />
      <path d="M9.3 11.2l-1.8 1 4.5 2.6 4.5-7-1.7-1-3.3 5.1z" fill="currentColor" stroke="none" />
    </>
  ),
  cloudwatch: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M6 13l3.5-3.5 3 2.5L17.5 7" />
      <path d="M9 21h6M12 17v4" />
    </>
  ),
  cloudtrail: (
    <>
      <path d="M4 6h11M4 10h7M4 14h4.5" />
      <circle cx="15" cy="15" r="3.8" />
      <path d="M17.8 17.8l3 3" />
    </>
  ),
  cloudformation: (
    <>
      <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" />
      <path d="M3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" />
    </>
  ),
  ssm: (
    <>
      <rect x="2.5" y="4" width="19" height="15" rx="2" />
      <path d="M6 9l3 2.5L6 14M11 14.5h5" />
    </>
  ),
  budgets: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.8 9.3c-.5-1-1.6-1.6-2.8-1.6-1.6 0-2.8.9-2.8 2.1 0 2.9 5.9 1.6 5.9 4.5 0 1.2-1.3 2.1-3 2.1-1.4 0-2.6-.6-3.1-1.7M12 6v1.7M12 16.4V18" />
    </>
  ),
  organizations: (
    <>
      <rect x="9" y="2.5" width="6" height="5" rx="1" fill="currentColor" />
      <rect x="2.5" y="16.5" width="5.5" height="5" rx="1" />
      <rect x="9.25" y="16.5" width="5.5" height="5" rx="1" />
      <rect x="16" y="16.5" width="5.5" height="5" rx="1" />
      <path d="M12 7.5v9M5.25 16.5V12h13.5v4.5" />
    </>
  ),
  sqs: (
    <>
      <rect x="2.5" y="8" width="5" height="8" rx="1" />
      <rect x="9.5" y="8" width="5" height="8" rx="1" />
      <path d="M16.5 12h5M19 9.5l2.5 2.5-2.5 2.5" />
    </>
  ),
  sns: (
    <>
      <path d="M3.5 10h3l8-4.5v13l-8-4.5h-3z" />
      <path d="M7 14.5l1 4.5h2.2l-.8-3.5" />
      <path d="M17.5 9.5a3.5 3.5 0 0 1 0 5M19.8 7a7 7 0 0 1 0 10" />
    </>
  ),
  eventbridge: (
    <>
      <circle cx="5.5" cy="12" r="2.5" />
      <path d="M8 12h4M12 12l4.2-5.6M12 12h5.5M12 12l4.2 5.6" />
      <circle cx="18" cy="5.4" r="1.7" />
      <circle cx="19.3" cy="12" r="1.7" />
      <circle cx="18" cy="18.6" r="1.7" />
    </>
  ),
  stepfunctions: (
    <>
      <rect x="8" y="2.5" width="8" height="5" rx="1.2" />
      <rect x="2.5" y="16.5" width="8" height="5" rx="1.2" />
      <rect x="13.5" y="16.5" width="8" height="5" rx="1.2" />
      <path d="M12 7.5V12M6.5 16.5V12h11v4.5" />
    </>
  ),
  kinesis: (
    <>
      <path d="M2.5 7c2.4-1.9 4.6 1.9 7 0s4.6 1.9 7 0 3.4-1.4 5-.8" />
      <path d="M2.5 12c2.4-1.9 4.6 1.9 7 0s4.6 1.9 7 0 3.4-1.4 5-.8" />
      <path d="M2.5 17c2.4-1.9 4.6 1.9 7 0s4.6 1.9 7 0 3.4-1.4 5-.8" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5" />
      <circle cx="16.5" cy="9" r="2.4" />
      <path d="M15.5 14.2c2.3.2 4.2 1.9 4.8 4.8" />
    </>
  ),
};

export function Glyph({ name, size = 18, stroke = 1.8 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPH[name] || GLYPH.foundation}
    </svg>
  );
}

const KIND_TO_SERVICE = { edge: 'cloudfront', az: 'foundation', zone: 'foundation', globe: 'foundation', region: 'foundation', igw: 'vpc', subnet: 'vpc', vpc: 'vpc' };
const SPECIAL = { users: ['#0ea5e9', 'users'], user: ['#0ea5e9', 'users'], external: ['#0891b2', 'foundation'] };

export function ServiceIcon({ id, size = 34, glyph }) {
  const sid = KIND_TO_SERVICE[id] || id;
  const svc = serviceById(sid);
  const color = SPECIAL[id]?.[0] || (svc ? CATEGORIES[svc.category].color : '#64748b');
  const g = glyph || SPECIAL[id]?.[1] || (GLYPH[sid] ? sid : 'foundation');
  return (
    <span className="svc-icon" style={{ '--c': color, width: size, height: size }}>
      <Glyph name={g} size={Math.round(size * 0.58)} />
    </span>
  );
}

const UI = {
  quake: <path d="M2 13h4l2-5 3 10 3-8 2 4 2-2h4" />,
  fire: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.6-5.4 3.6-8.3.3 2 1.6 3.2 2.6 3.6-.2-2.9 1-5.5 3.3-7.1-.3 3 1.3 5.1 2.6 6.7 1 1.3 1.9 2.9 1.9 5.1 0 3.6-2.6 6.2-7.5 6.2z" />,
  crowd: (
    <>
      <circle cx="7" cy="8" r="2.4" />
      <circle cx="17" cy="8" r="2.4" />
      <circle cx="12" cy="6" r="2.6" />
      <path d="M2.5 18c.4-2.6 2.2-4.3 4.5-4.3M21.5 18c-.4-2.6-2.2-4.3-4.5-4.3M7 20c.5-3.2 2.5-5.3 5-5.3s4.5 2.1 5 5.3" />
    </>
  ),
  dbx: (
    <>
      <ellipse cx="10" cy="5.5" rx="6.5" ry="2.4" />
      <path d="M3.5 5.5v12.5c0 1.3 2.9 2.4 6.5 2.4M16.5 5.5v5M3.5 11.5c0 1.3 2.9 2.4 6.5 2.4" />
      <path d="M15 15l5 5M20 15l-5 5" />
    </>
  ),
  ddos: (
    <>
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5M5.4 5.4l3.2 3.2M15.4 15.4l3.2 3.2M18.6 5.4l-3.2 3.2M8.6 15.4l-3.2 3.2" />
    </>
  ),
  sqli: (
    <>
      <ellipse cx="12" cy="13" rx="5" ry="6" />
      <path d="M12 7V4M9.2 5.2L7.5 3M14.8 5.2L16.5 3M5 11H2M22 11h-3M5 16H2.5M21.5 16H19M7.2 18.5L4.5 21M16.8 18.5l2.7 2.5" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="16" height="11" rx="2" />
      <path d="M2.5 9h16M6 12.8h4" />
      <path d="M16 15.5l5 5M21 15.5l-5 5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 13.5h10l1-13.5" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  wrench: <path d="M14.5 6.5a4 4 0 0 1 5.3-3.8l-2.6 2.6.6 2.4 2.4.6 2.6-2.6a4 4 0 0 1-5.3 5.3L9 19.5a2 2 0 0 1-2.8-2.8l8.5-8.5a4 4 0 0 1-.2-1.7z" />,
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" />,
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </>
  ),
  next: <path d="M6 5l9 7-9 7zM18 5v14" />,
  prev: <path d="M18 5l-9 7 9 7zM6 5v14" />,
  replay: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4.5h4.5" />
    </>
  ),
  soundOn: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  soundOff: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 11.5V4.5a1 1 0 0 1 1-1h7l9 9-8 8z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  sparkles: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.1-2.5 3.6M12 17.2v.1" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: (
    <>
      <path d="M12 3.5l9.5 16.5h-19z" />
      <path d="M12 10v4.5M12 17.4v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.1" />
    </>
  ),
  x: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  ok: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.8 2.8L16.5 9.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6M10 3v6.5L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9.5V3" />
      <path d="M7 15h10" />
    </>
  ),
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronUp: <path d="M6 15l6-6 6 6" />,
  bolt: <path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" />,
  trace: (
    <>
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="6" r="2" />
      <path d="M7 18h5a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3" strokeDasharray="2 2" />
    </>
  ),
};

export function Icon({ name, size = 18, stroke = 1.9, className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {UI[name]}
    </svg>
  );
}
