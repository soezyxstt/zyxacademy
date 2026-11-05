"use client";

import { useTranslations } from "@/lib/i18n/client";
import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { savePricingDiscounts } from "@/app/(admin)/admin/pricing/actions";
import { pricingDiscountsSchema, type PricingDiscounts } from "@/lib/pricing-discounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PricingDiscountSettings({ initialSettings, save = savePricingDiscounts }: {
  initialSettings: PricingDiscounts;
  save?: typeof savePricingDiscounts;
}) {
  const t = useTranslations("adminOps");
  const [values, setValues] = useState(initialSettings);
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const queryClient = useQueryClient();

  return (
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      setMessage("");
      setFailed(false);
      if (!pricingDiscountsSchema.safeParse(values).success) {
        setFailed(true);
        setMessage(t("discountSettings.invalid"));
        return;
      }
      startTransition(async () => {
        try {
          const result = await save(values);
          if (!result.success || !result.data) throw new Error();
          queryClient.setQueryData(["pricing-discounts"], result.data);
          setMessage(t("discountSettings.saved"));
        } catch {
          setFailed(true);
          setMessage(t("discountSettings.failed"));
        }
      });
    }}>
      <p className="text-body-xs text-muted-foreground">{t("discountSettings.scheduleHelp")}</p>
      <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
        {(["platform", "tutorial"] as const).map((component) => (
          <fieldset key={component} disabled={busy} className="grid gap-3 py-4 sm:grid-cols-2 sm:items-end lg:grid-cols-[1fr_100px_1fr_1fr]">
            <legend className="sr-only">{component === "platform" ? t("discountSettings.platform") : t("discountSettings.tutorial")}</legend>
            <p className="font-heading text-body-sm font-bold sm:col-span-2 lg:col-span-1">{component === "platform" ? t("discountSettings.platform") : t("discountSettings.tutorial")}</p>
            {(["percent", "startsOn", "endsOn"] as const).map((field) => (
              <div key={field} className={`space-y-2 min-w-0 ${field === "percent" ? "sm:col-span-2 lg:col-span-1" : ""}`}>
                <Label htmlFor={`${component}-${field}`}>{field === "percent" ? t("discountSettings.percent") : field === "startsOn" ? t("discountSettings.startsOn") : t("discountSettings.endsOn")}</Label>
                <Input id={`${component}-${field}`} type={field === "percent" ? "number" : "date"}
                  className="min-w-0 text-body-sm" required min={field === "percent" ? 0 : undefined}
                  max={field === "percent" ? 100 : undefined} step={field === "percent" ? 1 : undefined}
                  value={field === "percent" && Number.isNaN(values[component].percent) ? "" : values[component][field]}
                  onChange={(event) => {
                    setMessage("");
                    setValues({ ...values, [component]: { ...values[component], [field]: field === "percent" ? (event.target.value === "" ? NaN : Number(event.target.value)) : event.target.value } });
                  }} />
              </div>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{busy ? t("discountSettings.saving") : t("discountSettings.save")}</Button>
        {message && <p role={failed ? "alert" : "status"} className={`text-body-xs ${failed ? "text-destructive" : "text-status-success"}`}>{message}</p>}
      </div>
    </form>
  );
}
