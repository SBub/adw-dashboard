"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ProjectSummary } from "@/types/adw";
import { Timestamp } from "./Timestamp";

function Count({
  label,
  value,
  emphasised,
}: {
  label: string;
  value: number;
  emphasised: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums ${
        emphasised
          ? "font-semibold text-emerald-700 dark:text-emerald-400"
          : value === 0
            ? "text-neutral-400 dark:text-neutral-600"
            : "text-neutral-700 dark:text-neutral-300"
      }`}
      title={`${value} ${label}`}
    >
      {emphasised && (
        <span className="inline-block size-1.5 animate-pulse rounded-full bg-emerald-500" />
      )}
      {value} <span className="font-normal text-neutral-500 dark:text-neutral-400">{label}</span>
    </span>
  );
}

function ProjectNavItem({ project, selected }: { project: ProjectSummary; selected: boolean }) {
  return (
    <li className="w-64 shrink-0 md:w-auto">
      <Link
        href={`/projects/${project.slug}`}
        aria-current={selected ? "page" : undefined}
        className={`block rounded-lg border px-3 py-2.5 transition-colors ${
          selected
            ? "border-neutral-900 bg-neutral-100 dark:border-neutral-100 dark:bg-neutral-900"
            : "border-neutral-200 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
        }`}
      >
        <span className="block truncate text-sm font-semibold">{project.display_name}</span>
        <span className="block truncate font-mono text-xs text-neutral-500 dark:text-neutral-400">
          {project.slug}
        </span>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <Count label="running" value={project.running} emphasised={project.running > 0} />
          <Count label="completed" value={project.completed} emphasised={false} />
          <Count label="failed" value={project.failed} emphasised={false} />
        </span>
        <span className="mt-1.5 block text-xs text-neutral-500 dark:text-neutral-400">
          {project.last_run_at ? (
            <>
              Last run <Timestamp value={project.last_run_at} />
            </>
          ) : (
            "No runs yet"
          )}
        </span>
      </Link>
    </li>
  );
}

/**
 * The sidebar project list. A client component only so it can read the
 * current pathname to highlight the selected project; the list itself is
 * passed in from the server layout.
 */
export function ProjectNav({ projects }: { projects: ProjectSummary[] }) {
  const pathname = usePathname();

  if (projects.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        No projects yet.
      </p>
    );
  }

  return (
    <nav aria-label="Projects">
      <ul className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
        {projects.map((project) => (
          <ProjectNavItem
            key={project.id}
            project={project}
            selected={pathname === `/projects/${project.slug}`}
          />
        ))}
      </ul>
    </nav>
  );
}
