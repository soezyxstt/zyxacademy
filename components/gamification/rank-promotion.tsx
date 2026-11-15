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
    <section className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
      <RankArtwork rank={summary.rankKey} size={112} />
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="font-heading text-body-base font-bold">{labels.rank(summary.rankKey)}</h2>
        <p className="text-body-sm">{next ? `${labels.nextRank}: ${labels.rank(next.key)}` : labels.maximumRank}</p>
        {next && labels.requirement && <p className="text-body-xs text-muted-foreground">{labels.requirement}</p>}
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
          <div><dt className="text-body-xs text-muted-foreground">{labels.xp}</dt><dd>{number.format(xp)}{next ? ` / ${number.format(next.xp)}` : ""}</dd></div>
          <div><dt className="text-body-xs text-muted-foreground">{labels.courses}</dt><dd>{number.format(courses)}{next ? ` / ${number.format(next.courses)}` : ""}</dd></div>
          <div><dt className="text-body-xs text-muted-foreground">{labels.balance ?? "LP"}</dt><dd>{number.format(summary.lpBalance)} LP</dd></div>
        </dl>
      </div>
    </section>
  );
}
