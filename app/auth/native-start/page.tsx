"use client";

import { useTranslations } from "@/lib/i18n/client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";
import { normalizeBrowserHandoffScheme } from "@/lib/native/expo-auth-config";
import { getSafeRedirectPath } from "@/lib/auth-redirect";
import { normalizeNativeAuthState } from "@/lib/native/auth-handoff";

function NativeAuthStartContent() {
  const tr = useTranslations("auth.native");
  const searchParams = useSearchParams();
  const scheme = normalizeBrowserHandoffScheme(searchParams.get("scheme"));
  const state = normalizeNativeAuthState(searchParams.get("state"));
  const safeNext = getSafeRedirectPath(searchParams.get("next") ?? undefined);
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const triggerGoogleSignIn = useCallback(async () => {
    if (!scheme || !state) {
      setError("invalidLink");
      return;
    }
    setError(null);
    const completeParams = new URLSearchParams({
      scheme,
      state,
      next: safeNext,
    });
    const callbackURL = `/api/auth/native/complete?${completeParams.toString()}`;
    try {
      await signIn.social({
        provider: "google",
        callbackURL,
      });
    } catch {
      setError("startFailed");
    }
  }, [scheme, state, safeNext]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void triggerGoogleSignIn();
  }, [triggerGoogleSignIn]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-(--page-gutter) py-(--section-gap) text-foreground">
      <div className="w-full max-w-sm space-y-(--compact-gap) text-center">
        {!error ? (
          <>
            <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" aria-hidden />
            <h1 className="font-heading text-h5 font-bold">
              {tr("connecting")}
            </h1>
            <p className="text-body-sm text-muted-foreground">
              {tr("choose")}
            </p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-h5 font-bold">
              {tr("unavailable")}
            </h1>
            <p className="text-body-sm text-muted-foreground">{tr(error)}</p>
            {scheme && state && (
              <Button type="button" size="sm" onClick={() => void triggerGoogleSignIn()}>
                {tr("retry")}
              </Button>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function NativeAuthStartPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        </main>
      }
    >
      <NativeAuthStartContent />
    </Suspense>
  );
}
