// Explore mode, bottom dock: narration of the current step with play / pause / step controls.
import { useEffect, useRef, useState } from 'react';
import { FLOWS } from '../data/flows.js';
import { serviceById } from '../data/services.js';
import { useApp, useUi } from '../state/store.js';
import { Icon } from './icons.jsx';

export function FlowStepper() {
  const { engine } = useApp();
  const id = useUi((s) => s.serviceId);
  const step = useUi((s) => s.step);
  const count = useUi((s) => s.stepCount);
  const playing = useUi((s) => s.playing);
  const done = useUi((s) => s.flowDone);
  const [auto, setAuto] = useState(() => engine.explore.autoAdvance);
  const barRef = useRef(null);
  const flow = FLOWS[id];
  const svc = serviceById(id);
  const cur = flow?.steps[step];

  // progress bar follows the engine clock without re-rendering React
  useEffect(() => {
    let raf;
    const tick = () => {
      if (barRef.current) barRef.current.style.transform = `scaleX(${engine.explore.progress})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowRight') engine.explore.next();
      else if (e.key === 'ArrowLeft') engine.explore.prev();
      else if (e.key === ' ') {
        e.preventDefault();
        engine.explore.setPlaying(!playing);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, playing]);

  if (!flow || !cur) return null;
  const last = step === count - 1;

  return (
    <section className="stepper" aria-live="polite">
      <div className="stepper-top">
        <span className="stepper-count">
          {svc?.short} · Bước {step + 1}/{count}
        </span>
        <div className="dots" role="tablist" aria-label="Các bước">
          {flow.steps.map((s, i) => (
            <button key={i} className={`dot-btn${i === step ? ' is-on' : ''}${i < step ? ' is-done' : ''}`} onClick={() => engine.explore.goto(i)} title={`${i + 1}. ${s.title}`} aria-label={`Bước ${i + 1}: ${s.title}`} />
          ))}
        </div>
        <label className="auto">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              engine.explore.setAutoAdvance(e.target.checked);
            }}
          />
          Tự chuyển bước
        </label>
      </div>
      <h3>{cur.title}</h3>
      <p>{cur.text}</p>
      <div className="stepper-bar">
        <span ref={barRef} />
      </div>
      <div className="stepper-ctrl">
        <button className="icon-btn" onClick={() => engine.explore.prev()} disabled={step === 0} aria-label="Bước trước" title="Bước trước (←)">
          <Icon name="prev" />
        </button>
        <button className="icon-btn big" onClick={() => engine.explore.setPlaying(!playing)} aria-label={playing ? 'Tạm dừng' : 'Chạy'} title={playing ? 'Tạm dừng (Space)' : 'Chạy (Space)'}>
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <button className="icon-btn" onClick={() => engine.explore.next()} disabled={last} aria-label="Bước sau" title="Bước sau (→)">
          <Icon name="next" />
        </button>
        <button className="icon-btn" onClick={() => engine.explore.replay()} aria-label="Xem lại bước này" title="Xem lại bước này">
          <Icon name="replay" />
        </button>
        {last && done && <span className="done-note">Xong! Chọn dịch vụ khác hoặc thử trong Sandbox.</span>}
      </div>
    </section>
  );
}
