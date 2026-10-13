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
 <SectionHeading as="h2" id="landing-path-heading" className="text-foreground">
 Dua mahasiswa, dua jalur berbeda.
 </SectionHeading>
 </div>

 <LandingVisible className="mt-12">
 <MasteryPathDemo />
 </LandingVisible>
 </SectionContainer>
 );
}
