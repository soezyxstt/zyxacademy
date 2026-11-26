import { expect, test } from "bun:test";
import { createTryoutGradeEditor } from "../../../../apps/mobile-native/features/academic/tutor/tryout-grade-client";
import type { AcademicTransport } from "../../../../apps/mobile-native/features/academic/client";

const course = "academic-course-1";
const submission = "academic-submission-1";
const initialRevision = "1".repeat(64);
const newRevision = "2".repeat(64);
const command = { score: 83, notes: "Bagus", expectedRevision: initialRevision };
const draft = { ...command, score: String(command.score) };
const signal = new AbortController().signal;
const environment = {
  accountId: "academic-tutor", origin: "https://academic.example.test", locale: "id",
  async get() { return Response.json({}); },
};

test("tryout grade retains an uncertain command by course and session and validates its receipt", async () => {
  let count = 0;
  const transport: AcademicTransport = {
    ...environment,
    async command(path, init) {
      expect(path).toBe("/api/native/academic/tutor-support/courses/academic-course-1/grading/academic-submission-1");
      expect(init.requestId).toBe("request-grade-001");
      expect(init.body).toEqual(command);
      count += 1;
      if (count === 1) throw new Error("Offline");
      if (count === 2) return Response.json({ requestId: "request-grade-001", submissionId: "other-id", reviewRevision: newRevision });
      return Response.json({ requestId: "request-grade-001", submissionId: submission, reviewRevision: newRevision });
    },
  };
  const editor = createTryoutGradeEditor(transport)!;
  editor.changeDraft(course, submission, draft);
  expect(await editor.publish(course, submission, command, "request-grade-001", signal)).toEqual({ status: "unknown" });
  expect(editor.draft(course, submission)).toEqual(draft);
  expect(editor.pending(course, submission)).toEqual(command);
  expect(editor.pending("academic-course-2", submission)).toBeUndefined();
  const differentSession = createTryoutGradeEditor({ ...transport })!;
  expect(differentSession.pending(course, submission)).toBeUndefined();
  expect(differentSession.draft(course, submission)).toBeUndefined();
  expect(await editor.publish(course, submission, { ...command, score: 84 }, "ignored-id", signal)).toEqual({ status: "unknown" });
  expect(count).toBe(1);
  expect(await editor.publish(course, submission, command, "request-grade-002", signal)).toEqual({ status: "unknown" });
  expect(editor.pending(course, submission)).toEqual(command);
  expect(await editor.publish(course, submission, command, "request-grade-003", signal)).toEqual({
    status: "saved", receipt: { requestId: "request-grade-001", submissionId: submission, reviewRevision: newRevision },
  });
  expect(editor.pending(course, submission)).toBeUndefined();
  expect(editor.draft(course, submission)).toBeUndefined();
});

test("invalid tryout grades keep an editable draft while conflicts and denied access clear it", async () => {
  for (const status of [400, 401, 403, 404, 409, 413, 415, 422]) {
    const editor = createTryoutGradeEditor({
      ...environment,
      async command() { return Response.json({}, { status }); },
    })!;
    editor.changeDraft(course, submission, draft);
    const invalid = [400, 413, 415, 422].includes(status);
    expect(await editor.publish(course, submission, command, "request-grade-001", signal)).toEqual({
      status: invalid ? "invalid" : status === 409 ? "conflict" : "denied",
    });
    expect(editor.pending(course, submission)).toBeUndefined();
    expect(editor.draft(course, submission)).toEqual(invalid ? draft : undefined);
  }
});
