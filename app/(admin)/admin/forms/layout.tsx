import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("forms.title")), description: t("forms.description") };
}

export default function AdminFormsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
