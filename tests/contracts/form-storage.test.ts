import { describe, expect, test } from "bun:test";
import {
  slugifyFormTitle,
  formatQuestionFolder,
  buildFormStorageKey,
} from "@/lib/forms/storage-utils";

describe("Form Storage Path Utilities", () => {
  test("slugifyFormTitle should clean and format form titles correctly", () => {
    expect(slugifyFormTitle("Formulir Pendaftaran Siswa 2026")).toBe(
      "formulir-pendaftaran-siswa-2026"
    );
    expect(slugifyFormTitle("  Ujian  Akhir   Semester (PKA) ! ")).toBe(
      "ujian-akhir-semester-pka"
    );
    expect(slugifyFormTitle("Formulir - & - Survey")).toBe("formulir-survey");
    expect(slugifyFormTitle("")).toBe("unnamed-form");
    expect(slugifyFormTitle(null)).toBe("unnamed-form");
  });

  test("formatQuestionFolder should format question numbers into uniform folders", () => {
    expect(formatQuestionFolder(1)).toBe("question-1");
    expect(formatQuestionFolder("2")).toBe("question-2");
    expect(formatQuestionFolder("q3")).toBe("question-3");
    expect(formatQuestionFolder("pertanyaan-4")).toBe("question-4");
    expect(formatQuestionFolder("Section Feedback")).toBe("question-section-feedback");
    expect(formatQuestionFolder(null)).toBe("general");
  });

  test("buildFormStorageKey should assemble structured R2 storage key paths", () => {
    const key = buildFormStorageKey({
      formTitle: "Formulir Pendaftaran Siswa 2026",
      questionNumber: 1,
      filename: "Pas Foto Siswa.JPG",
    });

    expect(key).toMatch(/^forms\/formulir-pendaftaran-siswa-2026\/question-1\/\d+-[a-f0-9]{8}-pas_foto_siswa\.jpg$/);
  });

  test("buildFormStorageKey should handle missing title and fallback to slug or default", () => {
    const keyWithSlug = buildFormStorageKey({
      formSlug: "form-khusus-123",
      questionNumber: "q2",
      filename: "dokumen.pdf",
    });
    expect(keyWithSlug).toMatch(/^forms\/form-khusus-123\/question-2\/\d+-[a-f0-9]{8}-dokumen\.pdf$/);

    const keyWithNoTitle = buildFormStorageKey({
      filename: "attachment.png",
    });
    expect(keyWithNoTitle).toMatch(/^forms\/unnamed-form\/general\/\d+-[a-f0-9]{8}-attachment\.png$/);
  });
});
