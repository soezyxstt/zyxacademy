import type { GamificationMission } from "@/lib/gamification/contracts";

type Labels = {
  mission: (kind: string) => string;
  reward: (lp: number) => string;
  ends: string;
  complete: string;
};

export function MissionList({ missions, labels, locale }: { missions: GamificationMission[]; labels: Labels; locale: string }) {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {missions.map((mission) => (
        <li key={mission.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div className="space-y-1">
            <p className="text-body-sm font-semibold">{labels.mission(mission.kind)}</p>
            <p className="text-body-xs text-muted-foreground">{labels.ends}: {date.format(new Date(mission.endsAt))} WIB</p>
          </div>
          <div className="text-body-sm">
            {mission.completedAt ? labels.complete : `${mission.progress} / ${mission.target}`} · {labels.reward(mission.rewardLp)}
          </div>
        </li>
      ))}
    </ul>
  );
}
