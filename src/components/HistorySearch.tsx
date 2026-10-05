"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { historyHref } from "@/lib/history-bookmark";
import { HISTORY_QUERY_MAX_LENGTH, readHistoryQuery } from "@/lib/history-search";
import { useHistoryTransition } from "./HistoryTransition";

interface HistorySearchProps {
  slug: string;
  /** The page's normalised `?q`, or "" for no search, read by the server island. */
  initial: string;
}

const INPUT =
  "w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none disabled:opacity-50 dark:border-neutral-700 dark:placeholder:text-neutral-500 dark:focus:border-neutral-400 [&::-webkit-search-cancel-button]:appearance-none";

const CLEAR =
  "absolute inset-y-0 right-2 my-auto h-fit text-sm text-neutral-600 hover:underline dark:text-neutral-400";

/**
 * The History search box. It filters nothing itself: 300 ms after the last
 * keystroke it replaces the URL with the page-one History URL for the text
 * (historyHref, so `?after` is dropped and an empty box drops `?q`), inside the
 * shared History transition, and the server-rendered islands re-render for
 * the new `?q`. No useSearchParams: the initial text comes from the server.
 */
export function HistorySearch({ slug, initial }: HistorySearchProps) {
  const [text, setText] = useState(initial);
  const router = useRouter();
  const { startTransition } = useHistoryTransition();

  function navigate(next: string) {
    startTransition(() => {
      router.replace(historyHref(slug, null, readHistoryQuery(next)), { scroll: false });
    });
  }

  const { schedule, cancel } = useDebouncedCallback(navigate, 300);

  return (
    <div className="relative w-64 max-w-full min-w-0">
      <input
        type="search"
        aria-label="Search history"
        placeholder="Title, #, branch or id"
        maxLength={HISTORY_QUERY_MAX_LENGTH}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          schedule(e.target.value);
        }}
        className={`${INPUT} pr-14`}
      />
      {text !== "" && (
        <button
          type="button"
          onClick={() => {
            cancel();
            setText("");
            navigate("");
          }}
          className={CLEAR}
        >
          Clear
        </button>
      )}
    </div>
  );
}

/** The box, disabled, while the search island streams in: it reserves the space in the static shell. */
export function HistorySearchFallback() {
  return (
    <div className="relative w-64 max-w-full min-w-0">
      <input
        type="search"
        aria-label="Search history"
        placeholder="Title, #, branch or id"
        disabled
        className={INPUT}
      />
    </div>
  );
}
