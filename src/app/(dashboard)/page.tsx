export default function HomePage() {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Select a project</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Its active and finished runs show up here.
        </p>
      </div>
    </div>
  );
}
