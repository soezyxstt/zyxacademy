import { describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import {
  buildAuditRowId,
  buildTutorMutationAuditRow,
  isSensitiveKey,
  recordTutorMutationAudit,
  sanitizeSnapshot,
  snapshotHash,
  type TutorMutationAuditInput,
} from "@/lib/audit/mutasi";

async function createAuditTestDb() {
  const client = createClient({ url: ":memory:" });
  const testDb = drizzle(client, { schema });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      role TEXT DEFAULT 'student',
      last_activity_at INTEGER
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS pengguna (
      id TEXT PRIMARY KEY REFERENCES user(id),
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS audit_mutasi (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES pengguna(id) ON DELETE SET NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_snapshot TEXT,
      after_snapshot TEXT,
      correlation_id TEXT,
      course_id TEXT,
      outcome TEXT,
      reason TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  return { client, testDb };
}

describe("Tutor Mutation Audit Contract", () => {
  it("builds a complete tutor mutation audit row with sanitized envelopes and root filtering columns", () => {
    const input: TutorMutationAuditInput = {
      actorId: "usr-tutor-1",
      actorRoles: ["tutor"],
      courseId: "mk-physics-1",
      entityType: "artikel",
      entityId: "art-101",
      entityVersion: 2,
      action: "workflow:tutor_review->changes_requested",
      outcome: "rejected",
      requestId: "req-audit-123",
      reason: "Catatan rumus belum lengkap",
      before: {
        state: "tutor_review",
        title: "Hukum Newton",
        password: "super-secret-password",
        nested: {
          apiKey: "sk-live-secret-key",
          authorName: "Pak Budi",
        },
      },
      after: {
        state: "changes_requested",
        title: "Hukum Newton",
        authToken: "bearer-token-val",
        feedback: "Perbaiki bagian gaya gesek",
      },
    };

    const row = buildTutorMutationAuditRow(input);

    expect(row.id).toBe(buildAuditRowId({
      requestId: "req-audit-123",
      entityType: "artikel",
      entityId: "art-101",
      entityVersion: 2,
      action: "workflow:tutor_review->changes_requested",
      outcome: "rejected",
    }));
    expect(row.actorId).toBe("usr-tutor-1");
    expect(row.entityType).toBe("artikel");
    expect(row.entityId).toBe("art-101");
    expect(row.action).toBe("workflow:tutor_review->changes_requested");
    expect(row.correlationId).toBe("req-audit-123");
    expect(row.courseId).toBe("mk-physics-1");
    expect(row.outcome).toBe("rejected");
    expect(row.reason).toBe("Catatan rumus belum lengkap");

    const before = row.beforeSnapshot as Record<string, unknown>;
    const after = row.afterSnapshot as Record<string, unknown>;

    expect(before.auditSchemaVersion).toBe("content-workflow-v1");
    expect(before.actorRoles).toEqual(["tutor"]);
    expect(before.courseId).toBe("mk-physics-1");
    expect(before.entityVersion).toBe(2);
    expect(before.requestId).toBe("req-audit-123");
    expect(before.reason).toBe("Catatan rumus belum lengkap");
    expect(before.outcome).toBe("rejected");

    const beforePayload = before.snapshot as Record<string, unknown>;
    expect(beforePayload.title).toBe("Hukum Newton");
    expect(beforePayload.password).toBe("[REDACTED]");
    expect((beforePayload.nested as Record<string, unknown>).apiKey).toBe("[REDACTED]");
    expect((beforePayload.nested as Record<string, unknown>).authorName).toBe("Pak Budi");

    const afterPayload = after.snapshot as Record<string, unknown>;
    expect(afterPayload.authToken).toBe("[REDACTED]");
    expect(afterPayload.feedback).toBe("Perbaiki bagian gaya gesek");

    // Hashes match sanitized payloads
    expect(before.snapshotHash).toBe(snapshotHash(beforePayload));
    expect(after.snapshotHash).toBe(snapshotHash(afterPayload));
  });

  it("distinguishes different action and outcome events sharing request/entity/version while remaining idempotent", () => {
    const baseInput: TutorMutationAuditInput = {
      actorId: "usr-tutor-1",
      actorRoles: ["tutor"],
      courseId: "mk-physics-1",
      entityType: "artikel",
      entityId: "art-101",
      entityVersion: 2,
      action: "workflow:tutor_review->changes_requested",
      outcome: "rejected",
      requestId: "req-audit-123",
      reason: "Catatan rumus belum lengkap",
      before: { state: "tutor_review" },
      after: { state: "changes_requested" },
    };

    const rowRejected = buildTutorMutationAuditRow(baseInput);
    const rowApproved = buildTutorMutationAuditRow({
      ...baseInput,
      action: "workflow:tutor_review->approved",
      outcome: "success",
      reason: "Disetujui",
      after: { state: "approved" },
    });
    const rowFailed = buildTutorMutationAuditRow({
      ...baseInput,
      action: "workflow:tutor_review->approved",
      outcome: "failed",
      reason: "Gagal memproses",
      after: { state: "failed" },
    });

    // Distinct events with same request/entity/version produce distinct hashed IDs
    expect(rowRejected.id).toBe(buildAuditRowId({
      requestId: "req-audit-123",
      entityType: "artikel",
      entityId: "art-101",
      entityVersion: 2,
      action: "workflow:tutor_review->changes_requested",
      outcome: "rejected",
    }));
    expect(rowApproved.id).toBe(buildAuditRowId({
      requestId: "req-audit-123",
      entityType: "artikel",
      entityId: "art-101",
      entityVersion: 2,
      action: "workflow:tutor_review->approved",
      outcome: "success",
    }));
    expect(rowFailed.id).toBe(buildAuditRowId({
      requestId: "req-audit-123",
      entityType: "artikel",
      entityId: "art-101",
      entityVersion: 2,
      action: "workflow:tutor_review->approved",
      outcome: "failed",
    }));
    expect(rowRejected.id).not.toBe(rowApproved.id);
    expect(rowApproved.id).not.toBe(rowFailed.id);
    expect(rowRejected.id).not.toBe(rowFailed.id);

    // Exact same event input produces identical ID (idempotency)
    const rowRejectedAgain = buildTutorMutationAuditRow(baseInput);
    expect(rowRejectedAgain.id).toBe(rowRejected.id);
  });

  it("recursively sanitizes sensitive keys and protects non-sensitive keys", () => {
    expect(isSensitiveKey("password")).toBe(true);
    expect(isSensitiveKey("secretToken")).toBe(true);
    expect(isSensitiveKey("apiKey")).toBe(true);
    expect(isSensitiveKey("api_key")).toBe(true);
    expect(isSensitiveKey("authorization")).toBe(true);
    expect(isSensitiveKey("cookie")).toBe(true);
    expect(isSensitiveKey("private_key")).toBe(true);
    expect(isSensitiveKey("creditCard")).toBe(true);

    expect(isSensitiveKey("title")).toBe(false);
    expect(isSensitiveKey("author")).toBe(false);
    expect(isSensitiveKey("courseId")).toBe(false);
    expect(isSensitiveKey("contentMarkdown")).toBe(false);
    expect(isSensitiveKey("state")).toBe(false);

    const dirtyData = {
      user: {
        name: "Ahmad",
        password: "raw_password",
        tokens: ["token-1", "token-2"],
        metadata: {
          client_secret: "secret-xyz",
          active: true,
        },
      },
    };

    const cleaned = sanitizeSnapshot(dirtyData) as Record<string, unknown>;
    const user = cleaned.user as Record<string, unknown>;
    expect(user.name).toBe("Ahmad");
    expect(user.password).toBe("[REDACTED]");
    expect((user.metadata as Record<string, unknown>).client_secret).toBe("[REDACTED]");
    expect((user.metadata as Record<string, unknown>).active).toBe(true);
  });

  it("truncates oversized strings, large arrays, excessive object nesting, and huge flat object keys", () => {
    const longString = "A".repeat(5000);
    const sanitizedString = sanitizeSnapshot(longString, { maxStringLength: 100 }) as string;
    expect(sanitizedString.length).toBeLessThan(150);
    expect(sanitizedString.endsWith("... [TRUNCATED]")).toBe(true);

    const largeArray = Array.from({ length: 150 }, (_, i) => i);
    const sanitizedArray = sanitizeSnapshot(largeArray, { maxArrayLength: 50 }) as unknown[];
    expect(sanitizedArray.length).toBe(51);
    expect(sanitizedArray[50]).toBe("[TRUNCATED_100_ITEMS]");

    // Deep nesting
    let deeplyNested: any = { value: "deep" };
    for (let i = 0; i < 15; i += 1) {
      deeplyNested = { child: deeplyNested };
    }
    const sanitizedNesting = sanitizeSnapshot(deeplyNested, { maxDepth: 5 }) as Record<string, unknown>;
    let current: any = sanitizedNesting;
    let depthCount = 0;
    while (current && typeof current === "object" && current.child) {
      current = current.child;
      depthCount += 1;
    }
    expect(current).toBe("[TRUNCATED_NESTING]");

    // Huge flat object with many keys
    const hugeFlatObject: Record<string, unknown> = {};
    for (let i = 0; i < 150; i += 1) {
      hugeFlatObject[`key_${i}`] = `value_${i}`;
    }
    hugeFlatObject.apiKey = "super-secret-key";
    const sanitizedKeys = sanitizeSnapshot(hugeFlatObject, { maxObjectKeys: 50 }) as Record<string, unknown>;
    expect(Object.keys(sanitizedKeys).length).toBe(51); // 50 keys + _truncatedKeys
    expect(sanitizedKeys._truncatedKeys).toBe("[TRUNCATED_101_KEYS]");
  });

  it("bounds total stored snapshot payload with safe truncation marker and digest while preserving secret redaction", () => {
    // Construct a snapshot that exceeds maxTotalBytes
    const largeObject: Record<string, unknown> = {
      password: "my-plain-password",
      title: "Introduction to Calculus",
    };
    for (let i = 0; i < 80; i += 1) {
      largeObject[`section_${i}`] = "X".repeat(500);
    }

    const bounded = sanitizeSnapshot(largeObject, { maxTotalBytes: 1024 }) as Record<string, unknown>;
    expect(bounded._truncated).toBe("[TRUNCATED_PAYLOAD]");
    expect(typeof bounded.digest).toBe("string");
    expect((bounded.digest as string).length).toBe(64); // SHA-256 hex digest
    expect(typeof bounded.byteLength).toBe("number");
    expect((bounded.byteLength as number)).toBeGreaterThan(1024);

    // Verify buildTutorMutationAuditRow handles bounded payloads in envelope and snapshotHash
    const input: TutorMutationAuditInput = {
      actorId: "usr-tutor-1",
      actorRoles: ["tutor"],
      courseId: "mk-physics-1",
      entityType: "artikel",
      entityId: "art-101",
      entityVersion: 1,
      action: "publish",
      outcome: "success",
      requestId: "req-large-payload-1",
      reason: "Large content published",
      after: largeObject,
    };

    const row = buildTutorMutationAuditRow(input);
    const after = row.afterSnapshot as Record<string, unknown>;
    expect(after.snapshot).toBeDefined();
    // Default maxTotalBytes is 65536; let's test building row with oversized payload (> 65536)
    const veryLargeObject: Record<string, unknown> = {
      secretToken: "secret-12345",
      title: "Deep Physics",
    };
    for (let i = 0; i < 90; i += 1) {
      veryLargeObject[`chunk_${i}`] = "Y".repeat(1000);
    }
    const largeRow = buildTutorMutationAuditRow({
      ...input,
      requestId: "req-huge-payload-2",
      after: veryLargeObject,
    });
    const largeAfter = largeRow.afterSnapshot as Record<string, unknown>;
    const largeSnapshot = largeAfter.snapshot as Record<string, unknown>;
    expect(largeSnapshot._truncated).toBe("[TRUNCATED_PAYLOAD]");
    // snapshotHash is always recomputed over the exact stored sanitized value;
    // the embedded truncation digest is inert provenance, never authoritative.
    expect(largeAfter.snapshotHash).toBe(snapshotHash(largeSnapshot));
    expect(largeAfter.snapshotHash).not.toBe(largeSnapshot.digest);
    expect(typeof largeAfter.snapshotHash).toBe("string");
  });

  it("never trusts caller-provided _truncated/digest fields as the snapshot hash", () => {
    const forgedDigest = "f".repeat(64);
    const input: TutorMutationAuditInput = {
      actorId: "usr-tutor-1",
      actorRoles: ["tutor"],
      courseId: "mk-physics-1",
      entityType: "artikel",
      entityId: "art-101",
      entityVersion: 1,
      action: "publish",
      outcome: "success",
      requestId: "req-forged-digest",
      reason: "Forged truncation marker attempt",
      after: {
        state: "published",
        _truncated: "[TRUNCATED_PAYLOAD]",
        digest: forgedDigest,
        byteLength: 999999,
      },
    };

    expect(snapshotHash(input.after as Record<string, unknown>)).not.toBe(forgedDigest);

    const row = buildTutorMutationAuditRow(input);
    const after = row.afterSnapshot as Record<string, unknown>;
    const stored = after.snapshot as Record<string, unknown>;
    expect(stored.digest).toBe(forgedDigest);
    expect(after.snapshotHash).not.toBe(forgedDigest);
    expect(after.snapshotHash).toBe(snapshotHash(stored));
  });

  it("keeps tutor audit row IDs distinct when tuples differ only beyond storage truncation bounds", () => {
    const baseInput: TutorMutationAuditInput = {
      actorId: "usr-tutor-1",
      actorRoles: ["tutor"],
      courseId: "mk-physics-1",
      entityType: "artikel",
      entityId: "art-101",
      entityVersion: 2,
      action: "publish",
      outcome: "success",
      requestId: "req-trunc-bounds",
      reason: "Truncation boundary distinctness",
    };
    const longActionPrefix = "A".repeat(600);
    const longEntityPrefix = "E".repeat(300);

    const rowActionAlpha = buildTutorMutationAuditRow({
      ...baseInput,
      action: `${longActionPrefix}:alpha`,
    });
    const rowActionBeta = buildTutorMutationAuditRow({
      ...baseInput,
      action: `${longActionPrefix}:beta`,
    });
    expect(rowActionAlpha.action).toBe(rowActionBeta.action);
    expect(rowActionAlpha.id).not.toBe(rowActionBeta.id);

    const rowEntityA = buildTutorMutationAuditRow({
      ...baseInput,
      entityId: `${longEntityPrefix}-a`,
    });
    const rowEntityB = buildTutorMutationAuditRow({
      ...baseInput,
      entityId: `${longEntityPrefix}-b`,
    });
    expect(rowEntityA.entityId).toBe(rowEntityB.entityId);
    expect(rowEntityA.id).not.toBe(rowEntityB.id);

    const longRequestAlpha = `${"R".repeat(300)}-alpha`;
    const longRequestBeta = `${"R".repeat(300)}-beta`;
    const rowRequestAlpha = buildTutorMutationAuditRow({
      ...baseInput,
      requestId: longRequestAlpha,
    });
    const rowRequestBeta = buildTutorMutationAuditRow({
      ...baseInput,
      requestId: longRequestBeta,
    });
    expect(rowRequestAlpha.correlationId).toBe(rowRequestBeta.correlationId);
    expect(rowRequestAlpha.id).not.toBe(rowRequestBeta.id);

    expect(
      buildTutorMutationAuditRow({ ...baseInput, action: `${longActionPrefix}:alpha` }).id,
    ).toBe(rowActionAlpha.id);
  });

  it("fails closed on every missing required tutor audit field", () => {
    const validBase: TutorMutationAuditInput = {
      actorId: "usr-1",
      actorRoles: ["tutor"],
      courseId: "mk-1",
      entityType: "artikel",
      entityId: "art-1",
      entityVersion: 1,
      action: "approve",
      outcome: "success",
      requestId: "req-1",
      reason: "Approved content",
    };

    expect(() => buildTutorMutationAuditRow({ ...validBase, actorId: "" })).toThrow("AUDIT_ACTOR_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, actorRoles: [] })).toThrow("AUDIT_ACTOR_ROLES_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, actorRoles: ["murid"] })).toThrow("AUDIT_TUTOR_OR_ADMIN_ROLE_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, actorRoles: ["student", "guest"] })).toThrow("AUDIT_TUTOR_OR_ADMIN_ROLE_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, courseId: "   " })).toThrow("AUDIT_COURSE_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, entityType: "" })).toThrow("AUDIT_ENTITY_TYPE_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, entityId: "" })).toThrow("AUDIT_ENTITY_ID_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, entityVersion: 0 })).toThrow("AUDIT_ENTITY_VERSION_INVALID");
    expect(() => buildTutorMutationAuditRow({ ...validBase, action: "" })).toThrow("AUDIT_ACTION_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, outcome: "" as any })).toThrow("AUDIT_OUTCOME_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, outcome: "pending" as any })).toThrow("AUDIT_OUTCOME_INVALID");
    expect(() => buildTutorMutationAuditRow({ ...validBase, requestId: "" })).toThrow("AUDIT_REQUEST_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, reason: "" })).toThrow("AUDIT_REASON_REQUIRED");
  });

  it("accepts tutor and admin actor roles in buildTutorMutationAuditRow", () => {
    const validBase: TutorMutationAuditInput = {
      actorId: "usr-1",
      actorRoles: ["tutor"],
      courseId: "mk-1",
      entityType: "artikel",
      entityId: "art-1",
      entityVersion: 1,
      action: "approve",
      outcome: "success",
      requestId: "req-1",
      reason: "Approved content",
    };

    expect(() => buildTutorMutationAuditRow({ ...validBase, actorRoles: ["tutor"] })).not.toThrow();
    expect(() => buildTutorMutationAuditRow({ ...validBase, actorRoles: ["admin"] })).not.toThrow();
    expect(() => buildTutorMutationAuditRow({ ...validBase, actorRoles: ["murid", "tutor"] })).not.toThrow();
    expect(() => buildTutorMutationAuditRow({ ...validBase, actorRoles: ["ADMIN"] })).not.toThrow();
  });

  it("writes audit records using a transaction-aware executor", async () => {
    const { client, testDb } = await createAuditTestDb();
    try {
      const now = new Date();
      await testDb.insert(schema.user).values({
        id: "usr-tutor-tx",
        name: "Tutor TX",
        email: "tutortx@zyx.test",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor-tx",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      const auditInput: TutorMutationAuditInput = {
        actorId: "usr-tutor-tx",
        actorRoles: ["tutor"],
        courseId: "mk-math-1",
        entityType: "soal",
        entityId: "soal-101",
        entityVersion: 1,
        action: "workflow:tutor_review->approved",
        outcome: "success",
        requestId: "req-tx-999",
        reason: "Validasi selesai dan disetujui",
        before: { state: "tutor_review" },
        after: { state: "approved" },
      };

      // Standalone write
      const rowDirect = await recordTutorMutationAudit(auditInput, testDb);
      expect(rowDirect.id).toBe(buildAuditRowId({
        requestId: "req-tx-999",
        entityType: "soal",
        entityId: "soal-101",
        entityVersion: 1,
        action: "workflow:tutor_review->approved",
        outcome: "success",
      }));

      const rowsDirect = await testDb.select().from(schema.auditMutasi);
      expect(rowsDirect.length).toBe(1);
      expect(rowsDirect[0].courseId).toBe("mk-math-1");
      expect(rowsDirect[0].outcome).toBe("success");
      expect(rowsDirect[0].reason).toBe("Validasi selesai dan disetujui");

      // Custom transaction mock write
      let txCalled = false;
      const mockTx = {
        insert: (table: any) => ({
          values: async (val: any) => {
            txCalled = true;
            expect(table).toBe(schema.auditMutasi);
            expect(val.courseId).toBe("mk-math-1");
            return val;
          },
        }),
      };
      const rowTx = await recordTutorMutationAudit(
        { ...auditInput, requestId: "req-tx-1000", entityVersion: 2 },
        mockTx as any,
      );
      expect(txCalled).toBe(true);
      expect(rowTx.id).toBe(buildAuditRowId({
        requestId: "req-tx-1000",
        entityType: "soal",
        entityId: "soal-101",
        entityVersion: 2,
        action: "workflow:tutor_review->approved",
        outcome: "success",
      }));
    } finally {
      client.close();
    }
  });

  it("bounds oversized action and reason fields while generating stable 70-character audit row IDs", () => {
    const longAction = "workflow:action:".concat("Z".repeat(1200));
    const longReason = "Detailed reason: ".concat("Y".repeat(6000));
    const input: TutorMutationAuditInput = {
      actorId: "usr-1",
      actorRoles: ["tutor"],
      courseId: "mk-1",
      entityType: "artikel",
      entityId: "art-1",
      entityVersion: 1,
      action: longAction,
      outcome: "success",
      requestId: "req-long-test",
      reason: longReason,
    };

    const row = buildTutorMutationAuditRow(input);
    expect(row.action.length).toBeLessThan(600);
    expect(row.action.endsWith("... [TRUNCATED]")).toBe(true);
    expect(row.reason?.length).toBeLessThan(2100);
    expect(row.reason?.endsWith("... [TRUNCATED]")).toBe(true);
    expect(row.id.startsWith("audit_")).toBe(true);
    expect(row.id.length).toBe(70);
    expect(row.correlationId).toBe("req-long-test");

    const after = row.afterSnapshot as Record<string, unknown>;
    expect(after.reason).toBe(row.reason);
    expect(after.requestId).toBe("req-long-test");
  });

  it("fails closed on whitespace-only strings for required fields", () => {
    const validBase: TutorMutationAuditInput = {
      actorId: "usr-1",
      actorRoles: ["tutor"],
      courseId: "mk-1",
      entityType: "artikel",
      entityId: "art-1",
      entityVersion: 1,
      action: "approve",
      outcome: "success",
      requestId: "req-1",
      reason: "Approved content",
    };

    expect(() => buildTutorMutationAuditRow({ ...validBase, actorId: "   " })).toThrow("AUDIT_ACTOR_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, courseId: " \t\n " })).toThrow("AUDIT_COURSE_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, entityType: "   " })).toThrow("AUDIT_ENTITY_TYPE_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, entityId: "   " })).toThrow("AUDIT_ENTITY_ID_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, action: "   " })).toThrow("AUDIT_ACTION_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, requestId: "   " })).toThrow("AUDIT_REQUEST_REQUIRED");
    expect(() => buildTutorMutationAuditRow({ ...validBase, reason: "   " })).toThrow("AUDIT_REASON_REQUIRED");
  });

  it("avoids delimiter tuple collisions in buildAuditRowId for all permutation boundaries", () => {
    const tupleA = {
      requestId: "req-1",
      entityType: "soal",
      entityId: "id:extra",
      entityVersion: 2,
      action: "approve",
      outcome: "success",
    };
    const tupleB = {
      requestId: "req-1",
      entityType: "soal",
      entityId: "id",
      entityVersion: 2,
      action: "extra:approve",
      outcome: "success",
    };

    const idA = buildAuditRowId(tupleA);
    const idB = buildAuditRowId(tupleB);

    expect(idA).not.toBe(idB);
    expect(idA.length).toBe(70);
    expect(idB.length).toBe(70);
    expect(idA.startsWith("audit_")).toBe(true);
    expect(idB.startsWith("audit_")).toBe(true);
    expect(buildAuditRowId(tupleA)).toBe(idA);
  });
});
