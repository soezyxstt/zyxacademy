import { describe, expect, test } from "bun:test";
import enAdminOps from "@/messages/en/adminOps.json";
import idAdminOps from "@/messages/id/adminOps.json";
import {
  analyzeAuditReason,
  buildActivitySnapshotSummary,
  formatSnapshotValue,
  humanizeFieldName,
  isMutationAuditEnvelope,
  unwrapAuditSnapshot,
} from "@/app/(admin)/admin/ops/tutor-activity/_components/activity-diff";
import {
  activityLabel,
  activitySummaryTitle,
} from "@/app/(admin)/admin/ops/tutor-activity/_components/activity-label";

function createTranslator(messages: Record<string, any>) {
  const t = (key: string, values?: Record<string, string | number>) => {
    const parts = key.split(".");
    let current: any = messages;
    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = current[part];
      } else {
        throw new Error(`Missing translation key: ${key}`);
      }
    }
    if (typeof current !== "string") {
      throw new Error(`Translation key is not a string: ${key}`);
    }
    if (!values) return current;
    return current.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
  };
  return t as any;
}

describe("unwrapAuditSnapshot", () => {
  test("unwraps MutationAuditEnvelope and separates metadata from snapshot", () => {
    const envelope = {
      auditSchemaVersion: "content-workflow-v1",
      actorRoles: ["tutor"],
      courseId: "course-1",
      entityVersion: 2,
      requestId: "req-123",
      reason: "TUTOR_SLOT_UPDATED",
      outcome: "success",
      snapshotHash: "abcdef1234567890abcdef1234567890",
      snapshot: {
        id: "slot-1",
        status: "open",
        capacity: 10,
      },
    };

    expect(isMutationAuditEnvelope(envelope)).toBe(true);
    const result = unwrapAuditSnapshot(envelope);
    expect(result.data).toEqual({
      id: "slot-1",
      status: "open",
      capacity: 10,
    });
    expect(result.envelopeMeta?.requestId).toBe("req-123");
    expect(result.envelopeMeta?.entityVersion).toBe(2);
    expect(result.envelopeMeta?.actorRoles).toEqual(["tutor"]);
  });

  test("handles envelope with null snapshot", () => {
    const envelope = {
      auditSchemaVersion: "content-workflow-v1",
      actorRoles: ["tutor"],
      courseId: "global",
      entityVersion: 1,
      requestId: "req-456",
      reason: "MATERIALS_AUTHORING_DISABLED",
      outcome: "rejected",
      snapshotHash: null,
      snapshot: null,
    };

    const result = unwrapAuditSnapshot(envelope);
    expect(result.data).toBeNull();
    expect(result.envelopeMeta?.requestId).toBe("req-456");
  });

  test("returns raw non-envelope objects directly", () => {
    const raw = { status: "draft", productCount: 4 };
    expect(isMutationAuditEnvelope(raw)).toBe(false);
    const result = unwrapAuditSnapshot(raw);
    expect(result.data).toEqual(raw);
    expect(result.envelopeMeta).toBeNull();
  });
});

