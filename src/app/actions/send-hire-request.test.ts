import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cloudflare's documented Turnstile test secrets: one always passes, one
// always fails. The fetch stub below answers Siteverify the way Cloudflare
// does for each, so no request leaves the process.
const PASS_SECRET = "1x0000000000000000000000000000000AA";
const FAIL_SECRET = "2x0000000000000000000000000000000AA";
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_ANSWERS = new Map<string, object>([
  [PASS_SECRET, { success: true }],
  [FAIL_SECRET, { success: false, "error-codes": ["invalid-input-response"] }],
]);

const send = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return { emails: { send } };
  }),
}));

const fetchStub = vi.fn(async (url: string | URL, init?: RequestInit) => {
  if (String(url) !== SITEVERIFY_URL) throw new Error(`unexpected fetch to ${String(url)}`);
  const posted = new URLSearchParams(init?.body as URLSearchParams).get("secret") ?? "";
  return Response.json(SITEVERIFY_ANSWERS.get(posted) ?? { success: false });
});

const VISITOR = {
  offer: "AI consulting",
  email: "ada@example.com",
  name: "Ada Lovelace",
  motivation: "I would like to talk about an AI consulting engagement.",
};

function form(fields: Record<string, string> = {}, response: string | null = "XXXX.DUMMY.TOKEN") {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...VISITOR, ...fields })) data.append(key, value);
  if (response !== null) data.append("cf-turnstile-response", response);
  return data;
}

// A fresh module per test, so its log-once flag starts unset.
async function submit(data: FormData): Promise<string> {
  const { sendHireRequest } = await import("./send-hire-request");
  try {
    await sendHireRequest(data);
  } catch (error) {
    const match = /^REDIRECT (.*)$/.exec((error as Error).message);
    if (match?.[1] !== undefined) return match[1];
    throw error;
  }
  throw new Error("sendHireRequest returned without redirecting");
}

function expectNoInput(url: string) {
  for (const value of Object.values(VISITOR)) {
    expect(url).not.toContain(value);
    expect(url).not.toContain(encodeURIComponent(value));
  }
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", fetchStub);
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "Hire form <hire-form@example.com>");
  vi.stubEnv("TURNSTILE_SECRET_KEY", PASS_SECRET);
  send.mockResolvedValue({ data: { id: "x" }, error: null });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  consoleError.mockRestore();
});

describe("sendHireRequest", () => {
  it("sends one email to the fixed recipient after a passed check", async () => {
    const url = await submit(form());

    expect(url).toBe("/hire?sent=1");
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [fetchUrl, init] = fetchStub.mock.calls[0] ?? [];
    expect(String(fetchUrl)).toBe(SITEVERIFY_URL);
    const body = new URLSearchParams(init?.body as URLSearchParams);
    expect(body.get("remoteip")).toBe("203.0.113.7");
    expect(body.get("response")).toBe("XXXX.DUMMY.TOKEN");

    expect(send).toHaveBeenCalledTimes(1);
    const email = send.mock.calls[0]?.[0];
    expect(email).toMatchObject({
      from: "Hire form <hire-form@example.com>",
      to: "hire@issebya.com",
      replyTo: "ada@example.com",
      subject: "Hire: AI consulting - Ada Lovelace",
    });
    expect(email.text).toContain(VISITOR.motivation);
  });

  it("does not send when Siteverify fails the token", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", FAIL_SECRET);
    const url = await submit(form());
    expect(url).toBe("/hire?error=verification");
    expect(send).not.toHaveBeenCalled();
    expectNoInput(url);
  });

  it.each([
    ["missing", null],
    ["empty", ""],
  ])("does not call Siteverify when the token is %s", async (_label, response) => {
    expect(await submit(form({}, response))).toBe("/hire?error=verification");
    expect(fetchStub).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send when Siteverify throws", async () => {
    fetchStub.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await submit(form())).toBe("/hire?error=verification");
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send when Siteverify answers non-OK", async () => {
    fetchStub.mockResolvedValueOnce(new Response("oops", { status: 500 }));
    expect(await submit(form())).toBe("/hire?error=verification");
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send when Siteverify answers a non-JSON body", async () => {
    fetchStub.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    expect(await submit(form())).toBe("/hire?error=verification");
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects invalid input after a passed check", async () => {
    const url = await submit(form({ motivation: "Too short." }));
    expect(url).toBe("/hire?error=invalid");
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("never takes the recipient from the form", async () => {
    const url = await submit(
      form({ to: "attacker@example.com", recipient: "attacker@example.com" }),
    );
    expect(url).toBe("/hire?sent=1");
    expect(send).toHaveBeenCalledTimes(1);
    const email = send.mock.calls[0]?.[0];
    expect(email.to).toBe("hire@issebya.com");
    expect(JSON.stringify(email)).not.toContain("attacker@example.com");
  });

  it("answers send when Resend returns an error", async () => {
    send.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "Invalid `from` field." },
    });
    const url = await submit(form());
    expect(url).toBe("/hire?error=send");
    expectNoInput(url);
  });

  it("answers send when Resend throws", async () => {
    send.mockRejectedValueOnce(new Error("aborted"));
    expect(await submit(form())).toBe("/hire?error=send");
  });

  it.each(["RESEND_API_KEY", "RESEND_FROM_EMAIL", "TURNSTILE_SECRET_KEY"])(
    "rejects without verifying or sending when %s is unset, logging once",
    async (name) => {
      vi.stubEnv(name, "");
      expect(await submit(form())).toBe("/hire?error=send");
      // Same module instance: the second call must not log again.
      const { sendHireRequest } = await import("./send-hire-request");
      await expect(sendHireRequest(form())).rejects.toThrow("REDIRECT /hire?error=send");

      expect(fetchStub).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledTimes(1);
      const logged = String(consoleError.mock.calls[0]?.[0]);
      expect(logged).toContain(name);
      expect(logged).not.toContain(PASS_SECRET);
    },
  );
});
