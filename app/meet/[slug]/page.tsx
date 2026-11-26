import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MeetingUnavailable } from "@/components/meet/unavailable";
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

  return <MeetingUnavailable title={t("public.meetNotFound")} description={t("public.meetUnavailable")} home={t("public.home")} />;
}
