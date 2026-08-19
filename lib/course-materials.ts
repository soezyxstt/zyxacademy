export type CourseMaterialCategory =
  | "materi"
  | "soal"
  | "pembahasan_soal"
  | "materi_kelas"
  | "contoh_soal";

export type MaterialLevel1Category = "materi" | "soal" | "pembahasan_soal";

export type MaterialMateriSubcategory =
  | "ppt_dosen"
  | "ebook"
  | "catatan"
  | "lainnya";

export type MaterialSoalSubcategory =
  | "kuis"
  | "kbf"
  | "tutorial"
  | "modul"
  | "uts"
  | "uas"
  | "lainnya";

export type CourseMaterialSubcategory =
  | MaterialMateriSubcategory
  | MaterialSoalSubcategory;

export const LEVEL1_CATEGORIES: Array<{ value: MaterialLevel1Category; label: string }> = [
  { value: "materi", label: "Materi" },
  { value: "soal", label: "Soal" },
  { value: "pembahasan_soal", label: "Pembahasan Soal" },
];

export const MATERI_SUBCATEGORIES: Array<{ value: MaterialMateriSubcategory; label: string }> = [
  { value: "ppt_dosen", label: "PPT Dosen" },
  { value: "ebook", label: "E-Book" },
  { value: "catatan", label: "Catatan" },
  { value: "lainnya", label: "Lainnya" },
];

export const SOAL_SUBCATEGORIES: Array<{ value: MaterialSoalSubcategory; label: string }> = [
  { value: "kuis", label: "Kuis" },
  { value: "kbf", label: "KBF" },
  { value: "tutorial", label: "Tutorial" },
  { value: "modul", label: "Modul" },
  { value: "uts", label: "UTS" },
  { value: "uas", label: "UAS" },
  { value: "lainnya", label: "Lainnya" },
];

export const SUBCATEGORY_LABELS: Record<CourseMaterialSubcategory, string> = {
  ppt_dosen: "PPT Dosen",
  ebook: "E-Book",
  catatan: "Catatan",
  kuis: "Kuis",
  kbf: "KBF",
  tutorial: "Tutorial",
  modul: "Modul",
  uts: "UTS",
  uas: "UAS",
  lainnya: "Lainnya",
};

export const LEVEL1_LABELS: Record<string, string> = {
  materi: "Materi",
  soal: "Soal",
  pembahasan_soal: "Pembahasan Soal",
  materi_kelas: "Materi",
  contoh_soal: "Soal",
  solusi: "Pembahasan Soal",
  diktat: "Diktat",
};

export function getSubcategoriesForLevel1(
  level1: MaterialLevel1Category | "materi_kelas" | "contoh_soal"
): Array<{ value: CourseMaterialSubcategory; label: string }> {
  if (level1 === "materi" || level1 === "materi_kelas") {
    return MATERI_SUBCATEGORIES;
  }
  return SOAL_SUBCATEGORIES;
}

export function isValidSubcategory(
  level1: string,
  subcat?: string | null
): boolean {
  if (!subcat) return true;
  const validList = getSubcategoriesForLevel1(level1 as any);
  return validList.some((s) => s.value === subcat);
}

export function normalizeLevel1Category(type: string): MaterialLevel1Category {
  if (type === "contoh_soal") return "soal";
  if (type === "materi_kelas") return "materi";
  if (type === "pembahasan_soal") return "pembahasan_soal";
  if (type === "soal") return "soal";
  return "materi";
}

export function getSubcategoryLabel(subcat?: string | null): string | null {
  if (!subcat) return null;
  return SUBCATEGORY_LABELS[subcat as CourseMaterialSubcategory] || subcat;
}
