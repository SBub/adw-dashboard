# Patch: Add scripts/release.ts to the knip entry list

## Metadata

adw_id: `35167e14`
review_change_request: `Issue #2: Spec step 8 (Knip) was not done: knip.json "entry" is still only ["scripts/backfill-changelog.ts"]; "scripts/release.ts" is not in it. "yarn knip" still exits 0, almost certainly because knip's GitHub Actions plugin finds "node scripts/release.ts" in release.yml. So the check holds today, but the explicit entry the spec asked for is missing, and it would stop holding if the workflow's run line changed. Resolution: Add "scripts/release.ts" to the "entry" array in knip.json, next to scripts/backfill-changelog.ts, then re-run "yarn knip" and confirm it exits 0. Severity: blocker`

## Issue Summary

**Original Spec:** `specs/issue-248-adw-35167e14-sdlc_planner-release-automation.md`
**Issue:** Spec step 8 asked for `scripts/release.ts` to be an explicit knip entry. `knip.json` still lists only `scripts/backfill-changelog.ts`, so the script is reachable only through knip's GitHub Actions plugin reading `release.yml`, which breaks silently if the workflow's run line changes.
**Solution:** Add `"scripts/release.ts"` to the `entry` array in `knip.json`, right after `"scripts/backfill-changelog.ts"`, and confirm `yarn knip` exits 0.

## Files to Modify

Use these files to implement the patch:

- `knip.json`

## Implementation Steps

IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add the entry

- In `knip.json`, change `"entry": ["scripts/backfill-changelog.ts"]` to `"entry": ["scripts/backfill-changelog.ts", "scripts/release.ts"]`.
- Touch nothing else in the file.

### Step 2: Check knip and formatting

- Run `yarn knip`. It must exit 0. If it now reports an unused export or a redundant entry, fix the cause (remove the unused export) rather than dropping the new entry or adding an ignore.
- Run `yarn format:check`; if Prettier wants the array wrapped differently, run `yarn format` on `knip.json` only.

## Validation

Execute every command to validate the patch is complete with zero regressions.

- `yarn format:check` - `knip.json` is formatted.
- `yarn lint` - unchanged, still clean.
- `yarn typecheck` - unchanged, still clean.
- `yarn knip` - exits 0 with `scripts/release.ts` as an explicit entry.
- `yarn test` - unit suite still green.

## Patch Scope

**Lines of code to change:** 1
**Risk level:** low
**Testing required:** `yarn knip` exits 0; the commit-hook checks (format, lint, typecheck, knip) and `yarn test` still pass.
