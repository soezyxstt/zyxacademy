import type { Metadata } from "next";
import { SignUpForm } from "@/components/auth/sign-up-form";
import {
  getOAuthCallbackErrorKey,
  getSafeRedirectPath,
} from "@/lib/auth-redirect";
import { createMetadata} from "@/lib/site";
import type { Locale } from "@/lib/i18n/locale";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return createMetadata({ title: t("metadata.signUpTitle"), description: t("metadata.description"), path: "/sign-up" });
}


type SearchParams = {
  next?: string | string[];
  error?: string | string[];
  locale?: string | string[];
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const callbackURL = getSafeRedirectPath(sp.next);
  const urlErrorCode = getOAuthCallbackErrorKey(sp.error);
  const requestedLocale: Locale | null = sp.locale === "id" || sp.locale === "en" ? sp.locale : null;

  return (
    <SignUpForm callbackURL={callbackURL} urlErrorCode={urlErrorCode} requestedLocale={requestedLocale} />
  );
}
