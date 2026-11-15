import { getGamificationSummary } from "@/lib/gamification/queries";
import { getStudentGamificationAccess } from "@/lib/gamification/access";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";
import { DashboardSummaryContent } from "./dashboard-summary-content";

export async function GamificationDashboardSummary({ userId }: { userId: string }) {
  const access = await getStudentGamificationAccess();
  if (!access || access.user.id !== userId) return null;
  const { user } = access;
  const [summary, locale, t] = await Promise.all([getGamificationSummary(user.id), getAppLocale(), getTranslations("student")]);
  return <DashboardSummaryContent summary={summary} locale={locale} title={t("gamificationUi.achievements")} href="/achievements" />;
}
