"use client";

import { useTranslations } from "@/lib/i18n/client";
import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { savePricingDiscounts } from "@/app/(admin)/admin/pricing/actions";
import { pricingDiscountsSchema, type PricingDiscounts } from "@/lib/pricing-discounts";
import { pricingDiscountsQuery } from "@/lib/query/pricing";
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
    <form className="space-y-(--related-gap)" onSubmit={async (event) => {
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
          queryClient.setQueryData(pricingDiscountsQuery().queryKey, pricingDiscountsSchema.parse(result.data));
          setMessage(t("discountSettings.saved"));
        } catch {
          setFailed(true);
          setMessage(t("discountSettings.failed"));
        }
      });
    }}>
      <p className="text-body-xs text-muted-foreground">{t("discountSettings.scheduleHelp")}</p>
      <div className="divide-y divide-border/60 border-y border-border/60">
        {(["platform", "tutorial"] as const).map((component) => (
          <fieldset key={component} disabled={busy} className="grid min-w-0 grid-cols-2 items-end gap-(--compact-gap) py-(--row-padding) lg:grid-cols-[1fr_100px_1fr_1fr]">
            <legend className="sr-only">{component === "platform" ? t("discountSettings.platform") : t("discountSettings.tutorial")}</legend>
            <p className="self-center font-heading text-body-sm font-bold">{component === "platform" ? t("discountSettings.platform") : t("discountSettings.tutorial")}</p>
            {(["percent", "startsOn", "endsOn"] as const).map((field) => (
              <div key={field} className="min-w-0 space-y-1.5">
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
        <Button type="submit" className="min-h-9" disabled={busy}>{busy ? t("discountSettings.saving") : t("discountSettings.save")}</Button>
        {message && <p role={failed ? "alert" : "status"} className={`text-body-xs ${failed ? "text-destructive" : "text-status-success"}`}>{message}</p>}
      </div>
    </form>
  );
}
