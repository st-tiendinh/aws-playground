// Explore mode, left panel: the beginner path (12 lessons in order) or every lesson grouped by
// category. Lessons on the path carry a "Cơ bản" tag; finished ones get a tick.
import { useMemo, useState } from 'react';
import { BEGINNER_PATH, CATEGORIES, SERVICES, isBasic, serviceById } from '../data/services.js';
import { useApp, useUi, writePref } from '../state/store.js';
import { Icon, ServiceIcon } from './icons.jsx';

const ORDER = ['foundation', 'compute', 'storage', 'database', 'network', 'integration', 'analytics', 'ai', 'migration', 'management', 'devtools', 'security'];

export function BasicTag() {
  return (
    <span className="basic-tag" title="Bài cơ bản, nằm trong Lộ trình người mới">
      Cơ bản
    </span>
  );
}

export function ServiceList({ onPick }) {
  const { engine, ui } = useApp();
  const current = useUi((s) => s.serviceId);
  const tab = useUi((s) => s.listTab);
  const done = useUi((s) => s.done);
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();

  const groups = useMemo(() => {
    // `keywords`: parts taught inside a lesson (NAT Gateway, Security Group… in VPC) are found too
    const match = (s) => !term || [s.name, s.short, s.tagline, s.id, ...(s.keywords || [])].some((x) => x.toLowerCase().includes(term));
    return ORDER.map((cat) => ({ cat, items: SERVICES.filter((s) => s.category === cat && match(s)) })).filter((g) => g.items.length);
  }, [term]);

  const open = (id) => {
    engine.explore.load(id);
    onPick?.();
  };
  const setTab = (t) => {
    writePref('listTab', t);
    ui.set({ listTab: t });
  };
  // a search always looks through every lesson
  const showPath = tab === 'path' && !term;

  return (
    <div className="svc-list">
      <div className="panel-head">
        <h2>Bài học AWS</h2>
        <p>{showPath ? 'Mới bắt đầu? Học theo thứ tự này.' : 'Chọn một dịch vụ để xem nó hoạt động thế nào.'}</p>
      </div>
      <div className="seg list-tabs" role="tablist" aria-label="Danh sách bài">
        <button role="tab" aria-selected={tab === 'path'} className={tab === 'path' ? 'is-on' : ''} onClick={() => setTab('path')}>
          Lộ trình người mới
        </button>
        <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'is-on' : ''} onClick={() => setTab('all')}>
          Tất cả ({SERVICES.length})
        </button>
      </div>
      <label className="search">
        <Icon name="search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm: EC2, database, DNS…" aria-label="Tìm dịch vụ" />
      </label>

      {showPath ? (
        <PathList current={current} done={done} open={open} toAll={() => setTab('all')} />
      ) : (
        <>
          {groups.map(({ cat, items }) => (
            <section key={cat} className="svc-group">
              <h3 style={{ '--c': CATEGORIES[cat].color }}>
                <span className="dot" />
                {CATEGORIES[cat].name}
              </h3>
              {items.map((s) => (
                <button key={s.id} className={`svc-row${s.id === current ? ' is-on' : ''}`} onClick={() => open(s.id)}>
                  <ServiceIcon id={s.id} size={34} />
                  <span className="svc-row-text">
                    <b>
                      {s.short}
                      {isBasic(s.id) && <BasicTag />}
                      {done.includes(s.id) && <Icon name="check" size={14} className="row-done" />}
                    </b>
                    <small>{s.tagline}</small>
                  </span>
                </button>
              ))}
            </section>
          ))}
          {!groups.length && <p className="muted pad">Không tìm thấy dịch vụ phù hợp.</p>}
        </>
      )}
    </div>
  );
}

function PathList({ current, done, open, toAll }) {
  const items = BEGINNER_PATH.map((p) => ({ ...p, svc: serviceById(p.id) })).filter((p) => p.svc);
  const finished = items.filter((p) => done.includes(p.id)).length;
  const next = items.find((p) => !done.includes(p.id));

  return (
    <>
      <div className="path-progress">
        <div className="path-progress-text">
          <b>
            {finished}/{items.length} bài
          </b>
          <span>{next ? <>Tiếp theo: {next.svc.short}</> : 'Đã xong cả lộ trình ✓'}</span>
        </div>
        <div className="path-bar">
          <span style={{ transform: `scaleX(${finished / items.length})` }} />
        </div>
      </div>
      <ol className="path">
        {items.map((p, i) => {
          const isDone = done.includes(p.id);
          return (
            <li key={p.id} className={`path-item${isDone ? ' is-done' : ''}${p === next ? ' is-next' : ''}`}>
              <button className={`path-row${p.id === current ? ' is-on' : ''}`} onClick={() => open(p.id)}>
                <span className="path-num" aria-hidden="true">
                  {isDone ? <Icon name="check" size={14} stroke={2.6} /> : i + 1}
                </span>
                <span className="svc-row-text">
                  <b>{p.svc.short}</b>
                  <small>{p.why}</small>
                </span>
                <ServiceIcon id={p.id} size={28} />
              </button>
            </li>
          );
        })}
      </ol>
      <p className="path-foot">
        Xong {items.length} bài này là đủ nền để tự dựng một website nhỏ. Học tiếp Load Balancer, Auto Scaling, CloudFront, DynamoDB… ở{' '}
        <button className="link-btn" onClick={toAll}>
          Tất cả bài
        </button>
        .
      </p>
    </>
  );
}
