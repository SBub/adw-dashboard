import {
  expect,
  hasActiveRow,
  hasHistoryRow,
  hasQueuedItem,
  openFirstProject,
  requireProject,
  sectionRows,
  test,
  type Locator,
  type Page,
} from "./fixtures";

// Run rows (Active, History) and queue rows show the issue title in full,
// wrapping with no ellipsis, and the rest of the row (the pill, History's
// adw_id, the queue marker) sits on the title's first line. The long title is
// set in the test browser's DOM only. Probe: `truncate` on a title span must
// fail this spec.

const T =
  "Landing page rendering: static shell, cached past days, request-time today card and a Refresh button on the summary page"
    .padEnd(120, ".")
    .slice(0, 120);

interface Measure {
  textOverflow: string;
  whiteSpace: string;
  noOverflow: boolean;
  length: number;
  hasTitle: boolean;
  lines: number;
  firstLineTop: number;
  spanTop: number;
  pillTop: number | null;
  adwIdTop: number | null;
  hasCompleted: boolean;
  markerTop: number | null;
}

// The title span is the text-only span right after the `#<n>` issue link.
// Runs in the page: it sets the title when `text` is given, then measures.
function measureRow(li: Element, text: string | null): Measure | null {
  const link = Array.from(li.querySelectorAll("a")).find((a) =>
    /^#\d+$/.test(a.textContent?.trim() ?? ""),
  );
  const next = link?.nextElementSibling;
  if (!link || !next || next.tagName !== "SPAN" || next.children.length > 0) return null;
  const span = next as HTMLElement;
  if (text !== null) span.textContent = text;

  const style = getComputedStyle(span);
  const range = document.createRange();
  range.selectNodeContents(span);
  const rects = Array.from(range.getClientRects());
  const tops = new Set(rects.map((r) => Math.round(r.top)));
  const pill = Array.from(li.querySelectorAll("span")).find((s) =>
    /^(running|failed|queued)$/.test(s.textContent?.trim() ?? ""),
  );
  const code = link.parentElement?.querySelector(":scope > code") ?? null;
  // A queue row's marker, in the gutter (the li's first div); none on a run row.
  const marker = li.querySelector(":scope > div:first-of-type > span > span");
  return {
    textOverflow: style.textOverflow,
    whiteSpace: style.whiteSpace,
    noOverflow: span.scrollWidth <= span.clientWidth,
    length: span.textContent?.length ?? 0,
    hasTitle: span.hasAttribute("title"),
    lines: tops.size,
    firstLineTop: rects[0]?.top ?? NaN,
    spanTop: span.getBoundingClientRect().top,
    pillTop: pill?.getBoundingClientRect().top ?? null,
    adwIdTop: code?.getBoundingClientRect().top ?? null,
    hasCompleted: Array.from(li.querySelectorAll("*")).some(
      (el) => el.textContent?.trim() === "completed",
    ),
    markerTop: marker?.getBoundingClientRect().top ?? null,
  };
}

// Sets T on the first row of the list that has a title span; returns that row,
// or null when no row has a title.
async function setLongTitle(rows: Locator): Promise<Locator | null> {
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    if ((await rows.nth(i).evaluate(measureRow, T)) !== null) return rows.nth(i);
  }
  return null;
}

async function measure(row: Locator): Promise<Measure> {
  const m = await row.evaluate(measureRow, null);
  if (m === null) throw new Error("the row lost its title span");
  return m;
}

async function expectFullTitle(row: Locator, m: Measure): Promise<void> {
  expect(m.textOverflow).not.toBe("ellipsis");
  expect(m.whiteSpace).not.toBe("nowrap");
  expect(m.noOverflow).toBe(true);
  expect(m.length).toBe(120);
  expect(m.hasTitle).toBe(false);
  await expect(row.getByText(T, { exact: true })).toHaveText(T);
}

// The computed style of the dd under a field label, in the row's detail grid.
async function fieldStyle(
  row: Locator,
  label: string,
): Promise<{ textOverflow: string; whiteSpace: string; code: string | null } | null> {
  return row.evaluate((li, name) => {
    const dt = Array.from(li.querySelectorAll("dt")).find((d) => d.textContent?.trim() === name);
    const dd = dt?.nextElementSibling;
    if (!dd) return null;
    const style = getComputedStyle(dd);
    return {
      textOverflow: style.textOverflow,
      whiteSpace: style.whiteSpace,
      code: dd.querySelector("code")?.textContent ?? null,
    };
  }, label);
}

async function toMobile(page: Page): Promise<void> {
  await page.setViewportSize({ width: 375, height: 667 });
}