describe("buildActivitySnapshotSummary", () => {
  test("computes update diff with only changed meaningful fields from wrapped envelopes", () => {
    const before = {
      auditSchemaVersion: "content-workflow-v1",
      actorRoles: ["tutor"],
      courseId: "mk-1",
      entityVersion: 1,
      requestId: "req-1",
      reason: "UPDATED",
      snapshotHash: "hash-before",
      snapshot: {
        id: "quiz-1",
        courseId: "mk-1",
        title: "Quiz 1",
        status: "draft",
        capacity: 20,
        updatedAt: "2026-11-20T10:00:00.000Z",
        version: 1,
      },
    };
    const after = {
      auditSchemaVersion: "content-workflow-v1",
      actorRoles: ["tutor"],
      courseId: "mk-1",
      entityVersion: 2,
      requestId: "req-2",
      reason: "UPDATED",
      snapshotHash: "hash-after",
      snapshot: {
        id: "quiz-1",
        courseId: "mk-1",
        title: "Quiz 1",
        status: "published",
        capacity: 30,
        updatedAt: "2026-11-24T12:00:00.000Z",
        version: 2,
      },
    };

    const summary = buildActivitySnapshotSummary(before, after);
    expect(summary.mode).toBe("update");
    expect(summary.entries).toEqual([
      { key: "status", before: "draft", after: "published" },
      { key: "capacity", before: 20, after: 30 },
    ]);
  });

  test("falls back to noisy internal fields if they are the only fields that changed", () => {
    const before = { id: "a", version: 1, title: "Same" };
    const after = { id: "a", version: 2, title: "Same" };

    const summary = buildActivitySnapshotSummary(before, after);
    expect(summary.mode).toBe("update");
    expect(summary.entries).toEqual([{ key: "version", before: 1, after: 2 }]);
  });

  test("returns create summary skipping internal IDs, hashes, and empty values", () => {
    const after = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      courseId: "mk-101",
      mataKuliahId: "mk-101",
      refUuid: "123e4567-e89b-12d3-a456-426614174000",
      title: "Calculus Slot",
      startAt: "2026-11-25T09:00:00.000Z",
      capacity: 5,
      notes: "",
      createdAt: "2026-11-24T08:00:00.000Z",
    };

    const summary = buildActivitySnapshotSummary(null, after);
    expect(summary.mode).toBe("create");
    expect(summary.entries).toEqual([
      { key: "title", after: "Calculus Slot" },
      { key: "startAt", after: "2026-11-25T09:00:00.000Z" },
      { key: "capacity", after: 5 },
    ]);
  });

  test("returns delete summary when only before snapshot exists", () => {
    const before = {
      id: "slot-1",
      title: "Evening Slot",
      status: "open",
    };

    const summary = buildActivitySnapshotSummary(before, null);
    expect(summary.mode).toBe("delete");
    expect(summary.entries).toEqual([
      { key: "title", before: "Evening Slot" },
      { key: "status", before: "open" },
    ]);
  });

  test("returns empty mode when both snapshots are missing or unwrap to null", () => {
    const emptyEnvelope = {
      auditSchemaVersion: "content-workflow-v1",
      snapshotHash: null,
      snapshot: null,
    };
    expect(buildActivitySnapshotSummary(null, null)).toEqual({
      mode: "empty",
      entries: [],
    });
    expect(buildActivitySnapshotSummary(null, emptyEnvelope)).toEqual({
      mode: "empty",
      entries: [],
    });
  });

  test("detects truncated snapshot payloads", () => {
    const truncated = {
      _truncated: "[TRUNCATED_PAYLOAD]",
      digest: "abc",
      byteLength: 99999,
    };
    const summary = buildActivitySnapshotSummary(null, truncated);
    expect(summary.truncated).toBe(true);
    expect(summary.entries).toEqual([]);
  });
});

describe("analyzeAuditReason", () => {
  test("marks redundant SCREAMING_SNAKE_CASE action repeats as redundant", () => {
    expect(
      analyzeAuditReason("TUTOR_SLOT_CREATED", "tutor.slot.create", "tutor_slot"),
    ).toEqual({ kind: "redundant" });

    expect(
      analyzeAuditReason("QUIZ_UPDATED", "quiz:update", "quiz_template"),
    ).toEqual({ kind: "redundant" });
  });

  test("humanizes non-redundant SCREAMING_SNAKE_CASE error or policy codes", () => {
    const result = analyzeAuditReason(
      "MATERIALS_AUTHORING_DISABLED",
      "material:create",
      "material",
    );
    expect(result).toEqual({
      kind: "code",
      text: "Materials authoring disabled",
      raw: "MATERIALS_AUTHORING_DISABLED",
    });
  });

  test("preserves meaningful human notes", () => {
    const result = analyzeAuditReason(
      "Student requested reschedule due to lab exam",
      "tutor.ticket.decide",
      "reschedule_ticket",
    );
    expect(result).toEqual({
      kind: "note",
      text: "Student requested reschedule due to lab exam",
      raw: "Student requested reschedule due to lab exam",
    });
  });

  test("returns none for empty or whitespace reason", () => {
    expect(analyzeAuditReason(null, "create", "quiz")).toEqual({ kind: "none" });
    expect(analyzeAuditReason("   ", "create", "quiz")).toEqual({ kind: "none" });
  });
});

