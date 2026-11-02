// The changelog backfill's pure derivation and rendering: from production pull
// requests and the develop pull requests each one shipped to the text of one
// MDX entry and of the registry. No imports and no Node APIs, so
// scripts/backfill-changelog.ts imports it with a relative .ts path under
// Node's type stripping (erasable syntax only); no clock, so it is testable
// with plain values. src/lib/changelog.ts imports its types and constants.

export const CHANGELOG_KINDS = ["release", "revert"] as const;
export type ChangelogKind = (typeof CHANGELOG_KINDS)[number];

export const CHANGELOG_SECTIONS = ["features", "fixes", "chores"] as const;
export type ChangelogSection = (typeof CHANGELOG_SECTIONS)[number];

export interface ChangelogCounts {
  features: number;
  fixes: number;
  chores: number;
}

/**
 * A production pull request's size as GitHub reports it at generation time:
 * lines added and removed, commits, changed files, and conversation plus
 * review comments.
 */
export interface ChangelogStats {
  additions: number;
  deletions: number;
  commits: number;
  files: number;
  comments: number;
}

export const CHANGELOG_STAT_FIELDS: readonly (keyof ChangelogStats)[] = [
  "additions",
  "deletions",
  "commits",
  "files",
  "comments",
];

export interface ChangelogLine {
  text: string;
  issue: number | null;
  pr: number;
}

export type ChangelogGroups = Record<ChangelogSection, ChangelogLine[]>;

export const REPO = "SBub/adw-dashboard";
const REPO_URL = `https://github.com/${REPO}`;

function issueUrl(n: number): string {
  return `${REPO_URL}/issues/${n}`;
}

export function pullUrl(n: number): string {
  return `${REPO_URL}/pull/${n}`;
}

/** `feat` is a feature; `fix` and `bug` are fixes; anything else is a chore. */
export function sectionForPrefix(prefix: string | null): ChangelogSection {
  const p = prefix?.toLowerCase() ?? null;
  if (p === "feat") return "features";
  if (p === "fix" || p === "bug") return "fixes";
  return "chores";
}

/**
 * A pull request title split into its conventional prefix (optional scope and
 * `!`), the issue number of a leading `#N - `, and the rest, verbatim.
 */
export function parsePrTitle(title: string): {
  prefix: string | null;
  issue: number | null;
  text: string;
} {
  let rest = title.trim();
  let prefix: string | null = null;
  let issue: number | null = null;
  // A word, an optional "(scope)", an optional "!", then ":".
  const word = /^[a-z]+/i.exec(rest)?.[0];
  if (word) {
    let i = word.length;
    if (rest[i] === "(") {
      const close = rest.indexOf(")", i);
      i = close === -1 ? -1 : close + 1;
    }
    if (i !== -1 && rest[i] === "!") i += 1;
    if (i !== -1 && rest[i] === ":") {
      prefix = word.toLowerCase();
      rest = rest.slice(i + 1).trimStart();
    }
  }
  const issueMatch = /^#(\d+)\s+-\s+/.exec(rest);
  if (issueMatch) {
    issue = Number(issueMatch[1]);
    rest = rest.slice(issueMatch[0].length);
  }
  return { prefix, issue, text: rest };
}

export function entryId(date: string, pr: number): string {
  return `${date}-pr${pr}`;
}

/** The `YYYY-MM-DD` of a UTC ISO timestamp such as gh's `mergedAt`. */
export function utcDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso) || !iso.endsWith("Z")) {
    throw new Error(`Not a UTC ISO timestamp: ${iso}`);
  }
  return iso.slice(0, 10);
}

/**
 * What a revert pushed straight to master reverted, from a title such as
 * `revert: <text> (#66, PR #75) on master`.
 */
