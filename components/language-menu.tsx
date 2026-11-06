"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAppLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/client";
import { localizedPublicPath, stripPublicLocalePrefix } from "@/lib/public-locale-routes";

import { useStudentExperience } from "@/components/student-experience-provider";

export function LanguageMenu({ className }: { className?: string }) {
  const t = useTranslations("core");
  const experience = useStudentExperience();
  const { locale, setLocale, isPending, error } = useAppLocale();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (error) toast.error(error, { id: "app-language-switch-error" });
  }, [error]);

  const handleLocaleChange = async () => {
    const nextLocale = locale === "en" ? "id" : "en";
    if (experience?.mode === "demo") { experience.changeLocale?.(nextLocale); return; }
    const saved = await setLocale(nextLocale);
    if (!saved) return;

    const explicitPublicRoute = stripPublicLocalePrefix(pathname);
    if (!explicitPublicRoute) return;
    const nextPath = localizedPublicPath(nextLocale, explicitPublicRoute.path);
    if (!nextPath) return;
    const suffix = `${window.location.search}${window.location.hash}`;
    router.replace(`${nextPath}${suffix}`, { scroll: false });
  };

  const targetLanguage = locale === "en" ? t("language.indonesian") : t("language.english");
  const switchLabel = t("language.switchTo", { language: targetLanguage });

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={switchLabel}
      aria-pressed={locale === "en"}
      aria-busy={isPending}
      title={switchLabel}
      disabled={isPending}
      onClick={() => void handleLocaleChange()}
      className={`size-8 shrink-0 rounded-lg px-0 text-body-sm font-bold tracking-wide ${className ?? ""}`}
    >
      {isPending ? <span className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden /> : locale.toUpperCase()}
    </Button>
  );
}
