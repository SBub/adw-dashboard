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
   * One project's runs, by slug. The slug is part of the hash, so both sides
   * must join it the same way (`parts.join("/")`, as the page does).
   */
  runs: (slug: string) => ["runs", slug] as const,
} as const;
