import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MailCheck, MailX } from "lucide-react";
import { confirmEmailUnsubscribeAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";
import {
  EMAIL_NOTIFICATION_CATEGORY_DETAILS,
  isEmailNotificationCategory,
} from "@/lib/email-preferences/contracts";
import { verifyEmailUnsubscribeToken } from "@/lib/email-preferences/token";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Email preferences"),
  description: "Unsubscribe from optional Zyx Academy email.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  if (env.FEATURE_NOTIFICATION_PREFERENCES !== "1") notFound();

  const params = await searchParams;
  const status = first(params.status);
  const categoryParam = first(params.category);
  if (status === "success" && isEmailNotificationCategory(categoryParam)) {
    const details = EMAIL_NOTIFICATION_CATEGORY_DETAILS[categoryParam];
    return (
      <div className="marketing-container flex min-h-[60vh] items-center justify-center py-16">
        <Card className="w-full max-w-xl shadow-sm">
          <CardHeader className="items-center text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-status-success/10 text-status-success">
              <MailCheck className="size-6" aria-hidden />
            </span>
            <CardTitle className="text-h5">Email preference updated</CardTitle>
            <CardDescription>You will no longer receive {details.label} email.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild variant="outline" size="lg">
              <Link href="/settings/notifications">Manage all preferences</Link>
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
            <CardTitle className="text-h5">This unsubscribe link is invalid</CardTitle>
            <CardDescription>The link may be incomplete or older than 30 days.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild variant="outline" size="lg">
              <Link href="/settings/notifications">Manage preferences</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const details = EMAIL_NOTIFICATION_CATEGORY_DETAILS[category];
  return (
    <div className="marketing-container flex min-h-[60vh] items-center justify-center py-16">
      <Card className="w-full max-w-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-h5">Unsubscribe from {details.label}</CardTitle>
          <CardDescription>
            This disables only {details.label} email. Your other optional categories and essential account email stay enabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <form action={confirmEmailUnsubscribeAction}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant="destructive" size="lg">
              Unsubscribe
            </Button>
          </form>
          <Button asChild variant="outline" size="lg">
            <Link href="/settings/notifications">Manage all preferences</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
