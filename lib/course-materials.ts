export type CourseMaterialCategory =
  | "materi"
  | "soal"
  | "pembahasan_soal"
  | "materi_kelas"
  | "contoh_soal";

export type MaterialLevel1Category = "materi" | "soal" | "pembahasan_soal";

export type MaterialMateriSubcategory =
  | "materi_dosen"
  | "scl"
  | "modul"
  | "ebook"
  | "lainnya";

export type MaterialSoalSubcategory =
  | "kuis"
  | "kbf"
  | "tutorial"
  | "modul"
  | "uts"
  | "uas"
  | "up"
  | "ltm"
  | "lainnya";

export type CourseMaterialSubcategory =
  | MaterialMateriSubcategory
  | MaterialSoalSubcategory;

export type MaterialRoleQualifier =
  | "utama"
  | "bagian"
  | "aplikasi"
  | "problem"
  | "kustom";

export const LEVEL1_CATEGORIES: Array<{ value: MaterialLevel1Category; label: string }> = [
  { value: "materi", label: "Materi" },
  { value: "soal", label: "Soal" },
  { value: "pembahasan_soal", label: "Pembahasan Soal" },
];

export const MATERI_SUBCATEGORIES: Array<{ value: MaterialMateriSubcategory; label: string }> = [
  { value: "materi_dosen", label: "Materi Dosen" },
  { value: "scl", label: "SCL" },
  { value: "modul", label: "Modul" },
  { value: "ebook", label: "E-Book" },
  { value: "lainnya", label: "Lainnya" },
];

export const SOAL_SUBCATEGORIES: Array<{ value: MaterialSoalSubcategory; label: string }> = [
  { value: "kuis", label: "Kuis" },
  { value: "kbf", label: "KBF" },
  { value: "tutorial", label: "Tutorial" },
  { value: "modul", label: "Modul" },
  { value: "uts", label: "UTS" },
  { value: "uas", label: "UAS" },
  { value: "up", label: "UP" },
  { value: "ltm", label: "LTM" },
  { value: "lainnya", label: "Lainnya" },
];

export const SUBCATEGORY_LABELS: Record<CourseMaterialSubcategory, string> = {
  materi_dosen: "Materi Dosen",
  scl: "SCL",
  ebook: "E-Book",
  kuis: "Kuis",
  kbf: "KBF",
  tutorial: "Tutorial",
  modul: "Modul",
  uts: "UTS",
  uas: "UAS",
  up: "UP",
  ltm: "LTM",
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
