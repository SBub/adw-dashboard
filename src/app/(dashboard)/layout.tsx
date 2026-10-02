import type { ReactNode } from "react";
import { ProjectNav } from "@/components/ProjectNav";
import { getProjects } from "@/data";

// Master-detail shell shared by "/" and "/projects/[...slug]". The project
// list is read once here, in a server layout, so the sidebar persists across
// selection changes instead of re-rendering with each detail page.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const projects = getProjects();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:items-start md:gap-8">
      <aside className="shrink-0 md:sticky md:top-6 md:max-h-[calc(100vh-5.5rem)] md:w-72 md:overflow-y-auto">
        <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Projects
        </h2>
        <ProjectNav projects={projects} />
      </aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}
