"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";
import { getSafeRedirectPath } from "@/lib/auth-redirect";
import {
  normalizeNativeAuthScheme,
  normalizeNativeAuthState,
} from "@/lib/native/auth-handoff";

function NativeAuthStartContent() {
  const searchParams = useSearchParams();
  const scheme = normalizeNativeAuthScheme(searchParams.get("scheme"));
  const state = normalizeNativeAuthState(searchParams.get("state"));
  const safeNext = getSafeRedirectPath(searchParams.get("next") ?? undefined);
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const triggerGoogleSignIn = useCallback(async () => {
    if (!scheme || !state) {
      setError("Tautan masuk aplikasi tidak valid.");
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
      setError("Gagal memulai masuk dengan Google. Coba lagi.");
    }
  }, [scheme, state, safeNext]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void triggerGoogleSignIn();
  }, [triggerGoogleSignIn]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-sm space-y-4 text-center">
        {!error ? (
          <>
            <Loader2 className="mx-auto size-6 animate-spin text-primary" />
            <h1 className="font-heading text-body-base font-bold">
              Menghubungkan dengan Google
            </h1>
            <p className="text-body-xs text-muted-foreground">
              Pilih akun Google yang sudah masuk di browser untuk melanjutkan ke Zyx Academy.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-body-base font-bold">
              Tidak dapat melanjutkan masuk
            </h1>
            <p className="text-body-xs text-muted-foreground">{error}</p>
            {scheme && state && (
              <Button type="button" size="sm" onClick={() => void triggerGoogleSignIn()}>
                Coba lagi
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
          <Loader2 className="size-6 animate-spin text-primary" />
        </main>
      }
    >
      <NativeAuthStartContent />
    </Suspense>
  );
}
