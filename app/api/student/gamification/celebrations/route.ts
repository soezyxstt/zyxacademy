import { NextResponse } from 'next/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { requireStudentGamificationAccess } from '@/lib/gamification/access';
import { eligibleStudent } from '@/lib/gamification/social';
import { parseCelebration, parseCelebrationAck } from '@/lib/gamification/celebration-contracts';

const headers = { 'Cache-Control': 'private, no-store' };
const namespace = sql`${notifications.metadata}->>'namespace' = 'gamification'`;
async function actor() {
 const { user } = await requireStudentGamificationAccess();
 const result = await db.execute(sql`select 1 from "user" u where u.id = ${user.id} and ${eligibleStudent(sql.raw('u'))}`);
 if (!result.rows.length) throw new Error('Forbidden');
 return user.id;
}
function failure(error: unknown) {
 const message = error instanceof Error ? error.message : '';
 const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
 return NextResponse.json({ error: status === 401 ? 'Silakan masuk' : status === 403 ? 'Akses ditolak' : 'Terjadi kesalahan. Coba lagi' }, { status, headers });
}
export async function GET() {
 try {
  const userId = await actor();
  const rows = await db.select({ id: notifications.id, metadata: notifications.metadata }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.read, false), eq(notifications.type, 'announcement'), namespace)).orderBy(asc(notifications.createdAt), asc(notifications.id)).limit(10);
  return NextResponse.json({ celebrations: rows.flatMap(row => { const value = parseCelebration(row.id, row.metadata); return value ? [value] : []; }) }, { headers });
 } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
 try {
  const userId = await actor();
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Data tidak valid' }, { status: 400, headers }); }
  const ids = parseCelebrationAck(body);
  if (!ids) return NextResponse.json({ error: 'Data tidak valid' }, { status: 400, headers });
  await db.update(notifications).set({ read: true }).where(and(eq(notifications.userId, userId), eq(notifications.type, 'announcement'), eq(notifications.read, false), namespace, inArray(notifications.id, ids)));
  return NextResponse.json({ success: true }, { headers });
 } catch (error) { return failure(error); }
}
