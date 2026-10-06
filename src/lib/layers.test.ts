import { describe, expect, it } from "vitest";
import { TOOLTIP_LAYER } from "./layers";

// The layer's own module and this test name the class; every other file is scanned.
const EXEMPT = new Set(["/src/lib/layers.ts", "/src/lib/layers.test.ts"]);

// Every source file under src/, read as text when Vite transforms this test.
// Next's global typing of import.meta.glob returns unknown, hence the guard.
const SOURCES = Object.entries(
  import.meta.glob("/src/**/*.{ts,tsx,css}", { query: "?raw", import: "default", eager: true }),
).filter((entry): entry is [string, string] => typeof entry[1] === "string");

// `z-10`, `-z-10`, `z-[60]`, `md:z-20`; not `size-5` or `max-z-1`.
const Z_INDEX = /(?<![\w-])-?z-(?:(\d+)\b|\[(-?\d+)\])/g;

function zIndexes(source: string): { cls: string; value: number }[] {
  return [...source.matchAll(Z_INDEX)].map((m) => ({
    cls: m[0],
    value: Number(m[1] ?? m[2]) * (m[0].startsWith("-") ? -1 : 1),
  }));
}

const tooltipValue = Number(TOOLTIP_LAYER.slice("z-".length));

describe("TOOLTIP_LAYER", () => {
  it("is a numeric z-index class", () => {
    expect(TOOLTIP_LAYER).toMatch(/^z-\d+$/);
  });

  it("is the tooltip's layer in SectionHeading", () => {
    const source = SOURCES.find(([path]) => path === "/src/components/SectionHeading.tsx")?.[1];
    expect(source).toContain("TOOLTIP_LAYER");
    expect(zIndexes(source ?? "")).toEqual([]);
  });
});

describe("z-index guard", () => {
  it("reads the queue rail markers", () => {
    const source = SOURCES.find(([path]) => path === "/src/components/QueueRow.tsx")?.[1];
    expect(zIndexes(source ?? "").map(({ cls }) => cls)).toContain("z-10");
  });

  it("finds no z-index at or above the tooltip's layer", () => {
    const found: string[] = [];
    for (const [path, source] of SOURCES) {
      if (EXEMPT.has(path)) continue;
      for (const { cls, value } of zIndexes(source)) {
        if (value >= tooltipValue) found.push(`${path}: ${cls}`);
      }
    }
    expect(found).toEqual([]);
  });
});
