"use client";

import Link from "next/link";
import { AuthMarketingCard } from "@/components/auth/auth-marketing-card";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { useTranslations } from "@/lib/i18n/client";
import { useAppLocale } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";

type SignInFormProps = {
  callbackURL: string;
  urlErrorCode: string | null;
  requestedLocale?: Locale | null;
};

export function SignInForm({ callbackURL, urlErrorCode, requestedLocale }: SignInFormProps) {
  const t = useTranslations("auth");
  const { locale } = useAppLocale();
  const signUpParams = new URLSearchParams();
  if (requestedLocale) signUpParams.set("locale", requestedLocale);
  if (callbackURL && callbackURL !== "/dashboard") signUpParams.set("next", callbackURL);
  const signUpHref = signUpParams.size > 0 ? `/sign-up?${signUpParams.toString()}` : "/sign-up";
  return (
    <AuthMarketingCard
      title={t("signIn")}
      description={t("signInDescription")}
      urlErrorMessage={urlErrorCode ? t(`oauthErrors.${urlErrorCode}`) : null}
      footer={
        <p className="mt-(--related-gap) text-center text-body-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link
            href={signUpHref}
            className="font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {t("signUp")}
          </Link>
        </p>
      }
    >
      <div className="mt-(--section-gap) flex flex-col gap-(--compact-gap)">
        <GoogleSignInButton
          label={t("signInWithGoogle")}
          callbackURL={callbackURL}
          locale={locale}
          containerClassName="w-full"
          className="h-11 w-full gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover"
        />
      </div>
    </AuthMarketingCard>
  );
}
