// Suspense boundary for the skill segment. The shell (root layout) prerenders
// for every name; this fallback shows while the page below awaits params for a
// name outside generateStaticParams, resolved at request time.
export default function SkillLoading() {
  return (
    <p className="mx-auto max-w-3xl px-4 py-6 text-sm text-neutral-500 dark:text-neutral-400">
      Loading skill...
    </p>
  );
}
