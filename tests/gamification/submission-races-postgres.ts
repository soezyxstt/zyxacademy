/** Guarded two-connection integration fixture. It commits synthetic rows so the
 * real route transactions can contend, then deletes only its unique fixture IDs.
 * Run after migration 0023 and history cutover, on the specified staging branch,
 * with RUN_SUBMISSION_RACES_STAGING=1 and DATABASE_URL supplied privately.
 * Session, media storage and external dispatch are isolated; access, grading,
 * authoring, dual-write, evidence and PostgreSQL locks use application code.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import pg from 'pg';
import { build } from 'esbuild';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { assertTarget } from '../../scripts/neon/import-core';
import { classifyJournal, PENDING } from '../../scripts/staging/gamification-migration-core';

const root = process.cwd();
const noopModules: Record<string, string> = {
 'server-only': '',
 'inngest': 'export class NonRetriableError extends Error {}; export class RetryAfterError extends Error {}; export class Inngest { async send(){} createFunction(){ return {} } }',
 'next/server': 'export class NextResponse extends Response { static json(body,init){ return Response.json(body,init) } }',
 'next/headers': 'export async function headers(){ return new Headers() }',
 '@/lib/auth': 'export const auth={api:{getSession:async()=>({user:{id:globalThis.__raceFixture.user,role:"student"}})}}',
 '@/lib/storage': 'export const storage=globalThis.__raceFixture.storage',
 '@/lib/question-images': 'export async function offloadQuestionItemImages(q){return q}; export async function offloadBase64ImagesToR2(q){return q}',
 '@/lib/vector-sync-dispatch': 'export async function dispatchVectorSync(){}',
 '@/lib/learning-events': 'export async function recordLearningEvents(){}',
 '@/lib/inngest': 'export const inngest={send:async()=>({})}',
 '@/lib/recommendation-service': 'export async function markRecommendationDone(){}; export async function buildPlanForConcepts(){return []}',
 '@/lib/option-stats': 'export async function recordQuestionOptionStats(){}',
 '@/lib/remediation': 'export async function buildRemediation(){return null}',
 '@/lib/pemahaman/evidence': 'export async function requestIdeaMasteryRecompute(){}',
};
async function bundle(actor: 'submit' | 'edit') {
 const entry = actor === 'submit'
  ? `export { POST as daily } from './app/api/quiz/daily/route'; export { POST as standard } from './app/api/quiz/attempts/[id]/route'; export { processGamificationOutbox } from './lib/gamification/processor';`
  : `export { updateCanonicalQuestion } from './lib/question-authoring'; export { stageInteractiveDocumentAssets } from './lib/materials/interactive-document-assets'; export { stageQuestionVisualBinding } from './lib/materials/question-visual-binding';`;
 const result = await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external', tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'fixture-boundaries', setup(b) {
  b.onResolve({ filter: /.*/ }, args => {
   if (args.path === '@/db' || args.path === '@/lib/db') return { path: `db-${actor}`, namespace: 'fixture' };
   if (args.path === './interactive-document-server' && args.resolveDir.endsWith('/lib/materials')) return { path: 'png-verifier', namespace: 'fixture' };
   if (Object.hasOwn(noopModules, args.path)) return { path: args.path, namespace: 'fixture' };
  });
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === `db-${actor}` ? `export const db=globalThis.__raceFixture.${actor}Db` : args.path === 'png-verifier' ? `import { verifyAdmittedInteractiveDocumentAsset } from './lib/materials/interactive-document-verified'; export async function verifyInteractiveDocumentAsset(spec,kind,bytes){ verifyAdmittedInteractiveDocumentAsset(spec,kind,bytes) }` : noopModules[args.path], loader: 'js', resolveDir: root }));
 }}] });
 return result.outputFiles[0].text;
}
function load(source: string, name: string) {
 const Module = require('node:module'); const mod = new Module(path.join(root, `${name}.cjs`), module);
 mod.filename = path.join(root, `${name}.cjs`); mod.paths = module.paths; mod._compile(source, mod.filename); return mod.exports;
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function timeout<T>(promise: Promise<T>, label: string): Promise<T> {
 let timer: ReturnType<typeof setTimeout>;
 return Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`TIMEOUT_${label}`)), 12000); })]).finally(() => clearTimeout(timer));
}

