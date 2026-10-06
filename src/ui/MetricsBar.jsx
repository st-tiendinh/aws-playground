// Sandbox, top dock: website status, live metrics and a small chart of the last minute —
// the kind of numbers CloudWatch would show you.
import { useSim } from '../state/store.js';
import { STATUS, fmtMoney, fmtMs, fmtPct, fmtRps, fmtUsers } from './format.js';

const COST_NAMES = { ec2: 'EC2', elb: 'Load Balancer', rds: 'RDS', dynamodb: 'DynamoDB', lambda: 'Lambda', apigw: 'API Gateway', s3: 'S3', cloudfront: 'CloudFront', route53: 'Route 53', nat: 'NAT Gateway' };

export function Spark({ history, width = 168, height = 40 }) {
  const W = width;
  const H = height;
  if (history.length < 2) return <svg className="spark" width={W} height={H} />;
  const n = history.length;
  const x = (i) => (i / (n - 1)) * W;
  const sy = (v) => 3 + (1 - Math.max(0, Math.min(1, v))) * (H - 6);
  const maxLat = Math.max(300, ...history.map((h) => h.latency || 0));
  const ly = (v) => 3 + (1 - Math.min(1, (v ?? maxLat) / maxLat)) * (H - 6);
  const succ = history.map((h, i) => `${x(i).toFixed(1)},${sy(h.success).toFixed(1)}`).join(' ');
  const lat = history.map((h, i) => `${x(i).toFixed(1)},${ly(h.latency).toFixed(1)}`).join(' ');
  const area = `0,${H} ${succ} ${W},${H}`;
  const last = history[n - 1].success;
  const col = last > 0.97 ? '#4ade80' : last > 0.4 ? '#fbbf24' : '#f87171';
  return (
    <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Biểu đồ tỉ lệ thành công và độ trễ trong 60 giây gần nhất">
      <polygon points={area} fill={col} opacity="0.14" />
      <polyline points={lat} fill="none" stroke="#93c5fd" strokeWidth="1.4" strokeDasharray="3 2" opacity="0.9" />
      <polyline points={succ} fill="none" stroke={col} strokeWidth="2" />
    </svg>
  );
}

export function MetricsBar() {
  const snap = useSim((s) => s.snap);
  const config = useSim((s) => s.config);
  if (!snap) return null;
  const st = STATUS[snap.status];
  const ec2 = config.compute === 'ec2';
  const ins = snap.instances;
  const costTip = Object.entries(snap.costBreakdown)
    .filter(([, v]) => v > 0.00005)
    .map(([k, v]) => `${COST_NAMES[k]}: ${fmtMoney(v)}/giờ`)
    .join('\n');

  return (
    <div className="metrics">
      <div className={`status status-${st.cls}`}>
        <span className="status-dot" />
        <div>
          <small>Website</small>
          <b>{st.text}</b>
        </div>
      </div>
      <div className="stat">
        <small>Người dùng</small>
        <b>{fmtUsers(snap.users)}</b>
      </div>
      <div className="stat">
        <small>Request/giây</small>
        <b>{fmtRps(snap.rps)}</b>
      </div>
      <div className={`stat ${snap.success < 0.97 ? 'is-bad' : snap.success < 0.995 ? 'is-warn' : ''}`}>
        <small>Thành công</small>
        <b>{fmtPct(snap.success)}</b>
      </div>
      <div className={`stat ${snap.timeout ? 'is-bad' : snap.latency > 300 ? 'is-warn' : ''}`}>
        <small>Độ trễ TB</small>
        <b>{snap.timeout ? 'timeout' : fmtMs(snap.latency)}</b>
      </div>
      <div className={`stat ${ec2 && ins.failed ? 'is-bad' : ''}`}>
        <small>{ec2 ? 'EC2 chạy / tổng' : 'Lambda song song'}</small>
        <b>
          {ec2 ? (
            <>
              {ins.running}/{ins.total}
              {ins.pending > 0 && <em className="pending"> +{ins.pending}</em>}
            </>
          ) : (
            `${Math.ceil(snap.lambda.conc - 0.05)}/${snap.lambda.limit}`
          )}
        </b>
      </div>
      <div className="stat" title={costTip + '\n(ước tính minh hoạ, chưa gồm phí truyền dữ liệu)'}>
        <small>Chi phí ≈</small>
        <b>
          {fmtMoney(snap.cost)}
          <em>/giờ</em>
        </b>
      </div>
    </div>
  );
}
