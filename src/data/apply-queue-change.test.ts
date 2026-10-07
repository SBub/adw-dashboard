import { describe, expect, it } from "vitest";
import type { ProjectSummary, QueueItem } from "@/types/adw";
import {
  applyQueueChange,
  applyQueueChangeToSummaries,
  type QueueChange,
  queuedIn,
} from "./apply-queue-change";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const OTHER_PROJECT = "22222222-2222-2222-2222-222222222222";

function item(issue: number, overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    project_id: PROJECT,
    issue_number: issue,
    state: "queued",
    source: "label:adw:queued",
    position: issue,
    issue_title: `Issue ${issue}`,
    queued_at: "2026-10-05T09:00:00Z",
    adw_id: null,
    reason: null,
    updated_at: "2026-10-05T09:00:00Z",
    ...overrides,
  };
}

function summary(id: string, overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id,
    slug: `owner/${id.slice(0, 4)}`,
    display_name: id.slice(0, 4),
    repo_url: null,
    is_public: true,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    queued: 2,
    running: 1,
    completed: 2,
    failed: 3,
    last_run_at: "2026-10-02T10:30:00Z",
    ...overrides,
  };
}

const base = {
  schema: "adw",
  table: "queue_items",
  commit_timestamp: "2026-10-05T10:00:00Z",
  errors: [] as string[],
};

function insert(record: QueueItem): QueueChange {
  return { ...base, eventType: "INSERT", new: record, old: {} };
}

// Default replica identity: `old` carries the primary key columns only
function update(record: QueueItem): QueueChange {
  return {
    ...base,
    eventType: "UPDATE",
    new: record,
    old: { project_id: record.project_id, issue_number: record.issue_number },
  };
}

function remove(issue: number, projectId = PROJECT): QueueChange {
  return {
    ...base,
    eventType: "DELETE",
    new: {},
    old: { project_id: projectId, issue_number: issue },
  };
}

const issues = (list: QueueItem[]) => list.map((i) => i.issue_number);

describe("queuedIn", () => {
  it("is undefined for an absent entry", () => {
    expect(queuedIn(undefined, 1)).toBeUndefined();
  });

  it("answers by membership", () => {
    const current = [item(1), item(2)];
    expect(queuedIn(current, 2)).toBe(true);
    expect(queuedIn(current, 3)).toBe(false);
    expect(queuedIn([], 1)).toBe(false);
  });
});

describe("applyQueueChange", () => {
  describe("INSERT", () => {
    it("lands a queued item in position order between two others", () => {
      const current = [item(1, { position: 0 }), item(3, { position: 2 })];
      const next = applyQueueChange(current, insert(item(2, { position: 1 })));

      expect(issues(next)).toEqual([1, 2, 3]);
      expect(issues(current)).toEqual([1, 3]);
    });

    it("ignores an item that is not queued", () => {
      const current = [item(1)];
      expect(applyQueueChange(current, insert(item(2, { state: "running" })))).toBe(current);
    });

    it("is a no-op for a duplicate", () => {
      const current = [item(1)];
      expect(applyQueueChange(current, insert(item(1)))).toBe(current);
    });
  });

  describe("UPDATE", () => {
    it("removes an item that started", () => {
      const current = [item(1), item(2)];
      const next = applyQueueChange(current, update(item(1, { state: "running" })));

      expect(issues(next)).toEqual([2]);
    });

    it("reorders on a move", () => {
      const current = [
        item(1, { position: 0 }),
        item(2, { position: 1 }),
        item(3, { position: 2 }),
      ];
      const next = applyQueueChange(current, update(item(3, { position: -1 })));

      expect(issues(next)).toEqual([3, 1, 2]);
    });

    it("replaces the item in place with the new row", () => {
      const current = [item(1), item(2)];
      const next = applyQueueChange(current, update(item(2, { issue_title: "Renamed" })));

      expect(issues(next)).toEqual([1, 2]);
      expect(next.map((i) => i.issue_title)).toEqual(["Issue 1", "Renamed"]);
    });

    it("adds a queued item that is not in the list", () => {
      const current = [item(1)];
      const next = applyQueueChange(current, update(item(2, { position: 0 })));

      expect(issues(next)).toEqual([2, 1]);
    });

    it("returns the input when a non-queued item is absent", () => {
      const current = [item(1)];
      expect(applyQueueChange(current, update(item(2, { state: "merged" })))).toBe(current);
    });
  });

  describe("DELETE", () => {
    it("removes by issue_number", () => {
      const current = [item(1), item(2)];
      expect(issues(applyQueueChange(current, remove(1)))).toEqual([2]);
    });

    it("returns the input when the item is absent", () => {
      const current = [item(1)];
      expect(applyQueueChange(current, remove(9))).toBe(current);
    });

    it("returns the input when old carries no issue_number", () => {
      const current = [item(1)];
      const ev: QueueChange = { ...base, eventType: "DELETE", new: {}, old: {} };
      expect(applyQueueChange(current, ev)).toBe(current);
    });
  });

  it("falls back to issue_number on equal positions", () => {
    const current = [item(5, { position: 1 })];
    const next = applyQueueChange(current, insert(item(4, { position: 1 })));

    expect(issues(next)).toEqual([4, 5]);
  });

  it("never mutates its input", () => {
    const current = Object.freeze([
      Object.freeze(item(1, { position: 0 })),
      Object.freeze(item(2, { position: 1 })),
    ]) as QueueItem[];

    applyQueueChange(current, insert(item(3, { position: 0 })));
    applyQueueChange(current, update(item(2, { position: -1 })));
    applyQueueChange(current, update(item(1, { state: "running" })));
    applyQueueChange(current, remove(1));

    expect(issues(current)).toEqual([1, 2]);
  });
});

