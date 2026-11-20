import { getTranslations } from "@/lib/i18n/server";
import { ArrowUpRight, BookOpen, CalendarClock, MessageCircle } from "lucide-react";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button } from "@/components/ui/button";
import { LocalizedPublicLink } from "@/components/localized-public-link";

const supportOptions = [
  { icon: BookOpen, title: "support.selfStudyTitle", body: "support.selfStudyBody" },
  { icon: CalendarClock, title: "support.scheduledTitle", body: "support.scheduledBody" },
  { icon: MessageCircle, title: "support.intensiveTitle", body: "support.intensiveBody" },
] as const;

export async function LandingTutorSupport() {
  const t = await getTranslations("marketing");
  return (
    <SectionContainer
      className="border-y border-border/80 bg-muted/45"
      aria-labelledby="landing-tutor-support-heading"
    >
      <div className="mx-auto max-w-2xl text-center">
        <SectionHeading as="h2" id="landing-tutor-support-heading" className="text-foreground">
          {t("support.title")}
        </SectionHeading>
      </div>

      <div className="mx-auto mt-8 grid max-w-6xl divide-y divide-border border-y border-border md:grid-cols-3 md:divide-x md:divide-y-0">
        {supportOptions.map((option) => {
          const Icon = option.icon;
          return (
            <article key={option.title} className="py-4 md:px-5 md:first:pl-0 md:last:pr-0">
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 font-heading text-body-base font-semibold text-foreground">
                {t(option.title)}
              </h3>
              <p className="mt-2 text-body-sm leading-relaxed text-muted-foreground">{t(option.body)}</p>
            </article>
          );
        })}
      </div>

      <div className="mt-8 text-center">
        <Button asChild variant="marketingSecondary" size="marketing" className="bg-background">
          <LocalizedPublicLink href="/plans">
            {t("support.comparePlans")}
            <ArrowUpRight className="size-4" data-icon="inline-end" aria-hidden="true" />
          </LocalizedPublicLink>
        </Button>
      </div>
    </SectionContainer>
  );
}
