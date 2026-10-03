// Folds one Realtime change event on the adw.projects table into the cached
// project list. Pure: it never touches the cache, the client or the clock, it
// just returns the next list, which is what makes it unit-testable without a
// socket. The realtime module hands its result to queryClient.setQueryData.
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Project, ProjectSummary } from "@/types/adw";

/**
 * Returns the project list after applying `ev`:
 *
 * - INSERT prepends the new row as a summary with zero counts and no last run
 *   (a project that was just created has no runs yet). If an entry with that
 *   id already exists the list is returned unchanged, so a replayed or
 *   duplicated event cannot create a second entry.
 * - UPDATE merges the new row into the matching entry, keeping its counts and
 *   last_run_at, which are not columns on the table and so are not in the
 *   event. An update for an id that is not in the list is ignored.
 * - DELETE removes the entry whose id matches `ev.old.id`. Supabase sends
 *   `old` with only the primary key unless the table's replica identity is
 *   FULL, so id is the only field this relies on.
 *
 * The input is never mutated.
 */
export function applyProjectChange(
  current: ProjectSummary[],
  ev: RealtimePostgresChangesPayload<Project>,
): ProjectSummary[] {
  switch (ev.eventType) {
    case "INSERT": {
      if (current.some((project) => project.id === ev.new.id)) return current;
      const inserted: ProjectSummary = {
        ...ev.new,
        running: 0,
        completed: 0,
        failed: 0,
        last_run_at: null,
      };
      return [inserted, ...current];
    }
    case "UPDATE": {
      return current.map((project) =>
        project.id === ev.new.id ? { ...project, ...ev.new } : project,
      );
    }
    case "DELETE": {
      const id = ev.old.id;
      if (id === undefined) return current;
      return current.filter((project) => project.id !== id);
    }
  }
}
