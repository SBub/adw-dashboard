// Drafter of the changelog: one MDX entry per merged pull request into master
// that has none yet, listing the develop pull requests that first reached
// master with it, with the production pull request's stats from the GitHub
// API, then the registry and PRODUCTION_PRS in registry.test.ts. Incremental:
// it skips a production pull request whose entry exists and never overwrites
// a file. Reads gh and git; the site build never runs it; scripts/release.ts
// runs it for the release workflow. What it writes is a draft: the owner
// rewrites the title and the lines and writes the description from the diff.
//
//   git fetch origin master develop
//   node scripts/backfill-changelog.ts
//   yarn format

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import {
  type ChangelogStats,
  type EntryInput,
  REPO,
  countsOf,
  entryId,
  groupPullRequests,
  parsePrTitle,
  parseRevert,
  pullStats,
  renderEntryMdx,
  renderRegistry,
  shippedPullNumbers,
  utcDate,
  withProductionPrs,
} from "../src/lib/changelog-backfill.ts";
import type { ProductionPr } from "../src/lib/release.ts";

const DIR = "src/content/changelog";
const REGISTRY_TEST = `${DIR}/registry.test.ts`;

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function commitExists(oid: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${oid}^{commit}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const production = JSON.parse(
  gh([
    "pr",
    "list",
    "--state",
    "merged",
    "--base",
    "master",
    "--limit",
    "200",
    "--json",
    "number,title,mergedAt,mergeCommit",
  ]),
) as ProductionPr[];

const titles = new Map<number, string>(
  (
    JSON.parse(
      gh([
        "pr",
        "list",
        "--state",
        "merged",
        "--base",
        "develop",
        "--limit",
        "1000",
        "--json",
        "number,title",
      ]),
    ) as { number: number; title: string }[]
  ).map((pr) => [pr.number, pr.title]),
);

function titleOf(n: number): string {
  const known = titles.get(n);
  if (known !== undefined) return known;
  const { title } = JSON.parse(gh(["pr", "view", String(n), "--json", "title"])) as {
    title: string;
  };
  titles.set(n, title);
  return title;
}

const missing = production.filter(
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- offline script; paths are src/content/changelog/<validated id>.mdx
  (pr) => !existsSync(`${DIR}/${entryId(utcDate(pr.mergedAt), pr.number)}.mdx`),
);
if (missing.length === 0) {
  console.log("No production pull request without an entry; nothing to draft.");
  process.exit(0);
}

for (const pr of missing) {
  const oid = pr.mergeCommit?.oid;
  if (!oid) fail(`PR #${pr.number} has no merge commit`);
  if (!commitExists(oid))
    fail(
      `Commit ${oid} (PR #${pr.number}) is missing: run \`git fetch origin master develop\` first`,
    );
}

// Additions, deletions, commits, changed files and comments, read once here;
// the site never calls GitHub.
function statsOf(n: number): ChangelogStats {
  return pullStats(JSON.parse(gh(["api", `repos/${REPO}/pulls/${n}`])));
}

const entries: { id: string; input: EntryInput }[] = missing.map((pr) => {
  const oid = pr.mergeCommit!.oid;
  const date = utcDate(pr.mergedAt);
  const { prefix, text: title } = parsePrTitle(pr.title);
  const base = { date, pr: pr.number, title, stats: statsOf(pr.number) };
  if (prefix === "revert") {
    return {
      id: entryId(date, pr.number),
      input: { ...base, kind: "revert", reverted: parseRevert(pr.title) },
    };
  }
  const shipped = shippedPullNumbers(
    git(["log", "--first-parent", "--format=%H%x09%s", `${oid}^2`, `^${oid}^1`]),
  ).map((n) => ({ number: n, title: titleOf(n) }));
  return {
    id: entryId(date, pr.number),
    input: { ...base, kind: "release", groups: groupPullRequests(shipped) },
  };
});

const rendered = entries.map(({ id, input }) => ({ id, input, text: renderEntryMdx(input) }));
for (const { id, text } of rendered) {
  // Exclusive create: a race or a bug fails here rather than overwriting.
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- offline script; paths are src/content/changelog/<validated id>.mdx
  writeFileSync(`${DIR}/${id}.mdx`, text, { flag: "wx" });
}

const ids = readdirSync(DIR)
  .filter((name) => name.endsWith(".mdx"))
  .map((name) => name.slice(0, -".mdx".length));
writeFileSync(`${DIR}/index.ts`, renderRegistry(ids));
writeFileSync(
  REGISTRY_TEST,
  withProductionPrs(
    readFileSync(REGISTRY_TEST, "utf8"),
    production.map((pr) => pr.number),
  ),
);

for (const { id, input } of rendered) {
  const counts = input.kind === "release" ? countsOf(input.groups) : null;
  console.log(
    counts
      ? `${id}: ${counts.features} features, ${counts.fixes} fixes, ${counts.chores} chores`
      : `${id}: revert`,
  );
}
