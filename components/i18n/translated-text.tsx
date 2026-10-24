"use client";

import { useTranslations } from "next-intl";
import type { ElementType } from "react";

/** A client translation leaf for copy whose parent server component owns state. */
export function TranslatedText({
  namespace,
  messageKey,
  values,
  as: Element = "span",
  className,
}: {
  namespace: string;
  messageKey: string;
  values?: Record<string, string | number | Date>;
  as?: ElementType;
  className?: string;
}) {
  const t = useTranslations(namespace as never) as unknown as (
    key: string,
    values?: Record<string, string | number | Date>,
  ) => string;
  return <Element className={className}>{t(messageKey, values)}</Element>;
}
