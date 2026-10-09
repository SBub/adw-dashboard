import { describe, expect, it } from "vitest";
import type { Run } from "@/types/adw";
import {
  CursorDirectionMismatchError,
  CursorScopeMismatchError,
  HISTORY_PAGE_SIZE,
  type HistoryBookmark,
  UnknownCursorError,
  decodeHistoryBookmark,
  encodeHistoryBookmark,
  historyHref,
  historyItems,
  historyKeyOf,
  historyKeysetFilter,
  historyNewerFilter,
  historyOrderAscending,
  readHistoryBookmark,
  toHistoryPage,
} from "./history-bookmark";

const SLUG = "SBub/adw-toolkit";

function run(adw_id: string, finished_at: string | null, updated_at = finished_at ?? ""): Run {
  return {
    project_id: "00000000-0000-0000-0000-000000000001",
    adw_id,
    issue_number: 1,
    issue_title: null,
    issue_class: "feature",
    branch_name: "feat/x",
    pr_number: null,
    phase: "document",
    status: "completed",
    state: {},
    toolkit_version: "1.0.0",
    started_at: "2026-10-01T09:00:00Z",
    updated_at,
    finished_at,
  };
}

// base64url of arbitrary text, built the same way as the module's encoder.
function b64url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function json(value: unknown): string {
  return b64url(JSON.stringify(value));
}

const bookmark: HistoryBookmark = {
  slug: SLUG,
  direction: "after",
  finished_at: "2026-10-01T12:34:56.123456+00:00",
  adw_id: "d2e29be0",
};

const before: HistoryBookmark = { ...bookmark, direction: "before" };

// n completed rows, newest first, one per day ending on 2026-10-28.
function rowsNewestFirst(n: number): Run[] {
  return Array.from({ length: n }, (_, i) => {
    const day = String(28 - i).padStart(2, "0");
    return run(`aaaa00${String(n - i).padStart(2, "0")}`, `2026-10-${day}T10:00:00+00:00`);
  });
}

function decoded(cursor: { direction: "after" | "before"; cursor: string } | null) {
  if (cursor === null) return null;
  return decodeHistoryBookmark(cursor.cursor, SLUG, cursor.direction);
}

describe("HISTORY_PAGE_SIZE", () => {
  it("is three", () => {
    expect(HISTORY_PAGE_SIZE).toBe(3);
  });
});

