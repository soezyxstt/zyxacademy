"use client";

import { useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { RefreshCw, Home } from "lucide-react";

function isChunkLoadError(error: Error): boolean {
  const message = error?.message ?? "";
  return (
    error?.name === "ChunkLoadError" ||
    /loading chunk|dynamically imported module|importing a module script/i.test(message)
  );
}

export default function ErrorPage({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const hasRetriedRef = useRef(false);

  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  const handleRetry = () => {
    if (hasRetriedRef.current || isChunkLoadError(error)) {
      window.location.reload();
      return;
    }
    hasRetriedRef.current = true;
    startTransition(() => {
      if (retry) {
        retry();
      } else {
        router.refresh();
        reset();
      }
    });
  };

  return (
    <>
      <title>Waduh, Ada yang Salah! · Zyx Academy</title>
      <div className="relative min-h-[calc(100vh-3.5rem)] md:min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center px-4 py-12 overflow-hidden">
        {/* Background Ornaments */}
        <PageOrnaments variant="plans" />

        <div className="relative z-10 max-w-md mx-auto flex flex-col items-center gap-6">
          {/* The giant error text */}
          <h1 className="font-heading text-[120px] sm:text-[150px] md:text-[180px] font-black leading-none tracking-tighter bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent select-none transition-transform duration-300 hover:scale-105">
            500
          </h1>

          {/* Heading */}
          <h2 className="font-heading text-h5 font-bold tracking-tight text-foreground -mt-2">
            Waduh, sistemnya lagi ngambek nih!
          </h2>

          {/* Subtext */}
          <p className="text-body-base text-muted-foreground leading-relaxed max-w-sm">
            Ternyata ada sedikit masalah di server kita. Jangan panik, kamu bisa coba muat ulang halamannya atau balik ke dashboard.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-row flex-wrap items-center justify-center gap-3 mt-4">
            <Button
              onClick={handleRetry}
              disabled={isPending}
              variant="default"
              size="lg"
              className="font-semibold gap-1.5"
            >
              <RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
              Coba Lagi
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="font-semibold gap-1.5 border-border/80"
            >
              <Link href="/dashboard">
                <Home className="size-4" />
                Ke Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
