export type MissionSource = 'article' | 'explanation' | 'question' | 'flashcard';
export interface VerifiedMissionEvent {
 userId: string;
 eventId: string;
 activityId: string;
 source: MissionSource;
 occurredAt: Date;
 qualifiedDay: boolean;
 eligible: boolean;
}
/** Targets stay within the work verified as currently available. */
export function availableDailyMissions(available: { material: number; recall: number; question?: number }) {
 return (['material', 'recall', 'question'] as const).flatMap(kind => (available[kind] ?? 0) > 0 ? [{ kind, target: 1, rewardLp: 10 }] : []);
}

/** Each remaining day needs a distinct qualifying activity. */
export function weeklyMissionFeasible(qualifiedDays: number, availableActivities: number, remainingDays: number) {
 const needed = Math.max(0, 4 - qualifiedDays);
 return needed > 0 && needed <= remainingDays && needed <= availableActivities;
}
export function missionKindForSource(source: MissionSource): string {
 return source === 'article' || source === 'explanation' ? 'material' : source === 'question' ? 'question' : 'recall';
}
