"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  Coins,
  GraduationCap,
  Info,
  Layers,
  Sparkles,
  Users,
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

function getQuantityError(value: string, label: string): string | undefined {
  if (!value.trim()) return `Masukkan ${label.toLowerCase()}.`;
  if (parsePositiveInteger(value) === null) return `${label} harus berupa bilangan bulat positif.`;
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
  return (
    <div
      className={
        isHighlighted
          ? "rounded-lg border border-[var(--zx-accent)]/30 bg-[var(--zx-accent)]/8 p-4"
          : "rounded-lg border border-border/70 bg-muted/30 p-4"
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
        <p className="text-body-2xs uppercase tracking-wider text-muted-foreground">Fee tutor per sesi</p>
        <p
          className="mt-1 font-heading text-h5 font-bold text-foreground"
          data-tutor-fee-per-meeting={tier.tutorFeePerMeeting}
        >
          {formatPlanPrice(tier.tutorFeePerMeeting)}
          <span className="ml-1 font-sans text-body-xs font-normal text-muted-foreground">/ sesi</span>
        </p>
        <p className="mt-1 text-body-xs text-muted-foreground">
          {formatPlanPrice(tier.tutorFeePerPersonPerMeeting)} / orang / sesi
        </p>
      </div>

      <div className="mt-4 space-y-2 border-t border-border/70 pt-3 text-body-xs">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Total paket murid</span>
          <span className="font-semibold text-foreground">{formatPlanPrice(tier.packagePrice)}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Pool tutorial bersih</span>
          <span className="font-semibold text-foreground">{formatPlanPrice(tier.tutorialPool)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Porsi tutor (70%)</span>
          <span className="font-semibold text-status-success">{formatPlanPrice(tier.tutorFeeTotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Porsi manajemen (30%)</span>
          <span className="font-semibold text-muted-foreground">{formatPlanPrice(tier.managementFeeTotal)}</span>
        </div>
      </div>
    </div>
  );
}

export function TutorFeeEstimator() {
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
      meetings: getQuantityError(values.meetings, "Jumlah pertemuan"),
      courses: getQuantityError(values.courses, "Jumlah mata kuliah"),
      persons: getQuantityError(values.persons, "Jumlah anggota kelompok"),
    };

    if (values.customPrice.trim() && parsed.customPrice === null) {
      nextErrors.customPrice = "Harga paket kustom harus berupa bilangan bulat positif.";
    }

    return nextErrors;
  }, [parsed.customPrice, values]);

  const quote = useMemo(() => {
    if (
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
    );
  }, [errors, parsed]);

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
      <section className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-xs backdrop-blur-md sm:p-5">
        <AdminSectionTitle
          icon={Coins}
          title="Konfigurasi paket & sesi"
          description="Tentukan parameter paket untuk menghitung alokasi fee tutor per pertemuan."
        />

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tutor-meetings">Jumlah pertemuan</Label>
              <div className="flex items-center gap-1">
                {meetingPresets.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    size="xs"
                    variant={values.meetings === String(preset) ? "default" : "outline"}
                    onClick={() => handleMeetingPreset(preset)}
                    className="h-5 px-1.5 text-body-2xs"
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
              aria-describedby="tutor-meetings-help"
              className={errors.meetings ? "border-destructive focus-visible:border-destructive" : undefined}
            />
            <p
              id="tutor-meetings-help"
              className={errors.meetings ? "text-body-xs text-destructive" : "text-body-xs text-muted-foreground"}
              aria-live="polite"
            >
              {errors.meetings ?? "Total sesi pertemuan tutorial yang akan dibawakan."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tutor-courses">Jumlah mata kuliah</Label>
              <Input
                id="tutor-courses"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={values.courses}
                onChange={(event) => updateValue("courses", event.target.value)}
                aria-invalid={Boolean(errors.courses)}
                aria-describedby="tutor-courses-help"
                className={errors.courses ? "border-destructive focus-visible:border-destructive" : undefined}
              />
              <p
                id="tutor-courses-help"
                className={errors.courses ? "text-body-xs text-destructive" : "text-body-xs text-muted-foreground"}
                aria-live="polite"
              >
                {errors.courses ?? "Mata kuliah yang diampu."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tutor-persons">Anggota kelompok</Label>
              <Input
                id="tutor-persons"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={values.persons}
                onChange={(event) => updateValue("persons", event.target.value)}
                aria-invalid={Boolean(errors.persons)}
                aria-describedby="tutor-persons-help"
                className={errors.persons ? "border-destructive focus-visible:border-destructive" : undefined}
              />
              <p
                id="tutor-persons-help"
                className={errors.persons ? "text-body-xs text-destructive" : "text-body-xs text-muted-foreground"}
                aria-live="polite"
              >
                {errors.persons ?? "Jumlah murid dalam kelompok."}
              </p>
            </div>
          </div>

          <div className="space-y-2 border-t border-border/70 pt-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="tutor-custom-price">Override harga paket (opsional)</Label>
              {values.customPrice && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => updateValue("customPrice", "")}
                  className="h-5 px-1.5 text-body-2xs text-muted-foreground hover:text-foreground"
                >
                  Reset otomatis
                </Button>
              )}
            </div>
            <Input
              id="tutor-custom-price"
              type="number"
              inputMode="numeric"
              placeholder="Contoh: 4000000 (kosongkan untuk hitung otomatis)"
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
                "Isi hanya jika kelompok membayar nominal khusus di luar harga paket standar."}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2 border-t border-border/70 pt-4 text-body-xs leading-relaxed text-muted-foreground">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-status-info" aria-hidden="true" />
            <p>
              Rumus: <strong>(Total paket - Biaya platform) / Jumlah pertemuan</strong>, lalu dibagi{" "}
              <strong>70% fee tutor</strong> dan <strong>30% biaya manajemen</strong>.
            </p>
          </div>
        </div>
      </section>

      <section
        className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-xs backdrop-blur-md sm:p-5"
        data-tutor-price-state={quote ? "valid" : "invalid"}
      >
        <AdminSectionTitle
          icon={GraduationCap}
          title="Perkiraan fee tutor"
          description="Alokasi pembagian hasil bersih setelah dikurangi biaya platform Zyx."
          right={
            <Badge
              variant="outline"
              className="border-brand-primary/30 bg-brand-primary/10 text-body-xs font-semibold text-brand-primary"
            >
              Split {TUTOR_FEE_SHARE_PERCENT}% / {MANAGEMENT_FEE_SHARE_PERCENT}%
            </Badge>
          }
        />

        {quote ? (
          <div className="mt-6 space-y-5" aria-live="polite">
            {quote.custom ? (
              <div className="space-y-3">
                <FeeTierCard
                  title="Skema harga kustom (override)"
                  tier={quote.custom}
                  isHighlighted
                  badgeText="Manual"
                />
                <div className="grid gap-3 sm:grid-cols-2 opacity-75">
                  <FeeTierCard title="Referensi promo (setelah diskon)" tier={quote.introductory} />
                  <FeeTierCard title="Referensi reguler (sebelum diskon)" tier={quote.regular} />
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <FeeTierCard
                  title="Skema promo (setelah diskon)"
                  tier={quote.introductory}
                  isHighlighted
                  badgeText="Diskon 40%"
                />
                <FeeTierCard title="Skema reguler (sebelum diskon)" tier={quote.regular} />
              </div>
            )}

            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <p className="text-body-xs font-semibold text-foreground">Rincian komponen perhitungan</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3 text-body-xs">
                <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
                  <span className="text-muted-foreground">Biaya platform Zyx</span>
                  <p className="mt-1 font-semibold text-foreground" data-platform-cost={quote.platformCost}>
                    {formatPlanPrice(quote.platformCost)}
                  </p>
                  <p className="mt-0.5 text-body-2xs text-muted-foreground">
                    Akses materi & sistem untuk {quote.persons} murid ({quote.courses} matkul)
                  </p>
                </div>
                <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
                  <span className="text-muted-foreground">Alokasi tutor (70%)</span>
                  <p className="mt-1 font-semibold text-status-success">
                    {formatPlanPrice(
                      quote.custom ? quote.custom.tutorFeeTotal : quote.introductory.tutorFeeTotal,
                    )}
                  </p>
                  <p className="mt-0.5 text-body-2xs text-muted-foreground">
                    Untuk {quote.meetings} pertemuan total
                  </p>
                </div>
                <div className="rounded-md border border-border/50 bg-background/50 p-2.5">
                  <span className="text-muted-foreground">Alokasi manajemen (30%)</span>
                  <p className="mt-1 font-semibold text-muted-foreground">
                    {formatPlanPrice(
                      quote.custom ? quote.custom.managementFeeTotal : quote.introductory.managementFeeTotal,
                    )}
                  </p>
                  <p className="mt-0.5 text-body-2xs text-muted-foreground">
                    Operasional & koordinasi tutor
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-body-xs font-semibold text-muted-foreground">Ringkasan konfigurasi sesi</p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1 text-body-xs text-foreground">
                  <CalendarDays className="size-3.5 text-brand-primary" aria-hidden="true" />
                  {quote.meetings} pertemuan
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1 text-body-xs text-foreground">
                  <BookOpen className="size-3.5 text-brand-primary" aria-hidden="true" />
                  {quote.courses} mata kuliah
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1 text-body-xs text-foreground">
                  <Users className="size-3.5 text-brand-primary" aria-hidden="true" />
                  {quote.persons} anggota
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1 text-body-xs text-foreground">
                  <Layers className="size-3.5 text-brand-primary" aria-hidden="true" />
                  Platform: {formatPlanPrice(quote.platformCost)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="mt-6 flex items-start gap-3 rounded-lg border border-status-warning/30 bg-status-warning/10 p-4"
            role="status"
          >
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-status-warning" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-body-sm font-semibold text-foreground">Lengkapi konfigurasi</p>
              <p className="text-body-xs leading-relaxed text-muted-foreground">
                Periksa jumlah pertemuan, mata kuliah, dan anggota kelompok untuk menampilkan estimasi fee tutor.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
