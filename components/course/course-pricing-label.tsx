"use client";

import { useEffect, useState } from "react";
import { badgeVariants } from "@/components/ui/badge";
import { useAppLocale } from "@/components/providers/locale-provider";
import { formatJakartaDatetimeLocal } from "@/lib/date-utils";
import { useTranslations } from "@/lib/i18n/client";
import { isCourseFreeNow, type CoursePricing } from "@/lib/student/course-pricing";

const formatters = Object.fromEntries(["en-GB", "id-ID"].map(locale => [locale, new Intl.DateTimeFormat(locale, { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })]));
const compactFormatters = Object.fromEntries(["en-GB", "id-ID"].map(locale => [locale, new Intl.DateTimeFormat(locale, { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" })]));

function CompactCourseOffer({ start, end, now, active, languageTag }: {
  start: Date;
  end: Date;
  now: Date | null;
  active: boolean | null;
  languageTag: "en-GB" | "id-ID";
}) {
  const t = useTranslations("learning");
  const format = compactFormatters[languageTag];
  const [, startClock] = formatJakartaDatetimeLocal(start).split("T");
  const [, endClock] = formatJakartaDatetimeLocal(end).split("T");
  const dateRange = format.formatRange(start, end).replace(/\s*[\u2013\u2014]\s*/g, "-");
  const schedule = startClock === endClock
    ? `${dateRange} (${startClock} WIB)`
    : `${format.format(start)} ${startClock} - ${format.format(end)} ${endClock} WIB`;
  const expired = now && now >= end;
  const label = !now ? "offerWindow" : active ? "offerActive" : expired ? "offerEnded" : "offerUpcoming";

  return (
    <p className="mt-0.5 text-body-xs text-muted-foreground">
      <span className={expired ? "font-medium" : "font-medium text-foreground dark:text-status-success"}>
        {t(`courseCatalog.${label}`)}
      </span>
      {" · "}{schedule}
    </p>
  );
}

export function CoursePricingLabel({ pricing, compact = false }: { pricing?: CoursePricing; compact?: boolean }) {
  const { locale } = useAppLocale();
  const [now, setNow] = useState<Date | null>(null);
  const start = pricing?.startsAt ? new Date(pricing.startsAt.valueOf()) : null;
  const end = pricing?.endsAt ? new Date(pricing.endsAt.valueOf()) : null;
  const startTime = start?.getTime();
  const endTime = end?.getTime();
  useEffect(() => {
    if (pricing?.category !== "limited_time_free") return;
    if (startTime == null || endTime == null || !(startTime < endTime)) return;
    let timer: ReturnType<typeof setTimeout>;
    function update() {
      clearTimeout(timer);
      if (document.hidden) return;
      const current = Date.now();
      setNow(new Date(current));
      const next = current < startTime! ? startTime! : endTime!;
      if (current < next) timer = setTimeout(update, Math.min(next - current, 2_147_483_647));
    }
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [pricing?.category, startTime, endTime]);
  if (!pricing || pricing.category === "premium") return <span className={badgeVariants({ variant: "secondary" })}>Premium</span>;
  if (pricing.category === "free") return <span className={badgeVariants({ variant: "outline", className: "border-status-success/25 bg-status-success/10 text-status-success" })}>Free</span>;
  if (!start || !end || !Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime! >= endTime!) return compact ? null : <span className={badgeVariants({ variant: "secondary" })}>Premium</span>;
  const languageTag = locale === "en" ? "en-GB" : "id-ID";
  const active = now && isCourseFreeNow({ category: "limited_time_free", startsAt: start, endsAt: end }, now);
  if (compact) {
    return <CompactCourseOffer start={start} end={end} now={now} active={active} languageTag={languageTag} />;
  }
  const format = formatters[languageTag];
  const schedule = `${format.format(start)} - ${format.format(end)} WIB`;
  const state = !now ? "Limited Time Free" : active ? "Limited Time Free" : now < start ? (locale === "en" ? "Upcoming Limited Time Free" : "Limited Time Free akan dimulai") : (locale === "en" ? "Limited Time Free expired" : "Limited Time Free telah berakhir");
  return <span className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-body-xs text-muted-foreground"><span className={badgeVariants({ variant: active || !now ? "outline" : "secondary", className: active || !now ? "border-status-warning/25 bg-status-warning/10 text-status-warning" : undefined })}>{active || !now ? "Limited Time Free" : "Premium"}</span><span>{state === "Limited Time Free" ? schedule : `${state}. ${schedule}`}</span></span>;
}
