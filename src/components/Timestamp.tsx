import { formatTimestamp } from "@/lib/format-date";

/**
 * Renders an ISO 8601 timestamp as "DD.MM.YYYY HH:MM UTC" through
 * formatTimestamp, a pure UTC parse with no locale or time zone of the
 * runtime involved, so server and client markup agree. The <time> element
 * keeps the ISO value in dateTime and title.
 */
export function Timestamp({ value }: { value: string }) {
  return (
    <time dateTime={value} title={value} className="tabular-nums">
      {formatTimestamp(value)}
    </time>
  );
}
