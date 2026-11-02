// Request pacing for the browser's Realtime channel and the worker poll
// (issue #240). A crawler doing about 100 full page loads a minute cost a
// socket and a full catch-up per load, and a socket that opened then dropped
// reconnected every ~4 s forever, because realtime-js resets its backoff on
// every open. These helpers defer the channel, pace its reconnects, coalesce
// its catch-up reads and throttle the worker poll.
//
// This module reads no clock: every duration is a setTimeout that flips a
// flag, so the codebase's three clock reads stay three, and Vitest's fake
// timers drive every case.

interface ReconnectBackoffOptions {
  baseMs?: number;
  capMs?: number;
  stableMs?: number;
  random?: () => number;
}

/**
 * The socket's reconnect delay, for `realtime.reconnectAfterMs`. Grows 2, 4,
 * 8, 16, 30, 30 ... s, each up to 25% longer, never above 30 s. It ignores the
 * `tries` argument realtime-js passes: that counter restarts at 1 after every
 * open, which is the reconnect loop this replaces. Its own counter resets only
 * once the channel has stayed up for `stableMs` (`up()` starts that timer,
 * `down()` cancels it).
 *
 * Why these numbers: with a socket that drops 3 s after each open, opens fall
 * at about 2, 7, 14, 25, 44 s and then every 33 s, so at most 5 or 6 sockets
 * in the first minute instead of 15.
 */
export function createReconnectBackoff({
  baseMs = 2_000,
  capMs = 30_000,
  stableMs = 60_000,
  random = Math.random,
}: ReconnectBackoffOptions = {}): { next(): number; up(): void; down(): void } {
  let attempts = 0;
  let stableTimer: ReturnType<typeof setTimeout> | undefined;

  function clearStable() {
    clearTimeout(stableTimer);
    stableTimer = undefined;
  }

  return {
    next() {
      attempts += 1;
      const step = Math.min(capMs, baseMs * 2 ** (attempts - 1));
      return Math.min(capMs, Math.round(step * (1 + 0.25 * random())));
    },
    up() {
      clearStable();
      stableTimer = setTimeout(() => {
        stableTimer = undefined;
        attempts = 0;
      }, stableMs);
    },
    down() {
      clearStable();
    },
  };
}

interface CoalescedRunnerOptions {
  debounceMs?: number;
  cooldownMs?: number;
}

/**
 * Runs `run` once per burst of requests: requests within `debounceMs` of the
 * first give one run, a run never starts while another is in flight, and a
 * run requested less than `cooldownMs` after the previous one finished is
 * skipped. `cancel()` puts it back to a fresh state, so the next request runs.
 */
export function createCoalescedRunner(
  run: () => Promise<void>,
  { debounceMs = 1_000, cooldownMs = 10_000 }: CoalescedRunnerOptions = {},
): { request(): void; cancel(): void } {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let cooldownTimer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let coolingDown = false;

  async function fire() {
    debounceTimer = undefined;
    if (inFlight || coolingDown) return;
    inFlight = true;
    try {
      await run();
    } finally {
      inFlight = false;
      coolingDown = true;
      cooldownTimer = setTimeout(() => {
        cooldownTimer = undefined;
        coolingDown = false;
      }, cooldownMs);
    }
  }

  return {
    request() {
      if (debounceTimer !== undefined) return;
      debounceTimer = setTimeout(() => void fire(), debounceMs);
    },
    cancel() {
      clearTimeout(debounceTimer);
      clearTimeout(cooldownTimer);
      debounceTimer = undefined;
      cooldownTimer = undefined;
      coolingDown = false;
    },
  };
}

/**
 * A gate that lets one caller through per `ms`. `arm()` closes it for `ms`
 * (restarting the timer), `tryPass()` returns false while closed and otherwise
 * arms it and returns true, `reset()` opens it at once.
 */
export function createCooldownGate(ms: number): {
  tryPass(): boolean;
  arm(): void;
  reset(): void;
} {
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function arm() {
    clearTimeout(timer);
    closed = true;
    timer = setTimeout(() => {
      timer = undefined;
      closed = false;
    }, ms);
  }

  return {
    tryPass() {
      if (closed) return false;
      arm();
      return true;
    },
    arm,
    reset() {
      clearTimeout(timer);
      timer = undefined;
      closed = false;
    },
  };
}

type VisibilityDocument = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

/**
 * Calls `start` once the document has been visible for `delayMs` in one
 * stretch: hidden before that clears the timer, and visible again starts a new
 * one. Once started it stops listening (what `start` opened stays open while
 * hidden). Returns the stop function: it clears the timer, removes the
 * listener and calls the closer `start` returned, if it ran.
 */
export function deferWhileVisible(
  doc: VisibilityDocument,
  delayMs: number,
  start: () => () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let close: (() => void) | undefined;

  function schedule() {
    if (timer !== undefined || close !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      doc.removeEventListener("visibilitychange", onVisibility);
      close = start();
    }, delayMs);
  }

  function onVisibility() {
    if (doc.visibilityState === "visible") {
      schedule();
    } else {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  doc.addEventListener("visibilitychange", onVisibility);
  if (doc.visibilityState === "visible") schedule();

  return () => {
    clearTimeout(timer);
    timer = undefined;
    doc.removeEventListener("visibilitychange", onVisibility);
    close?.();
    close = undefined;
  };
}
