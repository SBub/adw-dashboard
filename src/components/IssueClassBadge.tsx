const KNOWN: Record<string, string> = {
  "/feature": "border-violet-300 text-violet-800 dark:border-violet-700 dark:text-violet-300",
  "/bug": "border-rose-300 text-rose-800 dark:border-rose-700 dark:text-rose-300",
  "/chore": "border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-300",
  "/patch": "border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300",
};

const FALLBACK =
  "border-neutral-300 text-neutral-600 dark:border-neutral-600 dark:text-neutral-400";

export function IssueClassBadge({ issueClass }: { issueClass: string | null }) {
  if (!issueClass) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-xs ${KNOWN[issueClass] ?? FALLBACK}`}
    >
      {issueClass}
    </span>
  );
}
