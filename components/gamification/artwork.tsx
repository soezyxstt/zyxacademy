import Image from "next/image";
import type { BadgeFamily, RankKey } from "@/lib/gamification/contracts";

const tiers = ["bronze", "silver", "gold", "sapphire", "emerald"] as const;
const families: Record<BadgeFamily, string> = {
  warrior_reader: "warrior-reader",
  practice_knight: "practice-knight",
  memory_guardian: "memory-guardian",
  steady_scholar: "steady-scholar",
  comeback_champion: "comeback-champion",
  consistency_captain: "consistency-captain",
};

/** Decorative artwork: the adjacent text supplies the accessible name. */
export function RankArtwork({ rank, size = 120 }: { rank: RankKey; size?: number }) {
  return <Image src={`/gamification/rank--${rank}.svg`} alt="" width={size} height={size} className="h-auto max-w-full" />;
}

export function BadgeArtwork({ family, tier, size = 96 }: { family: BadgeFamily; tier: number; size?: number }) {
  const tierName = tiers[Math.max(0, Math.min(tiers.length - 1, Math.trunc(tier) - 1))];
  return <Image src={`/gamification/achievement--${families[family]}--${tierName}.svg`} alt="" width={size} height={size} className="h-auto max-w-full" />;
}
