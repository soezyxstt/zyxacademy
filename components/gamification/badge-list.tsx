import { FormattedDate } from "@/components/ui/formatted-date";
import { BADGE_LP, BADGE_THRESHOLDS } from "@/lib/gamification/catalog";
import type { AchievementBadge, BadgeFamily } from "@/lib/gamification/contracts";
import { BadgeArtwork } from "./artwork";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const romanTiers = ["I", "II", "III", "IV", "V"];

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
    <div className="divide-y divide-border/25">
      {badges.map((badge) => {
        const thresholds = BADGE_THRESHOLDS[badge.family];
        const target = badge.nextThreshold ?? thresholds[thresholds.length - 1];
        const progress = Math.min(100, Math.max(0, (badge.count / target) * 100));
        return <section key={badge.family} className="flex items-center gap-4 p-4">
          <BadgeArtwork family={badge.family} tier={Math.max(1, badge.tier)} size={72} />
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="font-heading text-body-base font-bold">{labels.family(badge.family)}{badge.tier > 0 ? ` ${romanTiers[badge.tier - 1]}` : ""}</h2>
            <p className="text-body-xs text-muted-foreground">{badge.tier === 0 ? `${labels.locked} · ` : ""}{labels.progress}: {number.format(badge.count)} / {number.format(target)}{badge.nextThreshold === null ? ` · ${labels.complete}` : ""}</p>
            <Dialog>
              <DialogTrigger asChild><Button variant="outline" size="sm">{labels.family(badge.family)}</Button></DialogTrigger>
              <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
                <DialogHeader><DialogTitle>{labels.family(badge.family)}</DialogTitle></DialogHeader>
                <ol tabIndex={0} aria-label={labels.family(badge.family)} className="flex gap-3 overflow-x-auto pb-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  {thresholds.map((threshold, index) => {
                    const award = badge.earnedTiers?.find(item => item.tier === index + 1);
                    return <li key={threshold} className="w-28 shrink-0 space-y-1 text-center text-body-xs">
                      <div className="flex justify-center"><BadgeArtwork family={badge.family} tier={index + 1} size={72} /></div>
                      <p className="font-semibold">{labels.family(badge.family)} {romanTiers[index]}</p>
                      <p>{number.format(threshold)} · {labels.reward(BADGE_LP[index])}</p>
                      <p className="text-muted-foreground">{index + 1 > badge.tier ? labels.locked : labels.earned}</p>
                      {index + 1 <= badge.tier && award && <p className="text-muted-foreground"><FormattedDate date={award.awardedAt} locale={locale} options={{ dateStyle: "medium" }} /></p>}
                    </li>;
                  })}
                </ol>
                <div className="space-y-2">
                  <div className="flex justify-between gap-3 text-body-sm"><span>{labels.progress}</span><span>{number.format(badge.count)} / {number.format(target)}</span></div>
                  <div role="progressbar" aria-label={labels.progress} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(badge.count, target)} className="h-2 overflow-hidden rounded-md bg-muted"><div className="h-full rounded-md bg-primary" style={{ width: `${progress}%` }} /></div>
                  {badge.nextThreshold === null && <p className="text-body-xs text-muted-foreground">{labels.complete}</p>}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </section>;
      })}
    </div>
  );
}
