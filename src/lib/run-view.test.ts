import { describe, expect, it } from "vitest";
import { durationLabel } from "./run-view";

// The module under test never reads the clock, so nothing here depends on
// when the suite runs; every case is two fixed timestamps.
describe("durationLabel", () => {
  it("is null while finished_at is null", () => {
    expect(durationLabel("2026-10-02T11:31:04Z", null)).toBeNull();
  });

  it("measures started_at to finished_at in minutes and seconds under an hour", () => {
    expect(durationLabel("2026-10-01T14:02:11Z", "2026-10-01T14:49:37Z")).toBe("47m 26s");
  });

  it("switches to hours and zero-padded minutes from one hour up", () => {
    expect(durationLabel("2026-10-01T14:00:00Z", "2026-10-01T15:03:59Z")).toBe("1h 03m");
  });

  it("does not cap hours at a day", () => {
    expect(durationLabel("2026-09-30T10:00:00Z", "2026-10-02T11:12:00Z")).toBe("49h 12m");
  });

  it("zero-pads seconds under a minute boundary", () => {
    expect(durationLabel("2026-10-02T11:00:00Z", "2026-10-02T11:08:05Z")).toBe("8m 05s");
  });

  it("clamps a negative span to zero", () => {
    expect(durationLabel("2026-10-02T12:30:00Z", "2026-10-02T12:00:00Z")).toBe("0m 00s");
  });
});
