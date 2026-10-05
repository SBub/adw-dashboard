# Chore: Make the repository name a link and fix the arrow glyph in the project header

## Metadata

issue_number: `9`
adw_id: `45cbb8cf`
issue_json: `{"number":9,"title":"Make the repository name a link and fix the arrow glyph in the project header","body":"## Problem\n\nThe project header shows the repository as plain text next to a separate \"Repository\" button with an arrow glyph (`&nearr;`). Two things are wrong:\n\n- A separate button is one element too many. The repository name itself should be the link.\n- The arrow glyph does not render correctly in the header.\n\n## Expected\n\n- The repository name (owner/repo) in the project header is an anchor to the GitHub repository, opening in a new tab (`target=\"_blank\"`with`rel=\"noopener noreferrer\"`).\n- The separate \"Repository\" button is removed.\n- No broken glyph. Either drop the arrow or use an inline SVG external-link icon that renders consistently; no icon library.\n\n## Where\n\n`src/components/PageHeader.tsx`(project header) and its use in`src/components/ActiveRunsView.tsx`. The repository URL comes from `project.repo_url` (`ProjectSummary`).\n\n## Acceptance\n\n- Clicking the repo name opens the repository in a new tab.\n- No standalone Repository button remains.\n- Header renders the same in light and dark mode with no stray characters.\n- `yarn lint`, `yarn typecheck`, `yarn knip`, `yarn format:check`, `yarn test`, `yarn build` pass."}`

## Chore Description

The project header (`PageHeader`, rendered by `ActiveRunsView` for `/projects/<owner>/<repo>`) shows the
project's `display_name` as an `h1`, the slug (`owner/repo`) as a monospace subtitle `<p>`, and, on the
right, a separate text link `Repository &nearr;` pointing at `project.repo_url`. The `&nearr;` entity
(U+2197) is not in the app's font stack everywhere and renders as a broken or fallback glyph.

The chore folds the two into one element:

- When `repoUrl` is a non-empty string, the subtitle text (`owner/repo`) itself becomes an `<a>` to
  `repoUrl` with `target="_blank"` and `rel="noopener noreferrer"`, followed by a small inline SVG
  external-link icon (no icon library, no text glyph, `aria-hidden="true"`, `stroke="currentColor"` so
  it follows the text colour in light and dark mode).
- When `repoUrl` is `null` (a project without a repository URL, allowed by `Project.repo_url: string | null`),
  the subtitle stays plain text exactly as today; no link, no icon.
- The separate `Repository &nearr;` anchor and the right-hand column it occupied are removed. No
  `&nearr;` (or any other arrow character) remains in the header.

Nothing about the data changes: `repo_url` is already in `ProjectSummary` and already passed by
`ActiveRunsView`. The component stays a props-only server-compatible component (no `"use client"`, no
fetch, no computation), per `AGENTS.md`.

## Relevant Files

Use these files to resolve the chore:

- `src/components/PageHeader.tsx` - The project header. Holds the `Repository &nearr;` anchor and the
  plain-text subtitle; this is where the subtitle becomes the link, the inline SVG icon is added, and
  the separate anchor is removed.
- `src/components/ActiveRunsView.tsx` - The only caller of `PageHeader`
  (`<PageHeader title={project.display_name} subtitle={project.slug} repoUrl={project.repo_url} />`).
  Read to confirm the props; it should need no change if the prop names are kept.
- `src/types/adw.ts` - `Project.repo_url: string | null` (inherited by `ProjectSummary`); confirms the
  null branch must be kept.
- `AGENTS.md` - Architecture rules: components take typed props only and render what they are given;
  server components by default; no em-dashes in any file.
- `README.md` - Section "Prefetch and hydration of a project's runs" step 4 says `ActiveRunsView`
  "renders the header"; it does not describe the Repository button, so it needs no edit (checked).
- `.adw/project.md` - Profile: Tests (the one test layer is `src/**/*.test.ts`, no component tests, E2E
  `none`), Review (screenshot paths and viewports), Protected.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Rewrite the header markup in `src/components/PageHeader.tsx`

- Keep the `PageHeaderProps` interface and its three props (`title`, `subtitle?`, `repoUrl?: string | null`)
  unchanged, so `ActiveRunsView` needs no edit.
- Replace the outer `flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2` wrapper with a plain
  `<div className="mb-8">` (there is no right-hand column any more). Keep the `h1` exactly as is.
- Render the subtitle as follows (only when `subtitle` is truthy, as today):
  - Keep the existing `<p className="mt-1 font-mono text-sm text-neutral-500 dark:text-neutral-400">`.
  - Inside it, when `repoUrl` is truthy, render:
    ```tsx
    <a
      href={repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 underline-offset-4 hover:text-neutral-700 hover:underline dark:hover:text-neutral-200"
    >
      {subtitle}
      <ExternalLinkIcon />
    </a>
    ```
    Otherwise render `{subtitle}` as plain text.
- Add a small module-private component in the same file (not exported, so `knip` stays clean):
  ```tsx
  function ExternalLinkIcon() {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <path d="M9 2.5h4.5V7" />
        <path d="M13.5 2.5 7 9" />
        <path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
      </svg>
    );
  }
  ```
  `currentColor` makes it inherit the neutral-500 / neutral-400 text colour and the hover colour, so it
  renders identically in light and dark mode. `aria-hidden` keeps screen readers on the link text
  (`owner/repo`); the link needs no extra `aria-label`.
- Remove the old `{repoUrl && (<a ...>Repository &nearr;</a>)}` block entirely. Grep the file afterwards:
  no `&nearr;`, no `Repository` text, no Unicode arrow.
- Do not add `"use client"`, a hook, a `new Date()` or any formatting beyond rendering the props.
- No em-dashes in comments or markup.

### 2. Confirm the caller needs nothing

- Read `src/components/ActiveRunsView.tsx` line with `<PageHeader ... />`: it already passes
  `subtitle={project.slug}` and `repoUrl={project.repo_url}`. Leave it unchanged.
- `grep -rn "PageHeader\|nearr\|Repository" src` must show only the import and the use in
  `ActiveRunsView.tsx` and the definitions in `PageHeader.tsx`, and no `nearr` or `Repository`.

### 3. Documentation

- No change to `README.md` or `AGENTS.md`: neither mentions the Repository button or the arrow, and
  no new invariant is introduced. `.adw/project.md` is unaffected (no script, port, env file or doc
  location changes).

### 4. Visual check (for the review phase)

- The profile's E2E is `none` and there is no component test layer, so the browser evidence comes from
  the review phase's screenshots: `/projects/SBub/issebya-homes-ai-system` (or the first project the
  sidebar on `/` lists if that slug is 404) at desktop 1920x1080 and mobile 375x667, full page, in
  light mode and in dark mode (`prefers-color-scheme: dark` emulation). Check: the `owner/repo` line is
  a link with a small external-link icon after it, no "Repository" element on the right, no stray
  character, and the anchor has `target="_blank"` and `rel="noopener noreferrer"` in a
  `browser_snapshot`. `/` is unchanged (it renders no `PageHeader`).

### 5. Run the Validation Commands

- Run every command in `Validation Commands` below, in order, from the worktree root. All must pass.

## Test Coverage

No test needed: the change is markup only inside a props-only React component (`PageHeader`), and the
profile's only test layer is `src/**/*.test.ts` for pure reducers and helpers in `src/data/` and
`src/lib/`; there is no component test layer and E2E is `none`. No logic, helper or label format
changes, so there is nothing a unit test could pin that would fail without this change. The behaviour
(link target, `rel`, removed button, icon rendering in both themes) is verified by the review phase's
screenshots and snapshot described in step 4.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `grep -rn "nearr\|Repository" src/components/PageHeader.tsx` - must print nothing: the glyph and the separate button are gone.
- `yarn lint` - ESLint over the repo; catches JSX issues (e.g. `react/jsx-no-target-blank`) and unused code.
- `yarn typecheck` - `next typegen` then `tsc --noEmit`; proves the props contract with `ActiveRunsView` still holds (never stage the rewritten `next-env.d.ts`).
- `yarn knip` - dead-code scan; proves the new `ExternalLinkIcon` is not an unused export and nothing became orphaned.
- `yarn format:check` - Prettier; the commit hook formats staged files, this proves the tree is clean.
- `yarn test` - vitest over `src/**/*.test.ts`; proves zero regressions in the existing unit tests.
- `yarn build` - `next build` with `.env.local`; proves the prerendered project pages still build with the new header under `cacheComponents`.

## Notes

- `rel="noopener noreferrer"` is required by the issue; the old anchor had only `noreferrer` (which
  implies `noopener` in browsers, but the issue asks for both explicitly).
- `repo_url` comes from the database as text. React 19 already refuses `javascript:` URLs in `href`, and
  this chore does not change where the URL comes from, so no extra sanitising is planned.
- The SVG is inline and uses `currentColor`; do not add an icon library (`lucide-react` etc.) or a new
  dependency.
- Commit as `chore: make the repository name a link and drop the arrow glyph` (Conventional Commits,
  bare type, no trailers per the profile's Documentation section).
