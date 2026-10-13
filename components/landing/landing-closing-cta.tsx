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
        <SectionHeading id="closing-heading" tier="primary" className="text-foreground">
          Mulai belajar dengan langkah yang jelas.
        </SectionHeading>
        <p className="mx-auto mt-4 max-w-prose text-body-base text-muted-foreground">
          Buat akun untuk melihat materi dan latihan yang tersedia, lalu pilih paket bila kamu
          membutuhkan pendampingan tambahan.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="marketingPrimary" size="marketing">
            <Link href="/sign-up">Mulai gratis</Link>
          </Button>
          <Button
            asChild
            variant="marketingSecondary"
            size="marketing"
            className="bg-background hover:bg-muted/60 dark:bg-background"
          >
            <Link href="/plans">Lihat paket</Link>
          </Button>
          <Button asChild variant="ghost" size="marketing" className="text-foreground">
            <Link href="/demo">Coba demo</Link>
          </Button>
        </div>
      </div>
    </SectionContainer>
  );
}
