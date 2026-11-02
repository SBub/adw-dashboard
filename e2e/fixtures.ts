import {
  test as base,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";

// The suite's shared `test` and helpers. Every spec imports from here, never
// from @playwright/test directly, so the /hire guard below is always on.

export { expect };
export type { Locator, Page, Request } from "@playwright/test";

// The callback is named `run`, not `use`: react-hooks/rules-of-hooks flags a
// call to a function named `use` outside a component.
export const test = base.extend<{ hireGuard: void }>({
  hireGuard: [
    async ({ context }, run) => {
      // A second line of defence, not a licence: a valid submit would email
      // hire@issebya.com. Every POST to /hire is aborted, whether the action
      // posts through fetch (hydrated) or as a native form POST, on every page
      // and popup in the context. fallback() lets a spec's own route still run.
      await context.route(
        (url) => url.pathname === "/hire",
        (route) => (route.request().method() === "POST" ? route.abort() : route.fallback()),
      );
      await run();
    },
    { auto: true },
  ],
});

// Waits for the sidebar's connection pill to read `live`. The pill is a
// `status` whose whole text is the state; other `status` elements exist
// (skeletons, the today card's error), so it is found by its text.
export async function waitForLive(page: Page): Promise<void> {
  const pill = page.getByRole("status").filter({ hasText: /^(connecting|live|reconnecting)$/ });
  await expect(pill).toHaveText("live", { timeout: 15_000 });
}

// Opens the first project the /projects sidebar lists and returns its href.
// Never hard-code a slug: the public projects change.
export async function openFirstProject(page: Page): Promise<string> {
  await page.goto("/projects");
  // The pill reads `live` only once the client has hydrated and the sidebar
  // has loaded.
  await waitForLive(page);
  const link = sidebarProjectLinks(page).first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/projects\/[^/]+\/[^/]+$/);
  if (href === null) throw new Error("the first project link has no href");
  await clickToNavigate(link, href);
  return href;
}

// Clicks a link and waits for the address to become `url`. The link is in the
// server HTML, so it is visible before React hydrates; a click then can be
// lost, and under `next dev` the target route may still have to compile. So
// it first waits for the link itself to be hydrated (React sets its
// `__reactProps$<id>` key on every DOM node it hydrates, a deterministic
// client-only signal, unlike any visible state on pages with no pill), then
// clicks and gives the navigation 10 s. If the address has not moved at all,
// it clicks exactly once more; either way it then allows 30 s for a cold
// compile, and a second failure is the normal Playwright error.
export async function clickToNavigate(link: Locator, url: string | RegExp): Promise<void> {
  const page = link.page();
  await expect
    .poll(
      () => link.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps$"))),
      { message: "the link was never hydrated", timeout: 30_000 },
    )
    .toBe(true);
  const before = page.url();
  await link.click();
  try {
    await expect(page).toHaveURL(url, { timeout: 10_000 });
    return;
  } catch {
    // Fall through: retry the click only if the first one went nowhere.
  }
  if (page.url() === before) await link.click();
  await expect(page).toHaveURL(url, { timeout: 30_000 });
}

// The three sections of a project page; /projects has Building now only.
export type SectionTitle = "Building now" | "Up next" | "Shipped";

const SECTION_TITLES: SectionTitle[] = ["Building now", "Up next", "Shipped"];

// A section has no accessible name, so its level-2 heading is the handle. The
// heading is a role locator, which skips hidden subtrees: after a client
// navigation the previous route stays in the DOM inside a hidden Activity
// (cacheComponents), and its sections never match. The (dashboard) layout
// wraps every page in a `section` of its own, which holds every heading, so
// only the innermost match (last in document order) is the section itself.
export function section(page: Page, title: SectionTitle): Locator {
  return page
    .getByRole("main")
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: title, exact: true }) })
    .last();
}

