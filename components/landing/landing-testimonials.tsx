import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { TestimonialCarousel } from "@/components/landing/testimonial-carousel";
import { SectionContainer } from "@/components/layout/section-container";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";

export function LandingTestimonials() {
  return (
    <SectionContainer className="border-y border-border/80 bg-landing-warm" aria-labelledby="testimonials-heading">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-body-xs font-semibold uppercase tracking-[0.2em] text-[var(--zx-accent)]">Testimoni</p>
          <SectionHeading id="testimonials-heading" tier="secondary" className="mt-2">
            Dari mahasiswa yang sudah lewat masa TPB.
          </SectionHeading>
        </div>
        <Button asChild variant="marketingSecondary" size="marketing" className="w-fit bg-background">
          <Link href="/testimonial">
            Lihat semua
            <ArrowUpRight className="size-4" data-icon="inline-end" />
          </Link>
        </Button>
      </div>

      <div className="mt-10 md:mt-12">
        <TestimonialCarousel />
      </div>
    </SectionContainer>
  );
}
