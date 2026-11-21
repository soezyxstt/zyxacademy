"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSafeRedirectPath } from "@/lib/auth-redirect";

function NativeAuthFinishContent() {
  const searchParams = useSearchParams();
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const token = searchParams.get("token")?.trim();
    const safeNext = getSafeRedirectPath(searchParams.get("next") ?? undefined);

    // Scrub the one-time token from the URL bar immediately.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/auth/native-finish");
    }

    if (!token) {
      setError("Sesi masuk tidak ditemukan atau sudah kedaluwarsa.");
      return;
    }

    void fetch("/api/auth/one-time-token/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error("token_verify_failed");
        }
        window.location.replace(safeNext);
      })
      .catch(() => {
        setError("Tautan masuk sudah digunakan atau kedaluwarsa. Silakan masuk lagi.");
      });
  }, [searchParams]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-sm space-y-4 text-center">
        {!error ? (
          <>
            <Loader2 className="mx-auto size-6 animate-spin text-primary" />
            <h1 className="font-heading text-body-base font-bold">
              Menyelesaikan masuk
            </h1>
            <p className="text-body-xs text-muted-foreground">
              Menyiapkan sesi Zyx Academy Anda.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-body-base font-bold">
              Gagal masuk
            </h1>
            <p className="text-body-xs text-muted-foreground">{error}</p>
            <Button asChild size="sm">
              <Link href="/sign-in">Kembali ke halaman masuk</Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}

export default function NativeAuthFinishPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-background text-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
        </main>
      }
    >
      <NativeAuthFinishContent />
    </Suspense>
  );
}
