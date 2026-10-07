// Sandbox, left panel: ready-made architectures and the component toggles. Hovering a row
// highlights the matching 3D model; warnings explain weak spots of the current design.
import { CATEGORIES, LESSON_FOR, serviceById } from '../data/services.js';
import { EC2, ASG, BUDGET } from '../sim/constants.js';
import { DR } from '../sim/constants.js';
import { DR_STRATEGY, natlessFailures, wellArchitected } from '../sim/lessons.js';
import { PRESETS } from '../sim/presets.js';
import { hasData } from '../sim/simulation.js';
import { useState } from 'react';
import { useApp, useSim } from '../state/store.js';
import { Icon, ServiceIcon } from './icons.jsx';

function Toggle({ on, onChange, label }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

function Stepper({ value, min, max, onChange, label }) {
  return (
    <span className="stepper-num" aria-label={label}>
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Giảm ${label}`}>
        −
      </button>
      <b>{value}</b>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Tăng ${label}`}>
        +
      </button>
    </span>
  );
}

function Row({ id, sid, title, desc, children, hoverKey }) {
  const { engine, ui } = useApp();
  // a component explained inside a bigger lesson (NAT Gateway → the VPC lesson) opens at its step
  const [lessonId, step] = LESSON_FOR[sid || id] || [sid || id];
  const svc = serviceById(lessonId);
  return (
    <div
      className="comp-row"
      onMouseEnter={() => engine.sandbox.highlight(hoverKey || id)}
      onMouseLeave={() => engine.sandbox.highlight(null)}
    >
      <button className="comp-main" onClick={() => engine.sandbox.focus(hoverKey || id)} title="Đưa camera tới thành phần này">
        <ServiceIcon id={sid || id} size={30} />
        <span className="comp-text">
          <b>{title}</b>
          <small>{desc}</small>
        </span>
      </button>
      {svc && (
        <button
          className="icon-btn tiny"
          title={step ? `Xem ${title} trong bài ${svc.short}` : `Xem ${svc.short} hoạt động thế nào`}
          aria-label={`Tìm hiểu ${step ? title : svc.short}`}
          onClick={() => {
            engine.setMode('explore');
            engine.explore.load(svc.id, { step });
            ui.set({ picked: null });
          }}
        >
          <Icon name="info" size={15} />
        </button>
      )}
      <div className="comp-ctrl">{children}</div>
    </div>
  );
}