describe("encodeHistoryBookmark / decodeHistoryBookmark", () => {
  it("round trips, keeping microseconds and the +00:00 zone verbatim", () => {
    expect(decodeHistoryBookmark(encodeHistoryBookmark(bookmark), SLUG, "after")).toEqual(bookmark);
  });

  it("round trips a before bookmark, keeping its direction", () => {
    expect(decodeHistoryBookmark(encodeHistoryBookmark(before), SLUG, "before")).toEqual(before);
  });

  it("decodeHistoryBookmark rejects a cursor of the other direction", () => {
    expect(() => decodeHistoryBookmark(encodeHistoryBookmark(before), SLUG, "after")).toThrow(
      CursorDirectionMismatchError,
    );
    expect(() => decodeHistoryBookmark(encodeHistoryBookmark(bookmark), SLUG, "before")).toThrow(
      CursorDirectionMismatchError,
    );
  });

  it("encodes to a URL-safe string", () => {
    expect(encodeHistoryBookmark(bookmark)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("ignores extra keys", () => {
    expect(decodeHistoryBookmark(json({ ...bookmark, extra: 1 }), SLUG, "after")).toEqual(bookmark);
  });

  it("throws CursorScopeMismatchError for another project's bookmark", () => {
    const foreign = encodeHistoryBookmark({ ...bookmark, slug: "SBub/other" });
    expect(() => decodeHistoryBookmark(foreign, SLUG, "after")).toThrow(CursorScopeMismatchError);
  });

  const malformed: [string, string][] = [
    ["not base64url", "!!!"],
    ["not JSON", b64url("not json")],
    ["an array", b64url("[]")],
    ["null", b64url("null")],
    [
      "a missing field",
      json({ slug: SLUG, direction: "after", finished_at: bookmark.finished_at }),
    ],
    [
      "a legacy payload without a direction",
      json({ slug: SLUG, finished_at: bookmark.finished_at, adw_id: bookmark.adw_id }),
    ],
    [
      "an old-shape updated_at payload",
      json({
        slug: SLUG,
        direction: "after",
        updated_at: bookmark.finished_at,
        adw_id: bookmark.adw_id,
      }),
    ],
    ["an unknown direction", json({ ...bookmark, direction: "sideways" })],
    ["a non-string field", json({ ...bookmark, adw_id: 42 })],
    ["a word for a timestamp", json({ ...bookmark, finished_at: "yesterday" })],
    ["an impossible timestamp", json({ ...bookmark, finished_at: "2026-13-45T99:00:00Z" })],
    ["a timestamp without a zone", json({ ...bookmark, finished_at: "2026-10-01T12:00:00" })],
    ["an adw_id with a comma", json({ ...bookmark, adw_id: "a,b" })],
    ["an adw_id with a quote", json({ ...bookmark, adw_id: 'a"b' })],
    ["an adw_id with a parenthesis", json({ ...bookmark, adw_id: "a)b" })],
    ["an invalid slug", json({ ...bookmark, slug: "SBub/adw%2Ftoolkit" })],
  ];

  it.each(malformed)("throws UnknownCursorError for %s", (_, cursor) => {
    expect(() => decodeHistoryBookmark(cursor, SLUG, "after")).toThrow(UnknownCursorError);
  });

  it.each(malformed)("reads %s as page one", (_, cursor) => {
    expect(readHistoryBookmark(cursor, undefined, SLUG)).toBeNull();
    expect(readHistoryBookmark(undefined, cursor, SLUG)).toBeNull();
  });
});

describe("readHistoryBookmark", () => {
  it("returns the bookmark of a valid ?after cursor", () => {
    expect(readHistoryBookmark(encodeHistoryBookmark(bookmark), undefined, SLUG)).toEqual(bookmark);
  });

  it("returns the bookmark of a valid ?before cursor", () => {
    expect(readHistoryBookmark(undefined, encodeHistoryBookmark(before), SLUG)).toEqual(before);
  });

  it("reads a cursor in the parameter of the other direction as page one", () => {
    expect(readHistoryBookmark(encodeHistoryBookmark(before), undefined, SLUG)).toBeNull();
    expect(readHistoryBookmark(undefined, encodeHistoryBookmark(bookmark), SLUG)).toBeNull();
  });

  it("reads ?after and ?before together as page one", () => {
    expect(
      readHistoryBookmark(encodeHistoryBookmark(bookmark), encodeHistoryBookmark(before), SLUG),
    ).toBeNull();
  });

  it("reads an absent, empty or repeated parameter as page one", () => {
    expect(readHistoryBookmark(undefined, undefined, SLUG)).toBeNull();
    expect(readHistoryBookmark("", undefined, SLUG)).toBeNull();
    expect(readHistoryBookmark(["a", "b"], undefined, SLUG)).toBeNull();
    expect(readHistoryBookmark(undefined, "", SLUG)).toBeNull();
    expect(readHistoryBookmark(undefined, ["a", "b"], SLUG)).toBeNull();
  });

  it("reads another project's bookmark as page one", () => {
    const foreign = encodeHistoryBookmark({ ...bookmark, slug: "SBub/other" });
    expect(readHistoryBookmark(foreign, undefined, SLUG)).toBeNull();
    const foreignBefore = encodeHistoryBookmark({ ...before, slug: "SBub/other" });
    expect(readHistoryBookmark(undefined, foreignBefore, SLUG)).toBeNull();
  });
});

describe("historyKeysetFilter", () => {
  it("selects rows strictly older than an after bookmark, tie-broken on adw_id", () => {
    expect(historyKeysetFilter(bookmark)).toBe(
      'finished_at.lt."2026-10-01T12:34:56.123456+00:00",and(finished_at.eq."2026-10-01T12:34:56.123456+00:00",adw_id.lt."d2e29be0")',
    );
  });

  it("historyKeysetFilter selects rows strictly newer for a before bookmark", () => {
    expect(historyKeysetFilter(before)).toBe(
      'finished_at.gt."2026-10-01T12:34:56.123456+00:00",and(finished_at.eq."2026-10-01T12:34:56.123456+00:00",adw_id.gt."d2e29be0")',
    );
    expect(historyKeysetFilter(before)).toBe(historyNewerFilter(before));
  });
});

describe("historyKeyOf", () => {
  it("returns the finished_at and adw_id of a completed row", () => {
    const row = run("d2e29be0", "2026-10-01T12:00:00+00:00", "2026-10-08T16:01:24+00:00");
    expect(historyKeyOf(row)).toEqual({
      finished_at: "2026-10-01T12:00:00+00:00",
      adw_id: "d2e29be0",
    });
  });

  it("returns null for a row without finished_at", () => {
    expect(historyKeyOf(run("d2e29be0", null, "2026-10-08T16:01:24+00:00"))).toBeNull();
  });
});

describe("historyOrderAscending", () => {
  it("is ascending only for a before bookmark", () => {
    expect(historyOrderAscending(null)).toBe(false);
    expect(historyOrderAscending(bookmark)).toBe(false);
    expect(historyOrderAscending(before)).toBe(true);
  });
});

describe("historyItems", () => {
  const rows = rowsNewestFirst(4);

  it("keeps the first page of rows as given for page one and an after bookmark", () => {
    expect(historyItems(rows, null)).toEqual(rows.slice(0, 3));
    expect(historyItems(rows, bookmark)).toEqual(rows.slice(0, 3));
  });

  it("historyItems reverses a before page", () => {
    const ascending = [...rows].reverse();
    expect(historyItems(ascending, before)).toEqual([rows[1], rows[2], rows[3]]);
  });

  it("never mutates its input", () => {
    const ascending = Object.freeze([...rows].reverse());
    expect(() => historyItems(ascending, before)).not.toThrow();
    expect(ascending).toEqual([...rows].reverse());
  });
});

describe("toHistoryPage", () => {
  const rows = rowsNewestFirst(8);

  it("toHistoryPage derives page and pageCount for the first page", () => {
    const page = toHistoryPage(rows.slice(0, 3), { slug: SLUG, newer: 0, total: 8 });
    expect(page).toMatchObject({ page: 1, pageCount: 3, hasNewer: false, newerCursor: null });
    expect(page.items).toEqual(rows.slice(0, 3));
    expect(page.olderCursor?.direction).toBe("after");
    expect(decoded(page.olderCursor)).toEqual({
      slug: SLUG,
      direction: "after",
      finished_at: rows[2]?.finished_at,
      adw_id: rows[2]?.adw_id,
    });
  });

  it("toHistoryPage derives page and pageCount for a middle page, the left arrow is page one", () => {
    const page = toHistoryPage(rows.slice(3, 6), { slug: SLUG, newer: 3, total: 8 });
    expect(page).toMatchObject({ page: 2, pageCount: 3, hasNewer: true, newerCursor: null });
    expect(decoded(page.olderCursor)?.adw_id).toBe(rows[5]?.adw_id);
  });

  it("toHistoryPage derives page and pageCount for the last page", () => {
    const page = toHistoryPage(rows.slice(6), { slug: SLUG, newer: 6, total: 8 });
    expect(page).toMatchObject({ page: 3, pageCount: 3, hasNewer: true, olderCursor: null });
    expect(page.newerCursor?.direction).toBe("before");
    expect(decoded(page.newerCursor)).toEqual({
      slug: SLUG,
      direction: "before",
      finished_at: rows[6]?.finished_at,
      adw_id: rows[6]?.adw_id,
    });
  });

  it("builds a cursor from finished_at, not a later updated_at", () => {
    const bumped = run("aaaa0001", "2026-10-01T10:00:00+00:00", "2026-10-08T16:01:24+00:00");
    const page = toHistoryPage([bumped], { slug: SLUG, newer: 0, total: 4 });
    expect(decoded(page.olderCursor)).toEqual({
      slug: SLUG,
      direction: "after",
      finished_at: "2026-10-01T10:00:00+00:00",
      adw_id: "aaaa0001",
    });
  });

  it("breaks a tie on finished_at by adw_id", () => {
    const at = "2026-10-01T10:00:00+00:00";
    const tied = [
      run("aaaa0009", at),
      run("aaaa0008", at),
      run("aaaa0007", at),
      run("aaaa0006", at),
    ];
    const page = toHistoryPage(tied.slice(1, 4), { slug: SLUG, newer: 4, total: 9 });
    const newer = decoded(page.newerCursor);
    const older = decoded(page.olderCursor);
    expect(newer?.adw_id).toBe("aaaa0008");
    expect(older?.adw_id).toBe("aaaa0006");
    expect(newer && historyKeysetFilter(newer)).toBe(
      `finished_at.gt."${at}",and(finished_at.eq."${at}",adw_id.gt."aaaa0008")`,
    );
    expect(older && historyKeysetFilter(older)).toBe(
      `finished_at.lt."${at}",and(finished_at.eq."${at}",adw_id.lt."aaaa0006")`,
    );
  });

  it("has no right arrow when the last row has no finished_at", () => {
    const rows3 = [...rows.slice(0, 2), run("aaaa0099", null, "2026-10-08T16:01:24+00:00")];
    const page = toHistoryPage(rows3, { slug: SLUG, newer: 0, total: 8 });
    expect(page.olderCursor).toBeNull();
  });

  it("has no right arrow when the last page is full", () => {
    const page = toHistoryPage(rows.slice(3, 6), { slug: SLUG, newer: 3, total: 6 });
    expect(page).toMatchObject({ page: 2, pageCount: 2, olderCursor: null });
  });

  it("moves the indicator after a completion on a middle page", () => {
    const page = toHistoryPage(rows.slice(3, 6), { slug: SLUG, newer: 4, total: 9 });
    expect(page).toMatchObject({ page: 3, pageCount: 3, hasNewer: true });
    expect(page.newerCursor?.direction).toBe("before");
    expect(page.olderCursor).not.toBeNull();
  });

  it("never reports fewer pages than the current page", () => {
    const page = toHistoryPage(rows.slice(3, 5), { slug: SLUG, newer: 4, total: 6 });
    expect(page.page).toBe(3);
    expect(page.pageCount).toBe(3);
  });

  it("returns page 1 of 1 with no cursors for an empty history", () => {
    expect(toHistoryPage([], { slug: SLUG, newer: 0, total: 0 })).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      hasNewer: false,
      newerCursor: null,
      olderCursor: null,
    });
  });

  it("never mutates its input", () => {
    const input = Object.freeze(rows.slice(0, 3));
    expect(() => toHistoryPage(input, { slug: SLUG, newer: 0, total: 8 })).not.toThrow();
    expect(input).toEqual(rows.slice(0, 3));
  });

  it("right then left returns the same rows", () => {
    const first = toHistoryPage(rows.slice(0, 3), { slug: SLUG, newer: 0, total: 8 });
    const right = new URL(historyHref(SLUG, first.olderCursor), "http://x").searchParams;
    const after = readHistoryBookmark(right.get("after") ?? undefined, undefined, SLUG);
    expect(after).not.toBeNull();
    const second = toHistoryPage(historyItems(rows.slice(3, 6), after), {
      slug: SLUG,
      newer: 3,
      total: 8,
    });
    expect(second).toMatchObject({ page: 2, hasNewer: true, newerCursor: null });
    // hasNewer with no cursor is page one: the same three rows as first.
    expect(historyHref(SLUG, second.newerCursor)).toBe("/projects/SBub/adw-toolkit");
  });
});

describe("historyHref", () => {
  const afterCursor = { direction: "after" as const, cursor: encodeHistoryBookmark(bookmark) };
  const beforeCursor = { direction: "before" as const, cursor: encodeHistoryBookmark(before) };

  it("links page one without a query", () => {
    expect(historyHref(SLUG, null)).toBe("/projects/SBub/adw-toolkit");
  });

  it("links another page with ?after=<cursor>", () => {
    expect(historyHref(SLUG, afterCursor)).toBe(
      `/projects/SBub/adw-toolkit?after=${afterCursor.cursor}`,
    );
  });

  it("historyHref writes ?before= for a before cursor", () => {
    expect(historyHref(SLUG, beforeCursor)).toBe(
      `/projects/SBub/adw-toolkit?before=${beforeCursor.cursor}`,
    );
  });

  it("links a search with ?q=<text>", () => {
    expect(historyHref(SLUG, null, "forest")).toBe("/projects/SBub/adw-toolkit?q=forest");
  });

  it("keeps the search on another page, q first", () => {
    expect(historyHref(SLUG, afterCursor, "forest")).toBe(
      `/projects/SBub/adw-toolkit?q=forest&after=${afterCursor.cursor}`,
    );
    expect(historyHref(SLUG, beforeCursor, "forest")).toBe(
      `/projects/SBub/adw-toolkit?q=forest&before=${beforeCursor.cursor}`,
    );
  });

  it("percent-encodes the search text", () => {
    const path = "/projects/SBub/adw-toolkit";
    expect(historyHref(SLUG, null, "a b&c")).toBe(`${path}?q=a%20b%26c`);
    expect(historyHref(SLUG, null, "#1/x")).toBe(`${path}?q=%231%2Fx`);
  });

  it("equals the two-argument call when q is null", () => {
    expect(historyHref(SLUG, afterCursor, null)).toBe(historyHref(SLUG, afterCursor));
  });
});
