"use client";

import { useTranslations } from "@/lib/i18n/client";

export function DistributionBar({ low, mid, high, total, className }: {
  low: number;
  mid: number;
  high: number;
  total: number;
  className?: string;
}) {
  const t = useTranslations("tutor.analytics");
  const denominator = total || 1;
  const lowPct = (low / denominator) * 100;
  const midPct = (mid / denominator) * 100;
  const highPct = (high / denominator) * 100;
  const values = { low, mid, high };

  return (
    <div
      role="img"
      aria-label={t("distributionAria", values)}
      title={t("distributionTitle", values)}
      className={`flex h-1.5 rounded-md overflow-hidden bg-muted ${className ?? "w-32"}`}
    >
      <div className="h-full bg-status-error" style={{ width: `${lowPct}%` }} />
      <div className="h-full bg-status-warning" style={{ width: `${midPct}%` }} />
      <div className="h-full bg-primary" style={{ width: `${highPct}%` }} />
    </div>
  );
}
