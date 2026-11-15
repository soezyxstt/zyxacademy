import { MICRO, RANKS } from "@/lib/gamification/catalog";
import type { GamificationSummary, RankKey } from "@/lib/gamification/contracts";
import { RankArtwork } from "./artwork";

type Labels = {
  rank: (rank: RankKey) => string;
  nextRank: string;
  maximumRank: string;
  xp: string;
  courses: string;
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
        <p className="text-body-xs text-muted-foreground">{locale === "en" ? "Rank: Rakyat, Kades, Camat, Bupati, Gubernur, Presiden. Promotion requires both XP and course credits. Achievement shields have separate tiers I to V." : "Pangkat: Rakyat, Kades, Camat, Bupati, Gubernur, Presiden. Kenaikan memerlukan XP dan kredit mata kuliah. Perisai pencapaian memiliki tingkat I sampai V yang terpisah."}</p>
        <h2 className="font-heading text-body-base font-bold">{labels.rank(summary.rankKey)}</h2>
        {next ? (
          <>
            <p className="text-body-sm">{labels.nextRank}: {labels.rank(next.key)}</p>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-body-xs text-muted-foreground">
              <div><dt className="inline">{labels.xp}: </dt><dd className="inline">{number.format(xp)} / {number.format(next.xp)}</dd></div>
              <div><dt className="inline">{labels.courses}: </dt><dd className="inline">{number.format(courses)} / {number.format(next.courses)}</dd></div>
            </dl>
          </>
        ) : <p className="text-body-sm text-muted-foreground">{labels.maximumRank}</p>}
      </div>
    </section>
  );
}
