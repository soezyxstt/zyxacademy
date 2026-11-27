"use client";

import { useEffect, useState } from "react";
import { resolveDateDisplay, type FormattedDateInput } from "@/lib/date-utils/display";
import { useAppLocale } from "@/lib/i18n/client";

export function FormattedDate(props: FormattedDateInput) {
  const { locale: appLocale } = useAppLocale();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // To prevent hydration mismatch, render using UTC on the server
  // and flip to local timezone on the client once mounted.
  const formatted = resolveDateDisplay(props, appLocale, !mounted);
  return formatted ? <span suppressHydrationWarning>{formatted.text}</span> : null;
}
