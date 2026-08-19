import { describe, expect, it } from "bun:test";
import { isCurrentQuizContextQuery, isMetaExamQuery } from "@/lib/assessment-intelligence-service";

describe("assessment intelligence query routing", () => {
  it("routes only explicit historical assessment pattern requests", () => {
    expect(isMetaExamQuery("Apa pola soal UTS yang sering muncul?")).toBe(true);
    expect(isMetaExamQuery("Bagaimana distribusi tipe soal ujian sebelumnya?")).toBe(true);
  });

  it("does not treat a current quiz summary as historical analytics", () => {
    expect(isMetaExamQuery("Buatkan summary kuis ini tentang apa")).toBe(false);
    expect(isMetaExamQuery("Tolong jelaskan soal kuis nomor dua")).toBe(false);
  });

  it("recognizes an explicit summary request for the current quiz page", () => {
    expect(isCurrentQuizContextQuery("Buatkan summary kuis ini tentang apa")).toBe(true);
    expect(isCurrentQuizContextQuery("Apa pola kuis yang sering keluar? ")).toBe(false);
  });
});
