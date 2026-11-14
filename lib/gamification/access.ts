import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { pengguna, penggunaPeran } from '@/db/schema';
import { getAuthSession } from '@/lib/auth-session';
import { getPeranCodes } from '@/lib/auth/authorization';
import { assertAdmin } from '@/lib/auth/admin-guards';

/** Resolve the current actor; never authorize an arbitrary client-supplied ID. */
export async function requireStudentGamificationAccess() {
 const session = await getAuthSession();
 const actor = session?.user;
 if (!actor?.id) throw new Error('Unauthorized');
 const [identity, memberships] = await Promise.all([
  db.select({ id: pengguna.id, status: pengguna.status }).from(pengguna).where(eq(pengguna.id, actor.id)).limit(1),
  db.select({ id: penggunaPeran.id }).from(penggunaPeran).where(eq(penggunaPeran.penggunaId, actor.id)).limit(1),
 ]);
 if (identity[0]?.status === 'suspended') throw new Error('Forbidden');
 const canonical = identity.length > 0 || memberships.length > 0;
 const allowed = canonical ? (await getPeranCodes(actor.id)).includes('murid') : actor.role === 'student';
 if (!allowed) throw new Error('Forbidden');
 return { session, user: actor };
}
export const requireAdminGamificationAccess = assertAdmin;
