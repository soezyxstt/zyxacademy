import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MICRO } from "@/lib/gamification/catalog";
import { rankLabels } from "@/lib/gamification/labels";
import type { GamificationSummary } from "@/lib/gamification/contracts";
import { RankArtwork } from "./artwork";

export function DashboardSummaryContent({ summary, locale, title, href }: { summary: GamificationSummary; locale: string; title: string; href: string }) {
  const formatter = new Intl.NumberFormat(locale);
  return (
    <Link
      href={href}
      className="group -mx-2 flex items-center gap-3 rounded-lg border-b border-border/40 px-2 pb-4 pt-1 transition-colors hover:bg-muted/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <RankArtwork rank={summary.rankKey} size={56} />
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="font-heading text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <div className="flex flex-wrap items-center divide-x divide-border/40 text-body-sm text-muted-foreground">
          <span className="pr-2.5 font-semibold text-foreground">{rankLabels[summary.rankKey]}</span>
          <span className="px-2.5 tabular-nums">{formatter.format((summary.baseXpMicro + summary.bonusXpMicro) / MICRO)} XP</span>
          <span className="pl-2.5 tabular-nums">{formatter.format(summary.lpBalance)} LP</span>
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
    </Link>
  );
}
