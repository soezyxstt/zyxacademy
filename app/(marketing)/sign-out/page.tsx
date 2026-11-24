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
    <Reveal className="mx-auto max-w-md px-(--page-gutter) py-(--section-gap)">
      <div className="space-y-(--related-gap)">
        <h1 className="font-heading text-h5 font-bold text-foreground">
          {t("signOut.title")}
        </h1>
        <div
          id={liveId}
          aria-live="polite"
          className="text-body-base text-muted-foreground"
        >
          <p className={status === "error" ? "text-status-error" : undefined}>
            {statusMessage}
          </p>
        </div>
        {status === "error" ? (
          <Button
            type="button"
            onClick={() => void runSignOut()}
          >
            {t("signOut.retry")}
          </Button>
        ) : null}
        <div className="flex flex-wrap items-center gap-(--compact-gap) border-t border-border/55 pt-(--compact-gap)">
          <Button asChild variant="ghost">
            <Link href="/">{t("signOut.home")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-in">{t("signOut.signIn")}</Link>
          </Button>
        </div>
      </div>
    </Reveal>
  );
}
