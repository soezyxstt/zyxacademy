import { calculatePlanPrice, DEFAULT_PERSONS, DEFAULT_COURSES } from "./pricing-constants";

export type PlanKey = "free" | "minimal" | "essential" | "premium" | "custom";

export type PlanTier = {
  key: PlanKey;
  name: string;
  price: string;
  note: string;
  features: readonly string[];
  highlighted?: boolean;
};

const formatPrice = (amount: number): string => {
  return "Rp " + amount.toLocaleString("id-ID");
};

export const planTiers: readonly PlanTier[] = [
  {
    key: "free",
    name: "Free",
    price: "Gratis",
    note: "Akses materi dasar tanpa biaya.",
    features: ["Bank Materi dan Soal"],
  },
  {
    key: "minimal",
    name: "Minimal",
    price: formatPrice(calculatePlanPrice("minimal", DEFAULT_PERSONS, DEFAULT_COURSES)),
    note: "Pendampingan platform mandiri lengkap.",
    features: [
      "Bank Materi dan Soal",
      "Solusi Soal",
      "Diktat Lengkap",
      "Kuis Harian & Mingguan + Pembahasan",
      "Tryout Sebelum Ujian + Pembahasan",
    ],
  },
  {
    key: "essential",
    name: "Essential",
    price: formatPrice(calculatePlanPrice("essential", DEFAULT_PERSONS, DEFAULT_COURSES)),
    note: "Sesi tutorial tatap muka & pembahasan video.",
    features: [
      "Semua fitur pada paket Minimal",
      "Akses pembahasan soal berbasis Video",
      "Tutorial Tatap Muka 15x untuk Satu Semester",
    ],
    highlighted: true,
  },
  {
    key: "premium",
    name: "Premium",
    price: formatPrice(calculatePlanPrice("premium", DEFAULT_PERSONS, DEFAULT_COURSES)),
    note: "Konsultasi on-demand & intensitas penuh.",
    features: [
      "Semua fitur pada paket Essential",
      "Konsultasi Tugas Kuliah (On-Demand)",
      "Plus Tambahan 15x Tutorial (Total 30x Tatap Muka untuk Satu Semester)",
    ],
  },
  {
    key: "custom",
    name: "Custom",
    price: "Hubungi Kami",
    note: "Sesuaikan kelompok, tutor, dan kurikulum.",
    features: [
      "Ada kebutuhan spesifik di luar paket? (e.g., kelompok > 5 orang, persiapan khusus, atau penyesuaian kurikulum)",
    ],
  },
];

export const previewPlanTierKeys = ["minimal", "essential", "premium"] as const satisfies readonly PlanKey[];

export const previewPlanTiers = planTiers.filter((tier) =>
  previewPlanTierKeys.includes(tier.key as (typeof previewPlanTierKeys)[number]),
);
