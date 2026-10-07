// Card for the 3D object the user clicked: what it is and, in the sandbox, its live state.
import { CATEGORIES, LESSON_FOR, OBJECT_INFO, serviceById, serviceForModel } from '../data/services.js';
import { AZ_CODE, AZ_LABEL } from '../sim/constants.js';
import { useApp, useSim, useUi } from '../state/store.js';
import { fmtPct, fmtUsers, STATUS } from './format.js';
import { Icon, ServiceIcon } from './icons.jsx';

const KIND_SERVICE = { asg: 'asg', vpc: 'vpc', igw: 'vpc', edge: 'cloudfront', az: 'foundation', zone: 'foundation', globe: 'foundation' };
const STATE_TEXT = { running: 'Đang chạy', pending: 'Đang khởi động', failed: 'Hỏng', terminating: 'Đang tắt' };
const DB_STATE = { ok: 'Hoạt động', creating: 'Đang tạo / khôi phục', promoting: 'Đang failover', failed: 'Hỏng' };

function live(p, snap, config) {
  if (!snap || p.mode !== 'sandbox') return null;
  const rows = [];
  if (p.key === 'worker') {
    rows.push(['Đang xử lý', `${Math.round(snap.queue?.outRate || 0)} đơn/giây`], ['Đối tác thanh toán', snap.extDown ? 'đang sập — chờ thử lại' : 'hoạt động']);
  } else if (p.key === 'canary' || p.key === 'lambdaV2') {
    // the new release while it is being canary-tested
    rows.push(['Phiên bản', 'v2 (đang thử canary)'], ['Nhận traffic', fmtPct(snap.deploy.share)], ['Kết quả', snap.deploy.phase === 'rollback' ? 'alarm 5xx → đang rollback' : 'request động trả lỗi 500']);
  } else if (p.kind === 'sqs' && snap.queue) {
    rows.push(['Tin đang chờ', Math.round(snap.queue.depth).toLocaleString('vi-VN')], ['Vào hàng đợi', `${Math.round(snap.queue.inRate)} /giây`], ['Worker xử lý', `${Math.round(snap.queue.outRate)} /giây`]);
  } else if (p.kind === 'vpce') {
    rows.push(['Traffic S3 qua endpoint', `${Math.round(snap.s3App.viaEndpoint)} /giây`], ['Phí', config.queue ? 'S3 miễn phí · SQS theo giờ + GB' : 'miễn phí (Gateway Endpoint)']);
  } else if (p.kind === 'backup') {
    rows.push(['Lịch sao lưu', 'hằng ngày + liên tục (PITR)'], ['Trạng thái', snap.data.restoring ? `đang khôi phục (còn ${Math.ceil(snap.data.remaining)} giây)` : 'sẵn sàng khôi phục']);
  } else if (p.kind === 'ec2' && p.instId) {
    const i = snap.fleet.find((x) => x.id === p.instId);
    if (!i) return null;
    rows.push(['Instance ID', i.id], ['Vị trí', `${AZ_LABEL[i.az]} (${AZ_CODE[i.az]})`], ['Trạng thái', STATE_TEXT[i.state] || i.state]);
    if (i.state === 'running') rows.push(['CPU', `${Math.round(i.cpu * 100)}%${i.cpu > 1 ? ' — quá tải!' : ''}`]);
    if (config.elb) rows.push(['Nhận traffic từ ELB', i.registered ? 'Có' : 'Không']);
    rows.push(['Do ai quản lý', config.asg ? 'Auto Scaling' : 'Bạn (thủ công)']);
  } else if (p.kind === 'rds' && p.dbId) {
    const n = snap.db.find((x) => x.id === p.dbId);
    if (!n) return null;
    rows.push(['Vai trò', n.role === 'primary' ? 'Primary (đọc/ghi)' : 'Standby (dự phòng)'], ['Vị trí', AZ_LABEL[n.az]], ['Trạng thái', DB_STATE[n.state] || n.state]);
    if (n.role === 'primary' && n.state === 'ok') rows.push(['Tải', fmtPct(n.load)]);
  } else if (p.kind === 'az' && p.azId) {
    const ok = snap.az[p.azId] === 'ok';
    rows.push(['Mã AZ', AZ_CODE[p.azId]], ['Tình trạng', ok ? 'Hoạt động' : 'Mất kết nối (sự cố)']);
    rows.push(['EC2 trong AZ', String(snap.fleet.filter((i) => i.az === p.azId).length)]);
  } else if (p.kind === 'users') {
    rows.push(['Đang online', fmtUsers(snap.users)], ['Website', STATUS[snap.status].text], ['Request thành công', fmtPct(snap.success)]);
  } else if (p.kind === 'lambda') {
    rows.push(['Bản chạy song song', `${Math.round(snap.lambda.conc)} / ${snap.lambda.limit}`]);
  } else if (p.kind === 'cloudfront') {
    rows.push(['Tỉ lệ cache hit (file tĩnh)', fmtPct(snap.cfHit)]);
  } else if (p.kind === 'nat' && p.natId) {
    const n = snap.nat.find((x) => x.id === p.natId);
    if (!n) return null;
    if (n.regional) {
      // one Regional NAT Gateway for the VPC: this is its presence in one AZ
      const via = snap.nat.find((x) => x !== n && x.state === 'ok');
      rows.push(['Loại', 'Regional · một NAT cho cả VPC'], ['Phần ở', `${AZ_LABEL[n.az]} · không cần public subnet`]);
      rows.push(['Tình trạng', n.state === 'ok' ? 'Hoạt động' : n.state === 'expanding' ? `Đang mở rộng sang AZ này (còn ${Math.ceil(n.remaining)} giây)` : 'Hỏng (AZ sự cố)']);
      rows.push(['Phục vụ', n.state !== 'expanding' ? `EC2 ở ${AZ_LABEL[n.az]}` : via ? `chưa — EC2 ở ${AZ_LABEL[n.az]} tạm đi qua ${AZ_LABEL[via.az]}` : `chưa — EC2 ở ${AZ_LABEL[n.az]} chưa ra Internet được`]);
      rows.push(['Tính phí', 'theo giờ cho mỗi AZ có mặt + theo GB']);
    } else {
      rows.push(['Vị trí', `public subnet · ${AZ_LABEL[n.az]}`], ['Tình trạng', n.state === 'ok' ? 'Hoạt động' : 'Hỏng (AZ sự cố)']);
      rows.push(['Phục vụ', config.nat === 'single' ? 'EC2 ở cả 2 AZ' : `EC2 ở ${AZ_LABEL[n.az]}`]);
    }
    if (snap.s3App.viaNat > 0.01) rows.push(['Traffic S3 qua NAT', `${Math.round(snap.s3App.viaNat)} /giây · tính phí theo GB`]);
  } else if (p.kind === 'external') {
    if (snap.extDown) rows.push(['Tình trạng', 'Đang sập — không phản hồi']);
    rows.push(['Lời gọi ra ngoài', `${Math.round(snap.outbound.rps)} /giây`]);
    if (snap.outbound.failing > 0.01) rows.push(['Không tới được', `${Math.round(snap.outbound.failing)} /giây`]);
  } else if (p.kind === 'budgets' && snap.budget) {
    const { amount, forecast } = snap.budget;
    rows.push(['Ngân sách', `$${amount.toLocaleString('vi-VN')}/tháng`], ['Chi phí dự báo', `$${Math.round(forecast).toLocaleString('vi-VN')}/tháng (${Math.round((forecast / amount) * 100)}%)`], ['Ngưỡng cảnh báo', '80% và 100%']);
  } else if (p.kind === 'asg') {
    rows.push(['Tối thiểu / tối đa', `${config.asgMin} / ${config.asgMax}`], ['Mong muốn (desired)', String(snap.asgDesired)], ['CPU trung bình', fmtPct(snap.instances.avgCpu)]);
  }
  return rows.length ? rows : null;
}

