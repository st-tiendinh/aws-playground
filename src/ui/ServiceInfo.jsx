// Explore mode, right panel: what the selected service is, an everyday analogy, when to use
// it, key terms, pricing — and a shortcut into the sandbox.
import { CATEGORIES, serviceById } from '../data/services.js';
import { presetById } from '../sim/presets.js';
import { useApp, useUi } from '../state/store.js';
import { Icon, ServiceIcon } from './icons.jsx';

const ACTION_LABEL = { quake: 'Động đất', serverFail: 'Server hỏng', spike: '1 triệu người truy cập', dbFail: 'Database sự cố' };

export function openInSandbox(engine, ui, sandbox) {
  engine.setMode('sandbox');
  if (sandbox.preset) engine.sandbox.applyPreset(sandbox.preset);
  else if (sandbox.config) engine.sandbox.applyConfig(sandbox.config);
  ui.set({ hint: sandbox.action || null });
}

export function ServiceInfo() {
  const { engine, ui } = useApp();
  const id = useUi((s) => s.serviceId);
  const s = serviceById(id);
  if (!s) return null;
  const cat = CATEGORIES[s.category];
  const sb = s.sandbox;

  return (
    <article className="svc-info">
      <header className="svc-info-head">
        <ServiceIcon id={s.id} size={46} />
        <div>
          <span className="chip" style={{ '--c': cat.color }}>
            {cat.name}
          </span>
          <h2>{s.name}</h2>
          <p className="tagline">{s.tagline}</p>
        </div>
      </header>

      <section>
        <h3>Là gì?</h3>
        <p>{s.what}</p>
      </section>

      <section className="analogy">
        <h3>Ví dụ đời thường</h3>
        <p>{s.analogy}</p>
      </section>

      <section>
        <h3>Khi nào dùng?</h3>
        <ul className="bullets">
          {s.when.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Khái niệm chính</h3>
        <dl className="terms">
          {s.concepts.map(([term, desc]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{desc}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3>Cách tính tiền</h3>
        <p>{s.pricing}</p>
      </section>

      {s.tip && (
        <p className="tip">
          <Icon name="bolt" size={16} />
          <span>{s.tip}</span>
        </p>
      )}

      {sb && (
        <div className="try-box">
          <p>
            Thử trong Sandbox với kiến trúc <b>{sb.preset ? presetById(sb.preset).name : 'gợi ý'}</b>
            {sb.action ? (
              <>
                , rồi bấm sự kiện <b>{ACTION_LABEL[sb.action]}</b>
              </>
            ) : null}
            .
          </p>
          <button className="btn btn-primary" onClick={() => openInSandbox(engine, ui, sb)}>
            Thử trong Sandbox
            <Icon name="arrowRight" size={16} />
          </button>
        </div>
      )}
    </article>
  );
}
