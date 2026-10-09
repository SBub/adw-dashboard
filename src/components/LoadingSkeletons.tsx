import type { ReactNode } from "react";
import { HISTORY_PAGE_SIZE } from "@/lib/history-bookmark";
import { STATUS_COLORS } from "@/lib/status-colors";
import { Skeleton } from "./Skeleton";

/**
 * The loading fallbacks of the projects side, one per component a boundary
 * guards. Each mirrors its component's box classes (border, radius, padding,
 * gaps, list spacing) and line count, with every text line replaced by a
 * `Skeleton` bar as tall as the line box it stands in for (a `text-xs` line is
 * `h-3 my-0.5`, `text-sm` is `h-4 my-0.5`, a 24px `leading-6` or `h-6` box is
 * `h-4 my-1`, `text-lg` is `h-5 my-1`, `text-2xl` is `h-7 my-0.5`), so the
 * real content replaces the skeleton in place. When a component's padding,
 * border, gaps or line count changes, its skeleton changes in the same commit.
 *
 * Every top-level skeleton is a `role="status"` container with
 * `aria-busy="true"` and an `aria-label`; the blocks inside are `aria-hidden`.
 * All are server components with no state: no data import, no clock read.
 */

const CARD = "rounded-lg border border-neutral-200 dark:border-neutral-800";

function Busy({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}

// ProjectNav's card: title, slug, the four counts (wrapping like the real
// line) and the last run line.
function ProjectCardSkeleton() {
  return (
    <li className="w-64 shrink-0 md:w-auto">
      <div className={`${CARD} px-3 py-2.5`}>
        <Skeleton className="my-0.5 h-4 w-32" />
        <Skeleton className="my-0.5 h-3 w-44" />
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <Skeleton className="my-0.5 h-3 w-14" />
          <Skeleton className="my-0.5 h-3 w-16" />
          <Skeleton className="my-0.5 h-3 w-20" />
          <Skeleton className="my-0.5 h-3 w-14" />
        </span>
        <span className="mt-1.5 block">
          <Skeleton className="my-0.5 h-3 w-40" />
        </span>
      </div>
    </li>
  );
}

/** The sidebar's project list while it loads: three cards. */
export function ProjectNavSkeleton() {
  return (
    <Busy label="Loading projects">
      <ul className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
        <ProjectCardSkeleton />
        <ProjectCardSkeleton />
        <ProjectCardSkeleton />
      </ul>
    </Busy>
  );
}

// RunRow's Field: the uppercase label and the value line under it. `wide`
// stands in for History's full branch, which spans two columns.
function FieldSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div data-skeleton="field" className={wide ? "min-w-0 sm:col-span-2" : "min-w-0"}>
      <Skeleton className="my-0.5 h-3 w-12" />
      <div className="mt-0.5">
        <Skeleton className={`my-0.5 h-4 ${wide ? "w-56" : "w-28"}`} />
      </div>
    </div>
  );
}

type RunVariant = "active" | "history";

// RunRow: the first line in 24px boxes, then three fields. An active row has
// the pill on the right; a history row has no pill and its branch field spans
// two columns of a four-column grid.
function RunRowSkeleton({ variant }: { variant: RunVariant }) {
  return (
    <li className={`${CARD} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-2">
          <Skeleton className="my-1 h-4 w-10" />
          <Skeleton className="my-1 h-4 min-w-0 flex-1 basis-40" />
          <Skeleton className="my-0.5 h-5 w-14" />
          <Skeleton className="my-1.5 h-3 w-16" />
          {variant === "active" && <Skeleton className="my-1.5 ml-auto h-3 w-40" />}
        </div>
        {variant === "active" && (
          <div className="flex h-6 shrink-0 items-center">
            <Skeleton round className="h-5 w-16" />
          </div>
        )}
      </div>
      {variant === "active" ? (
        <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
      ) : (
        <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-4">
          <FieldSkeleton wide />
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
      )}
    </li>
  );
}

function RunRowsSkeleton({ variant, rows }: { variant: RunVariant; rows: number }) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        // Static placeholders that never reorder, so the index is the key.
        <RunRowSkeleton key={i} variant={variant} />
      ))}
    </ul>
  );
}

/** A list of run rows while it loads (History, or a project's Active runs). */
export function RunListSkeleton({ variant, rows }: { variant: RunVariant; rows: number }) {
  return (
    <Busy label={variant === "history" ? "Loading history" : "Loading runs"}>
      <RunRowsSkeleton variant={variant} rows={rows} />
    </Busy>
  );
}

// QueueRow: the muted rail, the round marker in the gutter and the one-line
// card (number, title, queued time, pill).
function QueueRowSkeleton() {
  return (
    <li className="group relative flex gap-3">
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-[29px] -bottom-[41px] left-5 border-l group-last:hidden ${STATUS_COLORS.neutral.border}`}
      />
      <div className="flex w-10 shrink-0 justify-center pt-[17px]">
        <span className="flex h-6 items-center">
          <Skeleton round className="relative h-5 w-5" />
        </span>
      </div>
      <div className={`min-w-0 flex-1 ${CARD} p-4`}>
        <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2">
          <Skeleton className="my-1 h-4 w-10" />
          <Skeleton className="my-1 h-4 min-w-0 flex-1 basis-40" />
          <Skeleton className="my-1.5 ml-auto h-3 w-40" />
          <span className="flex h-6 shrink-0 items-center">
            <Skeleton round className="h-5 w-16" />
          </span>
        </div>
      </div>
    </li>
  );
}

