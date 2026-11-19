import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, CalendarDays, MessageSquareText, Pencil, UserRound, Users } from "lucide-react";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { ProfileHero } from "@/components/gamification/profile-hero";
import { AchievementBoard } from "@/components/gamification/achievement-board";
import { MICRO } from "@/lib/gamification/catalog";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import type { BadgeFamily, RankKey } from "@/lib/gamification/contracts";

type ProfileLabels = { pageTitle: string; edit: string; active: string; completed: string; exams: string; average: string; badgeBoard: string; locked: string; tiers: string[]; achievements: string; enrolled: string; noCourses: string; groups: string; tutorials: string; reflections: string; familyLabels: Record<BadgeFamily, string> };
type ProfileLinks = { edit: string; achievements?: string; courses: string; course: string; groups: string; schedule: string; reflections: string };
export function StudentProfileView({ name, image, frameId, themeId, title, zyraAvatarId, academicInfo, rank, baseXpMicro, bonusXpMicro, lpBalance, stats, enrollments, badges, featuredBadgeIds, labels, links, followSection, locale }: {
 locale?: string; name: string; image?: string | null; frameId?: string | null; themeId?: string | null; title?: string | null; zyraAvatarId?: string | null; academicInfo: string; rank: RankKey; baseXpMicro: number; bonusXpMicro: number; lpBalance: number;
 stats: { completedCount: number; submissionCount: number; averageScore: number | null }; enrollments: { id: string; title: string; href?: string }[]; badges: { family: string; tier: number }[]; featuredBadgeIds: string[]; labels: ProfileLabels; links: ProfileLinks; followSection?: ReactNode;
}) {
 return <ApplicationPage maxWidth="7xl" spacing="space-y-(--compact-gap)"><PageHeader title={labels.pageTitle} icon={UserRound} actions={
   <TooltipProvider><Tooltip><TooltipTrigger asChild><Button asChild variant="ghost" size="icon-lg">
     <Link href={links.edit} aria-label={labels.edit}><Pencil aria-hidden /></Link>
   </Button></TooltipTrigger><TooltipContent>{labels.edit}</TooltipContent></Tooltip></TooltipProvider>
 } />
 <ProfileHero name={name} image={image} frameId={frameId} themeId={themeId} title={title} zyraAvatarId={zyraAvatarId} academicInfo={academicInfo} rank={rank} details={<span className="inline-flex flex-wrap gap-x-(--related-gap) gap-y-1 text-body-sm"><span>{new Intl.NumberFormat(locale).format((baseXpMicro + bonusXpMicro) / MICRO)} XP</span><span>{new Intl.NumberFormat(locale).format(lpBalance)} LP</span></span>} />
 <AdminStatStrip className="grid-cols-2 lg:grid-cols-4">
  <AdminStatStripItem label={labels.active} value={enrollments.length} />
  <AdminStatStripItem label={labels.completed} value={stats.completedCount} />
  <AdminStatStripItem label={labels.exams} value={stats.submissionCount} />
  <AdminStatStripItem label={labels.average} value={stats.averageScore ?? "-"} />
 </AdminStatStrip>
 <div className="grid min-w-0 gap-(--section-gap) lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
  <div className="min-w-0 space-y-(--section-gap)">
   <section className="space-y-(--compact-gap)"><h2 className="font-heading text-section-title font-bold">{labels.enrolled}</h2><div className="divide-y divide-border border-t border-border">{enrollments.length ? enrollments.map(course => <Link className="flex items-center gap-(--compact-gap) py-(--row-padding) text-body-sm font-semibold transition-colors hover:bg-muted/50 focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2" key={course.id} href={course.href ?? `${links.course}/${course.id}`}><BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden /><span className="min-w-0 flex-1 break-words">{course.title}</span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /></Link>) : <AdminEmptyState icon={BookOpen} title={labels.noCourses} action={<Button asChild variant="outline"><Link href={links.courses}>{labels.enrolled}</Link></Button>} />}</div></section>
   <nav className="divide-y divide-border border-t border-border">{[{href:links.groups,label:labels.groups,icon:Users},{href:links.schedule,label:labels.tutorials,icon:CalendarDays},{href:links.reflections,label:labels.reflections,icon:MessageSquareText}].map(({href,label,icon:Icon}) => <Link key={href} href={href} className="flex items-center gap-(--compact-gap) py-(--row-padding) text-body-sm transition-colors hover:bg-muted/50 focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"><Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /><span className="min-w-0 flex-1">{label}</span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /></Link>)}</nav>
   {followSection}
  </div>
  <AchievementBoard compact badges={badges} featuredBadgeIds={featuredBadgeIds} title={labels.badgeBoard} familyLabels={labels.familyLabels} lockedLabel={labels.locked} tierLabel={tier => labels.tiers[tier - 1] ?? String(tier)} action={links.achievements ? <Button variant="outline" size="sm" asChild><Link href={links.achievements}>{labels.achievements}</Link></Button> : undefined} />
 </div></ApplicationPage>;
}