function warnings(c) {
  const w = [];
  const ec2 = c.compute === 'ec2';
  if (ec2 && !c.asg && c.ec2.a + c.ec2.b > 1 && !c.elb) w.push('Có nhiều EC2 nhưng chưa có Load Balancer: người dùng chỉ vào được một máy.');
  if (ec2 && !c.asg && (c.ec2.a === 0 || c.ec2.b === 0)) w.push('Mọi EC2 nằm ở cùng một AZ — sự cố ở AZ đó là website sập.');
  if (ec2 && !c.asg && c.ec2.a + c.ec2.b === 1) w.push('Chỉ có 1 EC2: đây là điểm lỗi duy nhất (single point of failure).');
  if (ec2 && c.asg && !c.elb) w.push('Auto Scaling cần Load Balancer để chia tải cho các máy mới.');
  if (ec2 && c.database === 'none') w.push('Chưa có database riêng: dữ liệu nằm trên ổ đĩa của EC2.');
  if (ec2 && c.elb && c.appSubnet === 'public') w.push('EC2 đang ở public subnet (có IP public): nên đặt vào private subnet sau Load Balancer cho an toàn.');
  const natless = natlessFailures(c);
  if (ec2 && c.appSubnet === 'private' && c.nat === 'none' && natless.length) w.push(`EC2 ở private subnet nhưng chưa có NAT Gateway: không gọi được ${natless.join(', ')}.`);
  if (ec2 && c.appSubnet === 'private' && c.nat === 'single' && natless.length) w.push('Chỉ có 1 NAT Gateway (ở AZ A): AZ A sập thì EC2 ở AZ B cũng mất đường ra Internet.');
  if (ec2 && c.appSubnet === 'private' && c.s3 && !c.vpce) w.push('EC2 ở private subnet đọc/ghi S3 qua NAT Gateway: bị tính phí theo từng GB — VPC Endpoint cho S3 thì miễn phí.');
  if (!c.queue) w.push('Ứng dụng gọi thẳng API thanh toán ngay trong request: đối tác chậm hay sập là đơn hàng lỗi theo — thêm SQS để xử lý nền.');
  if (c.database === 'rds' && !c.rdsMultiAz) w.push('RDS Single-AZ: database hỏng là cả website lỗi theo.');
  if (c.database === 'rds' && !c.cache) w.push('Chưa bật ElastiCache: mọi lượt đọc đều dồn thẳng vào RDS, dễ nghẽn khi tải tăng.');
  if (!c.s3) w.push(c.compute === 'lambda' ? 'File tĩnh đang chạy qua Lambda — nên đặt trên S3.' : 'File tĩnh (ảnh, CSS, JS) đang do server phục vụ — đưa lên S3 để server nhẹ hơn.');
  if (c.compute === 'lambda' && c.database === 'none') w.push('Lambda không lưu dữ liệu lâu dài — thêm DynamoDB hoặc RDS.');
  if (!c.shield) w.push('Chưa bật AWS Shield: một đợt DDoS có thể chiếm hết công suất, chen cả người dùng thật ra ngoài.');
  if (c.database === 'rds' && !c.waf) w.push('Chưa bật AWS WAF: request chứa mã SQL độc hại có thể đi thẳng tới RDS.');
  if (!c.backup && (c.database !== 'none' || ec2)) w.push('Chưa có AWS Backup: lỡ xoá nhầm dữ liệu là mất luôn — Multi-AZ cũng không cứu được trường hợp này.');
  if (!c.guardduty) w.push('Chưa bật GuardDuty: access key bị lộ có thể bị dùng để đào coin hàng giờ mà không ai hay.');
  if (!c.canary) w.push('Deploy kiểu một lần: bản có lỗi chạy trên mọi máy cùng lúc — bật canary + tự rollback để chỉ khoảng 10% traffic gặp lỗi.');
  if (!c.budget) w.push('Chưa đặt AWS Budgets: chi phí tăng vọt (ví dụ khi 1 triệu người ùa vào) chỉ lộ ra khi nhận hoá đơn.');
  if (c.dr === 'none') w.push('Mọi thứ nằm trong một Region: cả Region sập là website sập — Multi-AZ không đỡ được. Cân nhắc DR sang Region khác.');
  if (c.database === 'rds' && c.analytics === 'none') w.push('Báo cáo chạy thẳng trên database production: một truy vấn phân tích nặng làm website chậm và lỗi — tách sang S3 + Athena hoặc Redshift.');
  if (c.database === 'dynamodb' && c.analytics === 'none') w.push('DynamoDB không có GROUP BY: báo cáo phải Scan cả bảng, vừa chậm vừa tốn — xuất sang S3 + Athena hoặc Redshift.');
  return w;
}

// what each DR strategy keeps in the second Region, and what it buys
const DR_DESC = {
  none: 'đang tắt: mọi thứ nằm trong một Region',
  backup: `chép bản sao lưu sang ${DR.city} · RPO, RTO: vài giờ`,
  pilot: `dữ liệu đồng bộ sang ${DR.city}, máy tắt · RTO: vài chục phút`,
  warm: `bản thu nhỏ chạy sẵn ở ${DR.city} · RTO: vài phút`,
  active: `${DR.city} phục vụ một nửa người dùng · RTO gần 0`,
};
const DR_TIP = {
  none: 'Không có Region dự phòng',
  backup: 'Backup & restore: AWS Backup chép bản sao sang Region khác; sự cố thì dựng lại tất cả từ CloudFormation',
  pilot: 'Pilot light: dữ liệu sao chép liên tục, máy chủ tắt — sự cố thì bật máy, promote database',
  warm: 'Warm standby: một bản thu nhỏ đầy đủ luôn chạy — Route 53 tự chuyển, Auto Scaling thêm máy',
  active: 'Active-active: hai Region cùng phục vụ người dùng — đắt nhất, gần như không gián đoạn',
};

