import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck, MailX } from "lucide-react";
import { confirmEmailUnsubscribeAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isEmailNotificationCategory, type EmailNotificationCategory } from "@/lib/email-preferences/contracts";
import { verifyEmailUnsubscribeToken } from "@/lib/email-preferences/token";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: pageTitle(t("email.unsubscribe.title")), description: t("email.unsubscribe.description") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function categoryMessageKey(category: EmailNotificationCategory) {
  return {
    course_updates: "courseUpdates",
    events_and_schedules: "eventsAndSchedules",
    learning_reminders: "learningReminders",
    news_and_offers: "newsAndOffers",
  }[category];
}

export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations("notifications");
  const params = await searchParams;
  const status = first(params.status);
  const categoryParam = first(params.category);
  if (status === "success" && isEmailNotificationCategory(categoryParam)) {
    const categoryLabel = t(`email.categories.${categoryMessageKey(categoryParam)}.label`);
    return (
      <div className="marketing-container flex min-h-[60vh] items-center justify-center py-16">
        <Card className="w-full max-w-xl shadow-sm">
          <CardHeader className="items-center text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-status-success/10 text-status-success">
              <MailCheck className="size-6" aria-hidden />
            </span>
            <CardTitle className="text-h5">{t("email.unsubscribe.successTitle")}</CardTitle>
            <CardDescription>{t("email.unsubscribe.successBody", { category: categoryLabel })}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild variant="outline" size="lg">
              <Link href="/settings/notifications">{t("email.unsubscribe.manageAll")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const token = first(params.token);
  let category = null;
  if (token) {
    try {
      category = verifyEmailUnsubscribeToken(token).category;
    } catch {
      category = null;
    }
  }

  if (!token || !category) {
    return (
      <div className="marketing-container flex min-h-[60vh] items-center justify-center py-16">
        <Card className="w-full max-w-xl shadow-sm">
          <CardHeader className="items-center text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-status-error/10 text-status-error">
              <MailX className="size-6" aria-hidden />
            </span>
            <CardTitle className="text-h5">{t("email.unsubscribe.invalidTitle")}</CardTitle>
            <CardDescription>{t("email.unsubscribe.invalidBody")}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild variant="outline" size="lg">
              <Link href="/settings/notifications">{t("email.unsubscribe.manage")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const categoryLabel = t(`email.categories.${categoryMessageKey(category)}.label`);
  return (
    <div className="marketing-container flex min-h-[60vh] items-center justify-center py-16">
      <Card className="w-full max-w-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-h5">{t("email.unsubscribe.confirmTitle", { category: categoryLabel })}</CardTitle>
          <CardDescription>
            {t("email.unsubscribe.confirmBody", { category: categoryLabel })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <form action={confirmEmailUnsubscribeAction}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant="destructive" size="lg">
              {t("email.unsubscribe.unsubscribe")}
            </Button>
          </form>
          <Button asChild variant="outline" size="lg">
            <Link href="/settings/notifications">{t("email.unsubscribe.manageAll")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