export function parseRevert(title: string): {
  text: string;
  issue: number | null;
  pr: number | null;
} {
  const text = parsePrTitle(title).text;
  const both = /\(#(\d+), PR #(\d+)\)/.exec(text);
  const prOnly = /\(PR #(\d+)\)/.exec(text);
  const issueOnly = /\(#(\d+)\)/.exec(text);
  const group = both ?? prOnly ?? issueOnly;
  const issue = both ? Number(both[1]) : issueOnly && !prOnly ? Number(issueOnly[1]) : null;
  const pr = both ? Number(both[2]) : prOnly ? Number(prOnly[1]) : null;
  const rest = group
    ? text.slice(0, group.index) + text.slice(group.index + group[0].length)
    : text;
  return { text: rest.replace(/\s+/g, " ").trim(), issue, pr };
}

/** One line of text inside a list item: nothing in it is markup. */
export function escapeMdxText(s: string): string {
  return s.replace(/[\\{}<>[\]*_]/g, (c) => `\\${c}`);
}

function isStat(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * The stats of one pull request from the JSON of
 * `gh api repos/<owner>/<repo>/pulls/<N>`: comments are the conversation
 * comments plus the review comments. Throws on a missing or bad field.
 */
export function pullStats(raw: unknown): ChangelogStats {
  const pull = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const read = (field: string): number => {
    const value = pull[field];
    if (!isStat(value)) throw new Error(`Pull request JSON: ${field} is not a count`);
    return value;
  };
  return {
    additions: read("additions"),
    deletions: read("deletions"),
    commits: read("commits"),
    files: read("changed_files"),
    comments: read("comments") + read("review_comments"),
  };
}

/** Develop pull requests under their section, each ordered by number. */
export function groupPullRequests(prs: { number: number; title: string }[]): ChangelogGroups {
  const groups: ChangelogGroups = { features: [], fixes: [], chores: [] };
  for (const pr of [...prs].sort((a, b) => a.number - b.number)) {
    const { prefix, issue, text } = parsePrTitle(pr.title);
    groups[sectionForPrefix(prefix)].push({ text, issue, pr: pr.number });
  }
  return groups;
}

export function countsOf(groups: ChangelogGroups): ChangelogCounts {
  return {
    features: groups.features.length,
    fixes: groups.fixes.length,
    chores: groups.chores.length,
  };
}

function changelogLine({ text, issue, pr }: ChangelogLine): string {
  const links = [
    ...(issue === null ? [] : [`[#${issue}](${issueUrl(issue)})`]),
    `[PR #${pr}](${pullUrl(pr)})`,
  ];
  return `- ${escapeMdxText(text)} (${links.join(", ")})`;
}

interface EntryBase {
  date: string;
  pr: number;
  title: string;
  stats: ChangelogStats;
}

export type EntryInput =
  | (EntryBase & { kind: "release"; groups: ChangelogGroups })
  | (EntryBase & {
      kind: "revert";
      reverted: { text: string; issue: number | null; pr: number | null };
    });

export const SECTION_HEADINGS: Record<ChangelogSection, string> = {
  features: "Features",
  fixes: "Fixes",
  chores: "Chores",
};

export const SYNC_LINE = "No new pull requests; branch sync.";

/**
 * The full text of one entry's `.mdx` file: a draft. The title and the lines
 * come from the pull request titles and there is no opening paragraph; the
 * owner rewrites the title and the lines and writes the description from the
 * diff before committing. Stops on an em-dash rather than rewriting text.
 */
export function renderEntryMdx(input: EntryInput): string {
  const counts: ChangelogCounts =
    input.kind === "release" ? countsOf(input.groups) : { features: 0, fixes: 0, chores: 0 };
  const meta = [
    `  date: ${JSON.stringify(input.date)},`,
    `  pr: ${input.pr},`,
    `  title: ${JSON.stringify(input.title)},`,
    `  kind: ${JSON.stringify(input.kind)},`,
    `  counts: { features: ${counts.features}, fixes: ${counts.fixes}, chores: ${counts.chores} },`,
    `  stats: { ${CHANGELOG_STAT_FIELDS.map((f) => `${f}: ${input.stats[f]}`).join(", ")} },`,
  ];
  const blocks = [`export const meta = {\n${meta.join("\n")}\n};`];
  if (input.kind === "release") {
    const sections = CHANGELOG_SECTIONS.filter((s) => input.groups[s].length > 0);
    if (sections.length === 0) blocks.push(SYNC_LINE);
    for (const s of sections) {
      blocks.push(`## ${SECTION_HEADINGS[s]}\n\n${input.groups[s].map(changelogLine).join("\n")}`);
    }
  } else {
    const { text, issue, pr } = input.reverted;
    const links = [
      ...(issue === null ? [] : [`[#${issue}](${issueUrl(issue)})`]),
      ...(pr === null ? [] : [`[PR #${pr}](${pullUrl(pr)})`]),
    ];
    const suffix = links.length > 0 ? ` (${links.join(", ")})` : "";
    blocks.push(`## Reverted\n\n- ${escapeMdxText(text)}${suffix}`);
  }
  const text = `${blocks.join("\n\n")}\n`;
  if (text.includes("\u2014")) throw new Error("Entry contains an em-dash; edit the title first");
  return text;
}

/**
 * The develop pull requests a production merge commit M shipped, in log order,
 * from `git log --first-parent --format=%H%x09%s M^2 ^M^1`.
 */
export function shippedPullNumbers(gitLog: string): number[] {
  return gitLog
    .split("\n")
    .map((line) => /^[0-9a-f]+\tMerge pull request #(\d+) /.exec(line)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
}

/**
 * The source of src/content/changelog/registry.test.ts with its
 * `PRODUCTION_PRS` literal replaced by the sorted, unique numbers on one line
 * (Prettier re-wraps it). Throws unless the literal is there exactly once.
 */
export function withProductionPrs(source: string, prs: number[]): string {
  const pattern = /const PRODUCTION_PRS = \[[^\]]*\];/g;
  if ((source.match(pattern) ?? []).length !== 1) {
    throw new Error("registry.test.ts: PRODUCTION_PRS not found");
  }
  const sorted = [...new Set(prs)].sort((a, b) => a - b);
  return source.replace(pattern, () => `const PRODUCTION_PRS = [${sorted.join(", ")}];`);
}

/** The full text of src/content/changelog/index.ts. */
export function renderRegistry(ids: string[]): string {
  const lines = [...ids]
    .sort()
    .map((id) => `  { id: "${id}", load: () => import("./${id}.mdx") },`);
  return `import type { MDXContent } from "mdx/types";

// Every changelog entry, listed by hand: id plus a lazy import of its module.
// The import path is a string literal per entry (never a template), so the
// bundler, TypeScript and knip see each file. Add one line per entry;
// registry.test.ts fails when a file in this directory and this list disagree.

export interface ChangelogEntry {
  id: string;
  load: () => Promise<{ default: MDXContent; meta?: unknown }>;
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
${lines.join("\n")}
];
`;
}
