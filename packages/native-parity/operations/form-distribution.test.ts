import { expect, test } from "bun:test";
import { publishedFormLinks } from "../../../apps/mobile-native/features/operations/management/links";
import { distributionClipboardText, formResponseDistribution } from "./form-distribution";
import type { FormQuestion, FormResponse } from "./management-contract";

const response = (answers: FormResponse["answers"]): FormResponse => ({ id: "response", submittedAt: "2026-11-25", answers });

test("uses the choices shown in web analytics, including zero counts and legacy title-keyed answers", () => {
  const question: FormQuestion = { title: "Jalur", type: "RADIO", options: ["Utara", "Selatan", "Barat"], required: false };
  const chart = formResponseDistribution(question, 2, [response({ 2: "Utara", Jalur: "Selatan" }), response({ Jalur: "Selatan" }), response({ 2: "Utara" }), response({}), response({ 2: "" })]);

  expect(chart).toEqual({ kind: "choice", answered: 3, multiple: false, items: [
    { label: "Utara", count: 2, percent: 66.66666666666667 },
    { label: "Selatan", count: 1, percent: 33.333333333333336 },
    { label: "Barat", count: 0, percent: 0 },
  ] });
  if (chart.kind === "choice") {
    expect(distributionClipboardText(question.title, chart.items)).toBe("Jalur:\n- Utara: 2 (66.7%)\n- Selatan: 1 (33.3%)\n- Barat: 0 (0%)");
  }
});

test("uses responding people as the checkbox denominator and treats option names as literal keys", () => {
  const chart = formResponseDistribution({ type: "CHECKBOX", title: "Pilihan", required: false },
    0, [response({ 0: ["__proto__", "Lab"] }), response({ 0: ["Lab"] }), response({})]);
  expect(chart).toEqual({ kind: "choice", answered: 2, multiple: true, items: [
    { label: "__proto__", count: 1, percent: 50 }, { label: "Lab", count: 2, percent: 100 },
  ] });
});

test("summarizes multiple grid selections per row, leaving attachments on the existing answer path", () => {
  const grid = formResponseDistribution({ type: "GRID_CHECKBOX", title: "Waktu", gridRows: ["Senin", "Selasa"], gridColumns: ["Pagi", "Siang"], required: false },
    0, [response({ 0: { Senin: ["Pagi", "Pagi", "Siang"] } }), response({ 0: { Senin: "Siang" } }), response({})]);
  expect(grid).toEqual({ kind: "grid", answered: 2, rows: [
    { label: "Senin", cells: [{ label: "Pagi", count: 1, percent: 50 }, { label: "Siang", count: 2, percent: 100 }] },
    { label: "Selasa", cells: [{ label: "Pagi", count: 0, percent: 0 }, { label: "Siang", count: 0, percent: 0 }] },
  ] });
  const attachment = response({ 0: ["opaque-attachment"] });
  expect(formResponseDistribution({ type: "FILE_UPLOAD", title: "Berkas", required: true }, 0, [attachment]))
    .toEqual({ kind: "answers", answered: 1, responses: [attachment] });
  expect(formResponseDistribution({ type: "RATING", title: "Nilai", required: true }, 0, []))
    .toEqual({ kind: "empty", answered: 0 });
});

test("copies the canonical short and full public URLs from the active server's origin", () => {
  expect(publishedFormLinks("form_78b", "kelas-7", "https://staging.example.test/admin")).toEqual({
    short: "https://staging.example.test/f/kelas-7", full: "https://staging.example.test/forms/form_78b",
  });
  expect(publishedFormLinks("../accounts", "//evil.example.test", "https://staging.example.test")).toEqual({ short: null, full: null });
  expect(publishedFormLinks("abc", "kelas-7", "javascript:alert(1)")).toEqual({ short: null, full: null });
});
