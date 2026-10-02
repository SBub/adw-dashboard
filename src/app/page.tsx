import { PageHeader } from "@/components/PageHeader";
import { ProjectCard } from "@/components/ProjectCard";
import { getProjects } from "@/data";

export default function HomePage() {
  const projects = getProjects();

  return (
    <>
      <PageHeader title="Projects" subtitle="Every project reporting AI Developer Workflow runs" />
      {projects.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No projects yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </ul>
      )}
    </>
  );
}
