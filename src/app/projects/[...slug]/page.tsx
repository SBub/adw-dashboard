import { notFound } from "next/navigation";
import { getProjectRuns } from "@/data";

// Project slugs contain a slash ("owner/repo"), so this is a catch-all
// segment: /projects/SBub/adw-toolkit arrives as ["SBub", "adw-toolkit"] and
// is joined back into the slug the data layer knows.
export default async function ProjectPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const data = getProjectRuns(slug.join("/"));
  if (!data) notFound();

  return (
    <div>
      <h1 className="text-xl font-semibold">{data.project.display_name}</h1>
      <ul className="mt-4 space-y-1 font-mono text-sm">
        {[...data.active, ...data.history].map((run) => (
          <li key={run.adw_id}>{run.adw_id}</li>
        ))}
      </ul>
    </div>
  );
}
