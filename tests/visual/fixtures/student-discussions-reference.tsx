import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { createRoot } from "react-dom/client";
import AliasPage from "@/app/(student)/discussions/page";
import DashboardPage from "@/app/(student)/dashboard/discussions/page";
import CoursePage from "@/app/(student)/courses/[id]/discussions/page";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavbar } from "@/components/navigation/mobile-top-navbar";
import { loadMessages } from "@/lib/i18n/catalogs";

async function mount() {
  const { pathname, search } = location;
  if (pathname === "/discussions") {
    // Run the production alias against the fixture Student actor and preserve
    // the same repeated search parameters that Next supplies to its page.
    const params = new URLSearchParams(search);
    const input = Object.fromEntries([...new Set(params.keys())].map(key => [key, params.getAll(key)]));
    await AliasPage({ searchParams: Promise.resolve(input) });
    return;
  }
  const course = /^\/courses\/([^/]+)\/discussions$/.exec(pathname);
  if (pathname !== "/dashboard/discussions" && !course) throw new Error(`Unknown discussion route ${pathname}`);
  const route = course ? await CoursePage({ params: Promise.resolve({ id: decodeURIComponent(course[1]) }) }) : DashboardPage();
  const Page = route.type;
  if (typeof Page !== "function") throw new Error("Expected the discussion server component");
  const content = await Page(route.props);
  const messages = await loadMessages("id");
  const t = createTranslator({ locale: "id", messages, namespace: "discussions" });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  createRoot(document.getElementById("root")!).render(
    <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <MobileChromeProvider>
          <MobileTopNavbar title={t("title")} />
          <main>{content}</main>
        </MobileChromeProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

void mount().catch(error => {
  if (error?.name !== "FixtureRedirect") throw error;
});
