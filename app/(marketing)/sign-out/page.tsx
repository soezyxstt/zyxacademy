"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { useTranslations } from "@/lib/i18n/client";

type SignOutStatus = "pending" | "done" | "error";

/**
 * Signs the user out on mount. React Strict Mode double-invokes effects in dev;
 * the `cancelled` flag avoids setting state after unmount or after a stale run.
 */
export default function SignOutPage() {
  const t = useTranslations("marketing");
  const liveId = useId();
  const [status, setStatus] = useState<SignOutStatus>("pending");

  const runSignOut = useCallback(async () => {
    setStatus("pending");
    try {
      await signOut();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await signOut();
        if (!cancelled) setStatus("done");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const statusMessage =
    status === "pending"
      ? t("signOut.pending")
      : status === "done"
        ? t("signOut.done")
        : t("signOut.error");

  return (
    <Reveal className="marketing-container flex min-h-[50vh] flex-col items-center justify-center py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="font-heading text-h5 font-bold text-foreground">
          {t("signOut.title")}
        </h1>
        <div
          id={liveId}
          aria-live="polite"
          className="mt-3 min-h-6 text-body-base text-muted-foreground"
        >
          <p className={status === "error" ? "text-status-error" : undefined}>
            {statusMessage}
          </p>
        </div>
        {status === "error" ? (
          <Button
            type="button"
            className="mt-4"
            onClick={() => void runSignOut()}
          >
            {t("signOut.retry")}
          </Button>
        ) : null}
        <div className="mt-6 flex flex-col items-center gap-2 text-body-sm font-medium text-brand-primary">
          <Link href="/" className="underline-offset-4 hover:underline">
            {t("signOut.home")}
          </Link>
          <Link href="/sign-in" className="underline-offset-4 hover:underline">
            {t("signOut.signIn")}
          </Link>
        </div>
      </div>
    </Reveal>
  );
}