// The visible rows of a section's list: run rows (Active, History) in a `ul`,
// queue rows in an `ol`.
export function sectionRows(page: Page, title: SectionTitle): Locator {
  return section(page, title)
    .locator(title === "Up next" ? "ol > li" : "ul > li")
    .filter({ visible: true });
}

export async function hasActiveRow(page: Page): Promise<boolean> {
  return (await sectionRows(page, "Building now").count()) > 0;
}

export async function hasQueuedItem(page: Page): Promise<boolean> {
  return (await sectionRows(page, "Up next").count()) > 0;
}

export async function hasHistoryRow(page: Page): Promise<boolean> {
  return (await sectionRows(page, "Shipped").count()) > 0;
}

// Every project the /projects sidebar lists, in its order.
async function projectHrefs(page: Page): Promise<string[]> {
  await page.goto("/projects");
  await waitForLive(page);
  const links = page.getByRole("navigation", { name: "Projects" }).getByRole("link");
  await expect(links.first()).toBeVisible();
  const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
  for (const href of hrefs) expect(href).toMatch(/^\/projects\/[^/]+\/[^/]+$/);
  return hrefs;
}

// A full load of a project page, settled: the three headings, the pill `live`
// and no visible skeleton left in the main pane.
async function openProject(page: Page, href: string): Promise<void> {
  await page.goto(href);
  const main = page.getByRole("main");
  for (const title of SECTION_TITLES) {
    await expect(main.getByRole("heading", { level: 2, name: title, exact: true })).toBeVisible();
  }
  await waitForLive(page);
  await waitForSkeletonsGone(page);
}

// Waits until no visible skeleton is left in the main pane. A project page's
// static shell carries the Active island's fallback, which renders its own
// copy of the Building now and Up next headings (info buttons and tooltips
// included); when the island streams in, that copy is removed. Until then a
// locator can resolve to the fallback's node and lose it mid-test.
export async function waitForSkeletonsGone(page: Page): Promise<void> {
  await expect(
    page.getByRole("main").locator('[aria-busy="true"]').filter({ visible: true }),
  ).toHaveCount(0, { timeout: 30_000 });
}

// The one walk over the sidebar's projects: opens each (a `prefer` href first
// when listed) with a full load, so no hidden Activity copy of the previous
// project lingers, and returns the first href `predicate` holds on, leaving
// the page there, or null. The data is live, so no slug is hard-coded.
async function findProjectWith(
  page: Page,
  predicate: (page: Page) => Promise<boolean>,
  options: { prefer?: string } = {},
): Promise<string | null> {
  // Proves the skip path (the negative probe); not a test-data switch.
  if (process.env.E2E_FIND_NONE === "1") return null;
  const hrefs = await projectHrefs(page);
  const { prefer } = options;
  const ordered =
    prefer !== undefined && hrefs.includes(prefer)
      ? [prefer, ...hrefs.filter((href) => href !== prefer)]
      : hrefs;
  for (const href of ordered) {
    // Each project is a page load or two against `next dev`; extend the
    // budget per project so a long sidebar does not time the walk out.
    test.setTimeout(test.info().timeout + 20_000);
    await openProject(page, href);
    if (await predicate(page)) return href;
  }
  return null;
}

// findProjectWith, or the test ends as skipped with `reason` in the report,
// never as a silent pass. Every data-dependent test goes through here.
export async function requireProject(
  page: Page,
  predicate: (page: Page) => Promise<boolean>,
  reason: string,
  options: { prefer?: string } = {},
): Promise<string> {
  const href = await findProjectWith(page, predicate, options);
  test.skip(href === null, reason);
  // test.skip throws on a null href; this only narrows the type.
  if (href === null) throw new Error(reason);
  return href;
}

// The project links in the sidebar's Projects navigation.
export function sidebarProjectLinks(page: Page): Locator {
  return page.getByRole("navigation", { name: "Projects" }).getByRole("link");
}

