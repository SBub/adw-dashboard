import Link from "next/link";

// Rendered when /skills/[name] calls notFound() for a name with no skill.
export default function SkillNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        No skill at this address.
      </p>
      <Link href="/skills" className="mt-6 inline-block text-sm underline underline-offset-4">
        &larr; All skills
      </Link>
    </div>
  );
}
