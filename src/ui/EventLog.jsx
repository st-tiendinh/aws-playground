// Sandbox, bottom dock: plain-language log of what the system is doing and why.
import { useEffect, useRef, useState } from 'react';
import { useSim } from '../state/store.js';
import { Icon } from './icons.jsx';

const LEVEL_ICON = { info: 'info', warn: 'alert', error: 'x', success: 'ok' };

export function EventLog() {
  const events = useSim((s) => s.events);
  const [open, setOpen] = useState(false);
  const listRef = useRef(null);
  const shown = events.filter((e) => e.type !== 'lesson').slice(open ? -40 : -4);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events, open]);

  return (
    <section className={`log${open ? ' is-open' : ''}`}>
      <header>
        <h3>Nhật ký hệ thống</h3>
        <button className="icon-btn tiny" onClick={() => setOpen(!open)} aria-label={open ? 'Thu gọn nhật ký' : 'Mở rộng nhật ký'} title={open ? 'Thu gọn' : 'Xem thêm'}>
          <Icon name={open ? 'chevronDown' : 'chevronUp'} size={16} />
        </button>
      </header>
      <ol ref={listRef}>
        {shown.length === 0 && <li className="muted">Chưa có sự kiện. Thử bấm một sự kiện ở bảng bên phải.</li>}
        {shown.map((e) => (
          <li key={e.id} className={`lv-${e.level}`}>
            <Icon name={LEVEL_ICON[e.level] || 'info'} size={15} />
            <time>{e.t.toFixed(0)}s</time>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
