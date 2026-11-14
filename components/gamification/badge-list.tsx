import { FormattedDate } from "@/components/ui/formatted-date";
import { BADGE_LP, BADGE_THRESHOLDS } from "@/lib/gamification/catalog";
import type { AchievementBadge, BadgeFamily } from "@/lib/gamification/contracts";
import { BadgeArtwork } from "./artwork";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Labels = {
  family: (family: BadgeFamily) => string;
  tier: (tier: number) => string;
  progress: string;
  complete: string;
  reward: (lp: number) => string;
  locked: string;
  earned: string;
};

export function BadgeList({ badges, labels, locale }: { badges: AchievementBadge[]; labels: Labels; locale: string }) {
  const number = new Intl.NumberFormat(locale);
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {badges.map((badge) => (
        <section key={badge.family} className="flex flex-wrap items-start gap-4 p-4">
          <BadgeArtwork family={badge.family} tier={Math.max(1, badge.tier)} size={80} />
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="font-heading text-body-base font-bold">{labels.family(badge.family)}</h2>
            <p className="text-body-sm">{badge.nextThreshold === null ? labels.complete : `${labels.progress}: ${number.format(badge.count)} / ${number.format(badge.nextThreshold)}`}</p>
            <Dialog>
              <DialogTrigger asChild><Button variant="outline" size="sm">{labels.family(badge.family)}</Button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>{labels.family(badge.family)}</DialogTitle></DialogHeader>
                <p className="text-body-sm">{labels.progress}: {number.format(badge.count)}</p>
            <ol className="space-y-2 text-body-sm">
              {BADGE_THRESHOLDS[badge.family].map((threshold, index) => (
                <li key={threshold}>
                  {labels.tier(index + 1)}: {number.format(threshold)} ({labels.reward(BADGE_LP[index])}) · {index + 1 > badge.tier ? labels.locked : labels.earned}
                  {index + 1 <= badge.tier && badge.earnedTiers?.find(award => award.tier === index + 1) && <>: <FormattedDate date={badge.earnedTiers.find(award => award.tier === index + 1)!.awardedAt} locale={locale} options={{ dateStyle: "medium" }} /></>}
                </li>
              ))}
            </ol></DialogContent></Dialog>
          </div>
        </section>
      ))}
    </div>
  );
}