export function PickCard() {
  const { engine, ui } = useApp();
  const p = useUi((s) => s.picked);
  const snap = useSim((s) => s.snap);
  const config = useSim((s) => s.config);
  if (!p) return null;
  // a part explained inside a bigger lesson (NAT Gateway, Security Group… → the VPC lesson):
  // its own name and blurb, and the button opens that lesson at the matching step
  const link = LESSON_FOR[p.kind];
  const svc = serviceById(link?.[0] || KIND_SERVICE[p.kind]) || serviceForModel(p.kind);
  const info = OBJECT_INFO[p.kind];
  const part = link && info;
  const rows = live(p, snap, config);
  const title = part ? info.title : p.kind === 'az' || p.kind === 'zone' || p.kind === 'users' || p.kind === 'user' || p.kind === 'token' ? p.title || info?.title : svc?.name || p.title;
  const desc = part ? info.text : svc && !['az', 'zone', 'globe'].includes(p.kind) ? svc.tagline + '. ' + svc.what.split('. ')[0] + '.' : info?.text || svc?.what.split('. ')[0];

  return (
    <aside className="pick-card" aria-live="polite">
      <header>
        <ServiceIcon id={p.kind === 'users' || p.kind === 'user' ? 'users' : part ? p.kind : svc?.id || p.kind} size={36} />
        <div>
          {svc && (
            <span className="chip" style={{ '--c': CATEGORIES[svc.category].color }}>
              {CATEGORIES[svc.category].name}
            </span>
          )}
          <h3>{title}</h3>
          {p.title && p.title !== title && <small>{p.title}{p.sub ? ` · ${p.sub}` : ''}</small>}
        </div>
        <button className="icon-btn tiny" onClick={() => engine.clearPick()} aria-label="Đóng">
          <Icon name="close" size={15} />
        </button>
      </header>
      {desc && <p>{desc}</p>}
      {rows && (
        <dl className="kv">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {svc && (p.mode === 'sandbox' || ui.get().serviceId !== svc.id || link) && (
        <button
          className="btn btn-small"
          onClick={() => {
            engine.setMode('explore');
            engine.explore.load(svc.id, { step: link?.[1] });
          }}
        >
          {link ? `Xem ${info?.title || p.title} trong bài ${svc.short}` : `Xem ${svc.short} hoạt động thế nào`}
          <Icon name="arrowRight" size={15} />
        </button>
      )}
    </aside>
  );
}
