import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface McpAuthorizeErrorProps {
  title?: string;
  description: string;
  errorCode?: string;
  returnUrl?: string;
}

export async function McpAuthorizeError({
  title,
  description,
  errorCode,
  returnUrl = "/",
}: McpAuthorizeErrorProps) {
  const t = await getTranslations("consent.authorize");
  return (
    <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive mb-4">
          <AlertCircle className="size-6" />
        </div>

        <h1 className="font-heading text-h5 font-bold text-foreground">
          {title ?? t("invalidRequest")}
        </h1>

        <p className="mt-2 text-body-sm text-muted-foreground leading-relaxed">
          {description}
        </p>

        {errorCode ? (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-body-2xs font-mono text-muted-foreground">
          <span>{t("errorCode")}:</span>
            <span className="font-semibold text-foreground">{errorCode}</span>
          </div>
        ) : null}

        <div className="mt-6 w-full pt-4 border-t border-border/60">
          <Button asChild variant="outline" className="w-full h-10 gap-2">
            <Link href={returnUrl}>
              <ArrowLeft className="size-4" />
              {t("back")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
