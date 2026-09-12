import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { LandingVisible } from "@/components/landing/landing-visible";
import { MasteryPathDemo } from "@/components/landing/demo/mastery-path-demo";

export function LandingDemoPath() {
 return (
 <SectionContainer
 className="border-y border-border/80 bg-[var(--color-surface)]/45"
 aria-labelledby="landing-path-heading"
 >
 <div className="mx-auto max-w-2xl text-center">
 <p className="text-body-xs font-semibold uppercase tracking-[0.2em] text-[var(--zx-accent)]">
 Jalur belajar personal
 </p>
 <SectionHeading as="h2" id="landing-path-heading" className="mt-3 text-foreground">
 Dua mahasiswa, dua jalur berbeda.
 </SectionHeading>
 <p className="mt-4 text-body-base text-muted-foreground">
 Jalurmu disusun dari peta penguasaanmu sendiri ; konsep prasyarat harus kuat dulu sebelum
 konsep lanjutan terbuka.
 </p>
 <p className="mt-3 text-body-xs text-muted-foreground">Simulasi interaktif; skor dan status di bawah adalah contoh tampilan.</p>
 </div>

 <LandingVisible className="mt-12">
 <MasteryPathDemo />
 </LandingVisible>
 </SectionContainer>
 );
}
