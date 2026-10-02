import type { ReactNode } from "react";
import type { RunView } from "@/types/adw";
import { IssueClassBadge } from "./IssueClassBadge";
import { StatusBadge } from "./StatusBadge";
import { Timestamp } from "./Timestamp";

interface RunRowProps {
  run: RunView;
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

export function RunRow({ run, projectSlug, variant }: RunRowProps) {
  return (
    <li className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge status={run.status} />
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
        <IssueClassBadge issueClass={run.issue_class} />
        <code className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
          {run.adw_id}
        </code>
        {run.is_stale && (
          <span
            title="No progress reported for too long"
            className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300"
          >
            stale
          </span>
        )}
        {variant === "active" && (
          <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
            updated {run.since_update_label}
          </span>
        )}
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
        {variant === "active" ? (
          <Field label="Updated">
            <Timestamp value={run.updated_at} />
          </Field>
        ) : (
          <>
            <Field label="Finished">
              {run.finished_at ? (
                <Timestamp value={run.finished_at} />
              ) : (
                <span className="text-neutral-400 dark:text-neutral-600">none</span>
              )}
            </Field>
            <Field label="Duration">
              {run.duration_label ?? (
                <span className="text-neutral-400 dark:text-neutral-600">none</span>
              )}
            </Field>
          </>
        )}
      </dl>
    </li>
  );
}
