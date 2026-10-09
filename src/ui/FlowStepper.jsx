// Explore mode, bottom dock: narration of the current step with play / pause / step controls.
// Steps marked `advanced` carry a "Nâng cao" tag and are passed over while "Bỏ qua bước nâng
// cao" is on; their dots stay clickable. A step with a `link` (a lesson id) offers a button to
// that lesson, for a topic summed up here and taught in full there.
import { useEffect, useRef, useState } from 'react';
import { FLOWS } from '../data/flows.js';
import { BEGINNER_PATH, serviceById } from '../data/services.js';
import { useApp, useUi } from '../state/store.js';
import { Icon } from './icons.jsx';

export function FlowStepper() {
  const { engine } = useApp();
  const id = useUi((s) => s.serviceId);
  const step = useUi((s) => s.step);
  const count = useUi((s) => s.stepCount);
  const playing = useUi((s) => s.playing);
  const done = useUi((s) => s.flowDone);
  const last = useUi((s) => s.stepLast);
  const skip = useUi((s) => s.skipAdvanced);
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
  const advanced = flow.steps.filter((s) => s.advanced).length;
  // on the beginner path, the end of a lesson leads straight to the next one
  const at = BEGINNER_PATH.findIndex((p) => p.id === id);
  const nextId = at >= 0 ? BEGINNER_PATH[at + 1]?.id : null;
  const nextSvc = nextId && FLOWS[nextId] ? serviceById(nextId) : null;
  const linkSvc = cur.link && FLOWS[cur.link] ? serviceById(cur.link) : null;

  return (
    <section className="stepper" aria-live="polite">
      <div className="stepper-top">
        <span className="stepper-count">
          {svc?.short} · Bước {step + 1}/{count}
        </span>
        <div className="dots" role="tablist" aria-label="Các bước">
          {flow.steps.map((s, i) => {
            const skipped = skip && s.advanced;
            const cls = `dot-btn${s.advanced ? ' is-adv' : ''}${i === step ? ' is-on' : ''}${i < step && !skipped ? ' is-done' : ''}${skipped && i !== step ? ' is-skipped' : ''}`;
            const name = `${s.title}${s.advanced ? ' (nâng cao)' : ''}`;
            return <button key={i} className={cls} onClick={() => engine.explore.goto(i)} title={`${i + 1}. ${name}`} aria-label={`Bước ${i + 1}: ${name}`} />;
          })}
        </div>
        {advanced > 0 && (
          <label className="auto skip-adv" title={`${advanced} bước nâng cao: bấm vào chấm của bước để xem riêng`}>
            <input type="checkbox" checked={skip} onChange={(e) => engine.explore.setSkipAdvanced(e.target.checked)} />
            Bỏ qua bước nâng cao
          </label>
        )}
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
      <h3>
        {cur.title}
        {cur.advanced && (
          <span className="adv-tag" title="Bước nâng cao: không bắt buộc khi mới bắt đầu">
            Nâng cao
          </span>
        )}
      </h3>
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
        {linkSvc && (
          <button className="btn btn-small step-link" onClick={() => engine.explore.load(linkSvc.id)} title={`Mở bài ${linkSvc.name}`}>
            Học bài {linkSvc.short}
            <Icon name="arrowRight" size={15} />
          </button>
        )}
        {last && nextSvc ? (
          <button className="btn btn-primary btn-small next-lesson" onClick={() => engine.explore.load(nextId)} title={`Bài ${at + 2}/${BEGINNER_PATH.length} trong Lộ trình người mới`}>
            Bài tiếp: {nextSvc.short}
            <Icon name="arrowRight" size={15} />
          </button>
        ) : (
          last && done && <span className="done-note">{at >= 0 ? 'Xong cả lộ trình! Học tiếp ở tab Tất cả hoặc thử Sandbox.' : 'Xong! Chọn dịch vụ khác hoặc thử trong Sandbox.'}</span>
        )}
      </div>
    </section>
  );
}
