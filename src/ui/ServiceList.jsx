// Explore mode, left panel: the services grouped by category.
import { useMemo, useState } from 'react';
import { CATEGORIES, SERVICES } from '../data/services.js';
import { useApp, useUi } from '../state/store.js';
import { Icon, ServiceIcon } from './icons.jsx';

const ORDER = ['foundation', 'compute', 'storage', 'database', 'network', 'integration', 'analytics', 'ai', 'migration', 'management', 'devtools', 'security'];

export function ServiceList({ onPick }) {
  const { engine } = useApp();
  const current = useUi((s) => s.serviceId);
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    // `keywords`: parts taught inside a lesson (NAT Gateway, Security Group… in VPC) are found too
    const match = (s) => !term || [s.name, s.short, s.tagline, s.id, ...(s.keywords || [])].some((x) => x.toLowerCase().includes(term));
    return ORDER.map((cat) => ({ cat, items: SERVICES.filter((s) => s.category === cat && match(s)) })).filter((g) => g.items.length);
  }, [q]);

  return (
    <div className="svc-list">
      <div className="panel-head">
        <h2>Dịch vụ AWS</h2>
        <p>Chọn một dịch vụ để xem nó hoạt động thế nào.</p>
      </div>
      <label className="search">
        <Icon name="search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm: EC2, database, DNS…" aria-label="Tìm dịch vụ" />
      </label>
      {groups.map(({ cat, items }) => (
        <section key={cat} className="svc-group">
          <h3 style={{ '--c': CATEGORIES[cat].color }}>
            <span className="dot" />
            {CATEGORIES[cat].name}
          </h3>
          {items.map((s) => (
            <button
              key={s.id}
              className={`svc-row${s.id === current ? ' is-on' : ''}`}
              onClick={() => {
                engine.explore.load(s.id);
                onPick?.();
              }}
            >
              <ServiceIcon id={s.id} size={34} />
              <span className="svc-row-text">
                <b>{s.short}</b>
                <small>{s.tagline}</small>
              </span>
            </button>
          ))}
        </section>
      ))}
      {!groups.length && <p className="muted pad">Không tìm thấy dịch vụ phù hợp.</p>}
    </div>
  );
}
