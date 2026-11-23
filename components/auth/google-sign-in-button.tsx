"use client";

import { useCallback, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";
import { isLocalAccountTransitionPending } from "@/lib/auth/account-transition-state";
import { saveLocaleSelection } from "@/lib/i18n/actions";
import type { Locale } from "@/lib/i18n/locale";
import { isNativeBrowserSignInSupported, NativeGoogleSignInError, startNativeGoogleSignIn } from "@/lib/native/auth";
import { cn } from "@/lib/utils";
import { GoogleMark } from "./google-mark";

type GoogleSignInButtonProps = {
  label?: string;
  callbackURL?: string;
  /** Applied to the primary control (e.g. height, colors). */
  className?: string;
  /** Applied to the outer column (use for responsive visibility / width). */
  containerClassName?: string;
  /** Runs immediately before the OAuth redirect (e.g. close a mobile menu). */
  onBeforeOAuth?: () => void;
  disabled?: boolean;
  locale?: Locale;
};

function mapSignInError(err: unknown, t: (key: string) => string): string {
  if (err instanceof TypeError) {
    return t("networkError");
  }
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (m.includes("fetch") || m.includes("network") || m.includes("failed to fetch")) {
      return t("networkError");
    }
  }
  return t("signInError");
}

export function GoogleSignInButton({
  label,
  callbackURL = "/dashboard",
  className,
  containerClassName,
  onBeforeOAuth,
  disabled = false,
  locale,
}: GoogleSignInButtonProps) {
  const t = useTranslations("auth");
  const accounts = useTranslations("common.accounts");
  const [loading, setLoading] = useState(false);
  const [browserRecovery, setBrowserRecovery] = useState<"error" | "cancelled" | null>(null);

  const handleClick = useCallback(async (preferBrowser = false) => {
    onBeforeOAuth?.();
    setLoading(true);
    setBrowserRecovery(null);
    let keepLoadingForBrowser = false;
    try {
      if (locale) await saveLocaleSelection(locale);
      if (isNativeBrowserSignInSupported()) {
        const opened = await startNativeGoogleSignIn(callbackURL, {
          onBrowserClosed: () => setLoading(false),
          onPickerCancelled: () => setBrowserRecovery("cancelled"),
          preferBrowser,
        });
        if (opened) {
          keepLoadingForBrowser = true;
          return;
        }
      }
      // better-auth redirects the browser on success; failures surface here.
      const result = await signIn.social({
        provider: "google",
        callbackURL,
      });
      if (result.error) throw new Error("sign-in-failed");
    } catch (err) {
      if (isLocalAccountTransitionPending()) return;
      if (err instanceof NativeGoogleSignInError) {
        setBrowserRecovery("error");
      } else {
        toast.error(mapSignInError(err, t));
      }
    } finally {
      if (!keepLoadingForBrowser && !isLocalAccountTransitionPending()) {
        setLoading(false);
      }
    }
  }, [callbackURL, locale, onBeforeOAuth, t]);

  return (
    <div className={cn(containerClassName)}>
      <Button
        type="button"
        className={cn("gap-2", className)}
        onClick={() => void handleClick()}
        disabled={disabled}
        isLoading={loading}
      >
        <GoogleMark className="size-[18px] shrink-0" />
        <span>{label ?? t("continueWithGoogle")}</span>
      </Button>
      {browserRecovery && <div className="mt-2.5 space-y-2 text-center">
        {browserRecovery === "error" && (
          <p role="alert" className="text-body-xs text-muted-foreground">{accounts("nativeUnavailable")}</p>
        )}
        <Button type="button" variant="outline" className="h-11 w-full gap-2 rounded-lg" onClick={() => void handleClick(true)} disabled={disabled || loading}>
          <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{accounts("browserFallback")}</span>
        </Button>
      </div>}
    </div>
  );
}
