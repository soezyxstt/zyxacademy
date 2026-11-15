import { asc, gt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { gamificationCourseStarts } from '@/db/schema';
import { ensureGamificationMissions } from '@/lib/gamification/missions';
import { inngest } from './client';

const PAGE_SIZE = 50;
export const gamificationMissionsCron = inngest.createFunction(
 { id: 'gamification-missions-cron', triggers: [{ cron: '5 17 * * *' }], retries: 3 },
 async ({ step }) => {
  await step.sendEvent('start-mission-pages', { name: 'gamification/missions.page', data: { cursor: '', occurredAt: new Date().toISOString() } });
 },
);
export const gamificationMissionsPage = inngest.createFunction(
 { id: 'gamification-missions-page', triggers: [{ event: 'gamification/missions.page' }], retries: 3, concurrency: { limit: 1 } },
 async ({ event, step }) => {
  const { cursor, occurredAt } = event.data as { cursor: string; occurredAt: string };
  const instant = new Date(occurredAt);
  if (typeof cursor !== 'string' || !Number.isFinite(instant.getTime())) throw new Error('INVALID_MISSION_PAGE');
  const ids = await step.run('materialize-page', async () => {
   const rows = await db.selectDistinct({ userId: gamificationCourseStarts.userId }).from(gamificationCourseStarts).where(gt(gamificationCourseStarts.userId, cursor)).orderBy(asc(gamificationCourseStarts.userId)).limit(PAGE_SIZE);
   for (const { userId } of rows) await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
    await ensureGamificationMissions(tx, userId, instant);
   });
   return rows.map(row => row.userId);
  });
  if (ids.length === PAGE_SIZE) await step.sendEvent('next-mission-page', { name: 'gamification/missions.page', data: { cursor: ids[ids.length - 1], occurredAt } });
  return { processed: ids.length };
 },
);
