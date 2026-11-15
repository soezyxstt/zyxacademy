import type { ReactNode } from "react";
import { StudentAvatar } from "./student-avatar";
import { RankArtwork } from "./artwork";
import type { RankKey } from "@/lib/gamification/contracts";

type ProfileHeroProps = {
  name: string;
  image?: string | null;
  frameId?: string | null;
  themeId?: string | null;
  title?: string | null;
  academicInfo?: string | null;
  rank?: RankKey;
  actions?: ReactNode;
  details?: ReactNode;
};

export function ProfileHero({ name, image, frameId, themeId, title, academicInfo, rank, actions, details }: ProfileHeroProps) {
  return <section className="rounded-xl border bg-card p-5">
    <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
      <StudentAvatar name={name} image={image} frameId={frameId} themeId={themeId} size={112} animated />
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="break-words font-heading text-h5 font-bold">{name}</h2>
        {title && <p className="text-body-sm text-muted-foreground">{title}</p>}
        {academicInfo && <p className="text-body-sm text-muted-foreground">{academicInfo}</p>}
        {details && <div className="pt-1 text-body-xs text-muted-foreground [&_p]:text-body-xs">{details}</div>}
        {actions && <div className="flex flex-wrap justify-center gap-2 pt-2 sm:justify-start">{actions}</div>}
      </div>
      {rank && <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:gap-0">
        <RankArtwork rank={rank} size={64} />
        <span className="text-body-sm font-semibold capitalize">{rank}</span>
      </div>}
    </div>
  </section>;
}
