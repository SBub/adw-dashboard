import Link from "next/link";
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
    <div className="min-w-20 text-right">
      <div
        className={`text-2xl font-semibold tabular-nums ${
          emphasised
            ? "text-emerald-700 dark:text-emerald-400"
            : value === 0
              ? "text-neutral-300 dark:text-neutral-700"
              : ""
        }`}
      >
        {emphasised && (
          <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-emerald-500 align-middle" />
        )}
        {value}
      </div>
      <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
    </div>
  );
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <li className="rounded-lg border border-neutral-200 p-5 transition-colors hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <Link
            href={`/projects/${project.slug}`}
            className="text-lg font-semibold hover:underline underline-offset-4"
          >
            {project.display_name}
          </Link>
          <p className="mt-0.5 font-mono text-sm text-neutral-500 dark:text-neutral-400">
            {project.slug}
          </p>
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
            {project.repo_url ? (
              <a
                href={project.repo_url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                {project.repo_url.replace(/^https?:\/\//, "")} &nearr;
              </a>
            ) : (
              <span>No public repository</span>
            )}
          </p>
        </div>
        <div className="flex gap-6">
          <Count label="running" value={project.running} emphasised={project.running > 0} />
          <Count label="completed" value={project.completed} emphasised={false} />
          <Count label="failed" value={project.failed} emphasised={false} />
        </div>
      </div>
      <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
        {project.last_run_at ? (
          <>
            Last run started <Timestamp value={project.last_run_at} />
          </>
        ) : (
          "No runs yet"
        )}
      </p>
    </li>
  );
}
