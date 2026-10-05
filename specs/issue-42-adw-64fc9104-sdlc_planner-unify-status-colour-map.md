# Chore: One status colour map for every surface: queued amber, running emerald, completed sky, failed rose

## Metadata

issue_number: `42`
adw_id: `64fc9104`
issue_json: `{"number":42,"title":"One status colour map for every surface: queued amber, running emerald, completed sky, failed rose"}`

## Chore Description

Run and queue states are coloured in several places and they disagree:

- `src/components/StatusBadge.tsx` holds its own `STYLES` map (`running` emerald, `completed` sky, `failed` **red**, 800/300 text shades) and an inline emerald pulse dot.
- `src/components/ProjectNav.tsx`'s `Count` uses one `emphasised` flag that paints both `queued` and `running` emerald with the pulse dot, so "1 queued, 1 running" reads as two of the same thing; `completed` and `failed` are plain neutral text.
- `src/components/QueueRow.tsx` carries no state colour at all.

The decided palette:

| State       | Hue                         | Meaning                |
| ----------- | --------------------------- | ---------------------- |
| running     | emerald, with the pulse dot | alive right now        |
| queued      | amber                       | waiting, not yet alive |
| completed   | sky                         | finished well          |
| failed      | rose                        | needs attention        |
| zero counts | neutral                     | nothing to see         |

Light mode: 700 text, 100 badge background. Dark mode: 400 text, 950 badge background (900 where a lighter dark surface is needed, for the neutral entry).

Build `src/lib/status-colors.ts` as the one exported map from state (`queued | running | completed | failed`, plus `neutral`) to full, literal Tailwind class strings for `text`, `badge`, `border` and `dot`. `StatusBadge`, the `ProjectNav` counts and `QueueRow` read from it; no run/queue hue class stays inline anywhere else, and a unit test enforces that by scanning the source tree. The header's connection pill keeps its own colours (it describes the socket, not a run), stated in the map's comment and exempted in the test by name. Document it in one README sentence and one AGENTS.md rule.

Two decisions this plan makes, beyond the issue text:

1. `IssueClassBadge` (`src/components/IssueClassBadge.tsx`) uses `rose` for `/bug` and `amber` for `/patch`. Those are now status hues, and the badge sits on the same run row as `StatusBadge`, so a rose `/bug` beside a sky `completed` reads as "failed". The scan would also flag it. Re-hue the two class badges out of the status palette: `/bug` becomes `fuchsia`, `/patch` becomes `lime` (`/feature` violet and `/chore` neutral unchanged). This is not a status, so it does not go into the map.
2. The guard regex also covers `red-`, the hue `failed` used until now, so a stray `red` for a failed state cannot creep back. `ConnectionIndicator.tsx` (amber, emerald, red for the socket) is the one named exemption.

## Relevant Files

Use these files to resolve the chore:

- `AGENTS.md`: the rule book. Read in full; a new Architecture rule ("status colours come only from `src/lib/status-colors.ts`") goes here. Note the "no em-dashes" rule and "Components take typed props only" (the colour lookup is a pure constant read, allowed like `durationLabel`).
- `README.md`: one sentence about the status colours, in the intro bullets (around lines 6-20, sidebar and right pane) where the counts and rows are described. Also the "The indicator" section (around line 1010) describes the pill as amber/green/red; leave it, it stays true.
- `.adw/project.md`: profile; no change needed (no script, port, env or doc location moves).
- `src/components/StatusBadge.tsx`: replace its inline `STYLES` and emerald dot with the map; widen its prop to the queued state so `QueueRow` can use it.
- `src/components/ProjectNav.tsx`: `Count` and its four call sites in `ProjectNavItem`; replace `emphasised` with a status key, zeros neutral, pulse dot only for running.
- `src/components/QueueRow.tsx`: add the queued `StatusBadge` so queue rows and run rows share hues.
- `src/components/RunRow.tsx`: renders `StatusBadge` and `IssueClassBadge`; read-only reference for layout (the badge sits in `flex h-6 shrink-0 items-center`).
- `src/components/IssueClassBadge.tsx`: re-hue `/bug` and `/patch` out of the status palette.
- `src/components/ConnectionIndicator.tsx`: unchanged; the one exemption in the guard test.
- `src/types/adw.ts`: `RunStatus` (`running | completed | failed`), imported by the new map's key type. No change.
- `vitest.config.ts`: test layer is `src/**/*.test.ts`, node environment, `@` alias; the new test fits it as is.
- `knip.json`: every new export must be imported somewhere (types used only in their own file are ignored).
- `src/app/globals.css`: Tailwind v4 (`@import "tailwindcss"`) auto-detects class names in `src/**`, so literal strings in `src/lib/status-colors.ts` are seen. No change.

### New Files

