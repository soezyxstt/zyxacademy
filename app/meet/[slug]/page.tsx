import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { Video } from "lucide-react";
import { db } from "@/db";
import { googleMeetSessions } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { createMetadata } from "@/lib/site";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getAppLocale();
  const t = await getTranslations("marketing");

  const [session] = await db
    .select({ title: googleMeetSessions.title })
    .from(googleMeetSessions)
    .where(and(eq(googleMeetSessions.slug, slug), isNull(googleMeetSessions.deletedAt)))
    .limit(1);

  if (session) {
    return createMetadata({
      title: t("public.meetFor", { title: session.title }),
      description: t("public.meetForDescription", { title: session.title }),
      path: `/meet/${slug}`,
      locale,
    });
  }

  return createMetadata({
    title: t("public.meetTitle"),
    description: t("public.meetDescription"),
    path: `/meet/${slug}`,
    locale,
  });
}


export default async function MeetSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = await getTranslations("marketing");
  const { slug } = await params;

  const [session] = await db
    .select()
    .from(googleMeetSessions)
    .where(and(eq(googleMeetSessions.slug, slug), isNull(googleMeetSessions.deletedAt)))
    .limit(1);

  if (session?.meetingUri) {
    redirect(session.meetingUri);
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
          <Video className="size-6" aria-hidden />
        </div>
        <h1 className="mt-4 font-heading text-h5 font-semibold text-foreground">
          {t("public.meetNotFound")}
        </h1>
        <p className="mt-2 text-body-sm text-muted-foreground">
          {t("public.meetUnavailable")}
        </p>
        <Button asChild className="mt-6">
          <Link href="/">{t("public.home")}</Link>
        </Button>
      </div>
    </div>
  );
}
