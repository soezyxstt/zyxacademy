import { createRoot } from "react-dom/client";
import { useState } from "react";
import { NotificationPermissionDialog } from "@/components/notifications/notification-permission-dialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { SettingsClient } from "@/app/(student)/settings/settings-client";
import { NotificationPreferencesForm } from "@/app/(student)/settings/notifications/notification-preferences-form";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { StudentApplicationShell } from "@/components/student-application-shell";
import { StudentExperienceProvider, type StudentExperienceAdapter } from "@/components/student-experience-provider";
import { AppearancePreferencesRuntime } from "@/components/appearance-preferences";
import { AppToaster } from "@/components/app-toaster";
import { DEFAULT_EMAIL_NOTIFICATION_PREFERENCES } from "@/lib/email-preferences/contracts";
import { loadMessages } from "@/lib/i18n/catalogs";

function PermissionPreview({ blocked }: { blocked: boolean }) {
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);
  return open ? <NotificationPermissionDialog blocked={blocked} onEnable={close} onLater={close} onNever={close} /> : null;
}

async function mount() {
  const params = new URLSearchParams(location.search);
  const locale = params.get("locale") === "en" ? "en" : "id";
  const messages = await loadMessages(locale);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const experience: StudentExperienceAdapter = {
    mode: "demo", pathname: "/settings", courseHref: id => `/courses/${id}`, route: view => `/${view}`,
    account: { name: "Pelajar", email: "pelajar@example.test" },
    courses: [{ id: "fixture-course", title: "Matematika I", category: "TPB" }],
    baseline: [], selectedCourseId: null, overlay: null, ready: true,
  };
  createRoot(document.getElementById("root")!).render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <LocaleProvider initialLocale={locale} initialMessages={messages}>
        <QueryClientProvider client={queryClient}>
          <AppearancePreferencesRuntime />
          <StudentExperienceProvider value={experience}>
            <StudentApplicationShell showLive={false} personalizeTypographyAndSpacing>
              <StudentExperienceProvider value={{ ...experience, mode: "student" }}>
                <SettingsClient email={<NotificationPreferencesForm
                  accountEmail="pelajar@example.test"
                  initialPreferences={DEFAULT_EMAIL_NOTIFICATION_PREFERENCES}
                />} />
              </StudentExperienceProvider>
            </StudentApplicationShell>
          </StudentExperienceProvider>
          {params.has("permissionPrompt") ? <PermissionPreview blocked={params.get("permissionPrompt") === "blocked"} /> : null}
          <AppToaster />
        </QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider>,
  );
}

void mount();
