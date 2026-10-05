import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { parseMarkdown } from "@/lib/markdown";
import { getSkill, getSkills } from "@/skills";

interface SkillPageProps {
  params: Promise<{ name: string }>;
}

// Pre-render one page per skill at build time. A name outside this list is
// still served: under cacheComponents the shell prerenders up to the
// segment's loading.tsx boundary and params resolve on request, where an
// unknown name hits notFound().
export function generateStaticParams() {
  const skills = getSkills();
  // Under cacheComponents an empty array fails the build (no params to
  // prerender the segment with), so an empty skills/ directory hands it one
  // placeholder. "_none" is not a valid skill name, so getSkill returns null
  // and the page falls through to notFound() at request time.
  if (skills.length === 0) return [{ name: "_none" }];
  return skills.map(({ name }) => ({ name }));
}

export async function generateMetadata({ params }: SkillPageProps): Promise<Metadata> {
  const { name } = await params;
  return { title: getSkill(name) ? `${name} | Skills | ADW Dashboard` : "Not found" };
}

export default async function SkillPage({ params }: SkillPageProps) {
  const { name } = await params;
  const skill = getSkill(name);
  if (!skill) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-6">
      <Link
        href="/skills"
        className="text-sm text-neutral-500 underline-offset-4 hover:underline dark:text-neutral-400"
      >
        &larr; Skills
      </Link>
      <h1 className="mt-4 break-words font-mono text-2xl font-semibold tracking-tight">
        {skill.name}
      </h1>
      <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">{skill.description}</p>
      {skill.whenToUse && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            When to use
          </p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{skill.whenToUse}</p>
        </div>
      )}
      <hr className="my-6 border-neutral-200 dark:border-neutral-800" />
      <Markdown blocks={parseMarkdown(skill.body)} />
    </article>
  );
}
