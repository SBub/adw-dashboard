// Keyset (bookmark) pagination of a project's completed runs. Everything that
// decides what a History page is lives here: the page size, the opaque
// `?after=` cursor (a base64url JSON bookmark of the last row a page showed),
// the PostgREST filter for "strictly older than the bookmark", the N + 1 page
// split and the page URL. Pure: it imports nothing from "@/data" or "next/*",
// reads no clock, and runs in the vitest node pool.
//
// The order is `updated_at desc, adw_id desc`. adw_id is unique within a
// project, so the order is total and the strictly-older keyset never repeats
// or skips a row, even when a run completes at the head while a visitor is on
// a later page.
import { isProjectSlug } from "@/lib/slug";
import type { Run } from "@/types/adw";

/** The one History page size; the data layer fetches one row more to know whether a next page exists. */
export const HISTORY_PAGE_SIZE = 3;

/** The last row a History page showed, scoped to its project. */
export interface HistoryBookmark {
  slug: string;
  updated_at: string;
  adw_id: string;
}

/** One page of completed runs and the cursor of the next (older) page, or null on the last page. */
export interface HistoryPage {
  items: Run[];
  nextCursor: string | null;
}

/** A cursor that does not decode to a valid bookmark. */
export class UnknownCursorError extends Error {
  constructor() {
    super("Unknown cursor");
    this.name = "UnknownCursorError";
  }
}

/** A well-formed cursor handed out for a different project than the request's. */
export class CursorScopeMismatchError extends Error {
  constructor() {
    super("Cursor is for a different project");
    this.name = "CursorScopeMismatchError";
  }
}

// base64url via btoa/atob + TextEncoder/TextDecoder rather than `Buffer`, so
// the codec works in node and in the browser alike.
function toBase64Url(text: string): string {
  const binary = Array.from(new TextEncoder().encode(text), (byte) =>
    String.fromCharCode(byte),
  ).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

// An ISO 8601 timestamp with a zone, as Postgres renders a timestamptz (up to
// microseconds). Kept verbatim: a round trip through Date would truncate it to
// milliseconds and the tie-break's `eq` would never match the stored value.
// Two flat patterns (whole seconds, fractional seconds) rather than one with an
// optional quantified group, which the unsafe-regex lint rule rejects.
const WHOLE_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;
const FRACTIONAL_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,6}(Z|[+-]\d{2}:\d{2})$/;

// adw ids are 8 hex characters today. The looser set still excludes every
// character PostgREST's `or` grammar reserves (`,`, `(`, `)`, `"`).
const ADW_ID = /^[A-Za-z0-9_-]{1,64}$/;

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (WHOLE_SECONDS.test(value) || FRACTIONAL_SECONDS.test(value)) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isAdwId(value: unknown): value is string {
  return typeof value === "string" && ADW_ID.test(value);
}

/** An opaque cursor: `base64url(JSON.stringify({ slug, updated_at, adw_id }))`. */
export function encodeHistoryBookmark({ slug, updated_at, adw_id }: HistoryBookmark): string {
  return toBase64Url(JSON.stringify({ slug, updated_at, adw_id }));
}

/**
 * The bookmark a cursor carries. Throws `UnknownCursorError` on garbage and
 * `CursorScopeMismatchError` when it was handed out for another project.
 * Extra keys in the JSON are ignored; the result is a fresh object.
 */
export function decodeHistoryBookmark(cursor: string, slug: string): HistoryBookmark {
  let json: unknown;
  try {
    json = JSON.parse(fromBase64Url(cursor));
  } catch {
    throw new UnknownCursorError();
  }

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new UnknownCursorError();
  }
  const { slug: scope, updated_at, adw_id } = json as Record<string, unknown>;
  if (!isProjectSlug(scope) || !isTimestamp(updated_at) || !isAdwId(adw_id)) {
    throw new UnknownCursorError();
  }
  if (scope !== slug) throw new CursorScopeMismatchError();
  return { slug: scope, updated_at, adw_id };
}

/**
 * The bookmark of a page's `?after` parameter, or null for page one. Lenient:
 * absent, repeated, empty, malformed or foreign (another project's) all mean
 * page one, never an error.
 *
 * Call it outside any "use cache" scope (the page's History islands do): an
 * error thrown inside a cache scope loses its class on the way out, so the
 * caller could not tell a bad cursor from a real failure.
 */
export function readHistoryBookmark(
  after: string | string[] | undefined,
  slug: string,
): HistoryBookmark | null {
  if (typeof after !== "string" || after === "") return null;
  try {
    return decodeHistoryBookmark(after, slug);
  } catch (error) {
    if (error instanceof UnknownCursorError || error instanceof CursorScopeMismatchError) {
      return null;
    }
    throw error;
  }
}

/**
 * The PostgREST `or` filter for the rows strictly older than the bookmark in
 * the order `updated_at desc, adw_id desc`. Values are double-quoted (the
 * timestamp holds `:` and `.`); validation guarantees neither value contains a
 * character the grammar reserves.
 */
export function historyKeysetFilter({ updated_at, adw_id }: HistoryBookmark): string {
  return `updated_at.lt."${updated_at}",and(updated_at.eq."${updated_at}",adw_id.lt."${adw_id}")`;
}

/**
 * One page from a query result of at most `HISTORY_PAGE_SIZE + 1` rows, already
 * ordered. The extra row only says a next page exists; the cursor is built from
 * the last row shown. Never mutates its input.
 */
export function toHistoryPage(rows: readonly Run[], slug: string): HistoryPage {
  const items = rows.slice(0, HISTORY_PAGE_SIZE);
  const last = items.at(-1);
  const nextCursor =
    rows.length > HISTORY_PAGE_SIZE && last !== undefined
      ? encodeHistoryBookmark({ slug, updated_at: last.updated_at, adw_id: last.adw_id })
      : null;
  return { items, nextCursor };
}

/**
 * The project page's URL for a History page: page one without a query, any
 * other with `?after=<cursor>` (base64url needs no further encoding).
 */
export function historyHref(slug: string, cursor: string | null): string {
  const path = `/projects/${slug}`;
  return cursor === null ? path : `${path}?after=${cursor}`;
}
