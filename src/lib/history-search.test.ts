import { describe, expect, it } from "vitest";
import { HISTORY_QUERY_MAX_LENGTH, historySearchFilter, readHistoryQuery } from "./history-search";

describe("readHistoryQuery", () => {
  it.each([
    ["absent", undefined],
    ["repeated", ["a", "b"]],
    ["empty", ""],
    ["whitespace only", "   "],
    ["only wildcards", "***"],
  ])("is null when %s", (_, raw) => {
    expect(readHistoryQuery(raw)).toBeNull();
  });

  it("trims the text", () => {
    expect(readHistoryQuery("  forest  ")).toBe("forest");
  });

  it("cuts the text at the maximum length", () => {
    const q = readHistoryQuery("a".repeat(HISTORY_QUERY_MAX_LENGTH + 5));
    expect(q).toBe("a".repeat(HISTORY_QUERY_MAX_LENGTH));
  });

  it("trims again when the cut ends on a space", () => {
    const raw = `${"a".repeat(HISTORY_QUERY_MAX_LENGTH - 1)} tail`;
    expect(readHistoryQuery(raw)).toBe("a".repeat(HISTORY_QUERY_MAX_LENGTH - 1));
  });

  it("removes the PostgREST wildcard alias", () => {
    expect(readHistoryQuery("fo*rest")).toBe("forest");
  });
});

describe("historySearchFilter", () => {
  it("matches the title, the branch and the run id", () => {
    expect(historySearchFilter("forest")).toBe(
      'issue_title.ilike."*forest*",branch_name.ilike."*forest*",adw_id.ilike."*forest*"',
    );
  });

  it("escapes % and _ for LIKE, the backslash doubled for PostgREST", () => {
    expect(historySearchFilter("50%_off")).toContain('issue_title.ilike."*50\\\\%\\\\_off*"');
  });

  it("escapes a double quote", () => {
    expect(historySearchFilter('a"b')).toContain('issue_title.ilike."*a\\"b*"');
  });

  it("escapes a backslash for LIKE and for PostgREST", () => {
    expect(historySearchFilter("a\\b")).toContain('issue_title.ilike."*a\\\\\\\\b*"');
  });

  it("keeps reserved characters inside the quotes", () => {
    expect(historySearchFilter("feat/x,(y)")).toBe(
      'issue_title.ilike."*feat/x,(y)*",branch_name.ilike."*feat/x,(y)*",adw_id.ilike."*feat/x,(y)*"',
    );
  });

  it("also matches the issue number when the text is an integer", () => {
    expect(historySearchFilter("38")).toBe(
      'issue_title.ilike."*38*",branch_name.ilike."*38*",adw_id.ilike."*38*",issue_number.eq.38',
    );
  });

  it("drops leading zeros from the issue number", () => {
    expect(historySearchFilter("0038")).toMatch(/,issue_number\.eq\.38$/);
  });

  it.each(["38a", "-3", "3.5", "1234567890"])("matches %s as text only", (q) => {
    expect(historySearchFilter(q)).not.toContain("issue_number");
  });
});
