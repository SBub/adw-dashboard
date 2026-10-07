import { describe, expect, it } from "vitest";
import { headerSection } from "./header-section";

describe("headerSection", () => {
  it("is projects for the overview and a project page", () => {
    expect(headerSection("/projects")).toBe("projects");
    expect(headerSection("/projects/SBub/adw-dashboard")).toBe("projects");
  });

  it("is projects for a trailing slash and a deeper path under /projects", () => {
    expect(headerSection("/projects/")).toBe("projects");
    expect(headerSection("/projects/SBub/adw-dashboard/extra")).toBe("projects");
  });

  it("is summary for the root only", () => {
    expect(headerSection("/")).toBe("summary");
  });

  it("is null for near misses and routes in neither section", () => {
    expect(headerSection("/projectsx")).toBeNull();
    expect(headerSection("/projects-old")).toBeNull();
    expect(headerSection("/summary")).toBeNull();
    expect(headerSection("/about")).toBeNull();
    expect(headerSection("")).toBeNull();
  });

  it("never puts the root and the overview in the same section", () => {
    expect(headerSection("/")).not.toBe("projects");
    expect(headerSection("/projects")).not.toBe("summary");
  });
});
