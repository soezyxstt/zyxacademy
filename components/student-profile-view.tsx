import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, UserRound } from "lucide-react";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { ProfileHero } from "@/components/gamification/profile-hero";
import { AchievementBoard } from "@/components/gamification/achievement-board";
import { MICRO } from "@/lib/gamification/catalog";
import type { BadgeFamily, RankKey } from "@/lib/gamification/contracts";

type ProfileLabels = { pageTitle: string; edit: string; active: string; completed: string; exams: string; average: string; badgeBoard: string; locked: string; tiers: string[]; achievements: string; enrolled: string; noCourses: string; groups: string; tutorials: string; reflections: string; familyLabels: Record<BadgeFamily, string> };
type ProfileLinks = { edit: string; achievements?: string; courses: string; course: string; groups: string; schedule: string; reflections: string };
export function StudentProfileView({ name, image, frameId, themeId, title, academicInfo, rank, baseXpMicro, bonusXpMicro, lpBalance, stats, enrollments, badges, featuredBadgeIds, labels, links, followSection }: {
 name: string; image?: string | null; frameId?: string | null; themeId?: string | null; title?: string | null; academicInfo: string; rank: RankKey; baseXpMicro: number; bonusXpMicro: number; lpBalance: number;
 stats: { completedCount: number; submissionCount: number; averageScore: number | null }; enrollments: { id: string; title: string; href?: string }[]; badges: { family: string; tier: number }[]; featuredBadgeIds: string[]; labels: ProfileLabels; links: ProfileLinks; followSection?: ReactNode;
}) {
 return <ApplicationPage><PageHeader title={labels.pageTitle} icon={UserRound} /><div className="space-y-6">
 <ProfileHero name={name} image={image} frameId={frameId} themeId={themeId} title={title} academicInfo={academicInfo} rank={rank} actions={<Button asChild variant="outline"><Link href={links.edit}>{labels.edit}</Link></Button>} details={<><span>{new Intl.NumberFormat().format((baseXpMicro + bonusXpMicro) / MICRO)} XP · {new Intl.NumberFormat().format(lpBalance)} LP</span><p>{labels.active}: {enrollments.length} · {labels.completed}: {stats.completedCount} · {labels.exams}: {stats.submissionCount} · {labels.average}: {stats.averageScore ?? "-"}</p></>} />
 <AchievementBoard badges={badges} featuredBadgeIds={featuredBadgeIds} title={labels.badgeBoard} familyLabels={labels.familyLabels} lockedLabel={labels.locked} tierLabel={tier => labels.tiers[tier - 1] ?? String(tier)} action={links.achievements ? <Button variant="outline" size="sm" asChild><Link href={links.achievements}>{labels.achievements}</Link></Button> : undefined} />
 <section className="space-y-2"><h2 className="font-heading text-body-base font-bold">{labels.enrolled}</h2><div className="divide-y rounded-xl border bg-card">{enrollments.length ? enrollments.map(course => <Link className="block p-3 text-body-sm underline" key={course.id} href={course.href ?? `${links.course}/${course.id}`}>{course.title}</Link>) : <AdminEmptyState icon={BookOpen} title={labels.noCourses} action={<Button asChild variant="outline"><Link href={links.courses}>{labels.enrolled}</Link></Button>} />}</div></section>
 {followSection}<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={links.groups}>{labels.groups}</Link></Button><Button asChild variant="outline"><Link href={links.schedule}>{labels.tutorials}</Link></Button><Button asChild variant="outline"><Link href={links.courses}>{labels.enrolled}</Link></Button><Button asChild variant="outline"><Link href={links.reflections}>{labels.reflections}</Link></Button></div></div></ApplicationPage>;
}
