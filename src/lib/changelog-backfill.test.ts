import { describe, expect, it } from "vitest";
import {
  countsOf,
  escapeMdxText,
  groupPullRequests,
  pullStats,
  parsePrTitle,
  parseRevert,
  renderEntryMdx,
  renderRegistry,
  sectionForPrefix,
  shippedPullNumbers,
  SYNC_LINE,
  utcDate,
  withProductionPrs,
} from "./changelog-backfill";

describe("sectionForPrefix", () => {
  it("maps feat to features, fix and bug to fixes, the rest to chores", () => {
    expect(sectionForPrefix("feat")).toBe("features");
    expect(sectionForPrefix("fix")).toBe("fixes");
    expect(sectionForPrefix("bug")).toBe("fixes");
    for (const p of ["chore", "ci", "docs", "refactor", "test", "style"]) {
      expect(sectionForPrefix(p)).toBe("chores");
    }
  });

  it("sends an unknown prefix and no prefix to chores, case-insensitively", () => {
    for (const p of ["revert", "release", "perf"]) expect(sectionForPrefix(p)).toBe("chores");
    expect(sectionForPrefix(null)).toBe("chores");
    expect(sectionForPrefix("FEAT")).toBe("features");
  });
});

describe("parsePrTitle", () => {
  it("strips the prefix and a leading #N - , which becomes the issue", () => {
    expect(parsePrTitle("fix: #153 - History order: sort by finished_at, not updated_at")).toEqual({
      prefix: "fix",
      issue: 153,
      text: "History order: sort by finished_at, not updated_at",
    });
  });

  it("leaves a title without an issue, and a trailing #N, alone", () => {
    expect(parsePrTitle("ci: Vercel build-skip rule and GitHub check job")).toEqual({
      prefix: "ci",
      issue: null,
      text: "Vercel build-skip rule and GitHub check job",
    });
    expect(parsePrTitle("chore: remove the clock-dependent run labels pending issue #3")).toEqual({
      prefix: "chore",
      issue: null,
      text: "remove the clock-dependent run labels pending issue #3",
    });
  });

  it("parses an upper-case prefix, a scope and a bang, and no prefix", () => {
    expect(parsePrTitle("FEAT: x").prefix).toBe("feat");
    expect(parsePrTitle("feat(scope)!: #7 - x")).toEqual({ prefix: "feat", issue: 7, text: "x" });
    expect(parsePrTitle("Just a title")).toEqual({
      prefix: null,
      issue: null,
      text: "Just a title",
    });
  });
});

describe("utcDate", () => {
  it("slices the day of a UTC timestamp", () => {
    expect(utcDate("2026-10-09T09:53:47Z")).toBe("2026-10-09");
    expect(() => utcDate("2026-10-09")).toThrow();
  });
});

const STATS = { additions: 365, deletions: 52, commits: 3, files: 20, comments: 26 };

describe("pullStats", () => {
  it("reads the counts of gh api pulls/<N>, comments plus review comments", () => {
    expect(
      pullStats({
        number: 163,
        additions: 365,
        deletions: 52,
        commits: 3,
        changed_files: 20,
        comments: 20,
        review_comments: 6,
      }),
    ).toEqual(STATS);
  });

  it("throws on a missing, negative or non-integer count", () => {
    const pull = {
      additions: 1,
      deletions: 1,
      commits: 1,
      changed_files: 1,
      comments: 0,
      review_comments: 0,
    };
    expect(() => pullStats({ ...pull, review_comments: undefined })).toThrow(/review_comments/);
    expect(() => pullStats({ ...pull, additions: -1 })).toThrow(/additions/);
    expect(() => pullStats({ ...pull, commits: 1.5 })).toThrow(/commits/);
    expect(() => pullStats(null)).toThrow(/additions/);
  });
});

describe("parseRevert", () => {
  it("reads the issue and the pull request of the reverted change", () => {
    expect(
      parseRevert("revert: summary run detail and daily aggregate charts (#66, PR #75) on master"),
    ).toEqual({
      text: "summary run detail and daily aggregate charts on master",
      issue: 66,
      pr: 75,
    });
  });

  it("allows either number to be absent", () => {
    expect(parseRevert("revert: x (PR #5)")).toEqual({ text: "x", issue: null, pr: 5 });
    expect(parseRevert("revert: x (#4)")).toEqual({ text: "x", issue: 4, pr: null });
    expect(parseRevert("revert: x")).toEqual({ text: "x", issue: null, pr: null });
  });
});

describe("escaping", () => {
  it("escapes every MDX special character in a line of text", () => {
    expect(escapeMdxText("a\\b{c}d<e>f[g]h*i_j")).toBe("a\\\\b\\{c\\}d\\<e\\>f\\[g\\]h\\*i\\_j");
  });
});

