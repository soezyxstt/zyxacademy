import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { CalendarAgendaClient } from "@/app/(student)/calendar/calendar-agenda-client";
import { ApplicationPage } from "@/components/application-page";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavbar } from "@/components/navigation/mobile-top-navbar";
import { PageHeader } from "@/components/page-header";
import student from "@/messages/id/student.json";
import { calendarEvidence, calendarFixtureForScenario } from "@/packages/native-parity/student/community/calendar-fixture";

const scenario = new URLSearchParams(window.location.search).get("scenario");
const events = calendarFixtureForScenario(scenario ?? "");
if (!events) throw new Error("Invalid calendar fixture scenario");
const title = student.routeTitles.calendar;

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale={calendarEvidence.locale} timeZone={calendarEvidence.timeZone} messages={{ student }}>
    <MobileChromeProvider>
      <MobileTopNavbar title={title} />
      <main>
        <ApplicationPage>
          <PageHeader title={title} />
          <CalendarAgendaClient events={events} canSync={calendarEvidence.canSync} />
        </ApplicationPage>
      </main>
    </MobileChromeProvider>
  </NextIntlClientProvider>,
);
