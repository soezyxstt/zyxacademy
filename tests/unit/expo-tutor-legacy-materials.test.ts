import { expect, test } from "bun:test";
import { createTutorLegacyMaterials } from "../../apps/mobile-native/features/academic/tutor/legacy-materials-client";
import { reconstructLegacyMaterialMarkdown, tutorLegacyMaterialCommand, tutorLegacyMaterialsPath } from "../../packages/academic/tutor-legacy-materials";
import { handleTutorSupport, type TutorSupportServices } from "../../lib/native/academic/handle-tutor-support";

const expectedRevision = "a".repeat(64);
const courseId = "mk-calc";
const legacyId = "calc-legacy";
const id = "mat-1";
const path = tutorLegacyMaterialsPath(courseId);
const signal = new AbortController().signal;
const draft = { id, courseId: legacyId, revision: expectedRevision, title: "Turunan", summary: "Ringkasan", markdown: "## Turunan\n\nIsi" };

test("native material reads match the exact requested item and legacy course before editing", async () => {
  let value = draft;
  const feature = createTutorLegacyMaterials({
    accountId: "staff", origin: "https://example.test", locale: "id",
    async get(url) {
      expect(url).toBe(path + "?materialId=mat-1");
      return Response.json(value);
    },
    async command() { throw new Error("unused"); },
  })!;
  expect(await feature.read(courseId, legacyId, id, signal)).toEqual(draft);
  value = { ...draft, courseId: "other-course" };
  await expect(feature.read(courseId, legacyId, id, signal)).rejects.toMatchObject({ status: 502 });
  value = { ...draft, id: "another" };
  await expect(feature.read(courseId, legacyId, id, signal)).rejects.toMatchObject({ status: 502 });
});

test("legacy Markdown reconstruction retains section order and full authored content", () => {
  expect(reconstructLegacyMaterialMarkdown([
    { title: "Turunan", orderIndex: 0, chunks: [{ chunkText: "Isi pertama", orderIndex: 0 }, { chunkText: "Isi kedua", orderIndex: 1 }] },
    { title: null, orderIndex: 1, chunks: [{ chunkText: "Paragraf", orderIndex: 0 }] },
  ])).toBe("## Turunan\n\nIsi pertama\n\nIsi kedua\n\nParagraf");
  expect(tutorLegacyMaterialCommand.safeParse({ action: "delete", id, expectedRevision: "old" }).success).toBe(false);
  expect(tutorLegacyMaterialCommand.safeParse({ action: "edit", id, expectedRevision, title: "Title", summary: "", markdown: "Text" }).success).toBe(false);
});

test("uncertain native mutations preserve the same revision, operation and receipt ID", async () => {
  const attempts: unknown[] = [];
  const feature = createTutorLegacyMaterials({
    accountId: "staff", origin: "https://example.test", locale: "id",
    async get() { throw new Error("unused"); },
    async command(url, command) {
      expect(url).toBe(path);
      attempts.push(command);
      if (attempts.length === 1) throw new Error("lost");
      return Response.json({ status: "saved", requestId: command.requestId });
    },
  })!;
  const command = { action: "delete", id, expectedRevision } as const;
  const target = feature.target(courseId);
  expect(await target.submit(command, "request-1", signal)).toEqual({ status: "retry" });
  expect(target.pending()).toMatchObject({ draft: command, requestId: "request-1" });
  expect(await target.submit({ ...command, id: "other" }, "request-2", signal)).toEqual({ status: "retry" });
  expect(await target.submit(command, "request-1", signal)).toEqual({ status: "saved" });
  expect(attempts[1]).toEqual(attempts[0]);
  target.acknowledge("request-1");
  expect(target.pending()).toBeNull();
});

test("only the Tutor materials read uses the web Admin override capability", async () => {
  const authorized: string[] = [];
  const services = {
    async session() { return { user: { id: "dual-role" } }; },
    async hasTutor() { return true; },
    async authorizeCourse() { throw new Error("TUTOR_ACCESS_DENIED"); },
    async authorizeMaterialsCourse(actor: string) { authorized.push(actor); },
    async materials() { return { title: "Calculus", legacyAdminCourseId: legacyId, items: [] }; },
  } as unknown as TutorSupportServices;
  expect((await handleTutorSupport(new URL("https://example.test"), ["courses", courseId, "materials"], services)).status).toBe(200);
  expect((await handleTutorSupport(new URL("https://example.test"), ["courses", courseId, "videos"], services)).status).toBe(403);
  expect(authorized).toEqual(["dual-role"]);
});
