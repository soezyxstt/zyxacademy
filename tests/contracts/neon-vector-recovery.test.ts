import { describe, expect, test } from "bun:test";
import { combineRecoveryItems, matchesRecoveryVector, recoveryItem, runRecoveryBatches } from "../../scripts/neon/recover-vector-backlog";

function fixture(namespace = "canonical_ideas", action: "upsert" | "delete" = "upsert") {
  const row = { id: "row-1", namespace, action, courseId: "course-1", status: "failed", attempts: 10, leaseId: null,
    updatedAt: "2026-11-10", lastError: "historical failure", payload: { entityId: "entity-1", version: 1, text: "Old content", title: "Old title", metadata: { status: "published" } } };
  const source = { id: "entity-1", courseId: "course-1", version: 1, status: "published", title: "Current title", text: "Current content", chapterId: "chapter-1", eligible: true };
  return { row, source };
}

describe("production vector recovery planning", () => {
  test("overlaps at most four batches and settles every started batch before failing", async () => {
    let active = 0, maximum = 0, settled = 0;
    const offsets: number[] = [];
    await expect(runRecoveryBatches(250, async offset => {
      offsets.push(offset); active++; maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--; settled++;
      if (offset === 50) throw new Error("controlled failure");
    })).rejects.toThrow("controlled failure");
    expect(maximum).toBe(4); expect(active).toBe(0); expect(settled).toBe(4);
    expect(offsets).toEqual([0, 50, 100, 150]);
  });
  test("uses current source content and retains the original failed row", () => {
    const { row, source } = fixture();
    const item = recoveryItem(row, source);
    expect(item.outbox.operation).toBe("upsert");
    if (item.outbox.operation !== "upsert") throw new Error("Expected upsert");
    expect(item.outbox.content).toBe("Current content");
    expect((item.rows[0].payload as { text: string }).text).toBe("Old content");
    expect(item.rows[0].attempts).toBe(10);
    const vector = { id: item.outbox.vectorId, values: Array(768).fill(0.2), metadata: item.outbox.metadata };
    expect(matchesRecoveryVector(item, vector)).toBe(true);
    expect(matchesRecoveryVector(item, { ...vector, values: Array(767).fill(0.2) })).toBe(false);
    expect(matchesRecoveryVector(item, { ...vector, metadata: { ...vector.metadata, contentHash: "wrong" } })).toBe(false);
    expect(matchesRecoveryVector(item)).toBe(false);
  });

  test("stale version only deletes its original vector identity", () => {
    const { row, source } = fixture();
    const item = recoveryItem(row, { ...source, version: 2 });
    expect(item.outbox.operation).toBe("delete");
    expect(item.outbox.version).toBe(1);
    expect(item.reason).toBe("superseded-version");
    expect(matchesRecoveryVector(item)).toBe(true);
  });

  test("withdrawn article upsert and delete become one verified deletion", () => {
    const { row, source } = fixture("published_articles");
    const withdrawn = { ...source, status: "withdrawn" };
    const combined = combineRecoveryItems([recoveryItem(row, withdrawn), recoveryItem({ ...row, id: "row-2", action: "delete" }, withdrawn)]);
    expect(combined).toHaveLength(1);
    expect(combined[0].rows).toHaveLength(2);
    expect(combined[0].outbox.operation).toBe("delete");
    expect(row.action).toBe("upsert");
  });

  test("fails closed on wrong course, version regression or live delete", () => {
    const { row, source } = fixture();
    expect(() => recoveryItem(row, { ...source, courseId: "other" })).toThrow("RECOVERY_COURSE_MISMATCH");
    expect(() => recoveryItem({ ...row, payload: { ...row.payload, version: 2 } }, source)).toThrow("RECOVERY_VERSION_REGRESSION");
    expect(() => recoveryItem({ ...row, action: "delete" }, source)).toThrow("RECOVERY_ACTIVE_DELETE_CONFLICT");
  });
});
