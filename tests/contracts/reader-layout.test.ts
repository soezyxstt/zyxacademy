import { describe, expect, test } from "bun:test";
import { isMaterialReaderPathname } from "@/lib/materials/reader-layout";
import { formatReaderTocTitle } from "@/lib/materials/reader-toc";

describe("reader layout helpers", () => {
  test("recognizes material detail readers without matching the document list", () => {
    expect(isMaterialReaderPathname("/courses/matematika-1/material/diktat-1")).toBe(true);
    expect(isMaterialReaderPathname("/courses/matematika-1/material/artikel-1/")).toBe(true);
    expect(isMaterialReaderPathname("/courses/matematika-1/material")).toBe(false);
    expect(isMaterialReaderPathname("/courses/matematika-1")).toBe(false);
  });

  test("keeps only the section title for table of contents labels", () => {
    expect(formatReaderTocTitle("Bagian 1.2: Aturan operasi pertaksamaan")).toBe("Aturan operasi pertaksamaan");
    expect(formatReaderTocTitle("2.3 Contoh penerapan")).toBe("Contoh penerapan");
    expect(formatReaderTocTitle("Ringkasan dan refleksi")).toBe("Ringkasan dan refleksi");
  });
});
