import type { RankKey } from "@/lib/gamification/contracts";

export interface StudentProfileMobileHubProps {
  locale?: string;
  pageTitle: string;
  editLabel: string;
  editHref: string;
  name: string;
  image?: string | null;
  frameId?: string | null;
  themeId?: string | null;
  title?: string | null;
  zyraAvatarId?: string | null;
  suitId?: string | null;
  actionId?: string | null;
  academicInfo?: string | null;
  rank?: RankKey;
  baseXpMicro?: number;
  bonusXpMicro?: number;
  lpBalance?: number;
  role?: string | null;
  roles?: string[];
}
