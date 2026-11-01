import {
  expect,
  expectNoHorizontalOverflow,
  openFirstProject,
  sectionRows,
  test,
  waitForLive,
  type Page,
} from "./fixtures";

// The Queue section shows items held on a dependency (issue #255): state held
// with a reason starting `waiting on a dependency: ` sits in Up next with a
// `waiting` pill and the reason after the prefix on the same line, while a
// gate-held item (any other reason) stays out. Ordinals and `next` count the
// queued items only.
//
// The hosted database is never written (see the Protected rules), so the
// browser's own /rest/v1/queue_items read (the channel's first catch-up calls
// getQueue for the cached queue) is answered with synthetic rows. The route
// emulates the PostgREST filter of the request it receives rather than
// returning the rows blindly, so the spec fails when getQueue stops asking for
// dependency-held rows. Negative check: revert getQueue's
// `.or(QUEUE_SECTION_FILTER)` to `.eq("state", "queued")`; the route then
// returns one row and the count of 3 fails.

const PREFIX = "waiting on a dependency: ";
const REASON_A = "blocked by #925502 (queued); starts on its own once #925502 merges";
const REASON_B = "blocked by #925501 (held); starts on its own once #925501 merges";

interface Row {
  project_id: string;
  issue_number: number;
  state: string;
  source: string;
  position: number;
  issue_title: string;
  queued_at: string;
  adw_id: string | null;
  reason: string | null;
  updated_at: string;
}

function rowsFor(projectId: string): Row[] {
  const at = "2026-11-01T09:00:00Z";
  const row = (
    issue: number,
    title: string,
    state: string,
    position: number,
    reason: string | null,
  ): Row => ({
    project_id: projectId,
    issue_number: issue,
    state,
    source: "label:adw:queued",
    position,
    issue_title: title,
    queued_at: at,
    adw_id: null,
    reason,
    updated_at: at,
  });
  return [
    row(925501, "E2E 255 waiting A", "held", 2, `${PREFIX}${REASON_A}`),
    row(925502, "E2E 255 queued", "queued", 5, null),
    row(925503, "E2E 255 waiting B", "held", 9, `${PREFIX}${REASON_B}`),
    row(925504, "E2E 255 gate held", "held", 3, "hold label adw:hold"),
    row(925505, "E2E 255 running", "running", 1, null),
  ];
}

// Answers every queue_items read with the synthetic rows the request's own
// filter selects; an unrecognised filter gets a 500 so the mismatch shows.
async function routeQueue(page: Page): Promise<void> {
  await page.route("**/rest/v1/queue_items?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const projectId = (params.get("project_id") ?? "").replace(/^eq\./, "");
    const or = params.get("or") ?? "";
    const rows = rowsFor(projectId);
    let selected: Row[];
    if (
      or.includes("state.eq.queued") &&
      or.includes("state.eq.held") &&
      or.includes(`reason.like."${PREFIX}*"`)
    ) {
      selected = rows.filter(
        (row) =>
          row.state === "queued" || (row.state === "held" && !!row.reason?.startsWith(PREFIX)),
      );
    } else if (or === "" && params.get("state") === "eq.queued") {
      selected = rows.filter((row) => row.state === "queued");
    } else {
      await route.fulfill({ status: 500, json: { message: `unexpected filter: ${params}` } });
      return;
    }
    selected.sort((a, b) => a.position - b.position || a.issue_number - b.issue_number);
    await route.fulfill({ json: selected });
  });
}

for (const width of [390, 1440]) {
  test(`dependency-held items show as waiting rows at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await routeQueue(page);
    await openFirstProject(page);
    await waitForLive(page);

    const rows = sectionRows(page, "Up next");
    await expect(rows).toHaveCount(3, { timeout: 15_000 });
    await expect(rows.nth(0)).toContainText("E2E 255 waiting A");
    await expect(rows.nth(1)).toContainText("E2E 255 queued");
    await expect(rows.nth(2)).toContainText("E2E 255 waiting B");
    await expect(rows.filter({ hasText: "E2E 255 gate held" })).toHaveCount(0);

    const marker = (i: number) => rows.nth(i).locator("xpath=./div").first();
    await expect(marker(1)).toHaveText("next");
    await expect(marker(0)).toHaveText("");
    await expect(marker(2)).toHaveText("");

    await expect(rows.nth(1).getByText("queued", { exact: true })).toBeVisible();
    for (const [i, reason] of [
      [0, REASON_A],
      [2, REASON_B],
    ] as const) {
      const row = rows.nth(i);
      await expect(row.getByText("waiting", { exact: true })).toBeVisible();
      await expect(row).not.toContainText("waiting on a dependency:");
      const reasonSpan = row.locator("span[title]");
      await expect(reasonSpan).toHaveText(reason);
      await expect(reasonSpan).toHaveAttribute("title", reason);
    }

    // One line: the link, the reason and the pill share the link's top, and
    // the reason is a single 24px line box.
    for (let i = 0; i < 3; i++) {
      const g = await rows.nth(i).evaluate((li) => {
        const card = li.querySelector(":scope > div:last-of-type");
        const link = card?.querySelector("a");
        if (!card || !link) throw new Error("the queue row has no card or issue link");
        const pill = Array.from(card.querySelectorAll("span")).find((s) =>
          ["queued", "waiting"].includes(s.textContent?.trim() ?? ""),
        );
        if (!pill) throw new Error("the queue row has no pill");
        const reason = card.querySelector("span[title]");
        const top = (el: Element) => el.getBoundingClientRect().top;
        return {
          linkTop: top(link),
          pillTop: top(pill),
          reasonTop: reason ? top(reason) : null,
          reasonHeight: reason ? reason.getBoundingClientRect().height : null,
        };
      });
      expect(Math.abs(g.pillTop - g.linkTop)).toBeLessThanOrEqual(2);
      if (i !== 1) {
        expect(g.reasonTop).not.toBeNull();
        expect(Math.abs((g.reasonTop ?? 0) - g.linkTop)).toBeLessThanOrEqual(2);
        expect(g.reasonHeight ?? 0).toBeLessThanOrEqual(26);
      }
    }

    await expectNoHorizontalOverflow(page);
  });
}
