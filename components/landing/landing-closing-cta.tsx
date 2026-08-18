import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";

export function LandingClosingCta() {
  return (
    <SectionContainer
      className="bg-landing-aurora text-foreground"
      aria-labelledby="closing-heading"
    >
      <div className="text-center">
        <p className="text-body-xs font-semibold uppercase tracking-[0.2em] text-[var(--zx-accent)]">
          Mulai hari ini
        </p>
        <SectionHeading id="closing-heading" tier="primary" className="mt-2 text-foreground">
          Mulai semester ini dengan arah yang jelas.
        </SectionHeading>
        <p className="mx-auto mt-4 max-w-prose text-body-base text-muted-foreground">
          Masuk dengan akun Google, kerjakan diagnosa singkat, dan lihat rencana belajar pertamamu
          hari ini juga.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="marketingPrimary" size="marketing">
            <Link href="/sign-up">Mulai belajar</Link>
          </Button>
          <Button
            asChild
            variant="marketingSecondary"
            size="marketing"
            className="bg-background hover:bg-muted/60 dark:bg-background"
          >
            <Link href="/sign-in">Masuk dengan Google</Link>
          </Button>
        </div>
      </div>
    </SectionContainer>
  );
}
