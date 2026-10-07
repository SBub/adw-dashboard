// Suspense boundary for the project segment. The shell (root layout, the
// two-pane layout and its sidebar heading) prerenders for every slug; this
// fallback shows while the page below awaits params and the project, before
// its header and its own islands (Active, History) stream in.
export default function ProjectLoading() {
  return <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading project...</p>;
}
