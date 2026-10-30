"use client";

import Link from "next/link";
import { Bell, ChevronRight, MessageSquareHeart, Settings, User } from "lucide-react";
import { LanguageMenu } from "@/components/language-menu";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { useTranslations } from "@/lib/i18n/client";

export function SettingsClient({ userName, userEmail }: { userName: string | null; userEmail: string | null }) {
  const t = useTranslations("student");

  return (
    <ApplicationPage>
      <PageHeader title={t("settings.accountTitle")} icon={Settings} />
      <Reveal className="mt-4 max-w-3xl divide-y divide-border rounded-xl border border-border bg-card px-4">
        <section className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <User className="size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h2 className="font-heading text-body-sm font-bold">{userName || t("settings.studentFallback")}</h2>
              <p className="break-words text-body-xs text-muted-foreground">{userEmail || t("settings.emailUnavailable")}</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/profile">{t("settings.viewProfile")}<ChevronRight className="size-3.5" /></Link>
          </Button>
        </section>
        <section className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <h2 className="font-heading text-body-sm font-bold">{t("settings.language")}</h2>
            <p className="text-body-xs text-muted-foreground">{t("settings.languageDescription")}</p>
          </div>
          <LanguageMenu />
        </section>
        <section className="flex flex-wrap items-center justify-between gap-3 py-3">
          <h2 className="flex items-center gap-3 font-heading text-body-sm font-bold"><Bell className="size-5 text-primary" />{t("settings.emailNotifications")}</h2>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/notifications">{t("settings.manageNotifications")}<ChevronRight className="size-3.5" /></Link>
          </Button>
        </section>
        <section className="flex flex-wrap items-center justify-between gap-3 py-3">
          <h2 className="flex items-center gap-3 font-heading text-body-sm font-bold"><MessageSquareHeart className="size-5 text-primary" />{t("settings.feedback")}</h2>
          <Button asChild variant="outline" size="sm">
            <Link href="/feedback">{t("settings.sendFeedback")}<ChevronRight className="size-3.5" /></Link>
          </Button>
        </section>
      </Reveal>
    </ApplicationPage>
  );
}
