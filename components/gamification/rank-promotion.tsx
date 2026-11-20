import { MICRO, RANKS } from "@/lib/gamification/catalog";
import type { GamificationSummary, RankKey } from "@/lib/gamification/contracts";
import { RankArtwork } from "./artwork";

type Labels = {
  rank: (rank: RankKey) => string;
  nextRank: string;
  maximumRank: string;
  xp: string;
  courses: string;
  balance?: string;
  requirement?: string;
};

/** Rank promotion has two independent gates, distinct from achievement progress. */
export function RankPromotion({ summary, labels, locale }: { summary: GamificationSummary; labels: Labels; locale: string }) {
  const currentIndex = RANKS.findIndex((rank) => rank.key === summary.rankKey);
  const next = currentIndex >= 0 ? RANKS[currentIndex + 1] : undefined;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const xp = (summary.baseXpMicro + summary.bonusXpMicro) / MICRO;
  const courses = summary.courseCreditsMicro / MICRO;

  return (
    <section className="flex flex-wrap items-center gap-4 border-b border-border/40 pb-6">
      <RankArtwork rank={summary.rankKey} size={112} />
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="font-heading text-body-base font-bold text-foreground">{labels.rank(summary.rankKey)}</h2>
        <p className="text-body-sm text-muted-foreground">{next ? `${labels.nextRank}: ${labels.rank(next.key)}` : labels.maximumRank}</p>
        {next && labels.requirement && <p className="text-body-xs text-muted-foreground">{labels.requirement}</p>}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border/30 pt-2.5 text-body-sm sm:grid-cols-3">
          <div><dt className="font-heading text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">{labels.xp}</dt><dd className="mt-0.5 font-semibold tabular-nums text-foreground">{number.format(xp)}{next ? ` / ${number.format(next.xp)}` : ""}</dd></div>
          <div><dt className="font-heading text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">{labels.courses}</dt><dd className="mt-0.5 font-semibold tabular-nums text-foreground">{number.format(courses)}{next ? ` / ${number.format(next.courses)}` : ""}</dd></div>
          <div><dt className="font-heading text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">{labels.balance ?? "LP"}</dt><dd className="mt-0.5 font-semibold tabular-nums text-foreground">{number.format(summary.lpBalance)} LP</dd></div>
        </dl>
      </div>
    </section>
  );
}
