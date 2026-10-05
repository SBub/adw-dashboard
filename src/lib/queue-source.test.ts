import { describe, expect, it } from "vitest";
import { queueSource } from "./queue-source";

describe("queueSource", () => {
  it("reads a manual item", () => {
    expect(queueSource("manual")).toEqual({ kind: "manual" });
  });

  it("reads a label item with its name", () => {
    expect(queueSource("label:queued")).toEqual({ kind: "label", name: "queued" });
  });

  it("splits at the first colon only, so a label with a colon keeps it", () => {
    expect(queueSource("label:adw:queue")).toEqual({ kind: "label", name: "adw:queue" });
  });

  it("is null for a missing source", () => {
    expect(queueSource(null)).toBeNull();
  });

  it("is null for an empty string", () => {
    expect(queueSource("")).toBeNull();
  });

  it("is null for a label with no name", () => {
    expect(queueSource("label:")).toBeNull();
  });

  it("is null for an unknown string", () => {
    expect(queueSource("webhook")).toBeNull();
    expect(queueSource("Manual")).toBeNull();
  });
});
