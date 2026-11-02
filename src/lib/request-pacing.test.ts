import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCoalescedRunner,
  createCooldownGate,
  createReconnectBackoff,
  deferWhileVisible,
} from "./request-pacing";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createReconnectBackoff", () => {
  it("doubles from 2 s and caps at 30 s", () => {
    const backoff = createReconnectBackoff({ random: () => 0 });
    const delays = Array.from({ length: 6 }, () => backoff.next());
    expect(delays).toEqual([2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it("adds at most 25% jitter and never exceeds the cap", () => {
    const backoff = createReconnectBackoff({ random: () => 1 });
    const delays = Array.from({ length: 8 }, () => backoff.next());
    expect(delays[0]).toBe(2500);
    for (const delay of delays) expect(delay).toBeLessThanOrEqual(30000);
  });

  it("does not reset on a connection shorter than 60 s", () => {
    const backoff = createReconnectBackoff({ random: () => 0 });
    backoff.next();
    backoff.next();
    backoff.up();
    vi.advanceTimersByTime(59_000);
    backoff.down();
    vi.advanceTimersByTime(10_000);
    expect(backoff.next()).toBe(8000);
  });

  it("resets after 60 s up", () => {
    const backoff = createReconnectBackoff({ random: () => 0 });
    backoff.next();
    backoff.next();
    backoff.up();
    vi.advanceTimersByTime(60_000);
    expect(backoff.next()).toBe(2000);
  });
});

describe("createCoalescedRunner", () => {
  it("runs one catch-up for three SUBSCRIBED inside 1 s", async () => {
    const run = vi.fn(() => Promise.resolve());
    const runner = createCoalescedRunner(run);
    runner.request();
    await vi.advanceTimersByTimeAsync(400);
    runner.request();
    await vi.advanceTimersByTimeAsync(500);
    runner.request();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("skips a request less than 10 s after the previous finish", async () => {
    const run = vi.fn(() => Promise.resolve());
    const runner = createCoalescedRunner(run);
    runner.request();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    runner.request();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4_000);
    runner.request();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("never runs twice at once", async () => {
    let finish: () => void = () => {};
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const runner = createCoalescedRunner(run);
    runner.request();
    await vi.advanceTimersByTimeAsync(1_000);
    runner.request();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(1);
    finish();
  });

  it("runs again right after cancel", async () => {
    const run = vi.fn(() => Promise.resolve());
    const runner = createCoalescedRunner(run);
    runner.request();
    await vi.advanceTimersByTimeAsync(1_000);
    runner.cancel();
    runner.request();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("createCooldownGate", () => {
  it("the worker store polls once for ten visibility flips inside 10 s", () => {
    const gate = createCooldownGate(10_000);
    const passes: boolean[] = [];
    for (let i = 0; i < 10; i += 1) {
      passes.push(gate.tryPass());
      vi.advanceTimersByTime(1_000);
    }
    expect(passes.filter(Boolean)).toHaveLength(1);
    expect(gate.tryPass()).toBe(true);

    vi.advanceTimersByTime(10_000);
    gate.arm();
    vi.advanceTimersByTime(9_999);
    expect(gate.tryPass()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(gate.tryPass()).toBe(true);
  });

  it("opens at once on reset", () => {
    const gate = createCooldownGate(10_000);
    gate.arm();
    gate.reset();
    expect(gate.tryPass()).toBe(true);
  });
});

describe("deferWhileVisible", () => {
  function fakeDocument(visibilityState: DocumentVisibilityState) {
    const target = new EventTarget();
    const doc = {
      visibilityState,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    };
    const setVisibility = (state: DocumentVisibilityState) => {
      doc.visibilityState = state;
      target.dispatchEvent(new Event("visibilitychange"));
    };
    return { doc: doc as unknown as Document, setVisibility };
  }

  it("starts after 2 s visible, not before", () => {
    const { doc } = fakeDocument("visible");
    const start = vi.fn(() => () => {});
    deferWhileVisible(doc, 2_000, start);
    vi.advanceTimersByTime(1_900);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("clears the timer when hidden, and restarts it when visible again", () => {
    const { doc, setVisibility } = fakeDocument("visible");
    const start = vi.fn(() => () => {});
    deferWhileVisible(doc, 2_000, start);
    vi.advanceTimersByTime(1_000);
    setVisibility("hidden");
    vi.advanceTimersByTime(10_000);
    expect(start).not.toHaveBeenCalled();
    setVisibility("visible");
    vi.advanceTimersByTime(1_999);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("starts when a hidden page becomes visible", () => {
    const { doc, setVisibility } = fakeDocument("hidden");
    const start = vi.fn(() => () => {});
    deferWhileVisible(doc, 2_000, start);
    vi.advanceTimersByTime(5_000);
    expect(start).not.toHaveBeenCalled();
    setVisibility("visible");
    vi.advanceTimersByTime(2_000);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("stop before 2 s starts nothing; stop after calls the closer once", () => {
    const early = fakeDocument("visible");
    const earlyStart = vi.fn(() => () => {});
    const stopEarly = deferWhileVisible(early.doc, 2_000, earlyStart);
    vi.advanceTimersByTime(1_000);
    stopEarly();
    vi.advanceTimersByTime(5_000);
    expect(earlyStart).not.toHaveBeenCalled();

    const late = fakeDocument("visible");
    const close = vi.fn();
    const stopLate = deferWhileVisible(late.doc, 2_000, () => close);
    vi.advanceTimersByTime(2_000);
    late.setVisibility("hidden");
    late.setVisibility("visible");
    vi.advanceTimersByTime(5_000);
    stopLate();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
