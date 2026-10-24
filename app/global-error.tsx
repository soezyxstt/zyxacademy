"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { ERROR_MESSAGES, getLocaleFromBrowser } from "@/lib/i18n/error-messages";
import type { Locale } from "@/lib/i18n/locale";

export default function GlobalError({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry?: () => void;
}) {
  const [locale, setLocale] = useState<Locale>("id");
  const copy = ERROR_MESSAGES[locale];
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  useEffect(() => {
    const browserLocale = getLocaleFromBrowser();
    setLocale(browserLocale);
    document.documentElement.lang = browserLocale;
  }, []);

  const handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
      return;
    }
    if (retry) {
      retry();
      return;
    }
    reset();
  };

  return (
    <html lang={locale}>
      <body className="font-sans antialiased min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <h1 className="font-heading text-6xl font-black text-primary tracking-tight">
            500
          </h1>
          <h2 className="font-heading text-h5 font-bold">
            {copy.title}
          </h2>
          <p className="text-body-base text-muted-foreground">
            {copy.body}
          </p>
          <div className="flex justify-center pt-2">
            <Button
              onClick={handleReload}
              variant="default"
              size="lg"
              className="font-semibold gap-1.5"
            >
              <RefreshCw className="size-4" />
              {copy.retry}
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
