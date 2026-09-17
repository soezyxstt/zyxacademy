import { describe, expect, test } from "bun:test";
import {
  detectCategoryFromFilename,
  detectMetadataFromFilename,
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
      subcategory: "materi_dosen",
    });
    expect(detectCategoryFromFilename("e-book-Thermodynamics.pdf")).toEqual({
      category: "materi",
      subcategory: "ebook",
    });
    expect(detectCategoryFromFilename("scl-diskusi-kelompok.pdf")).toEqual({
      category: "materi",
      subcategory: "scl",
    });
  });

  test("detects full metadata from filename", () => {
    const chapters = [
      { id: "ch-1", title: "Bab 1 Limit", orderIndex: 1 },
      { id: "ch-2", title: "Bab 2 Turunan", orderIndex: 2 },
    ];
    const meta = detectMetadataFromFilename("Bab 01 Limit dan Kontinu 2025.pdf", chapters);
    expect(meta.category).toBe("materi");
    expect(meta.year).toBe(2025);
    expect(meta.chapterIds).toEqual(["ch-1"]);
    expect(meta.primaryChapterIndex).toBe(1);
  });

  test("prefers more specific full chapter title over subset token", () => {
    const chapters = [
      { id: "ch-2", title: "Bab 2 Turunan", orderIndex: 2 },
      { id: "ch-3", title: "Bab 3 Aplikasi Turunan", orderIndex: 3 },
    ];
    const meta = detectMetadataFromFilename("Bab 03-Aplikasi Turunan.pdf", chapters);
    expect(meta.chapterIds).toEqual(["ch-3"]);
    expect(meta.primaryChapterIndex).toBe(3);
  });
});

describe("standard renaming engine", () => {
  test("sanitizes tokens to kebab-case", () => {
    expect(sanitizeNameToken("Hukum Pertama! (rev 2)")).toBe("hukum-pertama-rev-2");
    expect(sanitizeNameToken("---")).toBe("dokumen");
  });

  test("embeds 2-digit bab padding and places year at the end", () => {
    expect(
      generateFileName({
        courseCode: "MA1101",
        category: "materi",
        subcategory: "diktat",
        chapterIndex: 1,
        year: 2025,
        title: "Limit dan Kekontinuan",
      })
    ).toBe("ma1101_bab01_diktat_limit-dan-kekontinuan_2025.pdf");

    expect(
      generateFileName({
        courseCode: "MA1101",
        category: "soal",
        subcategory: "tutorial",
        chapterIndex: 2,
        year: 2025,
        semester: "sem1",
        title: "Turunan",
      })
    ).toBe("ma1101_bab02_tutorial_turunan_soal_2025-sem1.pdf");
  });

  test("generates exam filenames with role and year at the end without redundant bab", () => {
    expect(
      generateFileName({
        courseCode: "MA1101",
        category: "soal",
        subcategory: "uts",
        year: 2024,
        semester: "sem1",
        title: "UTS",
      })
    ).toBe("ma1101_uts_soal_2024-sem1.pdf");

    expect(
      generateFileName({
        courseCode: "FI1101",
        category: "pembahasan_soal",
        subcategory: "uas",
        year: 2024,
        title: "Paket A Solusi",
      })
    ).toBe("fi1101_uas_paket-a_solusi_2024.pdf");
  });

  test("handles slide, catatan, and static documents", () => {
    expect(
      generateFileName({
        courseCode: "KI1001",
        category: "materi",
        subcategory: "catatan",
        chapterIndex: 3,
        year: 2025,
        title: "Stoikiometri",
      })
    ).toBe("ki1001_bab03_catatan_stoikiometri_2025.pdf");
  });
});
