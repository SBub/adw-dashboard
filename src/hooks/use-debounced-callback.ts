import { useEffect, useMemo, useRef } from "react";

interface DebouncedCallback<A extends unknown[]> {
  /** Runs the callback with these arguments after the delay, replacing any pending call. */
  schedule: (...args: A) => void;
  /** Drops the pending call, if any. */
  cancel: () => void;
}

/**
 * A trailing debounce on a plain setTimeout: each schedule restarts the timer,
 * and only the last call within the delay runs. The callback may change on
 * every render; the timer always runs the latest one. Both functions are
 * stable, and the pending timer is cleared on unmount. Reads no clock.
 */
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delayMs: number,
): DebouncedCallback<A> {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(callback);

  useEffect(() => {
    latest.current = callback;
  }, [callback]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return useMemo(
    () => ({
      schedule: (...args: A) => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => latest.current(...args), delayMs);
      },
      cancel: () => clearTimeout(timer.current),
    }),
    [delayMs],
  );
}
