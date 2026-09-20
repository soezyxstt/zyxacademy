import { describe, expect, it } from "bun:test";
import {
  getStudentTargetCategory,
  isCourseMatchingMajor,
  isTpbStudent,
} from "@/lib/student/itb-academic-data";

describe("ITB Student Course Matching", () => {
  it("detects TPB student correctly", () => {
    expect(isTpbStudent(2025, "TPB FTMD (Belum Penjurusan)")).toBe(true);
    expect(isTpbStudent(2025, "TPB STEI (Belum Penjurusan)")).toBe(true);
    expect(isTpbStudent(2023, "Teknik Mesin")).toBe(false);
    expect(isTpbStudent(2024, "Teknik Informatika")).toBe(false);
  });

  it("resolves student target category", () => {
    expect(getStudentTargetCategory("TPB FTMD (Belum Penjurusan)", 2025)).toBe("TPB");
    expect(getStudentTargetCategory("Teknik Mesin", 2023)).toBe("Teknik Mesin");
    expect(getStudentTargetCategory("Teknik Informatika", 2024)).toBe("Teknik Informatika");
    expect(getStudentTargetCategory(null)).toBe(null);
    expect(getStudentTargetCategory("")).toBe(null);
  });

  it("matches courses for TPB students strictly to TPB", () => {
    const tpbMajor = "TPB FTMD (Belum Penjurusan)";
    expect(isCourseMatchingMajor("TPB", tpbMajor)).toBe(true);
    expect(isCourseMatchingMajor("tpb", tpbMajor)).toBe(true);
    expect(isCourseMatchingMajor("Teknik Mesin", tpbMajor)).toBe(false);
    expect(isCourseMatchingMajor("Matematika", tpbMajor)).toBe(false);
    expect(isCourseMatchingMajor("Fisika", tpbMajor)).toBe(false);
  });

  it("matches courses for Teknik Mesin students strictly to Teknik Mesin", () => {
    const mesinMajor = "Teknik Mesin";
    expect(isCourseMatchingMajor("Teknik Mesin", mesinMajor)).toBe(true);
    expect(isCourseMatchingMajor("teknik mesin", mesinMajor)).toBe(true);
    expect(isCourseMatchingMajor("TPB", mesinMajor)).toBe(false);
    expect(isCourseMatchingMajor("Teknik Dirgantara", mesinMajor)).toBe(false);
    expect(isCourseMatchingMajor("Matematika", mesinMajor)).toBe(false);
  });

  it("falls back to true when student major is not set", () => {
    expect(isCourseMatchingMajor("TPB", null)).toBe(true);
    expect(isCourseMatchingMajor("Teknik Mesin", undefined)).toBe(true);
    expect(isCourseMatchingMajor("Matematika", "")).toBe(true);
  });

  it("handles alias variations between ITB and course catalog", () => {
    expect(isCourseMatchingMajor("Manajemen Rekayasa", "Manajemen Rekayasa Industri")).toBe(true);
    expect(isCourseMatchingMajor("Teknik dan Pengelolaan Sumber Daya Air", "Rekayasa dan Pengelolaan Sumber Daya Air")).toBe(true);
  });
});
