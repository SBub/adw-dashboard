import { describe, expect, it } from "vitest";
import { SYNC_LINE, entryId, groupPullRequests } from "./changelog-backfill";
import {
  type ProductionPr,
  type ReleaseState,
  annotationContent,
  draftBranch,
  draftPrBody,
  draftPrTitle,
  productionPrForCommit,
  releaseNotes,
  releaseSteps,
  releaseTag,
} from "./release";

describe("releaseTag", () => {
  it("is the changelog entry id prefixed with release-", () => {
    expect(releaseTag("2026-10-27", 238)).toBe("release-2026-10-27-pr238");
    expect(releaseTag("2026-10-27", 238)).toBe(`release-${entryId("2026-10-27", 238)}`);
    expect(releaseTag("2026-10-03", 8)).toBe("release-2026-10-03-pr8");
  });
});

describe("releaseNotes", () => {
  it("groups Features, Fixes and Chores in that order, each by number", () => {
    const notes = releaseNotes(
      groupPullRequests([
        { number: 240, title: "docs: a doc" },
        { number: 236, title: "fix: #153 - a fix" },
        { number: 237, title: "feat: a feature" },
        { number: 235, title: "bug: a bug" },
        { number: 239, title: "an unprefixed title" },
        { number: 234, title: "chore: a chore" },
      ]),
    );
    expect(notes).toBe(
      [
        "## Features",
        "",
        "- a feature (#237)",
        "",
        "## Fixes",
        "",
        "- a bug (#235)",
        "- a fix (#153, #236)",
        "",
        "## Chores",
        "",
        "- a chore (#234)",
        "- an unprefixed title (#239)",
        "- a doc (#240)",
        "",
      ].join("\n"),
    );
  });

  it("leaves out an empty section", () => {
    const notes = releaseNotes(groupPullRequests([{ number: 1, title: "fix: x" }]));
    expect(notes).not.toContain("## Features");
    expect(notes).not.toContain("## Chores");
    expect(notes).toContain("## Fixes");
  });

  it("renders the sync line when nothing shipped", () => {
    expect(releaseNotes(groupPullRequests([]))).toBe(`${SYNC_LINE}\n`);
  });
});

describe("productionPrForCommit", () => {
  const full = "3af6ffeb585e4af8d8c5a4b8e0db21463b6a1216";
  const prs: ProductionPr[] = [
    { number: 1, title: "a", mergedAt: "2026-10-01T00:00:00Z", mergeCommit: null },
    { number: 238, title: "b", mergedAt: "2026-10-27T00:00:00Z", mergeCommit: { oid: full } },
    {
      number: 227,
      title: "c",
      mergedAt: "2026-10-20T00:00:00Z",
      mergeCommit: { oid: "1111111111111111111111111111111111111111" },
    },
  ];

  it("matches a full sha and a 7-character prefix", () => {
    expect(productionPrForCommit(prs, full)?.number).toBe(238);
    expect(productionPrForCommit(prs, full.slice(0, 7))?.number).toBe(238);
  });

  it("returns null for a commit that is no production merge commit", () => {
    expect(productionPrForCommit(prs, "abcdef0")).toBeNull();
  });

  it("rejects a prefix shorter than 7 characters", () => {
    expect(() => productionPrForCommit(prs, "3af6ff")).toThrow();
  });
});

describe("releaseSteps", () => {
  const sha = "3af6ffeb585e4af8d8c5a4b8e0db21463b6a1216";
  const fresh: ReleaseState = {
    tag: "release-2026-10-27-pr238",
    sha,
    tagSha: null,
    releaseExists: false,
    draftPr: null,
    draftChanged: true,
  };

  it("creates everything on a first run", () => {
    expect(releaseSteps(fresh)).toEqual({ tag: "create", release: "create", draft: "create" });
  });

  it("reports already released for every step after a real run", () => {
    expect(
      releaseSteps({
        ...fresh,
        tagSha: sha,
        releaseExists: true,
        draftPr: 260,
        draftChanged: false,
      }),
    ).toEqual({ tag: "already released", release: "already released", draft: "already released" });
  });

  it("never moves a tag that points at another commit", () => {
    expect(() => releaseSteps({ ...fresh, tagSha: "1".repeat(40) })).toThrow(
      "a release tag is never moved",
    );
  });

  it("has nothing to draft when develop already has every entry", () => {
    expect(releaseSteps({ ...fresh, draftChanged: false }).draft).toBe("nothing to draft");
  });

  it("creates a missing Release after an interrupted run", () => {
    expect(releaseSteps({ ...fresh, tagSha: sha })).toEqual({
      tag: "already released",
      release: "create",
      draft: "create",
    });
  });
});

describe("names and text", () => {
  const tag = "release-2026-10-27-pr238";

  it("names the annotation, the draft branch and the draft pull request", () => {
    expect(annotationContent(tag)).toBe("adw-dashboard release-2026-10-27-pr238");
    expect(draftBranch(tag)).toBe("changelog/release-2026-10-27-pr238");
    expect(draftPrTitle(tag)).toBe("chore: changelog draft for release-2026-10-27-pr238");
  });

  it("lists the drafted files in the pull request body, without an em-dash", () => {
    const body = draftPrBody(["2026-10-27-pr238"]);
    expect(body).toContain("src/content/changelog/2026-10-27-pr238.mdx");
    expect(body).not.toContain(String.fromCharCode(0x2014));
  });
});
