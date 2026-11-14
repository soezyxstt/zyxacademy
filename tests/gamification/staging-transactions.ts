/**
 * Guarded staging integration check. Requires pg, drizzle-orm, esbuild and date-fns.
 * Example, with dependencies installed in an isolated directory:
 * NODE_PATH=/tmp/zyx-gamification-drizzle/node_modules RUN_GAMIFICATION_STAGING_CHECKS=1 \
 *   /tmp/zyx-gamification-drizzle/node_modules/.bin/tsx tests/gamification/staging-transactions.ts
 * Load DATABASE_URL into the environment beforehand, without printing it.
 * Session authentication is stubbed; all reward and leaderboard SQL is production source.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { build } from 'esbuild';

const root = process.cwd();
const host = 'ep-sparkling-lab-azrp3ymj.c-3.ap-southeast-1.aws.neon.tech';
const prefix = `zyx-gamification-check-${randomUUID()}`;
const ids = [0, 1, 2, 3].map(i => `${prefix}-${i}`);
const cosmetics = [0, 1, 2].map(i => `${prefix}-cosmetic-${i}`);
const publicIds = ids.map(id => `${id}-public`);
const fail = (message: string): never => { throw new Error(message); };

async function main() {
 if (process.env.RUN_GAMIFICATION_STAGING_CHECKS !== '1') fail('Explicit staging opt-in required');
 let url: URL;
 try { url = new URL(process.env.DATABASE_URL ?? ''); } catch { return fail('Invalid database URL'); }
 if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== host || url.port && url.port !== '5432' || url.pathname !== '/neondb' || url.searchParams.get('host')) fail('Database target does not match the approved staging endpoint');
 const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6, connectionTimeoutMillis: 10000 });
 let appPool: { end(): Promise<void> } | undefined;
 let wrote = false;
 try {
  const client = await pool.connect();
  try {
   await client.query('begin read only');
   const identity = await client.query("select current_database() as db, current_setting('transaction_read_only') as ro");
   assert.equal(identity.rows[0].db, 'neondb'); assert.equal(identity.rows[0].ro, 'on');
   const journal = JSON.parse(await readFile(path.join(root, 'drizzle-postgres/meta/_journal.json'), 'utf8'));
   const expected = await Promise.all(journal.entries.filter((e: any) => e.idx >= 9 && e.idx <= 15).map(async (e: any) => ({ when: String(e.when), hash: createHash('sha256').update(await readFile(path.join(root, `drizzle-postgres/${e.tag}.sql`))).digest('hex') })));
   assert.equal(expected.length, 7);
   const migrations = await client.query('select hash, created_at from drizzle.__drizzle_migrations');
   for (const e of expected) assert(migrations.rows.some(r => r.hash === e.hash && String(r.created_at) === e.when), 'Required migration missing or mismatched');
   const schema = await client.query("select table_name, column_name from information_schema.columns where table_schema='public' and table_name = any($1::text[])", [['user','gamification_accounts','gamification_profiles','gamification_cosmetics','gamification_inventory','gamification_lp_ledger','gamification_leaderboard_periods','gamification_follows','gamification_blocks','gamification_social_rate_limits']]);
   const columns = new Set(schema.rows.map(r => `${r.table_name}.${r.column_name}`));
   for (const col of ['user.role','gamification_accounts.lp_balance','gamification_profiles.leaderboard_opt_in','gamification_cosmetics.price_lp','gamification_inventory.cosmetic_id','gamification_lp_ledger.reward_key','gamification_leaderboard_periods.base_xp_micro','gamification_follows.following_id','gamification_blocks.blocked_id','gamification_social_rate_limits.attempts']) assert(columns.has(col), `Missing schema column ${col}`);
   await client.query('commit');
  } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
  // Exact-prefix counts include independent fixture rows as well as user-owned rows.
  const counts = async () => (await pool.query(`select
   (select count(*) from "user" where id like $1) as users,
   (select count(*) from gamification_cosmetics where id like $1) as cosmetics,
   (select count(*) from gamification_inventory where user_id like $1 or cosmetic_id like $1) as inventory,
   (select count(*) from gamification_lp_ledger where user_id like $1) as ledger,
   (select count(*) from gamification_accounts where user_id like $1) as accounts,
   (select count(*) from gamification_profiles where user_id like $1) as profiles,
   (select count(*) from gamification_leaderboard_periods where user_id like $1) as periods,
   (select count(*) from gamification_follows where follower_id like $1 or following_id like $1) as follows,
   (select count(*) from gamification_blocks where blocker_id like $1 or blocked_id like $1) as blocks,
   (select count(*) from gamification_social_rate_limits where user_id like $1) as rates`, [`${prefix}%`])).rows[0];
  const numericCounts = async () => {
   const result = Object.fromEntries(Object.entries(await counts()).map(([key, value]) => [key, Number(value)]));
   for (const table of ['gamification_xp_ledger','gamification_badge_activities','gamification_badges','gamification_qualified_days','gamification_missions','gamification_event_outbox','gamification_evidence_receipts','gamification_article_completions','gamification_course_starts','gamification_learning_facts','gamification_question_exposures','gamification_question_exposure_initializations']) result[table] = Number((await pool.query(`select count(*) n from ${table} where user_id like $1`, [`${prefix}%`])).rows[0].n);
   for (const table of ['mata_kuliah','artikel','bagian_artikel','pendaftaran_murid','pengguna_peran','pengguna','gamification_checklists','gamification_checklist_items','courses','soal','quiz_templates','student_quiz_attempts']) result[table] = Number((await pool.query(`select count(*) n from ${table} where id like $1`, [`${prefix}%`])).rows[0].n);
   return result;
  };
  const before = await numericCounts(); assert(Object.values(before).every(v => v === 0));
  // Resolve only the actor and server-only marker to test stubs. The actual db adapter remains in use.
  const bundle = await build({ stdin: { contents: `export { purchaseGamificationCosmetic, equipGamificationCosmetics } from './lib/gamification/rewards'; export { getGamificationLeaderboard } from './lib/gamification/leaderboard'; export { pool, db } from './lib/db'; export { writeQuestionRewards } from './lib/gamification/question-writer'; export { processGamificationOutbox } from './lib/gamification/processor'; export { reconcileGamificationAccount } from './lib/gamification/reconciliation'; export { resolveCourseAccess } from './lib/student/course-access';`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'fixture-session', setup(b) {
   b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'fixture' }));
   b.onResolve({ filter: /^\.\/access$/ }, args => args.resolveDir.endsWith('/lib/gamification') ? { path: 'access', namespace: 'fixture' } : undefined);
   b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'access' ? 'export async function requireStudentGamificationAccess(){return {user:{id:globalThis.__gamificationFixtureActor}}}' : '', loader: 'js' }));
  }}] });
  // Evaluate in memory so no generated bundle or credentials are left behind.
  const Module = require('node:module'); const mod = new Module(path.join(root, 'fixture-bundle.cjs'), module); mod.filename = path.join(root, 'fixture-bundle.cjs'); mod.paths = module.paths; mod._compile(bundle.outputFiles[0].text, mod.filename);
  const app = mod.exports; appPool = app.pool;
  try {
   wrote = true;
   for (let i = 0; i < ids.length; i++) {
    await pool.query('insert into "user" (id,name,email,role) values ($1,$2,$3,$4)', [ids[i], `Fixture ${i}`, `${ids[i]}@example.invalid`, 'student']);
    await pool.query('insert into gamification_profiles (user_id,public_id,display_name,visibility,leaderboard_opt_in) values ($1,$2,$3,$4,true)', [ids[i], publicIds[i], `Fixture ${i}`, i === 3 ? 'private' : 'members']);
    await pool.query("insert into gamification_leaderboard_periods (user_id,period_key,base_xp_micro) values ($1,'all',$2)", [ids[i], i < 2 ? 100 : 50]);
   }
   await pool.query('insert into gamification_accounts (user_id,lp_balance) values ($1,100),($2,100)', [ids[0], ids[1]]);
   for (const id of cosmetics) await pool.query("insert into gamification_cosmetics (id,name,slot,price_lp) values ($1,'Fixture','frame',60)", [id]);
   await app.purchaseGamificationCosmetic(ids[0], cosmetics[0]); await app.purchaseGamificationCosmetic(ids[0], cosmetics[0]);
   await assert.rejects(() => app.purchaseGamificationCosmetic(ids[0], cosmetics[1]), /INSUFFICIENT_LP/);
   await assert.rejects(() => app.equipGamificationCosmetics(ids[0], { themeId: cosmetics[0] }), /COSMETIC_NOT_OWNED/);
   let state = await pool.query('select lp_balance,(select count(*) from gamification_inventory where user_id=$1) inventory,(select count(*) from gamification_lp_ledger where user_id=$1 and amount=-60) ledger from gamification_accounts where user_id=$1', [ids[0]]);
   assert.deepEqual(Object.values(state.rows[0]).map(Number), [40,1,1]);
   const race = await Promise.allSettled([app.purchaseGamificationCosmetic(ids[1], cosmetics[1]), app.purchaseGamificationCosmetic(ids[1], cosmetics[2])]);
   assert.equal(race.filter(x => x.status === 'fulfilled').length, 1); assert.equal(race.filter(x => x.status === 'rejected' && /INSUFFICIENT_LP/.test(String(x.reason))).length, 1);
   state = await pool.query('select lp_balance,(select count(*) from gamification_inventory where user_id=$1) inventory,(select count(*) from gamification_lp_ledger where user_id=$1 and amount=-60) ledger from gamification_accounts where user_id=$1', [ids[1]]);
   assert.deepEqual(Object.values(state.rows[0]).map(Number), [40,1,1]);
   (globalThis as any).__gamificationFixtureActor = ids[0];
   const get = (scope: 'global'|'following', cursor?: string) => app.getGamificationLeaderboard(ids[0], { period:'all',scope,pageSize:1,...(cursor ? {cursor} : {}) });
   let page = await get('global'); assert.equal(page.entries[0].publicId,publicIds[0]); assert.equal(page.entries[0].position,1); assert(page.nextCursor);
   page = await get('global',page.nextCursor); assert.equal(page.entries[0].publicId,publicIds[1]); assert.equal(page.entries[0].position,1); assert(page.nextCursor);
   page = await get('global',page.nextCursor); assert.equal(page.entries[0].publicId,publicIds[2]); assert.equal(page.nextCursor,null);
   await pool.query('insert into gamification_follows (follower_id,following_id) values ($1,$2)', [ids[0],ids[2]]);
   page = await get('following'); assert.equal(page.entries[0].publicId,publicIds[0]); page = await get('following',page.nextCursor); assert.equal(page.entries[0].publicId,publicIds[2]); assert.equal(page.nextCursor,null);
   await pool.query('insert into gamification_blocks (blocker_id,blocked_id) values ($1,$2)', [ids[2],ids[0]]);
   page = await get('following'); assert.equal(page.entries[0].publicId,publicIds[0]); assert.equal(page.nextCursor,null);
   // Separate SQL boundary: concurrent upsert atomicity and unique key, not a service test.
   await Promise.all(Array.from({length: 8}, () => pool.query("insert into gamification_social_rate_limits (user_id,action,window_key,attempts,expires_at) values ($1,'fixture','rolling',1,now()+interval '1 hour') on conflict (user_id,action,window_key) do update set attempts=gamification_social_rate_limits.attempts+1", [ids[0]])));
   const rate = await pool.query("select count(*) as rows,max(attempts) as attempts from gamification_social_rate_limits where user_id=$1 and action='fixture'", [ids[0]]); assert.equal(Number(rate.rows[0].rows),1); assert.equal(Number(rate.rows[0].attempts),8);
   console.log('PASS: reward transactions, leaderboard query, and separate SQL rate counter');
   // A separate synthetic actor keeps the purchase balances out of reconciliation.
   const actor = `${prefix}-processor`, course = `${prefix}-course`, checklist = `${prefix}-checklist`;
   await pool.query('insert into "user" (id,name,email,role) values ($1,$2,$3,$4)', [actor,'Processor fixture',`${actor}@example.invalid`,'student']);
   await pool.query('insert into pengguna (id) values ($1)', [actor]);
   const role = await pool.query("select id from peran where code='murid'"); assert.equal(role.rowCount,1);
   await pool.query("insert into pengguna_peran (id,pengguna_id,peran_id,source) values ($1,$2,$3,'fixture')", [`${prefix}-role`,actor,role.rows[0].id]);
   await pool.query("insert into mata_kuliah (id,code,title,status,is_demo) values ($1,$1,'Fixture','active',false)", [course]);
   await pool.query("insert into pendaftaran_murid (id,pengguna_id,mata_kuliah_id,status) values ($1,$2,$3,'active')", [`${prefix}-enrollment`,actor,course]);
   const occurred = new Date(Date.now()-60000), started = new Date(occurred.getTime()-60000);
   await pool.query("insert into gamification_checklists (id,course_id,version,status,total_xp_micro) values ($1,$2,1,'approved',500000)", [checklist,course]);
   await pool.query('insert into gamification_course_starts (user_id,course_id,checklist_id,started_at) values ($1,$2,$3,$4)', [actor,course,checklist,started]);
   const access = await app.resolveCourseAccess({userId:actor,courseId:course,now:occurred});
   assert(access.isAuthenticated && access.isEnrolled && access.hasFullContentAccess && !access.isDemo && access.canonicalCourseId === course);
   for (let i=0;i<5;i++) {
    const article=`${prefix}-article-${i}`, section=`${prefix}-section-${i}`, completion=`${prefix}-completion-${i}`, receipt=`${prefix}-receipt-${i}`;
    await pool.query("insert into artikel (id,mata_kuliah_id,slug,title,content_markdown,structure_status,version,status,source_hash,generation_hash,creator_id,published_at) values ($1,$2,$1,'Fixture','Fixture','structured',1,'published','fixture','fixture',$3,$4)", [article,course,actor,started]);
    await pool.query("insert into bagian_artikel (id,artikel_id,section_key,section_kind,slug,title,learning_objective,order_index,estimated_reading_minutes,version,status) values ($1,$2,'section','topic','section','Fixture','Fixture',0,1,1,'published')", [section,article]);
    await pool.query("insert into gamification_checklist_items (id,checklist_id,category,source_id,content_version,base_xp_micro) values ($1,$2,'article',$3,'1',100000)", [`${prefix}-item-${i}`,checklist,article]);
    const sections=JSON.stringify([section]), evidence=JSON.stringify([{id:`${prefix}-evidence-${i}`,sectionId:section,completedAt:occurred.toISOString()}]);
    await pool.query('insert into gamification_article_completions (id,user_id,course_id,article_id,article_version,completed_at,section_ids,evidence) values ($1,$2,$3,$4,1,$5,$6::jsonb,$7::jsonb)', [completion,actor,course,article,occurred,sections,evidence]);
    if (i===0) await assert.rejects(() => pool.query('insert into gamification_article_completions (id,user_id,course_id,article_id,article_version,completed_at,section_ids,evidence) values ($1,$2,$3,$4,1,$5,$6::jsonb,$7::jsonb)', [`${completion}-duplicate`,actor,course,article,occurred,sections,evidence]), (e:any) => e.code === '23505');
    await pool.query("insert into gamification_evidence_receipts (id,user_id,course_id,source,source_id,source_version,source_evidence_id,occurred_at,details) values ($1,$2,$3,'article',$4,'1',$5,$6,$7::jsonb)", [receipt,actor,course,article,completion,occurred,JSON.stringify({sectionIds:[section]})]);
    await pool.query("insert into gamification_event_outbox (id,user_id,source,source_id,evidence_id,occurred_at,created_at) values ($1,$2,'article',$3,$4,$5,'1900-01-01')", [`${prefix}-event-${i}`,actor,article,receipt,occurred]);
   }
   // Invalid version is earlier in the same user's occurrence order, followed by valid work.
   await pool.query("insert into gamification_evidence_receipts (id,user_id,course_id,source,source_id,source_version,source_evidence_id,occurred_at,details) values ($1,$2,$3,'article',$4,'2',$5,$6,'{}')", [`${prefix}-bad-receipt`,actor,course,`${prefix}-article-0`,`${prefix}-bad-source`,new Date(occurred.getTime()-1000)]);
   await pool.query("insert into gamification_event_outbox (id,user_id,source,source_id,evidence_id,occurred_at,created_at) values ($1,$2,'article',$3,$4,$5,'1900-01-01')", [`${prefix}-bad-event`,actor,`${prefix}-article-0`,`${prefix}-bad-receipt`,new Date(occurred.getTime()-1000)]);
   const safeProcess = async (limit:number) => {
    const candidates=await pool.query("select user_id from gamification_event_outbox where status='pending' order by created_at,id limit $1", [limit]);
    assert.equal(candidates.rowCount,limit); assert(candidates.rows.every(row=>row.user_id===actor), 'Global outbox selection is not fixture-only');
    return app.processGamificationOutbox({limit});
   };
   assert.deepEqual(await safeProcess(6), {processed:5,rejected:1,failed:0});
   const status=await pool.query('select status,count(*)::int n from gamification_event_outbox where user_id=$1 group by status order by status',[actor]);
   assert.deepEqual(status.rows,[{status:'processed',n:5},{status:'rejected',n:1}]);
   const xp=await pool.query('select count(*)::int n, sum(base_xp_micro)::int base from gamification_xp_ledger where user_id=$1',[actor]); assert.deepEqual(xp.rows[0],{n:5,base:500000});
   const periods=await pool.query('select base_xp_micro::int base from gamification_leaderboard_periods where user_id=$1',[actor]); assert.equal(periods.rowCount,3); assert(periods.rows.every(r=>r.base===500000));
   const badge=await pool.query("select count::int count,tier::int tier from gamification_badges where user_id=$1 and family='warrior_reader'",[actor]); assert.equal(badge.rows[0].count,5); assert(badge.rows[0].tier>=1);
   const rewards=await pool.query("select count(*)::int n, coalesce(sum(amount),0)::int amount from gamification_lp_ledger where user_id=$1 and reward_key='badge:warrior_reader:1'",[actor]); assert.deepEqual(rewards.rows[0],{n:1,amount:25});
   assert.equal(Number((await pool.query('select count(*) n from gamification_qualified_days where user_id=$1',[actor])).rows[0].n),1);
   assert(Number((await pool.query('select count(*) n from gamification_missions where user_id=$1 and progress>0',[actor])).rows[0].n)>0);
   assert(Number((await pool.query("select count(*) n from gamification_lp_ledger where user_id=$1 and reason='mission'",[actor])).rows[0].n)>0);
   const reconciliation=await app.reconcileGamificationAccount(actor); assert(reconciliation.matches);
   // A fixture-only rejected sentinel makes the second invocation safe while replaying the processed rows.
   await pool.query("insert into gamification_event_outbox (id,user_id,source,source_id,evidence_id,occurred_at,created_at) values ($1,$2,'article',$3,$4,$5,'1900-01-01')", [`${prefix}-sentinel`,actor,`${prefix}-article-0`,`${prefix}-missing`,occurred]);
   assert.deepEqual(await safeProcess(1),{processed:0,rejected:1,failed:0});
   assert.deepEqual(await app.reconcileGamificationAccount(actor),reconciliation);
   assert.equal(Number((await pool.query('select count(*) n from gamification_xp_ledger where user_id=$1',[actor])).rows[0].n),5);
   console.log('PASS: actual article processor, invalid evidence isolation, replay, duplicate completion uniqueness, badge, missions, periods, reconciliation');
   // Direct approval is a fixture seed, outside approval-service coverage.
   const questionActor = `${prefix}-question`, fixtureQ = `${prefix}-q`, template = `${prefix}-template`, attempt = `${prefix}-attempt`, questionChecklist = `${prefix}-checklist-v2`;
   await pool.query('insert into "user" (id,name,email,role) values ($1,$2,$3,$4)', [questionActor,'Question fixture',`${questionActor}@example.invalid`,'student']);
   await pool.query('insert into pengguna (id) values ($1)', [questionActor]);
   await pool.query("insert into pengguna_peran (id,pengguna_id,peran_id,source) values ($1,$2,$3,'fixture')", [`${prefix}-question-role`,questionActor,role.rows[0].id]);
   await pool.query("insert into pendaftaran_murid (id,pengguna_id,mata_kuliah_id,status) values ($1,$2,$3,'active')", [`${prefix}-question-enrollment`,questionActor,course]);
   await pool.query("insert into courses (id,title,category) values ($1,'Fixture','Matematika')", [course]);
   await pool.query('update mata_kuliah set legacy_course_id=$1 where id=$1', [course]);
   await pool.query("insert into soal (id,mata_kuliah_id,question_type,prompt,options_snapshot,quiz_eligible,version,status,difficulty,cognitive_level,reasoning_pattern,generation_hash,creator_id,published_at) values ($1,$2,'multiple_choice','Fixture',$3::jsonb,true,1,'published','easy','remember','fixture','fixture',$4,$5)", [fixtureQ,course,JSON.stringify([{text:'A',isCorrect:true},{text:'B',isCorrect:false}]),questionActor,started]);
   await pool.query("insert into quiz_templates (id,course_id,title,category,selection_rules,status) values ($1,$2,'Fixture','daily','{}','published')", [template,course]);
   const q = {id:fixtureQ,prompt:'Fixture',options:['A','B'],stable_option_ids:[`option-${fixtureQ}-0`,`option-${fixtureQ}-1`],question_type:'multiple_choice',correct_indices:[0],gamificationProvenance:{marker:'canonical-objective-v1',canonicalQuestionId:fixtureQ,courseId:course,sourceVersion:'1',answerProof:{questionType:'multiple_choice',correctIndices:[0]}}};
   const answers = {[fixtureQ]:0};
   await pool.query("insert into student_quiz_attempts (id,student_id,template_id,status,questions_snapshot,answers_snapshot,started_at,submitted_at) values ($1,$2,$3,'completed',$4::jsonb,$5::jsonb,$6,$7)", [attempt,questionActor,template,JSON.stringify([q]),JSON.stringify(answers),started,occurred]);
   await pool.query("insert into gamification_checklists (id,course_id,version,status,total_xp_micro) values ($1,$2,2,'approved',20000000)", [questionChecklist,course]);
   await pool.query("insert into gamification_checklist_items (id,checklist_id,category,source_id,content_version,base_xp_micro) values ($1,$2,'question',$3,'1',20000000)", [`${prefix}-question-item`,questionChecklist,fixtureQ]);
   await pool.query('insert into gamification_course_starts (user_id,course_id,checklist_id,started_at) values ($1,$2,$3,$4)', [questionActor,course,questionChecklist,started]);
   const writeQuestion = () => app.db.transaction((tx:any) => app.writeQuestionRewards(tx,{userId:questionActor,attemptId:attempt,snapshot:[q],answers,occurredAt:occurred}));
   await writeQuestion();
   const fact = await pool.query('select correct,source_version,last_reveal_attempt_id,last_reveal_at from gamification_learning_facts where user_id=$1', [questionActor]);
   assert.deepEqual(fact.rows,[{correct:true,source_version:'1',last_reveal_attempt_id:null,last_reveal_at:null}]);
   assert.equal(Number((await pool.query('select count(*) n from gamification_question_exposure_initializations where user_id=$1 and question_id=$2', [questionActor,fixtureQ])).rows[0].n),1);
   assert.equal(Number((await pool.query('select count(*) n from gamification_question_exposures where user_id=$1', [questionActor])).rows[0].n),0);
   assert.equal(Number((await pool.query('select count(*) n from gamification_evidence_receipts where user_id=$1', [questionActor])).rows[0].n),1);
   await pool.query("update gamification_event_outbox set created_at='1900-01-01' where user_id=$1 and status='pending'", [questionActor]);
   const candidate = await pool.query("select user_id from gamification_event_outbox where status='pending' order by created_at,id limit 1");
   assert.equal(candidate.rowCount,1); assert.equal(candidate.rows[0].user_id,questionActor,'Global outbox selection is not fixture-only');
   assert.deepEqual(await app.processGamificationOutbox({limit:1}),{processed:1,rejected:0,failed:0});
   const questionXp = await pool.query('select count(*)::int n, sum(base_xp_micro)::int base from gamification_xp_ledger where user_id=$1', [questionActor]);
   assert.deepEqual(questionXp.rows[0],{n:1,base:20000000});
   const questionBadge = await pool.query("select count::int count from gamification_badges where user_id=$1 and family='practice_knight'", [questionActor]);
   assert.deepEqual(questionBadge.rows,[{count:1}]);
   await writeQuestion();
   assert.equal(Number((await pool.query('select count(*) n from gamification_evidence_receipts where user_id=$1', [questionActor])).rows[0].n),1);
   console.log('PASS: original question writer and processor, correct answer, empty exposure history, XP, badge, and writer retry');
   console.log('Session authentication stubbed and unverified; checklist approval service not exercised.');
  } finally {
   if (wrote) {
    const c = await pool.connect(); try { await c.query('begin');
     const actor = `${prefix}-processor`, course = `${prefix}-course`, checklist = `${prefix}-checklist`, questionActor = `${prefix}-question`;
     for (const table of ['gamification_xp_ledger','gamification_lp_ledger','gamification_badge_activities','gamification_badges','gamification_qualified_days','gamification_missions','gamification_leaderboard_periods','gamification_accounts','gamification_event_outbox','gamification_evidence_receipts','gamification_article_completions','gamification_course_starts','gamification_question_exposures','gamification_question_exposure_initializations','gamification_learning_facts']) await c.query(`delete from ${table} where user_id = any($1::text[])`,[[actor,questionActor]]);
     await c.query('delete from gamification_checklist_items where checklist_id = any($1::text[])',[[checklist,`${prefix}-checklist-v2`]]);
     await c.query('delete from gamification_checklists where id = any($1::text[])',[[checklist,`${prefix}-checklist-v2`]]);
     await c.query('delete from student_quiz_attempts where student_id=$1',[questionActor]);
     await c.query('delete from quiz_templates where id=$1',[`${prefix}-template`]);
     await c.query('delete from soal where id=$1',[`${prefix}-q`]);
     await c.query('update mata_kuliah set legacy_course_id=null where id=$1',[course]);
     await c.query('delete from courses where id=$1',[course]);
     await c.query('delete from artikel where mata_kuliah_id=$1',[course]);
     await c.query('delete from pendaftaran_murid where mata_kuliah_id=$1',[course]);
     await c.query('delete from mata_kuliah where id=$1',[course]);
     await c.query('delete from pengguna_peran where pengguna_id = any($1::text[])',[[actor,questionActor]]);
     await c.query('delete from pengguna where id = any($1::text[])',[[actor,questionActor]]);
     await c.query('delete from "user" where id=$1 and email=$2',[questionActor,`${questionActor}@example.invalid`]);
     await c.query('delete from "user" where id=$1 and email=$2',[actor,`${actor}@example.invalid`]);
     await c.query('delete from gamification_inventory where user_id = any($1::text[])', [ids]);
     await c.query('delete from gamification_lp_ledger where user_id = any($1::text[])', [ids]);
     await c.query('delete from gamification_cosmetics where id = any($1::text[])', [cosmetics]);
     await c.query('delete from "user" where id = any($1::text[]) and email like $2', [ids, `${prefix}%@example.invalid`]);
     await c.query('commit');
    } catch(e) { await c.query('rollback'); throw e; } finally { c.release(); }
    assert.deepEqual(await numericCounts(), before, 'Fixture cleanup count mismatch');
    console.log('PASS: all scoped fixture counts returned to zero');
   }
  }
 } finally { if (appPool) await appPool.end(); await pool.end(); }
}
main().catch((error) => { console.error('Staging check failed:', error?.code ?? error?.name ?? 'unknown', error?.code === 'MODULE_NOT_FOUND' ? String(error.message).split('\n')[0] : '', String(error?.stack ?? '').split('\n').filter((line: string) => line.includes('staging-transactions.ts:')).map((line: string) => line.trim()).join(' ')); process.exitCode = 1; });
