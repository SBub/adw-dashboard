const KNOWN: Record<string, string> = {
  "/feature": "border-violet-300 text-violet-800 dark:border-violet-700 dark:text-violet-300",
  "/bug": "border-fuchsia-300 text-fuchsia-800 dark:border-fuchsia-700 dark:text-fuchsia-300",
  "/chore": "border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-300",
  "/patch": "border-lime-300 text-lime-800 dark:border-lime-700 dark:text-lime-300",
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
