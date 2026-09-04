import Link from "next/link";
import { Check } from "lucide-react";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { planTiers } from "@/lib/plan-tiers";

export function LandingPricingPreview() {
  return (
    <SectionContainer className="border-b border-border bg-background" aria-labelledby="pricing-preview-heading">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-body-xs font-semibold uppercase tracking-[0.2em] text-[var(--zx-accent)]">Paket</p>
        <SectionHeading id="pricing-preview-heading" tier="secondary" className="mt-2 text-foreground">
          Mulai gratis, naikkan saat butuh.
        </SectionHeading>
        <p className="mt-3 text-body-base text-muted-foreground">
          Bank materi dan soal gratis selamanya. Paket berbayar menambah kuis + pembahasan, diktat,
          dan tutorial tatap muka bersama tutor ITB.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-6xl gap-5 md:grid-cols-3 md:gap-6">
        {planTiers
          .filter((t) => t.key === "minimal" || t.key === "essential" || t.key === "premium")
          .map((tier) => (
            <article
              key={tier.name}
              className={cn(
                "flex flex-col rounded-2xl border p-6 shadow-xs md:p-7 backdrop-blur-md transition-colors",
                tier.highlighted ? "relative border-[var(--zx-accent)] bg-card/75 ring-2 ring-[var(--zx-accent)]/25" : "border-border/70 bg-card/70",
              )}
            >
            {tier.highlighted ? (
              <Badge className="absolute -top-2.5 left-6 bg-[var(--zx-accent)] text-white hover:bg-[var(--zx-accent)]">
                Rekomendasi
              </Badge>
            ) : null}
            <h3 className="font-heading text-body-base font-semibold tracking-tight text-foreground">{tier.name}</h3>
            <p className="mt-2 font-heading text-h6 font-semibold text-primary dark:text-foreground">{tier.price}</p>
            <p className="mt-1 text-body-sm text-muted-foreground">{tier.note}</p>
            <ul className="mt-5 flex flex-1 flex-col gap-3">
              {tier.features.slice(0, 3).map((f) => (
                <li key={f} className="flex gap-2 text-left text-body-sm text-muted-foreground">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary/35 dark:text-primary-foreground">
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-2">
              <Button asChild variant="marketingPrimary" size="marketing" className="w-full">
                <Link href="/plans">Lihat paket lengkap</Link>
              </Button>
              <Button asChild variant="marketingSecondary" size="marketing" className="w-full">
                <Link href="/feedback">Hubungi untuk detail</Link>
              </Button>
            </div>
          </article>
        ))}
      </div>
    </SectionContainer>
  );
}
