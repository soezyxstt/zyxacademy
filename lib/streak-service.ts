import { db } from "@/db";
import { studentStreaks, learningEvents } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { todayUtc, formatIsoDateUtc, getCalendarWeekRange, addCalendarDays } from "@/lib/date-utils";

async function hasActivityOn(studentId: string, dateStr: string): Promise<boolean> {
 const [row] = await db
 .select({ count: sql<number>`count(*)` })
 .from(learningEvents)
 .where(
 sql`${learningEvents.studentId} = ${studentId} AND ${learningEvents.createdAt} >= (${dateStr}::date AT TIME ZONE 'UTC') AND ${learningEvents.createdAt} < (${addCalendarDays(dateStr, 1)}::date AT TIME ZONE 'UTC')`
 );
 return (row?.count ?? 0) > 0;
}

export async function getOrUpdateStreak(
 studentId: string
): Promise<{ current: number; longest: number }> {
 const today = todayUtc();
 const streak = { current: studentStreaks.currentStreak, longest: studentStreaks.longestStreak };
 const [row] = await db
 .select({ ...streak, lastActiveDate: studentStreaks.lastActiveDate })
 .from(studentStreaks)
 .where(eq(studentStreaks.studentId, studentId))
 .limit(1);

 if (row && row.lastActiveDate >= today) {
 return { current: row.current, longest: row.longest };
 }

 const active = await hasActivityOn(studentId, today);
 if (row && !active) {
 return { current: row.current, longest: row.longest };
 }

 const current = active ? 1 : 0;
 const yesterday = addCalendarDays(today, -1);
 // A competing request may have created or updated this streak after the
 // read above. Re-evaluate the day and counts against the row PostgreSQL locks.
 const advances = sql`excluded.current_streak > 0 and ${studentStreaks.lastActiveDate} < excluded.last_active_date`;
 const nextCurrent = sql`case when ${studentStreaks.lastActiveDate} = ${yesterday} then ${studentStreaks.currentStreak} + 1 else 1 end`;
 const [saved] = await db
 .insert(studentStreaks)
 .values({ studentId, currentStreak: current, longestStreak: current, lastActiveDate: today })
 .onConflictDoUpdate({
 target: studentStreaks.studentId,
 set: {
 currentStreak: sql`case when ${advances} then ${nextCurrent} else ${studentStreaks.currentStreak} end`,
 longestStreak: sql`case when ${advances} then greatest(${studentStreaks.longestStreak}, ${nextCurrent}) else ${studentStreaks.longestStreak} end`,
 lastActiveDate: sql`case when ${advances} then excluded.last_active_date else ${studentStreaks.lastActiveDate} end`,
 },
 })
 .returning(streak);

 return saved;
}

/**
 * Returns a 7-element boolean array mapping Monday to Sunday activity of the current week.
 */
export async function getWeeklyActivity(studentId: string): Promise<boolean[]> {
 // Use the same UTC calendar as the previous per-day queries.
 const { startIso } = getCalendarWeekRange(formatIsoDateUtc(new Date()));
 const endExclusive = addCalendarDays(startIso, 7);
 const rows = await db
 .selectDistinct({ date: sql<string>`to_char(${learningEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')` })
 .from(learningEvents)
 .where(sql`${learningEvents.studentId} = ${studentId} AND ${learningEvents.createdAt} >= (${startIso}::date AT TIME ZONE 'UTC') AND ${learningEvents.createdAt} < (${endExclusive}::date AT TIME ZONE 'UTC')`);
 const activeDates = new Set(rows.map((row) => row.date));
 return Array.from({ length: 7 }, (_, index) => activeDates.has(addCalendarDays(startIso, index)));
}
