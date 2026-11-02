import { beforeEach, describe, expect, it, vi } from "vitest";

const captureExceptionImmediate = vi.fn(() => Promise.resolve());
const constructed = vi.fn();
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(token: string, options: unknown) {
      constructed(token, options);
    }
    captureExceptionImmediate = captureExceptionImmediate;
  },
}));
const waitUntil = vi.fn();
vi.mock("@vercel/functions", () => ({ waitUntil }));

const { createRequestErrorReporter, distinctIdFromCookie, POSTHOG_SERVER_HOST, SERVICE } =
  await import("./server-errors");
const { PostHog } = await import("posthog-node");

const PROD = {
  vercelEnv: "production",
  projectToken: "phc_test",
  host: "https://eu.i.posthog.com",
};
const REQUEST = {
  path: "/projects/SBub/repo?q=secret%20search",
  method: "GET",
  headers: {
    cookie: `other=1; ph_phc_test_posthog=${encodeURIComponent(JSON.stringify({ distinct_id: "visitor-1" }))}`,
  },
};
const CONTEXT = {
  routerKind: "App Router" as const,
  routePath: "/(dashboard)/projects/[owner]/[repo]",
  routeType: "render" as const,
  renderSource: "react-server-components" as const,
  revalidateReason: undefined,
  renderType: "dynamic" as const,
};

function realDeps() {
  return {
    makeClient: (token: string, host: string) =>
      new PostHog(token, { host, flushAt: 1, flushInterval: 0 }),
    waitUntil,
  };
}

beforeEach(() => {
  captureExceptionImmediate.mockClear();
  captureExceptionImmediate.mockImplementation(() => Promise.resolve());
  constructed.mockClear();
  waitUntil.mockClear();
});

describe("createRequestErrorReporter", () => {
  it("sends the exception to the EU host, tagged with environment and service", () => {
    const report = createRequestErrorReporter(PROD, realDeps());
    const error = new Error("db down");
    report(error, REQUEST, CONTEXT);

    expect(constructed).toHaveBeenCalledWith("phc_test", {
      host: POSTHOG_SERVER_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
    expect(POSTHOG_SERVER_HOST).toBe("https://eu.i.posthog.com");
    expect(captureExceptionImmediate).toHaveBeenCalledWith(error, "visitor-1", {
      environment: "production",
      service: SERVICE,
      path: "/projects/SBub/repo",
      method: "GET",
      route_path: CONTEXT.routePath,
      route_type: "render",
      render_source: "react-server-components",
    });
    expect(SERVICE).toBe("adw-dashboard");
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("never sends the query string", () => {
    createRequestErrorReporter(PROD, realDeps())(new Error("x"), REQUEST, CONTEXT);
    expect(JSON.stringify(captureExceptionImmediate.mock.calls)).not.toContain("secret");
  });

  it("builds the client once across errors", () => {
    const report = createRequestErrorReporter(PROD, realDeps());
    report(new Error("a"), REQUEST, CONTEXT);
    report(new Error("b"), REQUEST, CONTEXT);
    expect(constructed).toHaveBeenCalledTimes(1);
    expect(captureExceptionImmediate).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a preview deploy", { ...PROD, vercelEnv: "preview" }],
    ["a local build", { ...PROD, vercelEnv: undefined }],
    ["a missing token", { ...PROD, projectToken: undefined }],
    ["a missing host", { ...PROD, host: undefined }],
  ])("does nothing on %s", (_label, env) => {
    createRequestErrorReporter(env, realDeps())(new Error("x"), REQUEST, CONTEXT);
    expect(constructed).not.toHaveBeenCalled();
    expect(captureExceptionImmediate).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("never throws when the client throws", () => {
    captureExceptionImmediate.mockImplementation(() => {
      throw new Error("sdk broke");
    });
    const report = createRequestErrorReporter(PROD, realDeps());
    expect(() => report(new Error("x"), REQUEST, CONTEXT)).not.toThrow();
  });

  it("swallows a failed send", async () => {
    captureExceptionImmediate.mockImplementation(() => Promise.reject(new Error("offline")));
    createRequestErrorReporter(PROD, realDeps())(new Error("x"), REQUEST, CONTEXT);
    const handed = waitUntil.mock.calls[0]?.[0] as Promise<unknown>;
    await expect(handed).resolves.toBeUndefined();
  });

  it("never throws when waitUntil throws", () => {
    const report = createRequestErrorReporter(PROD, {
      ...realDeps(),
      waitUntil: () => {
        throw new Error("no context");
      },
    });
    expect(() => report(new Error("x"), REQUEST, CONTEXT)).not.toThrow();
  });
});

describe("distinctIdFromCookie", () => {
  it("reads the distinct id from the project's cookie", () => {
    expect(distinctIdFromCookie(REQUEST.headers.cookie, "phc_test")).toBe("visitor-1");
  });

  it("is undefined with no cookie, another project's cookie or a malformed one", () => {
    expect(distinctIdFromCookie(undefined, "phc_test")).toBeUndefined();
    expect(distinctIdFromCookie(REQUEST.headers.cookie, "phc_other")).toBeUndefined();
    expect(distinctIdFromCookie("ph_phc_test_posthog=%7Bnot-json", "phc_test")).toBeUndefined();
  });

  it("joins a cookie header sent as an array", () => {
    expect(distinctIdFromCookie(["a=1", REQUEST.headers.cookie], "phc_test")).toBe("visitor-1");
  });
});
