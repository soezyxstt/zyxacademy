"use client";

import { useEffect, useState } from "react";
import { normalizeDate } from "@/lib/date-utils";
import { useAppLocale } from "@/lib/i18n/client";

interface FormattedDateProps {
  date: Date | string | number;
  locale?: string;
  options?: Intl.DateTimeFormatOptions;
}

export function FormattedDate({
  date,
  locale,
  options = { dateStyle: "full", timeStyle: "short" },
}: FormattedDateProps) {
  const { locale: appLocale } = useAppLocale();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dateObj = normalizeDate(date);
  if (isNaN(dateObj.getTime())) {

    return null;
  }

  // To prevent hydration mismatch, render using UTC on the server
  // and flip to local timezone on the client once mounted.
  const resolvedLocale = locale ?? (appLocale === "id" ? "id-ID" : "en-US");
  const formattedStr = mounted
    ? dateObj.toLocaleString(resolvedLocale, options)
    : dateObj.toLocaleString(resolvedLocale, { ...options, timeZone: "UTC" });

  return <span suppressHydrationWarning>{formattedStr}</span>;
}
