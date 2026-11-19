/** Seed only missing catalog entries on the verified staging branch. */
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { COSMETIC_CATALOG } from '../../lib/gamification/catalog';
import { assertTarget } from '../neon/import-core';
import { assertCatalogSeedJournal } from './catalog-seed-journal';

const url = process.env.DATABASE_URL || '';
const host = process.env.NEON_EXPECTED_HOST || '';
assertTarget(url, host, 'neondb');
if (process.env.NEON_BRANCH_ID !== 'br-gentle-scene-azq0gp91' || process.env.NEON_EXPECTED_DATABASE !== 'neondb' || !['ep-sparkling-lab-azrp3ymj.c-3.ap-southeast-1.aws.neon.tech', 'ep-sparkling-lab-azrp3ymj-pooler.c-3.ap-southeast-1.aws.neon.tech'].includes(host)) throw new Error('STAGING_TARGET_REQUIRED');
const client = new Client({ connectionString: url });
try {
 await client.connect();
 const count = await drizzle(client).transaction(async tx => {
  const identity = await tx.execute<{ database: string }>(sql`select current_database() as database`);
  if (identity.rows[0]?.database !== 'neondb') throw new Error('DATABASE_IDENTITY_MISMATCH');
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('zyx:staging-gamification-migration', 0))`);
  await tx.execute(sql`lock table drizzle.__drizzle_migrations, public.gamification_cosmetics in access exclusive mode`);
  const journal = await tx.execute<{ created_at: string; hash: string }>(sql`select created_at, hash from drizzle.__drizzle_migrations order by created_at, id`);
  assertCatalogSeedJournal(journal.rows);
  const compact = await tx.execute<{ present: boolean }>(sql`select to_regclass('public.gamification_question_exposure_projection') is not null and to_regclass('public.gamification_question_exposure_observations') is not null and to_regclass('public.gamification_question_legacy_index') is not null and to_regclass('public.gamification_question_history_cutover') is not null as present`);
  if (!compact.rows[0]?.present) throw new Error('COMPACT_HISTORY_SCHEMA_MISSING');
  const current = await tx.execute<{id:string; name:string; slot:string; price_lp:string | number; active:boolean}>(sql`select id, name, slot, price_lp, active from public.gamification_cosmetics`);
  const expected = new Map<string, (typeof COSMETIC_CATALOG)[number]>(COSMETIC_CATALOG.map(item => [item.id, item]));
  for (const row of current.rows) {
   const item = expected.get(row.id);
   if (item && !item.active && item.slot === 'zyra_avatar' && row.active && item.name === row.name && item.slot === row.slot && item.priceLp === Number(row.price_lp)) {
    await tx.execute(sql`update public.gamification_cosmetics set active=false where id=${item.id}`);
    continue;
   }
   if (item && (item.name !== row.name || item.slot !== row.slot || item.priceLp !== Number(row.price_lp) || item.active !== row.active)) throw new Error('CATALOG_CONFLICT');
  }
  const existing = new Set(current.rows.map(row => row.id));
  let inserted = 0;
  for (const item of COSMETIC_CATALOG) if (!existing.has(item.id)) {
   await tx.execute(sql`insert into public.gamification_cosmetics (id, name, slot, price_lp, active) values (${item.id}, ${item.name}, ${item.slot}, ${item.priceLp}, ${item.active})`);
   inserted++;
  }
  return inserted;
 });
 console.log(`Staging gamification catalog: ${count} entries inserted, ${COSMETIC_CATALOG.length} verified`);
} catch (error) {
 console.error('Staging gamification catalog failed:', error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'DATABASE_OR_SEED_ERROR');
 process.exitCode = 1;
} finally {
 await client.end();
}
