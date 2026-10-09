import { describe, expect, it } from "vitest";
import {
  nextWorkerSnapshot,
  WORKER_STALE_MS,
  type WorkerSnapshot,
  workerState,
} from "./worker-state";

// The module under test never reads the clock: every case passes a fixed NOW
// and fixed heartbeats, so nothing depends on when the suite runs.
const NOW = Date.parse("2026-10-09T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

const FRESH = iso(NOW - 10_000);
const STALE = iso(NOW - 5 * 60_000);
const OLDER = iso(NOW - 2 * 24 * 60 * 60_000);

describe("workerState", () => {
  it("is offline and never seen with no rows", () => {
    expect(workerState([], NOW)).toEqual({ state: "offline", lastBeat: null });
  });

  it("is online with a heartbeat 10 s old", () => {
    expect(workerState([{ heartbeat_at: FRESH }], NOW)).toEqual({
      state: "online",
      lastBeat: FRESH,
    });
  });

  it("is offline with a heartbeat 5 min old, showing that beat", () => {
    expect(workerState([{ heartbeat_at: STALE }], NOW)).toEqual({
      state: "offline",
      lastBeat: STALE,
    });
  });

  it("ignores a stale leftover row next to a live one, in either order", () => {
    const expected = { state: "online", lastBeat: FRESH };
    expect(workerState([{ heartbeat_at: STALE }, { heartbeat_at: FRESH }], NOW)).toEqual(expected);
    expect(workerState([{ heartbeat_at: FRESH }, { heartbeat_at: STALE }], NOW)).toEqual(expected);
  });

  it("is offline at exactly the threshold and online one millisecond inside it", () => {
    expect(workerState([{ heartbeat_at: iso(NOW - WORKER_STALE_MS) }], NOW).state).toBe("offline");
    expect(workerState([{ heartbeat_at: iso(NOW - (WORKER_STALE_MS - 1)) }], NOW).state).toBe(
      "online",
    );
  });

  it("shows the freshest of several stale rows", () => {
    expect(workerState([{ heartbeat_at: OLDER }, { heartbeat_at: STALE }], NOW)).toEqual({
      state: "offline",
      lastBeat: STALE,
    });
  });

  it("parses a Supabase timestamp with microseconds and an offset", () => {
    const beat = "2026-10-09T11:59:50.123456+00:00";
    expect(workerState([{ heartbeat_at: beat }], NOW)).toEqual({ state: "online", lastBeat: beat });
  });
});

describe("nextWorkerSnapshot", () => {
  it("returns the same object when a later poll yields the same state and beat", () => {
    const prev = nextWorkerSnapshot({ state: "unknown" }, [{ heartbeat_at: FRESH }], NOW);
    expect(nextWorkerSnapshot(prev, [{ heartbeat_at: FRESH }], NOW + 5_000)).toBe(prev);
  });

  it("returns a new object when the beat moves", () => {
    const prev: WorkerSnapshot = { state: "online", lastBeat: FRESH };
    const beat = iso(NOW - 1_000);
    const next = nextWorkerSnapshot(prev, [{ heartbeat_at: beat }], NOW);
    expect(next).not.toBe(prev);
    expect(next).toEqual({ state: "online", lastBeat: beat });
  });

  it("returns a new object when time passes and the same beat goes stale", () => {
    const prev: WorkerSnapshot = { state: "online", lastBeat: FRESH };
    const next = nextWorkerSnapshot(prev, [{ heartbeat_at: FRESH }], NOW + WORKER_STALE_MS);
    expect(next).not.toBe(prev);
    expect(next).toEqual({ state: "offline", lastBeat: FRESH });
  });

  it("leaves unknown for a known snapshot on the first read", () => {
    const prev: WorkerSnapshot = { state: "unknown" };
    const next = nextWorkerSnapshot(prev, [], NOW);
    expect(next).not.toBe(prev);
    expect(next).toEqual({ state: "offline", lastBeat: null });
  });
});