describe("formatSnapshotValue and humanizeFieldName", () => {
  test("formats primitives, timestamps, arrays, and objects concisely", () => {
    const opts = {
      locale: "en-US",
      yesLabel: "Yes",
      noLabel: "No",
      timeZone: "UTC",
    };

    expect(formatSnapshotValue(null, opts)).toBe("-");
    expect(formatSnapshotValue("", opts)).toBe("-");
    expect(formatSnapshotValue(true, opts)).toBe("Yes");
    expect(formatSnapshotValue(false, opts)).toBe("No");
    expect(formatSnapshotValue(1250, opts)).toBe("1,250");
    expect(formatSnapshotValue("2026-11-24T14:30:00.000Z", opts)).toContain("2026");
    expect(formatSnapshotValue(["a", "b", "c"], opts)).toBe("a, b, c");
    expect(formatSnapshotValue(["a", "b", "c", "d", "e", "f"], opts)).toBe(
      "a, b, c, d, +2 more",
    );
    expect(formatSnapshotValue([{ id: 1 }, { id: 2 }], opts)).toBe("2 items");
    expect(formatSnapshotValue({ a: 1, b: 2, c: 3, d: 4 }, opts)).toBe("4 fields");
  });

  test("translates known field keys and humanizes unknown camelCase/snake_case keys", () => {
    const tEn = createTranslator(enAdminOps);
    const tId = createTranslator(idAdminOps);

    expect(
      humanizeFieldName("startAt", (key) => tEn(`tutorActivityUI.fields.${key}`)),
    ).toBe("Start time");
    expect(
      humanizeFieldName("startAt", (key) => tId(`tutorActivityUI.fields.${key}`)),
    ).toBe("Waktu mulai");
    expect(
      humanizeFieldName("custom_flag_name", (key) => tEn(`tutorActivityUI.fields.${key}`)),
    ).toBe("Custom flag name");
    expect(humanizeFieldName("maxRetryWindow")).toBe("Max retry window");
  });
});

describe("activityLabel and activitySummaryTitle", () => {
  test("maps expanded entities and actions in both EN and ID", () => {
    const tEn = createTranslator(enAdminOps);
    const tId = createTranslator(idAdminOps);

    const entities = [
      ["coding_problem", "Coding problem", "Soal pemrograman"],
      ["idea_bundle", "Idea bundle", "Paket ide"],
      ["source_document", "Source document", "Dokumen sumber"],
      ["artikel", "Article", "Artikel"],
      ["diktat_materi", "Diktat", "Diktat materi"],
      ["soal", "Question", "Soal"],
      ["pembahasan_soal", "Question explanation", "Pembahasan soal"],
      ["flashcard", "Flashcard", "Kartu belajar"],
      ["live_session", "Live session", "Sesi langsung"],
    ] as const;

    for (const [raw, expectedEn, expectedId] of entities) {
      expect(activityLabel(raw, tEn)).toBe(expectedEn);
      expect(activityLabel(raw, tId)).toBe(expectedId);
    }

    expect(activitySummaryTitle("tutor.slot.create", "tutor_slot", tEn)).toBe(
      "Created tutor slot",
    );
    expect(activitySummaryTitle("quiz:update", "quiz_template", tEn)).toBe(
      "Updated quiz",
    );
    expect(activitySummaryTitle("delete", "booking", tEn)).toBe("Deleted session");
    expect(activitySummaryTitle("create", "bab", tId)).toBe("Membuat bab");
  });
});
