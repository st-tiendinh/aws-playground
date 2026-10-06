// Root component: owns the stores, boots the 3D engine once the DOM is in place and lays
// out the UI layers for the two modes (explore flows / sandbox simulation).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createEngine } from './engine/engine.js';
import { AppContext, createSimStore, createUiStore, useStore } from './state/store.js';
import { Intro } from './ui/Intro.jsx';
import { PickCard } from './ui/PickCard.jsx';
import { TopBar } from './ui/TopBar.jsx';
import { FlowStepper } from './ui/FlowStepper.jsx';
import { ServiceInfo } from './ui/ServiceInfo.jsx';
import { ServiceList } from './ui/ServiceList.jsx';
import { Actions } from './ui/Actions.jsx';
import { EventLog } from './ui/EventLog.jsx';
import { LessonCard } from './ui/LessonCard.jsx';
import { MetricsBar } from './ui/MetricsBar.jsx';
import { Palette } from './ui/Palette.jsx';

function useNarrow() {
  const check = () => window.innerWidth <= 900;
  const [narrow, setNarrow] = useState(check);
  useEffect(() => {
    const fn = () => setNarrow(check());
    window.addEventListener('resize', fn);
    fn();
    return () => window.removeEventListener('resize', fn);
  }, []);
  return narrow;
}

export default function App() {
  const [ui] = useState(createUiStore);
  const [simStore] = useState(createSimStore);
  const [engine, setEngine] = useState(null);
  const sceneRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const bottomRef = useRef(null);
  const topRef = useRef(null);
  const metricsRef = useRef(null);
  const mode = useStore(ui, (s) => s.mode);
  const error = useStore(ui, (s) => s.error);
  const narrow = useNarrow();
  const [drawer, setDrawer] = useState(null); // narrow screens: 'left' | 'right' | null

  useEffect(() => {
    let eng = null;
    try {
      eng = createEngine({ host: sceneRef.current, ui, simStore });
      setEngine(eng);
    } catch (e) {
      console.error(e);
      ui.set({ error: 'Không khởi động được đồ hoạ 3D (WebGL): ' + (e && e.message) });
    }
    return () => {
      eng?.dispose();
      setEngine(null);
    };
  }, [ui, simStore]);

  // keep the 3D scene centred in the space the panels leave free
  useLayoutEffect(() => {
    if (!engine) return;
    const measure = () => {
      const w = (el) => (el && el.offsetParent !== null ? el.getBoundingClientRect().width + 12 : 0);
      const h = (el) => (el && el.offsetParent !== null ? el.getBoundingClientRect().height + 12 : 0);
      engine.setInsets({
        left: narrow ? 0 : w(leftRef.current),
        right: narrow ? 0 : w(rightRef.current),
        top: h(topRef.current) + h(metricsRef.current),
        bottom: h(bottomRef.current) * (narrow ? 1 : 0.6),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const r of [leftRef, rightRef, bottomRef, topRef, metricsRef]) if (r.current) ro.observe(r.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [engine, mode, narrow, drawer]);

  useEffect(() => setDrawer(null), [mode]);

  const ctx = useMemo(() => ({ engine, ui, simStore }), [engine, ui, simStore]);
  const leftOpen = !narrow || drawer === 'left';
  const rightOpen = !narrow || drawer === 'right';

  return (
    <AppContext.Provider value={ctx}>
      <div className={`app mode-${mode}${narrow ? ' is-narrow' : ''}`}>
        <div className="scene-host" ref={sceneRef} />
        <div ref={topRef} className="top-wrap">
          <TopBar narrow={narrow} drawer={drawer} setDrawer={setDrawer} />
        </div>
        {error && <div className="fatal">{error}</div>}
        {engine && (
          <>
            {mode === 'explore' ? (
              <>
                <aside ref={leftRef} className={`panel panel-left${leftOpen ? '' : ' is-hidden'}`}>
                  <ServiceList onPick={() => narrow && setDrawer(null)} />
                </aside>
                <aside ref={rightRef} className={`panel panel-right${rightOpen ? '' : ' is-hidden'}`}>
                  <ServiceInfo />
                </aside>
                <div ref={bottomRef} className="dock-bottom">
                  <FlowStepper />
                </div>
              </>
            ) : (
              <>
                <aside ref={leftRef} className={`panel panel-left${leftOpen ? '' : ' is-hidden'}`}>
                  <Palette />
                </aside>
                <aside ref={rightRef} className={`panel panel-right${rightOpen ? '' : ' is-hidden'}`}>
                  <Actions onAction={() => narrow && setDrawer(null)} />
                </aside>
                <div className="dock-top" ref={metricsRef}>
                  <MetricsBar />
                </div>
                <div ref={bottomRef} className="dock-bottom">
                  <EventLog />
                </div>
                <LessonCard />
              </>
            )}
            <PickCard />
            <Intro />
          </>
        )}
      </div>
    </AppContext.Provider>
  );
}
