/** Guarded staging fixture. All synthetic rows are rolled back. Never run against production.
 * After migration 0022 and the documented cutover, set RUN_QUESTION_EXPOSURE_STAGING=1,
 * NEON_BRANCH_ID and NEON_EXPECTED_HOST, load DATABASE_URL privately, then run:
 * NODE_PATH=/tmp/zyx-gamification-drizzle/node_modules /tmp/zyx-gamification-drizzle/node_modules/.bin/tsx tests/gamification/isolated-question-exposure-postgres.ts
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { build } from 'esbuild';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { classifyJournal, PENDING } from '../../scripts/staging/gamification-migration-core';
import { LEGACY_INDEX_BACKFILL_SQL, PROJECTION_BACKFILL_SQL } from '../../scripts/staging/question-history-backfill-core';
import { assertTarget } from '../../scripts/neon/import-core';
import { isEligibleQuestionRetry } from '../../lib/gamification/evidence';

const host = process.env.NEON_EXPECTED_HOST || '';
const url = process.env.DATABASE_URL || '';
assertTarget(url, host, 'neondb');
if (process.env.RUN_QUESTION_EXPOSURE_STAGING !== '1' || process.env.NEON_BRANCH_ID !== 'br-gentle-scene-azq0gp91' || !['ep-sparkling-lab-azrp3ymj.c-3.ap-southeast-1.aws.neon.tech', 'ep-sparkling-lab-azrp3ymj-pooler.c-3.ap-southeast-1.aws.neon.tech'].includes(host)) throw new Error('GUARDED_STAGING_REQUIRED');
const migrations = readMigrationFiles({ migrationsFolder: 'drizzle-postgres' });
if (migrations[22]?.hash !== PENDING[6][1]) throw new Error('LOCAL_MIGRATION_MISMATCH');
const prefix = `zyx-exposure-fixture-${randomUUID()}`;
const user = `${prefix}-user`, course = `${prefix}-course`, question = `${prefix}-question`, template = `${prefix}-template`;
const attempt = `${prefix}-attempt`, second = `${prefix}-second`, later = `${prefix}-later`;
const client = new pg.Client({ connectionString: url });
let begun = false;
try {
 await client.connect();
 await client.query('begin read only');
 const check = await client.query("select current_database() db, current_setting('transaction_read_only') ro, exists(select 1 from gamification_question_history_cutover where id='v1') ready");
 const journal = await client.query('select created_at,hash from drizzle.__drizzle_migrations order by created_at,id');
 if (check.rows[0]?.db !== 'neondb' || check.rows[0]?.ro !== 'on' || !check.rows[0]?.ready || classifyJournal(journal.rows) !== 'complete') throw new Error('PREFLIGHT_FAILED');
 await client.query('commit');
 const bundle = await build({ stdin: { contents: `export * from './lib/gamification/question-exposure';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external', tsconfig: path.join(process.cwd(), 'tsconfig.json'), plugins: [{ name: 'fixture-dependencies', setup(b) {
  b.onResolve({ filter: /^@\/db$/ }, () => ({ path: 'db', namespace: 'fixture' }));
  b.onResolve({ filter: /^@\/lib\/student\/course-access$/ }, () => ({ path: 'access', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'db' ? 'export const db = {}' : 'export async function resolveCourseAccess(i){return {tier:"staff",hasCourseAccess:true,canonicalCourseId:i.courseId,legacyCourseId:null,courseId:i.courseId}}', loader: 'js' }));
 }}] });
 const Module = require('node:module'); const mod = new Module(path.join(process.cwd(), 'fixture-bundle.cjs'), module); mod.filename = path.join(process.cwd(), 'fixture-bundle.cjs'); mod.paths = module.paths; mod._compile(bundle.outputFiles[0].text, mod.filename);
 const app = mod.exports;
 await client.query('begin'); begun = true;
 await client.query("set local lock_timeout='10s'");
 await client.query("set local statement_timeout='2min'");
 await client.query('insert into "user" (id,name,email,role) values ($1,$1,$2,\'student\')', [user, `${user}@example.invalid`]);
 await client.query("insert into courses (id,title,category) values ($1,'Fixture','Matematika')", [course]);
 await client.query("insert into mata_kuliah (id,code,title,status,legacy_course_id) values ($1,$1,'Fixture','active',$1)", [course]);
 await client.query("insert into soal (id,mata_kuliah_id,question_type,prompt,options_snapshot,quiz_eligible,version,status,difficulty,cognitive_level,reasoning_pattern,generation_hash,creator_id,published_at) values ($1,$2,'multiple_choice','Fixture',$3::jsonb,true,1,'draft','easy','remember','fixture','fixture',$4,now())", [question,course,JSON.stringify([{text:'A',isCorrect:true},{text:'B',isCorrect:false}]),user]);
 await client.query("insert into quiz_templates (id,course_id,title,category,selection_rules,status) values ($1,$2,'Fixture','daily','{}','published')", [template,course]);
 for (const id of [attempt,second,later]) await client.query("insert into student_quiz_attempts (id,student_id,template_id,status,questions_snapshot) values ($1,$2,$3,'in_progress','[]'::jsonb)", [id,user,template]);
 const tx = drizzle(client);
 const at = new Date('2026-01-10T12:00:00Z');
 const input = (attemptId: string) => [{ userId: user, canonicalQuestionId: question, courseId: course, sourceVersion: '1', attemptId, occurredAt: at }];
 await app.lockQuestionExposures(tx, user, [question]);
 // Synthetic repeated raw history and its already-built projection; actual requests must not rescan it.
 await client.query(`insert into gamification_question_bank_disclosures (id,user_id,question_id,course_id,exposed_at)
  select $1 || n::text || ':' || k, $2, case when k=0 then $3 else '__zyx_unmapped_course_disclosure__' end, $4, $5::timestamptz
  from generate_series(1,12000) n cross join generate_series(0,1) k`, [`${prefix}-bank-`,user,question,course,at]);
 await app.recordAuthorizedGlobalDisclosures(tx, { userId:user, questions:[{questionId:question,courseId:course},{questionId:'__zyx_unmapped_course_disclosure__',courseId:course}], requestId:'projection-seed' });
 assert.equal(Number((await client.query('select count(*) n from gamification_question_bank_disclosures where user_id=$1',[user])).rows[0].n),24002);
 assert.equal(Number((await client.query('select count(*) n from gamification_question_exposure_projection where user_id=$1',[user])).rows[0].n),2);
 assert.equal(await app.initializeQuestionExposureHistoryBatch(tx,input(attempt)),true);
 await app.recordSubmissionBoundaries(tx,input(attempt));
 const before = await app.getQuestionExposureObservation(tx,user,question,attempt);
 assert(before && before.attemptIdentity && before.exposedAt);
 assert.equal(isEligibleQuestionRetry({ correct: true, attemptId: attempt, occurredAt: at, lastReveal: { attemptId: before.attemptIdentity, occurredAt: before.exposedAt } }), false);
 assert.equal(Number((await client.query('select count(*) n from gamification_question_exposures where user_id=$1',[user])).rows[0].n),1);
 await app.recordAuthorizedGlobalDisclosures(tx, { userId:user, questions:[{questionId:question,courseId:course}], requestId:'later-disclosure' });
 await client.query("update soal set status='published' where id=$1",[question]);
 await app.recordSubmissionBoundaries(tx,input(attempt));
 assert.deepEqual(await app.getQuestionExposureObservation(tx,user,question,attempt),before);
 assert.equal(Number((await client.query('select count(*) n from gamification_question_exposure_observations where user_id=$1',[user])).rows[0].n),1);
 await app.recordSubmissionBoundaries(tx,input(second));
 const after = await app.getQuestionExposureObservation(tx,user,question,second);
 assert(after?.exposedAt && after.exposedAt >= before.exposedAt);
 // A frozen legacy index proves history rather than inferring emptiness from missing initialization.
 await client.query('delete from gamification_question_exposure_initializations where user_id=$1',[user]);
 await client.query('insert into gamification_question_legacy_index (user_id,question_id,first_attempt_id,last_attempt_id) values ($1,$2,$3,$3)',[user,`question:${question}`,attempt]);
 assert.equal(await app.initializeQuestionExposureHistoryBatch(tx,input(later)),true);
 assert.equal(Number((await client.query("select count(*) n from gamification_question_exposures where user_id=$1 and kind='baseline'",[user])).rows[0].n),1);
 // Show the access path and actual rows for the production four-key lookup shape.
 await client.query('set local enable_seqscan=off');
 const plan = await client.query(`explain (analyze,buffers,format json)
  select case when bool_and(p.causal_order < 0) and count(distinct p.attempt_identity) > 1 then '__zyx_uncertain_exposure__'
    else (array_agg(p.attempt_identity order by p.causal_order desc))[1] end, max(p.exposed_at)
  from (select found.*, max(found.exposed_at) over () latest_at
   from (values ($1::text,$2::text),($1::text,'__zyx_unmapped_course_disclosure__'),($1::text,$2::text),($1::text,'__zyx_unmapped_course_disclosure__')) k(course_id,question_id)
   cross join lateral (select attempt_identity,exposed_at,causal_order from gamification_question_exposure_projection where user_id=$3 and course_id=k.course_id and question_id=k.question_id limit 1) found
  ) p where p.exposed_at=p.latest_at`, [course,question,user]);
 const text = JSON.stringify(plan.rows[0]['QUERY PLAN']);
 assert(text.includes('gamification_question_exposure_projection_user_id_course_id_que'));
 assert(!text.includes('Seq Scan'));
 const nodes: any[] = [];
 const visit = (node: any) => { nodes.push(node); for (const child of node.Plans ?? []) visit(child); };
 visit(plan.rows[0]['QUERY PLAN'][0].Plan);
 const indexNodes = nodes.filter(node => node['Relation Name'] === 'gamification_question_exposure_projection');
 assert(indexNodes.length > 0 && indexNodes.every(node => String(node['Node Type']).includes('Index') && node['Actual Rows'] * node['Actual Loops'] <= 4));
 console.log('PASS bounded history, immutable replay, late publication, legacy baseline, duplicate boundary');
 console.log('Projection EXPLAIN ANALYZE (seq scans disabled to verify the index path):', text);
 for (const [label, statement, args] of [
  ['legacy', 'select * from gamification_question_legacy_index where user_id=$1 and question_id=$2', [user, `question:${question}`]],
  ['observation', 'select * from gamification_question_exposure_observations where user_id=$1 and attempt_id=$2 and question_id=$3', [user, attempt, question]],
 ] as const) {
  const result = await client.query(`explain (analyze,buffers,format json) ${statement}`, [...args]);
  const detail = JSON.stringify(result.rows[0]['QUERY PLAN']);
  assert(detail.includes('Index Scan') && !detail.includes('Seq Scan'));
  console.log(`${label} EXPLAIN ANALYZE:`, detail);
 }

 await client.query('rollback'); begun = false;
 const remaining = await client.query('select count(*)::int n from "user" where id=$1',[user]);
 assert.equal(remaining.rows[0].n,0);
 console.log('PASS synthetic fixture rollback and read-back');
 // Exercise the exact offline queries on transaction-local synthetic source tables.
 await client.query('begin'); begun = true;
 await client.query('create temporary table student_quiz_attempts (id text, student_id text, questions_snapshot jsonb) on commit drop');
 await client.query('create temporary table gamification_question_legacy_index (user_id text, question_id text, first_attempt_id text, last_attempt_id text) on commit drop');
 await client.query('create temporary table gamification_question_exposures (user_id text, course_id text, question_id text, attempt_identity text, exposed_at timestamptz) on commit drop');
 await client.query('create temporary table gamification_question_bank_disclosures (id text, user_id text, course_id text, question_id text, exposed_at timestamptz) on commit drop');
 await client.query('create temporary table gamification_question_exposure_projection (user_id text, course_id text, question_id text, attempt_identity text, exposed_at timestamptz, causal_order bigserial) on commit drop');
 await client.query(`insert into student_quiz_attempts values ('a','u','[{"id":"q"}]'),('b','u','[{"id":"q"}]'),('c','u','{}'),('only','other','[{"id":"q"}]')`);
 await client.query(LEGACY_INDEX_BACKFILL_SQL);
 const legacy = await client.query('select * from gamification_question_legacy_index order by user_id,question_id');
 assert(legacy.rows.some(r => r.user_id === 'u' && r.question_id === 'question:q' && r.first_attempt_id === 'a' && r.last_attempt_id === 'b'));
 assert(legacy.rows.some(r => r.user_id === 'u' && r.question_id === '__zyx_legacy_uncertain__' && r.first_attempt_id === 'c'));
 assert(legacy.rows.some(r => r.user_id === 'other' && r.question_id === 'question:q' && r.first_attempt_id === 'only' && r.last_attempt_id === 'only'));
 await client.query(`insert into gamification_question_exposures values ('u','c','q','earlier','2026-01-01')`);
 await client.query(`insert into gamification_question_bank_disclosures values ('bank','u','c','q','2026-01-02')`);
 await client.query(PROJECTION_BACKFILL_SQL);
 const projected = await client.query('select * from gamification_question_exposure_projection');
 assert.equal(projected.rowCount, 1);
 assert.equal(projected.rows[0].attempt_identity, JSON.stringify(['staff-bank','bank']));
 await client.query('truncate gamification_question_exposure_projection');
 await client.query(`insert into gamification_question_bank_disclosures values ('bank-2','u','c','q','2026-01-02')`);
 await client.query(PROJECTION_BACKFILL_SQL);
 const tied = await client.query('select attempt_identity,causal_order from gamification_question_exposure_projection');
 assert.equal(tied.rows[0].attempt_identity, '__zyx_uncertain_exposure__');
 assert(Number(tied.rows[0].causal_order) < 0);
 await client.query('rollback'); begun = false;
 console.log('PASS exact backfill queries on synthetic temporary tables, rolled back');
} catch (error) {
 if (begun) await client.query('rollback').catch(() => {});
 console.error('Question exposure fixture failed:', error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'FIXTURE_OR_DATABASE_ERROR');
 process.exitCode = 1;
} finally { await client.end(); }
