import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { RunHistory } from "@/components/RunHistory";
import { RunRow } from "@/components/RunRow";
import { getProjectRuns, getProjects } from "@/data";

// Project slugs contain a slash ("owner/repo"), so this is a catch-all
// segment: /projects/SBub/adw-toolkit arrives as ["SBub", "adw-toolkit"] and
// is joined back into the slug the data layer knows.
interface ProjectPageProps {
  params: Promise<{ slug: string[] }>;
}

// Pre-render one page per known project at build time. A catch-all segment
// takes an array per param, so each slug is split back into its parts.
// Slugs not in this list are still served: cacheComponents is on in
// next.config.ts, so Next prerenders a static shell up to the segment's
// loading.tsx boundary and resolves params on request, and an unknown project
// still hits notFound(). (dynamicParams cannot be exported under
// cacheComponents.)
export function generateStaticParams() {
  return getProjects().map((project) => ({ slug: project.slug.split("/") }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = getProjectRuns(slug.join("/"));
  return { title: data ? `${data.project.display_name} | ADW Dashboard` : "Not found" };
}

// Awaiting params makes this page request-time for slugs outside
// generateStaticParams. The sibling loading.tsx is the Suspense boundary for
// the segment, so the layout and sidebar above it still prerender.
export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const data = getProjectRuns(slug.join("/"));
  if (!data) notFound();

  const { project, active, history } = data;

  return (
    <>
      <PageHeader title={project.display_name} subtitle={project.slug} repoUrl={project.repo_url} />

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Active</h2>
        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No runs in progress.
          </p>
        ) : (
          <ul className="space-y-3">
            {active.map((run) => (
              <RunRow key={run.adw_id} run={run} projectSlug={project.slug} variant="active" />
            ))}
          </ul>
        )}
      </section>

      <RunHistory runs={history} projectSlug={project.slug} />
    </>
  );
}
