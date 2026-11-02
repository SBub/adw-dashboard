// The release workflow's pure decisions: the tag of a production pull request,
// the notes of its GitHub Release, the draft changelog pull request and what
// each step must do given what already exists on GitHub. No Node APIs and a
// relative .ts import only, so scripts/release.ts imports it under Node's type
// stripping; no clock, so it is testable with plain values.

import {
  CHANGELOG_SECTIONS,
  type ChangelogGroups,
  type ChangelogLine,
  SECTION_HEADINGS,
  SYNC_LINE,
  entryId,
} from "./changelog-backfill.ts";

const TAG_PREFIX = "release-";

/** A merged pull request into master, as `gh pr list --json` reports it. */
export interface ProductionPr {
  number: number;
  title: string;
  mergedAt: string;
  mergeCommit: { oid: string } | null;
}

/** `release-<YYYY-MM-DD>-pr<N>`: the changelog entry id with the prefix. */
export function releaseTag(date: string, pr: number): string {
  return `${TAG_PREFIX}${entryId(date, pr)}`;
}

function noteLine({ text, issue, pr }: ChangelogLine): string {
  const refs = [...(issue === null ? [] : [`#${issue}`]), `#${pr}`];
  return `- ${text} (${refs.join(", ")})`;
}

/** The Markdown body of a GitHub Release, grouped as the changelog groups. */
export function releaseNotes(groups: ChangelogGroups): string {
  const sections = CHANGELOG_SECTIONS.filter((s) => groups[s].length > 0);
  if (sections.length === 0) return `${SYNC_LINE}\n`;
  const blocks = sections.map(
    (s) => `## ${SECTION_HEADINGS[s]}\n\n${groups[s].map(noteLine).join("\n")}`,
  );
  return `${blocks.join("\n\n")}\n`;
}

/**
 * The production pull request whose merge commit is `sha` (full, or a prefix
 * of at least 7 hex characters); null when none is. Throws when the prefix is
 * ambiguous.
 */
export function productionPrForCommit(prs: ProductionPr[], sha: string): ProductionPr | null {
  const wanted = sha.toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(wanted)) throw new Error(`Not a commit sha: ${sha}`);
  const matches = prs.filter((pr) => pr.mergeCommit?.oid.toLowerCase().startsWith(wanted));
  if (matches.length > 1) throw new Error(`${sha} matches more than one merge commit`);
  return matches[0] ?? null;
}

export function draftBranch(tag: string): string {
  return `changelog/${tag}`;
}

export function draftPrTitle(tag: string): string {
  return `chore: changelog draft for ${tag}`;
}

export function annotationContent(tag: string): string {
  return `adw-dashboard ${tag}`;
}

/** The body of the draft changelog pull request. */
export function draftPrBody(ids: string[]): string {
  const files = ids.map((id) => `- \`src/content/changelog/${id}.mdx\``);
  return [
    "Draft changelog entries written by `scripts/backfill-changelog.ts`:",
    "",
    ...files,
    "",
    "Before merging, rewrite each entry's title, description and lines from the diff (see `app_docs/changelog.md`, What an entry says). `registry.test.ts` fails until then.",
    "",
  ].join("\n");
}

/**
 * What exists on GitHub for one release: the commit the remote tag peels to,
 * whether its Release exists, a pull request in any state on the draft
 * branch, and whether the backfill changed anything on top of develop.
 */
export interface ReleaseState {
  tag: string;
  sha: string;
  tagSha: string | null;
  releaseExists: boolean;
  draftPr: number | null;
  draftChanged: boolean;
}

export type StepAction = "create" | "already released" | "nothing to draft";

export interface ReleaseSteps {
  tag: StepAction;
  release: StepAction;
  draft: StepAction;
}

/** Each step's action. A tag on another commit is never moved: it throws. */
export function releaseSteps(state: ReleaseState): ReleaseSteps {
  let tag: StepAction = "create";
  if (state.tagSha === state.sha) tag = "already released";
  else if (state.tagSha !== null) {
    throw new Error(
      `Tag ${state.tag} points at ${state.tagSha}, not ${state.sha}; a release tag is never moved`,
    );
  }
  const release: StepAction = state.releaseExists ? "already released" : "create";
  const draft: StepAction =
    state.draftPr !== null
      ? "already released"
      : state.draftChanged
        ? "create"
        : "nothing to draft";
  return { tag, release, draft };
}
