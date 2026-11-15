import Link from "next/link";
import { getGamificationSummary } from "@/lib/gamification/queries";
import { rankLabels } from "@/lib/gamification/labels";
import { MICRO } from "@/lib/gamification/catalog";
import { getStudentGamificationAccess } from "@/lib/gamification/access";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";
import { RankArtwork } from "./artwork";

export async function GamificationDashboardSummary({ userId }: { userId: string }) {
  const access = await getStudentGamificationAccess();
  if (!access || access.user.id !== userId) return null;
  const { user } = access;
  const [summary, locale, t] = await Promise.all([getGamificationSummary(user.id), getAppLocale(), getTranslations("student")]);
  return <Link href="/achievements" className="flex items-center gap-3 rounded-xl border bg-card p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
    <RankArtwork rank={summary.rankKey} size={56} /><div className="min-w-0"><h2 className="font-heading text-body-base font-bold">{t("gamificationUi.achievements")}</h2><p className="text-body-sm">{rankLabels[summary.rankKey]} · {new Intl.NumberFormat(locale).format((summary.baseXpMicro + summary.bonusXpMicro) / MICRO)} XP · {new Intl.NumberFormat(locale).format(summary.lpBalance)} LP</p></div>
  </Link>;
}
