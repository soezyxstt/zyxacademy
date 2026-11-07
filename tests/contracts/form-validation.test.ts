import { expect, test } from "bun:test";
import { csvCell, formDefinitionSchema, validateFormAnswers, summarizeFormResponses } from "@/lib/forms/validation";
const base = { title: "Form", slug: "form", questions: [{ title: "Text", type: "TEXT" }] };
test("definitions reject ambiguous schedules, unsupported types and duplicate options", () => {
  expect(formDefinitionSchema.safeParse({ ...base, settings: { openAt: "2026-11-02T10:00" } }).success).toBe(false);
  expect(formDefinitionSchema.safeParse({ ...base, settings: { openAt: "2026-11-03T10:00:00Z", closeAt: "2026-11-02T10:00:00Z" } }).success).toBe(false);
  expect(formDefinitionSchema.safeParse({ ...base, questions: [{ title: "Pick", type: "RADIO", options: ["A", "A"] }] }).success).toBe(false);
  expect(formDefinitionSchema.safeParse({ ...base, questions: [{ title: "Grid", type: "GRID_RADIO", gridRows: ["A"] }] }).success).toBe(false);
  expect(formDefinitionSchema.safeParse({ ...base, questions: [{ title: "Upload", type: "FILE_UPLOAD", maxFileSizeMb: 51 }] }).success).toBe(false);
});
test("validates all answerable types including partial required grids and numeric zero", () => {
  const form = formDefinitionSchema.parse({ ...base, questions: [
    { type: "STATEMENT", title: "Intro" }, { type: "GRID_RADIO", title: "Grid", required: true, gridRows: ["A", "B"], gridColumns: ["Y", "N"] },
    { type: "SCALE", title: "Scale", scaleLow: 0, scaleHigh: 10, required: true }, { type: "DATE", title: "Date" }, { type: "TIME", title: "Time" },
  ] });
  expect(validateFormAnswers(form.questions, { "1": { A: "Y" }, "2": 0 }).issues).toEqual([{ questionIndex: 1, code: "REQUIRED" }]);
  expect(validateFormAnswers(form.questions, { "1": { A: "Y", B: "N" }, "2": 0, "3": "2026-02-30", "4": "24:59" }).issues.map(i => i.questionIndex)).toEqual([3, 4]);
  expect(validateFormAnswers(form.questions, { "1": { A: "Y", B: "N" }, "2": 0 }).valid).toBe(true);
  expect(validateFormAnswers(form.questions, { "0": "unexpected", "2": true }).valid).toBe(false);
});
test("optional files cannot be represented as verified uploads; empty optional files pass", () => {
  const questions = formDefinitionSchema.parse({ ...base, questions: [{ title: "File", type: "FILE_UPLOAD" }] }).questions;
  expect(validateFormAnswers(questions, {}).valid).toBe(true);
  expect(validateFormAnswers(questions, { "0": "https://evil.test/file" }).issues[0].code).toBe("FILE_REQUIRES_UPLOAD_VERIFICATION");
});
test("summary handles malicious option names without prototypes or open-text leaks", () => {
  const questions = formDefinitionSchema.parse({ ...base, questions: [{ title: "Pick", type: "CHECKBOX", options: ["__proto__", "constructor", "A"] }] }).questions;
  const summary = summarizeFormResponses(questions, [{ answers: { "0": ["__proto__", "A", "private answer"] } }]);
  expect(summary.questions[0].counts.__proto__).toBe(1);
  expect(JSON.stringify(summary)).not.toContain("private answer");
  expect(csvCell(" \t=1+1")).toBe('"\' \t=1+1"');
});
