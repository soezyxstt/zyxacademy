"use client";

import { useEffect, useState } from "react";

interface FormattedDateProps {
  date: Date | string | number;
  locale?: string;
  options?: Intl.DateTimeFormatOptions;
}

export function FormattedDate({
  date,
  locale = "id-ID",
  options = { dateStyle: "full", timeStyle: "short" },
}: FormattedDateProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return null;
  }

  // To prevent hydration mismatch, render using UTC on the server
  // and flip to local timezone on the client once mounted.
  const formattedStr = mounted
    ? dateObj.toLocaleString(locale, options)
    : dateObj.toLocaleString(locale, { ...options, timeZone: "UTC" });

  return <span suppressHydrationWarning>{formattedStr}</span>;
}
