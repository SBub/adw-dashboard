import { describe, expect, it } from "vitest";
import { isProjectSlug } from "./slug";

describe("isProjectSlug", () => {
  it("accepts owner/repo with the characters GitHub allows", () => {
    expect(isProjectSlug("SBub/adw-toolkit")).toBe(true);
    expect(isProjectSlug("some_org/repo.name-1")).toBe(true);
  });

  it("rejects a missing or extra slash", () => {
    expect(isProjectSlug("SBub")).toBe(false);
    expect(isProjectSlug("SBub/adw/toolkit")).toBe(false);
    expect(isProjectSlug("/adw-toolkit")).toBe(false);
    expect(isProjectSlug("SBub/")).toBe(false);
  });

  it("rejects characters outside the GitHub set", () => {
    expect(isProjectSlug("SBub/adw toolkit")).toBe(false);
    expect(isProjectSlug("SBub/adw%2Ftoolkit")).toBe(false);
    expect(isProjectSlug("history:SBub/adw-toolkit")).toBe(false);
  });

  it("rejects non-strings without throwing", () => {
    expect(isProjectSlug(undefined)).toBe(false);
    expect(isProjectSlug(null)).toBe(false);
    expect(isProjectSlug(42)).toBe(false);
    expect(isProjectSlug({ slug: "SBub/adw-toolkit" })).toBe(false);
  });
});
