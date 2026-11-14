import type { BadgeFamily } from "@/lib/gamification/contracts";
import Link from "next/link";
import { Trophy, TriangleAlert } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { StudentAvatar } from "@/components/gamification/student-avatar";
import { getGamificationLeaderboard } from "@/lib/gamification/leaderboard";
import { getTranslations } from "@/lib/i18n/server";
import { MICRO } from "@/lib/gamification/catalog";
import type { LeaderboardPeriod, LeaderboardScope } from "@/lib/gamification/social-contracts";

export async function LeaderboardList({ userId, query, locale, embedded = false }: { userId: string; query: { period?: string; scope?: string; cursor?: string }; locale: string; embedded?: boolean }) {
  const en = locale === "en";
  const period: LeaderboardPeriod = query.period === "week" || query.period === "month" ? query.period : "all";
  const scope: LeaderboardScope = query.scope === "following" ? "following" : "global";
  const t = await getTranslations("student");
  const resetHref = embedded ? "/achievements?tab=leaderboard" : "/leaderboard";
  const invalid = (query.period !== undefined && !["week", "month", "all"].includes(query.period)) || (query.scope !== undefined && !["global", "following"].includes(query.scope));
  const errorState = (message: string) => <AdminEmptyState icon={TriangleAlert} title={message} action={<Link className="text-body-sm text-primary underline" href={resetHref}>{t("achievementPage.reset")}</Link>} />;
  if (invalid) return errorState(t("achievementPage.invalidFilter"));
  let page;
  try { page = await getGamificationLeaderboard(userId, { period, scope, cursor: query.cursor }); }
  catch (error) { return errorState(t(error instanceof Error && error.message === "Invalid cursor" ? "achievementPage.invalidFilter" : error instanceof Error && error.message === "Forbidden" ? "achievementPage.forbidden" : "achievementPage.unavailable")); }
  const href = (p: string, s: string, cursor?: string) => `${embedded ? "/achievements" : "/leaderboard"}?${new URLSearchParams({ ...(embedded ? { tab: "leaderboard" } : {}), period: p, scope: s, ...(cursor ? { cursor } : {}) })}`;
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-2"><nav className="flex flex-wrap gap-2 text-body-sm" aria-label={en ? "Period" : "Periode"}>{([['week', en ? 'Week' : 'Minggu'], ['month', en ? 'Month' : 'Bulan'], ['all', en ? 'All time' : 'Semua waktu']] as const).map(([value, label]) => <Link key={value} href={href(value, scope)} aria-current={period === value ? 'page' : undefined} className={`rounded-md border px-3 py-2 ${period === value ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>{label}</Link>)}</nav>
    <nav className="flex flex-wrap gap-2 text-body-sm" aria-label={en ? "Scope" : "Cakupan"}>{([['global', 'Global'], ['following', en ? 'Following' : 'Diikuti']] as const).map(([value, label]) => <Link key={value} href={href(period, value)} aria-current={scope === value ? 'page' : undefined} className={`rounded-md border px-3 py-2 ${scope === value ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>{label}</Link>)}</nav></div>
    <p className="text-body-xs text-muted-foreground">{en ? "Ranked by base XP. Equal XP shares a position." : "Peringkat berdasarkan XP dasar. XP sama mendapat posisi yang sama."}</p>
    {page.ownEntry && <p className="text-body-sm">{en ? "Your position" : "Posisi Anda"}: {page.ownEntry.position} · {new Intl.NumberFormat(locale).format(page.ownEntry.baseXpMicro / MICRO)} XP</p>}
    {page.entries.length ? <ol className="divide-y rounded-xl border bg-card">{page.entries.map(entry => <li key={entry.publicId} className="flex items-center gap-3 p-4"><span className="w-8 text-body-sm">{entry.position}</span><StudentAvatar name={entry.displayName} image={entry.avatarUrl} publicId={entry.publicId} mode={entry.avatarMode} badge={entry.avatarBadgeId && entry.badgeTier ? { family: entry.avatarBadgeId as BadgeFamily, tier: entry.badgeTier } : null} frameId={entry.equippedFrameId} themeId={entry.equippedThemeId} /><div className="min-w-0 flex-1"><Link href={`/students/${encodeURIComponent(entry.publicId)}`} className="text-body-sm font-semibold">{entry.displayName}</Link><p className="text-body-xs text-muted-foreground">{entry.rankKey}</p></div><span className="text-body-sm">{new Intl.NumberFormat(locale).format(entry.baseXpMicro / MICRO)} XP</span></li>)}</ol> : <AdminEmptyState icon={Trophy} title={en ? 'No rankings yet' : 'Belum ada peringkat'} />}
    {page.nextCursor && <Link className="inline-block text-body-sm text-primary underline" href={href(period, scope, page.nextCursor)}>{en ? 'Next page' : 'Halaman berikutnya'}</Link>}
    {embedded && <Link className="block text-body-sm text-primary underline" href="/leaderboard/academic">{en ? "Course rankings" : "Peringkat kelas"}</Link>}
  </section>;
}
