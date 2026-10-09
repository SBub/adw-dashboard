// Keyset (bookmark) pagination of a project's completed runs. Everything that
// decides what a History page is lives here: the page size, the opaque
// `?after=` and `?before=` cursors (a base64url JSON bookmark of the last or
// first row a page showed, with its direction), the PostgREST filters for
// "strictly older" and "strictly newer than the bookmark", the read order, the
// display order, the count-based page split (page N of M) and the page URL.
// Pure: it imports nothing from "@/data" or "next/*", reads no clock, and runs
// in the vitest node pool.
//
// The display order is `finished_at desc, adw_id desc`. finished_at is
// written once, by the terminal save; updated_at is not the key because a
// trigger stamps it on every write (a backfill, a late pr_number), which would
// reorder History. adw_id is unique within a project, so the order is total
// and neither keyset ever repeats or skips a row, even when a run completes at
// the head while a visitor is on a later page.
import { isProjectSlug } from "@/lib/slug";
import type { Run } from "@/types/adw";

/** The one History page size. */
export const HISTORY_PAGE_SIZE = 3;

/**
 * Which way a bookmark pages: `after` reads the rows strictly older than it
 * (the right arrow), `before` the rows strictly newer (the left arrow).
 */
export type HistoryDirection = "after" | "before";

/** The row a History page is bookmarked at, scoped to its project and its direction. */
export interface HistoryBookmark {
  slug: string;
  direction: HistoryDirection;
  finished_at: string;
  adw_id: string;
}

/** The keyset of one row: the two columns of the order. */
type HistoryKey = { finished_at: string; adw_id: string };

/**
 * The keyset of a row, or null for a row without `finished_at`. A completed
 * run always has one, and the History read filters out any row without it, so
 * null only guards the type (`Run.finished_at` is null while a run is live).
 */
export function historyKeyOf({ finished_at, adw_id }: Run): HistoryKey | null {
  return finished_at === null ? null : { finished_at, adw_id };
}

/** An encoded bookmark and the query parameter it travels in. */
export interface HistoryCursor {
  direction: HistoryDirection;
  cursor: string;
}

/**
 * One page of completed runs in display order, its position (`page` of
 * `pageCount`, derived from counts, never from the URL), and the cursors of
 * the two arrows. `hasNewer` with a null `newerCursor` means the left arrow is
 * page one; a null `olderCursor` hides the right arrow.
 */
export interface HistoryPage {
  items: Run[];
  page: number;
  pageCount: number;
  hasNewer: boolean;
  newerCursor: HistoryCursor | null;
  olderCursor: HistoryCursor | null;
}

/** A cursor that does not decode to a valid bookmark. */
export class UnknownCursorError extends Error {
  constructor() {
    super("Unknown cursor");
    this.name = "UnknownCursorError";
  }
}

