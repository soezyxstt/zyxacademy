"use client";

import Link from "next/link";
import { AuthMarketingCard } from "@/components/auth/auth-marketing-card";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { useTranslations } from "@/lib/i18n/client";
import { useAppLocale } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";

type SignUpFormProps = {
  callbackURL: string;
  urlErrorCode: string | null;
  requestedLocale?: Locale | null;
};

export function SignUpForm({ callbackURL, urlErrorCode, requestedLocale }: SignUpFormProps) {
  const t = useTranslations("auth");
  const { locale } = useAppLocale();
  const signInParams = new URLSearchParams();
  if (requestedLocale) signInParams.set("locale", requestedLocale);
  if (callbackURL && callbackURL !== "/dashboard") signInParams.set("next", callbackURL);
  const signInHref = signInParams.size > 0 ? `/sign-in?${signInParams.toString()}` : "/sign-in";
  return (
    <AuthMarketingCard
      title={t("signUpTitle")}
      description={t("signUpDescription")}
      urlErrorMessage={urlErrorCode ? t(`oauthErrors.${urlErrorCode}`) : null}
      footer={
        <p className="mt-(--related-gap) text-center text-body-sm text-muted-foreground">
          {t("alreadyHaveAccount")}{" "}
          <Link
            href={signInHref}
            className="font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {t("signIn")}
          </Link>
        </p>
      }
    >
      <div className="mt-(--section-gap) flex flex-col gap-(--compact-gap)">
        <GoogleSignInButton
          label={t("signUpWithGoogle")}
          callbackURL={callbackURL}
          locale={locale}
          containerClassName="w-full"
          className="h-11 w-full gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover"
        />
      </div>
    </AuthMarketingCard>
  );
}
