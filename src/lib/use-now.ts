"use client";

import { useSyncExternalStore } from "react";

/**
 * A ticking "now" for components that render relative time, built on
 * useSyncExternalStore over a module-level store.
 *
 * Why this shape, and not Date.now() in render or a useState + setInterval.
 * With cacheComponents on, Next prerenders client components too, and in that
 * pass a clock read counts as IO: the first Date.now() aborts the client
 * prerender and whatever has not rendered yet ships as its Suspense fallback.
 * The runs pane would leave the static HTML as "Loading runs...". A
 * useSyncExternalStore hook sidesteps that because React never calls
 * getSnapshot on the server or during hydration; it calls getServerSnapshot
 * instead, and here that returns the parsed `serverNow` argument, a value that
 * came out of the data layer rather than the clock. So:
 *
 * - During the server render (and the build-time prerender) no clock is read.
 *   The labels in the static HTML are therefore relative to `serverNow`, which
 *   the caller passes as the data's fetched_at: the moment the cached rows were
 *   read, not the moment the page is viewed. A page served from the cache a
 *   while later still says what the rows said when they were fetched; the
 *   browser corrects it below.
 * - During hydration React again uses getServerSnapshot, so the first client
 *   render produces the same labels as the server and nothing mismatches.
 * - Right after hydration React compares getSnapshot() with the hydrated
 *   value, finds the live clock ahead, and re-renders once with it. From then
 *   on the store ticks every TICK_MS and the labels follow.
 *
 * The store keeps the current time in a module variable that the tick
 * refreshes, so getSnapshot returns the same number across the repeated calls
 * React makes within one render (a getSnapshot that returned Date.now()
 * directly could straddle a millisecond and trip React's consistency check).
 * The interval starts with the first subscriber and stops with the last, so an
 * idle page holds no timer.
 */

const TICK_MS = 30_000;

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = 0;

function tick() {
  now = Date.now();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    now = Date.now();
    timer = setInterval(tick, TICK_MS);
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
  // Only reached in the browser (see above). With a subscriber present the
  // tick keeps `now` fresh. Without one (a fresh mount, before the subscribe
  // effect has run) the value may be stale, so refresh it, but only when it is
  // at least a second old: consecutive calls within one render then agree.
  if (timer === null && Date.now() - now >= 1000) now = Date.now();
  return now;
}

/**
 * Epoch milliseconds for "now": `serverNow` on the server and while hydrating,
 * the live clock afterwards, refreshed every 30 seconds. Pass the data's
 * fetched_at so the server markup and the first client render agree.
 */
export function useNow(serverNow: string): number {
  const serverSnapshot = Date.parse(serverNow);
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}
