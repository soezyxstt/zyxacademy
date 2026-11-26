import { createRoot } from "react-dom/client";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { ProfileEditForm } from "@/app/(student)/profile/edit/profile-edit-form";
import { StudentReflectionsView } from "@/components/student-reflections-view";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavbar } from "@/components/navigation/mobile-top-navbar";
import { loadMessages } from "@/lib/i18n/catalogs";
import type { Profile, ReflectionPage } from "@/packages/native-parity/student/community/contracts";

async function mount() {
  const { pathname, search } = location;
  const query = new URLSearchParams(search);
  const locale = query.get("locale") === "en" ? "en" : "id";
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: "student" });
  const editor = pathname === "/profile/edit";
  if (!editor && pathname !== "/profile/reflections") throw new Error(`Unknown profile reference ${pathname}`);
  const title = editor ? t("profile.editTitle") : t("reflections.title");
  const operation = editor ? "profile?view=edit" : "reflections";
  const response = await fetch(`/api/native/student/community/${operation}`);
  if (!response.ok) throw new Error("Unable to load owned profile reference");
  const content = editor
    ? <ApplicationPage><PageHeader title={title} /><ProfileEditForm user={{ id: "student-fixture", ...(await response.json() as Profile).account }} /></ApplicationPage>
    : <StudentReflectionsView reflections={(await response.json() as ReflectionPage).entries} />;
  createRoot(document.getElementById("root")!).render(
    <NextIntlClientProvider locale={locale} timeZone="Asia/Jakarta" messages={messages}>
      <MobileChromeProvider>
        <MobileTopNavbar title={title} />
        <main>{content}</main>
      </MobileChromeProvider>
    </NextIntlClientProvider>,
  );
}

void mount();
