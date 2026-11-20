import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { rankForTotals } from './policy';

/** Read-only, single-student diagnostic. Caller must authorize access to this student. */
export async function reconcileGamificationAccount(userId: string) {
 if (!userId || userId.length > 256) throw new Error('INVALID_USER_ID');
 // One statement observes a consistent snapshot, even while awards are being processed.
 const result = await db.execute<{ base: string; bonus: string; lp: string; credits: string; projected_base: string; projected_bonus: string; projected_lp: string; projected_credits: string; rank_key: string | null }>(sql`
  select coalesce(a.base_xp_micro, 0) projected_base, coalesce(a.bonus_xp_micro, 0) projected_bonus,
   coalesce(a.lp_balance, 0) projected_lp, coalesce(a.course_credits_micro, 0) projected_credits, a.rank_key,
   (select coalesce(sum(base_xp_micro), 0) from gamification_xp_ledger where user_id = ${userId}) base,
   (select coalesce(sum(bonus_xp_micro), 0) from gamification_xp_ledger where user_id = ${userId}) bonus,
   (select coalesce(sum(amount), 0) from gamification_lp_ledger where user_id = ${userId}) lp,
   (select coalesce(sum(least(1000000, c.total_xp_micro / 10000)), 0) from gamification_course_starts s join gamification_checklists c on c.id = s.checklist_id where s.user_id = ${userId} and s.completed_at is not null) credits
  from (select 1) singleton left join gamification_accounts a on a.user_id = ${userId}`);
 const row = result.rows[0];
 const expected = { baseXpMicro: Number(row.base), bonusXpMicro: Number(row.bonus), lpBalance: Number(row.lp), courseCreditsMicro: Number(row.credits) };
 const projected = { baseXpMicro: Number(row.projected_base), bonusXpMicro: Number(row.projected_bonus), lpBalance: Number(row.projected_lp), courseCreditsMicro: Number(row.projected_credits) };
 const expectedRank = rankForTotals(expected.baseXpMicro + expected.bonusXpMicro, expected.courseCreditsMicro).key;
 return { expected, projected, expectedRank, projectedRank: row.rank_key ?? 'rakyat', matches: Object.keys(expected).every(key => expected[key as keyof typeof expected] === projected[key as keyof typeof projected]) && expectedRank === (row.rank_key ?? 'rakyat') };
}
