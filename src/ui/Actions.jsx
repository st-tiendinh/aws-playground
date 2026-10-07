// Sandbox, right panel: the events you can throw at the architecture (earthquake, broken
// server, a million users, database failure, attacks, a payment-provider outage, an
// accidental delete, night time, repair), traffic and speed.
import { useState } from 'react';
import { ACTION_TITLE } from '../sim/lessons.js';
import { USERS } from '../sim/constants.js';
import { useApp, useSim, useUi } from '../state/store.js';
import { fmtUsers } from './format.js';
import { Icon } from './icons.jsx';
import { Spark } from './MetricsBar.jsx';

const ACTIONS = [
  { id: 'quake', icon: 'quake', title: 'Động đất', desc: 'phá huỷ một AZ', tone: 'bad' },
  { id: 'serverFail', icon: 'fire', title: 'Server hỏng', desc: 'một EC2 cháy nguồn', tone: 'bad' },
  { id: 'spike', icon: 'crowd', title: '1 triệu người', desc: 'cùng truy cập', tone: 'warn' },
  { id: 'dbFail', icon: 'dbx', title: 'Database sự cố', desc: 'ổ đĩa primary hỏng', tone: 'bad' },
  { id: 'ddos', icon: 'ddos', title: 'Tấn công DDoS', desc: 'botnet dội request rác', tone: 'bad' },
  { id: 'sqlInjection', icon: 'sqli', title: 'SQL injection', desc: 'request chứa mã độc', tone: 'bad' },
  { id: 'paymentDown', icon: 'card', title: 'Thanh toán sập', desc: 'API đối tác ngừng 20 giây', tone: 'bad' },
  { id: 'dataDelete', icon: 'trash', title: 'Xoá nhầm dữ liệu', desc: 'deploy lỗi chạy DELETE', tone: 'bad' },
  { id: 'leakedKey', icon: 'alert', title: 'Lộ access key', desc: 'key trên GitHub → máy đào coin', tone: 'bad' },
  { id: 'night', icon: 'moon', title: 'Đêm khuya', desc: 'chỉ còn 500 người', tone: 'info' },
  { id: 'repair', icon: 'wrench', title: 'Phục hồi', desc: 'sửa mọi thứ', tone: 'good' },
];

const QUICK = [
  ['Đêm', USERS.night],
  ['Bình thường', USERS.normal],
  ['Cao điểm', 100_000],
  ['1 triệu', USERS.spike],
];

const toSlider = (u) => Math.log10(Math.max(USERS.min, u));
const fromSlider = (v) => Math.round(Math.pow(10, v));

export function Actions({ onAction }) {
  const { engine, ui } = useApp();
  const snap = useSim((s) => s.snap);
  const config = useSim((s) => s.config);
  const speed = useSim((s) => s.speed);
  const paused = useSim((s) => s.paused);
  const hint = useUi((s) => s.hint);
  const history = useSim((s) => s.history);
  const [az, setAz] = useState('a');
  if (!snap) return null;
  const sc = snap.scenario;

  const disabled = (id) => {
    if (id === 'dbFail' || id === 'sqlInjection') return config.database === 'none';
    if (id === 'dataDelete') return config.database === 'none' && config.compute !== 'ec2';
    if (id === 'quake') return snap.az[az] !== 'ok';
    return false;
  };
  const why = (id) => {
    if (!disabled(id)) return undefined;
    if (id === 'dbFail' || id === 'sqlInjection') return 'Cần có database (RDS hoặc DynamoDB)';
    if (id === 'dataDelete') return 'Kiến trúc này chưa lưu dữ liệu ở đâu — thêm DynamoDB hoặc RDS';
    return undefined;
  };

  const run = (id) => {
    engine.sandbox.trigger(id, { az });
    if (hint) ui.set({ hint: null });
    onAction?.();
  };

  return (
    <div className="actions">
      <div className="panel-head">
        <h2>Sự kiện & thử thách</h2>
        <p>Bấm một sự kiện để xem kiến trúc của bạn phản ứng ra sao.</p>
      </div>

      {hint && (
        <div className="hint-box">
          <Icon name="bolt" size={16} />
          <span>
            Gợi ý: bấm <b>{ACTION_TITLE[hint] ? ACTIONS.find((a) => a.id === hint)?.title : hint}</b> để xem điều gì xảy ra.
          </span>
          <button className="icon-btn tiny" onClick={() => ui.set({ hint: null })} aria-label="Ẩn gợi ý">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      <div className="action-grid">
        {ACTIONS.map((a) => (
          <button key={a.id} className={`action tone-${a.tone}${hint === a.id ? ' is-hinted' : ''}${sc?.action === a.id ? ' is-running' : ''}`} onClick={() => run(a.id)} disabled={disabled(a.id)} title={why(a.id)}>
            <span className="action-icon">
              <Icon name={a.icon} size={22} />
            </span>
            <b>{a.title}</b>
            <small>{a.id === 'quake' ? `phá huỷ AZ ${az.toUpperCase()}` : a.desc}</small>
          </button>
        ))}
      </div>
      <div className="az-pick">
        <span>Động đất ở:</span>
        {['a', 'b'].map((z) => (
          <button key={z} className={`chip-btn${az === z ? ' is-on' : ''}`} onClick={() => setAz(z)}>
            AZ {z.toUpperCase()}
            {snap.az[z] !== 'ok' && ' (đang sập)'}
          </button>
        ))}
      </div>

      {sc && (
        <div className="running">
          <div className="running-top">
            <span className="pulse-dot" />
            <b>Đang diễn ra: {ACTION_TITLE[sc.action]}</b>
            <small>{Math.ceil(sc.remaining)} giây</small>
          </div>
          <p>Theo dõi luồng request, nhật ký bên dưới và các chỉ số phía trên. Bài học sẽ hiện khi sự kiện kết thúc.</p>
        </div>
      )}

      <section className="chart-box">
        <h3>
          60 giây qua · <span className="lg-succ">tỉ lệ thành công</span> · <span className="lg-lat">độ trễ</span>
        </h3>
        <Spark history={history} width={300} height={56} />
      </section>

      <section className="traffic">
        <div className="traffic-head">
          <h3>Người dùng online</h3>
          <b>{fmtUsers(snap.targetUsers)}</b>
        </div>
        <input type="range" min={2} max={6.3} step={0.01} value={toSlider(snap.targetUsers)} onChange={(e) => engine.sandbox.setUsers(fromSlider(Number(e.target.value)))} aria-label="Số người dùng online" />
        <div className="quick">
          {QUICK.map(([t, v]) => (
            <button key={t} className={`chip-btn${Math.abs(toSlider(snap.targetUsers) - toSlider(v)) < 0.02 ? ' is-on' : ''}`} onClick={() => engine.sandbox.setUsers(v)}>
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="speed">
        <h3>Tốc độ mô phỏng</h3>
        <div className="seg four">
          <button className={paused ? 'is-on' : ''} onClick={() => engine.sandbox.setPaused(!paused)} aria-label={paused ? 'Tiếp tục' : 'Tạm dừng'}>
            <Icon name={paused ? 'play' : 'pause'} size={14} />
          </button>
          {[1, 2, 4].map((x) => (
            <button
              key={x}
              className={!paused && speed === x ? 'is-on' : ''}
              onClick={() => {
                engine.sandbox.setPaused(false);
                engine.sandbox.setSpeed(x);
              }}
            >
              {x}×
            </button>
          ))}
        </div>
        <p className="muted small">Thời gian được nén: vài giây trong mô phỏng tương ứng vài phút ngoài thực tế (khởi động máy, failover…).</p>
      </section>
    </div>
  );
}
