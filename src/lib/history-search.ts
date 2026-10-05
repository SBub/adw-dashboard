// The History search: the normalised `?q=` text and the PostgREST filter it
// becomes. Everything that decides what a search matches lives here. Pure: it
// imports nothing from "@/data" or "next/*", reads no clock, and runs in the
// vitest node pool.
//
// The normalised text is canonical: it is the getHistory argument (so part of
// the cache key), the value the search box writes into the URL and the box's
// initial text. Two spellings of the same search therefore share one entry.

/** The longest search text kept; anything after it is cut. */
export const HISTORY_QUERY_MAX_LENGTH = 60;

/**
 * The search text of a page's `?q` parameter, or null for no search. Lenient,
 * like readHistoryBookmark: absent, repeated, empty or whitespace-only all
 * mean no search. Every `*` is removed (PostgREST turns it into `%` inside a
 * like pattern and it cannot be escaped, so it is never a literal), the text
 * is trimmed, cut at HISTORY_QUERY_MAX_LENGTH and trimmed again (a cut can end
 * on a space).
 */
export function readHistoryQuery(raw: string | string[] | undefined): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.replaceAll("*", "").trim().slice(0, HISTORY_QUERY_MAX_LENGTH).trim();
  return q === "" ? null : q;
}

// An integer that fits int4. Longer numbers would make PostgREST answer a 400
// on an out-of-range issue_number, so they are matched as text only.
const ISSUE_NUMBER = /^\d{1,9}$/;

/**
 * The PostgREST `or` filter for the completed runs a search matches: the text
 * anywhere in the issue title, the branch name or the run id (case-insensitive)
 * or, when the text is an integer, the issue number. `q` is already
 * normalised by readHistoryQuery.
 *
 * Two escapes, in this order. LIKE: `\`, `%` and `_` are escaped with `\`
 * (Postgres ILIKE's default escape), so they match literally. PostgREST: the
 * value is double-quoted, with `\` and `"` escaped inside the quotes, so `,`,
 * `(`, `)`, `.` and `:` cannot break the `or` grammar.
 */
export function historySearchFilter(q: string): string {
  const like = q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
  const value = `"*${like.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}*"`;
  const clauses = [
    `issue_title.ilike.${value}`,
    `branch_name.ilike.${value}`,
    `adw_id.ilike.${value}`,
  ];
  if (ISSUE_NUMBER.test(q)) clauses.push(`issue_number.eq.${Number(q)}`);
  return clauses.join(",");
}
