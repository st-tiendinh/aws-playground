// Minimal external stores shared by the engine and React (read with useSyncExternalStore).
import { createContext, useContext, useSyncExternalStore } from 'react';
import { DEFAULT_CONFIG } from '../sim/simulation.js';

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      for (const fn of subs) fn();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

// selector must return a stable value while its slice is unchanged
export function useStore(store, selector = (s) => s) {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

const readPref = (k, d) => {
  try {
    const v = localStorage.getItem('awsplay.' + k);
    return v === null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
export const writePref = (k, v) => {
  try {
    localStorage.setItem('awsplay.' + k, JSON.stringify(v));
  } catch {
    /* storage is optional */
  }
};

// UI state: mode, selections, explore stepper, toggles
export function createUiStore() {
  return createStore({
    mode: 'explore', // 'explore' | 'sandbox'
    intro: readPref('intro', true),
    serviceId: 'foundation',
    step: 0,
    stepCount: 0,
    playing: true,
    flowDone: false,
    picked: null,
    sound: readPref('sound', true),
    labels: true,
    quality: readPref('quality', 'high'),
    error: '',
    hint: null,
  });
}

// Sandbox state mirrored from the simulation a few times per second
export function createSimStore() {
  return createStore({
    snap: null,
    history: [],
    events: [],
    lesson: null,
    lessonOpen: false,
    config: DEFAULT_CONFIG,
    presetId: 'single',
    speed: 1,
    paused: false,
  });
}

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
export const useUi = (sel) => useStore(useApp().ui, sel);
export const useSim = (sel) => useStore(useApp().simStore, sel);
