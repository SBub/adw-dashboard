import { STATUS_COLORS, type StatusKey } from "@/lib/status-colors";

export function StatusBadge({ status }: { status: StatusKey }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status].badge}`}
    >
      {status === "running" && (
        <span className="relative flex size-2">
          <span
            className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${STATUS_COLORS.running.dot}`}
          />
          <span
            className={`relative inline-flex size-2 rounded-full ${STATUS_COLORS.running.dot}`}
          />
        </span>
      )}
      {status}
    </span>
  );
}
