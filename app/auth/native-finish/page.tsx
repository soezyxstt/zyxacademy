"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSafeRedirectPath } from "@/lib/auth-redirect";
import { withAccountTransition } from "@/lib/auth/account-switch";
import { AccountSwitchError, accountSwitchError, MAX_SAVED_ACCOUNTS } from "@/lib/auth/account-switch-contract";
import { useTranslations } from "@/lib/i18n/client";
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
  const tr = useTranslations("auth.native");
  const accounts = useTranslations("common.accounts");
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
      setError("invalidSession");
      return;
    }

    void withAccountTransition(async () => {
      const res = await fetch("/api/auth/one-time-token/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });
      const result: unknown = await res.json();
      if (!res.ok) {
        const failure = accountSwitchError(result);
        if (failure.code !== "SWITCH_FAILED") throw failure;
        throw new AccountSwitchError(res.status === 400 ? "SESSION_EXPIRED" : "SWITCH_FAILED");
      }
      if (!result || typeof result !== "object" || !("user" in result)
        || !result.user || typeof result.user !== "object" || !("id" in result.user)
        || typeof result.user.id !== "string") throw new Error("token_verify_failed");
      return result.user.id;
    })
      .then(() => {
        window.location.replace(safeNext);
      })
      .catch((failure: unknown) => {
        const code = failure instanceof AccountSwitchError ? failure.code : "SWITCH_FAILED";
        const key = {
          BUSY: "busy", PENDING_CHANGES: "pendingChanges", OFFLINE: "offline",
          SESSION_EXPIRED: "expired", ACCOUNT_UNAVAILABLE: "unavailable", SESSION_LIMIT: "limit",
          CANCELLED: "addFailed", ACTIVE_ACCOUNT: "addFailed", SWITCH_FAILED: "addFailed",
        }[code];
        setError(key);
      });
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-(--page-gutter) py-(--section-gap) text-foreground">
      <div className="w-full max-w-sm space-y-(--compact-gap) text-center">
        {!error ? (
          <>
            <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" aria-hidden />
            <h1 className="font-heading text-h5 font-bold">
              {tr("finishing")}
            </h1>
            <p className="text-body-sm text-muted-foreground">
              {tr("preparing")}
            </p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-h5 font-bold">
              {tr("failed")}
            </h1>
            <p className="text-body-sm text-muted-foreground">{error === "invalidSession" ? tr("expired") : accounts(error, { count: MAX_SAVED_ACCOUNTS })}</p>
            <Button asChild size="sm">
              <Link href="/sign-in">{tr("back")}</Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
