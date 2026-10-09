// The /hire form's request: parsing and validating the posted fields, the
// email's subject and body, and the status the page reads back from its
// searchParams after the action redirects. Pure (no env, no clock, no I/O), so
// every rule here is unit-tested and the action only wires it to the network.
import { OFFERS, type Offer } from "@/content/hire";

/** The one address the form sends to. Never taken from input. */
export const HIRE_RECIPIENT = "hire@issebya.com";

export const MOTIVATION_MIN = 20;
export const MOTIVATION_MAX = 4000;
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;

export type HireErrorCode = "verification" | "invalid" | "send";

export type HireRequest = { offer: Offer; email: string; name: string; motivation: string };

export type HireStatus = { kind: "sent" } | { kind: "error"; code: HireErrorCode } | null;

/** Fixed messages for each code. They never contain input. */
export const HIRE_ERROR_MESSAGES: Record<HireErrorCode, string> = {
  verification: "We could not verify you are human. Please try again.",
  invalid: "Some fields were not valid. Check them and send again.",
  send: "The message could not be sent. Please try again later.",
};

// C0 (CR and LF included), DEL and C1 control characters.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const CONTROL_RUNS = /[\u0000-\u001f\u007f-\u009f]+/g;
const LINE_BREAKS = /[\r\n]+/g;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isOffer(value: string): value is Offer {
  return (OFFERS as readonly string[]).includes(value);
}

/** A field's value when it is a string; a missing field or a File is null. */
function text(formData: FormData, field: string): string | null {
  const value = formData.get(field);
  return typeof value === "string" ? value : null;
}

/**
 * The validated request, or null when any field is invalid. The email may not
 * contain a control character (it becomes the reply-to header); the name is
 * flattened to one line (it goes in the subject); the motivation keeps its
 * newlines (it goes in the body only).
 */
export function parseHireRequest(formData: FormData): HireRequest | null {
  const offer = text(formData, "offer");
  const rawEmail = text(formData, "email");
  const rawName = text(formData, "name");
  const rawMotivation = text(formData, "motivation");
  if (offer === null || rawEmail === null || rawMotivation === null) return null;
  if (rawName === null && formData.has("name")) return null;

  if (!isOffer(offer)) return null;

  const email = rawEmail.trim();
  if (CONTROL.test(email) || email.length > EMAIL_MAX || !EMAIL.test(email)) return null;

  const name = (rawName ?? "")
    .replace(CONTROL_RUNS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX)
    .trim();

  const motivation = rawMotivation.replace(/\r\n/g, "\n").trim();
  if (motivation.length < MOTIVATION_MIN || motivation.length > MOTIVATION_MAX) return null;

  return { offer, email, name, motivation };
}

/** "Hire: <offer> - <name or email>", with any line break stripped. */
export function hireSubject(r: HireRequest): string {
  return `Hire: ${r.offer} - ${r.name || r.email}`.replace(LINE_BREAKS, " ");
}

/** The plain-text body: the fields, a blank line, then the motivation. */
export function hireBody(r: HireRequest): string {
  return [
    `Offer: ${r.offer}`,
    `Name: ${r.name || "(not given)"}`,
    `Email: ${r.email}`,
    "",
    r.motivation,
  ].join("\n");
}

function isErrorCode(value: string): value is HireErrorCode {
  return Object.hasOwn(HIRE_ERROR_MESSAGES, value);
}

/**
 * The page's status from its searchParams: `?sent=1` or a known `?error=`
 * code. Anything else (an unknown code, a repeated param) is null, so a
 * hand-edited URL shows the plain form.
 */
export function hireStatus(params: {
  sent?: string | string[];
  error?: string | string[];
}): HireStatus {
  if (params.sent === "1") return { kind: "sent" };
  const { error } = params;
  if (typeof error === "string" && isErrorCode(error)) return { kind: "error", code: error };
  return null;
}
