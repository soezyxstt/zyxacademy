import type { Metadata } from "next";
import Image from "next/image";
import { MarketingPageHero } from "@/components/marketing-page-hero";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { createLocalizedMetadata } from "@/lib/site-metadata";
import { getTranslations } from "@/lib/i18n/server";
import { LocalizedPublicLink } from "@/components/localized-public-link";
import { LocalizedAuthLink } from "@/components/localized-auth-link";
import { testimonialStories } from "@/lib/testimonials";

export async function generateMetadata(): Promise<Metadata> {
  return createLocalizedMetadata({ path: "/testimonial", titleKey: "meta.testimonial.title", descriptionKey: "meta.testimonial.description" });
}


export default async function TestimonialPage() {
 const t = await getTranslations("marketing");
 return (
 <div className="flex flex-col">
 <Reveal>
 <MarketingPageHero
 sectionId="testimonial"
 title={t("testimonial.title")}
 description={t("testimonial.intro")}
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
 {t("testimonial.storiesTitle")}
 </SectionHeading>
 </div>

 <div className="relative z-10 columns-1 gap-6 sm:columns-2 lg:columns-3">
 {testimonialStories.map((story) => (
 <figure
 key={story.id}
 itemScope
 itemType="https://schema.org/Review"
 className="mb-6 flex break-inside-avoid flex-col rounded-xl border border-border bg-card"
 >
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
 alt={t("testimonial.studentPhoto", { name: story.name })}
 width={40}
 height={40}
 className="photo-thumb size-10 shrink-0"
 />
 <div className="min-w-0">
 <span
 itemScope
 itemType="https://schema.org/Person"
 itemProp="author"
 className="block font-heading text-body-sm font-semibold text-foreground"
 >
 <span itemProp="name">{story.name}</span>
 </span>
 <span className="block text-body-xs text-muted-foreground">
 {story.program} / {story.location}
 </span>
 </div>
 </figcaption>
 </div>
 </figure>
 ))}
 </div>
 </SectionContainer>
 </Reveal>

 <Reveal>
 <SectionContainer className="border-b border-border bg-background/40 py-16 text-center md:py-20">
 <div className="mx-auto max-w-2xl space-y-4">
 <SectionHeading as="h2" tier="secondary" className="text-foreground">
 {t("testimonial.ctaTitle")}
 </SectionHeading>
 <p className="text-body-base text-muted-foreground">
 {t("testimonial.ctaDescription")}
 </p>
 <div className="flex flex-wrap justify-center gap-3">
 <Button asChild>
 <LocalizedAuthLink href="/sign-up">{t("home.startFree")}</LocalizedAuthLink>
 </Button>
 <Button asChild variant="outline">
 <LocalizedPublicLink href="/plans">{t("home.viewPlans")}</LocalizedPublicLink>
 </Button>
 </div>
 </div>
 </SectionContainer>
 </Reveal>
 </div>
 );
}
