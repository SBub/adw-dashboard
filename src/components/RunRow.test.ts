import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Run } from "@/types/adw";
import { RunRow } from "./RunRow";

const SLUG = "SBub/adw-dashboard";
const BRANCH = "chore/issue-141-adw-ab53aaef-sticky-header-scroll-content";

const completed: Run = {
  project_id: "p1",
  adw_id: "ab53aaef",
  issue_number: 141,
  issue_title: "Sticky header, scroll the content",
  issue_class: "chore",
  branch_name: BRANCH,
  phase: "adw_document_iso",
  status: "completed",
  state: {},
  toolkit_version: null,
  started_at: "2026-10-01T14:02:11Z",
  updated_at: "2026-10-01T14:49:37Z",
  finished_at: "2026-10-01T14:49:37Z",
};

function render(run: Run, variant: "active" | "history") {
  return renderToStaticMarkup(createElement(RunRow, { run, projectSlug: SLUG, variant }));
}

// The opening tag of the dd that follows the dt with this label.
function ddAfter(html: string, label: string) {
  const dt = html.indexOf(`>${label}</dt>`);
  expect(dt).toBeGreaterThan(-1);
  const start = html.indexOf("<dd", dt);
  return html.slice(start, html.indexOf(">", start) + 1);
}

describe("RunRow, history", () => {
  const html = render(completed, "history");

  it("shows Branch, Finished and Duration in that order and nothing else", () => {
    const branch = html.indexOf(">Branch</dt>");
    const finished = html.indexOf(">Finished</dt>");
    const duration = html.indexOf(">Duration</dt>");
    expect(branch).toBeGreaterThan(-1);
    expect(finished).toBeGreaterThan(branch);
    expect(duration).toBeGreaterThan(finished);
    expect(html).not.toContain("Final phase");
    expect(html).not.toContain(">Started<");
    expect(html).not.toContain(">Phase<");
  });

  it("has no status pill", () => {
    expect(html).not.toContain(">completed<");
  });

  it("shows the full branch in a select-all code inside a wrapping dd", () => {
    expect(html).toMatch(new RegExp(`<code class="[^"]*select-all[^"]*">${BRANCH}</code>`));
    const dd = ddAfter(html, "Branch");
    expect(dd).toContain("break-all");
    expect(dd).not.toContain("truncate");
    expect(dd).not.toContain("title=");
  });

  it("links the branch's tree on GitHub beside the name", () => {
    expect(html).toContain(`href="https://github.com/${SLUG}/tree/${BRANCH}"`);
    const tree = html.indexOf("/tree/");
    const link = html.slice(html.lastIndexOf("<a", tree), html.indexOf(">", tree) + 1);
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noreferrer"');
    expect(link).toContain(`aria-label="Open branch ${BRANCH} on GitHub"`);
  });

  it("spans the branch over two columns of a four-column grid", () => {
    expect(html).toMatch(/<dl class="[^"]*sm:grid-cols-4[^"]*">/);
    expect(html).toMatch(/<div class="[^"]*sm:col-span-2[^"]*"><dt[^>]*>Branch<\/dt>/);
  });

  it("shows none and no link without a branch", () => {
    const none = render({ ...completed, branch_name: null }, "history");
    expect(none).toContain(">none</span>");
    expect(none).not.toContain("/tree/");
  });
});

describe("RunRow, active", () => {
  const html = render({ ...completed, status: "running", finished_at: null }, "active");

  it("keeps Phase, Branch and Started with the status pill", () => {
    expect(html).toContain(">Phase</dt>");
    expect(html).toContain(">Branch</dt>");
    expect(html).toContain(">Started</dt>");
    expect(html).toContain("running</span>");
  });

  it("keeps the truncating branch and the two-then-four-column grid", () => {
    expect(ddAfter(html, "Branch")).toContain("truncate");
    expect(html).not.toContain("/tree/");
    expect(html).toContain("sm:grid-cols-2 lg:grid-cols-4");
  });
});
