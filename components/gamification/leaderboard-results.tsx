import type { LeaderboardPage, LeaderboardPeriod, LeaderboardScope } from "@/lib/gamification/social-contracts";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { StudentIdentity } from "@/components/gamification/student-identity";
import { MICRO } from "@/lib/gamification/catalog";

export function LeaderboardResults({ page, period, scope, locale, basePath, courseRankingsHref = "/leaderboard/academic", embedded = false, showFilters = true, courseId }: { page: LeaderboardPage; period: LeaderboardPeriod; scope: LeaderboardScope; locale: string; basePath: string; memberPath?: string; courseRankingsHref?: string; embedded?: boolean; showFilters?: boolean; courseId?: string }) {
  const en = locale === "en";
  const href = (p: string, s: string, cursor?: string) => `${basePath}${basePath.includes("?") ? "&" : "?"}${new URLSearchParams({ ...(embedded ? { tab: "leaderboard" } : {}), ...(courseId ? { course: courseId } : {}), period: p, scope: s, ...(cursor ? { cursor } : {}) })}`;
  return <section className="space-y-3">
    {showFilters && <div className="flex flex-wrap items-center gap-2"><nav className="flex flex-wrap gap-2 text-body-sm" aria-label={en ? "Period" : "Periode"}>{([['week', en ? 'Week' : 'Minggu'], ['month', en ? 'Month' : 'Bulan'], ['all', en ? 'All time' : 'Semua waktu']] as const).map(([value, label]) => <Link key={value} href={href(value, scope)} aria-current={period === value ? 'page' : undefined} className={`rounded-md border px-3 py-2 ${period === value ? 'border-foreground/30 bg-foreground/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40'}`}>{label}</Link>)}</nav>
    <nav className="flex flex-wrap gap-2 text-body-sm" aria-label={en ? "Scope" : "Cakupan"}>{([['global', 'Global'], ['following', en ? 'Following' : 'Diikuti']] as const).map(([value, label]) => <Link key={value} href={href(period, value)} aria-current={scope === value ? 'page' : undefined} className={`rounded-md border px-3 py-2 ${scope === value ? 'border-foreground/30 bg-foreground/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40'}`}>{label}</Link>)}</nav></div>}
    <p className="text-body-xs text-muted-foreground">{en ? "Ranked by base XP. Equal XP shares a position." : "Peringkat berdasarkan XP dasar. XP sama mendapat posisi yang sama."}</p>
    {page.ownEntry && <p className="text-body-sm">{en ? "Your position" : "Posisi Anda"}: {page.ownEntry.position} · {new Intl.NumberFormat(locale).format(page.ownEntry.baseXpMicro / MICRO)} XP</p>}
    {page.entries.length ? <ol className="divide-y divide-border/25">{page.entries.map(entry => <li key={entry.publicId} className="flex items-center gap-3 py-(--row-padding)"><span className="w-8 text-body-sm">{entry.position}</span><div className="min-w-0 flex-1"><StudentIdentity name={entry.displayName} identity={entry} /></div><span className="text-body-sm">{new Intl.NumberFormat(locale).format(entry.baseXpMicro / MICRO)} XP</span></li>)}</ol> : <AdminEmptyState icon={Trophy} title={en ? 'No rankings yet' : 'Belum ada peringkat'} />}
    {page.nextCursor && <Link className="inline-block text-body-sm text-primary underline" href={href(period, scope, page.nextCursor)}>{en ? 'Next page' : 'Halaman berikutnya'}</Link>}
    {embedded && <Link className="block text-body-sm text-primary underline" href={courseRankingsHref}>{en ? "Course rankings" : "Peringkat kelas"}</Link>}
  </section>;
}
