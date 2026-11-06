import { db } from "@/db";
import { studentStreaks, learningEvents } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { todayUtc, yesterdayUtc, formatIsoDateUtc, getCalendarWeekRange, addCalendarDays } from "@/lib/date-utils";

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

 const [row] = await db
 .select()
 .from(studentStreaks)
 .where(eq(studentStreaks.studentId, studentId))
 .limit(1);

 if (!row) {
 const active = await hasActivityOn(studentId, today);
 const current = active ? 1 : 0;
 await db.insert(studentStreaks).values({
 studentId,
 currentStreak: current,
 longestStreak: current,
 lastActiveDate: today,
 });
 return { current, longest: current };
 }

 // Same day ; no-op
 if (row.lastActiveDate === today) {
 return { current: row.currentStreak, longest: row.longestStreak };
 }

 const active = await hasActivityOn(studentId, today);
 if (!active) {
 // No activity yet today ; just report current state
 return { current: row.currentStreak, longest: row.longestStreak };
 }

 const yesterday = yesterdayUtc();
 let newCurrent: number;
 if (row.lastActiveDate === yesterday) {
 newCurrent = row.currentStreak + 1;
 } else {
 // Gap ; reset
 newCurrent = 1;
 }
 const newLongest = Math.max(row.longestStreak, newCurrent);

 await db
 .update(studentStreaks)
 .set({ currentStreak: newCurrent, longestStreak: newLongest, lastActiveDate: today })
 .where(eq(studentStreaks.studentId, studentId));

 return { current: newCurrent, longest: newLongest };
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