// The sidebar worker widget's state text. It reads `Checking status...` until
// its first poll lands, so a spec never hard-codes a live state.
export function workerWidget(page: Page): Locator {
  return page.locator("aside").getByText(/^(Ready to build|Offline|Checking status\.\.\.)$/);
}

// Waits for the worker widget to leave `Checking status...` for a live state,
// either one: whether the worker runs depends on the operator's machine.
export async function waitForWorkerState(page: Page): Promise<void> {
  await expect(workerWidget(page)).toHaveText(/^(Ready to build|Offline)$/, { timeout: 30_000 });
}

// Loads `path` and expects the root not-found page at that address, with no
// redirect.
export async function expectNotFound(page: Page, path: string): Promise<void> {
  await page.goto(path);
  const url = new URL(page.url());
  expect(url.pathname + url.search).toBe(path);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByText("There is nothing at this address.")).toBeVisible();
}

// Expects the elements in document order, each one's top below the previous
// one's (strictly, or at least level with it where a row can wrap).
export async function expectInDocumentOrder(
  locators: Locator[],
  { strictTop }: { strictTop: boolean },
): Promise<void> {
  const [first] = locators;
  if (!first) throw new Error("no locators to order");
  const handles = await Promise.all(
    locators.map(async (locator) => {
      await expect(locator).toBeAttached();
      return locator.elementHandle();
    }),
  );
  const steps = await first.page().evaluate((elements) => {
    const present = elements.filter((el) => el !== null);
    return present.slice(1).map((el, i) => {
      const previous = present[i];
      if (!previous) throw new Error("no previous element");
      return {
        follows: (previous.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        top: el.getBoundingClientRect().top,
        previousTop: previous.getBoundingClientRect().top,
      };
    });
  }, handles);
  expect(steps).toHaveLength(locators.length - 1);
  for (const step of steps) {
    expect(step.follows).toBe(true);
    if (strictTop) expect(step.top).toBeGreaterThan(step.previousTop);
    else expect(step.top).toBeGreaterThanOrEqual(step.previousTop);
  }
}

// Expects the page not to scroll sideways.
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

// The HTML the app serves for `path`, before any client code runs. The
// request fixture uses baseURL, so this reads the app only.
export async function servedHtml(request: APIRequestContext, path: string): Promise<string> {
  const response = await request.get(path);
  expect(response.ok()).toBe(true);
  return response.text();
}

// The two colour schemes the chrome specs emulate.
export const SCHEMES = ["light", "dark"] as const;

// Scrolls the window to the end of the page once its height has settled.
export async function scrollToBottom(page: Page): Promise<void> {
  // Content that loads after the first scroll (the /projects/log feed) grows
  // the page, so scroll again until the height holds for 20 frames (~300ms),
  // giving up after 5s so a page that never settles fails on its assertion.
  await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const deadline = performance.now() + 5000;
    let height = -1;
    let steady = 0;
    while (steady < 20 && performance.now() < deadline) {
      const next = document.documentElement.scrollHeight;
      window.scrollTo(0, next);
      await frame();
      steady = next === height ? steady + 1 : 0;
      height = next;
    }
  });
}

// Nothing scrolls sideways. Measured against the root's client width, not
// innerWidth, so the Linux scrollbar gutter cannot make it flaky.
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "the page scrolls horizontally").toBeLessThanOrEqual(clientWidth);
}

// Where the Work with me link sits. Measured from the root box, not the window:
// `scrollbar-gutter: stable` keeps a 15px gutter on Linux Chromium (none on
// macOS), and the fixed link sits 16px inside it on both.
export function floatingHirePlacement(link: Locator): Promise<{
  position: string;
  right: number;
  bottom: number;
  top: number;
  height: number;
}> {
  return link.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const root = document.documentElement.getBoundingClientRect();
    return {
      position: getComputedStyle(el).position,
      right: root.width - rect.right,
      bottom: document.documentElement.clientHeight - rect.bottom,
      top: rect.top,
      height: rect.height,
    };
  });
}
