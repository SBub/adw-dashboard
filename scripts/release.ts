// The release of one production pull request, run by
// .github/workflows/release.yml after CI passes on master: the annotated tag
// release-<YYYY-MM-DD>-pr<N> on its merge commit, a GitHub Release with the
// develop pull requests it shipped, and a pull request into develop with the
// changelog draft that scripts/backfill-changelog.ts writes. Each step checks
// GitHub first and reports "already released" when its artefact exists, so a
// rerun creates nothing. A tag is never moved and the draft is never merged.
// With --dry-run it prints every step, the notes and the draft diff, and
// creates nothing: the draft is built in a temporary worktree it removes.
//
//   git fetch origin master develop --tags
//   node scripts/release.ts --sha <merge commit> [--dry-run]

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  groupPullRequests,
  parsePrTitle,
  parseRevert,
  shippedPullNumbers,
  utcDate,
} from "../src/lib/changelog-backfill.ts";
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
} from "../src/lib/release.ts";

const DIR = "src/content/changelog";
const BACKFILL = fileURLToPath(new URL("./backfill-changelog.ts", import.meta.url));
// GitHub's public identity for commits and tags made with GITHUB_TOKEN.
const BOT_NAME = "github-actions[bot]";
const BOT_ID = 41898699;
const BOT = [
  "-c",
  `user.name=${BOT_NAME}`,
  "-c",
  `user.email=${BOT_ID}+${BOT_NAME}@users.noreply.github.com`,
];

function run(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function gh(args: string[]): string {
  return run("gh", args);
}

function git(args: string[], cwd?: string): string {
  return run("git", args, cwd);
}

function parseArgs(argv: string[]): { sha: string | null; dryRun: boolean } {
  let sha: string | null = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--sha" && argv[i + 1]) sha = argv[++i] ?? null;
    else throw new Error(`Usage: node scripts/release.ts [--sha <merge commit>] [--dry-run]`);
  }
  return { sha, dryRun };
}

function output(values: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}\n`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the runner's GITHUB_OUTPUT file
  appendFileSync(file, lines.join(""));
}

/** The commit the remote tag peels to, null when the tag does not exist. */
function remoteTagSha(tag: string): string | null {
  const lines = git(["ls-remote", "--tags", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  const peeled = lines.find(([, ref]) => ref === `refs/tags/${tag}^{}`);
  const plain = lines.find(([, ref]) => ref === `refs/tags/${tag}`);
  return (peeled ?? plain)?.[0] ?? null;
}

function releaseExists(tag: string): boolean {
  const view = spawnSync("gh", ["release", "view", tag, "--json", "tagName"], {
    encoding: "utf8",
  });
  if (view.status === 0) return true;
  if (/release not found/i.test(view.stderr)) return false;
  throw new Error(`gh release view ${tag} failed: ${view.stderr.trim()}`);
}

function draftPrNumber(branch: string): number | null {
  const prs = JSON.parse(
    gh(["pr", "list", "--head", branch, "--state", "all", "--json", "number", "--limit", "1"]),
  ) as { number: number }[];
  return prs[0]?.number ?? null;
}

const titles = new Map<number, string>();

function titleOf(n: number): string {
  if (titles.size === 0) {
    const merged = JSON.parse(
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
    ) as { number: number; title: string }[];
    for (const pr of merged) titles.set(pr.number, pr.title);
  }
  const known = titles.get(n);
  if (known !== undefined) return known;
  const { title } = JSON.parse(gh(["pr", "view", String(n), "--json", "title"])) as {
    title: string;
  };
  titles.set(n, title);
  return title;
}

function notesOf(pr: ProductionPr, sha: string): string {
  if (parsePrTitle(pr.title).prefix === "revert") {
    const { text, issue, pr: reverted } = parseRevert(pr.title);
    const refs = [
      ...(issue === null ? [] : [`#${issue}`]),
      ...(reverted === null ? [] : [`#${reverted}`]),
    ];
    return `## Reverted\n\n- ${text}${refs.length > 0 ? ` (${refs.join(", ")})` : ""}\n`;
  }
  const shipped = shippedPullNumbers(
    git(["log", "--first-parent", "--format=%H%x09%s", `${sha}^2`, `^${sha}^1`]),
  ).map((n) => ({ number: n, title: titleOf(n) }));
  return releaseNotes(groupPullRequests(shipped));
}

