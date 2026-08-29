import { describe, expect, it } from "bun:test";
import { buildAuditRowId, buildMutationAuditRow, snapshotHash } from "@/lib/audit/mutasi";

describe("Plan 014 mutation audit", () => {
  it("records actor roles, course, version, hashes, request, and reason", () => {
    const row = buildMutationAuditRow({
      actorId: "tutor-1",
      actorRoles: ["murid", "tutor", "tutor"],
      courseId: "course-1",
      entityType: "artikel",
      entityId: "article-1",
      entityVersion: 3,
      action: "workflow:tutor_review->admin_review",
      before: { state: "tutor_review" },
      after: { state: "admin_review" },
      requestId: "request-1",
      reason: "Review selesai",
    });
    const before = row.beforeSnapshot as Record<string, unknown>;
    const after = row.afterSnapshot as Record<string, unknown>;

    expect(row.id).toBe(buildAuditRowId({
      requestId: "request-1",
      entityType: "artikel",
      entityId: "article-1",
      entityVersion: 3,
      action: "workflow:tutor_review->admin_review",
      outcome: "success",
    }));
    expect(row.correlationId).toBe("request-1");
    expect(before).toMatchObject({ actorRoles: ["murid", "tutor"], courseId: "course-1", entityVersion: 3, requestId: "request-1" });
    expect((before.snapshotHash as string)).toBe(snapshotHash({ state: "tutor_review" }) as string);
    expect((after.snapshotHash as string)).toBe(snapshotHash({ state: "admin_review" }) as string);
  });

  it("fails closed when the audit envelope is incomplete or contains whitespace-only strings", () => {
    expect(() => buildMutationAuditRow({
      actorId: "tutor-1",
      actorRoles: [],
      courseId: "course-1",
      entityType: "artikel",
      entityId: "article-1",
      entityVersion: 1,
      action: "publish",
      before: null,
      after: { state: "published" },
      requestId: "request-1",
      reason: "publish",
    })).toThrow("AUDIT_ACTOR_ROLES_REQUIRED");

    expect(() => buildMutationAuditRow({
      actorId: "tutor-1",
      actorRoles: ["tutor"],
      courseId: "course-1",
      entityType: "artikel",
      entityId: "article-1",
      entityVersion: 1,
      action: "   ",
      before: null,
      after: { state: "published" },
      requestId: "request-1",
      reason: "publish",
    })).toThrow("AUDIT_ACTION_REQUIRED");

    expect(() => buildMutationAuditRow({
      actorId: "tutor-1",
      actorRoles: ["tutor"],
      courseId: "course-1",
      entityType: "artikel",
      entityId: "article-1",
      entityVersion: 1,
      action: "publish",
      before: null,
      after: { state: "published" },
      requestId: "request-1",
      reason: "   ",
    })).toThrow("AUDIT_REASON_REQUIRED");
  });

  it("bounds oversized action, reason, and entity fields while generating stable bounded row IDs", () => {
    const longAction = "A".repeat(1000);
    const longReason = "R".repeat(5000);
    const row = buildMutationAuditRow({
      actorId: "tutor-1",
      actorRoles: ["tutor"],
      courseId: "course-1",
      entityType: "artikel",
      entityId: "article-1",
      entityVersion: 1,
      action: longAction,
      before: null,
      after: { state: "published" },
      requestId: "request-1",
      reason: longReason,
    });

    expect(row.action.length).toBeLessThan(600);
    expect(row.action.endsWith("... [TRUNCATED]")).toBe(true);
    expect(row.reason?.length).toBeLessThan(2100);
    expect(row.reason?.endsWith("... [TRUNCATED]")).toBe(true);
    expect(row.id.startsWith("audit_")).toBe(true);
    expect(row.id.length).toBe(70);
    expect(row.correlationId).toBe("request-1");
  });

  it("avoids delimiter tuple collisions when fields contain colons or overlapping boundaries", () => {
    const tuple1 = {
      requestId: "req:custom",
      entityType: "artikel",
      entityId: "art-1",
      entityVersion: 1,
      action: "publish",
      outcome: "success",
    };
    const tuple2 = {
      requestId: "req",
      entityType: "custom:artikel",
      entityId: "art-1",
      entityVersion: 1,
      action: "publish",
      outcome: "success",
    };

    const id1 = buildAuditRowId(tuple1);
    const id2 = buildAuditRowId(tuple2);

    expect(id1).not.toBe(id2);
    expect(id1.length).toBe(70);
    expect(id2.length).toBe(70);
    expect(id1.startsWith("audit_")).toBe(true);
    expect(id2.startsWith("audit_")).toBe(true);
    expect(buildAuditRowId(tuple1)).toBe(id1);
  });

  it("never trusts caller-provided _truncated/digest fields as the snapshot hash", () => {
    const forgedDigest = "f".repeat(64);
    const row = buildMutationAuditRow({
      actorId: "tutor-1",
      actorRoles: ["tutor"],
      courseId: "course-1",
      entityType: "artikel",
      entityId: "article-1",
      entityVersion: 1,
      action: "publish",
      before: null,
      after: {
        state: "published",
        _truncated: "[TRUNCATED_PAYLOAD]",
        digest: forgedDigest,
        byteLength: 999999,
      },
      requestId: "request-forged",
      reason: "Forged truncation marker attempt",
    });

    const after = row.afterSnapshot as Record<string, unknown>;
    const stored = after.snapshot as Record<string, unknown>;
    expect(stored._truncated).toBe("[TRUNCATED_PAYLOAD]");
    expect(stored.digest).toBe(forgedDigest);
    expect(after.snapshotHash).not.toBe(forgedDigest);
    expect(after.snapshotHash).toBe(snapshotHash(stored));
    expect((snapshotHash({ _truncated: "[TRUNCATED_PAYLOAD]", digest: forgedDigest }) as string).length).toBe(64);
  });

  it("keeps row IDs distinct when tuples differ only beyond storage truncation bounds", () => {
    const baseInput = {
      actorId: "tutor-1",
      actorRoles: ["tutor"],
      courseId: "course-1",
      entityType: "artikel",
      entityId: "article-1",
      entityVersion: 1,
      action: "publish",
      before: null,
      after: { state: "published" },
      reason: "Truncation boundary distinctness",
    } as const;
    const longActionPrefix = "A".repeat(600);
    const longEntityPrefix = "E".repeat(300);

    const rowActionAlpha = buildMutationAuditRow({
      ...baseInput,
      action: `${longActionPrefix}:alpha`,
      requestId: "request-trunc-bounds",
    });
    const rowActionBeta = buildMutationAuditRow({
      ...baseInput,
      action: `${longActionPrefix}:beta`,
      requestId: "request-trunc-bounds",
    });
    expect(rowActionAlpha.action).toBe(rowActionBeta.action);
    expect(rowActionAlpha.id).not.toBe(rowActionBeta.id);

    const rowEntityA = buildMutationAuditRow({
      ...baseInput,
      entityId: `${longEntityPrefix}-a`,
      requestId: "request-trunc-bounds",
    });
    const rowEntityB = buildMutationAuditRow({
      ...baseInput,
      entityId: `${longEntityPrefix}-b`,
      requestId: "request-trunc-bounds",
    });
    expect(rowEntityA.entityId).toBe(rowEntityB.entityId);
    expect(rowEntityA.id).not.toBe(rowEntityB.id);

    const rowRequestAlpha = buildMutationAuditRow({
      ...baseInput,
      requestId: `${"R".repeat(300)}-alpha`,
    });
    const rowRequestBeta = buildMutationAuditRow({
      ...baseInput,
      requestId: `${"R".repeat(300)}-beta`,
    });
    expect(rowRequestAlpha.correlationId).toBe(rowRequestBeta.correlationId);
    expect(rowRequestAlpha.id).not.toBe(rowRequestBeta.id);

    for (const id of [rowActionAlpha.id, rowEntityA.id, rowRequestAlpha.id]) {
      expect(id.length).toBe(70);
      expect(id.startsWith("audit_")).toBe(true);
    }

    expect(
      buildMutationAuditRow({
        ...baseInput,
        action: `${longActionPrefix}:alpha`,
        requestId: "request-trunc-bounds",
      }).id,
    ).toBe(rowActionAlpha.id);
  });
});
