import { sql } from "drizzle-orm";

/** Canonical roles override the legacy role. Staff memberships disqualify an account. */
export const eligibleStudent = (alias: ReturnType<typeof sql.raw>) => sql`(
  (exists (select 1 from pengguna p where p.id = ${alias}.id and p.status = 'active')
   and exists (select 1 from pengguna_peran pp join peran r on r.id = pp.peran_id where pp.pengguna_id = ${alias}.id and r.code = 'murid')
   and not exists (select 1 from pengguna_peran pp join peran r on r.id = pp.peran_id where pp.pengguna_id = ${alias}.id and r.code in ('admin','tutor')))
  or (not exists (select 1 from pengguna p where p.id = ${alias}.id) and not exists (select 1 from pengguna_peran pp where pp.pengguna_id = ${alias}.id) and ${alias}.role = 'student'))`;

export const noBlock = (viewer: string, target: ReturnType<typeof sql.raw>) =>
  sql`not exists (select 1 from gamification_blocks b where (b.blocker_id = ${viewer} and b.blocked_id = ${target}) or (b.blocked_id = ${viewer} and b.blocker_id = ${target}))`;
