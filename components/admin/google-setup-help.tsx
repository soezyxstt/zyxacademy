"use client";

import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslations } from "@/lib/i18n/client";

export function GoogleSetupHelp({ service }: { service: "meet" | "sheets" }) {
  const t = useTranslations("admin.googleSetup");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="icon-lg" variant="ghost" aria-label={t("title")} title={t("title")}><CircleHelp className="size-4" /></Button>
      </PopoverTrigger>
      <PopoverContent aria-label={t("title")} className="max-h-[70vh] w-80 max-w-[90vw] overflow-y-auto">
        <ol className="list-decimal space-y-2 pl-4 text-body-sm">
          <li><a className="underline" href="https://console.cloud.google.com/apis/library" target="_blank" rel="noreferrer">{t("library")}</a>. {t(service)}</li>
          <li>{t("client")}</li>
          <li><a className="underline" href="https://developers.google.com/oauthplayground/" target="_blank" rel="noreferrer">OAuth Playground</a>. {t("authorize")}
            <code className="mt-1 block select-all break-all text-body-xs">https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/meetings.space.created</code>
          </li>
          <li>{t("deploy")}</li>
        </ol>
      </PopoverContent>
    </Popover>
  );
}
