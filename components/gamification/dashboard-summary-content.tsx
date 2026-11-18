import Link from "next/link";
import { MICRO } from "@/lib/gamification/catalog";
import { rankLabels } from "@/lib/gamification/labels";
import type { GamificationSummary } from "@/lib/gamification/contracts";
import { RankArtwork } from "./artwork";

export function DashboardSummaryContent({ summary, locale, title, href }: { summary: GamificationSummary; locale: string; title: string; href: string }) {
  return <Link href={href} className="flex items-center gap-3 border-b border-border py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
    <RankArtwork rank={summary.rankKey} size={56} /><div className="min-w-0"><h2 className="font-heading text-body-base font-bold">{title}</h2><p className="text-body-sm">{rankLabels[summary.rankKey]} · {new Intl.NumberFormat(locale).format((summary.baseXpMicro + summary.bonusXpMicro) / MICRO)} XP · {new Intl.NumberFormat(locale).format(summary.lpBalance)} LP</p></div>
  </Link>;
}
