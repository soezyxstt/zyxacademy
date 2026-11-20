import { describe, expect, test } from 'bun:test';
import { gamificationMissionWindows } from '../../lib/date-utils';
import { availableDailyMissions, missionKindForSource, weeklyMissionFeasible } from '../../lib/gamification/mission-policy';

describe('mission policy', () => {
 test('resets at Jakarta midnight and Monday', () => {
  const before = gamificationMissionWindows(new Date('2026-11-15T16:59:59Z'));
  const after = gamificationMissionWindows(new Date('2026-11-15T17:00:00Z'));
  expect(before.day.key).toBe('2026-11-15');
  expect(after.day.key).toBe('2026-11-16');
  expect(before.week.endsAt.toISOString()).toBe(after.week.startsAt.toISOString());
  expect(before.day.endsAt.toISOString()).toBe(after.day.startsAt.toISOString());
 });
 test('offers only feasible types within the daily cap', () => {
  expect(availableDailyMissions({ material: 0, recall: 0 })).toEqual([]);
  const missions = availableDailyMissions({ material: 1, recall: 1 });
  expect(missions).toEqual([{ kind: 'material', target: 1, rewardLp: 10 }, { kind: 'recall', target: 1, rewardLp: 10 }]);
  expect(missions.reduce((n, item) => n + item.rewardLp, 0)).toBeLessThanOrEqual(30);
  expect(missionKindForSource('article')).toBe(missionKindForSource('explanation'));
 });
 test('weekly feasibility requires distinct work and remaining days', () => {
  expect(weeklyMissionFeasible(0, 1, 7)).toBe(false);
  expect(weeklyMissionFeasible(0, 4, 3)).toBe(false);
  expect(weeklyMissionFeasible(3, 1, 1)).toBe(true);
  expect(weeklyMissionFeasible(4, 0, 0)).toBe(false);
 });
});
