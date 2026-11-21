"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSafeRedirectPath } from "@/lib/auth-redirect";
import {
  NATIVE_AUTH_STATE_STORAGE_KEY,
  normalizeNativeAuthState,
} from "@/lib/native/auth-handoff";

const MAX_STATE_AGE_MS = 10 * 60 * 1000;

function consumeAndVerifyPendingState(incomingState: string | null): boolean {
  if (!incomingState || typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(NATIVE_AUTH_STATE_STORAGE_KEY);
    window.sessionStorage.removeItem(NATIVE_AUTH_STATE_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: string; createdAt?: number };
    if (typeof parsed.state !== "string" || parsed.state !== incomingState) {
      return false;
    }
    if (typeof parsed.createdAt === "number" && Date.now() - parsed.createdAt > MAX_STATE_AGE_MS) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export default function NativeAuthFinishPage() {
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const rawHash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    const params = new URLSearchParams(rawHash);
    const token = params.get("token")?.trim();
    const state = normalizeNativeAuthState(params.get("state"));
    const safeNext = getSafeRedirectPath(params.get("next") ?? undefined);

    // Scrub fragment immediately so the bearer token does not remain in history.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/auth/native-finish");
    }

    if (!token || !consumeAndVerifyPendingState(state)) {
      setError("Sesi masuk tidak valid atau sudah kedaluwarsa. Silakan masuk lagi.");
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
  }, []);

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
