import { describe, expect, it } from "bun:test";
import { buildMutationAuditRow, snapshotHash } from "@/lib/audit/mutasi";

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

    expect(row.correlationId).toBe("request-1");
    expect(before).toMatchObject({ actorRoles: ["murid", "tutor"], courseId: "course-1", entityVersion: 3, requestId: "request-1" });
    expect((before.snapshotHash as string)).toBe(snapshotHash({ state: "tutor_review" }) as string);
    expect((after.snapshotHash as string)).toBe(snapshotHash({ state: "admin_review" }) as string);
  });

  it("fails closed when the audit envelope is incomplete", () => {
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
  });
});