describe("renderEntryMdx", () => {
  it("puts #162 under Features and #161 under Fixes for #163", () => {
    const groups = groupPullRequests([
      { number: 162, title: "feat: #158 - Sidebar: worker status widget (online/offline)" },
      { number: 161, title: "fix: #153 - History order: sort by finished_at, not updated_at" },
      { number: 156, title: "chore: #151 - exclude trees/ and agents/ from TypeScript" },
    ]);
    const mdx = renderEntryMdx({
      date: "2026-10-09",
      pr: 163,
      title: "promote develop to master",
      kind: "release",
      stats: STATS,
      groups,
    });
    const fixesAt = mdx.indexOf("## Fixes");
    expect(mdx.indexOf("[PR #162](https://github.com/SBub/adw-dashboard/pull/162)")).toBeLessThan(
      fixesAt,
    );
    expect(mdx.indexOf("[PR #161]")).toBeGreaterThan(fixesAt);
    expect(mdx).toContain(
      "stats: { additions: 365, deletions: 52, commits: 3, files: 20, comments: 26 }",
    );
    expect(mdx.indexOf("stats:")).toBeLessThan(mdx.indexOf("## Features"));
    expect(mdx).toContain("finished\\_at");
    expect(mdx).toContain("counts: { features: 1, fixes: 1, chores: 1 }");
    expect(mdx.endsWith("\n")).toBe(true);
  });

  it("names the issue and pull request a revert reverted", () => {
    const mdx = renderEntryMdx({
      date: "2026-10-06",
      pr: 79,
      title: "summary charts (#66, PR #75) on master",
      kind: "revert",
      stats: STATS,
      reverted: parseRevert("revert: summary charts (#66, PR #75) on master"),
    });
    expect(mdx).toContain('kind: "revert"');
    expect(mdx).toContain("## Reverted");
    expect(mdx).toContain("[#66](https://github.com/SBub/adw-dashboard/issues/66)");
    expect(mdx).toContain("[PR #75](https://github.com/SBub/adw-dashboard/pull/75)");
    expect(mdx).toContain("counts: { features: 0, fixes: 0, chores: 0 }");
  });

  it("escapes brackets in a title so PR #24 is not a link", () => {
    const groups = groupPullRequests([
      {
        number: 24,
        title:
          "chore: #22 - Route project pages as /projects/[owner]/[repo] instead of a catch-all slug",
      },
    ]);
    const line = groups.chores[0]!;
    expect(line).toMatchObject({ issue: 22, pr: 24 });
    const mdx = renderEntryMdx({
      date: "2026-10-05",
      pr: 16,
      title: "t",
      kind: "release",
      stats: STATS,
      groups,
    });
    expect(mdx).toContain("/projects/\\[owner\\]/\\[repo\\]");
    expect(mdx).toContain("[PR #24]");
  });

  it("renders the sync line and zero counts for an empty range", () => {
    const groups = groupPullRequests([]);
    expect(countsOf(groups)).toEqual({ features: 0, fixes: 0, chores: 0 });
    const mdx = renderEntryMdx({
      date: "2026-10-05",
      pr: 1,
      title: "t",
      kind: "release",
      stats: STATS,
      groups,
    });
    expect(mdx).toContain(SYNC_LINE);
    expect(mdx).not.toContain("##");
  });

  it("stops on an em-dash rather than rewriting the text", () => {
    expect(() =>
      renderEntryMdx({
        date: "2026-10-05",
        pr: 1,
        title: "a \u2014 b",
        kind: "release",
        stats: STATS,
        groups: groupPullRequests([]),
      }),
    ).toThrow(/em-dash/);
  });

  it("serialises a title with quotes safely", () => {
    const mdx = renderEntryMdx({
      date: "2026-10-05",
      pr: 1,
      title: 'say "hi"',
      kind: "release",
      stats: STATS,
      groups: groupPullRequests([]),
    });
    expect(mdx).toContain('title: "say \\"hi\\""');
  });
});

describe("renderRegistry", () => {
  it("sorts ids and imports each with a string literal", () => {
    const text = renderRegistry(["2026-10-09-pr163", "2026-10-03-pr8"]);
    expect(text.indexOf("2026-10-03-pr8")).toBeLessThan(text.indexOf("2026-10-09-pr163"));
    expect(text).toContain('load: () => import("./2026-10-09-pr163.mdx")');
    expect(text).not.toContain("${");
  });
});

describe("shippedPullNumbers", () => {
  it("reads the develop pull requests of a first-parent log in log order", () => {
    const log = [
      "a1b2c3d\tMerge pull request #237 from SBub/feat/x",
      "b2c3d4e\tfix: a commit straight on develop",
      "c3d4e5f\tMerge branch 'develop' into feat/y",
      "d4e5f6a\tMerge pull request #230 from SBub/chore/z",
      "",
    ].join("\n");
    expect(shippedPullNumbers(log)).toEqual([237, 230]);
  });

  it("returns nothing for an empty log", () => {
    expect(shippedPullNumbers("")).toEqual([]);
  });
});

describe("withProductionPrs", () => {
  const source = ["// comment", "const PRODUCTION_PRS = [8, 16];", "", "const DIR = 1;", ""].join(
    "\n",
  );

  it("rewrites the literal sorted and unique, the rest byte-identical", () => {
    expect(withProductionPrs(source, [238, 16, 8, 16])).toBe(
      source.replace("[8, 16]", "[8, 16, 238]"),
    );
  });

  it("collapses a wrapped literal onto one line", () => {
    const wrapped = source.replace("[8, 16]", "[\n  8,\n  16,\n]");
    expect(withProductionPrs(wrapped, [8, 16, 238])).toBe(
      source.replace("[8, 16]", "[8, 16, 238]"),
    );
  });

  it("throws when the literal is missing", () => {
    expect(() => withProductionPrs("const OTHER = [1];", [1])).toThrow(
      "registry.test.ts: PRODUCTION_PRS not found",
    );
  });
});
