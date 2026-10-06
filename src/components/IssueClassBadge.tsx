import { CLASS_COLORS } from "@/lib/class-colors";
import type { ClassKey } from "@/types/adw";

export function IssueClassBadge({ issueClass }: { issueClass: string | null }) {
  if (!issueClass) return null;
  const colors = Object.hasOwn(CLASS_COLORS, issueClass)
    ? CLASS_COLORS[issueClass as ClassKey]
    : CLASS_COLORS.other;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-xs ${colors.badge}`}
    >
      {issueClass}
    </span>
  );
}
