// The Realtime subscription: one channel on the Supabase client, started once
// per browser session from Providers, that patches the React Query cache and
// drives the header's connection indicator. The project list itself still
// comes from the data boundary; this module only applies changes to it.
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { ConnectionStatus, setConnectionStatus } from "@/components/ConnectionIndicator";
import type { Project, ProjectSummary } from "@/types/adw";
import { applyProjectChange } from "./apply-project-change";
import { queryKeys } from "./query-keys";
import { getSupabase } from "./supabase";

/**
 * Opens the "adw" channel and subscribes to every change on adw.projects.
 * Each event is folded into the cached list under queryKeys.projects with
 * setQueryData, which is the update path for a static query (invalidation
 * would skip it). The channel's status callback is the one writer of the
 * connection indicator.
 *
 * Returns the closer: it removes the channel and puts the indicator back to
 * Connecting, so the next start begins from the same state as a fresh page.
 */
export function startRealtime(queryClient: QueryClient): () => void {
  const supabase = getSupabase();

  const channel: RealtimeChannel = supabase
    .channel("adw")
    .on<Project>("postgres_changes", { event: "*", schema: "adw", table: "projects" }, (ev) => {
      queryClient.setQueryData<ProjectSummary[]>(queryKeys.projects, (current = []) =>
        applyProjectChange(current, ev),
      );
    })
    // The runs listener (adw.runs, patching the selected project's runs) is added here later.
    .subscribe((state) => {
      switch (state) {
        case REALTIME_SUBSCRIBE_STATES.SUBSCRIBED:
          setConnectionStatus(ConnectionStatus.Live);
          break;
        case REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR:
        case REALTIME_SUBSCRIBE_STATES.TIMED_OUT:
          setConnectionStatus(ConnectionStatus.Reconnecting);
          break;
        case REALTIME_SUBSCRIBE_STATES.CLOSED:
          setConnectionStatus(ConnectionStatus.Connecting);
          break;
      }
    });

  return () => {
    void supabase.removeChannel(channel);
    setConnectionStatus(ConnectionStatus.Connecting);
  };
}
