// Formats a stored ISO 8601 timestamp for display. Pure: it parses the input
// and reads the parts with the UTC getters, so the result depends only on the
// string, never on the clock, the locale or the time zone of the runtime.
// Server HTML and client hydration therefore always agree. No toLocaleString
// and no Intl: both would let the runtime decide the output.

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * "DD.MM.YYYY HH:MM UTC" (24-hour clock). An input with a non-zero offset is
 * converted to UTC. An unparseable input is returned unchanged.
 */
export function formatTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const date = new Date(ms);
  const day = pad2(date.getUTCDate());
  const month = pad2(date.getUTCMonth() + 1);
  const year = date.getUTCFullYear();
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());
  return `${day}.${month}.${year} ${hours}:${minutes} UTC`;
}

/**
 * A calendar date "YYYY-MM-DD" (the summary view's UTC day) as "DD.MM.YYYY",
 * through the same parse and UTC getters. An unparseable input is returned
 * unchanged.
 */
export function formatDay(day: string): string {
  const ms = Date.parse(day);
  if (Number.isNaN(ms)) return day;
  const date = new Date(ms);
  return `${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
}
