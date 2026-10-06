// Top bar: brand, mode switch (learn a service / sandbox) and view toggles.
import { useApp, useUi } from '../state/store.js';
import { Icon } from './icons.jsx';

export function TopBar({ narrow, drawer, setDrawer }) {
  const { engine, ui } = useApp();
  const mode = useUi((s) => s.mode);
  const sound = useUi((s) => s.sound);
  const labels = useUi((s) => s.labels);
  const quality = useUi((s) => s.quality);

  const toggle = (side) => setDrawer(drawer === side ? null : side);

  return (
    <header className="topbar">
      <div className="brand">
        {narrow && (
          <button className="icon-btn" onClick={() => toggle('left')} aria-label="Mở danh sách" title="Danh sách">
            <Icon name="menu" />
          </button>
        )}
        <span className="brand-logo" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="30" height="30">
            <defs>
              <linearGradient id="lg" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#7dd3fc" />
                <stop offset="1" stopColor="#a78bfa" />
              </linearGradient>
            </defs>
            <path d="M9 24h14.5a6 6 0 0 0 .7-12 8 8 0 0 0-15.3 2.2A5 5 0 0 0 9 24z" fill="url(#lg)" />
            <path d="M12 20l3-6 2 4 1.5-2 2 4" fill="none" stroke="#0f172a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="brand-text">
          <b>Cloud Playground 3D</b>
          {!narrow && <small>Học các dịch vụ AWS cơ bản qua mô phỏng</small>}
        </div>
      </div>

      <nav className="mode-tabs" role="tablist" aria-label="Chế độ">
        <button role="tab" aria-selected={mode === 'explore'} className={mode === 'explore' ? 'is-on' : ''} onClick={() => engine?.setMode('explore')}>
          <Icon name="book" size={17} />
          <span>{narrow ? 'Học' : 'Học từng dịch vụ'}</span>
        </button>
        <button role="tab" aria-selected={mode === 'sandbox'} className={mode === 'sandbox' ? 'is-on' : ''} onClick={() => engine?.setMode('sandbox')}>
          <Icon name="flask" size={17} />
          <span>{narrow ? 'Sandbox' : 'Sandbox kiến trúc'}</span>
        </button>
      </nav>

      <div className="tools">
        <button className={`icon-btn${labels ? ' is-on' : ''}`} onClick={() => engine?.setLabels(!labels)} title={labels ? 'Ẩn nhãn' : 'Hiện nhãn'} aria-label="Nhãn">
          <Icon name="tag" />
        </button>
        <button className={`icon-btn${sound ? ' is-on' : ''}`} onClick={() => engine?.setSound(!sound)} title={sound ? 'Tắt âm thanh' : 'Bật âm thanh'} aria-label="Âm thanh">
          <Icon name={sound ? 'soundOn' : 'soundOff'} />
        </button>
        {!narrow && (
          <button className={`icon-btn${quality === 'high' ? ' is-on' : ''}`} onClick={() => engine?.setQuality(quality === 'high' ? 'low' : 'high')} title={quality === 'high' ? 'Đồ hoạ: cao (bấm để giảm)' : 'Đồ hoạ: nhẹ (bấm để tăng)'} aria-label="Chất lượng đồ hoạ">
            <Icon name="sparkles" />
          </button>
        )}
        <button className="icon-btn" onClick={() => engine?.home()} title="Đưa camera về vị trí ban đầu" aria-label="Camera mặc định">
          <Icon name="target" />
        </button>
        <button className="icon-btn" onClick={() => ui.set({ intro: true })} title="Hướng dẫn" aria-label="Hướng dẫn">
          <Icon name="help" />
        </button>
        {narrow && (
          <button className="icon-btn" onClick={() => toggle('right')} aria-label="Mở bảng bên phải" title="Chi tiết">
            <Icon name="panel" />
          </button>
        )}
      </div>
    </header>
  );
}
