import type { ReactNode } from "react";
import { phaseLabel } from "@/lib/run-phase";
import { branchTreeHref, costLabel, durationLabel } from "@/lib/run-view";
import type { Run } from "@/types/adw";
import { IssueClassBadge } from "./IssueClassBadge";
import { StatusBadge } from "./StatusBadge";
import { Timestamp } from "./Timestamp";

interface RunRowProps {
  run: Run;
  /** "owner/repo", used to build the GitHub issue link. */
  projectSlug: string;
  variant: "active" | "history";
  /** History only: the run's cost in US dollars, undefined when it published no metrics. */
  cost?: number;
}

function Field({
  label,
  wrap,
  className,
  children,
}: {
  label: string;
  /** Show the value in full, wrapping anywhere, instead of truncating it. */
  wrap?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className ? `min-w-0 ${className}` : "min-w-0"}>
      <dt className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      {wrap ? (
        <dd className="mt-0.5 text-sm break-all">{children}</dd>
      ) : (
        <dd
          className="mt-0.5 truncate text-sm"
          title={typeof children === "string" ? children : undefined}
        >
          {children}
        </dd>
      )}
    </div>
  );
}

function Mono({ value }: { value: string | null }) {
  if (!value) return <span className="text-neutral-400 dark:text-neutral-600">none</span>;
  return <code className="font-mono text-sm">{value}</code>;
}

// History's branch: the full name, selected whole by one click, with a small
// link to its tree beside it. The link stays off the name (a merged branch is
// often deleted, so the tree may 404) and outside the code element, so
// selecting the name never picks up the glyph.
function Branch({ branch, projectSlug }: { branch: string | null; projectSlug: string }) {
  if (!branch) return <Mono value={null} />;
  return (
    <>
      <code className="select-all font-mono text-sm">{branch}</code>
      <a
        href={branchTreeHref(projectSlug, branch)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open branch ${branch} on GitHub`}
        className="ml-1.5 text-neutral-500 hover:text-neutral-600 dark:text-neutral-400 dark:hover:text-neutral-300"
      >
        <span aria-hidden="true">↗</span>
      </a>
    </>
  );
}

/**
 * One run, as stored. Every value shown is a column or a pure function of the
 * row's columns: durationLabel for Duration (null while finished_at is null,
 * so a running run shows no duration), phaseLabel for the Active row's phase
 * (the raw step key stays on the hover title), branchTreeHref for the
 * History card's branch link and costLabel for its Cost (shown only when the
 * run has a metrics row, never as "$0.00" for a missing one). The History card
 * shows the branch in full, Finished, Duration and Cost, with no status pill. Nothing here reads the clock:
 * "updated 2m ago", the stale badge and the elapsed time of a running run are
 * removed pending issue #3. The issue title is a column shown as stored; runs
 * published before the toolkit started writing it have none and show no title.
 */
export function RunRow({ run, projectSlug, variant, cost }: RunRowProps) {
  const duration = durationLabel(run.started_at, run.finished_at);
  const phase = phaseLabel(run.phase);

  return (
    <li className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-2">
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
            <span className="text-sm leading-6 text-neutral-400 dark:text-neutral-600">
              no issue
            </span>
          )}
          {run.issue_title !== null && (
            <span className="min-w-0 flex-1 basis-40 wrap-break-word text-sm leading-6">
              {run.issue_title}
            </span>
          )}
          {run.issue_class ? (
            <span className="flex h-6 items-center">
              <IssueClassBadge issueClass={run.issue_class} />
            </span>
          ) : null}
          <code className="font-mono text-xs leading-6 text-neutral-500 dark:text-neutral-400">
            {run.adw_id}
          </code>
          {variant === "active" && (
            <span className="ml-auto text-xs leading-6 text-neutral-500 dark:text-neutral-400">
              Updated <Timestamp value={run.updated_at} />
            </span>
          )}
        </div>
        {variant === "active" && (
          <div className="flex h-6 shrink-0 items-center">
            <StatusBadge status={run.status} />
          </div>
        )}
      </div>
      {variant === "active" ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Phase">
            {phase ? (
              <span title={run.phase ?? undefined}>{phase}</span>
            ) : (
              <span className="text-neutral-400 dark:text-neutral-600">none</span>
            )}
          </Field>
          <Field label="Branch">
            <Mono value={run.branch_name} />
          </Field>
          <Field label="Started">
            <Timestamp value={run.started_at} />
          </Field>
        </dl>
      ) : (
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <Field label="Branch" wrap className="sm:col-span-2 lg:col-span-1">
            <Branch branch={run.branch_name} projectSlug={projectSlug} />
          </Field>
          <Field label="Finished">
            {run.finished_at ? (
              <Timestamp value={run.finished_at} />
            ) : (
              <span className="text-neutral-400 dark:text-neutral-600">none</span>
            )}
          </Field>
          {duration !== null && <Field label="Duration">{duration}</Field>}
          {cost !== undefined && <Field label="Cost">{costLabel(cost)}</Field>}
        </dl>
      )}
    </li>
  );
}