test.describe("row full title, top aligned", () => {
  test("the title constant is 120 characters", () => {
    expect(T).toHaveLength(120);
  });

  test("headings are present", async ({ page }) => {
    await openFirstProject(page);
    const main = page.getByRole("main");
    for (const title of ["Building now", "Up next", "Shipped"]) {
      await expect(main.getByRole("heading", { level: 2, name: title, exact: true })).toBeVisible();
    }
  });

  test("History rows show a 120-character title in full", async ({ page }) => {
    await requireProject(page, hasHistoryRow, "no project has a History row");
    const rows = sectionRows(page, "Shipped");
    const row = await setLongTitle(rows);
    test.skip(row === null, "no History row has a title");
    if (row === null) return;

    const wide = await measure(row);
    await expectFullTitle(row, wide);
    expect(wide.hasCompleted).toBe(false);
    // Both are leading-6 boxes, so their tops are the first line's top; the
    // glyph rect (firstLineTop) sits about 3px lower, so it is not used here.
    if (wide.adwIdTop !== null && wide.adwIdTop < wide.spanTop + 12) {
      expect(Math.abs(wide.adwIdTop - wide.spanTop)).toBeLessThanOrEqual(2);
    }

    // The detail grid keeps its truncation, except History's branch.
    const finished = await fieldStyle(rows.first(), "Finished");
    expect(finished?.textOverflow).toBe("ellipsis");
    const branch = await fieldStyle(rows.first(), "Branch");
    expect(branch).not.toBeNull();
    expect(branch?.textOverflow).not.toBe("ellipsis");
    expect(branch?.whiteSpace).not.toBe("nowrap");
    expect(branch?.code ?? "").not.toMatch(/\.\.\.$/);

    await toMobile(page);
    const narrow = await measure(row);
    expect(narrow.lines > wide.lines || narrow.lines >= 3).toBe(true);
    expect(narrow.textOverflow).not.toBe("ellipsis");
    expect(narrow.noOverflow).toBe(true);
    expect(narrow.hasCompleted).toBe(false);
  });

  test("Active rows show a 120-character title in full, the pill on its first line", async ({
    page,
  }) => {
    await requireProject(page, hasActiveRow, "no project has an active run");
    const rows = sectionRows(page, "Building now");
    const row = await setLongTitle(rows);
    test.skip(row === null, "no Active row has a title");
    if (row === null) return;

    const wide = await measure(row);
    await expectFullTitle(row, wide);
    if (wide.pillTop === null) throw new Error("the Active row has no pill");
    expect(Math.abs(wide.pillTop - wide.firstLineTop)).toBeLessThanOrEqual(2);
    expect(Math.abs(wide.pillTop - wide.spanTop)).toBeLessThanOrEqual(2);
    const branch = await fieldStyle(row, "Branch");
    expect(branch?.textOverflow).toBe("ellipsis");

    await toMobile(page);
    const narrow = await measure(row);
    expect(narrow.lines > wide.lines || narrow.lines >= 3).toBe(true);
    expect(narrow.textOverflow).not.toBe("ellipsis");
    expect(narrow.noOverflow).toBe(true);
    if (narrow.pillTop === null) throw new Error("the Active row lost its pill");
    expect(Math.abs(narrow.pillTop - narrow.firstLineTop)).toBeLessThanOrEqual(2);
  });

  test("Queue rows show a 120-character title in full, pill and marker on its first line", async ({
    page,
  }) => {
    await requireProject(page, hasQueuedItem, "no project has a queued item");
    const rows = sectionRows(page, "Up next");
    // A row held on a dependency (waiting pill, reason span) is covered by queue_dependency_held.spec.ts; this test measures a queued row.
    const queued = rows.filter({ has: page.getByText("queued", { exact: true }) });
    const row = await setLongTitle(queued);
    test.skip(row === null, "no queued item has a title");
    if (row === null) return;

    const expectFirstLine = (m: Measure) => {
      if (m.pillTop === null || m.markerTop === null) {
        throw new Error("the queue row has no pill or marker");
      }
      expect(Math.abs(m.pillTop - m.firstLineTop)).toBeLessThanOrEqual(2);
      expect(Math.abs(m.markerTop - m.firstLineTop)).toBeLessThanOrEqual(2);
    };

    const wide = await measure(row);
    await expectFullTitle(row, wide);
    expectFirstLine(wide);

    // The rail line runs unbroken from the first marker to the second.
    if ((await rows.count()) >= 2) {
      const railBottom = await rows
        .nth(0)
        .evaluate(
          (li) => li.querySelector(":scope > span[aria-hidden]")?.getBoundingClientRect().bottom,
        );
      const secondCentre = await rows.nth(1).evaluate((li) => {
        const r = li.querySelector(":scope > div:first-of-type > span > span");
        const rect = r?.getBoundingClientRect();
        return rect ? rect.top + rect.height / 2 : undefined;
      });
      if (railBottom === undefined || secondCentre === undefined) {
        throw new Error("the queue rail or the second marker is missing");
      }
      expect(railBottom).toBeGreaterThanOrEqual(secondCentre);
    }

    await toMobile(page);
    const narrow = await measure(row);
    expect(narrow.lines > wide.lines || narrow.lines >= 3).toBe(true);
    expect(narrow.textOverflow).not.toBe("ellipsis");
    expect(narrow.noOverflow).toBe(true);
    expectFirstLine(narrow);
  });
});
