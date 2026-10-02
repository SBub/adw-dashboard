/**
 * Renders an ISO 8601 timestamp as "YYYY-MM-DD HH:MM UTC". It is a plain
 * substring of the input, so server and client markup always agree and no
 * locale or timezone decision is made here.
 */
export function Timestamp({ value }: { value: string }) {
  return (
    <time dateTime={value} title={value} className="tabular-nums">
      {value.slice(0, 10)} {value.slice(11, 16)} UTC
    </time>
  );
}
