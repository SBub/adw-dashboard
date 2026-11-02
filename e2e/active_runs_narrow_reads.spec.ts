import { expect, section, test, waitForLive, type Page } from "./fixtures";

// The Active runs reads are narrow (issue #243): no state jsonb in the select
// or the rows, and after the first (full, windowed) catch-up every later
// catch-up reads only the runs changed since its cursor, merging them, so a
// run that completed while the socket was down leaves Building now.
//
// The hosted database is never written (see the Protected rules), so the
// changed rows are made by routing the browser's own /rest/v1/runs reads: the
// full read gets one synthetic running run appended, and the incremental read
// gets it back completed once a test asks for that.
//
// The coalesced runner (createCoalescedRunner in src/lib/request-pacing.ts)
// skips a catch-up requested less than 10 s after the previous one finished,
// so each test waits that window out with page.waitForTimeout by design,
// like realtime_request_budget.spec.ts.

const SYNTHETIC_ADW_ID = "e2e243aa";
const SYNTHETIC_TITLE = "E2E 243 synthetic run";

interface RunsResponse {
  url: string;
  incremental: boolean;
  rows: Record<string, unknown>[];
  bytes: number;
}

interface Harness {
  responses: RunsResponse[];
  completeSynthetic: boolean;
  closeSocket(): Promise<void>;
}

function latest(rows: { updated_at?: unknown }[], fallback: string): string {
  let best = fallback;
  for (const row of rows) {
    if (typeof row.updated_at === "string" && Date.parse(row.updated_at) > Date.parse(best)) {
      best = row.updated_at;
    }
  }
  return best;
}

function syntheticRun(projectId: string, status: "running" | "completed", updatedAt: string) {
  return {
    project_id: projectId,
    adw_id: SYNTHETIC_ADW_ID,
    issue_number: 243,
    issue_title: SYNTHETIC_TITLE,
    issue_class: "/chore",
    branch_name: "chore/e2e-243",
    pr_number: null,
    phase: status === "running" ? "adw_build_iso" : "adw_document_iso",
    status,
    toolkit_version: null,
    started_at: updatedAt,
    updated_at: updatedAt,
    finished_at: status === "completed" ? updatedAt : null,
  };
}

// Attach before page.goto: records every browser runs response, routes the
// runs reads and keeps the latest Realtime socket so a test can drop it.
async function attach(page: Page): Promise<Harness> {
  let projectId: string | null = null;
  let syntheticAt: string | null = null;
  let socket: { close(): Promise<void> } | null = null;
  const harness: Harness = {
    responses: [],
    completeSynthetic: false,
    async closeSocket() {
      await socket?.close();
    },
  };

  await page.route("**/rest/v1/project_summaries?*", async (route) => {
    const response = await route.fetch();
    const rows = (await response.json()) as { id: string }[];
    projectId ??= rows[0]?.id ?? null;
    await route.fulfill({ response, json: rows });
  });

  await page.route("**/rest/v1/runs?*", async (route) => {
    const url = route.request().url();
    const response = await route.fetch();
    const rows = (await response.json()) as Record<string, unknown>[];
    if (projectId === null) {
      await route.fulfill({ response, json: rows });
      return;
    }
    if (!url.includes("updated_at=gte.")) {
      // The newest real updated_at, or the server's own Date when there is no
      // row: always a server time, like the cursor it becomes.
      syntheticAt =
        rows.length > 0
          ? latest(rows, "1970-01-01T00:00:00Z")
          : new Date(response.headers()["date"] ?? 0).toISOString();
      await route.fulfill({
        response,
        json: [syntheticRun(projectId, "running", syntheticAt), ...rows],
      });
      return;
    }
    if (harness.completeSynthetic && syntheticAt !== null) {
      const completedAt = new Date(Date.parse(syntheticAt) + 1_000).toISOString();
      await route.fulfill({
        response,
        json: [syntheticRun(projectId, "completed", completedAt), ...rows],
      });
      return;
    }
    await route.fulfill({ response, json: rows });
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (!new URL(url).pathname.endsWith("/rest/v1/runs")) return;
    if (res.request().method() !== "GET") return;
    const body = await res.body();
    harness.responses.push({
      url,
      incremental: url.includes("updated_at=gte."),
      rows: JSON.parse(body.toString()) as Record<string, unknown>[],
      bytes: body.length,
    });
  });

  await page.routeWebSocket(/\/realtime\//, (ws) => {
    ws.connectToServer();
    socket = ws;
  });

  return harness;
}

function selectOf(url: string): string {
  return new URL(url).searchParams.get("select") ?? "";
}

function full(harness: Harness): RunsResponse | undefined {
  return harness.responses.find((res) => !res.incremental);
}

function incremental(harness: Harness): RunsResponse | undefined {
  return harness.responses.find((res) => res.incremental);
}

// Opens /projects, waits for the first browser catch-up's full read and the
// synthetic run it carries, then waits out the runner's 10 s skip window.
async function openWithSynthetic(page: Page, harness: Harness): Promise<RunsResponse> {
  await page.goto("/projects");
  await waitForLive(page);
  await expect.poll(() => full(harness), { timeout: 15_000 }).toBeDefined();
  await expect(section(page, "Building now").getByText(SYNTHETIC_TITLE)).toBeVisible();
  await page.waitForTimeout(11_000);
  return full(harness)!;
}

async function reconnect(page: Page, harness: Harness): Promise<RunsResponse> {
  await harness.closeSocket();
  await expect.poll(() => incremental(harness), { timeout: 45_000 }).toBeDefined();
  await waitForLive(page);
  return incremental(harness)!;
}

test("the catch-up after a reconnect reads only changed rows, narrow", async ({ page }) => {
  test.setTimeout(90_000);
  const harness = await attach(page);
  const first = await openWithSynthetic(page, harness);

  expect(first.url).not.toContain("updated_at=gte.");
  expect(selectOf(first.url)).not.toContain("state");
  for (const row of first.rows) expect(row).not.toHaveProperty("state");
  // Measured: about 500 bytes a row narrow, about 1000 with state.
  if (first.rows.length > 0) expect(first.bytes / first.rows.length).toBeLessThanOrEqual(800);

  const second = await reconnect(page, harness);
  const params = new URL(second.url).searchParams;
  expect(params.has("or")).toBe(false);
  expect(selectOf(second.url)).not.toContain("state");
  for (const row of second.rows) expect(row).not.toHaveProperty("state");
  // Not compared with the full read's bytes: the incremental read carries
  // every run of any status changed in the last minute, which on live data
  // can outnumber the active runs. So each property is checked directly: only
  // rows changed since the bound were read, and they are as narrow per row.
  const bound = params.get("updated_at");
  expect(bound).toMatch(/^gte\./);
  const since = Date.parse((bound ?? "").slice("gte.".length));
  expect(Number.isNaN(since)).toBe(false);
  for (const row of second.rows) {
    expect(typeof row.updated_at).toBe("string");
    expect(Date.parse(row.updated_at as string)).toBeGreaterThanOrEqual(since);
  }
  if (second.rows.length > 0) expect(second.bytes / second.rows.length).toBeLessThanOrEqual(800);
});

test("a run that completes while the socket is closed is gone after the reconnect", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const harness = await attach(page);
  await openWithSynthetic(page, harness);

  harness.completeSynthetic = true;
  await reconnect(page, harness);
  await expect(section(page, "Building now").getByText(SYNTHETIC_TITLE)).toHaveCount(0);
});