- `src/lib/status-colors.ts`: the map and its key type.
- `src/lib/status-colors.test.ts`: shape test for the map and the source-tree hue guard.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Create `src/lib/status-colors.ts`

- Header comment (no em-dashes): this is the one place a run or queue state gets a colour; the palette table in one line each (queued amber, waiting; running emerald with the pulse dot, alive; completed sky; failed rose; neutral for zero counts); shades (light 700 text and 100 background, dark 400 text and 950 background); every class is written out in full because Tailwind finds classes by scanning source text, so never interpolate a hue name; the header's connection pill (`ConnectionIndicator`) keeps its own colours on purpose because it describes the socket, not a run, and is the one exemption in `status-colors.test.ts`; issue class badges are not states and use hues outside this palette.
- `import type { RunStatus } from "@/types/adw";`
- `export type StatusKey = RunStatus | "queued";`
- An unexported `interface StatusColors { text: string; badge: string; border: string; dot: string }` (or exported only if another file needs it; knip ignores types used in-file).
- `export const STATUS_COLORS: Record<StatusKey | "neutral", StatusColors>` with literal strings:
  - `queued`: text `"text-amber-700 dark:text-amber-400"`, badge `"bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"`, border `"border-amber-300 dark:border-amber-700"`, dot `"bg-amber-500"`.
  - `running`: the same pattern with `emerald`.
  - `completed`: the same pattern with `sky`.
  - `failed`: the same pattern with `rose`.
  - `neutral`: text `"text-neutral-400 dark:text-neutral-600"` (today's zero count), badge `"bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"`, border `"border-neutral-300 dark:border-neutral-600"`, dot `"bg-neutral-400"`.
- Key order `queued, running, completed, failed, neutral`, the order the sidebar shows.

### 2. Rewrite `src/components/StatusBadge.tsx` on the map

- Delete the local `STYLES`. Prop becomes `{ status: StatusKey }` (import `STATUS_COLORS`, `type StatusKey` from `@/lib/status-colors`; drop the `RunStatus` import if unused).
- Class: `` `inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status].badge}` ``.
- Pulse dot stays for `status === "running"` only; both inner spans take `STATUS_COLORS.running.dot` instead of the inline `bg-emerald-500` (keep `animate-ping`, `opacity-60`, sizes).
- Label stays the status string. Visible change: failed goes red to rose, text shades move 800/300 to 700/400.

### 3. Rewrite `Count` in `src/components/ProjectNav.tsx`

- Import `STATUS_COLORS` and `type StatusKey` from `@/lib/status-colors`.
- `Count({ status, value }: { status: StatusKey; value: number })`; the label is `status` itself (the four labels already equal the four keys), so the `label` and `emphasised` props go.
- Class: zero is `STATUS_COLORS.neutral.text`; non-zero is `` `font-semibold ${STATUS_COLORS[status].text}` ``. Keep `inline-flex items-center gap-1 tabular-nums`, the `title`, and the label span's `font-normal text-neutral-500 dark:text-neutral-400`. The plain `text-neutral-700 dark:text-neutral-300` branch goes (non-zero completed and failed now take sky and rose).
- Dot: render `<span className={`inline-block size-1.5 animate-pulse rounded-full ${STATUS_COLORS.running.dot}`} />` only when `status === "running" && value > 0`. Queued loses the pulse: it is waiting, not alive.
- Call sites in `ProjectNavItem`: `<Count status="queued" value={project.queued} />`, and the same for `running`, `completed`, `failed`, in that order.
- Touch nothing else in the file (query options, comments, nav markup).

### 4. Add the queued badge to `src/components/QueueRow.tsx`

- Import `StatusBadge` from `./StatusBadge` (no `"use client"`; `StatusBadge` is a plain component, as in `RunRow`).
- After the `Queued <time>` span (which keeps `ml-auto`), add `<StatusBadge status="queued" />`. The list only ever holds `state = queued` items (`applyQueueChange` drops anything else), so the literal is the row's state, not a computed value.
- Extend the doc comment by one clause: the queued badge uses the same map as run rows.
- Leave `BADGE` (neutral source badges) as is.

### 5. Re-hue `src/components/IssueClassBadge.tsx`

- `/bug`: `"border-fuchsia-300 text-fuchsia-800 dark:border-fuchsia-700 dark:text-fuchsia-300"`.
- `/patch`: `"border-lime-300 text-lime-800 dark:border-lime-700 dark:text-lime-300"`.
- `/feature` and `/chore` and `FALLBACK` unchanged.

### 6. Create `src/lib/status-colors.test.ts`

- `import { readdirSync, readFileSync } from "node:fs"; import { join, relative } from "node:path";` plus vitest and `STATUS_COLORS`.
- Shape test, per state, with a table `{ queued: "amber", running: "emerald", completed: "sky", failed: "rose" }`: the entry's `text` equals `` `text-${hue}-700 dark:text-${hue}-400` ``, `badge` equals `` `bg-${hue}-100 text-${hue}-700 dark:bg-${hue}-950 dark:text-${hue}-400` ``, `border` equals `` `border-${hue}-300 dark:border-${hue}-700` ``, `dot` equals `` `bg-${hue}-500` `` (interpolation is fine in the test: it compares strings, Tailwind never scans it for generation). And `neutral` contains only `neutral-` hues. And `Object.keys(STATUS_COLORS)` equals `["queued", "running", "completed", "failed", "neutral"]`.
- Guard test: walk `src/` (`new URL("..", import.meta.url).pathname` resolves `src/` from `src/lib/`), `readdirSync(root, { recursive: true })`, keep `.ts`, `.tsx`, `.css` files, skip `lib/status-colors.ts`, `lib/status-colors.test.ts` and `components/ConnectionIndicator.tsx` (an `EXEMPT` set with a comment: the socket pill is not a run state). For each, match `/\b(?:emerald|amber|sky|rose|red)-\d{2,3}\b/g` and collect `relative path: match`. Assert the collected list `toEqual([])`, so a failure names the file and class.
- Run `yarn test` once before steps 2 to 5 are applied (or reason through it): the guard would list `StatusBadge.tsx`, `ProjectNav.tsx` and `IssueClassBadge.tsx`; after them it passes.

### 7. Documentation

- `README.md`, intro bullet about the left pane (line 6 onward): add one sentence, e.g. "Every run and queue state has one colour wherever it appears (queued amber, running emerald with a pulsing dot, completed sky, failed rose, a zero count neutral), taken from the one map in `src/lib/status-colors.ts`; the header's connection pill keeps its own colours."
- `AGENTS.md`, Architecture, after the `formatTimestamp` rule: "Status colours come only from `STATUS_COLORS` in `src/lib/status-colors.ts` (queued amber, running emerald with the pulse dot, completed sky, failed rose, `neutral` for zeros), written as full literal class strings so Tailwind sees them; never interpolate a hue name. No component writes an `emerald`, `amber`, `sky`, `rose` or `red` class inline; `src/lib/status-colors.test.ts` scans `src/` and fails on one. The connection pill in `ConnectionIndicator` is the one exemption (it describes the socket, not a run). Issue class badges are not states and use hues outside the palette."
- No em-dashes anywhere. `.adw/project.md` needs no change.

### 8. Run the Validation Commands

- All must pass with zero errors. Then the review phase screenshots the surfaces below.

## Test Coverage

- Unit (vitest, `src/lib/status-colors.test.ts`), shape: pins each state to its hue and shades (light 700/100, dark 400/950) and the key set; catches a wrong hue or shade in the map, which nothing checks today (there is no component test layer).
- Unit (vitest, same file), guard: scans `src/**/*.{ts,tsx,css}` for `emerald|amber|sky|rose|red` shade classes outside the map and the exempt connection pill; fails on today's tree (`StatusBadge`, `ProjectNav`, `IssueClassBadge`) and catches any future inline status hue.
- No E2E spec: the profile's E2E is `none` and there is no component test layer. The rendered result is the review phase's evidence: `/` and `/projects/SBub/issebya-homes-ai-system` (or the first project the sidebar lists) at 1920x1080 and 375x667, light mode, checking the sidebar counts (queued amber without pulse, running emerald with pulse, completed sky, failed rose, zeros neutral), the Queue rows' amber `queued` badge, and the Active run rows' badges (running emerald with pulse, failed rose). Dark mode is not switchable from the UI (it follows the OS), so dark shades are covered by the shape test.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint`: ESLint over the changed components and the new lib and test files.
- `yarn typecheck`: `StatusKey` widening of `StatusBadge`, the new `Count` props and the `Record` map type check.
- `yarn knip`: the new exports (`STATUS_COLORS`, `StatusKey`) are all imported; nothing left dead after `Count` lost `label`/`emphasised`.
- `yarn format:check`: Prettier on every touched file (lefthook formats staged files, this proves the tree).
- `yarn test`: the new shape and guard tests pass alongside the existing suite.
- `yarn build`: the prerendered sidebar and pages still build with the changed components (needs `.env.local`).

## Notes

- Tailwind v4 scans `src/**` source text; a class assembled from parts (`` `text-${hue}-700` ``) in production code would never be generated. Only the test interpolates, and only for comparison.
- `StatusBadge` and `QueueRow` are not client components; adding the badge to `QueueRow` keeps it that way. `ProjectNav` stays the client component it is; the map is a plain constant, no clock, safe in the prerender.
- The connection pill's `live` is emerald and `connecting` amber; that overlap with the status palette is accepted by the issue (different surface, different meaning) and is why the exemption is by file name, with its reason in the map's comment and the test.
- Commit as `chore: ...`, no trailers (profile Documentation section).
