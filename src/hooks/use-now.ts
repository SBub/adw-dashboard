import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

let now: number | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      notify();
    }, TICK_MS);
    notify();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  return now;
}

function getServerSnapshot() {
  return null;
}

/**
 * The current time in milliseconds, or null until the browser has mounted a
 * subscriber. The clock is read only in subscribe and in the interval
 * callback, which React runs after commit and never in render, so neither
 * prerender pass reads it: both use the null server snapshot, and hydration
 * renders null like the server did before the post-commit subscribe fills it
 * in. getSnapshot returns the stored number, stable between ticks. One
 * interval serves every subscriber and is cleared when the last one leaves;
 * 30 seconds is enough at minute resolution. This is the leaf-level shape
 * issue #3 proposes for the run labels.
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
