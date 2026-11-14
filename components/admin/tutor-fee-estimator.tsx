"use client";

import { usePricingDiscounts } from "@/hooks/use-pricing-discounts";
import { useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n/client";
import {
  AlertCircle,
  Coins,
  GraduationCap,
  Info,
} from "lucide-react";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CUSTOM_DEFAULT_MEETINGS,
  DEFAULT_COURSES,
  DEFAULT_PERSONS,
  TUTOR_FEE_SHARE_PERCENT,
  MANAGEMENT_FEE_SHARE_PERCENT,
  formatPlanPrice,
  getTutorFeeQuote,
  type TutorFeeQuoteTier,
} from "@/lib/pricing-constants";

type QuantityKey = "meetings" | "courses" | "persons" | "customPrice";
type QuantityValues = Record<QuantityKey, string>;
type QuantityErrors = Partial<Record<QuantityKey, string>>;

const initialValues: QuantityValues = {
  meetings: String(CUSTOM_DEFAULT_MEETINGS),
  courses: String(DEFAULT_COURSES),
  persons: String(DEFAULT_PERSONS),
  customPrice: "",
};

const meetingPresets = [5, 10, 15, 30];

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

function FeeTierCard({
  title,
  tier,
  isHighlighted = false,
  badgeText,
}: {
  title: string;
  tier: TutorFeeQuoteTier;
  isHighlighted?: boolean;
  badgeText?: string;
}) {
  const t = useTranslations("adminOps");
  return (
    <div
      className={
        isHighlighted
          ? "border-l-2 border-primary pl-3 py-2"
          : "space-y-2 border-t border-border pt-3"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={
            isHighlighted
              ? "text-body-xs font-semibold text-[var(--zx-accent)]"
              : "text-body-xs font-semibold text-muted-foreground"
          }
        >
          {title}
        </p>
        {badgeText && (
          <Badge
            variant="outline"
            className="border-[var(--zx-accent)]/30 bg-[var(--zx-accent)]/10 text-body-2xs font-semibold text-[var(--zx-accent)]"
          >
            {badgeText}
          </Badge>
        )}
      </div>

      <div className="mt-3">
        <p className="text-body-2xs uppercase tracking-wider text-muted-foreground">{t("pricingEstimatorUI.feePerSession")}</p>
        <p
          className="mt-1 font-heading text-h5 font-bold text-foreground"
          data-tutor-fee-per-meeting={tier.tutorFeePerMeeting}
        >
          {formatPlanPrice(tier.tutorFeePerMeeting)}
          <span className="ml-1 font-sans text-body-xs font-normal text-muted-foreground">{t("pricingEstimatorUI.perSession")}</span>
        </p>
        <p className="mt-1 text-body-xs text-muted-foreground">
          {formatPlanPrice(tier.tutorFeePerPersonPerMeeting)} {t("pricingEstimatorUI.perPersonSession")}
        </p>
      </div>

      <div className="mt-4 space-y-2 border-t border-border/70 pt-3 text-body-xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>{t("pricingEstimatorUI.packageTotal")}</span>
          <span className="font-semibold text-foreground">{formatPlanPrice(tier.packagePrice)}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>{t("pricingEstimatorUI.netTutorialPool")}</span>
          <span className="font-semibold text-foreground">{formatPlanPrice(tier.tutorialPool)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t("pricingEstimatorUI.tutorShare")}</span>
          <span className="font-semibold text-status-success">{formatPlanPrice(tier.tutorFeeTotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t("pricingEstimatorUI.managementShare")}</span>
          <span className="font-semibold text-muted-foreground">{formatPlanPrice(tier.managementFeeTotal)}</span>
        </div>
      </div>
    </div>
  );
}

export function TutorFeeEstimator() {
  const t = useTranslations("adminOps");
  const { settings, now, error: pricingError } = usePricingDiscounts();
  const [values, setValues] = useState<QuantityValues>(initialValues);

  const parsed = useMemo(
    () => ({
      meetings: parsePositiveInteger(values.meetings),
      courses: parsePositiveInteger(values.courses),
      persons: parsePositiveInteger(values.persons),
      customPrice: values.customPrice.trim() ? parsePositiveInteger(values.customPrice) : undefined,
    }),
    [values],
  );

  const errors = useMemo<QuantityErrors>(() => {
    const nextErrors: QuantityErrors = {
      meetings: getQuantityError(values.meetings, t("pricingEstimatorUI.meetings"), t),
      courses: getQuantityError(values.courses, t("pricingEstimatorUI.courses"), t),
      persons: getQuantityError(values.persons, t("pricingEstimatorUI.memberCount"), t),
    };

    if (values.customPrice.trim() && parsed.customPrice === null) {
      nextErrors.customPrice = t("pricingEstimatorUI.positiveInteger", { field: t("pricingEstimatorUI.customPriceField") });
    }

    return nextErrors;
  }, [parsed.customPrice, values, t]);

  const quote = useMemo(() => {
    if (
      !settings || !now ||
      errors.meetings ||
      errors.courses ||
      errors.persons ||
      errors.customPrice ||
      parsed.meetings === null ||
      parsed.courses === null ||
      parsed.persons === null
    ) {
      return null;
    }

    return getTutorFeeQuote(
      parsed.meetings,
      parsed.persons,
      parsed.courses,
      parsed.customPrice ?? undefined,
      settings,
      now,
    );
  }, [errors, parsed, settings, now]);

  const updateValue = (key: QuantityKey, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleMeetingPreset = (count: number) => {
    updateValue("meetings", String(count));
  };

  return (
    <div
      className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
      data-tutor-fee-estimator
    >
      <section className="rounded-xl border border-border bg-card p-4">
        <AdminSectionTitle
          icon={Coins}
          title={t("pricingEstimatorUI.packageConfiguration")}
        />

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="tutor-meetings">{t("pricingEstimatorUI.meetings")}</Label>
              <div className="flex items-center gap-1">
                {meetingPresets.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    size="xs"
                    variant={values.meetings === String(preset) ? "default" : "outline"}
                    onClick={() => handleMeetingPreset(preset)}
                    aria-label={t("pricingEstimatorUI.meetingPreset", { count: preset })}
                    className="h-7 px-2 text-body-sm"
                  >
                    {preset}
                  </Button>
                ))}
              </div>
            </div>
            <Input
              id="tutor-meetings"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={values.meetings}
              onChange={(event) => updateValue("meetings", event.target.value)}
              aria-invalid={Boolean(errors.meetings)}
              aria-describedby={errors.meetings ? "tutor-meetings-help" : undefined}
              className={errors.meetings ? "border-destructive focus-visible:border-destructive" : undefined}
            />
            {errors.meetings && <p id="tutor-meetings-help" className="text-body-xs text-destructive" aria-live="polite">{errors.meetings}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tutor-courses">{t("pricingEstimatorUI.courses")}</Label>
              <Input
                id="tutor-courses"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={values.courses}
                onChange={(event) => updateValue("courses", event.target.value)}
                aria-invalid={Boolean(errors.courses)}
                aria-describedby={errors.courses ? "tutor-courses-help" : undefined}
                className={errors.courses ? "border-destructive focus-visible:border-destructive" : undefined}
              />
              {errors.courses && <p id="tutor-courses-help" className="text-body-xs text-destructive" aria-live="polite">{errors.courses}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tutor-persons">{t("pricingEstimatorUI.members")}</Label>
              <Input
                id="tutor-persons"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={values.persons}
                onChange={(event) => updateValue("persons", event.target.value)}
                aria-invalid={Boolean(errors.persons)}
                aria-describedby={errors.persons ? "tutor-persons-help" : undefined}
                className={errors.persons ? "border-destructive focus-visible:border-destructive" : undefined}
              />
              {errors.persons && <p id="tutor-persons-help" className="text-body-xs text-destructive" aria-live="polite">{errors.persons}</p>}
            </div>
          </div>

          <div className="space-y-2 border-t border-border/70 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="tutor-custom-price">{t("pricingEstimatorUI.customPriceOptional")}</Label>
              {values.customPrice && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => updateValue("customPrice", "")}
                  className="h-5 px-1.5 text-body-xs text-muted-foreground hover:text-foreground"
                >
                  {t("pricingEstimatorUI.useAutomaticPrice")}
                </Button>
              )}
            </div>
            <Input
              id="tutor-custom-price"
              type="number"
              inputMode="numeric"
              placeholder={t("pricingEstimatorUI.automaticPricePlaceholder")}
              min={1}
              step={10000}
              value={values.customPrice}
              onChange={(event) => updateValue("customPrice", event.target.value)}
              aria-invalid={Boolean(errors.customPrice)}
              aria-describedby="tutor-custom-price-help"
              className={errors.customPrice ? "border-destructive focus-visible:border-destructive" : undefined}
            />
            <p
              id="tutor-custom-price-help"
              className={errors.customPrice ? "text-body-xs text-destructive" : "text-body-xs text-muted-foreground"}
              aria-live="polite"
            >
              {errors.customPrice ??
                t("pricingEstimatorUI.customPriceHelp")}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2 border-t border-border/70 pt-4 text-body-xs leading-relaxed text-muted-foreground">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-status-info" aria-hidden="true" />
            <p>
              {t("pricingEstimatorUI.feeFormula", { tutorPercent: TUTOR_FEE_SHARE_PERCENT, managementPercent: MANAGEMENT_FEE_SHARE_PERCENT })}
            </p>
          </div>
        </div>
      </section>

      <section
        className="rounded-xl border border-border bg-card p-4"
        data-tutor-price-state={quote ? "valid" : "invalid"}
      >
        <AdminSectionTitle
          icon={GraduationCap}
          title={t("pricingEstimatorUI.estimatedFee")}
        />

        {quote ? (
          <div className="mt-4 space-y-4" aria-live="polite">
            {quote.custom ? (
              <div className="space-y-3">
                <FeeTierCard
                  title={t("pricingEstimatorUI.customPackage")}
                  tier={quote.custom}
                  isHighlighted
                  badgeText={t("pricingEstimatorUI.manual")}
                />
                <div className="grid gap-3 sm:grid-cols-2 opacity-75">
                  <FeeTierCard title={t("pricingEstimatorUI.currentReference")} tier={quote.introductory} />
                  {quote.introductory.packagePrice < quote.regular.packagePrice && <FeeTierCard title={t("pricingEstimatorUI.regularReference")} tier={quote.regular} />}
                </div>
              </div>
            ) : (
              <div className={`grid gap-3 ${quote.introductory.packagePrice < quote.regular.packagePrice ? "sm:grid-cols-2" : ""}`}>
                <FeeTierCard
                  title={t("pricingEstimatorUI.currentPrice")}
                  tier={quote.introductory}
                  isHighlighted
                />
                {quote.introductory.packagePrice < quote.regular.packagePrice && <FeeTierCard title={t("pricingEstimatorUI.regularPrice")} tier={quote.regular} />}
              </div>
            )}

            <div className="border-t border-border pt-3 text-body-xs">
              <span className="text-muted-foreground">{t("pricingEstimatorUI.platformCost")}</span>
              <p className="mt-1 font-semibold text-foreground" data-platform-cost={quote.platformCost}>
                {formatPlanPrice(quote.platformCost)}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {t("pricingEstimatorUI.platformAccess", { persons: quote.persons, courses: quote.courses })}
              </p>
            </div>
          </div>
        ) : (
          <div
            className="mt-6 flex items-start gap-3 rounded-lg border border-status-warning/30 bg-status-warning/10 p-4"
            role="status"
          >
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-status-warning" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-body-sm font-semibold text-foreground">{pricingError ? t("pricingEstimatorUI.priceFailed") : !settings ? t("pricingEstimatorUI.priceLoading") : t("pricingEstimatorUI.completeConfiguration")}</p>
              {settings && !pricingError && <p className="text-body-xs leading-relaxed text-muted-foreground">
                {t("pricingEstimatorUI.feeInvalid")}
              </p>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