type Gate = { matches: (sql: string) => boolean; entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> };
function instrument(client: pg.Client, releases: Array<() => void>) {
 const query = client.query.bind(client) as any;
 let gate: Gate | null = null;
 (client as any).query = async (...args: any[]) => {
  const result = await query(...args);
  const statement = typeof args[0] === 'string' ? args[0] : args[0]?.text ?? '';
  if (gate && gate.matches(statement)) { const held = gate; gate = null; held.entered.resolve(); await timeout(held.release.promise, 'GATE'); }
  return result;
 };
 return (matches: Gate['matches']) => { assert.equal(gate, null); gate = { matches, entered: deferred(), release: deferred() }; releases.push(gate.release.resolve); return gate; };
}
function appDb(client: pg.Client) {
 const orm = drizzle(client);
 return Object.assign(orm, { transaction: async (fn: (tx: typeof orm) => Promise<unknown>) => {
  await client.query('begin');
  try { await client.query("set local lock_timeout='10s'"); await client.query("set local statement_timeout='20s'"); const result = await fn(orm); await client.query('commit'); return result; }
  catch (error) { await client.query('rollback'); throw error; }
 } });
}
const canonicalShare = (s: string) => /from "soal"/i.test(s) && /for share/i.test(s);
const canonicalUpdate = (s: string) => /from "soal"/i.test(s) && /for update/i.test(s);
const ideaRead = (s: string) => /from "soal_ide"/i.test(s) && /join "ide"/i.test(s);

