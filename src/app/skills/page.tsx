import type { Metadata } from "next";
import Link from "next/link";
import { getSkills } from "@/skills";

export const metadata: Metadata = {
  title: "Skills | ADW Dashboard",
};

// The skill library. getSkills reads and validates every skills/*/SKILL.md
// synchronously at build time, so this page is static and a bad file fails
// the build.
export default function SkillsPage() {
  const skills = getSkills();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Claude Code skills in the official format, rendered for reading.
      </p>
      {skills.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No skills yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {skills.map((skill) => (
            <li key={skill.name}>
              <Link
                href={`/skills/${skill.name}`}
                className="block rounded-lg border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
              >
                <p className="font-mono text-sm font-semibold">{skill.name}</p>
                <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                  {skill.description}
                </p>
                {skill.whenToUse && (
                  <div className="mt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      When to use
                    </p>
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                      {skill.whenToUse}
                    </p>
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
