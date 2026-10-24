import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("meet.title")), description: t("meet.description") };
}

export default function AdminMeetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
