import type { Metadata } from "next";
import { SignInForm } from "@/components/auth/sign-in-form";
import {
  getOAuthCallbackErrorMessage,
  getSafeRedirectPath,
} from "@/lib/auth-redirect";
import { createMetadata, pageTitle } from "@/lib/site";

export const metadata: Metadata = createMetadata({
  title: "Masuk Akun",
  description: "Masuk ke platform pembelajaran Zyx Academy.",
  path: "/sign-in",
});


type SearchParams = {
  next?: string | string[];
  error?: string | string[];
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const callbackURL = getSafeRedirectPath(sp.next);
  const urlErrorMessage = getOAuthCallbackErrorMessage(sp.error);

  return (
    <SignInForm callbackURL={callbackURL} urlErrorMessage={urlErrorMessage} />
  );
}