// where reports run, and what that costs
const ANALYTICS_DESC = {
  athena: 'bản xuất Parquet mỗi đêm · $5/TB quét',
  redshift: 'zero-ETL, chỉ trễ vài giây · ≈ $1,5/giờ',
};
const ANALYTICS_TIP = {
  none: 'Báo cáo chạy thẳng trên database đang phục vụ website',
  athena: 'Database xuất sang S3 (Parquet, chia theo tháng) mỗi đêm; báo cáo chạy bằng Athena, trả theo dữ liệu quét',
  redshift: 'Zero-ETL chép mọi thay đổi sang Redshift Serverless sau vài giây; báo cáo chạy trên kho dữ liệu lưu theo cột',
};

// six-pillar score of the current design; a failing check can be fixed in one click
function WellArchitected({ c, set }) {
  const [open, setOpen] = useState(null);
  const pillars = wellArchitected(c);
  const total = Math.round(pillars.reduce((n, p) => n + p.score, 0) / pillars.length);
  return (
    <section className="wa">
      <h3>
        <Icon name="target" size={16} /> Chấm điểm Well-Architected <b className="wa-total">{total}</b>
      </h3>
      {pillars.map((p) => (
        <div key={p.id} className={`wa-pillar${open === p.id ? ' is-open' : ''}`}>
          <button className="wa-row" onClick={() => setOpen(open === p.id ? null : p.id)} title={p.en} aria-expanded={open === p.id}>
            <span className="wa-name">{p.name}</span>
            <span className="wa-bar">
              <i style={{ width: p.score + '%' }} className={p.score >= 80 ? 'good' : p.score >= 50 ? 'warn' : 'bad'} />
            </span>
            <small>
              {p.passed}/{p.total}
            </small>
          </button>
          {open === p.id && (
            <ul className="wa-checks">
              {p.checks.map((x) => (
                <li key={x.text} className={x.ok ? 'ok' : 'miss'}>
                  <Icon name={x.ok ? 'check' : 'x'} size={13} />
                  <span>{x.text}</span>
                  {x.patch && (
                    <button className="chip-btn" onClick={() => set(x.patch)}>
                      Sửa
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

export function Palette() {
  const { engine } = useApp();
  const c = useSim((s) => s.config);
  const presetId = useSim((s) => s.presetId);
  const set = (patch) => engine.sandbox.setConfig(patch);
  const ec2 = c.compute === 'ec2';
  const priv = ec2 && c.appSubnet === 'private';
  const warn = warnings(c);

  return (
    <div className="palette">
      <div className="panel-head">
        <h2>Kiến trúc của bạn</h2>
        <p>Chọn mẫu có sẵn hoặc tự bật/tắt từng thành phần.</p>
      </div>

      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.id} className={`preset${presetId === p.id ? ' is-on' : ''}`} onClick={() => engine.sandbox.applyPreset(p.id)} title={p.desc}>
            <small>{p.level}</small>
            <b>{p.name}</b>
          </button>
        ))}
      </div>

      <h3 className="group-title" style={{ '--c': CATEGORIES.network.color }}>
        Người dùng → AWS
      </h3>
      <Row id="route53" title="Route 53" desc="DNS: tên miền → địa chỉ">
        <Toggle on={c.route53} onChange={(v) => set({ route53: v })} label="Route 53" />
      </Row>
      <Row id="cloudfront" title="CloudFront" desc="CDN: cache file gần người dùng">
        <Toggle on={c.cloudfront} onChange={(v) => set({ cloudfront: v })} label="CloudFront" />
      </Row>

      <h3 className="group-title" style={{ '--c': CATEGORIES.security.color }}>
        Bảo mật
      </h3>
      <Row id="waf" sid="waf" title="AWS WAF" desc="lọc request độc hại (SQL injection…)">
        <Toggle on={c.waf} onChange={(v) => set({ waf: v })} label="AWS WAF" />
      </Row>
      <Row id="shield" sid="shield" title="AWS Shield" desc="chặn tấn công DDoS ở tầng mạng">
        <Toggle on={c.shield} onChange={(v) => set({ shield: v })} label="AWS Shield" />
      </Row>
      <Row id="guardduty" sid="guardduty" title="Amazon GuardDuty" desc="phát hiện key bị lộ, máy đào coin">
        <Toggle on={c.guardduty} onChange={(v) => set({ guardduty: v })} label="Amazon GuardDuty" />
      </Row>

      <h3 className="group-title" style={{ '--c': CATEGORIES.compute.color }}>
        Tầng ứng dụng
      </h3>
      <div className="seg" role="radiogroup" aria-label="Kiểu tầng ứng dụng">
        <button role="radio" aria-checked={ec2} className={ec2 ? 'is-on' : ''} onClick={() => set({ compute: 'ec2' })}>
          Máy chủ EC2
        </button>
        <button role="radio" aria-checked={!ec2} className={!ec2 ? 'is-on' : ''} onClick={() => set({ compute: 'lambda', database: c.database === 'none' ? 'dynamodb' : c.database })}>
          Serverless
        </button>
      </div>
      {ec2 ? (
        <>
          <Row id="elb" title="Load Balancer" desc="ALB chia tải, health check">
            <Toggle on={c.elb} onChange={(v) => set({ elb: v })} label="Load Balancer" />
          </Row>
          <Row id="asg" title="Auto Scaling" desc={c.asg ? 'tự thêm/bớt EC2' : 'đang tắt: số EC2 cố định'}>
            <Toggle on={c.asg} onChange={(v) => set({ asg: v })} label="Auto Scaling" />
          </Row>
          {c.asg ? (
            <div className="sub-ctrl">
              <span>Tối thiểu</span>
              <Stepper value={c.asgMin} min={1} max={ASG.limit} onChange={(v) => set({ asgMin: v, asgMax: Math.max(v, c.asgMax) })} label="số EC2 tối thiểu" />
              <span>Tối đa</span>
              <Stepper value={c.asgMax} min={c.asgMin} max={ASG.limit} onChange={(v) => set({ asgMax: v })} label="số EC2 tối đa" />
            </div>
          ) : (
            <div className="sub-ctrl">
              <span>EC2 ở AZ A</span>
              <Stepper value={c.ec2.a} min={0} max={EC2.maxPerAz} onChange={(v) => set({ ec2: { ...c.ec2, a: v } })} label="EC2 ở AZ A" />
              <span>AZ B</span>
              <Stepper value={c.ec2.b} min={0} max={EC2.maxPerAz} onChange={(v) => set({ ec2: { ...c.ec2, b: v } })} label="EC2 ở AZ B" />
            </div>
          )}

          <h3 className="group-title" style={{ '--c': CATEGORIES.network.color }}>
            Vị trí EC2 trong VPC
          </h3>
          <div className="seg" role="radiogroup" aria-label="Subnet của EC2">
            <button role="radio" aria-checked={!priv} className={!priv ? 'is-on' : ''} onClick={() => set({ appSubnet: 'public' })} title="EC2 có IP public, nhận traffic trực tiếp">
              Public subnet
            </button>
            <button
              role="radio"
              aria-checked={priv}
              className={priv ? 'is-on' : ''}
              onClick={() => set({ appSubnet: 'private', elb: true, nat: c.nat === 'none' ? 'perAz' : c.nat })}
              title="EC2 không có IP public, chỉ nhận traffic qua Load Balancer (sẽ tự bật)"
            >
              Private subnet
            </button>
          </div>
          {priv && (
            <>
              <Row id="nat" title="NAT Gateway" desc="cho EC2 private gọi ra Internet" />
              <div className="seg four" role="radiogroup" aria-label="NAT Gateway">
                {[
                  ['none', 'Không', 'Không có NAT: EC2 private không gọi ra Internet được'],
                  ['single', '1 cái', 'Một NAT Gateway ở AZ A dùng chung cho cả 2 AZ'],
                  ['perAz', 'Mỗi AZ', 'Mỗi AZ một NAT Gateway riêng'],
                  ['regional', 'Regional', 'Regional NAT Gateway: một NAT cho cả VPC, tự có mặt ở từng AZ có EC2, không cần public subnet'],
                ].map(([v, t, tip]) => (
                  <button key={v} role="radio" aria-checked={c.nat === v} className={c.nat === v ? 'is-on' : ''} title={tip} onClick={() => set({ nat: v })} onMouseEnter={() => engine.sandbox.highlight('nat')} onMouseLeave={() => engine.sandbox.highlight(null)}>
                    {t}
                  </button>
                ))}
              </div>
              <Row id="vpce" sid="vpce" title="VPC Endpoint" desc={c.queue ? 'tới S3, SQS không qua NAT' : 'tới S3 không qua NAT · miễn phí'}>
                <Toggle on={c.vpce} onChange={(v) => set({ vpce: v })} label="VPC Endpoint" />
              </Row>
            </>
          )}
        </>
      ) : (
        <Row id="lambda" sid="lambda" title="API Gateway + Lambda" desc="tự mở rộng, trả theo request" hoverKey="lambda">
          <span className="badge-on">Bật</span>
        </Row>
      )}

      <h3 className="group-title" style={{ '--c': CATEGORIES.devtools.color }}>
        Triển khai
      </h3>
      <Row
        id="canary"
        sid="codepipeline"
        title="Canary + tự rollback"
        desc={!c.canary ? 'đang tắt: deploy một lần lên mọi máy' : ec2 ? 'ALB chia 10% cho bản mới, alarm 5xx thì quay lại' : 'CodeDeploy chia 10% cho bản mới, alarm 5xx thì quay lại'}
        hoverKey={ec2 ? 'elb' : 'lambda'}
      >
        <Toggle on={c.canary} onChange={(v) => set(v && ec2 && !c.elb ? { canary: true, elb: true } : { canary: v })} label="Canary + tự rollback" />
      </Row>

      <h3 className="group-title" style={{ '--c': CATEGORIES.integration.color }}>
        Xử lý nền
      </h3>
      <Row id="sqs" sid="sqs" title="SQS + Lambda worker" desc="đơn hàng vào hàng đợi, gọi API thanh toán sau">
        <Toggle on={c.queue} onChange={(v) => set({ queue: v })} label="SQS + Lambda worker" />
      </Row>

      <h3 className="group-title" style={{ '--c': CATEGORIES.storage.color }}>
        File tĩnh
      </h3>
      <Row id="s3" title="S3" desc="ảnh, CSS, JS, video">
        <Toggle on={c.s3} onChange={(v) => set({ s3: v })} label="S3" />
      </Row>

      <h3 className="group-title" style={{ '--c': CATEGORIES.database.color }}>
        Database
      </h3>
      <div className="seg three" role="radiogroup" aria-label="Database">
        {[
          ['none', 'Không có'],
          ['rds', 'RDS'],
          ['dynamodb', 'DynamoDB'],
        ].map(([v, t]) => (
          <button key={v} role="radio" aria-checked={c.database === v} className={c.database === v ? 'is-on' : ''} onClick={() => set({ database: v })} onMouseEnter={() => engine.sandbox.highlight(v === 'none' ? null : v)} onMouseLeave={() => engine.sandbox.highlight(null)}>
            {t}
          </button>
        ))}
      </div>
      {c.database === 'rds' && (
        <Row id="rds" title="Multi-AZ" desc="bản standby ở AZ khác">
          <Toggle on={c.rdsMultiAz} onChange={(v) => set({ rdsMultiAz: v })} label="RDS Multi-AZ" />
        </Row>
      )}
      {c.database === 'rds' && (
        <Row id="cache" sid="elasticache" title="ElastiCache" desc="bộ nhớ đệm giảm tải RDS">
          <Toggle on={c.cache} onChange={(v) => set({ cache: v })} label="ElastiCache" />
        </Row>
      )}
      {(c.database !== 'none' || ec2) && (
        <Row id="backup" sid="backup" title="AWS Backup" desc={c.database === 'none' ? 'snapshot ổ EBS + khôi phục' : 'sao lưu + khôi phục về thời điểm'}>
          <Toggle on={c.backup} onChange={(v) => set({ backup: v })} label="AWS Backup" />
        </Row>
      )}

      {c.database !== 'none' && (
        <>
          <h3 className="group-title" style={{ '--c': CATEGORIES.analytics.color }}>
            Phân tích dữ liệu
          </h3>
          <Row
            id="analytics"
            sid={c.analytics === 'athena' ? 'athena' : 'redshift'}
            title="Chạy báo cáo ở"
            desc={ANALYTICS_DESC[c.analytics] || (c.database === 'rds' ? 'database production · báo cáo nặng làm chậm web' : 'DynamoDB không có GROUP BY · phải Scan cả bảng')}
            hoverKey={c.analytics === 'none' ? (c.database === 'rds' ? 'rds' : 'dynamodb') : 'analytics'}
          />
          <div className="seg three" role="radiogroup" aria-label="Nơi chạy báo cáo">
            {[
              ['none', 'Database'],
              ['athena', 'Athena'],
              ['redshift', 'Redshift'],
            ].map(([v, t]) => (
              <button
                key={v}
                role="radio"
                aria-checked={c.analytics === v}
                className={c.analytics === v ? 'is-on' : ''}
                title={ANALYTICS_TIP[v]}
                onClick={() => set({ analytics: v })}
                onMouseEnter={() => engine.sandbox.highlight(v === 'none' ? (c.database === 'rds' ? 'rds' : 'dynamodb') : 'analytics')}
                onMouseLeave={() => engine.sandbox.highlight(null)}
              >
                {t}
              </button>
            ))}
          </div>
        </>
      )}

      <h3 className="group-title" style={{ '--c': CATEGORIES.storage.color }}>
        Dự phòng thảm hoạ (DR)
      </h3>
      <Row id="dr" sid="dr" title="Region dự phòng" desc={DR_DESC[c.dr]} />
      <div className="seg five" role="radiogroup" aria-label="Chiến lược DR">
        {[
          ['none', 'Không'],
          ['backup', 'Backup'],
          ['pilot', 'Pilot'],
          ['warm', 'Warm'],
          ['active', 'Active'],
        ].map(([v, t]) => (
          <button
            key={v}
            role="radio"
            aria-checked={c.dr === v}
            className={c.dr === v ? 'is-on' : ''}
            title={DR_TIP[v]}
            aria-label={DR_STRATEGY[v].name}
            // failing over is Route 53's job, and backup & restore needs the backups it restores from
            onClick={() => set(v === 'none' ? { dr: 'none' } : { dr: v, route53: true, ...(v === 'backup' && hasData(c) ? { backup: true } : {}) })}
            onMouseEnter={() => engine.sandbox.highlight('dr')}
            onMouseLeave={() => engine.sandbox.highlight(null)}
          >
            {t}
          </button>
        ))}
      </div>

      <h3 className="group-title" style={{ '--c': CATEGORIES.management.color }}>
        Chi phí
      </h3>
      <Row id="budgets" sid="budgets" title="AWS Budgets" desc="báo động khi chi phí dự báo vượt ngân sách" />
      <div className="seg four" role="radiogroup" aria-label="Ngân sách AWS Budgets mỗi tháng">
        {[0, ...BUDGET.options].map((v) => (
          <button key={v} role="radio" aria-checked={c.budget === v} className={c.budget === v ? 'is-on' : ''} onClick={() => set({ budget: v })} onMouseEnter={() => engine.sandbox.highlight('budgets')} onMouseLeave={() => engine.sandbox.highlight(null)}>
            {v ? `$${v.toLocaleString('vi-VN')}` : 'Tắt'}
          </button>
        ))}
      </div>

      <WellArchitected c={c} set={set} />

      {warn.length > 0 && (
        <div className="warnings">
          <h3>
            <Icon name="alert" size={16} /> Điểm yếu cần chú ý
          </h3>
          <ul>
            {warn.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
