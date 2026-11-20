/** Guarded staging fixture, all application and fixture writes roll back. Run only after
 * migration 0023 and the documented cutover, never against production. Session auth is
 * outside this boundary; the real course access resolver and reward gates run here. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { build } from 'esbuild';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { assertTarget } from '../../scripts/neon/import-core';
import { classifyJournal, PENDING } from '../../scripts/staging/gamification-migration-core';

const host = process.env.NEON_EXPECTED_HOST || '', url = process.env.DATABASE_URL || '';
assertTarget(url, host, 'neondb');
if (process.env.RUN_QUESTION_EXPOSURE_STAGING !== '1' || process.env.NEON_BRANCH_ID !== 'br-gentle-scene-azq0gp91' || !['ep-sparkling-lab-azrp3ymj.c-3.ap-southeast-1.aws.neon.tech','ep-sparkling-lab-azrp3ymj-pooler.c-3.ap-southeast-1.aws.neon.tech'].includes(host)) throw new Error('GUARDED_STAGING_REQUIRED');
const migrations = readMigrationFiles({ migrationsFolder: 'drizzle-postgres' });
if (migrations.length !== 24 || migrations[23]?.hash !== PENDING[7][1]) throw new Error('LOCAL_MIGRATION_MISMATCH');
const prefix = `zyx-writer-fixture-${randomUUID()}`;
const user = `${prefix}-user`, course = `${prefix}-course`, template = `${prefix}-template`, checklist = `${prefix}-checklist`;
const client = new pg.Client({ connectionString: url });
const captured: { sql: string; params: unknown[] }[] = [];
let begun = false;
async function main() {
try {
 await client.connect();
 await client.query('begin read only');
 const preflight = await client.query("select current_database() db, current_setting('transaction_read_only') ro, exists(select 1 from gamification_question_history_cutover where id='v1') ready");
 const journal = await client.query('select created_at,hash from drizzle.__drizzle_migrations order by created_at,id');
 if (preflight.rows[0]?.db !== 'neondb' || preflight.rows[0]?.ro !== 'on' || !preflight.rows[0]?.ready || classifyJournal(journal.rows) !== 'complete') throw new Error('PREFLIGHT_FAILED');
 await client.query('commit');
 await client.query('begin'); begun = true;
 await client.query("set local lock_timeout='10s'"); await client.query("set local statement_timeout='2min'");
 // Shadow high-volume tables and the outbox so neither ANALYZE nor global candidate
 // selection touches other users. LIKE copies the production indexes and checks.
 for (const table of ['gamification_learning_facts','gamification_event_outbox','gamification_xp_ledger']) await client.query(`create temporary table ${table} (like public.${table} including all) on commit drop`);
 const tx = drizzle(client, { logger: { logQuery(query, params) { captured.push({ sql: query, params }); } } });
 // Processor transactions are deliberately bound to this outer rollback transaction.
 const fixtureDb = Object.assign(tx, { transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) });
 (globalThis as any).__questionFixtureDb = fixtureDb;
 const bundle = await build({ stdin: { contents: `export { writeQuestionRewards } from './lib/gamification/question-writer'; export { recordAttemptDisclosures, recordAuthorizedGlobalDisclosures } from './lib/gamification/question-exposure'; export { processGamificationOutbox } from './lib/gamification/processor'; export { resolveCourseAccess } from './lib/student/course-access';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external', tsconfig: path.join(process.cwd(), 'tsconfig.json'), plugins: [{ name: 'fixture-db', setup(b) {
  b.onResolve({ filter: /^@\/db$/ }, () => ({ path:'db', namespace:'fixture' }));
  b.onResolve({ filter: /^server-only$/ }, () => ({ path:'server-only', namespace:'fixture' }));
  b.onLoad({ filter: /.*/, namespace:'fixture' }, args => ({ contents: args.path === 'db' ? 'export const db = globalThis.__questionFixtureDb' : '', loader:'js' }));
 }}] });
 const Module = require('node:module'); const mod = new Module(path.join(process.cwd(), 'question-writer-fixture.cjs'), module); mod.filename = path.join(process.cwd(), 'question-writer-fixture.cjs'); mod.paths = module.paths; mod._compile(bundle.outputFiles[0].text, mod.filename);
 const app = mod.exports;
 await client.query('insert into "user" (id,name,email,role) values ($1,$1,$2,\'student\')', [user,`${user}@example.invalid`]);
 await client.query('insert into pengguna (id) values ($1)', [user]);
 const role = await client.query("select id from peran where code='murid'"); assert.equal(role.rowCount,1);
 await client.query("insert into pengguna_peran (id,pengguna_id,peran_id,source) values ($1,$2,$3,'fixture')", [`${prefix}-role`,user,role.rows[0].id]);
 await client.query("insert into courses (id,title,category) values ($1,'Fixture','Matematika')",[course]);
 await client.query("insert into mata_kuliah (id,code,title,status,is_demo,legacy_course_id) values ($1,$1,'Fixture','active',false,$1)",[course]);
 await client.query("insert into pendaftaran_murid (id,pengguna_id,mata_kuliah_id,status) values ($1,$2,$3,'active')",[`${prefix}-enrollment`,user,course]);
 await client.query("insert into quiz_templates (id,course_id,title,category,selection_rules,status) values ($1,$2,'Fixture','daily','{}','published')",[template,course]);
 await client.query("insert into gamification_checklists (id,course_id,version,status,total_xp_micro) values ($1,$2,1,'approved',20000000)",[checklist,course]);
 const now = new Date(Date.now()-5000), started = new Date(now.getTime()-86400000);
 await client.query('insert into gamification_course_starts (user_id,course_id,checklist_id,started_at) values ($1,$2,$3,$4)',[user,course,checklist,started]);
 const access = await app.resolveCourseAccess({userId:user,courseId:course,now},tx);
 assert(access.isAuthenticated && access.isEnrolled && access.hasFullContentAccess && !access.isDemo && access.canonicalCourseId === course);
 const canonical = async (id: string, status='published') => client.query("insert into soal (id,mata_kuliah_id,question_type,prompt,options_snapshot,quiz_eligible,version,status,difficulty,cognitive_level,reasoning_pattern,generation_hash,creator_id,published_at) values ($1,$2,'multiple_choice','Fixture',$3::jsonb,true,1,$4,'easy','remember','fixture','fixture',$5,$6)",[id,course,JSON.stringify([{text:'A',isCorrect:true},{text:'B',isCorrect:false}]),status,user,started]);
 const question = (id: string) => ({id,question_type:'multiple_choice',options:['A','B'],correct_indices:[0],gamificationProvenance:{marker:'canonical-objective-v1',canonicalQuestionId:id,courseId:course,sourceVersion:'1',answerProof:{questionType:'multiple_choice',correctIndices:[0]}}});
 const submit = async (id: string, q: any, at = now) => {
  const answers = {[q.id]:0};
  await client.query("insert into student_quiz_attempts (id,student_id,template_id,status,questions_snapshot,answers_snapshot,started_at,submitted_at) values ($1,$2,$3,'completed',$4::jsonb,$5::jsonb,$6,$7)",[id,user,template,JSON.stringify([q]),JSON.stringify(answers),started,at]);
  await app.writeQuestionRewards(tx,{userId:user,attemptId:id,snapshot:[q],answers,occurredAt:at});
  await app.recordAttemptDisclosures(tx,{userId:user,attemptId:id,questionIds:[q.id],occurredAt:at,requestId:'submission-result'});
 };
 // Missing, draft, and malformed in-snapshot disclosures use the attempt's course.
 for (const state of ['missing','draft','invalid','deleted'] as const) {
  const id = `${prefix}-${state}`, first = `${id}-first`, second = `${id}-second`;
  if (state !== 'missing') await canonical(id, state === 'draft' ? 'draft' : 'published');
  if (state === 'deleted') await client.query('delete from soal where id=$1',[id]);
  const legacy: any = state === 'deleted' ? question(id) : {id,question_type:'multiple_choice',options:['A','B'],correct_indices:[0]};
  if (state === 'invalid') legacy.gamificationProvenance = {marker:'invalid',courseId:'untrusted'};
  await submit(first,legacy);
  await app.recordAttemptDisclosures(tx,{userId:user,attemptId:first,questionIds:[id],occurredAt:now,requestId:'review'});
  const tombstone = await client.query('select course_id from gamification_question_exposure_projection where user_id=$1 and question_id=$2',[user,id]);
  assert.equal(tombstone.rows[0]?.course_id,course);
  if (state === 'missing' || state === 'deleted') await canonical(id); else await client.query("update soal set status='published' where id=$1",[id]);
  await client.query("insert into gamification_checklist_items (id,checklist_id,category,source_id,content_version,base_xp_micro) values ($1,$2,'question',$3,'1',100000)",[`${id}-item`,checklist,id]);
  // A timestamp later on the same Jakarta day still cannot earn the first reward.
  const at = new Date(); await submit(second,question(id),at);
  const fact = await client.query('select last_reveal_attempt_id,last_reveal_at from gamification_learning_facts where id=$1',[`question:${second}:${id}`]);
  assert(fact.rows[0]?.last_reveal_attempt_id && fact.rows[0]?.last_reveal_at);
  assert.deepEqual(await app.processGamificationOutbox({limit:1}),{processed:1,rejected:0,failed:0});
  assert.equal(Number((await client.query('select count(*) n from gamification_xp_ledger where user_id=$1',[user])).rows[0].n),0);
 }
 // A provenanced snapshot whose canonical version changed is graded and
 // disclosed, but it cannot create a reward fact for the stale version.
 {
  const id = `${prefix}-changed`, attempt = `${id}-attempt`; await canonical(id);
  await client.query('update soal set version=2 where id=$1',[id]);
  await submit(attempt,question(id));
  assert.equal(Number((await client.query('select count(*) n from gamification_learning_facts where user_id=$1 and source_id=$2',[user,id])).rows[0].n),0);
  assert.equal(Number((await client.query('select count(*) n from gamification_question_exposure_projection where user_id=$1 and course_id=$2 and question_id=$3',[user,course,id])).rows[0].n),1);
 }
 // Same-millisecond ordering and future clocks go through the actual writer and
 // processor. Later disclosure cannot mutate an already captured observation.
 for (const state of ['same-before','same-after','future','mcp'] as const) {
  const id = `${prefix}-${state}`, attempt = `${id}-attempt`;
  if (state === 'mcp') await app.recordAuthorizedGlobalDisclosures(tx,{userId:user,questions:[{questionId:id,courseId:course}],requestId:'mcp-answer'});
  await canonical(id);
  await client.query("insert into gamification_checklist_items (id,checklist_id,category,source_id,content_version,base_xp_micro) values ($1,$2,'question',$3,'1',100000)",[`${id}-item`,checklist,id]);
  if (state === 'same-before' || state === 'future') await client.query('insert into gamification_question_exposure_projection (user_id,course_id,question_id,attempt_identity,exposed_at) values ($1,$2,$3,$4,$5)',[user,course,id,`fixture-${state}`,state === 'future' ? new Date(now.getTime()+3600000) : now]);
  await submit(attempt,question(id),state === 'mcp' ? new Date() : now);
  if (state === 'same-after') await client.query(`insert into gamification_question_exposure_projection (user_id,course_id,question_id,attempt_identity,exposed_at) values ($1,$2,$3,$4,$5) on conflict (user_id,course_id,question_id) do update set attempt_identity=excluded.attempt_identity,exposed_at=excluded.exposed_at,causal_order=excluded.causal_order`,[user,course,id,'after',now]);
  assert.deepEqual(await app.processGamificationOutbox({limit:1}),{processed:1,rejected:0,failed:0});
  const count = Number((await client.query('select count(*) n from gamification_xp_ledger where user_id=$1',[user])).rows[0].n);
  assert.equal(count, state === 'same-before' ? 0 : 1);
 }
 // Real writer and processor against many nonmatching facts. The logged SQL is the
 // exact query executed by processOne, including its parameters and date boundary.
 const id = `${prefix}-plan`, attempt = `${id}-attempt`;
 await canonical(id);
 await client.query("insert into gamification_checklist_items (id,checklist_id,category,source_id,content_version,base_xp_micro) values ($1,$2,'question',$3,'1',100000)",[`${id}-item`,checklist,id]);
 await client.query(`insert into gamification_learning_facts (id,user_id,course_id,source,source_id,source_version,occurred_at,attempt_id,correct)
  select $1 || n::text,$2,$3,'question',$4,case when n%2=0 then '1' else '2' end,$5::timestamptz - interval '30 days',$6, (n%2=0) from generate_series(1,40000) n`,[`${id}-history-`,user,course,id,now,`${id}-old`]);
 await submit(attempt,question(id)); await client.query('analyze gamification_learning_facts'); captured.length = 0;
 assert.deepEqual(await app.processGamificationOutbox({limit:1}),{processed:1,rejected:0,failed:0});
 const lookup = captured.find(q => q.sql.includes('gamification_learning_facts') && q.sql.includes('"correct"') && q.sql.includes(' limit ') && q.sql.includes('"occurred_at" <'));
 assert(lookup,'Processor did not execute comeback lookup');
 const explain = await client.query(`explain (analyze,buffers,format json) ${lookup.sql}`, lookup.params);
 const plan = explain.rows[0]['QUERY PLAN'][0]; const nodes: any[] = [];
 const visit = (node: any) => { nodes.push(node); for (const child of node.Plans ?? []) visit(child); }; visit(plan.Plan);
 const scans = nodes.filter(n => n['Relation Name'] === 'gamification_learning_facts');
 assert(scans.length && scans.every(n => String(n['Node Type']).includes('Index') && ['user_id','source','source_id','source_version','correct','occurred_at'].every(key => String(n['Index Cond']).includes(key)) && (n['Actual Rows'] + (n['Rows Removed by Filter'] ?? 0)) * n['Actual Loops'] <= 1));
 console.log('Actual processor comeback EXPLAIN ANALYZE, default planner:', JSON.stringify(plan));
 await app.writeQuestionRewards(tx,{userId:user,attemptId:attempt,snapshot:[question(id)],answers:{[id]:0},occurredAt:now});
 assert.equal(Number((await client.query('select count(*) n from gamification_xp_ledger where user_id=$1',[user])).rows[0].n),2);
 console.log('PASS real access resolver, writer, processor, replay, missing/draft/invalid/deleted disclosure, same-millisecond and future ordering, MCP disclosure, and bounded comeback plan');
 await client.query('rollback'); begun = false;
 assert.equal(Number((await client.query('select count(*) n from "user" where id=$1',[user])).rows[0].n),0);
 console.log('PASS fixture rollback and read-back');
} catch (error) {
 if (begun) await client.query('rollback').catch(() => {});
 console.error('Question writer fixture failed:', error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'FIXTURE_OR_DATABASE_ERROR'); process.exitCode = 1;
} finally { delete (globalThis as any).__questionFixtureDb; await client.end(); }

}
main().catch(() => { console.error('FIXTURE_SETUP_ERROR'); process.exitCode = 1; });
