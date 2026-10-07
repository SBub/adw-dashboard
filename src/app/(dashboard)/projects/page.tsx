import { HydrationBoundary } from "@tanstack/react-query";
import { ActiveRunsOverview } from "@/components/ActiveRunsOverview";
import { QueryBoundary } from "@/components/QueryBoundary";
import { SectionBoundary } from "@/components/SectionBoundary";
import { SectionHeading } from "@/components/SectionHeading";
import { getActiveRunsState } from "@/data/active-runs-state";

/**
 * Every project's active runs, a request-time island: it awaits the one
 * all-projects Active entry (getActiveRunsState, per request, shared with the
 * sidebar's island through React cache()) and hydrates it as the consumer's
 * own ancestor, so the entry exists before ActiveRunsOverview renders.
 */
async function AllActiveRuns() {
  const { state } = await getActiveRunsState();

  return (
    <HydrationBoundary state={state}>
      <QueryBoundary
        fallback={<p className="text-sm text-neutral-500 dark:text-neutral-400">Loading runs...</p>}
        detail="Active runs did not load."
      >
        <ActiveRunsOverview />
      </QueryBoundary>
    </HydrationBoundary>
  );
}

// The project overview: the sidebar (from the layout) and every active run of
// every project, grouped by project. The heading and its copy are static, in
// the page and so in the shell, above the boundary of the hole it labels; the
// list is that hole, read per request.
export default function ProjectsPage() {
  return (
    <section className="mb-10">
      <SectionHeading
        title="Active"
        description="Runs in progress, and runs that failed and can be resumed, across every project. Each row updates live as phases complete."
        detail="A failed run keeps its branch and can be resumed from the phase that failed, which is why it stays here rather than in history."
      />
      <SectionBoundary
        fallback={<p className="text-sm text-neutral-500 dark:text-neutral-400">Loading runs...</p>}
        detail="Active runs did not load."
      >
        <AllActiveRuns />
      </SectionBoundary>
    </section>
  );
}
