import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HISTORY_PAGE_SIZE } from "@/lib/history-bookmark";
import {
  ActiveRunsOverviewSkeleton,
  ActiveRunsViewSkeleton,
  HistoryLinksSkeleton,
  ProjectNavSkeleton,
  ProjectPageSkeleton,
  QueueViewSkeleton,
  RunListSkeleton,
} from "./LoadingSkeletons";

function render(element: ReactElement) {
  return renderToStaticMarkup(element);
}

function count(markup: string, needle: string) {
  return markup.split(needle).length - 1;
}

const heading = (text: string) => createElement("h2", null, text);

describe("ProjectNavSkeleton", () => {
  const html = render(createElement(ProjectNavSkeleton));

  it("is one busy status container labelled for the projects", () => {
    expect(count(html, 'aria-busy="true"')).toBe(1);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading projects"');
  });

  it("holds three project cards", () => {
    expect(count(html, "<li")).toBe(3);
  });
});

describe("RunListSkeleton", () => {
  it("renders a page of history rows with three fields each", () => {
    const html = render(
      createElement(RunListSkeleton, { variant: "history", rows: HISTORY_PAGE_SIZE }),
    );
    expect(count(html, "<li")).toBe(HISTORY_PAGE_SIZE);
    expect(count(html, 'data-skeleton="field"')).toBe(HISTORY_PAGE_SIZE * 3);
    expect(html).toContain('aria-label="Loading history"');
    expect(count(html, 'aria-busy="true"')).toBe(1);
  });

  it("renders active rows with three fields each", () => {
    const html = render(createElement(RunListSkeleton, { variant: "active", rows: 2 }));
    expect(count(html, "<li")).toBe(2);
    expect(count(html, 'data-skeleton="field"')).toBe(6);
    expect(html).toContain('aria-label="Loading runs"');
  });

  it("gives active rows a round pill and history rows none", () => {
    const history = render(createElement(RunListSkeleton, { variant: "history", rows: 3 }));
    const active = render(createElement(RunListSkeleton, { variant: "active", rows: 2 }));
    expect(count(history, "rounded-full")).toBe(0);
    expect(count(active, "rounded-full")).toBe(2);
  });
});

describe("QueueViewSkeleton", () => {
  const html = render(createElement(QueueViewSkeleton, { heading: heading("Queue heading") }));

  it("renders the heading slot above one rail of two rows", () => {
    expect(html.indexOf("Queue heading")).toBeGreaterThan(-1);
    expect(html.indexOf("Queue heading")).toBeLessThan(html.indexOf("<ol"));
    expect(count(html, "<ol")).toBe(1);
    expect(count(html, "<li")).toBe(2);
    expect(html).toContain('aria-label="Loading queue"');
  });
});

describe("ActiveRunsViewSkeleton", () => {
  const html = render(
    createElement(ActiveRunsViewSkeleton, {
      heading: heading("Active heading"),
      queue: createElement("p", null, "Queue slot"),
    }),
  );

  it("renders the heading, two run rows, then the queue slot", () => {
    const list = html.indexOf("<ul");
    expect(html.indexOf("Active heading")).toBeGreaterThan(-1);
    expect(html.indexOf("Active heading")).toBeLessThan(list);
    expect(count(html, "<li")).toBe(2);
    expect(html.indexOf("Queue slot")).toBeGreaterThan(html.lastIndexOf("</ul>"));
    expect(html).toContain('aria-label="Loading runs"');
  });
});

describe("ActiveRunsOverviewSkeleton", () => {
  const html = render(createElement(ActiveRunsOverviewSkeleton));

  it("is one busy container with two run rows", () => {
    expect(count(html, 'aria-busy="true"')).toBe(1);
    expect(html).toContain('aria-label="Loading active runs"');
    expect(count(html, "<li")).toBe(2);
  });
});

describe("HistoryLinksSkeleton", () => {
  const html = render(createElement(HistoryLinksSkeleton));

  it("is a busy container labelled for the pages", () => {
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading pages"');
  });
});

describe("ProjectPageSkeleton", () => {
  const html = render(createElement(ProjectPageSkeleton));

  it("is labelled for the project and holds every section's rows", () => {
    expect(html.indexOf('aria-label="Loading project"')).toBeLessThan(html.indexOf("<li"));
    expect(count(html, "<li")).toBe(2 + 2 + HISTORY_PAGE_SIZE);
    expect(count(html, 'data-skeleton="field"')).toBe(2 * 3 + HISTORY_PAGE_SIZE * 3);
  });
});

describe("every skeleton", () => {
  const all: [string, string][] = [
    ["ProjectNavSkeleton", render(createElement(ProjectNavSkeleton))],
    ["RunListSkeleton", render(createElement(RunListSkeleton, { variant: "history", rows: 2 }))],
    ["QueueViewSkeleton", render(createElement(QueueViewSkeleton, { heading: null }))],
    [
      "ActiveRunsViewSkeleton",
      render(createElement(ActiveRunsViewSkeleton, { heading: null, queue: null })),
    ],
    ["ActiveRunsOverviewSkeleton", render(createElement(ActiveRunsOverviewSkeleton))],
    ["HistoryLinksSkeleton", render(createElement(HistoryLinksSkeleton))],
    ["ProjectPageSkeleton", render(createElement(ProjectPageSkeleton))],
  ];

  it.each(all)("%s hides every animated block from assistive tech", (_, html) => {
    const tags = html.match(/<[a-z]+ [^>]*motion-safe:animate-pulse[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toContain('aria-hidden="true"');
  });

  it.each(all)("%s pulses only when motion is allowed", (_, html) => {
    expect(html).not.toMatch(/(?<!motion-safe:)animate-pulse/);
  });
});
