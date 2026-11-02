import type { FullConfig } from "@playwright/test";

// Pays the `next dev` compile of every route the suite loads once, before any
// test, so no test spends its 30 s budget on a cold compile. Runs after the
// webServer is up, so it works with the adopted /prepare_app server. Plain
// GETs against the app only: nothing posts and nothing writes to the database.
// CI runs `next start` on a fresh build, where there is nothing to compile.

const ROUTES = ["/", "/projects", "/projects/log", "/writing", "/hire", "/projects/changelog"];

// The first link in `html` whose href matches `pattern`, or null.
function firstLink(html: string, pattern: RegExp): string | null {
  return pattern.exec(html)?.[1] ?? null;
}

// GETs `path`, reading the body to the end so every streamed island renders.
// A non-200 or a network error is ignored: the spec that loads it reports it.
async function warm(baseURL: string, path: string): Promise<string> {
  try {
    const response = await fetch(new URL(path, baseURL));
    return await response.text();
  } catch {
    return "";
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.CI) return;
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;

  const pages = new Map<string, string>();
  for (const route of ROUTES) pages.set(route, await warm(baseURL, route));

  const children = [
    firstLink(
      pages.get("/projects") ?? "",
      /href="(\/projects\/(?!log"|changelog")[^/"]+\/[^/"]+)"/,
    ),
    firstLink(pages.get("/writing") ?? "", /href="(\/writing\/[^/"]+)"/),
    firstLink(pages.get("/projects/changelog") ?? "", /href="(\/projects\/changelog\/[^/"]+)"/),
  ];
  for (const child of children) if (child !== null) await warm(baseURL, child);
}
