import { describe, expect, it } from "vitest";
import type { Run } from "@/types/adw";
import {
  CursorScopeMismatchError,
  HISTORY_PAGE_SIZE,
  type HistoryBookmark,
  UnknownCursorError,
  decodeHistoryBookmark,
  encodeHistoryBookmark,
  historyHref,
  historyKeysetFilter,
  readHistoryBookmark,
  toHistoryPage,
} from "./history-bookmark";

const SLUG = "SBub/adw-toolkit";

function run(adw_id: string, updated_at: string): Run {
  return {
    project_id: "00000000-0000-0000-0000-000000000001",
    adw_id,
    issue_number: 1,
    issue_class: "feature",
    branch_name: "feat/x",
    phase: "document",
    status: "completed",
    state: {},
    toolkit_version: "1.0.0",
    started_at: "2026-10-01T09:00:00Z",
    updated_at,
    finished_at: updated_at,
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
  updated_at: "2026-10-01T12:34:56.123456+00:00",
  adw_id: "d2e29be0",
};

describe("HISTORY_PAGE_SIZE", () => {
  it("is three", () => {
    expect(HISTORY_PAGE_SIZE).toBe(3);
  });
});

describe("encodeHistoryBookmark / decodeHistoryBookmark", () => {
  it("round trips, keeping microseconds and the +00:00 zone verbatim", () => {
    expect(decodeHistoryBookmark(encodeHistoryBookmark(bookmark), SLUG)).toEqual(bookmark);
  });

  it("encodes to a URL-safe string", () => {
    expect(encodeHistoryBookmark(bookmark)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("ignores extra keys", () => {
    expect(decodeHistoryBookmark(json({ ...bookmark, extra: 1 }), SLUG)).toEqual(bookmark);
  });

  it("throws CursorScopeMismatchError for another project's bookmark", () => {
    const foreign = encodeHistoryBookmark({ ...bookmark, slug: "SBub/other" });
    expect(() => decodeHistoryBookmark(foreign, SLUG)).toThrow(CursorScopeMismatchError);
  });

  const malformed: [string, string][] = [
    ["not base64url", "!!!"],
    ["not JSON", b64url("not json")],
    ["an array", b64url("[]")],
    ["null", b64url("null")],
    ["a missing field", json({ slug: SLUG, updated_at: bookmark.updated_at })],
    ["a non-string field", json({ ...bookmark, adw_id: 42 })],
    ["a word for a timestamp", json({ ...bookmark, updated_at: "yesterday" })],
    ["an impossible timestamp", json({ ...bookmark, updated_at: "2026-13-45T99:00:00Z" })],
    ["a timestamp without a zone", json({ ...bookmark, updated_at: "2026-10-01T12:00:00" })],
    ["an adw_id with a comma", json({ ...bookmark, adw_id: "a,b" })],
    ["an adw_id with a quote", json({ ...bookmark, adw_id: 'a"b' })],
    ["an adw_id with a parenthesis", json({ ...bookmark, adw_id: "a)b" })],
    ["an invalid slug", json({ ...bookmark, slug: "SBub/adw%2Ftoolkit" })],
  ];

  it.each(malformed)("throws UnknownCursorError for %s", (_, cursor) => {
    expect(() => decodeHistoryBookmark(cursor, SLUG)).toThrow(UnknownCursorError);
  });

  it.each(malformed)("reads %s as page one", (_, cursor) => {
    expect(readHistoryBookmark(cursor, SLUG)).toBeNull();
  });
});

describe("readHistoryBookmark", () => {
  it("returns the bookmark of a valid cursor", () => {
    expect(readHistoryBookmark(encodeHistoryBookmark(bookmark), SLUG)).toEqual(bookmark);
  });

  it("reads an absent, empty or repeated ?after as page one", () => {
    expect(readHistoryBookmark(undefined, SLUG)).toBeNull();
    expect(readHistoryBookmark("", SLUG)).toBeNull();
    expect(readHistoryBookmark(["a", "b"], SLUG)).toBeNull();
  });

  it("reads another project's bookmark as page one", () => {
    const foreign = encodeHistoryBookmark({ ...bookmark, slug: "SBub/other" });
    expect(readHistoryBookmark(foreign, SLUG)).toBeNull();
  });
});

describe("historyKeysetFilter", () => {
  it("selects rows strictly older than the bookmark, tie-broken on adw_id", () => {
    expect(historyKeysetFilter(bookmark)).toBe(
      'updated_at.lt."2026-10-01T12:34:56.123456+00:00",and(updated_at.eq."2026-10-01T12:34:56.123456+00:00",adw_id.lt."d2e29be0")',
    );
  });
});

describe("toHistoryPage", () => {
  const rows = [
    run("dddd0004", "2026-10-04T10:00:00.000001+00:00"),
    run("cccc0003", "2026-10-03T10:00:00+00:00"),
    run("bbbb0002", "2026-10-02T10:00:00.5+00:00"),
    run("aaaa0001", "2026-10-01T10:00:00+00:00"),
  ];

  it("has no next cursor for exactly a page of rows", () => {
    const page = toHistoryPage(rows.slice(0, 3), SLUG);
    expect(page.items).toEqual(rows.slice(0, 3));
    expect(page.nextCursor).toBeNull();
  });

  it("drops the extra row and bookmarks the last row shown", () => {
    const page = toHistoryPage(rows, SLUG);
    expect(page.items).toEqual(rows.slice(0, 3));
    expect(page.nextCursor).not.toBeNull();
    expect(decodeHistoryBookmark(page.nextCursor ?? "", SLUG)).toEqual({
      slug: SLUG,
      updated_at: "2026-10-02T10:00:00.5+00:00",
      adw_id: "bbbb0002",
    });
  });

  it("returns an empty page for no rows and never mutates its input", () => {
    const input: Run[] = [];
    expect(toHistoryPage(input, SLUG)).toEqual({ items: [], nextCursor: null });
    const copy = [...rows];
    toHistoryPage(rows, SLUG);
    expect(rows).toEqual(copy);
  });
});

describe("historyHref", () => {
  it("links page one without a query", () => {
    expect(historyHref(SLUG, null)).toBe("/projects/SBub/adw-toolkit");
  });

  it("links another page with ?after=<cursor>", () => {
    const cursor = encodeHistoryBookmark(bookmark);
    expect(historyHref(SLUG, cursor)).toBe(`/projects/SBub/adw-toolkit?after=${cursor}`);
  });
});
