import { describe, expect, it } from "vitest";
import { STATUS_COLORS } from "./status-colors";

const HUES = { queued: "amber", running: "emerald", completed: "sky", failed: "rose" } as const;

describe("STATUS_COLORS", () => {
  it("lists the states in sidebar order, then neutral", () => {
    expect(Object.keys(STATUS_COLORS)).toEqual([
      "queued",
      "running",
      "completed",
      "failed",
      "neutral",
    ]);
  });

  it.each(Object.entries(HUES))(
    "gives %s the %s hue in 700/100 light and 400/950 dark",
    (state, hue) => {
      const colors = STATUS_COLORS[state as keyof typeof HUES];
      expect(colors.text).toBe(`text-${hue}-700 dark:text-${hue}-400`);
      expect(colors.badge).toBe(
        `bg-${hue}-100 text-${hue}-700 dark:bg-${hue}-950 dark:text-${hue}-400`,
      );
      expect(colors.border).toBe(`border-${hue}-300 dark:border-${hue}-700`);
      expect(colors.dot).toBe(`bg-${hue}-500`);
    },
  );

  it("keeps the neutral entry on neutral hues only", () => {
    for (const value of Object.values(STATUS_COLORS.neutral)) {
      for (const cls of value.split(" ")) {
        expect(cls).toMatch(/(?:^|-)neutral-\d{2,3}$/);
      }
    }
  });
});

// The connection pill describes the socket, not a run state, so it keeps its
// own colours. It is the one file allowed a status hue outside the map.
const EXEMPT = new Set([
  "/src/lib/status-colors.ts",
  "/src/lib/status-colors.test.ts",
  "/src/components/ConnectionIndicator.tsx",
]);

// Every source file under src/, read as text when Vite transforms this test.
// Next's global typing of import.meta.glob returns unknown, hence the guard.
const SOURCES = Object.entries(
  import.meta.glob("/src/**/*.{ts,tsx,css}", { query: "?raw", import: "default", eager: true }),
).filter((entry): entry is [string, string] => typeof entry[1] === "string");

const STATUS_HUE = /\b(?:emerald|amber|sky|rose|red)-\d{2,3}\b/g;

describe("status hue guard", () => {
  it("reads the source tree as text", () => {
    expect(SOURCES.map(([path]) => path)).toContain("/src/components/StatusBadge.tsx");
  });

  it("finds no status hue class outside the map and the connection pill", () => {
    const found: string[] = [];
    for (const [path, source] of SOURCES) {
      if (EXEMPT.has(path)) continue;
      for (const match of source.match(STATUS_HUE) ?? []) found.push(`${path}: ${match}`);
    }
    expect(found).toEqual([]);
  });
});
