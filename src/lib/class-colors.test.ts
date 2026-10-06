import { describe, expect, it } from "vitest";
import { CLASS_COLORS, MODEL_COLORS, modelColor, UNATTRIBUTED_COLOR } from "./class-colors";

// Pinned literally, so a class hue change is a deliberate edit of this test.
const BADGES = {
  "/feature": "border-violet-300 text-violet-800 dark:border-violet-700 dark:text-violet-300",
  "/bug": "border-fuchsia-300 text-fuchsia-800 dark:border-fuchsia-700 dark:text-fuchsia-300",
  "/chore": "border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-300",
  "/patch": "border-lime-300 text-lime-800 dark:border-lime-700 dark:text-lime-300",
  other: "border-neutral-300 text-neutral-600 dark:border-neutral-600 dark:text-neutral-400",
} as const;

const STATUS_HUE = /\b(?:emerald|amber|sky|rose|red)\b/;

describe("CLASS_COLORS", () => {
  it("lists the classes in chart order", () => {
    expect(Object.keys(CLASS_COLORS)).toEqual(["/feature", "/bug", "/chore", "/patch", "other"]);
  });

  it.each(Object.entries(BADGES))("keeps the %s badge classes", (key, badge) => {
    expect(CLASS_COLORS[key as keyof typeof BADGES].badge).toBe(badge);
  });

  it("gives every class a CSS variable fill", () => {
    for (const { fill } of Object.values(CLASS_COLORS)) {
      expect(fill).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });
});

describe("model colours", () => {
  it("are CSS variable fills", () => {
    for (const fill of [...MODEL_COLORS, UNATTRIBUTED_COLOR]) {
      expect(fill).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });

  it("cycle through the palette", () => {
    expect(modelColor(0)).toBe(MODEL_COLORS[0]);
    expect(modelColor(1)).toBe(MODEL_COLORS[1]);
    expect(modelColor(MODEL_COLORS.length)).toBe(modelColor(0));
  });
});

describe("class and model hues", () => {
  it("never use a status hue", () => {
    const values = [
      ...Object.values(CLASS_COLORS).flatMap((c) => [c.badge, c.swatch, c.fill]),
      ...MODEL_COLORS,
      UNATTRIBUTED_COLOR,
    ];
    for (const value of values) expect(value).not.toMatch(STATUS_HUE);
  });
});
