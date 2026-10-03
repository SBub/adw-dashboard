"use client";

import { useState } from "react";
import type { Run } from "@/types/adw";
import { RunRow } from "./RunRow";

type Filter = "all" | "completed" | "failed";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

interface RunHistoryProps {
  runs: Run[];
  projectSlug: string;
}

/** The History section: a list of finished runs with a pure view-state status toggle. */
export function RunHistory({ runs, projectSlug }: RunHistoryProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = filter === "all" ? runs : runs.filter((run) => run.status === filter);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">History</h2>
        <div
          role="group"
          aria-label="Filter history by status"
          className="inline-flex rounded-md border border-neutral-200 p-0.5 text-sm dark:border-neutral-800"
        >
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={`rounded px-3 py-1 transition-colors ${
                filter === option.value
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          No runs match this filter.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((run) => (
            <RunRow key={run.adw_id} run={run} projectSlug={projectSlug} variant="history" />
          ))}
        </ul>
      )}
    </section>
  );
}
