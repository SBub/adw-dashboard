import { ProjectPageSkeleton } from "@/components/LoadingSkeletons";

// Suspense boundary for the project segment. The shell (root layout, the
// two-pane layout and its sidebar heading) prerenders for every slug; this
// fallback, a skeleton of the whole page (header, Active, Queue and History),
// shows while the page below awaits params and the project, before its header
// and its own islands (Active, History) stream in.
export default function ProjectLoading() {
  return <ProjectPageSkeleton />;
}