describe("applyQueueChangeToSummaries", () => {
  const list = () => [summary(PROJECT), summary(OTHER_PROJECT)];
  const queuedOf = (current: ProjectSummary[], id = PROJECT) =>
    current.find((project) => project.id === id)?.queued;

  it("counts an INSERT of a queued item with an unknown previous state", () => {
    expect(queuedOf(applyQueueChangeToSummaries(list(), insert(item(9)), undefined))).toBe(3);
  });

  it("leaves the list for an INSERT of a non-queued item", () => {
    const current = list();
    const ev = insert(item(9, { state: "running" }));
    expect(applyQueueChangeToSummaries(current, ev, undefined)).toBe(current);
  });

  it("drops the count when a queued item starts", () => {
    const ev = update(item(1, { state: "running" }));
    expect(queuedOf(applyQueueChangeToSummaries(list(), ev, true))).toBe(1);
  });

  it("raises the count when an item is re-queued", () => {
    expect(queuedOf(applyQueueChangeToSummaries(list(), update(item(1)), false))).toBe(3);
  });

  it("leaves the list for an UPDATE with an unknown previous state", () => {
    const current = list();
    const ev = update(item(1, { state: "running" }));
    expect(applyQueueChangeToSummaries(current, ev, undefined)).toBe(current);
  });

  it("leaves the list for the every-save upsert of a queued item", () => {
    const current = list();
    expect(applyQueueChangeToSummaries(current, update(item(1)), true)).toBe(current);
  });

  it("drops the count on a DELETE of a queued item", () => {
    expect(queuedOf(applyQueueChangeToSummaries(list(), remove(1), true))).toBe(1);
  });

  it("leaves the list for a DELETE with an unknown previous state", () => {
    const current = list();
    expect(applyQueueChangeToSummaries(current, remove(1), undefined)).toBe(current);
  });

  it("never goes below 0", () => {
    const current = [summary(PROJECT, { queued: 0 })];
    expect(queuedOf(applyQueueChangeToSummaries(current, remove(1), true))).toBe(0);
  });

  it("leaves other projects and the other counts untouched", () => {
    const current = list();
    const next = applyQueueChangeToSummaries(current, insert(item(9)), undefined);

    const [touched, other] = next;
    expect(other).toBe(current[1]);
    expect(touched).toEqual({ ...current[0], queued: 3 });
  });

  it("returns the input for a project not in the list", () => {
    const current = [summary(OTHER_PROJECT)];
    expect(applyQueueChangeToSummaries(current, insert(item(9)), undefined)).toBe(current);
  });
});
