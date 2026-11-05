import { z } from "zod";
import { getJakartaCalendarDate, isCalendarDate } from "@/lib/date-utils";

const campaignSchema = z.object({
  percent: z.number().int().min(0).max(100),
  startsOn: z.string().refine(isCalendarDate, "Tanggal mulai tidak valid."),
  endsOn: z.string().refine(isCalendarDate, "Tanggal akhir tidak valid."),
}).strict().refine((value) => value.startsOn <= value.endsOn, "Tanggal akhir harus sama atau setelah tanggal mulai.");

export const pricingDiscountsSchema = z.object({
  platform: campaignSchema,
  tutorial: campaignSchema,
}).strict();

export type PricingDiscounts = z.infer<typeof pricingDiscountsSchema>;

export const DEFAULT_PRICING_DISCOUNTS: PricingDiscounts = {
  platform: { percent: 40, startsOn: "2026-09-12", endsOn: "2026-10-31" },
  tutorial: { percent: 40, startsOn: "2026-09-12", endsOn: "2026-10-31" },
};

export function getComponentPriceQuote(platform: number, tutorial: number, settings: PricingDiscounts, now = new Date()) {
  const day = getJakartaCalendarDate(now);
  const activePercent = (campaign: PricingDiscounts["platform"]) =>
    day >= campaign.startsOn && day <= campaign.endsOn ? campaign.percent : 0;
  const platformPercent = activePercent(settings.platform);
  const tutorialPercent = activePercent(settings.tutorial);
  const platformPrice = Math.round(platform * (100 - platformPercent) / 100);
  const tutorialPrice = Math.round(tutorial * (100 - tutorialPercent) / 100);
  const regularPrice = platform + tutorial;
  const price = platformPrice + tutorialPrice;
  return { price, regularPrice, platformPrice, tutorialPrice, platformPercent, tutorialPercent,
    discountPercent: regularPrice ? Math.floor((regularPrice - price) * 10_000 / regularPrice) / 100 : 0,
    isIntroductory: price < regularPrice };
}
