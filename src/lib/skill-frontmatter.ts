// Parses and validates one SKILL.md in the official Claude Code skill format:
// YAML frontmatter with name, description and an optional when_to_use, then a
// markdown body. Pure (a string in, a value out, no node:fs), so the build's
// reader and the unit tests run the same check.
//
// The frontmatter is a strict YAML subset: one `key: value` per line, the
// value plain, single-quoted or double-quoted. Block scalars, nested maps and
// lists are outside the subset and rejected, as is any key not listed below.

export interface Skill {
  name: string;
  description: string;
  whenToUse: string | null;
  body: string;
}

const KEYS = new Set(["name", "description", "when_to_use"]);
const KEY = /^[a-z_-]+$/;
const NAME_CHARS = /^[a-z0-9-]+$/;
const NAME_MAX_LENGTH = 64;
const DELIMITER = "---";

/**
 * True for a valid skill name: at most 64 characters, lowercase letters,
 * digits and hyphens, with no leading, trailing or doubled hyphen.
 */
export function isSkillName(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= NAME_MAX_LENGTH &&
    NAME_CHARS.test(value) &&
    !value.startsWith("-") &&
    !value.endsWith("-") &&
    !value.includes("--")
  );
}

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

/**
 * Parses `source`, the text of `<directory>/SKILL.md`, into a Skill. Throws an
 * Error whose message starts with `<directory>/SKILL.md: ` and names the
 * problem: a missing delimiter, a line outside the subset, a duplicate or
 * unknown key, a missing or empty field, an invalid name, a name that differs
 * from the directory, or an empty body.
 */
export function parseSkillFile(source: string, directory: string): Skill {
  const fail = (problem: string): never => {
    throw new Error(`${directory}/SKILL.md: ${problem}`);
  };

  const lines = source.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== DELIMITER) fail("the first line must be ---");
  const end = lines.indexOf(DELIMITER, 1);
  if (end === -1) fail("the frontmatter has no closing ---");

  const fields = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    if (line.trim() === "") continue;
    if (line.startsWith(" ") || line.startsWith("\t")) {
      fail(`indented line "${line.trim()}" (only one key: value per line is supported)`);
    }
    const colon = line.indexOf(":");
    const key = colon === -1 ? "" : line.slice(0, colon);
    const rest = colon === -1 ? "" : line.slice(colon + 1);
    if (!KEY.test(key) || (rest !== "" && !rest.startsWith(" "))) {
      fail(`line "${line}" is not key: value`);
    }
    if (!KEYS.has(key)) fail(`unknown key "${key}" (allowed: name, description, when_to_use)`);
    if (fields.has(key)) fail(`duplicate key "${key}"`);
    const value = unquote(rest);
    if (value === "") fail(`empty value for "${key}"`);
    fields.set(key, value);
  }

  const name = fields.get("name") ?? fail('missing "name"');
  const description = fields.get("description") ?? fail('missing "description"');
  if (!isSkillName(name)) {
    fail(
      `invalid name "${name}" (lowercase letters, digits and single hyphens, at most ${NAME_MAX_LENGTH})`,
    );
  }
  if (name !== directory) fail(`name "${name}" differs from its directory "${directory}"`);

  const body = lines
    .slice(end + 1)
    .join("\n")
    .trim();
  if (body === "") fail("the body is empty");

  return { name, description, whenToUse: fields.get("when_to_use") ?? null, body };
}