/** Builds the draft in `tree` (a worktree of origin/develop); the new entry ids. */
function buildDraft(tree: string): string[] {
  git(["worktree", "add", "--detach", tree, "origin/develop"]);
  console.log(run("node", [BACKFILL], tree).trimEnd());
  run("yarn", ["prettier", "--write", "--log-level", "warn", join(tree, DIR)]);
  // Intent to add, so `git diff` shows the new files too.
  git(["add", "--intent-to-add", DIR], tree);
  return git(["diff", "--name-only", "--diff-filter=A", "--", DIR], tree)
    .split("\n")
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => name.slice(DIR.length + 1, -".mdx".length));
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const given = args.sha ?? git(["rev-parse", "origin/master"]).trim();
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", given, "origin/master"]);
  if (ancestor.status !== 0) throw new Error(`${given} is not on master`);

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
  const pr = productionPrForCommit(production, given);
  if (!pr?.mergeCommit) {
    console.log(
      `${given} is not the merge commit of a production pull request; nothing to release.`,
    );
    output({ tag: "", merged_at: "", tag_created: "false" });
    return;
  }
  const sha = pr.mergeCommit.oid;
  const tag = releaseTag(utcDate(pr.mergedAt), pr.number);
  const branch = draftBranch(tag);

  // The temporary directory holds the draft worktree and the notes file.
  const temp = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), "release-"));
  const tree = join(temp, "develop");
  let tagCreated = false;
  try {
    const draftPr = draftPrNumber(branch);
    const ids = draftPr === null ? buildDraft(tree) : [];
    const state: ReleaseState = {
      tag,
      sha,
      tagSha: remoteTagSha(tag),
      releaseExists: releaseExists(tag),
      draftPr,
      draftChanged: draftPr === null && git(["status", "--porcelain"], tree).trim() !== "",
    };
    const steps = releaseSteps(state);
    const notes = steps.release === "create" ? notesOf(pr, sha) : "";

    console.log(
      steps.tag === "create"
        ? `\ntag: ${tag} on ${sha}: create`
        : `\ntag: ${tag}: already released`,
    );
    console.log(`\nrelease: ${tag}: ${steps.release}`);
    if (notes) console.log(notes);
    console.log(`\ndraft: ${draftPrTitle(tag)}: ${steps.draft}`);
    if (steps.draft === "create") console.log(git(["diff"], tree));
    console.log(
      `\nannotation: ${annotationContent(tag)}: ${steps.tag === "create" ? "create" : "already released"}`,
    );

    if (args.dryRun) {
      console.log("\nDry run: nothing was created.");
    } else {
      if (steps.tag === "create") {
        const message = `${tag}: ${parsePrTitle(pr.title).text}`;
        git([...BOT, "tag", "-a", tag, "-m", message, sha]);
        // No --force: a tag that appeared meanwhile rejects the push.
        git(["push", "origin", `refs/tags/${tag}`]);
        tagCreated = true;
        console.log(`Pushed tag ${tag}`);
      }
      if (steps.release === "create") {
        const notesFile = join(temp, "notes.md");
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file in our own mkdtemp directory
        writeFileSync(notesFile, notes);
        gh(["release", "create", tag, "--verify-tag", "--title", tag, "--notes-file", notesFile]);
        console.log(`Created GitHub Release ${tag}`);
      }
      if (steps.draft === "create") {
        git(["switch", "-c", branch], tree);
        git(["add", DIR], tree);
        git([...BOT, "commit", "-m", draftPrTitle(tag)], tree);
        // A branch left by an interrupted run has no pull request (draftPr is
        // null), so it is replaced, but only if it is still where it was.
        const remote = git(["ls-remote", "--heads", "origin", `refs/heads/${branch}`]).split(
          "\t",
        )[0];
        const lease = remote ? [`--force-with-lease=refs/heads/${branch}:${remote}`] : [];
        git(["push", ...lease, "origin", `HEAD:refs/heads/${branch}`], tree);
        const url = gh([
          "pr",
          "create",
          "--base",
          "develop",
          "--head",
          branch,
          "--title",
          draftPrTitle(tag),
          "--body",
          draftPrBody(ids),
        ]).trim();
        console.log(`Opened ${url}`);
      }
    }
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", tree], { stdio: "ignore" });
    rmSync(temp, { recursive: true, force: true });
    output({ tag, merged_at: pr.mergedAt, tag_created: String(tagCreated) });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
