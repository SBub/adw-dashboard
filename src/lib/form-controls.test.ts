import { describe, expect, it } from "vitest";
import { FORM_BUTTON, FORM_SELECT, FORM_SELECT_CHEVRON } from "./form-controls";

const tokens = (classes: string) => classes.split(" ");

const SHARED = [
  "h-8",
  "rounded-md",
  "border",
  "border-neutral-300",
  "dark:border-neutral-700",
  "text-sm",
  "leading-none",
];

describe("form controls", () => {
  it("resets the native appearance of the selects, unprefixed and for WebKit", () => {
    expect(tokens(FORM_SELECT)).toContain("appearance-none");
    expect(tokens(FORM_SELECT)).toContain("[-webkit-appearance:none]");
  });

  it.each(SHARED)("gives the selects and the button the same %s", (token) => {
    expect(tokens(FORM_SELECT)).toContain(token);
    expect(tokens(FORM_BUTTON)).toContain(token);
  });

  it("sets no vertical padding that would fight the explicit height", () => {
    for (const classes of [FORM_SELECT, FORM_BUTTON]) {
      expect(tokens(classes).filter((t) => /^(py|pt|pb)-/.test(t))).toEqual([]);
    }
  });

  it("keeps the select text clear of a chevron that lets clicks through", () => {
    expect(tokens(FORM_SELECT)).toContain("pr-8");
    expect(tokens(FORM_SELECT_CHEVRON)).toContain("pointer-events-none");
    expect(tokens(FORM_SELECT_CHEVRON)).toContain("absolute");
  });

  it("covers the light and dark backgrounds of the selects", () => {
    expect(tokens(FORM_SELECT)).toContain("bg-white");
    expect(tokens(FORM_SELECT)).toContain("dark:bg-neutral-900");
  });
});
