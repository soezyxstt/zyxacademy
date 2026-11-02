"use client";

import Image from "next/image";
import { ArrowUpRight, Quote } from "lucide-react";
import { testimonialStories } from "@/lib/testimonials";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/client";
import { LocalizedPublicLink } from "@/components/localized-public-link";

const proofStory = testimonialStories[0];

export function LandingProof() {
  const t = useTranslations("marketing");
  if (!proofStory) return null;

  return (
    <SectionContainer
      className="border-b border-border bg-background"
      aria-labelledby="landing-proof-heading"
    >
      <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="max-w-xl">
          <SectionHeading id="landing-proof-heading" className="text-foreground">
            {t("home.proofTitle")}
          </SectionHeading>
          <p className="mt-4 text-body-base text-muted-foreground">
            {t("home.proofDescription")}
          </p>
          <Button asChild variant="link" size="default" className="mt-4 px-0">
            <LocalizedPublicLink href="/testimonial">
              {t("home.readStories")}
              <ArrowUpRight className="size-4" data-icon="inline-end" aria-hidden="true" />
            </LocalizedPublicLink>
          </Button>
        </div>

        <figure className="border-l-2 border-[var(--zx-accent)]/50 bg-muted/35 px-5 py-5 md:px-7 md:py-6">
          <Quote className="size-6 text-[var(--zx-accent)]" aria-hidden="true" />
          <blockquote className="mt-3 text-body-base leading-relaxed text-foreground">
            &ldquo;{proofStory.quote}&rdquo;
          </blockquote>
          <figcaption className="mt-5 flex items-center gap-3 border-t border-border pt-4">
            <Image
              src={proofStory.avatarSrc}
              alt={t("about.founderPhoto", { name: proofStory.name })}
              width={48}
              height={48}
              className="photo-thumb size-12 shrink-0"
            />
            <div className="min-w-0">
              <p className="font-heading text-body-sm font-semibold text-foreground">{proofStory.name}</p>
              <p className="text-body-xs text-muted-foreground">
                {proofStory.program} / {proofStory.location}
              </p>
            </div>
          </figcaption>
        </figure>
      </div>
    </SectionContainer>
  );
}
