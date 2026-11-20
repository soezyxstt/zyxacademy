import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { pengguna, penggunaPeran } from '@/db/schema';
import { getAuthSession } from '@/lib/auth-session';
import { getPeranCodes } from '@/lib/auth/authorization';
import { assertAdmin } from '@/lib/auth/admin-guards';

/** Resolve the current actor; never authorize an arbitrary client-supplied ID. */
export async function getStudentGamificationAccess() {
 const session = await getAuthSession();
 const actor = session?.user;
 if (!actor?.id) return null;
 const [identity, memberships] = await Promise.all([
  db.select({ id: pengguna.id, status: pengguna.status }).from(pengguna).where(eq(pengguna.id, actor.id)).limit(1),
  db.select({ id: penggunaPeran.id }).from(penggunaPeran).where(eq(penggunaPeran.penggunaId, actor.id)).limit(1),
 ]);
 if (identity[0]?.status === 'suspended') return null;
 const canonical = identity.length > 0 || memberships.length > 0;
 const roles = canonical ? await getPeranCodes(actor.id) : [];
 const allowed = canonical
  ? identity[0]?.status === 'active' && roles.includes('murid') && !roles.some(role => role === 'admin' || role === 'tutor')
  : actor.role === 'student';
 if (!allowed) return null;
 return { session, user: actor };
}
/** Actions and private APIs still reject callers without student access. */
export async function requireStudentGamificationAccess() {
 const access = await getStudentGamificationAccess();
 if (!access) throw new Error((await getAuthSession())?.user?.id ? 'Forbidden' : 'Unauthorized');
 return access;
}
export const requireAdminGamificationAccess = assertAdmin;
