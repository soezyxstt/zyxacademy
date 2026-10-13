import { env } from "@/lib/env";
import { getJakartaCalendarDate } from "@/lib/date-utils";
import type { PlanKey } from "@/lib/plan-tiers";

export const INTRO_PRICE_START = "2026-09-12";
export const REGULAR_PRICE_START = "2026-11-01";
export const INTRO_DISCOUNT_PERCENT = 40;
export type PlanPricingPhase = "before" | "intro" | "regular";

export function getPlanPricingPhase(now: Date = new Date()): PlanPricingPhase {
  const day = getJakartaCalendarDate(now);
  return day < INTRO_PRICE_START ? "before" : day < REGULAR_PRICE_START ? "intro" : "regular";
}

export function formatPlanPrice(amount: number): string {
  return "Rp " + amount.toLocaleString("id-ID");
}


// ==========================================
// 1. CONSTANTS
// ==========================================
export const DEFAULT_PERSONS = 3;
export const MIN_PERSONS = 1;
export const MAX_PERSONS = 5;

export const DEFAULT_COURSES = 3;
export const MIN_COURSES = 1;
export const MAX_COURSES = 5;

export const CUSTOM_DEFAULT_MEETINGS = 15;
export const CUSTOM_MIN_MEETINGS = 5;
export const CUSTOM_MEETING_STEP = 5;

// List of core university courses represented
export const CORE_SUBJECTS = [
  "Matematika I",
  "Fisika I",
  "Kimia I",
  "Matematika II",
  "Fisika II",
  "Kimia II",
  "Berpikir Komputasional",
  "Literasi Data dan Intelegensi Artifisial",
  "Statistika/Sejenisnya",
  "Matematika Rekayasa/Sejenisnya",
  "Mata Kuliah Lain-Lain"
];

// ==========================================
// 2. PRICING LOGIC & MATHEMATICAL FORMULATION
// ==========================================

export const roundToFive = (num: number) => Math.ceil(num / 5) * 5;

/**
 * Component 1: Platform & Resource Access Cost
 * Calibrated exponents: Nc = 0.55 (Course Scaling), Np = 0.85 (Person Scaling)
 */
export const getPlatformCost = (baseConstant: number, courseCount: number, persons: number) => {
  return 1000 * roundToFive(baseConstant * Math.pow(courseCount, 0.55) * Math.pow(persons, 0.85));
};

/**
 * Component 2: In-Person / Online Tutorial Session Cost
 * Exponent: Np = 0.44 (Group Sharing Discount for Tutor Fee)
 */
export const getTutorialCost = (meetCount: number, baseConstant: number, persons: number) => {
  const costPerSession = roundToFive(baseConstant * Math.pow(persons, 0.44));
  return meetCount * 1000 * costPerSession;
};

function roundPlanTotal(rawPrice: number, persons: number): number {
  // The price is in Rupiah. Round the price in thousands to a multiple of 5 * persons (defaulting to 5).
  const priceInThousands = rawPrice / 1000;
  const multiple = 5 * (persons || 1);
  const roundedInThousands = Math.ceil(priceInThousands / multiple) * multiple;
  return roundedInThousands * 1000;
}

/**
 * Calculates the total price for a given plan reactively.
 */
const calculateIntroductoryPrice = (
  plan: 'free' | 'minimal' | 'essential' | 'premium' | 'custom',
  persons: number,
  courses: number
): number => {
  let rawPrice = 0;
  switch (plan) {
    case 'free':
      return 0;
    case 'minimal':
      rawPrice = getPlatformCost(250, courses, persons);
      break;

    case 'essential': {
      const tutorialComponent = getTutorialCost(15, 155, persons);
      const platformComponent = getPlatformCost(250, courses, persons);
      rawPrice = tutorialComponent + platformComponent;
      break;
    }

    case 'premium': {
      const tutorialComponent = getTutorialCost(30, 155, persons);
      // Premium platform uses base constant 285 due to On-Demand Assignment Consultation
      const platformComponent = getPlatformCost(285, courses, persons);
      rawPrice = tutorialComponent + platformComponent;
      break;
    }

    case 'custom':
    default:
      return 0; // Handled as "Hubungi Kami" string in UI
  }

  return roundPlanTotal(rawPrice, persons);
};

export type CustomPlanPriceQuote = {
  beforeDiscount: number;
  beforeDiscountPerPerson: number;
  afterDiscount: number;
  afterDiscountPerPerson: number;
  discountAmount: number;
  discountAmountPerPerson: number;
  discountPercent: number;
  voucherDiscountPercent?: number;
  voucherDiscountAmount?: number;
  voucherDiscountAmountPerPerson?: number;
  finalPrice?: number;
  finalPricePerPerson?: number;
  totalSavings?: number;
};

