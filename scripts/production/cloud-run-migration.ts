/**
 * bun scripts/production/cloud-run-migration.ts --check|--rehearse|--apply --source-metadata <json>
 * Requires DATABASE_URL (verify-full), NEON_EXPECTED_HOST, NEON_BRANCH_ID, NEON_EXPECTED_DATABASE.
 * Apply also requires PRODUCTION_MIGRATION_WRITERS_FENCED=1. Rehearse requires
 * PRODUCTION_MIGRATION_DISPOSABLE=1 and explicit disposable host/branch pins.
 * Independently inventory Neon, then pass non-secret JSON with sourceHost, sourceBranchId,
 * sourceDatabase, targetHost, targetBranchId, targetDatabase, disposable. A rehearsal also
 * requires parentBranchId matching production. This attestation is not a live API verification.
 * Backups, writer fencing, clone creation, and application-role verification belong to the operator.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COSMETIC_CATALOG } from '../../lib/gamification/catalog';
import { LEGACY_INDEX_BACKFILL_SQL, PROJECTION_BACKFILL_SQL } from '../staging/question-history-backfill-core';
import { assertDefinitions, assertEnvironment, assertFiles, classifyJournal, FILES, parseArguments, planCatalog, type CosmeticRow, type Mode } from './cloud-run-migration-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export type Migration = { when: number; tag: string; hash: string; sql: string };
export interface SqlClient {
 query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export function loadMigrations(): Migration[] {
 const blob = (path: string) => {
  const committed = execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const working = readFileSync(join(root, path));
  if (!working.equals(committed) && !working.equals(Buffer.from(committed.toString('utf8').replace(/\r?\n/g, '\r\n')))) throw new Error('UNCOMMITTED_MIGRATION_CHANGE');
  return committed;
 };
 const journal = JSON.parse(blob('drizzle-postgres/meta/_journal.json').toString('utf8'));
 if (journal.version !== '7' || journal.dialect !== 'postgresql' || !Array.isArray(journal.entries)) throw new Error('UNEXPECTED_LOCAL_MIGRATION_CHAIN');
 const migrations = FILES.map(([when, tag]) => {
  const bytes = blob(`drizzle-postgres/${tag}.sql`);
  return { when, tag, hash: sha256(bytes), sql: bytes.toString('utf8') };
 });
 assertFiles(journal.entries, migrations.map(m => m.hash), readdirSync(join(root, 'drizzle-postgres')).filter(name => name.endsWith('.sql')));
 return migrations;
}

export const BASELINE_INDEXES = {
 review_item_bundle_target_idx: 'CREATE UNIQUE INDEX review_item_bundle_target_idx ON public.review_item_bundle USING btree (impor_bundle_id, reviewer_id, target_type, target_id)',
 ketergantungan_produk_edge_idx: 'CREATE UNIQUE INDEX ketergantungan_produk_edge_idx ON public.ketergantungan_produk USING btree (upstream_entity_type, upstream_entity_id, downstream_entity_type, downstream_entity_id)',
};
export const FINAL_INDEXES = {
 review_item_bundle_target_scoped_unique: 'CREATE UNIQUE INDEX review_item_bundle_target_scoped_unique ON public.review_item_bundle USING btree (impor_bundle_id, reviewer_id, target_type, target_id, product_id) NULLS NOT DISTINCT',
 ketergantungan_produk_edge_idx: 'CREATE UNIQUE INDEX ketergantungan_produk_edge_idx ON public.ketergantungan_produk USING btree (upstream_entity_type, upstream_entity_id, upstream_version, downstream_entity_type, downstream_entity_id, downstream_version)',
 queue_task_checkpoints_recorded_at_idx: 'CREATE INDEX queue_task_checkpoints_recorded_at_idx ON public.queue_task_checkpoints USING btree (recorded_at)',
 queue_task_checkpoints_task_step_pk: 'CREATE UNIQUE INDEX queue_task_checkpoints_task_step_pk ON public.queue_task_checkpoints USING btree (task, step)',
 gamification_question_comeback_lookup_idx: 'CREATE INDEX gamification_question_comeback_lookup_idx ON public.gamification_learning_facts USING btree (user_id, source, source_id, source_version, correct, occurred_at)',
 gamification_question_exposure_order_idx: 'CREATE INDEX gamification_question_exposure_order_idx ON public.gamification_question_exposures USING btree (user_id, question_id, causal_order)',
 discussion_messages_thread_seq_unique: 'CREATE UNIQUE INDEX discussion_messages_thread_seq_unique ON public.discussion_messages USING btree (thread_id, seq)',
 discussion_channels_global_unique: "CREATE UNIQUE INDEX discussion_channels_global_unique ON public.discussion_channels USING btree (kind) WHERE (kind = 'global'::text)",
 discussion_messages_actor_request_unique: 'CREATE UNIQUE INDEX discussion_messages_actor_request_unique ON public.discussion_messages USING btree (author_id, request_id) WHERE (author_id IS NOT NULL)',
 discussion_thread_participants_channel_user_thread_idx: 'CREATE INDEX discussion_thread_participants_channel_user_thread_idx ON public.discussion_thread_participants USING btree (channel_id, user_id, thread_id)',
};
export const FINAL_CONSTRAINTS = {
 review_item_bundle_target_scoped_unique: 'UNIQUE NULLS NOT DISTINCT (impor_bundle_id, reviewer_id, target_type, target_id, product_id)',
 queue_task_checkpoints_task_step_pk: 'PRIMARY KEY (task, step)',
 gamification_question_exposure_projection_user_id_course_id_que: 'PRIMARY KEY (user_id, course_id, question_id)',
 gamification_question_exposure_observations_user_id_attempt_id_: 'PRIMARY KEY (user_id, attempt_id, question_id)',
 gamification_question_legacy_index_user_id_question_id_pk: 'PRIMARY KEY (user_id, question_id)',
 gamification_question_history_cutover_pkey: 'PRIMARY KEY (id)',
 gamification_question_history_cutover_singleton: "CHECK ((id = 'v1'::text))",
 gamification_question_observation_pair_check: 'CHECK (((attempt_identity IS NULL) = (exposed_at IS NULL)))',
};

async function inspectIndexes(client: SqlClient, complete: boolean) {
 const expected = complete ? FINAL_INDEXES : BASELINE_INDEXES;
 const rows = await client.query(`/* production:indexes */
  select c.relname as name, pg_get_indexdef(i.indexrelid) as definition, (i.indisvalid and i.indisready) as valid
  from pg_index i join pg_class c on c.oid=i.indexrelid
  where c.relnamespace='public'::regnamespace and c.relname=any($1::text[])`,
  [[...new Set([...Object.keys(BASELINE_INDEXES), ...Object.keys(FINAL_INDEXES)])]]);
 assertDefinitions(rows.rows.map(row => ({ name: row.name, definition: row.definition, valid: row.valid })), expected);
}

async function inspectCompletedSchema(client: SqlClient, newTables: string[]) {
 const tables = await client.query(`/* production:tables */ select c.relname as name from pg_class c
  where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname=any($1::text[])`, [newTables]);
 if (tables.rows.length !== newTables.length) throw new Error('COMPLETED_TABLES_MISSING');
 await inspectIndexes(client, true);
 const constraints = await client.query(`/* production:constraints */
  select c.conname as name, pg_get_constraintdef(c.oid) as definition, (c.convalidated and not c.condeferrable) as valid
  from pg_constraint c join pg_class t on t.oid=c.conrelid
  where t.relnamespace='public'::regnamespace and c.conname=any($1::text[])`, [Object.keys(FINAL_CONSTRAINTS)]);
 assertDefinitions(constraints.rows.map(row => ({ name: row.name, definition: row.definition, valid: row.valid })), FINAL_CONSTRAINTS);
 const schema = await client.query(`/* production:columns */ select
  (select count(*)=4 and count(*) filter(where is_nullable='NO' and
   ((column_name in ('task','step') and data_type='text' and column_default is null) or
    (column_name='value' and data_type='jsonb' and column_default is null) or
    (column_name='recorded_at' and data_type='timestamp with time zone' and column_default='now()')))=4
   from information_schema.columns where table_schema='public' and table_name='queue_task_checkpoints')
  and (select count(*)=4 and bool_and(data_type='text' and is_nullable='YES' and column_default is null)
   from information_schema.columns where table_schema='public' and table_name='gamification_profiles'
    and column_name in ('equipped_pet_action_id','equipped_pet_suit_id','equipped_zyra_skin_id','equipped_zyra_avatar_id'))
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='gamification_question_exposure_projection'
   and column_name='causal_order' and data_type='bigint' and is_nullable='NO' and column_default like 'nextval(%')
  and pg_get_serial_sequence('public.gamification_question_exposure_projection','causal_order') is not null
  and (select count(*)=19 and bool_and(
    data_type=case when column_name='causal_order' then 'bigint' when column_name in ('exposed_at','completed_at') then 'timestamp with time zone' else 'text' end
    and is_nullable=case when table_name='gamification_question_exposure_observations' and column_name in ('attempt_identity','exposed_at') then 'YES' else 'NO' end
    and case when column_name='causal_order' then column_default like 'nextval(%' else column_default is null end
    and case table_name
     when 'gamification_question_exposure_projection' then column_name in ('user_id','course_id','question_id','attempt_identity','exposed_at','causal_order')
     when 'gamification_question_exposure_observations' then column_name in ('user_id','attempt_id','question_id','course_id','source_version','attempt_identity','exposed_at')
     when 'gamification_question_legacy_index' then column_name in ('user_id','question_id','first_attempt_id','last_attempt_id')
     else column_name in ('id','completed_at') end)
   from information_schema.columns where table_schema='public' and table_name in
    ('gamification_question_exposure_projection','gamification_question_exposure_observations','gamification_question_legacy_index','gamification_question_history_cutover'))
  and (select count(*)=5 from (values
    ('gamification_question_exposure_projection','user_id','user'), ('gamification_question_legacy_index','user_id','user'),
    ('gamification_question_exposure_observations','user_id','user'), ('gamification_question_exposure_observations','attempt_id','student_quiz_attempts'),
    ('gamification_question_exposure_observations','course_id','mata_kuliah')) expected(source_table,source_column,target_table)
   join pg_class src on src.relnamespace='public'::regnamespace and src.relname=expected.source_table
   join pg_class dst on dst.relnamespace='public'::regnamespace and dst.relname=expected.target_table
   join pg_attribute a on a.attrelid=src.oid and a.attname=expected.source_column
   join pg_attribute target on target.attrelid=dst.oid and target.attname='id'
   join pg_constraint fk on fk.conrelid=src.oid and fk.confrelid=dst.oid and fk.contype='f' and fk.convalidated and not fk.condeferrable
    and fk.conkey=array[a.attnum] and fk.confkey=array[target.attnum] and fk.confupdtype='a' and fk.confdeltype='a')
  and not exists (select 1 from pg_constraint c where c.conrelid=any($1::regclass[]) and not c.convalidated)
  and not exists (select 1 from pg_index i where i.indrelid=any($1::regclass[]) and (not i.indisvalid or not i.indisready))
  and not exists (select 1 from pg_constraint c where c.contype='f' and c.confrelid='public.soal'::regclass
   and c.conrelid=any(array['public.gamification_question_exposures'::regclass,
    'public.gamification_question_exposure_initializations'::regclass,'public.gamification_question_exposure_observations'::regclass]))
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='gamification_profiles'
   and column_name='visibility' and column_default='''members''::text' and is_nullable='NO')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='discussion_messages'
   and column_name='mention_handles' and data_type='jsonb' and is_nullable='YES' and column_default is null)
  and (select count(*)=2 from information_schema.columns where table_schema='public' and table_name='user_push_tokens'
   and data_type='text' and is_nullable='NO'
   and ((column_name='platform' and column_default='''web''::text') or (column_name='transport' and column_default='''fcm''::text')))
  and exists (select 1 from pg_index where indexrelid=to_regclass('public.idx_push_tokens_user_transport')
   and indrelid='public.user_push_tokens'::regclass and indisvalid and indisready
   and pg_get_indexdef(indexrelid)='CREATE INDEX idx_push_tokens_user_transport ON public.user_push_tokens USING btree (user_id, transport)')
  and exists (select 1 from pg_constraint where conrelid=to_regclass('public.google_calendar_sync')
   and conname='google_calendar_sync_user_id_user_id_fk' and convalidated
   and pg_get_constraintdef(oid)='FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE')
  as valid`, [newTables.map(table => `public.${table}`)]);
 if (schema.rows[0]?.valid !== true) throw new Error('COMPLETED_SCHEMA_INVALID');
}

async function readCatalog(client: SqlClient) {
 const current = await client.query('select id, name, slot, price_lp, active from public.gamification_cosmetics');
 return planCatalog(current.rows as CosmeticRow[], COSMETIC_CATALOG);
}

async function assertReady(client: SqlClient) {
 const ready = await client.query("select id, completed_at from public.gamification_question_history_cutover");
 if (ready.rows.length !== 1 || ready.rows[0].id !== 'v1' || !ready.rows[0].completed_at) throw new Error('CUTOVER_NOT_READY');
 const plan = await readCatalog(client);
 if (plan.insert.length || plan.retire.length) throw new Error('CATALOG_NOT_COMPLETE');
}

export async function runMigration(client: SqlClient, mode: Mode, migrations: Migration[]) {
 assertFiles(migrations.map((m, idx) => ({ idx, when: m.when, tag: m.tag, version: '7', breakpoints: true })),
  migrations.map(m => sha256(m.sql)), migrations.map(m => `${m.tag}.sql`));
 if (migrations.some((m, i) => m.hash !== FILES[i][2])) throw new Error('UNEXPECTED_LOCAL_MIGRATION_CHAIN');
 const newTables = migrations.slice(9).flatMap(m => [...m.sql.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map(match => match[1]));
 const journal = async () => (await client.query('select id, created_at, hash from drizzle.__drizzle_migrations order by created_at, id')).rows;
 let commitAttempted = false;
 await client.query(mode === 'check' ? 'begin isolation level repeatable read read only' : 'begin');
 try {
  await client.query("set local lock_timeout = '10s'");
  await client.query("set local statement_timeout = '10min'");
  await client.query('set local search_path = public, pg_catalog');
  const identity = await client.query('select current_database() as database');
  if (identity.rows[0]?.database !== 'neondb') throw new Error('DATABASE_IDENTITY_MISMATCH');
  await client.query("select pg_advisory_xact_lock(hashtextextended('zyx:production-cloud-run-migration', 0))");
  // External fencing is still required; lock every existing application table for this snapshot.
  const tables = await client.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind in ('r','p') order by relname");
  const quoted = tables.rows.map(row => `public."${String(row.relname).replaceAll('"', '""')}"`);
  await client.query(`lock table drizzle.__drizzle_migrations${quoted.length ? ', ' + quoted.join(', ') : ''} in ${mode === 'check' ? 'access share' : 'access exclusive'} mode`);
  const before = await journal();
  const state = classifyJournal(before.map(row => ({ created_at: row.created_at, hash: row.hash })));
  if (state === 'complete') {
   await inspectCompletedSchema(client, newTables);
   await assertReady(client);
   commitAttempted = mode === 'apply';
   await client.query(mode === 'apply' ? 'commit' : 'rollback');
   return { state: 'already complete', mode, migrations: 0 };
  }
  await inspectIndexes(client, false);
  const partial = await client.query(`/* production:tables */ select relname as name from pg_class
   where relnamespace='public'::regnamespace and relname=any($1::text[])`, [newTables]);
  if (partial.rows.length) throw new Error('UNEXPECTED_PARTIAL_SCHEMA');
  if (mode === 'check') {
   await client.query('rollback');
   return { state: 'pending', mode, migrations: migrations.length - 9 };
  }
  for (const [index, migration] of migrations.entries()) {
   if (index < 9) continue;
   if (index === 35 || index === 36) {
    const prerequisites = await client.query(`/* production:prerequisites */ select
     to_regclass('public.gamification_profiles') is not null
     and to_regclass('public.discussion_channels') is not null
     and to_regclass('public.gamification_question_history_cutover') is not null
     and (select count(*)=2 from information_schema.columns where table_schema='public' and table_name='gamification_profiles'
      and column_name in ('equipped_zyra_skin_id','equipped_zyra_avatar_id') and data_type='text' and is_nullable='YES')
     and (select count(*)=0 from information_schema.columns where table_schema='public' and table_name='gamification_profiles'
      and column_name in ('equipped_pet_action_id','equipped_pet_suit_id'))
     and (to_regclass('public.queue_task_checkpoints') is not null) = $1::boolean as valid`, [index === 36]);
    if (prerequisites.rows[0]?.valid !== true) throw new Error('QUEUE_OR_PET_PREREQUISITES_MISSING');
   }
   for (const statement of migration.sql.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.query(statement);
   }
   await client.query('insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)', [migration.hash, migration.when]);
  }
  await inspectCompletedSchema(client, newTables);
  const counts = await client.query(`/* production:cutover-counts */ select
   (select count(*)::int from public.gamification_question_history_cutover) ready,
   (select count(*)::int from public.gamification_question_exposure_projection) projections,
   (select count(*)::int from public.gamification_question_exposure_observations) observations,
   (select count(*)::int from public.gamification_question_legacy_index) legacy`);
  if (!counts.rows[0] || ['ready', 'projections', 'observations', 'legacy'].some(key => counts.rows[0][key] !== 0)) throw new Error('UNEXPECTED_PARTIAL_CUTOVER');
  await client.query(LEGACY_INDEX_BACKFILL_SQL);
  await client.query(PROJECTION_BACKFILL_SQL);
  const plan = await readCatalog(client);
  for (const id of plan.retire) await client.query('update public.gamification_cosmetics set active=false where id=$1', [id]);
  for (const item of plan.insert) await client.query('insert into public.gamification_cosmetics (id, name, slot, price_lp, active) values ($1, $2, $3, $4, $5)', [item.id, item.name, item.slot, item.priceLp, item.active]);
  await client.query("insert into public.gamification_question_history_cutover (id, completed_at) values ('v1', clock_timestamp())");
  await assertReady(client);
  const after = await journal();
  if (classifyJournal(after.map(row => ({ created_at: row.created_at, hash: row.hash }))) !== 'complete' ||
      JSON.stringify(after.slice(0, 9)) !== JSON.stringify(before)) throw new Error('HISTORICAL_LEDGER_CHANGED');
  const summary = await client.query(`/* production:summary */ select
   (select count(*)::text from public.student_quiz_attempts) attempts,
   (select count(*)::text from public.gamification_question_exposure_projection) projections,
   (select count(*)::text from public.gamification_question_legacy_index) legacy,
   (select count(*)::text from public.gamification_cosmetics) cosmetics`);
  commitAttempted = mode === 'apply';
  await client.query(mode === 'rehearse' ? 'rollback' : 'commit');
  return { state: mode === 'rehearse' ? 'rehearsed and rolled back' : 'applied', mode, migrations: migrations.length - 9, counts: summary.rows[0] };
 } catch (error) {
  let rollbackFailed = false;
  try { await client.query('rollback'); } catch { rollbackFailed = true; }
  if (commitAttempted) throw new Error('COMMIT_OUTCOME_UNCERTAIN_CHECK_BEFORE_RETRY');
  if (rollbackFailed) throw new Error('ROLLBACK_FAILED_VERIFY_DATABASE_STATE');
  throw error;
 }
}

if (import.meta.main) {
 let client: import('pg').Client | undefined;
 try {
  const { mode, metadataPath } = parseArguments(process.argv.slice(2));
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  const target = assertEnvironment(mode, process.env, metadata);
  const migrations = loadMigrations();
  const { Client } = await import('pg');
  client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000, application_name: 'zyx-production-cloud-run-migration' });
  await client.connect();
  console.log(JSON.stringify({ target, ...await runMigration(client, mode, migrations) }));
 } catch (error) {
  console.error(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'DATABASE_OR_PREFLIGHT_ERROR');
  process.exitCode = 1;
 } finally {
  try { await client?.end(); } catch { console.error('DATABASE_DISCONNECT_FAILED'); process.exitCode = 1; }
 }
}
