"use client";

import { usePricingDiscounts } from "@/hooks/use-pricing-discounts";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { AlertCircle, Calculator, Info, Tag } from "lucide-react";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CUSTOM_MEETING_STEP,
  CUSTOM_DEFAULT_MEETINGS,
  CUSTOM_MIN_MEETINGS,
  DEFAULT_COURSES,
  DEFAULT_PERSONS,
  formatPlanPrice,
  getCustomPlanPriceQuote,
} from "@/lib/pricing-constants";
import {
  getActiveDiscountVouchers,
  type ActiveDiscountVoucher,
} from "@/app/(admin)/admin/pricing/actions";

type QuantityKey = "meetings" | "courses" | "persons";
type QuantityValues = Record<QuantityKey, string>;
type QuantityErrors = Partial<Record<QuantityKey, string>>;

const initialValues: QuantityValues = {
  meetings: String(CUSTOM_DEFAULT_MEETINGS),
  courses: String(DEFAULT_COURSES),
  persons: String(DEFAULT_PERSONS),
};

function parsePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function getQuantityError(value: string, label: string, t: ReturnType<typeof useTranslations<"adminOps">>): string | undefined {
  if (!value.trim()) return t("pricingEstimatorUI.required", { field: label.toLowerCase() });
  if (parsePositiveInteger(value) === null) return t("pricingEstimatorUI.positiveInteger", { field: label });
  return undefined;
}

