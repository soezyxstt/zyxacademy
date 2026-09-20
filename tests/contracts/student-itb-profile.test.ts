import { describe, expect, it } from "bun:test";
import {
  ITB_FACULTIES,
  getMajorsForFaculty,
  generateEntryYears,
  isTpbStudent,
} from "@/lib/student/itb-academic-data";

describe("ITB Academic Data & TPB Logic", () => {
  it("contains all major ITB faculties", () => {
    const codes = ITB_FACULTIES.map((f) => f.code);
    expect(codes).toContain("STEI");
    expect(codes).toContain("FMIPA");
    expect(codes).toContain("FTI");
    expect(codes).toContain("FTMD");
    expect(codes).toContain("FTTM");
    expect(codes).toContain("FTSL");
    expect(codes).toContain("FITB");
    expect(codes).toContain("SAPPK");
    expect(codes).toContain("SBM");
    expect(codes).toContain("SF");
    expect(codes).toContain("SITH");
    expect(codes).toContain("FSRD");
  });

  it("retrieves majors for a specific faculty including TPB option", () => {
    const steiMajors = getMajorsForFaculty("STEI");
    expect(steiMajors.length).toBeGreaterThan(0);
    expect(steiMajors).toContain("TPB STEI (Belum Penjurusan)");
    expect(steiMajors).toContain("Teknik Informatika");

    const fmipaMajors = getMajorsForFaculty("FMIPA");
    expect(fmipaMajors).toContain("TPB FMIPA (Belum Penjurusan)");
    expect(fmipaMajors).toContain("Matematika");
    expect(fmipaMajors).toContain("Fisika");
  });

  it("returns empty array for invalid faculty code", () => {
    expect(getMajorsForFaculty("UNKNOWN")).toEqual([]);
  });

  it("generates recent entry years in descending order", () => {
    const years = generateEntryYears();
    const currentYear = new Date().getFullYear();
    expect(years[0]).toBe(currentYear);
    expect(years.length).toBeGreaterThanOrEqual(5);
    expect(years[0]).toBeGreaterThan(years[1]);
  });

  it("accurately detects TPB students", () => {
    const currentYear = new Date().getFullYear();
    // Major explicitly containing TPB
    expect(isTpbStudent(2023, "TPB STEI (Belum Penjurusan)")).toBe(true);
    // Student enrolled in current year is TPB
    expect(isTpbStudent(currentYear, "Teknik Informatika")).toBe(true);
    // Senior student with declared major is not TPB
    expect(isTpbStudent(currentYear - 2, "Teknik Informatika")).toBe(false);
  });

  it("validates that majors belong strictly to their respective faculty", () => {
    const steiMajors = getMajorsForFaculty("STEI");
    const fmipaMajors = getMajorsForFaculty("FMIPA");

    expect(steiMajors.includes("Teknik Informatika")).toBe(true);
    expect(fmipaMajors.includes("Teknik Informatika")).toBe(false);

    expect(fmipaMajors.includes("Matematika")).toBe(true);
    expect(steiMajors.includes("Matematika")).toBe(false);
  });
});
