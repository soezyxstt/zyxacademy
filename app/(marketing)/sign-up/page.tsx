import type { Metadata } from "next";
import { SignUpForm } from "@/components/auth/sign-up-form";
import {
  getOAuthCallbackErrorMessage,
  getSafeRedirectPath,
} from "@/lib/auth-redirect";
import { createMetadata, pageTitle } from "@/lib/site";

export const metadata: Metadata = createMetadata({
  title: "Daftar Akun",
  description: "Daftar ke platform pembelajaran Zyx Academy.",
  path: "/sign-up",
});


type SearchParams = {
  next?: string | string[];
  error?: string | string[];
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const callbackURL = getSafeRedirectPath(sp.next);
  const urlErrorMessage = getOAuthCallbackErrorMessage(sp.error);

  return (
    <SignUpForm callbackURL={callbackURL} urlErrorMessage={urlErrorMessage} />
  );
}
