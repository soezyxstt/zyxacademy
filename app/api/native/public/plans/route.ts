import { z } from "zod";
import { getPlanPriceQuote, getPlanPricingPhase, getWhatsAppPlanUrl } from "@/lib/pricing-constants";
import { CORE_SUBJECTS, MAX_COURSES, MAX_PERSONS, MIN_COURSES, MIN_PERSONS } from "@/lib/pricing-selection";
import { getPricingDiscounts } from "@/lib/pricing-settings";
import { planTiers } from "@/lib/plan-tiers";
import id from "@/messages/id/marketing.json";
import en from "@/messages/en/marketing.json";
import type { PublicPlansData } from "@/packages/native-parity/operations/public-contract";

const selectableSubjects = new Set(CORE_SUBJECTS.slice(0, -1));
const input = z.object({
  people: z.number().int().min(MIN_PERSONS).max(MAX_PERSONS),
  subjects: z.array(z.string().max(80)).max(MAX_COURSES),
  otherSubjects: z.number().int().min(0).max(MAX_COURSES),
  locale: z.enum(["id", "en"]),
}).strict().refine(({ subjects, otherSubjects }) => {
  const count = subjects.length + otherSubjects;
  return count >= MIN_COURSES && count <= MAX_COURSES
    && new Set(subjects).size === subjects.length
    && subjects.every((subject) => selectableSubjects.has(subject));
});

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const result = input.safeParse(await request.json().catch(() => null));
  if (!result.success) return Response.json({ error: "invalid" }, { status: 400, headers });

  try {
    const { people, subjects, otherSubjects, locale } = result.data;
    const courses = subjects.length + otherSubjects;
    const { pricing } = locale === "id" ? id : en;
    const subjectList = [...subjects];
    if (otherSubjects) subjectList.push(otherSubjects === 1 ? pricing.otherCourse : pricing.otherCourseCount.replace("{count}", String(otherSubjects)));
    const settings = await getPricingDiscounts();
    const now = new Date();
    const phase = getPlanPricingPhase(now);
    const data: PublicPlansData = {
      quotes: planTiers.map(({ key }) => ({
        key,
        ...getPlanPriceQuote(key, people, courses, phase, settings, now),
        contactUrl: key === "free" ? null : getWhatsAppPlanUrl(key, pricing.tiers[key].name, people, courses, subjectList, phase, settings),
      })),
    };
    return Response.json(data, { headers });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
