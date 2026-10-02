import Link from "next/link";
import { getProjects } from "@/data";

export default function HomePage() {
  const projects = getProjects();
  return (
    <ul className="space-y-2">
      {projects.map((project) => (
        <li key={project.id}>
          <Link href={`/projects/${project.slug}`} className="underline underline-offset-4">
            {project.display_name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