async function main() {
 const [submitSource, editSource] = await Promise.all([bundle('submit'), bundle('edit')]);
 if (process.argv.includes('--compile')) {
  (globalThis as any).__raceFixture = { user: 'fixture', storage: {}, submitDb: {}, editDb: {} };
  load(submitSource, 'race-submit'); load(editSource, 'race-author');
  delete (globalThis as any).__raceFixture;
  console.log('PASS route and authoring fixture bundles load'); return;
 }
 const host = process.env.NEON_EXPECTED_HOST || '', url = process.env.DATABASE_URL || '';
 assertTarget(url, host, 'neondb');
 if (process.env.RUN_SUBMISSION_RACES_STAGING !== '1' || process.env.NEON_BRANCH_ID !== 'br-gentle-scene-azq0gp91' || !['ep-sparkling-lab-azrp3ymj.c-3.ap-southeast-1.aws.neon.tech','ep-sparkling-lab-azrp3ymj-pooler.c-3.ap-southeast-1.aws.neon.tech'].includes(host)) throw new Error('GUARDED_STAGING_REQUIRED');
 const migrations = readMigrationFiles({ migrationsFolder: 'drizzle-postgres' });
 if (migrations.length !== 24 || migrations[23]?.hash !== PENDING[7][1]) throw new Error('LOCAL_MIGRATION_MISMATCH');
 const prefix = `zyx-submit-race-${randomUUID()}`;
 const user = `${prefix}-user`, course = `${prefix}-course`, chapter = `${prefix}-chapter`, idea = `${prefix}-idea`, checklist = `${prefix}-checklist`;
 const submit = new pg.Client({ connectionString: url }), edit = new pg.Client({ connectionString: url }), control = new pg.Client({ connectionString: url });
 const objects = new Map<string, Uint8Array>();
 const storage = { exists: async (key: string) => objects.has(key), upload: async (bytes: Uint8Array, _name: string, _type: string, options: { key: string }) => { objects.set(options.key, bytes); }, download: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw new Error('FIXTURE_ASSET_MISSING'); return bytes; } };
 let seeded = false;
 let server: Server | undefined;
 const releases: Array<() => void> = [];
 try {
  await Promise.all([submit.connect(), edit.connect(), control.connect()]);
  await control.query('begin read only');
  const preflight = await control.query("select current_database() db, current_setting('transaction_read_only') ro, exists(select 1 from gamification_question_history_cutover where id='v1') ready");
  const journal = await control.query('select created_at,hash from drizzle.__drizzle_migrations order by created_at,id');
  if (preflight.rows[0]?.db !== 'neondb' || preflight.rows[0]?.ro !== 'on' || !preflight.rows[0]?.ready || classifyJournal(journal.rows) !== 'complete') throw new Error('PREFLIGHT_FAILED');
  await control.query('commit');
  const setSubmitGate = instrument(submit,releases), setEditGate = instrument(edit,releases);
  (globalThis as any).__raceFixture = { user, storage, submitDb: appDb(submit), editDb: appDb(edit) };
  const routes = load(submitSource, 'race-submit'), author = load(editSource, 'race-author');
  // Loopback HTTP transport exercises the actual exported route handlers. Next's
  // request context and session are isolated because this is not a Next server.
  server = createServer(async (incoming, outgoing) => {
   try {
    const chunks: Buffer[] = []; for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const url = incoming.url ?? '/', request = new Request(`http://127.0.0.1${url}`, { method: incoming.method, headers: { 'content-type': 'application/json' }, body: Buffer.concat(chunks) });
    const match = /^\/api\/quiz\/attempts\/([^/]+)$/.exec(url);
    const response: Response = url === '/api/quiz/daily' ? await routes.daily(request) : match ? await routes.standard(request,{params:Promise.resolve({id:match[1]})}) : new Response(null,{status:404});
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
   } catch { outgoing.writeHead(500); outgoing.end(); }
  });
  await new Promise<void>((resolve, reject) => { server!.once('error', reject); server!.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); assert(address && typeof address !== 'string');
  const post = (url: string, body: unknown) => fetch(`http://127.0.0.1:${address.port}${url}`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
  const pids = { submit: Number((await submit.query('select pg_backend_pid() pid')).rows[0].pid), edit: Number((await edit.query('select pg_backend_pid() pid')).rows[0].pid) };
  const waitBlocked = async (pid: number, blocker: number) => {
   const deadline = Date.now() + 10000;
   while (Date.now() < deadline) { if ((await control.query('select $2::int = any(pg_blocking_pids($1)) blocked', [pid, blocker])).rows[0].blocked) return; await new Promise<void>(r => setImmediate(r)); }
   throw new Error('EXPECTED_POSTGRES_ROW_WAIT');
  };
  await control.query('begin'); seeded = true;
  await control.query('insert into "user" (id,name,email,role) values ($1,$1,$2,\'student\')', [user,`${user}@example.invalid`]);
  await control.query('insert into pengguna (id) values ($1)', [user]);
  const role = await control.query("select id from peran where code='murid'"); assert.equal(role.rowCount, 1);
  await control.query("insert into pengguna_peran (id,pengguna_id,peran_id,source) values ($1,$2,$3,'fixture')", [`${prefix}-role`,user,role.rows[0].id]);
  await control.query("insert into courses (id,title,category) values ($1,'Fixture','Matematika')",[course]);
  await control.query("insert into mata_kuliah (id,code,title,status,is_demo,legacy_course_id) values ($1,$1,'Fixture','active',false,$1)",[course]);
  await control.query("insert into bab (id,mata_kuliah_id,code,title,order_index,status) values ($1,$2,$1,'Fixture',0,'active')",[chapter,course]);
  await control.query("insert into pendaftaran_murid (id,pengguna_id,mata_kuliah_id,status) values ($1,$2,$3,'active')",[`${prefix}-enrollment`,user,course]);
  await control.query("insert into ide (id,mata_kuliah_id,bab_id,stable_key,code,canonical_statement,concise_explanation,difficulty_metadata,version,status,semantic_hash,generation_hash,creator_id) values ($1,$2,$3,$1,$1,'Fixture','Fixture','{}',1,'published','fixture','fixture',$4)",[idea,course,chapter,user]);
  await control.query("insert into gamification_checklists (id,course_id,version,status,total_xp_micro) values ($1,$2,1,'approved',20000000)",[checklist,course]);
  await control.query("insert into gamification_course_starts (user_id,course_id,checklist_id,started_at) values ($1,$2,$3,now()-interval '1 day')",[user,course,checklist]);
  await control.query('commit');
  const html = Buffer.from('<!doctype html><button>Fixture</button>');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64');
  const hash = (v: Uint8Array) => createHash('sha256').update(v).digest('hex');
  const visual = { id:'fixture',kind:'interactive_document',version:1,label:'Fixture',description:'Fixture',documentSha256:hash(html),documentBytes:html.length,printSha256:hash(png),printBytes:png.length,height:400,staticFallback:{type:'text',summary:'Fixture',content:'Fixture'},printCaption:'Fixture' };
  const prompt = `\`\`\`zyx-visual\n${JSON.stringify(visual)}\n\`\`\``;
  const original = { prompt,options:['A','B'],correctIndices:[0],acceptableAnswers:[],explanation:'A',difficulty:'easy',questionType:'multiple_choice',cognitiveLevel:'understand',reasoningPattern:'fixture',tags:[],courseId:course,ideaLinks:[{ideaId:idea,weight:1,role:'primary'}],reviewStatus:'published' };
  await author.stageInteractiveDocumentAssets([{spec:visual,document:html,print:png}]);
  await author.stageQuestionVisualBinding(course,original,[{spec:visual,document:html,print:png}]);
  async function seedQuestion(id: string, template: string) {
   await control.query("insert into quiz_templates (id,course_id,title,category,selection_rules,status,manual_status) values ($1,$2,'Fixture','daily','{}','published','open')",[template,course]);
   await control.query("insert into blueprint_asesmen (id,mata_kuliah_id,title,assessment_type,blueprint,status,generation_hash,creator_id) values ($1,$2,'Fixture','quiz','{}','approved','fixture',$3)",[`${template}-blueprint`,course,user]);
   await control.query("insert into asesmen (id,blueprint_asesmen_id,mata_kuliah_id,title,assessment_type,status,generation_hash,creator_id) values ($1,$2,$3,'Fixture','quiz','published','fixture',$4)",[template,`${template}-blueprint`,course,user]);
   await control.query("insert into soal (id,mata_kuliah_id,bab_id,question_type,prompt,options_snapshot,quiz_eligible,version,status,difficulty,cognitive_level,reasoning_pattern,generation_hash,creator_id,published_at) values ($1,$2,$3,'multiple_choice',$4,$5::jsonb,true,1,'published','easy','understand','fixture','fixture',$6,now())",[id,course,chapter,prompt,JSON.stringify([{id:'option-01',text:'A',isCorrect:true},{id:'option-02',text:'B',isCorrect:false}]),user]);
   await control.query("insert into ai_question_bank (id,course_id,origin,quiz_eligible,generation_hash,status,is_stale,difficulty,question_type,tags,prompt,options,correct_indices,acceptable_answers,explanation,review_status) values ($1,$2,'zyx_original',true,'fixture','active',false,'easy','multiple_choice','[]',$3,'[\"A\",\"B\"]','[0]','[]','A','published')",[id,course,prompt]);
   await control.query("insert into pembahasan_soal (id,soal_id,version,content,status,generation_hash,creator_id) values ($1,$2,1,'A','published','fixture',$3)",[`${id}-solution`,id,user]);
   await control.query("insert into soal_ide (id,soal_id,ide_id,weight,role) values ($1,$2,$3,1,'primary')",[`${id}-link`,id,idea]);
   await control.query("insert into gamification_checklist_items (id,checklist_id,category,source_id,content_version,base_xp_micro) values ($1,$2,'question',$3,'1',100000)",[`${id}-item`,checklist,id]);
  }
  async function processFixtureEvent(id: string, expected: { processed: number; rejected: number; failed: number }) {
   await control.query("update gamification_event_outbox set created_at='1900-01-01' where user_id=$1 and source_id=$2 and status='pending'",[user,id]);
   const next = await control.query("select user_id,source_id from gamification_event_outbox where status='pending' order by created_at,id limit 1");
   assert.equal(next.rows[0]?.user_id,user); assert.equal(next.rows[0]?.source_id,id);
   assert.deepEqual(await routes.processGamificationOutbox({limit:1}),expected);
  }
  for (const first of ['submit','edit'] as const) {
   const id = `${prefix}-daily-${first}`, template = `${id}-template`; await seedQuestion(id,template);
   const before = { ...original, prompt: `${prompt}\n\nEdited` };
   const gate = first === 'submit' ? setSubmitGate(canonicalShare) : setEditGate(canonicalUpdate);
   const startSubmit = () => post('/api/quiz/daily', {templateId:template,questionIds:[id],answers:{[id]:0}});
   const startEdit = () => author.updateCanonicalQuestion(before,user,id);
   const winner = first === 'submit' ? startSubmit() : startEdit(); await timeout(gate.entered.promise,'FIRST_LOCK');
   const loser = first === 'submit' ? startEdit() : startSubmit();
   // Edit-first must have finished its initial unlocked read and retained asset load;
   // submit-first reaches the real authoring FOR UPDATE and blocks on the row.
   if (first === 'submit') await waitBlocked(pids.edit,pids.submit);
   else await waitBlocked(pids.submit,pids.edit);
   gate.release.resolve();
   const [a,b] = await timeout(Promise.all([winner,loser]),'DAILY_EDIT');
   const response = (first === 'submit' ? a : b) as Response, edited = first === 'submit' ? b : a;
   assert.equal(response.status,200); const body = await response.json() as any; assert.equal(body.score,100); assert.equal(body.correct,1); assert.equal(edited.version,2);
   const facts = await control.query('select source_version from gamification_learning_facts where user_id=$1 and source_id=$2',[user,id]);
   assert.deepEqual(facts.rows.map(r=>r.source_version),first === 'submit' ? ['1'] : []);
   assert.equal(Number((await control.query('select count(*) n from gamification_question_exposure_projection where user_id=$1 and course_id=$2 and question_id=$3',[user,course,id])).rows[0].n),1);
   if (first === 'submit') await processFixtureEvent(id,{processed:0,rejected:1,failed:0});
   assert.equal(Number((await control.query('select count(*) n from gamification_xp_ledger where user_id=$1',[user])).rows[0].n),0);
  }
  for (const first of ['delete','submit'] as const) {
   const id = `${prefix}-standard-${first}`, template = `${id}-template`, attempt = `${id}-attempt`; await seedQuestion(id,template);
   const snapshot = [{id,prompt,question_type:'multiple_choice',options:['A','B'],stable_option_ids:['option-01','option-02'],correct_indices:[0],gamificationProvenance:{marker:'canonical-objective-v1',canonicalQuestionId:id,courseId:course,sourceVersion:'1',answerProof:{questionType:'multiple_choice',correctIndices:[0]}}}];
   await control.query("insert into student_quiz_attempts (id,student_id,template_id,status,questions_snapshot,started_at) values ($1,$2,$3,'in_progress',$4::jsonb,now()-interval '1 minute')",[attempt,user,template,JSON.stringify(snapshot)]);
   const startSubmit = () => post(`/api/quiz/attempts/${attempt}`,{answers:{[id]:0}});
   if (first === 'delete') {
    const read = setSubmitGate(ideaRead); const pending = startSubmit(); await timeout(read.entered.promise,'MAPPING_READ');
    await edit.query('begin'); await edit.query("set local lock_timeout='10s'");
    await edit.query('delete from soal where id=$1',[id]);
    read.release.resolve(); await waitBlocked(pids.submit,pids.edit); await edit.query('commit');
    const response = await timeout(pending,'STANDARD_DELETE'); assert.equal(response.status,200); assert.equal((await response.json() as any).score,100);
   } else {
    const lock = setSubmitGate(canonicalShare); const pending = startSubmit(); await timeout(lock.entered.promise,'SUBMISSION_LOCK');
    await edit.query('begin'); await edit.query("set local lock_timeout='10s'");
    const deletion = assert.rejects(timeout(edit.query('delete from soal where id=$1',[id]),'DELETE_FK'), (error: any) => error.code === '23503'); await waitBlocked(pids.edit,pids.submit);
    lock.release.resolve(); const response = await timeout(pending,'STANDARD_SUBMIT'); assert.equal(response.status,200); assert.equal((await response.json() as any).score,100);
    await deletion; await edit.query('rollback');
   }
   const actual = await control.query('select status,score from student_quiz_attempts where id=$1',[attempt]); assert.equal(actual.rows[0]?.status,'completed'); assert.equal(Number(actual.rows[0]?.score),100);
   const facts = await control.query('select source_version from gamification_learning_facts where user_id=$1 and source_id=$2',[user,id]);
   assert.deepEqual(facts.rows.map(r=>r.source_version),first === 'submit' ? ['1'] : []);
   assert.equal(Number((await control.query('select count(*) n from gamification_question_exposure_projection where user_id=$1 and course_id=$2 and question_id=$3',[user,course,id])).rows[0].n),1);
   const tombstones = await control.query('select count(*)::int n from gamification_question_bank_disclosures where user_id=$1 and course_id=$2 and question_id=$3',[user,course,id]);
   assert.equal(tombstones.rows[0].n,first === 'delete' ? 1 : 0);
   const evidence = await control.query('select i.soal_id,i.content_version,b.ide_id from item_asesmen i join jawaban_murid j on j.item_asesmen_id=i.id join bukti_ide_jawaban b on b.jawaban_murid_id=j.id where i.asesmen_id=$1',[template]);
   const items = await control.query('select count(*)::int n from item_asesmen where asesmen_id=$1',[template]);
   assert.equal(items.rows[0].n,first === 'submit' ? 1 : 0);
   assert.equal(evidence.rowCount,first === 'submit' ? 1 : 0);
   if (first === 'submit') assert.equal(evidence.rows[0].soal_id,id), assert.equal(evidence.rows[0].ide_id,idea), assert.equal(Number(evidence.rows[0].content_version),1);
   if (first === 'submit') await processFixtureEvent(id,{processed:1,rejected:0,failed:0});
   assert.equal(Number((await control.query('select count(*) n from gamification_xp_ledger where user_id=$1',[user])).rows[0].n),first === 'submit' ? 1 : 0);
  }
  console.log('PASS actual daily route versus retained-visual edit and standard route versus delete, both lock orders');
 } finally {
  releases.forEach(release => release());
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await Promise.all([submit.query('rollback').catch(()=>{}),edit.query('rollback').catch(()=>{})]);
  if (seeded) {
   await control.query('rollback').catch(()=>{}); await control.query('begin');
   try {
    for (const table of ['notifications','gamification_xp_ledger','gamification_lp_ledger','gamification_badge_activities','gamification_badges','gamification_qualified_days','gamification_missions','gamification_leaderboard_periods','gamification_event_outbox','gamification_evidence_receipts','gamification_learning_facts','gamification_question_exposures','gamification_question_exposure_initializations','gamification_question_exposure_projection','gamification_question_exposure_observations','gamification_question_bank_disclosures','gamification_question_legacy_index','gamification_course_starts','gamification_accounts']) await control.query(`delete from ${table} where user_id=$1`,[user]);
    await control.query('delete from bukti_ide_jawaban where jawaban_murid_id in (select j.id from jawaban_murid j join percobaan_asesmen p on p.id=j.percobaan_asesmen_id where p.pengguna_id=$1)',[user]);
    await control.query('delete from jawaban_murid where percobaan_asesmen_id in (select id from percobaan_asesmen where pengguna_id=$1)',[user]);
    await control.query('delete from item_asesmen where asesmen_id like $1',[`${prefix}%`]);
    await control.query('delete from percobaan_asesmen where pengguna_id=$1',[user]);
    await control.query('delete from audit_mutasi where actor_id=$1',[user]);
    await control.query('delete from vector_sync_queue where course_id=$1',[course]);
    await control.query('delete from student_quiz_attempts where student_id=$1',[user]);
    await control.query('delete from asesmen where id like $1',[`${prefix}%`]);
    await control.query('delete from blueprint_asesmen where id like $1',[`${prefix}%`]);
    await control.query('delete from quiz_templates where id like $1',[`${prefix}%`]);
    await control.query('delete from gamification_checklist_items where checklist_id=$1',[checklist]);
    await control.query('delete from gamification_checklists where id=$1',[checklist]);
    await control.query('delete from ai_question_bank where id like $1',[`${prefix}%`]);
    await control.query('delete from soal where id like $1',[`${prefix}%`]);
    await control.query('delete from ide where id=$1',[idea]);
    await control.query('delete from bab where id=$1',[chapter]);
    await control.query('delete from pendaftaran_murid where pengguna_id=$1',[user]);
    await control.query('delete from mata_kuliah where id=$1',[course]); await control.query('delete from courses where id=$1',[course]);
    await control.query('delete from pengguna_peran where pengguna_id=$1',[user]); await control.query('delete from pengguna where id=$1',[user]); await control.query('delete from "user" where id=$1 and email=$2',[user,`${user}@example.invalid`]);
    await control.query('commit');
    assert.equal(Number((await control.query('select count(*) n from "user" where id=$1',[user])).rows[0].n),0);
   } catch (e) { await control.query('rollback'); throw e; }
  }
  delete (globalThis as any).__raceFixture; await Promise.all([submit.end(),edit.end(),control.end()]);
 }
}
main().catch(error => { console.error('SUBMISSION_RACE_FIXTURE_FAILED', process.argv.includes('--compile') ? error : error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'FIXTURE_OR_DATABASE_ERROR'); process.exitCode = 1; });
