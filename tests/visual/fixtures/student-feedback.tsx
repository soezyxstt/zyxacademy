import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import { FeedbackForm } from "@/app/(student)/feedback/feedback-form";
import { Toaster } from "@/components/ui/toast";
import studentId from "@/messages/id/student.json";
import studentEn from "@/messages/en/student.json";

// This entry runs only inside the intercepted, local Playwright fixture.
const params = new URLSearchParams(location.search);
const locale = params.get("locale") === "en" ? "en" : "id";
const theme = params.get("theme") === "dark" ? "dark" : "light";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" forcedTheme={theme} enableSystem={false}>
    <NextIntlClientProvider locale={locale} timeZone="Asia/Jakarta" messages={{ student: locale === "en" ? studentEn : studentId }}>
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <h1 className="mb-6 font-heading text-h4">{locale === "en" ? "Student feedback" : "Masukan mahasiswa"}</h1>
        <FeedbackForm initialEmail={params.get("comparison") === "feedback" ? "" : "pelajar@example.test"} />
      </main>
      <Toaster />
    </NextIntlClientProvider>
  </ThemeProvider>,
);
