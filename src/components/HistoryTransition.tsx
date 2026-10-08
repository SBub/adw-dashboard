"use client";

import {
  type ReactNode,
  type TransitionStartFunction,
  createContext,
  use,
  useTransition,
} from "react";

interface HistoryTransitionValue {
  isPending: boolean;
  startTransition: TransitionStartFunction;
}

const HistoryTransitionContext = createContext<HistoryTransitionValue | null>(null);

/**
 * The one transition the History search and page arrows navigate in, shared by
 * the box and the arrows that start it (HistorySearch, HistoryPageLink) and the
 * list wrapper that shows it (HistoryResults).
 * Renders its children and nothing else, and reads no request data, so the
 * History section it wraps stays in the static shell.
 */
export function HistoryTransition({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  return (
    <HistoryTransitionContext value={{ isPending, startTransition }}>
      {children}
    </HistoryTransitionContext>
  );
}

/** The shared History transition; only valid inside HistoryTransition. */
export function useHistoryTransition(): HistoryTransitionValue {
  const value = use(HistoryTransitionContext);
  if (value === null) throw new Error("useHistoryTransition must be used inside HistoryTransition");
  return value;
}

/**
 * Dims the History list while a search or page-turn navigation is pending, so
 * the old rows stay on screen until the new ones stream in.
 */
export function HistoryResults({ children }: { children: ReactNode }) {
  const { isPending } = useHistoryTransition();
  return (
    <div
      aria-busy={isPending}
      className={isPending ? "opacity-50 transition-opacity" : "transition-opacity"}
    >
      {children}
    </div>
  );
}
