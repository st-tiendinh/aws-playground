// Sandbox: the lesson shown when an event is over — verdict, what helped, what hurt, and
// suggestions that can be applied in one click before replaying the same event.
import { useEffect, useState } from 'react';
import { useApp, useSim } from '../state/store.js';
import { Icon } from './icons.jsx';

const GRADE = {
  pass: { text: 'Vượt qua', icon: 'ok' },
  partial: { text: 'Có gián đoạn', icon: 'alert' },
  fail: { text: 'Thất bại', icon: 'x' },
};
const POINT_ICON = { good: 'ok', bad: 'x', info: 'info' };

function mergePatches(list) {
  const out = {};
  for (const p of list) {
    for (const [k, v] of Object.entries(p)) {
      if (k === 'ec2') out.ec2 = { a: Math.max(out.ec2?.a ?? 0, v.a ?? 0), b: Math.max(out.ec2?.b ?? 0, v.b ?? 0) };
      else out[k] = v;
    }
  }
  return out;
}

export function LessonCard() {
  const { engine, simStore } = useApp();
  const lesson = useSim((s) => s.lesson);
  const open = useSim((s) => s.lessonOpen);
  const [picked, setPicked] = useState({});

  useEffect(() => {
    if (lesson) setPicked(Object.fromEntries(lesson.suggestions.map((s) => [s.label, true])));
  }, [lesson]);

  if (!lesson || !open) return null;
  const g = GRADE[lesson.grade];
  const chosen = lesson.suggestions.filter((s) => picked[s.label]);

  const replay = (patch) => engine.sandbox.replay(lesson.action, { az: lesson.az || 'a' }, patch);

  return (
    <div className="lesson-wrap" role="dialog" aria-modal="false" aria-labelledby="lesson-title">
      <article className={`lesson grade-${lesson.grade}`}>
        <header>
          <span className="grade">
            <Icon name={g.icon} size={18} />
            {g.text}
          </span>
          <small>Kết quả: {lesson.title}</small>
          <h2 id="lesson-title">{lesson.headline}</h2>
          <button className="icon-btn close" onClick={() => simStore.set({ lessonOpen: false })} aria-label="Đóng">
            <Icon name="close" />
          </button>
        </header>
        <div className="lesson-stats">
          {lesson.stats.map((s) => (
            <div key={s.label}>
              <small>{s.label}</small>
              <b>{s.value}</b>
            </div>
          ))}
        </div>
        <ul className="points">
          {lesson.points.map((p, i) => (
            <li key={i} className={`pt-${p.kind}`}>
              <Icon name={POINT_ICON[p.kind]} size={17} />
              <span>{p.text}</span>
            </li>
          ))}
        </ul>
        {lesson.suggestions.length > 0 && (
          <div className="suggest">
            <h3>Gợi ý cải thiện</h3>
            {lesson.suggestions.map((s) => (
              <label key={s.label} className="sugg">
                <input type="checkbox" checked={!!picked[s.label]} onChange={(e) => setPicked({ ...picked, [s.label]: e.target.checked })} />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
        )}
        <footer>
          {chosen.length > 0 && (
            <button className="btn btn-primary" onClick={() => replay(mergePatches(chosen.map((s) => s.patch)))}>
              Áp dụng gợi ý & thử lại
            </button>
          )}
          <button className="btn" onClick={() => replay(null)}>
            Phục hồi & thử lại
          </button>
          <button className="btn btn-ghost" onClick={() => simStore.set({ lessonOpen: false })}>
            Đóng
          </button>
        </footer>
      </article>
    </div>
  );
}
