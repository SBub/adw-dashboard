"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Resend } from "resend";
import {
  HIRE_RECIPIENT,
  hireBody,
  hireSubject,
  parseHireRequest,
  type HireErrorCode,
} from "@/lib/hire-request";

/**
 * The /hire form's action: verifies the visitor with Cloudflare Turnstile,
 * validates the fields and sends one plain-text email through Resend, then
 * redirects back to /hire with the outcome.
 *
 * A Server Action is a public endpoint: anyone who can reach the site can post
 * to it with any fields. So nothing is sent without a passed Turnstile check
 * (Siteverify answering success), and the recipient is the constant
 * HIRE_RECIPIENT (src/lib/hire-request.ts), never taken from input; an extra
 * `to` field in the post is simply never read. The visitor's address is only
 * the reply-to, after parseHireRequest has rejected any control character in
 * it. RESEND_API_KEY, RESEND_FROM_EMAIL and TURNSTILE_SECRET_KEY are
 * server-only and read here and nowhere else. The redirect carries a fixed
 * code only, never input or a provider's error text. This is the only export:
 * every exported function of a "use server" file is a public action.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 10_000;

// Logged once per server process, not once per rejected request, as in the
// /api/revalidate handler.
let warnedUnconfigured = false;

type Config = { apiKey: string; from: string; turnstileSecret: string };

function readConfig(): Config | null {
  const env = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  };
  const missing = Object.entries(env)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.error(`sendHireRequest: ${missing.join(", ")} not set; rejecting every request`);
    }
    return null;
  }
  return {
    apiKey: env.RESEND_API_KEY as string,
    from: env.RESEND_FROM_EMAIL as string,
    turnstileSecret: env.TURNSTILE_SECRET_KEY as string,
  };
}

/** The client IP for Siteverify: the first x-forwarded-for entry, else x-real-ip. */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return h.get("x-real-ip")?.trim() || null;
}

/** True only when Siteverify answers 200 with success: true. Any failure is false. */
async function verifyTurnstile(secret: string, token: string): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token });
  const ip = await clientIp();
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`sendHireRequest: Siteverify answered ${response.status}`);
      return false;
    }
    const result: unknown = await response.json();
    if (typeof result !== "object" || result === null) return false;
    const { success, "error-codes": errorCodes } = result as Record<string, unknown>;
    if (success === true) return true;
    console.error("sendHireRequest: Turnstile check failed", errorCodes);
    return false;
  } catch (error) {
    console.error("sendHireRequest: Siteverify request failed", (error as Error)?.name);
    return false;
  }
}

async function handle(formData: FormData): Promise<"sent" | HireErrorCode> {
  const config = readConfig();
  if (config === null) return "send";

  const token = formData.get("cf-turnstile-response");
  if (typeof token !== "string" || token === "") return "verification";
  if (!(await verifyTurnstile(config.turnstileSecret, token))) return "verification";

  const request = parseHireRequest(formData);
  if (request === null) return "invalid";

  try {
    const { error } = await new Resend(config.apiKey).emails.send({
      from: config.from,
      to: HIRE_RECIPIENT,
      replyTo: request.email,
      subject: hireSubject(request),
      text: hireBody(request),
    });
    if (error) {
      console.error("sendHireRequest: Resend rejected the email", error.name, error.message);
      return "send";
    }
  } catch (error) {
    const { name, message } = error as Error;
    console.error("sendHireRequest: Resend request failed", name, message);
    return "send";
  }
  return "sent";
}

export async function sendHireRequest(formData: FormData): Promise<never> {
  const outcome = await handle(formData);
  // Outside any try: redirect throws to do its work.
  redirect(outcome === "sent" ? "/hire?sent=1" : `/hire?error=${outcome}`);
}
