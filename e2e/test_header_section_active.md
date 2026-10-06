# E2E Test: Header Section Active

Checks that the root header marks the current section: the brand `ADW Dashboard` on `/`, the
`Projects` link on `/projects` and on a project page, and neither on a route outside both
sections.

## User Story

As a person using the ADW dashboard
I want the header to show which section I am in
So that I can tell at a glance whether I am on the summary or in the projects area, and assistive
technology announces the current page link

## Test Steps

1. Navigate to the `Application URL` (`/`).
2. **Verify** the `ADW Dashboard` link in the header has `aria-current="page"` and the `Projects`
   link in the `Sections` navigation has no `aria-current`.
3. Navigate to `/projects`.
4. **Verify** the `Projects` link in the `Sections` navigation has `aria-current="page"` and the
   `ADW Dashboard` link has no `aria-current`.
5. Click the first project link in the sidebar's `Projects` navigation and note its `href`.
6. **Verify** the URL is `/projects/<owner>/<repo>` (the noted `href`) and the header's `Projects`
   link in the `Sections` navigation has `aria-current="page"`.
7. Take a screenshot of the project page at 1920x1080.
8. Resize to 375x667 and take a screenshot of the project page.
9. Resize back to 1920x1080 and navigate to `/projectsx`.
10. **Verify** the not-found page renders and neither the `ADW Dashboard` link nor the `Projects`
    link has `aria-current`.

## Success Criteria

- `/` marks the brand only.
- `/projects` and a project page mark `Projects` only.
- `/projectsx` marks neither link.
- 2 screenshots are taken.
