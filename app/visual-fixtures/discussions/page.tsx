import { notFound } from "next/navigation";
import { DiscussionFixture } from "@/components/discussions/discussion-fixture";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { loadMessages } from "@/lib/i18n/catalogs";

export default async function DiscussionFixturePage({ searchParams }: { searchParams: Promise<{ role?: string; question?: string; channel?: string; message?: string; discussionTab?: string; state?: string; fail?: string; locale?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const locale = query.locale === "en" ? "en" : "id";
  return <LocaleProvider initialLocale={locale} initialMessages={await loadMessages(locale)}><DiscussionFixture query={query} /></LocaleProvider>;
}
