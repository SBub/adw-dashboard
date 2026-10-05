import type { ReactNode } from "react";
import { durationLabel } from "@/lib/run-view";
import type { Run } from "@/types/adw";
import { IssueClassBadge } from "./IssueClassBadge";
import { StatusBadge } from "./StatusBadge";
import { Timestamp } from "./Timestamp";

interface RunRowProps {
  run: Run;
  /** "owner/repo", used to build the GitHub issue link. */
  projectSlug: string;
  variant: "active" | "history";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd
        className="mt-0.5 truncate text-sm"
        title={typeof children === "string" ? children : undefined}
      >
        {children}
      </dd>
    </div>
  );
}

function Mono({ value }: { value: string | null }) {
  if (!value) return <span className="text-neutral-400 dark:text-neutral-600">none</span>;
  return <code className="font-mono text-sm">{value}</code>;
}

/**
 * One run, as stored. Every value shown is a column or, for Duration, a pure
 * function of two columns (durationLabel, which is null while finished_at is
 * null, so a running run shows no duration). Nothing here reads the clock:
 * "updated 2m ago", the stale badge and the elapsed time of a running run are
 * removed pending issue #3. The issue title is a column shown as stored; runs
 * published before the toolkit started writing it have none and show no title.
 */
export function RunRow({ run, projectSlug, variant }: RunRowProps) {
  const duration = durationLabel(run.started_at, run.finished_at);

  return (
    <li className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          {run.issue_number !== null ? (
            <a
              href={`https://github.com/${projectSlug}/issues/${run.issue_number}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              #{run.issue_number}
            </a>
          ) : (
            <span className="text-sm text-neutral-400 dark:text-neutral-600">no issue</span>
          )}
          {run.issue_title !== null && (
            <span className="min-w-0 flex-1 basis-0 truncate text-sm" title={run.issue_title}>
              {run.issue_title}
            </span>
          )}
          <IssueClassBadge issueClass={run.issue_class} />
          <code className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
            {run.adw_id}
          </code>
          {variant === "active" && (
            <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
              Updated <Timestamp value={run.updated_at} />
            </span>
          )}
        </div>
        <div className="flex h-6 shrink-0 items-center">
          <StatusBadge status={run.status} />
        </div>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={variant === "history" ? "Final phase" : "Phase"}>
          <Mono value={run.phase} />
        </Field>
        <Field label="Branch">
          <Mono value={run.branch_name} />
        </Field>
        <Field label="Started">
          <Timestamp value={run.started_at} />
        </Field>
        {variant === "history" && (
          <>
            <Field label="Finished">
              {run.finished_at ? (
                <Timestamp value={run.finished_at} />
              ) : (
                <span className="text-neutral-400 dark:text-neutral-600">none</span>
              )}
            </Field>
            {duration !== null && <Field label="Duration">{duration}</Field>}
          </>
        )}
      </dl>
    </li>
  );
}
