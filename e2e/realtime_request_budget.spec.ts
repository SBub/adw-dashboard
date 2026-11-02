import {
  expect,
  sidebarProjectLinks,
  test,
  waitForHydrated,
  waitForLive,
  type Page,
} from "./fixtures";

// The request budget per page load (issue #240): the Realtime channel opens
// only after 2 s visible, reconnects back off instead of looping every few
// seconds, the catch-up reads are coalesced, and the worker poll on
// visibilitychange is throttled. The numbers are ceilings with headroom over
// the steady case, not exact counts.
//
// This spec measures over time by design, so it waits fixed observation
// windows with page.waitForTimeout rather than for a condition.

const REST_TABLES = ["project_summaries", "runs", "workers", "queue_items"] as const;
type RestTable = (typeof REST_TABLES)[number];

interface Counts {
  sockets: number;
  rest: Record<RestTable, number>;
}

// Counts Realtime sockets and the REST reads per table from the moment it is
// attached; attach it before page.goto.
function countRequests(page: Page): Counts {
  const counts: Counts = {
    sockets: 0,
    rest: { project_summaries: 0, runs: 0, workers: 0, queue_items: 0 },
  };
  page.on("websocket", (ws) => {
    if (ws.url().includes("/realtime/")) counts.sockets += 1;
  });
  page.on("request", (req) => {
    const { pathname } = new URL(req.url());
    if (!pathname.startsWith("/rest/v1/")) return;
    const table = pathname.slice("/rest/v1/".length);
    if ((REST_TABLES as readonly string[]).includes(table)) counts.rest[table as RestTable] += 1;
  });
  return counts;
}

function pill(page: Page) {
  return page.getByRole("status").filter({ hasText: /^(connecting|live|reconnecting)$/ });
}

test("one socket and a few reads in a steady minute", async ({ page }) => {
  test.setTimeout(120_000);
  const counts = countRequests(page);
  await page.goto("/projects");
  await waitForLive(page);
  await page.waitForTimeout(60_000);

  expect(counts.sockets).toBe(1);
  expect(counts.rest.project_summaries).toBeLessThanOrEqual(2);
  expect(counts.rest.runs).toBeLessThanOrEqual(2);
  // The mount poll, the 30 s and 60 s ticks, plus one: under `next dev`,
  // strict mode subscribes twice and the second mount polls again.
  expect(counts.rest.workers).toBeLessThanOrEqual(4);
  await expect(pill(page)).toHaveText("live");
});

test("a socket that drops every 3 s backs off", async ({ page }) => {
  test.setTimeout(120_000);
  const counts = countRequests(page);
  // A routed socket is counted here: the page's own websocket event is not
  // the measure for it. Messages flow both ways by default once
  // connectToServer is called.
  let routedSockets = 0;
  await page.routeWebSocket(/\/realtime\//, (ws) => {
    routedSockets += 1;
    ws.connectToServer();
    setTimeout(() => void ws.close(), 3_000);
  });
  await page.goto("/projects");
  await page.waitForTimeout(60_000);

  expect(Math.max(routedSockets, counts.sockets)).toBeLessThanOrEqual(6);
  expect(counts.rest.project_summaries).toBeLessThanOrEqual(6);
});

test("visibility flips poll the worker table a few times only", async ({ page }) => {
  test.setTimeout(90_000);
  const counts = countRequests(page);
  await page.goto("/projects");
  // Headless Chromium reports `visible`, so each synthetic event looks like
  // the tab coming back.
  for (let i = 0; i < 60; i += 1) {
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(500);
  }

  // The first poll, one gated poll per 10 s, and the 30 s interval, which
  // polls whatever the gate says and can land just after a gated one: at most
  // five in about 31 s. Unthrottled, every event polled (about 60).
  expect(counts.rest.workers).toBeLessThanOrEqual(5);
});

test("twenty one-second visits open almost no sockets", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/projects");
  const links = sidebarProjectLinks(page);
  await expect(links.first()).toBeVisible();
  const hrefs = (await links.evaluateAll((els) => els.map((el) => el.getAttribute("href"))))
    .filter((href): href is string => href !== null)
    .slice(0, 20);
  const pool = hrefs.length >= 20 ? hrefs : [...hrefs, "/projects", "/projects/log"];

  const counts = countRequests(page);
  // Each visit is one second from hydration (when the 2 s gate starts), and
  // about:blank ends it at once. Waiting for `load` instead, or letting the
  // next goto end it, stretches a visit under a busy `next dev`: islands
  // stream long after hydration, and the old page stays up until the next
  // route answers, so the gate could pass and a socket open.
  for (let i = 0; i < 20; i += 1) {
    await page.goto(pool[i % pool.length] ?? "/projects", { waitUntil: "commit" });
    await waitForHydrated(
      page.getByRole("navigation", { name: "Sections" }).getByRole("link").first(),
    );
    await page.waitForTimeout(1_000);
    await page.goto("about:blank");
  }

  expect(counts.sockets).toBeLessThanOrEqual(2);
});

test("the channel still goes live and catches up once", async ({ page }) => {
  test.setTimeout(75_000);
  const counts = countRequests(page);
  let summariesAfterSocket = 0;
  page.on("request", (req) => {
    if (counts.sockets > 0 && new URL(req.url()).pathname === "/rest/v1/project_summaries") {
      summariesAfterSocket += 1;
    }
  });
  await page.goto("/projects");
  await waitForLive(page);

  expect(counts.sockets).toBe(1);
  await expect.poll(() => summariesAfterSocket, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
});
