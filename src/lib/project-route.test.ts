import { describe, expect, it } from "vitest";
import { isProjectPath } from "./project-route";

describe("isProjectPath", () => {
  it("matches the page built as /projects/<slug>, slash included", () => {
    expect(isProjectPath("/projects/SBub/adw-toolkit", "SBub/adw-toolkit")).toBe(true);
  });

  it("matches the percent-encoded spelling Next decodes to the same slug", () => {
    expect(isProjectPath("/projects/SBub%2Fadw-toolkit", "SBub/adw-toolkit")).toBe(true);
  });

  it("is false for another project's page", () => {
    expect(isProjectPath("/projects/SBub/adw-dashboard", "SBub/adw-toolkit")).toBe(false);
  });

  it("is false for the overview and for a route outside /projects", () => {
    expect(isProjectPath("/", "SBub/adw-toolkit")).toBe(false);
    expect(isProjectPath("/about", "SBub/adw-toolkit")).toBe(false);
  });

  it("is false for a page one segment longer or shorter than the slug", () => {
    expect(isProjectPath("/projects/SBub", "SBub/adw-toolkit")).toBe(false);
    expect(isProjectPath("/projects/SBub/adw-toolkit/extra", "SBub/adw-toolkit")).toBe(false);
  });

  it("is false, not a throw, for a malformed percent sequence", () => {
    expect(isProjectPath("/projects/SBub/%E0%A4%A", "SBub/adw-toolkit")).toBe(false);
  });
});
