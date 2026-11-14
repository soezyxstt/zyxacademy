import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { BadgeArtwork } from "./artwork";
import type { BadgeFamily } from "@/lib/gamification/contracts";

export const profileBadgeFamilies: BadgeFamily[] = ["warrior_reader", "practice_knight", "memory_guardian", "steady_scholar", "comeback_champion", "consistency_captain"];

type AchievementBoardProps = {
  badges: { family: string; tier: number }[];
  title: string;
  familyLabels: Record<BadgeFamily, string>;
  lockedLabel: string;
  tierLabel: (tier: number) => string;
  action?: ReactNode;
  featuredBadgeIds?: string[];
};

export function AchievementBoard({ badges, title, familyLabels, lockedLabel, tierLabel, action, featuredBadgeIds = [] }: AchievementBoardProps) {
  const families = [...profileBadgeFamilies].sort((a, b) => {
    const aIndex = featuredBadgeIds.indexOf(a);
    const bIndex = featuredBadgeIds.indexOf(b);
    return (aIndex < 0 ? profileBadgeFamilies.length : aIndex) - (bIndex < 0 ? profileBadgeFamilies.length : bIndex);
  });
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-heading text-body-base font-bold">{title}</h2>{action}</div>
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-6">
      {families.map(family => {
        const tier = Math.max(0, ...badges.filter(badge => badge.family === family && Number.isInteger(badge.tier) && badge.tier <= 5).map(badge => badge.tier));
        return <div key={family} className="flex min-w-0 flex-col items-center gap-1 bg-card p-3 text-center">
          {tier > 0 ? <BadgeArtwork family={family} tier={tier} size={72} /> : <div className="flex size-[72px] items-center justify-center rounded-lg bg-muted text-muted-foreground"><LockKeyhole className="size-6" aria-hidden /></div>}
          <p className="text-body-xs font-semibold">{familyLabels[family]}</p>
          <p className="text-body-xs text-muted-foreground">{tier > 0 ? tierLabel(tier) : lockedLabel}</p>
        </div>;
      })}
    </div>
  </section>;
}
