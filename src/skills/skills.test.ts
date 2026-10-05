import { describe, expect, it } from "vitest";
import { parseSkillFile } from "@/lib/skill-frontmatter";

// Every real skill file, read as text when Vite transforms this test: the same
// check the build runs through getSkills, here on `yarn test` so a bad skill
// is caught before a build. Next's global typing of import.meta.glob returns
// unknown, hence the guard.
const FILES = Object.entries(
  import.meta.glob("/skills/*/SKILL.md", { query: "?raw", import: "default", eager: true }),
)
  .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  .map(([path, source]) => ({ directory: path.split("/")[2] ?? "", source }));

describe("skills/*/SKILL.md", () => {
  it("finds the first skill", () => {
    expect(FILES.map(({ directory }) => directory)).toContain("server-prefetch-with-hydration");
  });

  it.each(FILES)("$directory is a valid skill under 200 lines", ({ directory, source }) => {
    expect(() => parseSkillFile(source, directory)).not.toThrow();
    expect(source.split("\n").length).toBeLessThan(200);
  });
});
