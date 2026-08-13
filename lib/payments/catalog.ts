import {
  CORE_SUBJECTS,
  MAX_COURSES,
  MAX_PERSONS,
  MIN_COURSES,
  MIN_PERSONS,
  calculatePlanPrice,
} from "@/lib/pricing-constants";

export const purchasablePlanKeys = ["minimal", "essential", "premium"] as const;

export type PurchasablePlanKey = (typeof purchasablePlanKeys)[number];

const planNames: Record<PurchasablePlanKey, string> = {
  minimal: "Minimal",
  essential: "Essential",
  premium: "Premium",
};

const standardSubjects = CORE_SUBJECTS.filter((subject) => subject !== "Mata Kuliah Lain-Lain");

export type PlanQuote = {
  planKey: PurchasablePlanKey;
  planName: string;
  persons: number;
  coursesCount: number;
  selectedCourses: string[];
  amount: number;
  productDescription: string;
};

export function isPurchasablePlanKey(value: string): value is PurchasablePlanKey {
  return purchasablePlanKeys.includes(value as PurchasablePlanKey);
}

export function createPlanQuote(input: {
  planKey: PurchasablePlanKey;
  persons: number;
  standardCourses: string[];
  otherCoursesCount: number;
}): PlanQuote {
  if (!Number.isInteger(input.persons) || input.persons < MIN_PERSONS || input.persons > MAX_PERSONS) {
    throw new Error("Jumlah anggota tidak valid.");
  }

  if (!Number.isInteger(input.otherCoursesCount) || input.otherCoursesCount < 0) {
    throw new Error("Jumlah mata kuliah lainnya tidak valid.");
  }

  const uniqueCourses = [...new Set(input.standardCourses)];
  if (uniqueCourses.length !== input.standardCourses.length) {
    throw new Error("Daftar mata kuliah memuat pilihan ganda.");
  }
  if (uniqueCourses.some((subject) => !standardSubjects.includes(subject))) {
    throw new Error("Daftar mata kuliah tidak valid.");
  }

  const coursesCount = uniqueCourses.length + input.otherCoursesCount;
  if (coursesCount < MIN_COURSES || coursesCount > MAX_COURSES) {
    throw new Error("Jumlah mata kuliah tidak valid.");
  }

  const planName = planNames[input.planKey];
  const amount = calculatePlanPrice(input.planKey, input.persons, coursesCount);
  const selectedCourses = [
    ...uniqueCourses,
    ...Array.from({ length: input.otherCoursesCount }, (_, index) => `Mata Kuliah Lain-Lain ${index + 1}`),
  ];

  return {
    planKey: input.planKey,
    planName,
    persons: input.persons,
    coursesCount,
    selectedCourses,
    amount,
    productDescription: `Paket ${planName} Zyx Academy untuk ${input.persons} orang dan ${coursesCount} mata kuliah selama satu semester`,
  };
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}
