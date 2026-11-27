import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { AdminSidebar } from "@/components/admin-sidebar";
import { ApplicationShell } from "@/components/application-shell";
import { ApplicationPage } from "@/components/application-page";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminMobileBottomNav, AdminMobileSubTabNav, AdminMobileTopNav } from "@/components/navigation/admin";
import { OfflineCacheSettings } from "@/components/admin/offline-cache-settings";
import { loadMessages } from "@/lib/i18n/catalogs";

async function mount() {
  const locale = new URLSearchParams(location.search).get("locale") === "en" ? "en" : "id";
  const messages = await loadMessages(locale);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  createRoot(document.getElementById("root")!).render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <LocaleProvider initialLocale={locale} initialMessages={messages}>
        <QueryClientProvider client={queryClient}>
          <ApplicationShell showOrnaments={false} desktopSidebar={<AdminSidebar />}
            mobileTopNav={<AdminMobileTopNav />} mobileBottomNav={<AdminMobileBottomNav />}>
            <AdminMobileSubTabNav />
            <ApplicationPage>
              <AdminPageHeader title={locale === "id" ? "Data offline" : "Offline data"} />
              <OfflineCacheSettings />
            </ApplicationPage>
          </ApplicationShell>
        </QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider>,
  );
}
void mount();
