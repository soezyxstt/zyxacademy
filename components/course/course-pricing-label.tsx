"use client";

import { useEffect, useState } from "react";
import { badgeVariants } from "@/components/ui/badge";
import { useAppLocale } from "@/components/providers/locale-provider";
import { isCourseFreeNow, type CoursePricing } from "@/lib/student/course-pricing";

export function CoursePricingLabel({ pricing }: { pricing?: CoursePricing }) {
  const { locale } = useAppLocale();
  const [now, setNow] = useState<Date | null>(null);
  const start = pricing?.startsAt ? new Date(pricing.startsAt.valueOf()) : null;
  const end = pricing?.endsAt ? new Date(pricing.endsAt.valueOf()) : null;
  const startTime = start?.getTime();
  const endTime = end?.getTime();
  useEffect(() => {
    if (pricing?.category !== "limited_time_free") return;
    const update = () => setNow(new Date());
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [pricing?.category, startTime, endTime]);
  if (!pricing || pricing.category === "premium") return <span className={badgeVariants({ variant: "secondary" })}>Premium</span>;
  if (pricing.category === "free") return <span className={badgeVariants({ variant: "outline", className: "border-status-success/25 bg-status-success/10 text-status-success" })}>Free</span>;
  if (!start || !end || !Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime! >= endTime!) return <span className={badgeVariants({ variant: "secondary" })}>Premium</span>;
  const format = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
  const schedule = `${format.format(start)} - ${format.format(end)} WIB`;
  const active = now && isCourseFreeNow({ category: "limited_time_free", startsAt: start, endsAt: end }, now);
  const state = !now ? "Limited Time Free" : active ? "Limited Time Free" : now < start ? (locale === "en" ? "Upcoming Limited Time Free" : "Limited Time Free akan dimulai") : (locale === "en" ? "Limited Time Free expired" : "Limited Time Free telah berakhir");
  return <span className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-body-xs text-muted-foreground"><span className={badgeVariants({ variant: active || !now ? "outline" : "secondary", className: active || !now ? "border-status-warning/25 bg-status-warning/10 text-status-warning" : undefined })}>{active || !now ? "Limited Time Free" : "Premium"}</span><span>{state === "Limited Time Free" ? schedule : `${state}. ${schedule}`}</span></span>;
}
