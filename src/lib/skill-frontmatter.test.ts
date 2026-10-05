import { describe, expect, it } from "vitest";
import { isSkillName, parseSkillFile } from "./skill-frontmatter";

function file(frontmatter: string[], body = "# Title\n\nBody text.") {
  return ["---", ...frontmatter, "---", "", body, ""].join("\n");
}

describe("parseSkillFile", () => {
  it("parses plain values with when_to_use", () => {
    const source = file([
      "name: my-skill",
      "description: Does one thing.",
      "when_to_use: When it matters.",
    ]);
    expect(parseSkillFile(source, "my-skill")).toEqual({
      name: "my-skill",
      description: "Does one thing.",
      whenToUse: "When it matters.",
      body: "# Title\n\nBody text.",
    });
  });

  it("returns whenToUse null without when_to_use", () => {
    const skill = parseSkillFile(file(["name: a", "description: b"]), "a");
    expect(skill.whenToUse).toBeNull();
  });

  it("unquotes double-quoted values with escapes", () => {
    const source = file(["name: a", 'description: "Say \\"hi\\": a \\\\ b # not a comment"']);
    expect(parseSkillFile(source, "a").description).toBe('Say "hi": a \\ b # not a comment');
  });

  it("unquotes single-quoted values with doubled quotes", () => {
    const source = file(["name: 'a'", "description: 'It''s: fine'"]);
    const skill = parseSkillFile(source, "a");
    expect(skill.name).toBe("a");
    expect(skill.description).toBe("It's: fine");
  });

  it("accepts Windows line endings", () => {
    const source = file(["name: a", "description: b"]).replaceAll("\n", "\r\n");
    expect(parseSkillFile(source, "a")).toEqual({
      name: "a",
      description: "b",
      whenToUse: null,
      body: "# Title\n\nBody text.",
    });
  });

  it("ignores blank frontmatter lines", () => {
    expect(parseSkillFile(file(["name: a", "", "description: b"]), "a").name).toBe("a");
  });

  it.each([
    ["no opening delimiter", "name: a\n---\nbody", "the first line must be ---"],
    ["no closing delimiter", "---\nname: a\ndescription: b\nbody", "no closing ---"],
    [
      "a line that is not key: value",
      file(["name: a", "description: b", "just text"]),
      "not key: value",
    ],
    ["a key without a space after the colon", file(["name:a", "description: b"]), "not key: value"],
    ["an indented line", file(["name: a", "description: >", "  folded"]), "indented line"],
    ["a duplicate key", file(["name: a", "name: a", "description: b"]), 'duplicate key "name"'],
    [
      "an unknown key allowed-tools",
      file(["name: a", "description: b", "allowed-tools: Bash"]),
      'unknown key "allowed-tools"',
    ],
    [
      "an unknown key title",
      file(["name: a", "description: b", "title: T"]),
      'unknown key "title"',
    ],
    ["a missing name", file(["description: b"]), 'missing "name"'],
    ["a missing description", file(["name: a"]), 'missing "description"'],
    ["an empty value", file(["name: a", "description:"]), 'empty value for "description"'],
    [
      "an empty quoted value",
      file(["name: a", 'description: ""']),
      'empty value for "description"',
    ],
    ["an empty body", file(["name: a", "description: b"], "  \n"), "the body is empty"],
  ])("rejects %s", (_case, source, message) => {
    expect(() => parseSkillFile(source, "a")).toThrow(`a/SKILL.md: `);
    expect(() => parseSkillFile(source, "a")).toThrow(message);
  });

  it.each(["Server-Prefetch", "-a", "a-", "a--b", "a_b", "a".repeat(65)])(
    "rejects the invalid name %s",
    (name) => {
      expect(() => parseSkillFile(file([`name: ${name}`, "description: b"]), name)).toThrow(
        `${name}/SKILL.md: invalid name`,
      );
    },
  );

  it("rejects a name that differs from its directory", () => {
    expect(() => parseSkillFile(file(["name: a", "description: b"]), "b")).toThrow(
      'b/SKILL.md: name "a" differs from its directory "b"',
    );
  });
});

describe("isSkillName", () => {
  it.each([
    ["a", true],
    ["server-prefetch-with-hydration", true],
    ["a1-b2", true],
    ["a".repeat(64), true],
    ["", false],
    ["a".repeat(65), false],
    ["Server", false],
    ["-a", false],
    ["a-", false],
    ["a--b", false],
    ["a_b", false],
    ["a.b", false],
    ["../a", false],
    ["_none", false],
  ])("%s is %s", (value, expected) => {
    expect(isSkillName(value)).toBe(expected);
  });
});