/**
 * Estimates a custom package using the shared platform and tutorial components.
 * Custom tutorial quantities are intentionally limited to positive multiples of five.
 */
export function getCustomPlanPriceQuote(
  meetings: number,
  persons: number,
  courses: number,
  voucherDiscountPercent?: number,
): CustomPlanPriceQuote {
  const quantities = [meetings, persons, courses];
  if (!quantities.every((value) => Number.isInteger(value) && value > 0)) {
    throw new RangeError("Jumlah pertemuan, mata kuliah, dan anggota harus berupa bilangan bulat positif.");
  }
  if (meetings < CUSTOM_MIN_MEETINGS || meetings % CUSTOM_MEETING_STEP !== 0) {
    throw new RangeError(`Jumlah pertemuan harus kelipatan ${CUSTOM_MEETING_STEP}.`);
  }
  if (voucherDiscountPercent !== undefined) {
    if (!Number.isInteger(voucherDiscountPercent) || voucherDiscountPercent < 1 || voucherDiscountPercent > 100) {
      throw new RangeError("Persentase diskon voucher harus berupa bilangan bulat antara 1 dan 100.");
    }
  }

  const platformComponent = getPlatformCost(250, courses, persons);
  const tutorialComponent = getTutorialCost(meetings, 155, persons);
  const afterDiscount = roundPlanTotal(platformComponent + tutorialComponent, persons);
  const beforeDiscount = Math.ceil((afterDiscount * 100) / (100 - INTRO_DISCOUNT_PERCENT));
  const beforeDiscountPerPerson = Math.round(beforeDiscount / persons);
  const afterDiscountPerPerson = Math.round(afterDiscount / persons);
  const discountAmount = beforeDiscount - afterDiscount;
  const discountAmountPerPerson = beforeDiscountPerPerson - afterDiscountPerPerson;

  let voucherDiscountAmount: number | undefined;
  let voucherDiscountAmountPerPerson: number | undefined;
  let finalPrice: number | undefined;
  let finalPricePerPerson: number | undefined;
  let totalSavings: number | undefined;

  if (voucherDiscountPercent !== undefined && voucherDiscountPercent > 0) {
    voucherDiscountAmount = Math.round(afterDiscount * (voucherDiscountPercent / 100));
    finalPrice = Math.max(0, afterDiscount - voucherDiscountAmount);
    finalPricePerPerson = Math.round(finalPrice / persons);
    voucherDiscountAmountPerPerson = Math.round(voucherDiscountAmount / persons);
    totalSavings = discountAmount + voucherDiscountAmount;
  }

  return {
    beforeDiscount,
    beforeDiscountPerPerson,
    afterDiscount,
    afterDiscountPerPerson,
    discountAmount,
    discountAmountPerPerson,
    discountPercent: INTRO_DISCOUNT_PERCENT,
    voucherDiscountPercent,
    voucherDiscountAmount,
    voucherDiscountAmountPerPerson,
    finalPrice,
    finalPricePerPerson,
    totalSavings,
  };
}

export const TUTOR_FEE_SHARE_PERCENT = 70;
export const MANAGEMENT_FEE_SHARE_PERCENT = 30;

export type TutorFeeQuoteTier = {
  packagePrice: number;
  tutorialPool: number;
  tutorFeeTotal: number;
  managementFeeTotal: number;
  tutorFeePerMeeting: number;
  managementFeePerMeeting: number;
  tutorFeePerPersonPerMeeting: number;
};

export type TutorFeeQuote = {
  meetings: number;
  persons: number;
  courses: number;
  platformCost: number;
  introductory: TutorFeeQuoteTier;
  regular: TutorFeeQuoteTier;
  custom?: TutorFeeQuoteTier;
};

function buildTutorFeeQuoteTier(
  packagePrice: number,
  platformCost: number,
  meetings: number,
  persons: number,
): TutorFeeQuoteTier {
  const tutorialPool = Math.max(0, packagePrice - platformCost);
  const tutorFeeTotal = Math.round(tutorialPool * (TUTOR_FEE_SHARE_PERCENT / 100));
  const managementFeeTotal = tutorialPool - tutorFeeTotal;
  const tutorFeePerMeeting = Math.round(tutorFeeTotal / meetings);
  const managementFeePerMeeting = Math.round(managementFeeTotal / meetings);
  const tutorFeePerPersonPerMeeting = Math.round(tutorFeePerMeeting / persons);

  return {
    packagePrice,
    tutorialPool,
    tutorFeeTotal,
    managementFeeTotal,
    tutorFeePerMeeting,
    managementFeePerMeeting,
    tutorFeePerPersonPerMeeting,
  };
}

