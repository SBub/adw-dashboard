# E2E Test: Hire Page

Checks the header's Hire me button on every route, the `/hire` page's static shell, its form, the
shared accent of the two buttons, the browser-side validation and the status states read from the
URL. It never submits a valid form: the review server runs with the owner's real keys, and a valid
submit would email `hire@issebya.com`.

## User Story

As a recruiter or prospective client visiting the dashboard
I want a visible "Hire me" entry point and a short form to send a request
So that I can contact the owner about product engineering or AI consulting work without leaving
the site

## Test Steps

1. Navigate to the `Application URL` (`/`).
2. **Verify** the header has a `Hire me` link with `href="/hire"` and no `aria-current`.
3. Navigate to `/projects` and **Verify** the same `Hire me` link is in the header.
4. Click the first project link in the sidebar's `Projects` navigation and **Verify** the same
   `Hire me` link is in the header.
5. Click the header's `Hire me` link.
6. **Verify** the URL is `/hire` and the `Hire me` link has `aria-current="page"`.
7. **Verify** the heading `Hire me`, the intro paragraphs, and a `LinkedIn profile` link with
   `target="_blank"` and `rel="noreferrer"`.
8. **Verify** the `offer` select has exactly two options, `Product engineer` and `AI consulting`.
9. With `browser_evaluate`, collect the `bg-fuchsia-*` classes of the `Send` button and of the
   header's `Hire me` link. **Verify** the two lists are identical and not empty.
10. **Verify** the page has no connection indicator and no `Projects` sidebar navigation.
11. Choose an offer, fill the email with `visitor@example.com`, leave the motivation empty and
    click `Send`.
12. **Verify** the URL is still `/hire` with no query, and with `browser_evaluate` that the
    motivation textarea's `validity.valueMissing` is `true` (the browser blocked the submit).
13. Navigate to `/hire?sent=1` and **Verify** the confirmation `Thanks, your message was sent.`
    shows and there is no form.
14. Navigate to `/hire?error=verification` and **Verify** the message
    `We could not verify you are human. Please try again.` shows above the form.
15. Navigate to `/hire?error=<script>` and **Verify** the plain form shows with no error message,
    and the text `<script>` appears nowhere on the page.
16. Navigate to `/hire` and take a full-page screenshot at 1920x1080.
17. Resize to 375x667 and take a full-page screenshot.
18. **Verify** at 375 that the header shows `ADW Dashboard`, `Projects` and `Hire me`, and with
    `browser_evaluate` that `document.documentElement.scrollWidth <= 375`.

## Success Criteria

- The `Hire me` link is in the header on `/`, `/projects`, a project page and `/hire`, and is
  marked `aria-current="page"` only on `/hire`.
- `/hire` shows the heading, intro, LinkedIn link and a form whose select has exactly the two
  offers, with no sidebar and no connection indicator.
- The Send button and the header link share the same fuchsia classes.
- An empty motivation is blocked by the browser; nothing is posted.
- `?sent=1` shows the confirmation in place of the form, `?error=verification` shows its message
  above the form, and an unknown `?error=` shows the plain form without echoing the query.
- The header fits at 375px with no horizontal overflow.
- 2 screenshots are taken.
