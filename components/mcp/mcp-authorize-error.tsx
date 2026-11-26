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
    <div className="space-y-(--compact-gap)">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-1 size-5 shrink-0 text-status-error" aria-hidden />
        <h1 className="wrap-anywhere font-heading text-h5 font-bold">{title ?? t("invalidRequest")}</h1>
      </div>
      <p className="wrap-anywhere text-body-sm leading-relaxed text-muted-foreground">{description}</p>
      {errorCode ? (
        <p className="wrap-anywhere text-body-xs text-muted-foreground">
          {t("errorCode")} <code>{errorCode}</code>
        </p>
      ) : null}
      <div className="flex justify-end border-t border-border/60 pt-(--compact-gap)">
        <Button asChild variant="outline">
          <Link href={returnUrl}>
            <ArrowLeft className="size-4" aria-hidden />
            {t("back")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
