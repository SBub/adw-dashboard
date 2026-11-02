import { describe, expect, it, vi } from "vitest";
import {
  createIdentityStore,
  createRealtimeTracker,
  internalTagAction,
  reportBoundaryError,
  startAnalytics,
} from "./analytics";

const ANON = "0192a1b2-anonymous";

function fakeClient(flag: boolean | undefined, distinctId: string) {
  const state = { flag, distinctId };
  const unsubscribe = vi.fn();
  const client = {
    isFeatureEnabled: vi.fn(() => state.flag),
    onFeatureFlags: vi.fn((_callback: () => void) => unsubscribe),
    get_distinct_id: vi.fn(() => state.distinctId),
    identify: vi.fn((id: string) => {
      state.distinctId = id;
    }),
    reset: vi.fn(() => {
      state.distinctId = ANON;
    }),
  };
  return { client, unsubscribe };
}

describe("createIdentityStore", () => {
  it("is null when the flag is undefined, without reading the distinct id", () => {
    const { client } = fakeClient(undefined, ANON);
    const store = createIdentityStore(client);
    expect(store.getSnapshot()).toBeNull();
    expect(client.get_distinct_id).not.toHaveBeenCalled();
  });

  it("is null when the flag is false", () => {
    const { client } = fakeClient(false, ANON);
    expect(createIdentityStore(client).getSnapshot()).toBeNull();
  });

  it("has a null server snapshot even with the flag on", () => {
    const { client } = fakeClient(true, ANON);
    expect(createIdentityStore(client).getServerSnapshot()).toBeNull();
  });

  it("offers login to an anonymous visitor and flips to logout after it", () => {
    const { client } = fakeClient(true, ANON);
    const store = createIdentityStore(client);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.getSnapshot()).toBe("login");

    store.login();
    expect(client.identify).toHaveBeenCalledTimes(1);
    expect(client.identify).toHaveBeenCalledWith("sveta@issebya.com", {
      email: "sveta@issebya.com",
    });
    expect(listener).toHaveBeenCalled();
    expect(store.getSnapshot()).toBe("logout");
  });

  it("offers logout to the owner and flips to login after it", () => {
    const { client } = fakeClient(true, "sveta@issebya.com");
    const store = createIdentityStore(client);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.getSnapshot()).toBe("logout");

    store.logout();
    expect(client.reset).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalled();
    expect(store.getSnapshot()).toBe("login");
  });

  it("subscribes to flag loads and releases them on unsubscribe", () => {
    const { client, unsubscribe } = fakeClient(true, ANON);
    const store = createIdentityStore(client);
    const listener = vi.fn();
    const release = store.subscribe(listener);
    expect(client.onFeatureFlags).toHaveBeenCalledTimes(1);

    const [callback] = client.onFeatureFlags.mock.calls[0] ?? [];
    callback?.();
    expect(listener).toHaveBeenCalledTimes(1);

    release();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    store.login();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("internalTagAction", () => {
  it("tags on internal=1", () => {
    expect(internalTagAction("?internal=1")).toBe("tag");
  });

  it("untags on internal=0", () => {
    expect(internalTagAction("?internal=0")).toBe("untag");
  });

  it("is null for any other value or no parameter", () => {
    expect(internalTagAction("?internal=yes")).toBeNull();
    expect(internalTagAction("?internal=")).toBeNull();
    expect(internalTagAction("?foo=1")).toBeNull();
    expect(internalTagAction("")).toBeNull();
  });

  it("finds the parameter beside others", () => {
    expect(internalTagAction("?a=b&internal=1")).toBe("tag");
  });

  it("takes the first value when repeated", () => {
    expect(internalTagAction("?internal=1&internal=0")).toBe("tag");
  });
});

const PROD = {
  vercelEnv: "production",
  projectToken: "phc_test",
  host: "https://eu.i.posthog.com",
};

function fakeAnalyticsClient() {
  return { init: vi.fn(), register: vi.fn(), unregister: vi.fn() };
}

describe("startAnalytics", () => {
  it("never initialises an automated browser, even with ?internal=1", () => {
    const client = fakeAnalyticsClient();
    const started = startAnalytics(PROD, { webdriver: true, search: "?internal=1" }, client);
    expect(started).toBe(false);
    expect(client.init).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
    expect(client.unregister).not.toHaveBeenCalled();
  });

  it("initialises a real browser on production without tagging", () => {
    const client = fakeAnalyticsClient();
    expect(startAnalytics(PROD, { webdriver: false, search: "" }, client)).toBe(true);
    expect(client.init).toHaveBeenCalledTimes(1);
    expect(client.init).toHaveBeenCalledWith("phc_test", PROD.host);
    expect(client.register).not.toHaveBeenCalled();
    expect(client.unregister).not.toHaveBeenCalled();
  });

  it("treats an undefined webdriver like false", () => {
    const client = fakeAnalyticsClient();
    startAnalytics(PROD, { webdriver: undefined, search: "" }, client);
    expect(client.init).toHaveBeenCalledTimes(1);
  });

  it("registers internal after init on ?internal=1", () => {
    const client = fakeAnalyticsClient();
    startAnalytics(PROD, { webdriver: false, search: "?internal=1" }, client);
    expect(client.register).toHaveBeenCalledTimes(1);
    expect(client.register).toHaveBeenCalledWith({ internal: true });
    expect(client.init.mock.invocationCallOrder[0]).toBeLessThan(
      client.register.mock.invocationCallOrder[0] ?? 0,
    );
    expect(client.unregister).not.toHaveBeenCalled();
  });

  it("unregisters internal on ?internal=0", () => {
    const client = fakeAnalyticsClient();
    startAnalytics(PROD, { webdriver: false, search: "?internal=0" }, client);
    expect(client.unregister).toHaveBeenCalledTimes(1);
    expect(client.unregister).toHaveBeenCalledWith("internal");
    expect(client.register).not.toHaveBeenCalled();
  });

  it.each([
    ["a preview deploy", { ...PROD, vercelEnv: "preview" }],
    ["no Vercel env", { ...PROD, vercelEnv: undefined }],
    ["a missing token", { ...PROD, projectToken: undefined }],
    ["a missing host", { ...PROD, host: undefined }],
  ])("does nothing with %s", (_label, env) => {
    const client = fakeAnalyticsClient();
    const started = startAnalytics(env, { webdriver: false, search: "?internal=1" }, client);
    expect(started).toBe(false);
    expect(client.init).not.toHaveBeenCalled();
    expect(client.register).not.toHaveBeenCalled();
  });

  it("does nothing without a browser", () => {
    const client = fakeAnalyticsClient();
    expect(() => startAnalytics(PROD, undefined, client)).not.toThrow();
    expect(client.init).not.toHaveBeenCalled();
  });
});

const BROWSER = { webdriver: false, search: "" };

describe("createRealtimeTracker", () => {
  it("sends realtime_connected with reconnect false first and true after", () => {
    const client = { capture: vi.fn() };
    const track = createRealtimeTracker(PROD, BROWSER, client);
    track("SUBSCRIBED");
    track("CHANNEL_ERROR");
    track("SUBSCRIBED");
    track("SUBSCRIBED");
    expect(client.capture.mock.calls).toEqual([
      ["realtime_connected", { reconnect: false }],
      ["realtime_disconnected", { state: "CHANNEL_ERROR" }],
      ["realtime_connected", { reconnect: true }],
      ["realtime_connected", { reconnect: true }],
    ]);
  });

  it("sends realtime_disconnected with each non-subscribed state", () => {
    const client = { capture: vi.fn() };
    const track = createRealtimeTracker(PROD, BROWSER, client);
    track("CHANNEL_ERROR");
    track("TIMED_OUT");
    track("CLOSED");
    expect(client.capture.mock.calls).toEqual([
      ["realtime_disconnected", { state: "CHANNEL_ERROR" }],
      ["realtime_disconnected", { state: "TIMED_OUT" }],
      ["realtime_disconnected", { state: "CLOSED" }],
    ]);
  });

  it.each([
    ["a preview deploy", { ...PROD, vercelEnv: "preview" }],
    ["a local build", { ...PROD, vercelEnv: undefined }],
    ["a missing token", { ...PROD, projectToken: undefined }],
    ["a missing host", { ...PROD, host: undefined }],
  ])("sends nothing on %s", (_label, env) => {
    const client = { capture: vi.fn() };
    const track = createRealtimeTracker(env, BROWSER, client);
    track("SUBSCRIBED");
    track("CLOSED");
    expect(client.capture).not.toHaveBeenCalled();
  });

  it("sends nothing from an automated browser or with no browser", () => {
    const client = { capture: vi.fn() };
    createRealtimeTracker(PROD, { webdriver: true, search: "" }, client)("SUBSCRIBED");
    createRealtimeTracker(PROD, undefined, client)("SUBSCRIBED");
    expect(client.capture).not.toHaveBeenCalled();
  });

  it("never throws when capture throws", () => {
    const client = {
      capture: vi.fn(() => {
        throw new Error("boom");
      }),
    };
    const track = createRealtimeTracker(PROD, BROWSER, client);
    expect(() => track("SUBSCRIBED")).not.toThrow();
  });
});

describe("reportBoundaryError", () => {
  it("sends the error with the boundary and the digest when there is one", () => {
    const client = { captureException: vi.fn() };
    const error = Object.assign(new Error("render failed"), { digest: "123" });
    reportBoundaryError(PROD, BROWSER, client, error, "project");
    reportBoundaryError(PROD, BROWSER, client, new Error("plain"), "section");
    expect(client.captureException).toHaveBeenNthCalledWith(1, error, {
      boundary: "project",
      digest: "123",
    });
    expect(client.captureException.mock.calls[1]?.[1]).toEqual({ boundary: "section" });
  });

  it("sends nothing off production or from an automated browser", () => {
    const client = { captureException: vi.fn() };
    reportBoundaryError(
      { ...PROD, vercelEnv: "preview" },
      BROWSER,
      client,
      new Error("x"),
      "query",
    );
    reportBoundaryError(PROD, { webdriver: true, search: "" }, client, new Error("x"), "query");
    expect(client.captureException).not.toHaveBeenCalled();
  });
});
