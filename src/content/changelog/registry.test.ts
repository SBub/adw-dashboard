import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isChangelogId } from "@/lib/changelog";
import { CHANGELOG_ENTRIES } from "./index";

// The registry, the directory and production must agree: an entry file
// without its line is never routed, a line without its file fails the build,
// and every merged pull request into master has exactly one entry. load() is
// never called, so vitest never compiles MDX; the files are read as text.

// Every merged pull request into master. scripts/backfill-changelog.ts rewrites
// it with every production pull request when it drafts the missing entries.
const PRODUCTION_PRS = [8, 16, 37, 65, 77, 79, 96, 115, 118, 163];

const DIR = "src/content/changelog";
const registered = CHANGELOG_ENTRIES.map((entry) => entry.id);
const files = readdirSync(DIR)
  .filter((name) => name.endsWith(".mdx"))
  .map((name) => name.slice(0, -".mdx".length))
  .sort();

function read(id: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test only; id comes from this directory's own listing
  return readFileSync(`${DIR}/${id}.mdx`, "utf8");
}

function prOf(id: string): number {
  return Number(id.slice(id.lastIndexOf("-pr") + 3));
}

// The text between a `## <heading>` line and the next heading (or the end).
function section(text: string, heading: string): string | null {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) return null;
  const rest = text.slice(start + heading.length + 5);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

function listItems(text: string, heading: string): number {
  const body = section(text, heading);
  return body === null ? 0 : body.split("\n").filter((line) => line.startsWith("- ")).length;
}

const META_NUMBER = {
  pr: /\bpr: (\d+)/,
  features: /\bfeatures: (\d+)/,
  fixes: /\bfixes: (\d+)/,
  chores: /\bchores: (\d+)/,
} as const;

const STATS_LINE =
  /\n {2}stats: \{ additions: \d+, deletions: \d+, commits: \d+, files: \d+, comments: \d+ \},\n/;

function titleOf(text: string): string {
  const match = /\n {2}title: "(.*)",\n/.exec(text);
  if (!match) throw new Error("no title in meta");
  return match[1]!;
}

// The description: the prose between the meta and the first heading.
function opening(text: string): string {
  return text.slice(text.indexOf("\n};\n") + 4, text.indexOf("\n## "));
}

function metaNumber(text: string, field: keyof typeof META_NUMBER): number {
  const match = META_NUMBER[field].exec(text);
  if (!match) throw new Error(`no ${field} in meta`);
  return Number(match[1]);
}

describe("changelog registry", () => {
  it("lists every .mdx file in the directory, and nothing else", () => {
    expect([...registered].sort()).toEqual(files);
  });

  it("holds valid, unique ids", () => {
    for (const id of registered) expect(isChangelogId(id)).toBe(true);
    expect(new Set(registered).size).toBe(registered.length);
  });

  it("has exactly one entry per production pull request, and no other", () => {
    for (const pr of PRODUCTION_PRS) {
      expect(
        registered.filter((id) => prOf(id) === pr),
        `PR #${pr}`,
      ).toHaveLength(1);
    }
    for (const id of registered) expect(PRODUCTION_PRS).toContain(prOf(id));
  });

  it.each(files)("%s: meta agrees with the file name and counts with the lists", (id) => {
    const text = read(id);
    expect(text).toContain(`date: "${id.slice(0, 10)}"`);
    expect(metaNumber(text, "pr")).toBe(prOf(id));
    expect(metaNumber(text, "features")).toBe(listItems(text, "Features"));
    expect(metaNumber(text, "fixes")).toBe(listItems(text, "Fixes"));
    expect(metaNumber(text, "chores")).toBe(listItems(text, "Chores"));
    expect(text).not.toContain("\u2014");
  });

  it.each(files)("%s: reads as a product changelog, with stats", (id) => {
    const text = read(id);
    expect(text).toMatch(STATS_LINE);
    const title = titleOf(text);
    expect(title).not.toMatch(/promote|develop to master|\d{4}-\d{2}-\d{2}/i);
    expect(title[0]).toBe(title[0]!.toUpperCase());
    const prose = opening(text).trim();
    expect(prose.length).toBeGreaterThan(0);
    expect(prose).not.toMatch(
      /Production is currently broken|Promotes? `?develop|\d{4}-\d{2}-\d{2}/,
    );
  });

  it("ships #162 as a feature and #161 as a fix with #163", () => {
    const text = read("2026-10-09-pr163");
    expect(section(text, "Features")).toContain("PR #162");
    expect(section(text, "Fixes")).toContain("PR #161");
    expect(section(text, "Chores")).toContain("halted count");
  });

  it("records #79 as the revert of #66 and PR #75", () => {
    const text = read("2026-10-06-pr79");
    expect(text).toContain('kind: "revert"');
    expect(section(text, "Reverted")).toContain("[#66]");
    expect(section(text, "Reverted")).toContain("[PR #75]");
  });

  it("ships PR #24 with #16", () => {
    expect(read("2026-10-05-pr16")).toContain("PR #24");
  });
});
