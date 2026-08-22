import { describe, expect, test } from "bun:test";
import {
  detectCategoryFromFilename,
  detectYear,
  generateFileName,
  isHiddenOrSystemFile,
  isSupportedBatchFile,
  sanitizeNameToken,
} from "@/lib/course-batch-upload";

describe("batch upload ingestion filters", () => {
  test("flags hidden and system files", () => {
    expect(isHiddenOrSystemFile(".DS_Store")).toBe(true);
    expect(isHiddenOrSystemFile("Thumbs.db")).toBe(true);
    expect(isHiddenOrSystemFile(".gitignore")).toBe(true);
    expect(isHiddenOrSystemFile("folder/.hidden.pdf")).toBe(true);
    expect(isHiddenOrSystemFile("materi-bab-1.pdf")).toBe(false);
  });

  test("accepts only PDF files", () => {
    expect(isSupportedBatchFile("soal.PDF")).toBe(true);
    expect(isSupportedBatchFile("soal.pdf")).toBe(true);
    expect(isSupportedBatchFile("soal.docx")).toBe(false);
    expect(isSupportedBatchFile("noextension")).toBe(false);
  });
});

describe("filename heuristics", () => {
  test("extracts plausible academic years", () => {
    expect(detectYear("SOAL_UTS_2023.pdf")).toBe(2023);
    expect(detectYear("UAS-2019-genap.pdf")).toBe(2019);
    expect(detectYear("tanpa-tahun.pdf")).toBeNull();
  });

  test("maps exam terms to soal subcategories", () => {
    expect(detectCategoryFromFilename("uts-2023.pdf")).toEqual({
      category: "soal",
      subcategory: "uts",
    });
    expect(detectCategoryFromFilename("Soal UAS Termodinamika.pdf")).toEqual({
      category: "soal",
      subcategory: "uas",
    });
    expect(detectCategoryFromFilename("kuis-1-ganjil.pdf")).toEqual({
      category: "soal",
      subcategory: "kuis",
    });
    expect(detectCategoryFromFilename("tutorial-3.pdf")).toEqual({
      category: "soal",
      subcategory: "tutorial",
    });
    expect(detectCategoryFromFilename("soal-latihan.pdf")).toEqual({
      category: "soal",
      subcategory: "lainnya",
    });
  });

  test("maps pembahasan keywords with their exam term", () => {
    expect(detectCategoryFromFilename("Pembahasan UTS 2022.pdf")).toEqual({
      category: "pembahasan_soal",
      subcategory: "uts",
    });
    expect(detectCategoryFromFilename("solusi-uas.pdf")).toEqual({
      category: "pembahasan_soal",
      subcategory: "uas",
    });
  });

  test("maps materi keywords to materi subcategories", () => {
    expect(detectCategoryFromFilename("Bab 03 Hukum Pertama.pdf")).toEqual({
      category: "materi",
      subcategory: null,
    });
    expect(detectCategoryFromFilename("ppt-perkuliahan-01.pdf")).toEqual({
      category: "materi",
      subcategory: "ppt_dosen",
    });
    expect(detectCategoryFromFilename("e-book-Thermodynamics.pdf")).toEqual({
      category: "materi",
      subcategory: "ebook",
    });
    expect(detectCategoryFromFilename("catatan-kuliah.pdf")).toEqual({
      category: "materi",
      subcategory: "catatan",
    });
  });

  test("falls back to materi lainnya", () => {
    expect(detectCategoryFromFilename("tabel-uap-air.pdf")).toEqual({
      category: "materi",
      subcategory: null,
    });
  });
});

describe("rename engine", () => {
  test("sanitizes tokens to kebab-case", () => {
    expect(sanitizeNameToken("Hukum Pertama! (rev 2)")).toBe("hukum-pertama-rev-2");
    expect(sanitizeNameToken("---")).toBe("dokumen");
  });

  test("embeds year and subcategory for time-related categories", () => {
    expect(
      generateFileName({
        courseCode: "MS2100",
        category: "soal",
        subcategory: "uts",
        year: 2023,
        title: "Termodinamika 1",
      })
    ).toBe("ms2100_soal_uts_2023_termodinamika-1.pdf");

    expect(
      generateFileName({
        courseCode: "MS2100",
        category: "pembahasan_soal",
        subcategory: null,
        year: 2023,
        title: "UAS",
      })
    ).toBe("ms2100_pembahasan_lainnya_2023_uas.pdf");
  });

  test("keeps materi names static without a year", () => {
    expect(
      generateFileName({
        courseCode: "MS2100",
        category: "materi",
        subcategory: "ebook",
        year: null,
        title: "Engineering Thermodynamics",
      })
    ).toBe("ms2100_materi_ebook_engineering-thermodynamics.pdf");

    expect(
      generateFileName({
        courseCode: "MS2100",
        category: "materi",
        subcategory: "lainnya",
        year: 2020,
        title: "Tabel Uap Air",
      })
    ).toBe("ms2100_materi_tabel-uap-air.pdf");
  });
});
