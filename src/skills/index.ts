// The one place that reads skills/. Each directory under it holds one SKILL.md
// in the official Claude Code skill format, parsed and validated by
// parseSkillFile. Pages import getSkills and getSkill from "@/skills"; nothing
// else touches the directory.
//
// The reads are synchronous node:fs calls, made at build time by /skills and
// generateStaticParams (and at request time only for a name outside that
// list). They read no clock and no database, so both routes prerender into the
// static shell with no cache scope; an awaited fs/promises read in a page body
// would count as request-time IO under cacheComponents. A bad file throws and
// fails the build on purpose: there is no fallback that skips it.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isSkillName, parseSkillFile, type Skill } from "@/lib/skill-frontmatter";

const SKILLS_DIR = path.join(process.cwd(), "skills");

function readSkillFile(directory: string): string {
  try {
    // The path is built only from the fixed root and a directory name that
    // readdirSync returned for it, never from a request, so it cannot escape
    // skills/.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return readFileSync(path.join(SKILLS_DIR, directory, "SKILL.md"), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`${directory}/SKILL.md: missing`, { cause: error });
    }
    throw error;
  }
}

/** Every skill under skills/, validated, sorted by name. */
export function getSkills(): Skill[] {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseSkillFile(readSkillFile(entry.name), entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The skill with this name, or null. The name is checked and then looked up
 * in the listing; no path is ever built from it.
 */
export function getSkill(name: string): Skill | null {
  if (!isSkillName(name)) return null;
  return getSkills().find((skill) => skill.name === name) ?? null;
}
