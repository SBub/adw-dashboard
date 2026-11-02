import {
  expect,
  hasActiveRow,
  requireProject,
  section,
  sectionRows,
  test,
  type Locator,
  type Page,
} from "./fixtures";

// A History card shows Branch, Finished, Duration, then PR and Cost when the
// run has them, with no status pill, no Final phase and no Started. The branch
// is shown in full as plain text, selected whole by one click, never a link
// (the toolkit deletes merged branches); the PR field is the card's pull
// request link. The fields sit on one row at 1280px and stack at 375px. The
// long branch is set in the test browser's DOM only.

const BRANCH_DT = /^Branch$/;
const PR_DT = /^PR$/;
const COST_DT = /^Cost$/;

function slugOf(href: string): string {
  return href.replace(/^\/projects\//, "");
}

// The dd of a field, found through its dt inside the card's detail grid.
function field(page: Page, card: Locator, label: RegExp): Locator {
  return card
    .locator("dl > div")
    .filter({ has: page.locator("dt").filter({ hasText: label }) })
    .locator("dd");
}

function cardsWith(page: Page, label: RegExp): Locator {
  return sectionRows(page, "Shipped").filter({
    has: page.locator("dt").filter({ hasText: label }),
  });
}

async function firstCardHasBranch(page: Page): Promise<boolean> {
  const first = sectionRows(page, "Shipped").first();
  return (
    (await first.count()) > 0 && (await field(page, first, BRANCH_DT).locator("code").count()) > 0
  );
}

// A predicate that pages History with Older runs until a card carries the
// field, leaving the page there; bounded, the project's last page ends it.
function pagesToCardWith(label: RegExp): (page: Page) => Promise<boolean> {
  return async (page) => {
    const nav = page.getByRole("navigation", { name: "History pages" });
    const indicator = nav.getByText(/^\d+ of \d+$/);
    for (let turns = 0; turns < 20; turns++) {
      if ((await cardsWith(page, label).count()) > 0) return true;
      const older = nav.getByRole("link", { name: "Older runs" });
      if ((await older.count()) === 0) return false;
      const before = await indicator.textContent();
      await older.click();
      await expect(indicator).not.toHaveText(before ?? "", { timeout: 15_000 });
      await expect(section(page, "Shipped").locator("div[aria-busy]:not([role])")).toHaveAttribute(
        "aria-busy",
        "false",
      );
    }
    return false;
  };
}

// The tops of the present field dds, in grid order.
async function fieldTops(card: Locator): Promise<number[]> {
  return card.evaluate((li) =>
    Array.from(li.querySelectorAll("dl dd"), (dd) => dd.getBoundingClientRect().top),
  );
}

test.describe("history card fields", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("the first card shows exactly its fields", async ({ page }) => {
    await requireProject(page, firstCardHasBranch, "no project has a History row with a branch");
    const card = sectionRows(page, "Shipped").first();

    const dts = (await card.locator("dt").allTextContents()).map((t) => t.trim());
    expect(dts.join(",")).toMatch(/^Branch,Finished,Duration(,PR)?(,Cost)?$/);
    await expect(card.getByText("completed", { exact: true })).toHaveCount(0);
    await expect(card.getByText("Final phase")).toHaveCount(0);
    await expect(card.getByText("Started")).toHaveCount(0);

    const dd = field(page, card, BRANCH_DT);
    const code = dd.locator("code");
    const branch = (await code.textContent()) ?? "";
    expect(branch).not.toMatch(/\.\.\.$/);
    const styles = await code.evaluate((el) => {
      const ddEl = el.closest("dd");
      if (!ddEl) throw new Error("the branch code is outside a dd");
      const dds = getComputedStyle(ddEl);
      return {
        userSelect: getComputedStyle(el).userSelect,
        textOverflow: dds.textOverflow,
        whiteSpace: dds.whiteSpace,
        noOverflow: ddEl.scrollWidth <= ddEl.clientWidth,
      };
    });
    expect(styles.userSelect).toBe("all");
    expect(styles.textOverflow).not.toBe("ellipsis");
    expect(styles.whiteSpace).not.toBe("nowrap");
    expect(styles.noOverflow).toBe(true);

    await expect(dd.locator("a")).toHaveCount(0);

    // One row at 1280px.
    const [firstTop, ...tops] = await fieldTops(card);
    if (firstTop === undefined) throw new Error("the card has no fields");
    for (const top of tops) expect(Math.abs(top - firstTop)).toBeLessThanOrEqual(2);
  });

  test("no History card links to a branch tree", async ({ page }) => {
    await requireProject(page, firstCardHasBranch, "no project has a History row with a branch");
    await expect(section(page, "Shipped").locator('a[href*="/tree/"]')).toHaveCount(0);
  });

  test("a PR field links to the pull request", async ({ page }) => {
    const href = await requireProject(
      page,
      pagesToCardWith(PR_DT),
      "no run in any project has a pull request",
    );
    const card = cardsWith(page, PR_DT).first();
    const link = field(page, card, PR_DT).getByRole("link");
    const text = ((await link.textContent()) ?? "").trim();
    expect(text).toMatch(/^#\d+$/);
    await expect(link).toHaveAttribute(
      "href",
      `https://github.com/${slugOf(href)}/pull/${text.slice(1)}`,
    );
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
  });

  test("a Cost field is formatted", async ({ page }) => {
    await requireProject(page, pagesToCardWith(COST_DT), "no run in any project published metrics");
    const value = field(page, cardsWith(page, COST_DT).first(), COST_DT);
    await expect(value).toHaveText(/^(\$\d+\.\d{2}|<\$0\.01)$/);
  });

  test("one click and a triple click select exactly the branch", async ({ page }) => {
    await requireProject(page, firstCardHasBranch, "no project has a History row with a branch");
    const code = field(page, sectionRows(page, "Shipped").first(), BRANCH_DT).locator("code");
    const branch = (await code.textContent()) ?? "";
    const selection = () => page.evaluate(() => window.getSelection()?.toString() ?? "");

    await code.click();
    expect(await selection()).toBe(branch);
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await code.click({ clickCount: 3 });
    expect(await selection()).toBe(branch);
  });

  test("a long branch wraps without overflow", async ({ page }) => {
    await requireProject(page, firstCardHasBranch, "no project has a History row with a branch");
    const card = sectionRows(page, "Shipped").first();
    const code = field(page, card, BRANCH_DT).locator("code");
    const long = "chore/issue-999-adw-deadbeef-".padEnd(120, "x");
    expect(long).toHaveLength(120);
    await code.evaluate((el, text) => {
      el.textContent = text;
    }, long);

    const overflow = () =>
      code.evaluate((el) => {
        const dd = el.closest("dd");
        const li = el.closest("li");
        if (!dd || !li) throw new Error("the branch code is outside its card");
        const range = document.createRange();
        range.selectNodeContents(el);
        const tops = new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top)));
        return {
          dd: dd.scrollWidth <= dd.clientWidth,
          li: li.scrollWidth <= li.clientWidth,
          lines: tops.size,
        };
      });

    const wide = await overflow();
    expect(wide.dd).toBe(true);
    expect(wide.li).toBe(true);

    await page.setViewportSize({ width: 375, height: 667 });
    const narrow = await overflow();
    expect(narrow.dd).toBe(true);
    expect(narrow.li).toBe(true);
    expect(narrow.lines).toBeGreaterThan(1);
    // Stacked: every field below the one before it.
    const tops = await fieldTops(card);
    expect(tops.length).toBeGreaterThan(1);
    tops.slice(1).forEach((top, i) => expect(top).toBeGreaterThan(tops[i] ?? Infinity));
  });

  test("the Active row keeps Phase, Branch, Started and its pill", async ({ page }) => {
    await requireProject(page, hasActiveRow, "no project has an active run");
    const row = sectionRows(page, "Building now").first();
    const dts = (await row.locator("dt").allTextContents()).map((t) => t.trim());
    expect(dts).toEqual(["Phase", "Branch", "Started"]);
    await expect(row.getByText(/^(running|failed)$/).first()).toBeVisible();
  });
});