/** A well-formed cursor of the other direction (a `?before` cursor in `?after`, or the reverse). */
export class CursorDirectionMismatchError extends Error {
  constructor() {
    super("Cursor is for the other direction");
    this.name = "CursorDirectionMismatchError";
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

/** An opaque cursor: `base64url(JSON.stringify({ slug, direction, finished_at, adw_id }))`. */
export function encodeHistoryBookmark({
  slug,
  direction,
  finished_at,
  adw_id,
}: HistoryBookmark): string {
  return toBase64Url(JSON.stringify({ slug, direction, finished_at, adw_id }));
}

function isDirection(value: unknown): value is HistoryDirection {
  return value === "after" || value === "before";
}

/**
 * The bookmark a cursor carries. Throws `UnknownCursorError` on garbage
 * (including a payload with no or an unknown direction, and the older
 * `updated_at` payload, which has no `finished_at`),
 * `CursorScopeMismatchError` when it was handed out for another project and
 * `CursorDirectionMismatchError` when it pages the other way than `direction`.
 * Extra keys in the JSON are ignored; the result is a fresh object.
 */
export function decodeHistoryBookmark(
  cursor: string,
  slug: string,
  direction: HistoryDirection,
): HistoryBookmark {
  let json: unknown;
  try {
    json = JSON.parse(fromBase64Url(cursor));
  } catch {
    throw new UnknownCursorError();
  }

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new UnknownCursorError();
  }
  const { slug: scope, direction: way, finished_at, adw_id } = json as Record<string, unknown>;
  if (!isProjectSlug(scope) || !isDirection(way) || !isTimestamp(finished_at) || !isAdwId(adw_id)) {
    throw new UnknownCursorError();
  }
  if (scope !== slug) throw new CursorScopeMismatchError();
  if (way !== direction) throw new CursorDirectionMismatchError();
  return { slug: scope, direction: way, finished_at, adw_id };
}

function readCursor(
  value: string | string[] | undefined,
  slug: string,
  direction: HistoryDirection,
): HistoryBookmark | null {
  if (typeof value !== "string" || value === "") return null;
  try {
    return decodeHistoryBookmark(value, slug, direction);
  } catch (error) {
    if (
      error instanceof UnknownCursorError ||
      error instanceof CursorScopeMismatchError ||
      error instanceof CursorDirectionMismatchError
    ) {
      return null;
    }
    throw error;
  }
}

function isPresent(value: string | string[] | undefined): boolean {
  return value !== undefined && value !== "";
}

/**
 * The bookmark of a page's `?after` or `?before` parameter, or null for page
 * one. Lenient: absent, repeated, empty, malformed, foreign (another
 * project's), of the other direction, or both parameters at once all mean page
 * one, never an error.
 *
 * Call it outside any "use cache" scope (the page's History islands do): an
 * error thrown inside a cache scope loses its class on the way out, so the
 * caller could not tell a bad cursor from a real failure.
 */
export function readHistoryBookmark(
  after: string | string[] | undefined,
  before: string | string[] | undefined,
  slug: string,
): HistoryBookmark | null {
  if (isPresent(after) && isPresent(before)) return null;
  return readCursor(after, slug, "after") ?? readCursor(before, slug, "before");
}

/**
 * The PostgREST `or` filter for the rows strictly older than a key in the
 * order `finished_at desc, adw_id desc`. Values are double-quoted (the
 * timestamp holds `:` and `.`); validation guarantees neither value contains a
 * character the grammar reserves.
 */
function historyOlderFilter({ finished_at, adw_id }: HistoryKey): string {
  return `finished_at.lt."${finished_at}",and(finished_at.eq."${finished_at}",adw_id.lt."${adw_id}")`;
}

/**
 * The PostgREST `or` filter for the rows strictly newer than a key in the
 * same order: the mirror of the older filter. Also what the data layer counts
 * to number a page.
 */
export function historyNewerFilter({ finished_at, adw_id }: HistoryKey): string {
  return `finished_at.gt."${finished_at}",and(finished_at.eq."${finished_at}",adw_id.gt."${adw_id}")`;
}

/** The keyset filter of a bookmarked page: older for `after`, newer for `before`. */
export function historyKeysetFilter(bookmark: HistoryBookmark): string {
  return bookmark.direction === "after"
    ? historyOlderFilter(bookmark)
    : historyNewerFilter(bookmark);
}

/**
 * Whether the read orders oldest first: only for a `before` bookmark, whose
 * page is the `HISTORY_PAGE_SIZE` rows nearest above it, reached by walking
 * towards the head.
 */
export function historyOrderAscending(bookmark: HistoryBookmark | null): boolean {
  return bookmark?.direction === "before";
}

/**
 * The rows a page shows, in display order (newest first), from a read ordered
 * by historyOrderAscending: at most `HISTORY_PAGE_SIZE`, reversed for a
 * `before` bookmark. Never mutates its input.
 */
export function historyItems(rows: readonly Run[], bookmark: HistoryBookmark | null): Run[] {
  const items = rows.slice(0, HISTORY_PAGE_SIZE);
  return historyOrderAscending(bookmark) ? items.reverse() : items;
}

/** The cursor of a row in a direction, or null for a row without a key. */
function cursorOf(slug: string, direction: HistoryDirection, row: Run): HistoryCursor | null {
  const key = historyKeyOf(row);
  if (key === null) return null;
  return { direction, cursor: encodeHistoryBookmark({ slug, direction, ...key }) };
}

/**
 * One page from its rows in display order and two counts within the same
 * filter: `newer`, the completed runs strictly newer than the first shown row,
 * and `total`. `page` is `1 + ceil(newer / size)` (the steps back to page one
 * along the left arrow), `pageCount` is `ceil(total / size)`, never less than
 * `page`. The left arrow is a `before` cursor of the first row only when the
 * newer rows do not fit one page; otherwise it is page one itself. The right
 * arrow is an `after` cursor of the last row while older rows remain.
 */
export function toHistoryPage(
  items: readonly Run[],
  { slug, newer, total }: { slug: string; newer: number; total: number },
): HistoryPage {
  const page = 1 + Math.ceil(newer / HISTORY_PAGE_SIZE);
  const pageCount = Math.max(Math.ceil(total / HISTORY_PAGE_SIZE), page);
  const first = items.at(0);
  const last = items.at(-1);
  return {
    items: [...items],
    page,
    pageCount,
    hasNewer: newer > 0,
    newerCursor:
      newer > HISTORY_PAGE_SIZE && first !== undefined ? cursorOf(slug, "before", first) : null,
    olderCursor:
      newer + items.length < total && last !== undefined ? cursorOf(slug, "after", last) : null,
  };
}

/**
 * The project page's URL for a History page: page one without a cursor, any
 * other with `?after=<cursor>` or `?before=<cursor>` by the cursor's direction
 * (base64url needs no further encoding). A search text (already normalised by
 * readHistoryQuery) comes first as a percent-encoded `?q=`, so paging inside a
 * search keeps the filter.
 */
export function historyHref(
  slug: string,
  cursor: HistoryCursor | null,
  q: string | null = null,
): string {
  const params = [];
  if (q !== null) params.push(`q=${encodeURIComponent(q)}`);
  if (cursor !== null) params.push(`${cursor.direction}=${cursor.cursor}`);
  const path = `/projects/${slug}`;
  return params.length === 0 ? path : `${path}?${params.join("&")}`;
}
