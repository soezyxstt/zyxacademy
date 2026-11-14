/** Staging-only bridge for the two independently applied upstream migrations.
 * All preparation, unmodified generated SQL, journal inserts and checks share one transaction.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { assertTarget } from '../neon/import-core';
import { classifyJournal, EXPECTED_JOURNAL, PENDING } from './gamification-migration-core';

const url = process.env.DATABASE_URL || '';
const expectedHost = process.env.NEON_EXPECTED_HOST || '';
assertTarget(url, expectedHost, 'neondb');
if (process.env.NEON_BRANCH_ID !== 'br-gentle-scene-azq0gp91' || process.env.NEON_EXPECTED_DATABASE !== 'neondb' || !['ep-sparkling-lab-azrp3ymj.c-3.ap-southeast-1.aws.neon.tech', 'ep-sparkling-lab-azrp3ymj-pooler.c-3.ap-southeast-1.aws.neon.tech'].includes(expectedHost)) throw new Error('STAGING_TARGET_REQUIRED');

// Pin both the file bytes and timestamps. 0000 and 0002 are known historical
// differences, not permission to rewrite or relabel their existing journal rows.
const migrations = readMigrationFiles({ migrationsFolder: 'drizzle-postgres' });
if (migrations.length !== 18) throw new Error('UNEXPECTED_LOCAL_MIGRATION_CHAIN');
for (let i = 0; i < migrations.length; i++) {
 const expected = i < 9 ? EXPECTED_JOURNAL[i] : i < 16 ? EXPECTED_JOURNAL[i + 2] : PENDING[i - 16];
 const localHash = i === 0 ? '5fbe4a906e5859c37e54c450ad7ad8b41c3da1831e675c56d8b624a99975ca11' : i === 2 ? '7a9da240d42361c5df25a2c02b05787ae7915d9c0a240566931b719a244214e0' : expected[1];
 if (migrations[i].folderMillis !== expected[0] || migrations[i].hash !== localHash) throw new Error('UNEXPECTED_LOCAL_MIGRATION_CHAIN');
}

const client = new Client({ connectionString: url });
try {
 await client.connect();
 const db = drizzle(client);
 const result = await db.transaction(async tx => {
  const identity = await tx.execute<{ database: string }>(sql`select current_database() as database`);
  if (identity.rows[0]?.database !== 'neondb') throw new Error('DATABASE_IDENTITY_MISMATCH');
  await tx.execute(sql`set local search_path = public, pg_catalog`);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('zyx:staging-gamification-migration', 0))`);
  // Block concurrent writers and other migrators during the temporary old-index state.
  await tx.execute(sql`lock table drizzle.__drizzle_migrations, public.gamification_profiles, public.review_item_bundle, public.ketergantungan_produk in access exclusive mode`);
  const journal = await tx.execute<{ created_at: string; hash: string }>(sql`select created_at, hash from drizzle.__drizzle_migrations order by created_at, id`);
  const state = classifyJournal(journal.rows);
  const indexes = await tx.execute<{ name: string; definition: string; valid: boolean }>(sql`
   select c.relname as name, pg_get_indexdef(i.indexrelid) as definition, (i.indisvalid and i.indisready) as valid
   from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname in ('review_item_bundle_target_idx','review_item_bundle_target_scoped_unique','ketergantungan_produk_edge_idx') order by c.relname`);
  const constraint = await tx.execute<{ definition: string; validated: boolean; deferrable: boolean }>(sql`
   select pg_get_constraintdef(c.oid) as definition, c.convalidated as validated, c.condeferrable as deferrable
   from pg_constraint c where c.conrelid='public.review_item_bundle'::regclass and c.conname='review_item_bundle_target_scoped_unique' and c.conindid=to_regclass('public.review_item_bundle_target_scoped_unique')`);
  const columns = await tx.execute<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(sql`
   select column_name, data_type, is_nullable, column_default from information_schema.columns
   where table_schema='public' and table_name='gamification_profiles' and column_name in ('equipped_zyra_skin_id','equipped_zyra_avatar_id') order by column_name`);
  const dependencyDef = 'CREATE UNIQUE INDEX ketergantungan_produk_edge_idx ON public.ketergantungan_produk USING btree (upstream_entity_type, upstream_entity_id, upstream_version, downstream_entity_type, downstream_entity_id, downstream_version)';
  const reviewDef = 'CREATE UNIQUE INDEX review_item_bundle_target_scoped_unique ON public.review_item_bundle USING btree (impor_bundle_id, reviewer_id, target_type, target_id, product_id) NULLS NOT DISTINCT';
  if (indexes.rows.length !== 2 || !indexes.rows.every(row => row.valid) || indexes.rows.find(row => row.name === 'ketergantungan_produk_edge_idx')?.definition !== dependencyDef || indexes.rows.find(row => row.name === 'review_item_bundle_target_scoped_unique')?.definition !== reviewDef || constraint.rows.length !== 1 || constraint.rows[0].definition !== 'UNIQUE NULLS NOT DISTINCT (impor_bundle_id, reviewer_id, target_type, target_id, product_id)' || !constraint.rows[0].validated || constraint.rows[0].deferrable) throw new Error('UNEXPECTED_INDEX_STATE');
  const completeColumns = columns.rows.length === 2 && columns.rows.every(row => row.data_type === 'text' && row.is_nullable === 'YES' && row.column_default === null);
  if (state === 'complete') {
   if (!completeColumns) throw new Error('UNEXPECTED_APPEARANCE_COLUMNS');
   return 'already complete';
  }
  if (columns.rows.length !== 0) throw new Error('UNEXPECTED_APPEARANCE_COLUMNS');
  const duplicates = await tx.execute<{ review_duplicates: string; dependency_duplicates: string }>(sql`
   select (select count(*) from (select 1 from public.review_item_bundle where impor_bundle_id is not null and reviewer_id is not null and target_type is not null and target_id is not null group by impor_bundle_id, reviewer_id, target_type, target_id having count(*) > 1) d) as review_duplicates,
   (select count(*) from (select 1 from public.ketergantungan_produk where upstream_entity_type is not null and upstream_entity_id is not null and downstream_entity_type is not null and downstream_entity_id is not null group by upstream_entity_type, upstream_entity_id, downstream_entity_type, downstream_entity_id having count(*) > 1) d) as dependency_duplicates`);
  if (Number(duplicates.rows[0]?.review_duplicates) !== 0 || Number(duplicates.rows[0]?.dependency_duplicates) !== 0) throw new Error('OLD_INDEX_DATA_INCOMPATIBLE');
  await tx.execute(sql`alter table public.review_item_bundle drop constraint review_item_bundle_target_scoped_unique`);
  await tx.execute(sql`create unique index review_item_bundle_target_idx on public.review_item_bundle using btree (impor_bundle_id, reviewer_id, target_type, target_id)`);
  await tx.execute(sql`drop index public.ketergantungan_produk_edge_idx`);
  await tx.execute(sql`create unique index ketergantungan_produk_edge_idx on public.ketergantungan_produk using btree (upstream_entity_type, upstream_entity_id, downstream_entity_type, downstream_entity_id)`);
  for (const migration of migrations.slice(16)) {
   for (const statement of migration.sql) await tx.execute(sql.raw(statement));
   await tx.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${migration.hash}, ${migration.folderMillis})`);
  }
  // The generated migration must restore the exact upstream definitions, not merely succeed.
  const final = await tx.execute<{ review: string; review_index: string; dependency: string; old_index: string | null; column_count: number }>(sql`
   select pg_get_constraintdef(c.oid) as review, pg_get_indexdef('public.ketergantungan_produk_edge_idx'::regclass) as dependency,
    pg_get_indexdef(c.conindid) as review_index,
    to_regclass('public.review_item_bundle_target_idx')::text as old_index,
    (select count(*)::integer from information_schema.columns where table_schema='public' and table_name='gamification_profiles' and column_name in ('equipped_zyra_skin_id','equipped_zyra_avatar_id') and data_type='text' and is_nullable='YES' and column_default is null) as column_count
   from pg_constraint c where c.conrelid='public.review_item_bundle'::regclass and c.conname='review_item_bundle_target_scoped_unique' and c.convalidated and not c.condeferrable`);
  if (final.rows.length !== 1 || final.rows[0].review !== constraint.rows[0].definition || final.rows[0].review_index !== reviewDef || final.rows[0].dependency !== dependencyDef || final.rows[0].old_index !== null || final.rows[0].column_count !== 2) throw new Error('FINAL_SCHEMA_MISMATCH');
  return 'applied 0016 and 0017';
 });
 console.log(`Staging gamification migration: ${result}`);
} catch (error) {
 // No connection details or query values are printed.
 console.error('Staging gamification migration failed:', error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'DATABASE_OR_MIGRATION_ERROR');
 process.exitCode = 1;
} finally {
 await client.end();
}
