"use client";

import { useId } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAppLocale } from "@/components/providers/locale-provider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localizedPublicPath, stripPublicLocalePrefix } from "@/lib/public-locale-routes";

export function LanguageMenu({ className }: { className?: string }) {
  const t = useTranslations("core");
  const { locale, setLocale, isPending, error } = useAppLocale();
  const id = useId();
  const pathname = usePathname();
  const router = useRouter();

  const handleLocaleChange = async (value: string) => {
    const nextLocale = value === "en" ? "en" : "id";
    const saved = await setLocale(nextLocale);
    if (!saved) return;

    const explicitPublicRoute = stripPublicLocalePrefix(pathname);
    if (!explicitPublicRoute) return;
    const nextPath = localizedPublicPath(nextLocale, explicitPublicRoute.path);
    if (!nextPath) return;
    const suffix = `${window.location.search}${window.location.hash}`;
    router.replace(`${nextPath}${suffix}`, { scroll: false });
  };

  return (
    <div className={className}>
      <Label className="sr-only" htmlFor={id}>{t("language.label")}</Label>
      <Select value={locale} onValueChange={(value) => void handleLocaleChange(value)}>
        <SelectTrigger id={id} aria-label={t("language.label")} disabled={isPending} className="w-auto min-w-36 text-body-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="id">{t("language.indonesian")}</SelectItem>
          <SelectItem value="en">{t("language.english")}</SelectItem>
        </SelectContent>
      </Select>
      {error ? <p role="alert" className="mt-1 text-body-xs text-destructive">{error}</p> : null}
    </div>
  );
}
