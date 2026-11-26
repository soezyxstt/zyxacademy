import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findPublicMeeting } from "@/lib/meet/public-meeting";
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

  const session = await findPublicMeeting(slug);

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

  const session = await findPublicMeeting(slug);

  if (session?.meetingUri) {
    redirect(session.meetingUri);
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-(--page-gutter) py-(--section-gap)">
      <div className="space-y-(--compact-gap) text-center">
        <Video className="mx-auto size-5 text-muted-foreground" aria-hidden />
        <h1 className="font-heading text-h5 font-bold text-foreground">
          {t("public.meetNotFound")}
        </h1>
        <p className="text-body-sm text-muted-foreground">
          {t("public.meetUnavailable")}
        </p>
        <Button asChild>
          <Link href="/">{t("public.home")}</Link>
        </Button>
      </div>
    </main>
  );
}
