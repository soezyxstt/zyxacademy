import Link from "next/link";
import { AnimatedOrnamentCanvas } from "@/components/animated-ornament-canvas";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { SectionContainer } from "@/components/layout/section-container";
import { MarketingHeroLoops } from "@/components/marketing-hero-loops";
import { HeroGraphCard } from "@/components/landing/demo/hero-graph-card";

export function LandingHero() {
  return (
    <SectionContainer
      density="hero"
      className="relative overflow-hidden border-b border-border bg-landing-aurora"
      contentClassName="relative z-10"
      aria-labelledby="landing-hero-heading"
    >
      <MarketingHeroLoops id="landing-home" />
      <AnimatedOrnamentCanvas
        className="opacity-45"
        variant="orbit"
        symbolSet={["pi", "sum", "int", "inf", "sqrt", "delta"]}
        particleCount={48}
        tone="light"
        waveOpacity={0.25}
        lineOpacity={0.2}
        particleOpacity={0.35}
      />
      <div className="pointer-events-none absolute inset-0 z-0 bg-linear-to-b from-transparent via-background/40 to-background/80" />

      <div className="landing-stagger grid items-center gap-10 lg:grid-cols-2 lg:gap-14 xl:gap-20 [&>*]:[animation-delay:120ms]">
        <div className="max-w-xl text-left [&>*:nth-child(1)]:[animation-delay:0ms] [&>*:nth-child(2)]:[animation-delay:60ms] [&>*:nth-child(3)]:[animation-delay:120ms] [&>*:nth-child(4)]:[animation-delay:180ms] [&>*:nth-child(5)]:[animation-delay:240ms]">
          <p className="text-body-xs font-semibold uppercase tracking-[0.2em] text-[var(--zx-accent)]">
            Untuk mahasiswa ITB · TPB &amp; jurusan
          </p>
          <SectionHeading as="h1" tier="hero" id="landing-hero-heading" className="mt-3 text-foreground">
            Kuasai kuliah tersulitmu,{" "}
            <span className="font-bold italic text-primary">satu konsep sekaligus.</span>
          </SectionHeading>
          <p className="mt-4 max-w-prose text-body-base text-muted-foreground">
            Zyx memetakan apa yang sudah dan belum kamu kuasai, lalu menyusun rencana belajar
            harian; kuis, flashcard, dan materi yang selaras dengan kuliah ITB.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button asChild variant="marketingPrimary" size="marketing">
              <Link href="/sign-up">Mulai belajar</Link>
            </Button>
            <Button asChild variant="ghost" size="marketing" className="text-foreground">
              <Link href="/plans">Lihat paket</Link>
            </Button>
          </div>
        </div>

        <HeroGraphCard />
      </div>
    </SectionContainer>
  );
}
