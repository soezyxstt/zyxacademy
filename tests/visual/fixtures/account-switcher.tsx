import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { BookOpen, CalendarDays, CircleHelp, LayoutDashboard, MessageCircle, PanelLeftOpen } from "lucide-react";
import { SidebarShell, NavItem, openMobileSidebar } from "@/components/sidebar-shell";
import { MobileSidebarController } from "@/components/mobile-sidebar-controller";
import { listenToDialogHistory } from "@/hooks/use-dialog-history";
import { StudentExperienceProvider, type StudentExperienceAdapter } from "@/components/student-experience-provider";
import commonId from "@/messages/id/common.json";
import commonEn from "@/messages/en/common.json";
import uiId from "@/messages/id/ui.json";
import uiEn from "@/messages/en/ui.json";

const params = new URLSearchParams(location.search);
const english = params.get("locale") === "en";
const demo = params.get("scenario") === "demo";
const adapter: StudentExperienceAdapter = {
  mode: demo ? "demo" : "student", courseHref: id => `/courses/${id}`, route: path => `/${path}`,
  baseline: [], selectedCourseId: null, overlay: null, ready: true,
  account: demo ? { name: "Pelajar Demo", email: "pelajar@example.test" } : undefined,
};
const nav = [
  { icon: LayoutDashboard, label: english ? "Dashboard" : "Dasbor", href: "/dashboard" },
  { icon: BookOpen, label: english ? "Courses" : "Mata kuliah", href: "/courses" },
  { icon: CalendarDays, label: english ? "Schedule" : "Jadwal", href: "/schedule" },
  { icon: MessageCircle, label: english ? "Discussions" : "Diskusi", href: "/discussions" },
  { icon: CircleHelp, label: english ? "Help" : "Bantuan", href: "/help" },
];

listenToDialogHistory();
createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale={english ? "en" : "id"} messages={{ common: english ? commonEn : commonId, ui: english ? uiEn : uiId }} timeZone="Asia/Jakarta">
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <StudentExperienceProvider value={adapter}>
        <div className="flex min-h-svh bg-background text-foreground">
          <MobileSidebarController />
          <SidebarShell collapsedKey="fixture-sidebar-collapsed" logoHref="/dashboard" logoLabel="Zyx Academy" nav={collapsed => <nav aria-label="Navigasi" className="flex-1 space-y-1 p-2">
            {nav.map(item => <NavItem key={item.href} {...item} collapsed={collapsed} active={item.href === "/dashboard"} />)}
          </nav>} />
          <main className="min-w-0 flex-1 px-5 py-6 md:px-10 md:py-8">
            <button type="button" aria-label="Buka menu" onClick={openMobileSidebar} className="mb-6 flex size-10 items-center justify-center rounded-lg border border-border md:hidden"><PanelLeftOpen className="size-4" /></button>
            <h1 className="font-heading text-h5 font-bold">{english ? "Dashboard" : "Dasbor"}</h1>
            <section className="mt-8 max-w-3xl" aria-label={english ? "Continue learning" : "Lanjut belajar"}>
              <h2 className="font-heading text-body-base font-bold">{english ? "Continue learning" : "Lanjut belajar"}</h2>
              <div className="mt-3 divide-y divide-border">
                {["Matematika", "Fisika Dasar", "Berpikir Komputasional"].map(course => <div className="flex items-center justify-between gap-4 py-4" key={course}>
                  <span className="flex items-center gap-3 text-body-sm"><BookOpen className="size-4 text-muted-foreground" />{course}</span>
                  <span className="text-body-xs text-muted-foreground">{english ? "Course" : "Mata kuliah"}</span>
                </div>)}
              </div>
            </section>
          </main>
        </div>
      </StudentExperienceProvider>
    </QueryClientProvider>
  </NextIntlClientProvider>,
);
