import { describe, expect, it } from "vitest";
import { formatDay, formatTimestamp } from "./format-date";

// The module under test never reads the clock and uses only UTC getters, so
// nothing here depends on when or in which time zone the suite runs.
describe("formatTimestamp", () => {
  it("formats a UTC value as DD.MM.YYYY HH:MM UTC", () => {
    expect(formatTimestamp("2026-10-03T14:51:07Z")).toBe("03.10.2026 14:51 UTC");
  });

  it("parses the Supabase shape with microseconds and an offset", () => {
    expect(formatTimestamp("2026-10-03T14:51:07.123456+00:00")).toBe("03.10.2026 14:51 UTC");
  });

  it("renders midnight as 00:00", () => {
    expect(formatTimestamp("2026-12-25T00:00:00Z")).toBe("25.12.2026 00:00 UTC");
  });

  it("zero-pads a single-digit day, month, hour and minute", () => {
    expect(formatTimestamp("2026-01-05T09:07:00Z")).toBe("05.01.2026 09:07 UTC");
  });

  it("converts a non-UTC offset to UTC across a day boundary", () => {
    expect(formatTimestamp("2026-03-01T01:30:00+02:00")).toBe("28.02.2026 23:30 UTC");
  });

  it("returns an unparseable input unchanged", () => {
    expect(formatTimestamp("not a date")).toBe("not a date");
  });
});

describe("formatDay", () => {
  it("formats a calendar date as DD.MM.YYYY", () => {
    expect(formatDay("2026-10-05")).toBe("05.10.2026");
  });

  it("keeps the day whatever the runtime time zone (date-only input is UTC)", () => {
    expect(formatDay("2026-01-01")).toBe("01.01.2026");
  });

  it("returns an unparseable input unchanged", () => {
    expect(formatDay("someday")).toBe("someday");
  });
});