export function getTutorFeeQuote(
  meetings: number,
  persons: number,
  courses: number,
  customPackagePrice?: number,
): TutorFeeQuote {
  const quantities = [meetings, persons, courses];
  if (!quantities.every((value) => Number.isInteger(value) && value > 0)) {
    throw new RangeError("Jumlah pertemuan, mata kuliah, dan anggota harus berupa bilangan bulat positif.");
  }
  if (customPackagePrice !== undefined) {
    if (!Number.isInteger(customPackagePrice) || customPackagePrice <= 0) {
      throw new RangeError("Harga paket kustom harus berupa bilangan bulat positif.");
    }
  }

  const platformCost = getPlatformCost(250, courses, persons);
  const tutorialComponent = getTutorialCost(meetings, 155, persons);
  const afterDiscount = roundPlanTotal(platformCost + tutorialComponent, persons);
  const beforeDiscount = Math.ceil((afterDiscount * 100) / (100 - INTRO_DISCOUNT_PERCENT));

  return {
    meetings,
    persons,
    courses,
    platformCost,
    introductory: buildTutorFeeQuoteTier(afterDiscount, platformCost, meetings, persons),
    regular: buildTutorFeeQuoteTier(beforeDiscount, platformCost, meetings, persons),
    custom:
      customPackagePrice !== undefined
        ? buildTutorFeeQuoteTier(customPackagePrice, platformCost, meetings, persons)
        : undefined,
  };
}


export function getPlanPriceQuote(
  plan: PlanKey,
  persons: number,
  courses: number,
  phase: PlanPricingPhase = getPlanPricingPhase(),
) {
  const introductoryPrice = calculateIntroductoryPrice(plan, persons, courses);
  // Whole Rupiah, rounded up so the advertised saving is at least 40%.
  const regularPrice = Math.ceil(introductoryPrice * 100 / (100 - INTRO_DISCOUNT_PERCENT));
  return {
    price: phase === "regular" ? regularPrice : introductoryPrice,
    regularPrice,
    isIntroductory: phase === "intro" && introductoryPrice > 0,
  };
}

export function calculatePlanPrice(plan: PlanKey, persons: number, courses: number, now: Date = new Date()): number {
  return getPlanPriceQuote(plan, persons, courses, getPlanPricingPhase(now)).price;
}

// ==========================================
// 3. WHATSAPP LINK GENERATOR
// ==========================================

/**
 * Constructs the WhatsApp URL for a plan with customized pre-filled message.
 */
export const getWhatsAppPlanUrl = (
  planKey: 'free' | 'minimal' | 'essential' | 'premium' | 'custom',
  planName: string,
  persons: number,
  courses: number,
  selectedCourses?: string[],
  phase: PlanPricingPhase = getPlanPricingPhase(),
): string | null => {
  const rawNumber = env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim();
  const digits = rawNumber?.replace(/\D/g, "") ?? "";
  if (digits.length < 8) return null;

  return buildWhatsAppPlanUrl(digits, planKey, planName, persons, courses, selectedCourses, phase);
};

/** Builds a plan-specific WhatsApp URL from an already verified public number. */
export const buildWhatsAppPlanUrl = (
  rawNumber: string,
  planKey: 'free' | 'minimal' | 'essential' | 'premium' | 'custom',
  planName: string,
  persons: number,
  courses: number,
  selectedCourses?: string[],
  phase: PlanPricingPhase = getPlanPricingPhase(),
): string => {
  const digits = rawNumber.replace(/\D/g, "");
  if (digits.length < 8) {
    throw new Error("A valid public WhatsApp number is required.");
  }
  
  let courseDetails = "";
  if (selectedCourses && selectedCourses.length > 0) {
    courseDetails = ` (${selectedCourses.join(", ")})`;
  }
  
  let message = "";
  if (planKey === 'custom') {
    message = `Halo Admin, saya ingin mendaftar paket Custom untuk grup berisi ${persons} orang dengan total ${courses} mata kuliah${courseDetails}. Saya ingin berkonsultasi mengenai kebutuhan khusus kami.`;
  } else {
    message = `Halo Admin, saya ingin mendaftar paket ${planName} untuk grup berisi ${persons} orang dengan total ${courses} mata kuliah${courseDetails}.`;
  }
  
  if (planKey !== "custom" && planKey !== "free") {
    const quote = getPlanPriceQuote(planKey, persons, courses, phase);
    message += ` Total paket per semester: ${formatPlanPrice(quote.price)}.`;
    if (quote.isIntroductory) {
      message += ` Harga perkenalan hemat 40% berlaku sampai 31 Oktober 2026 pukul 23.59 WIB. Harga reguler mulai 1 November 2026: ${formatPlanPrice(quote.regularPrice)}. Mohon konfirmasi harga saat pembayaran.`;
    }
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};
