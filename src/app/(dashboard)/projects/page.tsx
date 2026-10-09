import { HydrationBoundary } from "@tanstack/react-query";
import { ActiveRunsOverview } from "@/components/ActiveRunsOverview";
import { ActiveRunsOverviewSkeleton } from "@/components/LoadingSkeletons";
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
      <QueryBoundary fallback={<ActiveRunsOverviewSkeleton />} detail="Active runs did not load.">
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
        description="Runs in progress, and runs that failed and are not resolved yet, across every project. Each row updates live as phases complete."
        detail="A failed run keeps its branch and stays here, not in history, until it is run again."
      />
      <SectionBoundary fallback={<ActiveRunsOverviewSkeleton />} detail="Active runs did not load.">
        <AllActiveRuns />
      </SectionBoundary>
    </section>
  );
}
