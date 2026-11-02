import {
  clickToNavigate,
  expect,
  expectInDocumentOrder,
  expectNoHorizontalScroll,
  expectNotFound,
  sidebarProjectLinks,
  test,
  waitForWorkerState,
  workerWidget,
  type Locator,
  type Page,
} from "./fixtures";

// The daily log lives at /projects/log inside the dashboard: the sidebar lists
// the projects, then Daily log, then the worker widget; Daily log is the only
// sidebar entry current on /projects/log while the header's Watch me build
// stays current; the old /watch and /summary addresses are not found.

function dailyLog(page: Page): Locator {
  return page.locator("aside").getByRole("link", { name: "Daily log", exact: true });
}

function watchMeBuild(page: Page): Locator {
  return page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name: "Watch me build" });
}

test.describe("daily log sidebar", () => {
  test("Watch me build lands on /projects", async ({ page }) => {
    await page.goto("/");
    await watchMeBuild(page).click();
    await expect(page).toHaveURL("/projects");
    await expect(page.getByRole("heading", { level: 2, name: "Building now" })).toBeVisible();
  });

  test("the sidebar lists the projects, then Daily log, then the worker widget", async ({
    page,
  }) => {
    await page.goto("/projects");
    const links = sidebarProjectLinks(page);
    await expect(links.first()).toBeVisible();
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute("href", /^\/projects\/[^/]+\/[^/]+$/);
    }
    await expect(dailyLog(page)).toHaveAttribute("href", "/projects/log");
    // The widget swaps its element when it leaves `Checking status...`, which
    // would detach a handle taken before; wait for the live state first.
    await waitForWorkerState(page);
    await expectInDocumentOrder([links.last(), dailyLog(page), workerWidget(page)], {
      strictTop: true,
    });
    await expect(dailyLog(page)).not.toHaveAttribute("aria-current");
  });

  test("Daily log opens the summary and is the only current sidebar entry", async ({ page }) => {
    await page.goto("/projects");
    await dailyLog(page).click();
    await expect(page).toHaveURL("/projects/log");
    await expect(page.getByRole("heading", { level: 1, name: "Daily log" })).toBeVisible();

    const today = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { level: 2, name: /^Today,/ }) });
    await expect(today).toBeVisible();
    // A past day card, or the empty window line: the live data decides which.
    const past = page
      .getByRole("article")
      .filter({ hasNot: page.getByRole("heading", { level: 2, name: /^Today,/ }) });
    await expect(
      past.first().or(page.getByText("No finished runs in the previous 30 days.")),
    ).toBeVisible();

    await expect(dailyLog(page)).toHaveAttribute("aria-current", "page");
    for (const link of await sidebarProjectLinks(page).all()) {
      await expect(link).not.toHaveAttribute("aria-current");
    }
    await expect(watchMeBuild(page)).toHaveAttribute("aria-current", "page");
  });

  test("a project page does not mark Daily log", async ({ page }) => {
    await page.goto("/projects/log");
    const first = sidebarProjectLinks(page).first();
    await expect(first).toBeVisible();
    const href = await first.getAttribute("href");
    if (href === null) throw new Error("the first project link has no href");
    // The link is in the server HTML, so it is visible before hydration.
    await clickToNavigate(first, href);
    await expect(dailyLog(page)).not.toHaveAttribute("aria-current");
  });

  for (const path of ["/watch", "/summary"]) {
    test(`${path} renders not-found with no redirect`, async ({ page }) => {
      await expectNotFound(page, path);
    });
  }

  test("at 375px the sidebar keeps its order with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/projects/log");
    const links = sidebarProjectLinks(page);
    await expect(links.first()).toBeVisible();
    // The widget swaps its element when it leaves `Checking status...`, which
    // would detach a handle taken before; wait for the live state first.
    await waitForWorkerState(page);
    await expectInDocumentOrder([links.last(), dailyLog(page), workerWidget(page)], {
      strictTop: false,
    });
    await expectNoHorizontalScroll(page);
  });
});
