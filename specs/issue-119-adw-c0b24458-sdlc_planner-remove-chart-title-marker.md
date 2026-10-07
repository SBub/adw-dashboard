# Chore: Chart cards: remove the coloured dot before the card titles

## Metadata

issue_number: `119`
adw_id: `c0b24458`
issue_json: `{"number":119,"title":"Chart cards: remove the coloured dot before the card titles","body":"The day card chart titles \"Work by class\" and \"Tokens by model\" start with a small coloured square that carries no meaning (the bars below have their own colours). Remove it from src/components/ColumnChart.tsx; the title text, subtitle and spacing otherwise stay the same (title aligns with the subtitle's left edge). Update any test or e2e spec that asserts the marker. No other change.\n"}`

## Chore Description

Each day card on `/` shows two chart cards (`DayCharts`): "Work by class" (`ClassColumnChart`) and
"Tokens by model" (`ModelColumnChart`). Both render through the shared `ColumnChart`, whose
`<figcaption>` puts an `aria-hidden` coloured square (`size-2.5 shrink-0 rounded-sm ${swatchClass}`)
before the title, inside a `flex items-center gap-2` wrapper. The square carries no meaning; the
bars and the dots under them have their own colours.

Remove the square. With it gone, the `swatchClass` prop has no use, so drop it from
`ColumnChartProps`, from the destructuring, and from both callers (`ClassColumnChart` passes
`CLASS_BG["/feature"]`, `ModelColumnChart` passes `MODEL_BG.opus`). The title keeps its text and
classes (`text-sm font-medium`), now as a block so it starts at the subtitle's left edge; the
subtitle, the `mb-3` caption spacing and everything below the caption stay unchanged. The colour dots
beside the column names under the plot (`size-2 shrink-0 rounded-full ${column.colorClass}`) are NOT
the marker and stay.

`CLASS_BG` and `MODEL_BG` stay exported and used (both callers still use them for `colorClass`), so
`yarn knip` is unaffected. No test or e2e spec currently asserts the title square (checked: no
`swatch` or `square` in `e2e/` or any `*.test.ts`); the README's Summary section describes it in
prose and must be corrected, since README describes the current code.

## Relevant Files

Use these files to resolve the chore:

- `src/components/ColumnChart.tsx` - the shared chart card. Holds the square in the `<figcaption>`, the
  `swatchClass` prop (with its doc comment "The caption's square ...") and the component's JSDoc
  ("a bordered figure with a coloured square, a title and a muted subtitle"). All three change.
- `src/components/ClassColumnChart.tsx` - passes `swatchClass={CLASS_BG["/feature"]}`; remove that
  line only (keep the `CLASS_BG` import, still used for `colorClass`).
- `src/components/ModelColumnChart.tsx` - passes `swatchClass={MODEL_BG.opus}`; remove that line only
  (keep the `MODEL_BG` import, still used for `colorClass`).
- `README.md` - "## Summary" section (around line 1213) says the chart cards are "each with a coloured
  square, a title and a muted subtitle"; rewrite to "each with a title and a muted subtitle".
- `e2e/test_day_card_charts.md` - the agent-driven journey for the chart cards. Asserts captions and
  subtitles but not the square; extend step 2 so the regression is visible in acceptance.
- `AGENTS.md` - read for conventions (no em-dashes, components stateless, `ColumnChart` rendered by the
  client `TodaySummary` so it stays free of `"use client"` and server-only imports). It does not mention
  the square, so it needs no edit.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Remove the square and the `swatchClass` prop from `ColumnChart`

- In `src/components/ColumnChart.tsx`, delete from `ColumnChartProps` the `swatchClass: string;` field
  and its doc comment `/** The caption's square, a full literal class string from src/lib/chart-colors.ts. */`.
- Remove `swatchClass,` from the function's destructured parameters.
- Replace the caption's title wrapper:
  ```tsx
  <span className="flex items-center gap-2">
    <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-sm ${swatchClass}`} />
    <span className="text-sm font-medium">{title}</span>
  </span>
  ```
  with a single block-level title:
  ```tsx
  <span className="block text-sm font-medium">{title}</span>
  ```
  so the title sits on its own line flush with the subtitle's left edge. Leave the `<figcaption className="mb-3">`
  and the subtitle `<span className="block text-xs text-neutral-500 dark:text-neutral-400">` as they are.
- Update the component JSDoc: "A chart card: a bordered figure with a coloured square, a title and a
  muted subtitle, ..." becomes "A chart card: a bordered figure with a title and a muted subtitle, ...".
  Leave the sentence about the dot of the bar's colour under the plot untouched (those dots stay).
- Do not touch the column-name dots, the plot, the tooltips or anything else.

### 2. Drop the prop from the two callers

- `src/components/ClassColumnChart.tsx`: delete the line `swatchClass={CLASS_BG["/feature"]}`.
- `src/components/ModelColumnChart.tsx`: delete the line `swatchClass={MODEL_BG.opus}`.
- Keep both imports; they are still used for each column's `colorClass`.

### 3. Correct the README

- In `README.md`, "## Summary": change "two bordered chart cards, side by side from 640px and stacked
  below, each with a coloured square, a title and a muted subtitle:" to "... each with a title and a
  muted subtitle:". Re-wrap the paragraph as Prettier/the surrounding text does; no em-dashes.

### 4. Extend the e2e journey

- In `e2e/test_day_card_charts.md`, step 2: add that each `figcaption` holds only text, no
  `aria-hidden` decorative element before the title (with `browser_evaluate`,
  `figcaption.querySelector('[aria-hidden="true"]') === null` for both figures), and that the title's
  and subtitle's `getBoundingClientRect().left` are equal. Add a matching line to the spec's success
  criteria list (e.g. "Chart card titles have no marker before them and align with their subtitles.").
  Keep the existing assertions (including the colour dot under each bar) unchanged.

### 5. Run the validation commands

- Run every command in `Validation Commands` below from the worktree root; all must pass.
- Confirm with `grep -rn "swatch" src` that nothing references the removed prop.

## Test Coverage

No test needed in the unit layer: the change only removes markup and an unused prop from a component,
and the profile's one automated test layer is `src/**/*.test.ts` (pure helpers and reducers) with no
component test layer and no Playwright code suite; no helper in `src/lib/` changes. `yarn typecheck`
proves the prop is gone from every caller (a leftover `swatchClass=` would fail it). The visible
result is checked by the review phase's screenshots of `/` at 1920x1080 and 375x667 (title cards with
no square, title flush with the subtitle) and by the extended `e2e/test_day_card_charts.md` journey.

## Validation Commands

Execute every command to validate the chore is complete with zero regressions.

- `yarn lint` - ESLint over the edited components.
- `yarn typecheck` - proves `swatchClass` is removed from the props and from both callers consistently.
- `yarn knip` - confirms no export (`CLASS_BG`, `MODEL_BG`) became unused.
- `yarn format:check` - Prettier on the TSX, README and e2e spec edits.
- `yarn test` - the unit suite stays green (no helper changed).
- `yarn build` - the summary page and the client `TodaySummary` still build and prerender.

## Notes

- Do not remove the dots beside the column names under each plot; the issue is only about the square
  before the card titles.
- No change to `AGENTS.md`, `.adw/project.md` or `src/lib/chart-colors.ts` is needed.
- Commit as `chore: remove the marker before chart card titles` (no trailers).
- No em-dashes in any edited file.
