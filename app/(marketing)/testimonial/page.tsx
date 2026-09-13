import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { MarketingPageHero } from "@/components/marketing-page-hero";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { pageTitle } from "@/lib/site";
import { testimonialStories } from "@/lib/testimonials";

export const metadata: Metadata = {
 title: pageTitle("Testimonials"),
 description: "Testimoni singkat murid Zyx Academy mengenai kualitas layanan dan pengalaman belajar.",
};

/** One accent colour per card, cycling through brand palette */
const CARD_ACCENTS = [
 "var(--primary)", // blue
 "var(--color-brand-secondary)", // orange
 "var(--color-tertiary-1)", // teal
] as const;

export default function TestimonialPage() {
 return (
 <div className="flex flex-col">
 <Reveal>
 <MarketingPageHero
 sectionId="testimonial"
 eyebrow="Zyx Academy"
 title="Testimoni"
 description="Cerita dari siswa Zyx Academy tentang proses belajar yang mereka jalani."
 />
 </Reveal>

 <Reveal>
 <SectionContainer
 className="border-b border-border bg-background/80 overflow-hidden py-16 md:py-24"
 aria-labelledby="testimonial-grid-heading"
 >
 <PageOrnaments variant="testimonial" />

 <div className="relative z-10 mx-auto mb-10 max-w-2xl text-center">
 <SectionHeading as="h2" id="testimonial-grid-heading" tier="secondary" className="text-foreground">
 Cerita dari proses belajar
 </SectionHeading>
 </div>

 <div className="relative z-10 columns-1 gap-6 sm:columns-2 lg:columns-3">
 {testimonialStories.map((story, idx) => {
 const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length];
 return (
 <figure
 key={story.id}
 itemScope
 itemType="https://schema.org/Review"
 className="relative break-inside-avoid mb-6 flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background"
 style={{
  boxShadow: `0 8px 32px -4px color-mix(in oklch, ${accent} 18%, transparent), 0 2px 10px -2px color-mix(in oklch, var(--color-foreground) 9%, transparent)`,
 }}
 >
 {/* Coloured accent strip */}
 <div className="h-[3px] w-full shrink-0" style={{ background: accent }} />

 {/* Large watermark quote ; decorative only */}
 <span
 aria-hidden
 className="pointer-events-none absolute -top-2 right-3 select-none font-heading text-[108px] font-black leading-none"
 style={{ color: accent, opacity: 0.08 }}
 >
 &rdquo;
 </span>

 <div className="relative z-10 flex flex-1 flex-col gap-4 p-6">
 <blockquote
 itemProp="reviewBody"
 className="flex-1 text-body-base leading-relaxed text-foreground/90"
 >
 &ldquo;{story.quote}&rdquo;
 </blockquote>

 <figcaption className="flex items-center gap-3 border-t border-border pt-4">
 <Image
 src={story.avatarSrc}
 alt={`Foto ${story.name}`}
 width={40}
 height={40}
 className="photo-thumb size-10 shrink-0"
 />
 <div className="min-w-0">
 <span
 itemScope
 itemType="https://schema.org/Person"
 itemProp="author"
 className="block truncate font-heading text-body-sm font-semibold text-foreground"
 >
 <span itemProp="name">{story.name}</span>
 </span>
 <span className="block truncate text-body-sm text-muted-foreground">
 {story.program} / {story.location}
 </span>
 </div>
 </figcaption>
 </div>
 </figure>
 );
 })}
 </div>
 </SectionContainer>
 </Reveal>

 <Reveal>
 <SectionContainer className="border-b border-border bg-background/40 py-16 text-center md:py-20">
 <div className="mx-auto max-w-2xl space-y-4">
 <SectionHeading as="h2" tier="secondary" className="text-foreground">
 Lihat cara belajar di Zyx
 </SectionHeading>
 <p className="text-body-base text-muted-foreground">
 Mulai dari materi dan latihan mandiri, lalu pilih pendampingan tambahan jika sesuai kebutuhanmu.
 </p>
 <div className="flex flex-wrap justify-center gap-3">
 <Button asChild>
 <Link href="/sign-up">Mulai gratis</Link>
 </Button>
 <Button asChild variant="outline">
 <Link href="/plans">Lihat paket</Link>
 </Button>
 </div>
 </div>
 </SectionContainer>
 </Reveal>
 </div>
 );
}
