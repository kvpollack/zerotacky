'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// Master clock. The running time lives in refs and is pushed to subscribers from a
// requestAnimationFrame loop, so only the components that display it re-render at 60fps.
// `timerRunning` is the only React state here and changes on start/stop/reset only.
export function useStopwatch() {
  const [timerRunning, setTimerRunning] = useState(false);
  const startRef = useRef(null); // performance.now() origin while running
  const accumulatedRef = useRef(0); // ms frozen while stopped
  const rafRef = useRef(null);
  const intervalRef = useRef(null); // fallback: rAF pauses when the tab/screen is hidden
  const listenersRef = useRef(new Set());

  const getElapsedMs = useCallback(
    () => (startRef.current !== null ? performance.now() - startRef.current : accumulatedRef.current),
    []
  );
  const getElapsedSeconds = useCallback(() => Math.round(getElapsedMs() / 10) / 100, [getElapsedMs]);

  const notify = useCallback(() => {
    const ms = getElapsedMs();
    listenersRef.current.forEach((fn) => fn(ms));
  }, [getElapsedMs]);

  const stopLoop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    rafRef.current = null;
    intervalRef.current = null;
  };

  const start = useCallback(() => {
    if (startRef.current !== null) return;
    startRef.current = performance.now() - accumulatedRef.current;
    setTimerRunning(true);
    const tick = () => {
      notify();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    intervalRef.current = setInterval(notify, 250);
  }, [notify]);

  // Returns the exact ms at the moment of stopping.
  const stop = useCallback(() => {
    if (startRef.current === null) return accumulatedRef.current;
    const ms = performance.now() - startRef.current;
    accumulatedRef.current = ms;
    startRef.current = null;
    stopLoop();
    setTimerRunning(false);
    notify();
    return ms;
  }, [notify]);

  const toggle = useCallback(() => {
    if (startRef.current !== null) stop();
    else start();
  }, [start, stop]);

  const resetStopwatch = useCallback(() => {
    stopLoop();
    startRef.current = null;
    accumulatedRef.current = 0;
    setTimerRunning(false);
    notify();
  }, [notify]);

  // subscribe(fn) -> unsubscribe. fn receives elapsed ms; called once immediately.
  const subscribe = useCallback(
    (fn) => {
      listenersRef.current.add(fn);
      fn(getElapsedMs());
      return () => listenersRef.current.delete(fn);
    },
    [getElapsedMs]
  );

  useEffect(() => () => stopLoop(), []);

  return { timerRunning, start, stop, toggle, resetStopwatch, getElapsedMs, getElapsedSeconds, subscribe };
}

// For display components only: re-renders the caller at animation rate while running.
export function useElapsedSeconds(subscribe) {
  const [ms, setMs] = useState(0);
  useEffect(() => subscribe(setMs), [subscribe]);
  return Math.round(ms / 10) / 100;
}
