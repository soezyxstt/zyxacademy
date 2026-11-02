"use client";

import { Button } from "@/components/ui/button";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { useTranslations } from "@/lib/i18n/client";
import { LocalizedPublicLink } from "@/components/localized-public-link";
import { LocalizedAuthLink } from "@/components/localized-auth-link";

export function LandingClosingCta() {
  const t = useTranslations("marketing");
  return (
    <SectionContainer
      className="bg-landing-aurora text-foreground"
      aria-labelledby="closing-heading"
    >
      <div className="text-center">
        <SectionHeading id="closing-heading" tier="primary" className="text-foreground">
          {t("home.closingTitle")}
        </SectionHeading>
        <p className="mx-auto mt-4 max-w-prose text-body-base text-muted-foreground">
          {t("home.closingDescription")}
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="marketingPrimary" size="marketing">
            <LocalizedAuthLink href="/sign-up">{t("home.startFree")}</LocalizedAuthLink>
          </Button>
          <Button
            asChild
            variant="marketingSecondary"
            size="marketing"
            className="bg-background hover:bg-muted/60 dark:bg-background"
          >
            <LocalizedPublicLink href="/plans">{t("home.viewPlans")}</LocalizedPublicLink>
          </Button>
          <Button asChild variant="ghost" size="marketing" className="text-foreground">
            <LocalizedPublicLink href="/demo">{t("home.tryDemo")}</LocalizedPublicLink>
          </Button>
        </div>
      </div>
    </SectionContainer>
  );
}
