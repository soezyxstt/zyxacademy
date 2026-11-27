import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getPeranCodes } from "@/lib/auth/authorization";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata } from "@/lib/site";
import { getStudentCalendarAgenda } from "@/lib/student/calendar-agenda";
import { CalendarAgendaClient } from "./calendar-agenda-client";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("student");
  return createMetadata({ title: t("calendar.pageTitle"), description: t("calendar.metadataDescription"), path: "/calendar" });
}


export default async function CalendarPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });

  if (!session?.user?.id) {
    redirect("/sign-in?next=/calendar");
  }

  const userId = session.user.id;
  const events = await getStudentCalendarAgenda(userId);

  return (
    <ApplicationPage>
      <PageHeader
        title={<TranslatedText namespace="student" messageKey="routeTitles.calendar" />}
        icon={CalendarDays}
      />

      <Reveal>
        <CalendarAgendaClient events={events} canSync={(await getPeranCodes(userId)).some(role => role === "murid" || role === "tutor")} />
      </Reveal>
    </ApplicationPage>
  );
}
