"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ExternalLink, Globe } from "lucide-react";
import { FaInstagram, FaLinkedin } from "react-icons/fa6";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Reveal } from "@/components/ui/reveal";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { useTranslations } from "@/lib/i18n/client";

const founders = [
  {
    id: "adi",
    name: "Adi Haditya Nursyam",
    image: "/founders/adi.jpeg",
    socials: {
      website: "https://adihnursyam.com",
      linkedin: "https://www.linkedin.com/in/adihnursyam/",
      instagram: "https://instagram.com/adihnursyam",
    },
  },
  {
    id: "dawam",
    name: "Nur Dawam Abdan Syakuro",
    image: "/founders/dawam.jpeg",
    socials: {
      linkedin: "https://www.linkedin.com/in/mawadrun/",
      instagram: "https://www.instagram.com/mawadrun/",
    },
  },
  {
    id: "heidi",
    name: "Heidi Schan Andriana",
    image: "/founders/heidi.jpeg",
    socials: {
      linkedin: "https://www.linkedin.com/in/heidischan/",
      instagram: "https://www.instagram.com/heidischan/",
    },
  },
  {
    id: "raihan",
    name: "Muhammad Raihan Fasya Mian",
    image: "/founders/raihan.png",
    socials: {
      linkedin: "https://www.linkedin.com/in/raihanmian/",
      instagram: "https://www.instagram.com/raihan_mianz/",
    },
  },
];

const workingPrinciples = [
  { title: "about.principleAligned", description: "about.principleAlignedDescription" },
  { title: "about.principlePractice", description: "about.principlePracticeDescription" },
  { title: "about.principleSupport", description: "about.principleSupportDescription" },
];

