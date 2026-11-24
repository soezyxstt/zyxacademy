import type { GamificationMission } from "@/lib/gamification/contracts";

type Labels = {
  mission: (kind: string) => string;
  category?: (kind: string) => string;
  reward: (lp: number) => string;
  ends: string;
  complete: string;
  progress?: string;
};

export function MissionList({ missions, labels, locale }: { missions: GamificationMission[]; labels: Labels; locale: string }) {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
  const number = new Intl.NumberFormat(locale);
  const groups = new Map<string, GamificationMission[]>();
  for (const mission of missions) groups.set(mission.kind, [...(groups.get(mission.kind) ?? []), mission]);
  return <div className="space-y-5">
    {[...groups.entries()].map(([kind, items]) => <section key={kind} className="space-y-2">
      <h2 className="font-heading text-body-base font-bold">{labels.category?.(kind) ?? labels.mission(kind)}</h2>
      <ul className="divide-y divide-border/25">
        {items.map(mission => {
          const progress = mission.target > 0 ? Math.min(100, Math.max(0, (mission.progress / mission.target) * 100)) : 0;
          return <li key={mission.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="text-body-sm font-semibold">{labels.mission(mission.kind)}</p><p className="text-body-xs text-muted-foreground">{labels.ends}: {date.format(new Date(mission.endsAt))} WIB</p></div>
              <p className="text-body-sm">{mission.completedAt && <span>{labels.complete} · </span>}{labels.reward(mission.rewardLp)}</p>
            </div>
            <div className="flex justify-between gap-3 text-body-xs"><span>{labels.progress ?? labels.mission(mission.kind)}</span><span>{number.format(mission.progress)} / {number.format(mission.target)}</span></div>
            <div role="progressbar" aria-label={`${labels.mission(mission.kind)}: ${labels.progress ?? ""}`} aria-valuemin={0} aria-valuemax={mission.target} aria-valuenow={Math.min(mission.progress, mission.target)} className="h-2 overflow-hidden rounded-md bg-muted"><div className="h-full rounded-md bg-primary" style={{ width: `${progress}%` }} /></div>
          </li>;
        })}
      </ul>
    </section>)}
  </div>;
}
