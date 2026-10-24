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
  return (
    <AuthMarketingCard
      title={t("signIn")}
      description={t("signInDescription")}
      urlErrorMessage={urlErrorCode ? t(`oauthErrors.${urlErrorCode}`) : null}
      footer={
        <p className="mt-6 text-center text-body-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link
            href={requestedLocale ? `/sign-up?locale=${requestedLocale}` : "/sign-up"}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("signUp")}
          </Link>
        </p>
      }
    >
      <div className="mt-8 flex flex-col gap-3">
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