/** QueueView while it loads: the section with its heading and two rail rows. */
export function QueueViewSkeleton({ heading }: { heading: ReactNode }) {
  return (
    <section className="mb-10">
      {heading}
      <Busy label="Loading queue">
        <ol className="space-y-3">
          <QueueRowSkeleton />
          <QueueRowSkeleton />
        </ol>
      </Busy>
    </section>
  );
}

/**
 * ActiveRunsView while it loads: the Active section with its heading and two
 * run rows, then the `queue` slot, in ActiveRunsView's order and wrappers.
 */
export function ActiveRunsViewSkeleton({
  heading,
  queue,
}: {
  heading: ReactNode;
  queue: ReactNode;
}) {
  return (
    <>
      <section className="mb-10">
        {heading}
        <RunListSkeleton variant="active" rows={2} />
      </section>

      {queue}
    </>
  );
}

/** ActiveRunsOverview while it loads: one project group with two run rows. */
export function ActiveRunsOverviewSkeleton() {
  return (
    <Busy label="Loading active runs">
      <div className="space-y-8">
        <section>
          {/* The h3's box, as a div so the outline has no empty heading. */}
          <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
            <Skeleton className="my-1 h-4 w-40" />
            <Skeleton className="h-3 w-36" />
          </div>
          <RunRowsSkeleton variant="active" rows={2} />
        </section>
      </div>
    </Busy>
  );
}

/** HistoryLinks while it loads: the two arrow slots and the "N of M" bar. */
export function HistoryLinksSkeleton() {
  return (
    <Busy label="Loading pages" className="flex items-center gap-3">
      <span className="inline-flex w-6 justify-center">
        <Skeleton className="my-0.5 h-4 w-4" />
      </span>
      <Skeleton className="my-0.5 h-4 w-12" />
      <span className="inline-flex w-6 justify-center">
        <Skeleton className="my-0.5 h-4 w-4" />
      </span>
    </Busy>
  );
}

// PageHeader: the text-2xl title and the text-sm slug under it.
function PageHeaderSkeleton() {
  return (
    <div className="mb-8">
      <Skeleton className="my-0.5 h-7 w-64" />
      <div className="mt-1">
        <Skeleton className="my-0.5 h-4 w-56" />
      </div>
    </div>
  );
}

// SectionHeading: the text-lg title and the description line.
function SectionHeadingSkeleton() {
  return (
    <div className="mb-3">
      <div className="flex items-center">
        <Skeleton className="my-1 h-5 w-24" />
      </div>
      <div className="mt-1">
        <Skeleton className="my-0.5 h-4 w-full max-w-xl" />
      </div>
    </div>
  );
}

/** The whole project page while its segment loads (loading.tsx). */
export function ProjectPageSkeleton() {
  return (
    <Busy label="Loading project">
      <PageHeaderSkeleton />
      <ActiveRunsViewSkeleton
        heading={<SectionHeadingSkeleton />}
        queue={<QueueViewSkeleton heading={<SectionHeadingSkeleton />} />}
      />
      <section>
        <SectionHeadingSkeleton />
        <RunListSkeleton variant="history" rows={HISTORY_PAGE_SIZE} />
      </section>
    </Busy>
  );
}