export function AboutClient() {
  const t = useTranslations("marketing");
  return (
    <div className="relative flex flex-col overflow-hidden">
      <PageOrnaments variant="about" />

      <header className="relative z-10 border-b border-border bg-background py-16 text-center md:py-24">
        <div className="marketing-container space-y-4">
          <h1 className="mx-auto max-w-4xl font-heading text-h2 font-extrabold tracking-tight text-foreground md:text-h1">
            {t("about.title")}
          </h1>
          <p className="mx-auto max-w-2xl text-body-base leading-relaxed text-muted-foreground">
            {t("about.intro")}
          </p>
        </div>
      </header>

      <Reveal>
        <SectionContainer className="relative z-10 border-b border-border bg-background py-16 md:py-24">
          <div className="mx-auto max-w-3xl space-y-6">
            <SectionHeading as="h2" tier="primary" className="text-foreground">
              {t("about.storyTitle")}
            </SectionHeading>
            <div className="space-y-4 text-body-base leading-relaxed text-muted-foreground">
              <p>
                {t("about.storyOne")}
              </p>
              <p>
                {t("about.storyTwo")}
              </p>
            </div>
          </div>
        </SectionContainer>
      </Reveal>

      <Reveal>
        <SectionContainer className="relative z-10 border-b border-border bg-muted/20 py-16 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-16">
            <div className="space-y-4">
              <SectionHeading as="h2" tier="primary" className="text-foreground">
              {t("about.principlesTitle")}
              </SectionHeading>
              <p className="text-body-base leading-relaxed text-muted-foreground">
                {t("about.principlesIntro")}
              </p>
            </div>

            <div className="divide-y divide-border border-y border-border">
              {workingPrinciples.map((principle) => (
                <div key={principle.title} className="grid gap-2 py-5 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)] sm:gap-6">
                  <h3 className="font-heading text-body-base font-semibold text-foreground">{t(principle.title)}</h3>
                  <p className="text-body-sm leading-relaxed text-muted-foreground">{t(principle.description)}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionContainer>
      </Reveal>

      <Reveal>
        <SectionContainer className="relative z-10 border-b border-border bg-background py-16 md:py-24">
          <div className="mx-auto max-w-5xl space-y-8">
            <div className="max-w-3xl space-y-3">
              <SectionHeading as="h2" tier="primary" className="text-foreground">
                {t("about.founderSectionTitle")}
              </SectionHeading>
              <p className="text-body-base leading-relaxed text-muted-foreground">
                {t("about.founderSectionDescription")}
              </p>
            </div>

            <article className="grid gap-6 rounded-xl border border-border bg-card p-6 md:grid-cols-[auto_minmax(0,1fr)] md:p-8">
              <div className="relative size-24 overflow-hidden rounded-xl border border-border/60">
                <Image
                  src="/founders/adi.jpeg"
                  alt={t("about.founderPhoto", { name: "Adi Haditya Nursyam" })}
                  fill
                  sizes="96px"
                  className="object-cover"
                  priority
                />
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-body-xs font-semibold uppercase tracking-widest text-primary">{t("about.founderAdiRole")}</p>
                  <h3 className="mt-1 font-heading text-h5 font-bold text-foreground">Adi Haditya Nursyam</h3>
                </div>
                <p className="text-body-base leading-relaxed text-muted-foreground">{t("about.founderAdiContribution")}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <ExternalProfileLink href="https://adihnursyam.com" icon={<Globe className="size-3.5" />}>
                    {t("about.founderPortfolio")}
                  </ExternalProfileLink>
                  <ExternalProfileLink href="https://github.com/soezyxstt/zyx-authoring-mcp" icon={<ExternalLink className="size-3.5" />}>
                    {t("about.authoringTools")}
                  </ExternalProfileLink>
                </div>
              </div>
            </article>
          </div>
        </SectionContainer>
      </Reveal>

      <Reveal>
        <SectionContainer className="relative z-10 bg-background py-16 md:py-24">
          <div className="mx-auto max-w-5xl space-y-10">
            <div className="max-w-3xl space-y-3">
              <SectionHeading as="h2" tier="primary" className="text-foreground">
                {t("about.peopleTitle")}
              </SectionHeading>
              <p className="text-body-base leading-relaxed text-muted-foreground">
                {t("about.peopleDescription")}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {founders.map((founder) => (
                <article
                  key={founder.id}
                  className="group flex flex-col gap-5 rounded-xl border border-border bg-card p-6 transition-colors hover:border-border-strong sm:flex-row sm:items-start"
                >
                  <div className="relative aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-xl border border-border/60 sm:w-32">
                    <Image
                      src={founder.image}
                      alt={t("about.founderPhoto", { name: founder.name })}
                      fill
                      sizes="(max-width: 640px) 112px, 128px"
                      className="object-cover"
                      priority={founder.id === "adi"}
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-4">
                    <div>
                      <p className="text-body-2xs font-bold uppercase tracking-widest text-primary">{t(`about.founder${founder.id === "adi" ? "Adi" : founder.id === "dawam" ? "Dawam" : founder.id === "heidi" ? "Heidi" : "Raihan"}Role`)}</p>
                      <h3 className="mt-1 font-heading text-body-base font-bold leading-tight text-foreground">{founder.name}</h3>
                    </div>
                    <p className="text-body-sm leading-relaxed text-muted-foreground">{t(`about.founder${founder.id === "adi" ? "Adi" : founder.id === "dawam" ? "Dawam" : founder.id === "heidi" ? "Heidi" : "Raihan"}Bio`)}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4">
                      {founder.socials.website ? (
                        <ExternalProfileLink href={founder.socials.website} icon={<Globe className="size-3.5" />}>
                          {t("about.founderPortfolio")}
                        </ExternalProfileLink>
                      ) : null}
                      {founder.socials.linkedin ? (
                        <ExternalProfileLink href={founder.socials.linkedin} icon={<FaLinkedin className="size-3.5" />}>
                          LinkedIn
                        </ExternalProfileLink>
                      ) : null}
                      {founder.socials.instagram ? (
                        <ExternalProfileLink href={founder.socials.instagram} icon={<FaInstagram className="size-3.5" />}>
                          Instagram
                        </ExternalProfileLink>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </SectionContainer>
      </Reveal>
    </div>
  );
}

function ExternalProfileLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-body-xs font-semibold text-muted-foreground underline underline-offset-2 transition-colors hover:text-primary"
    >
      {icon}
      {children}
    </Link>
  );
}
