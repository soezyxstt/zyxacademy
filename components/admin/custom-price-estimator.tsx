"use client";

import { useMemo, useState } from "react";
import { AlertCircle, BookOpen, CalendarDays, Calculator, Info, Users } from "lucide-react";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CUSTOM_MEETING_STEP,
  CUSTOM_DEFAULT_MEETINGS,
  CUSTOM_MIN_MEETINGS,
  DEFAULT_COURSES,
  DEFAULT_PERSONS,
  formatPlanPrice,
  getCustomPlanPriceQuote,
} from "@/lib/pricing-constants";

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

function getQuantityError(value: string, label: string): string | undefined {
  if (!value.trim()) return `Masukkan ${label.toLowerCase()}.`;
  if (parsePositiveInteger(value) === null) return `${label} harus berupa bilangan bulat positif.`;
  return undefined;
}

export function CustomPriceEstimator() {
  const [values, setValues] = useState<QuantityValues>(initialValues);

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
      meetings: getQuantityError(values.meetings, "Jumlah pertemuan"),
      courses: getQuantityError(values.courses, "Jumlah mata kuliah"),
      persons: getQuantityError(values.persons, "Jumlah anggota kelompok"),
    };

    if (!nextErrors.meetings && quantities.meetings !== null) {
      if (quantities.meetings < CUSTOM_MIN_MEETINGS) {
        nextErrors.meetings = `Minimal ${CUSTOM_MIN_MEETINGS} pertemuan.`;
      } else if (quantities.meetings % CUSTOM_MEETING_STEP !== 0) {
        nextErrors.meetings = `Jumlah pertemuan harus kelipatan ${CUSTOM_MEETING_STEP}.`;
      }
    }

    return nextErrors;
  }, [quantities, values]);

  const quote = useMemo(() => {
    if (
      errors.meetings ||
      errors.courses ||
      errors.persons ||
      quantities.meetings === null ||
      quantities.courses === null ||
      quantities.persons === null
    ) {
      return null;
    }

    return getCustomPlanPriceQuote(quantities.meetings, quantities.persons, quantities.courses);
  }, [errors, quantities]);

  const updateValue = (key: QuantityKey, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  return (
    <div
      className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
      data-custom-price-estimator
    >
      <section className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-xs backdrop-blur-md sm:p-5">
        <AdminSectionTitle
          icon={Calculator}
          title="Konfigurasi custom"
          description="Atur kebutuhan kelompok untuk mendapatkan estimasi paket per semester."
        />

        <div className="mt-5 grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <div className="space-y-2">
            <Label htmlFor="custom-meetings">Jumlah pertemuan</Label>
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
              {errors.meetings ?? `Kelipatan ${CUSTOM_MEETING_STEP}, contoh 5, 10, atau 15.`}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-courses">Jumlah mata kuliah</Label>
            <Input
              id="custom-courses"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={values.courses}
              onChange={(event) => updateValue("courses", event.target.value)}
              aria-invalid={Boolean(errors.courses)}
              aria-describedby="custom-courses-help"
              className={errors.courses ? "border-destructive focus-visible:border-destructive" : undefined}
            />
            <p
              id="custom-courses-help"
              className={errors.courses ? "text-body-xs text-destructive" : "text-body-xs text-muted-foreground"}
              aria-live="polite"
            >
              {errors.courses ?? "Jumlah mata kuliah yang masuk ke paket."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-persons">Anggota kelompok</Label>
            <Input
              id="custom-persons"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={values.persons}
              onChange={(event) => updateValue("persons", event.target.value)}
              aria-invalid={Boolean(errors.persons)}
              aria-describedby="custom-persons-help"
              className={errors.persons ? "border-destructive focus-visible:border-destructive" : undefined}
            />
            <p
              id="custom-persons-help"
              className={errors.persons ? "text-body-xs text-destructive" : "text-body-xs text-muted-foreground"}
              aria-live="polite"
            >
              {errors.persons ?? "Jumlah anggota yang berbagi paket."}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-2 border-t border-border/70 pt-4">
          <Info className="mt-0.5 size-4 shrink-0 text-status-info" aria-hidden="true" />
          <p className="text-body-xs leading-relaxed text-muted-foreground">
            Estimasi menggunakan komponen akses platform dan sesi tutorial. Harga final tetap dikonfirmasi sebelum pembayaran.
          </p>
        </div>
      </section>

      <section
        className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-xs backdrop-blur-md sm:p-5"
        data-price-state={quote ? "valid" : "invalid"}
      >
        <AdminSectionTitle
          icon={Calculator}
          title="Perkiraan harga"
          description="Perbandingan simulasi harga reguler dan harga setelah diskon pengantar."
          right={
            <span className="rounded-md border border-[var(--zx-accent)]/30 bg-[var(--zx-accent)]/10 px-2 py-1 text-body-xs font-semibold text-[var(--zx-accent)]">
              Diskon 40%
            </span>
          }
        />

        {quote ? (
          <div className="mt-6 space-y-5" aria-live="polite">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
                <p className="text-body-xs font-semibold text-muted-foreground">Sebelum diskon</p>
                <p
                  className="mt-2 font-heading text-h5 font-bold text-foreground"
                  data-price-before={quote.beforeDiscount}
                >
                  <s>{formatPlanPrice(quote.beforeDiscount)}</s>
                </p>
                <p className="mt-1 text-body-xs text-muted-foreground">Total kelompok per semester</p>
                <div className="mt-3 border-t border-border/70 pt-3">
                  <p className="text-body-xs font-semibold text-muted-foreground">Per orang</p>
                  <p
                    className="mt-1 font-heading text-body-base font-bold text-foreground"
                    data-price-before-per-person={quote.beforeDiscountPerPerson}
                  >
                    {formatPlanPrice(quote.beforeDiscountPerPerson)}
                    <span className="ml-1 font-sans text-body-xs font-normal text-muted-foreground">/ semester</span>
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--zx-accent)]/30 bg-[var(--zx-accent)]/8 p-4">
                <p className="text-body-xs font-semibold text-[var(--zx-accent)]">Setelah diskon</p>
                <p
                  className="mt-2 font-heading text-h5 font-bold text-foreground"
                  data-price-after={quote.afterDiscount}
                >
                  {formatPlanPrice(quote.afterDiscount)}
                </p>
                <p className="mt-1 text-body-xs text-muted-foreground">Total kelompok per semester</p>
                <div className="mt-3 border-t border-[var(--zx-accent)]/20 pt-3">
                  <p className="text-body-xs font-semibold text-[var(--zx-accent)]">Per orang</p>
                  <p
                    className="mt-1 font-heading text-body-base font-bold text-foreground"
                    data-price-after-per-person={quote.afterDiscountPerPerson}
                  >
                    {formatPlanPrice(quote.afterDiscountPerPerson)}
                    <span className="ml-1 font-sans text-body-xs font-normal text-muted-foreground">/ semester</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-y border-border/70 py-3 text-body-sm">
              <span className="text-muted-foreground">Potongan {quote.discountPercent}%</span>
              <div className="text-right">
                <span className="font-semibold text-status-success" data-price-discount={quote.discountAmount}>
                  -{formatPlanPrice(quote.discountAmount)}
                </span>
                <span
                  className="block text-body-xs text-muted-foreground"
                  data-price-discount-per-person={quote.discountAmountPerPerson}
                >
                  -{formatPlanPrice(quote.discountAmountPerPerson)} / orang
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-body-xs font-semibold text-muted-foreground">Ringkasan konfigurasi</p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1 text-body-xs text-foreground">
                  <CalendarDays className="size-3.5 text-brand-primary" aria-hidden="true" />
                  {quantities.meetings} pertemuan
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1 text-body-xs text-foreground">
                  <BookOpen className="size-3.5 text-brand-primary" aria-hidden="true" />
                  {quantities.courses} mata kuliah
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1 text-body-xs text-foreground">
                  <Users className="size-3.5 text-brand-primary" aria-hidden="true" />
                  {quantities.persons} anggota
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-status-warning/30 bg-status-warning/10 p-4" role="status">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-status-warning" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-body-sm font-semibold text-foreground">Lengkapi konfigurasi</p>
              <p className="text-body-xs leading-relaxed text-muted-foreground">
                Periksa jumlah pertemuan, mata kuliah, dan anggota kelompok untuk menampilkan estimasi harga.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