export function CustomPriceEstimator({
  initialVouchers,
}: {
  initialVouchers?: ActiveDiscountVoucher[];
} = {}) {
  const t = useTranslations("adminOps");
  const { settings, now, error: pricingError } = usePricingDiscounts();
  const [values, setValues] = useState<QuantityValues>(initialValues);
  const [selectedVoucherCode, setSelectedVoucherCode] = useState<string>("none");
  const [activeVouchers, setActiveVouchers] = useState<ActiveDiscountVoucher[]>(initialVouchers ?? []);
  const [isLoadingVouchers, setIsLoadingVouchers] = useState<boolean>(!initialVouchers);
  const [voucherError, setVoucherError] = useState(false);

  useEffect(() => {
    if (!initialVouchers) {
      setIsLoadingVouchers(true);
      setVoucherError(false);
      getActiveDiscountVouchers()
        .then((res) => {
          if (res.success && res.data) {
            setActiveVouchers(res.data);
          } else {
            setVoucherError(true);
          }
        })
        .catch(() => {
          setVoucherError(true);
        })
        .finally(() => {
          setIsLoadingVouchers(false);
        });
    }
  }, [initialVouchers]);

  const selectedVoucher = useMemo(() => {
    if (selectedVoucherCode === "none") return null;
    return activeVouchers.find((v) => v.code === selectedVoucherCode) ?? null;
  }, [activeVouchers, selectedVoucherCode]);

  const quantities = useMemo(
    () => ({
      meetings: parsePositiveInteger(values.meetings),
      courses: parsePositiveInteger(values.courses),
      persons: parsePositiveInteger(values.persons),
    }),
    [values],
  );

  const errors = useMemo<QuantityErrors>(() => {
    const nextErrors: QuantityErrors = {
      meetings: getQuantityError(values.meetings, t("pricingEstimatorUI.meetings"), t),
      courses: getQuantityError(values.courses, t("pricingEstimatorUI.courses"), t),
      persons: getQuantityError(values.persons, t("pricingEstimatorUI.memberCount"), t),
    };

    if (!nextErrors.meetings && quantities.meetings !== null) {
      if (quantities.meetings < CUSTOM_MIN_MEETINGS) {
        nextErrors.meetings = t("pricingEstimatorUI.minimumMeetings", { count: CUSTOM_MIN_MEETINGS });
      } else if (quantities.meetings % CUSTOM_MEETING_STEP !== 0) {
        nextErrors.meetings = t("pricingEstimatorUI.meetingMultiple", { count: CUSTOM_MEETING_STEP });
      }
    }

    return nextErrors;
  }, [quantities, values, t]);

  const quote = useMemo(() => {
    if (
      !settings || !now ||
      errors.meetings ||
      errors.courses ||
      errors.persons ||
      quantities.meetings === null ||
      quantities.courses === null ||
      quantities.persons === null
    ) {
      return null;
    }

    return getCustomPlanPriceQuote(
      quantities.meetings,
      quantities.persons,
      quantities.courses,
      selectedVoucher?.discountPercent,
      settings,
      now,
    );
  }, [errors, quantities, selectedVoucher, settings, now]);

  const updateValue = (key: QuantityKey, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  return (
    <div
      className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
      data-custom-price-estimator
    >
      <section className="rounded-xl border border-border bg-card p-4">
        <AdminSectionTitle
          icon={Calculator}
          title={t("pricingEstimatorUI.customConfiguration")}
        />

        <div className="mt-5 grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <div className="space-y-2">
            <Label htmlFor="custom-meetings">{t("pricingEstimatorUI.meetings")}</Label>
            <Input
              id="custom-meetings"
              type="number"
              inputMode="numeric"
              min={CUSTOM_MIN_MEETINGS}
              step={CUSTOM_MEETING_STEP}
              value={values.meetings}
              onChange={(event) => updateValue("meetings", event.target.value)}
              aria-invalid={Boolean(errors.meetings)}
              aria-describedby="custom-meetings-help"
              className={errors.meetings ? "border-destructive focus-visible:border-destructive" : undefined}
            />
            <p
              id="custom-meetings-help"
              className={errors.meetings ? "text-body-xs text-destructive" : "text-body-xs text-muted-foreground"}
              aria-live="polite"
            >
              {errors.meetings ?? t("pricingEstimatorUI.meetingHelp", { count: CUSTOM_MEETING_STEP })}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-courses">{t("pricingEstimatorUI.courses")}</Label>
            <Input
              id="custom-courses"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={values.courses}
              onChange={(event) => updateValue("courses", event.target.value)}
              aria-invalid={Boolean(errors.courses)}
              aria-describedby={errors.courses ? "custom-courses-help" : undefined}
              className={errors.courses ? "border-destructive focus-visible:border-destructive" : undefined}
            />
            {errors.courses && <p id="custom-courses-help" className="text-body-xs text-destructive" aria-live="polite">{errors.courses}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-persons">{t("pricingEstimatorUI.members")}</Label>
            <Input
              id="custom-persons"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={values.persons}
              onChange={(event) => updateValue("persons", event.target.value)}
              aria-invalid={Boolean(errors.persons)}
              aria-describedby={errors.persons ? "custom-persons-help" : undefined}
              className={errors.persons ? "border-destructive focus-visible:border-destructive" : undefined}
            />
            {errors.persons && <p id="custom-persons-help" className="text-body-xs text-destructive" aria-live="polite">{errors.persons}</p>}
          </div>

          <div className="space-y-2 sm:col-span-3 xl:col-span-1 border-t border-border/70 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="custom-voucher" className="flex items-center gap-1.5">
                <Tag className="size-3.5 text-brand-primary" aria-hidden />
                {t("pricingEstimatorUI.voucherLabel")}
              </Label>
              {selectedVoucher && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setSelectedVoucherCode("none")}
                  className="h-5 px-1.5 text-body-xs text-muted-foreground hover:text-foreground"
                >
                  {t("pricingEstimatorUI.removeVoucher")}
                </Button>
              )}
            </div>

            <Select value={selectedVoucherCode} onValueChange={setSelectedVoucherCode}>
              <SelectTrigger id="custom-voucher" className="w-full">
                <SelectValue placeholder={t("pricingEstimatorUI.selectVoucher")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("pricingEstimatorUI.noVoucher")}</SelectItem>
                {activeVouchers.map((v) => (
                  <SelectItem key={v.id} value={v.code}>
                    {t("pricingEstimatorUI.voucherOption", { code: v.code, percent: v.discountPercent, remaining: v.remainingQuota })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedVoucher ? (
              <div className="flex items-center gap-1.5 text-body-2xs text-status-success font-medium">
                <Badge
                  variant="outline"
                  className="border-status-success/30 bg-status-success/10 text-status-success text-body-2xs font-semibold"
                >
                  {selectedVoucher.code} (-{selectedVoucher.discountPercent}%)
                </Badge>
                <span>{t("pricingEstimatorUI.voucherAdditional")}</span>
              </div>
            ) : voucherError ? (
              <p className="text-body-xs text-destructive" role="alert">
                {t("pricingEstimatorUI.voucherFailed")}
              </p>
            ) : isLoadingVouchers ? (
              <p className="text-body-xs text-muted-foreground">
                {t("pricingEstimatorUI.voucherLoading")}
              </p>
            ) : (
              <p className="text-body-xs text-muted-foreground">
                {activeVouchers.length > 0
                  ? t("pricingEstimatorUI.voucherHelp")
                  : t("pricingEstimatorUI.voucherEmpty")}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-start gap-2 border-t border-border/70 pt-4">
          <Info className="mt-0.5 size-4 shrink-0 text-status-info" aria-hidden="true" />
          <p className="text-body-xs leading-relaxed text-muted-foreground">
            {t("pricingEstimatorUI.priceTerms")}
          </p>
        </div>
      </section>

      <section
        className="rounded-xl border border-border bg-card p-4"
        data-price-state={quote ? "valid" : "invalid"}
      >
        <AdminSectionTitle
          icon={Calculator}
          title={t("pricingEstimatorUI.estimatedPrice")}
          right={quote && quote.discountAmount > 0 ? (
            <span className="rounded-md border border-[var(--zx-accent)]/30 bg-[var(--zx-accent)]/10 px-2 py-1 text-body-xs font-semibold text-[var(--zx-accent)]">
              {t("pricingEstimatorUI.discount", { percent: quote.discountPercent })}
            </span>
          ) : null}
        />

        {quote ? (
          <div className="mt-4 space-y-4" aria-live="polite">
            <div className={`grid gap-3 ${quote.discountAmount > 0 ? "sm:grid-cols-2" : ""}`}>
              {quote.discountAmount > 0 && <div className="space-y-2 border-t border-border pt-3">
                <p className="text-body-xs font-semibold text-muted-foreground">{t("pricingEstimatorUI.beforeDiscount")}</p>
                <p
                  className="mt-2 font-heading text-h5 font-bold text-foreground"
                  data-price-before={quote.beforeDiscount}
                >
                  <s>{formatPlanPrice(quote.beforeDiscount)}</s>
                </p>
                <p className="mt-1 text-body-xs text-muted-foreground">{t("pricingEstimatorUI.groupPerSemester")}</p>
                <div className="mt-3 border-t border-border/70 pt-3">
                  <p className="text-body-xs font-semibold text-muted-foreground">{t("pricingEstimatorUI.perPerson")}</p>
                  <p
                    className="mt-1 font-heading text-body-base font-bold text-foreground"
                    data-price-before-per-person={quote.beforeDiscountPerPerson}
                  >
                    {formatPlanPrice(quote.beforeDiscountPerPerson)}
                    <span className="ml-1 font-sans text-body-xs font-normal text-muted-foreground">{t("pricingEstimatorUI.perSemester")}</span>
                  </p>
                </div>
              </div>}

              <div className="border-l-2 border-primary pl-3 py-2">
                <p className="text-body-xs font-semibold text-[var(--zx-accent)]">{quote.discountAmount > 0 ? t("pricingEstimatorUI.afterDiscount") : t("pricingEstimatorUI.currentPrice")}</p>
                <p
                  className="mt-2 font-heading text-h5 font-bold text-foreground"
                  data-price-after={quote.afterDiscount}
                >
                  {formatPlanPrice(quote.afterDiscount)}
                </p>
                <p className="mt-1 text-body-xs text-muted-foreground">{t("pricingEstimatorUI.groupPerSemester")}</p>
                <div className="mt-3 border-t border-[var(--zx-accent)]/20 pt-3">
                  <p className="text-body-xs font-semibold text-[var(--zx-accent)]">{t("pricingEstimatorUI.perPerson")}</p>
                  <p
                    className="mt-1 font-heading text-body-base font-bold text-foreground"
                    data-price-after-per-person={quote.afterDiscountPerPerson}
                  >
                    {formatPlanPrice(quote.afterDiscountPerPerson)}
                    <span className="ml-1 font-sans text-body-xs font-normal text-muted-foreground">{t("pricingEstimatorUI.perSemester")}</span>
                  </p>
                </div>
              </div>
            </div>

            {quote.finalPrice !== undefined && (
              <div
                className="border-l-2 border-status-success pl-3 py-2 space-y-3"
                data-voucher-applied
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Tag className="size-4 text-status-success" aria-hidden />
                    <p className="text-body-xs font-semibold text-status-success">
                      {t("pricingEstimatorUI.voucherFinal", { code: selectedVoucher?.code ?? "" })}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-status-success/30 bg-status-success/15 font-bold text-status-success"
                  >
                    -{quote.voucherDiscountPercent}%
                  </Badge>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
                  <div>
                    <p
                      className="font-heading text-h5 font-bold text-foreground"
                      data-price-final={quote.finalPrice}
                    >
                      {formatPlanPrice(quote.finalPrice)}
                    </p>
                    <p className="mt-0.5 text-body-xs text-muted-foreground">
                      {t("pricingEstimatorUI.groupPaymentPerSemester")}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p
                      className="font-heading text-body-base font-bold text-foreground"
                      data-price-final-per-person={quote.finalPricePerPerson}
                    >
                      {formatPlanPrice(quote.finalPricePerPerson!)}
                      <span className="ml-1 font-sans text-body-xs font-normal text-muted-foreground">
                        {t("pricingEstimatorUI.perSemester")}
                      </span>
                    </p>
                    <p className="mt-0.5 text-body-xs text-muted-foreground">{t("pricingEstimatorUI.perPerson")}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-1 border-t border-status-success/20 pt-2 text-body-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>{t("pricingEstimatorUI.voucherDiscount", { percent: quote.voucherDiscountPercent! })}</span>
                    <span className="font-semibold text-status-success">
                      -{formatPlanPrice(quote.voucherDiscountAmount!)} (-
                      {formatPlanPrice(quote.voucherDiscountAmountPerPerson!)} {t("pricingEstimatorUI.perPersonSuffix")})
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t("pricingEstimatorUI.savings")}</span>
                    <span className="font-semibold text-foreground">
                      -{formatPlanPrice(quote.totalSavings!)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {quote.discountAmount > 0 && <div className="flex items-center justify-between gap-3 border-y border-border/70 py-3 text-body-sm">
              <span className="text-muted-foreground">{t("pricingEstimatorUI.discountAmount", { percent: quote.discountPercent })}</span>
              <div className="text-right">
                <span className="font-semibold text-status-success" data-price-discount={quote.discountAmount}>
                  -{formatPlanPrice(quote.discountAmount)}
                </span>
                <span
                  className="block text-body-xs text-muted-foreground"
                  data-price-discount-per-person={quote.discountAmountPerPerson}
                >
                  -{formatPlanPrice(quote.discountAmountPerPerson)} {t("pricingEstimatorUI.perPersonSuffix")}
                </span>
              </div>
            </div>}
          </div>
        ) : (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-status-warning/30 bg-status-warning/10 p-4" role="status">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-status-warning" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-body-sm font-semibold text-foreground">{pricingError ? t("pricingEstimatorUI.priceFailed") : !settings ? t("pricingEstimatorUI.priceLoading") : t("pricingEstimatorUI.completeConfiguration")}</p>
              {settings && !pricingError && <p className="text-body-xs leading-relaxed text-muted-foreground">
                {t("pricingEstimatorUI.priceInvalid")}
              </p>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
