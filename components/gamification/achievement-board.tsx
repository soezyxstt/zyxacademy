import type { ReactNode } from "react";
import { Award, LockKeyhole } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { BadgeArtwork } from "./artwork";
import type { BadgeFamily } from "@/lib/gamification/contracts";
import { profileBadgeFamilies } from "@/lib/gamification/profile-badges";

export { profileBadgeFamilies } from "@/lib/gamification/profile-badges";

type AchievementBoardProps = {
  badges: { family: string; tier: number }[];
  title: string;
  familyLabels: Record<BadgeFamily, string>;
  lockedLabel: string;
  tierLabel: (tier: number) => string;
  action?: ReactNode;
  featuredBadgeIds?: string[];
  compact?: boolean;
  collectedOnly?: boolean;
  emptyTitle?: string;
};

export function AchievementBoard({ badges, title, familyLabels, lockedLabel, tierLabel, action, featuredBadgeIds = [], compact = false, collectedOnly = false, emptyTitle = "" }: AchievementBoardProps) {
  const families = [...profileBadgeFamilies].filter(family => !collectedOnly || badges.some(badge => badge.family === family && badge.tier > 0)).sort((a, b) => {
    const aIndex = featuredBadgeIds.indexOf(a);
    const bIndex = featuredBadgeIds.indexOf(b);
    return (aIndex < 0 ? profileBadgeFamilies.length : aIndex) - (bIndex < 0 ? profileBadgeFamilies.length : bIndex);
  });
  return <section className="@container/badges min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-heading text-body-base font-bold">{title}</h2>{action}</div>
    {families.length === 0 ? <AdminEmptyState icon={Award} title={emptyTitle} /> : <div className={`gap-px overflow-hidden rounded-xl border bg-border ${collectedOnly ? "flex flex-wrap" : compact ? "grid grid-cols-2 @sm/badges:grid-cols-3" : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"}`}>
      {families.map(family => {
        const tier = Math.max(0, ...badges.filter(badge => badge.family === family && Number.isInteger(badge.tier) && badge.tier <= 5).map(badge => badge.tier));
        return <div key={family} className={`flex min-w-0 flex-col items-center gap-1 bg-card p-3 text-center ${collectedOnly ? "flex-1 basis-[140px]" : ""}`}>
          {tier > 0 ? <BadgeArtwork family={family} tier={tier} size={compact ? 56 : 72} /> : <div className={`flex items-center justify-center ${compact ? "size-14 text-muted-foreground/60" : "size-[72px] rounded-lg bg-muted text-muted-foreground"}`}><LockKeyhole className="size-6" aria-hidden /></div>}
          <p className="text-body-xs font-semibold">{familyLabels[family]}</p>
          <p className="text-body-xs text-muted-foreground">{tier > 0 ? tierLabel(tier) : lockedLabel}</p>
        </div>;
      })}
    </div>}
  </section>;
}
