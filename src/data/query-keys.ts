// Every React Query key in the application, in one place. The server prefetch
// and the browser read of a resource must hash to the same key or the browser
// fetches again what the server already put in the HTML, and the Realtime
// listener must write under the same key or its updates land in an entry
// nobody reads. Defining each key once here, and importing it everywhere, is
// what rules that drift out. Never build a key inline anywhere else.
export const queryKeys = {
  /** The project list: the layout's prefetch, ProjectNav, and realtime.ts. */
  projects: ["projects"] as const,
  /**
   * The prefix every runs key starts with. Not a key anything is stored under;
   * it is what realtime.ts hands queryCache.findAll to enumerate the runs
   * entries present in the cache (React Query matches keys by prefix).
   */
  allRuns: ["runs"] as const,
  /**
   * One project's runs, by slug. The slug is part of the hash; the page
   * assembles it once from the `owner` and `repo` params and every caller
   * passes it as is.
   */
  runs: (slug: string) => ["runs", slug] as const,
} as const;
