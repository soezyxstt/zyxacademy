/** Run only during the documented staging write-free cutover, after migration 0022. */
import { Client } from 'pg';
import { assertTarget } from '../neon/import-core';
import { classifyJournal } from './gamification-migration-core';
import { LEGACY_INDEX_BACKFILL_SQL, PROJECTION_BACKFILL_SQL } from './question-history-backfill-core';

const url = process.env.DATABASE_URL || '';
const host = process.env.NEON_EXPECTED_HOST || '';
assertTarget(url, host, 'neondb');
if (process.env.NEON_BRANCH_ID !== 'br-gentle-scene-azq0gp91' || process.env.NEON_EXPECTED_DATABASE !== 'neondb' || !['ep-sparkling-lab-azrp3ymj.c-3.ap-southeast-1.aws.neon.tech', 'ep-sparkling-lab-azrp3ymj-pooler.c-3.ap-southeast-1.aws.neon.tech'].includes(host) || process.env.QUESTION_HISTORY_WRITERS_STOPPED !== '1') throw new Error('QUIESCED_STAGING_TARGET_REQUIRED');
const client = new Client({ connectionString: url });
try {
 await client.connect();
 await client.query('begin');
 await client.query("set local lock_timeout = '10s'");
 await client.query("set local statement_timeout = '10min'");
 await client.query('set local search_path = public, pg_catalog');
 const identity = await client.query('select current_database() as db');
 if (identity.rows[0]?.db !== 'neondb') throw new Error('DATABASE_IDENTITY_MISMATCH');
 await client.query("select pg_advisory_xact_lock(hashtextextended('zyx:staging-gamification-migration', 0))");
 // All app writers and workers must be stopped outside this transaction; locks also protect its snapshot.
 await client.query('lock table drizzle.__drizzle_migrations, student_quiz_attempts, gamification_question_exposures, gamification_question_exposure_initializations, gamification_question_bank_disclosures, gamification_question_exposure_projection, gamification_question_exposure_observations, gamification_question_legacy_index, gamification_question_history_cutover in access exclusive mode');
 const journal = await client.query('select created_at, hash from drizzle.__drizzle_migrations order by created_at, id');
 if (classifyJournal(journal.rows) !== 'complete') throw new Error('MIGRATIONS_NOT_COMPLETE');
 const counts = await client.query(`select
  (select count(*)::int from gamification_question_history_cutover) ready,
  (select count(*)::int from gamification_question_exposure_projection) projections,
  (select count(*)::int from gamification_question_exposure_observations) observations,
  (select count(*)::int from gamification_question_legacy_index) legacy`);
 const before = counts.rows[0];
 if (before.ready === 1) {
  const ready = await client.query("select id from gamification_question_history_cutover where id='v1'");
  if (ready.rowCount !== 1) throw new Error('INVALID_CUTOVER_STATE');
  await client.query('commit');
  console.log('Question history cutover: already complete');
 } else {
  if (before.ready !== 0 || before.projections !== 0 || before.observations !== 0 || before.legacy !== 0) throw new Error('UNEXPECTED_PARTIAL_CUTOVER');
  // Group once offline; no legacy attempt JSON is inspected on a request.
  await client.query(LEGACY_INDEX_BACKFILL_SQL);
  await client.query(PROJECTION_BACKFILL_SQL);
  const after = await client.query(`select (select count(*)::int from gamification_question_exposure_projection) projections,
   (select count(*)::int from gamification_question_legacy_index) legacy,
   (select count(*)::int from student_quiz_attempts) attempts,
   (select count(*)::int from gamification_question_exposures) exposures,
   (select count(*)::int from gamification_question_bank_disclosures) bank`);
  await client.query("insert into gamification_question_history_cutover (id,completed_at) values ('v1',clock_timestamp())");
  await client.query('commit');
  console.log('Question history cutover committed:', JSON.stringify({ before, after: after.rows[0] }));
 }
} catch (error) {
 await client.query('rollback').catch(() => {});
 console.error('Question history cutover failed:', error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'DATABASE_OR_BACKFILL_ERROR');
 process.exitCode = 1;
} finally { await client.end(); }
