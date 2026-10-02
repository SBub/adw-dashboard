// Rendered inside the two-pane shell when a detail page calls notFound(), so
// the sidebar stays put and the next project is one click away.
export default function ProjectNotFound() {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Not found</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          There is no project at this address. Pick one from the list.
        </p>
      </div>
    </div>
  );
}
