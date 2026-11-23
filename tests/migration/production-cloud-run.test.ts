import { describe, expect, test } from 'bun:test';
import { COSMETIC_CATALOG } from '../../lib/gamification/catalog';
import { EXPECTED_JOURNAL } from '../../scripts/staging/gamification-migration-core';
import { LEGACY_INDEX_BACKFILL_SQL, PROJECTION_BACKFILL_SQL } from '../../scripts/staging/question-history-backfill-core';
import { assertDefinitions, assertEnvironment, assertFiles, BASELINE, classifyJournal, FILES, parseArguments, planCatalog, PRODUCTION_BRANCH, PRODUCTION_HOST, type CosmeticRow } from '../../scripts/production/cloud-run-migration-core';
import { BASELINE_INDEXES, FINAL_CONSTRAINTS, FINAL_INDEXES, loadMigrations, runMigration, type SqlClient } from '../../scripts/production/cloud-run-migration';

const migrations = loadMigrations();
const rows = (complete = false) => [...BASELINE, ...(complete ? FILES.slice(9).map(([time, , hash]) => [time, hash] as const) : [])]
 .map(([created_at, hash], i) => ({ id: i + 41, created_at: String(created_at), hash }));
const entries = () => FILES.map(([when, tag], idx) => ({ idx, when, tag, version: '7', breakpoints: true }));
const names = FILES.map(([, tag]) => `${tag}.sql`);
const metadata = {
 sourceHost: PRODUCTION_HOST, sourceBranchId: PRODUCTION_BRANCH, sourceDatabase: 'neondb',
 targetHost: PRODUCTION_HOST, targetBranchId: PRODUCTION_BRANCH, targetDatabase: 'neondb', disposable: false,
};
const environment = {
 DATABASE_URL: `postgresql://offline:offline@${PRODUCTION_HOST}/neondb?sslmode=verify-full`,
 NEON_EXPECTED_HOST: PRODUCTION_HOST, NEON_BRANCH_ID: PRODUCTION_BRANCH, NEON_EXPECTED_DATABASE: 'neondb',
 PRODUCTION_MIGRATION_WRITERS_FENCED: '1',
};
const catalogRows = (): CosmeticRow[] => COSMETIC_CATALOG.map(item => ({ id: item.id, name: item.name, slot: item.slot, price_lp: String(item.priceLp), active: item.active }));

describe('production baseline and checked-in bytes', () => {
 test('preserves the nine real historical entries, including the production-only hash', () => {
  expect(BASELINE).toHaveLength(9);
  expect(BASELINE.filter((entry, i) => entry[1] !== EXPECTED_JOURNAL[i][1]).map(([time]) => time)).toEqual([1793788961145]);
  expect(BASELINE[3][1]).toBe('b3fb00e1bae1ba8c2ab0257df60bd68651917283f4dc6cc05ff3257ff497c263');
  expect(classifyJournal(rows())).toBe('pending');
  expect(classifyJournal(rows(true))).toBe('complete');
  for (const invalid of [rows().slice(0, 8), rows(true).slice(0, 11), rows(true).slice(0, 36), rows(true).slice(0, 37), rows(true).slice(0, 38), [...rows(true), rows()[0]],
   rows().reverse(), rows().map((row, i) => i === 3 ? { ...row, hash: EXPECTED_JOURNAL[3][1] } : row),
   rows().map((row, i) => i === 4 ? rows()[3] : row)]) expect(() => classifyJournal(invalid)).toThrow('UNEXPECTED_MIGRATION_HISTORY');
 });
 test('pins all 41 Git SQL blobs and timestamps, independent of checkout line endings', () => {
  expect(migrations).toHaveLength(41);
  expect(migrations.slice(9).map(m => m.tag)).toEqual(FILES.slice(9).map(([, tag]) => tag));
  expect(migrations[35].sql).toContain('CREATE TABLE "queue_task_checkpoints"');
  expect(migrations[36].sql).toContain('"equipped_pet_suit_id"');
  const hashes = migrations.map(m => m.hash);
  assertFiles(entries(), hashes, names);
  for (const index of [0, 3, 9, 35, 36, 37, 38]) {
   const changed = [...hashes]; changed[index] = 'edited';
   expect(() => assertFiles(entries(), changed, names)).toThrow();
   const altered = entries(); altered[index].when++;
   expect(() => assertFiles(altered, hashes, names)).toThrow();
  }
  const altered = entries(); altered[9].tag = '0009_polite_wendigo';
  expect(() => assertFiles(altered, hashes, names)).toThrow();
  expect(() => assertFiles(entries().slice(1), hashes, names)).toThrow();
  expect(() => assertFiles(entries(), hashes, [...names, '0037_extra.sql'])).toThrow();
 });
});

describe('target and mode gates, no connections', () => {
 test('requires exactly one explicit mode and independent metadata', () => {
  expect(parseArguments(['--check', '--source-metadata', 'inventory.json'])).toEqual({ mode: 'check', metadataPath: 'inventory.json' });
  for (const args of [[], ['--apply'], ['--apply', '--check', 'x'], ['--apply', '--source-metadata', 'x', '--force']]) expect(() => parseArguments(args)).toThrow();
  expect(() => assertEnvironment('apply', environment, metadata)).not.toThrow();
  expect(() => assertEnvironment('check', { ...environment, PRODUCTION_MIGRATION_WRITERS_FENCED: undefined }, metadata)).not.toThrow();
  expect(() => assertEnvironment('apply', { ...environment, PRODUCTION_MIGRATION_WRITERS_FENCED: undefined }, metadata)).toThrow('WRITERS_FENCED_REQUIRED');
  for (const m of [undefined, {}, { ...metadata, sourceBranchId: 'br-wrong' }, { ...metadata, targetBranchId: 'br-wrong' }, { ...metadata, sourceHost: 'other.neon.tech' }]) expect(() => assertEnvironment('check', environment, m)).toThrow();
 });
 test('accepts production direct/pooler only and rejects URL overrides and staging', () => {
  const host = PRODUCTION_HOST.replace('.c-3.', '-pooler.c-3.');
  expect(() => assertEnvironment('apply', { ...environment, DATABASE_URL: environment.DATABASE_URL.replace(PRODUCTION_HOST, host), NEON_EXPECTED_HOST: host }, { ...metadata, targetHost: host })).not.toThrow();
  for (const url of [environment.DATABASE_URL.replace('verify-full', 'require'), environment.DATABASE_URL + '&host=other.neon.tech', environment.DATABASE_URL + '&sslmode=disable', environment.DATABASE_URL.replace('/neondb', '/other'), environment.DATABASE_URL.replace(PRODUCTION_HOST, 'ep-other.c-3.ap-southeast-1.aws.neon.tech')]) expect(() => assertEnvironment('check', { ...environment, DATABASE_URL: url }, metadata)).toThrow();
  expect(() => assertEnvironment('check', { ...environment, NEON_BRANCH_ID: 'br-gentle-scene-azq0gp91' }, metadata)).toThrow();
 });
 test('rehearsal requires distinct disposable pins plus production-source branch inventory', () => {
  const host = 'ep-disposable-clone.c-3.ap-southeast-1.aws.neon.tech';
  const branch = 'br-disposable-clone';
  const env = { ...environment, DATABASE_URL: environment.DATABASE_URL.replace(PRODUCTION_HOST, host), NEON_EXPECTED_HOST: host, NEON_BRANCH_ID: branch, PRODUCTION_MIGRATION_DISPOSABLE: '1' };
  const m = { ...metadata, targetHost: host, targetBranchId: branch, disposable: true, parentBranchId: PRODUCTION_BRANCH };
  expect(() => assertEnvironment('rehearse', env, m)).not.toThrow();
  expect(() => assertEnvironment('apply', env, m)).toThrow();
  expect(() => assertEnvironment('rehearse', environment, { ...metadata, disposable: true, parentBranchId: PRODUCTION_BRANCH })).toThrow();
  for (const changed of [{ ...m, disposable: false }, { ...m, parentBranchId: 'br-other' }, { ...m, sourceDatabase: 'other' }, { ...m, targetHost: PRODUCTION_HOST }]) expect(() => assertEnvironment('rehearse', env, changed)).toThrow();
  expect(() => assertEnvironment('rehearse', { ...env, PRODUCTION_MIGRATION_DISPOSABLE: undefined }, m)).toThrow();
 });
});

test('catalog reuses current definitions, allows only the existing retirement, and rejects drift', () => {
 expect(planCatalog([], COSMETIC_CATALOG).insert).toHaveLength(COSMETIC_CATALOG.length);
 expect(planCatalog(catalogRows(), COSMETIC_CATALOG)).toEqual({ insert: [], retire: [] });
 const old = catalogRows().map(row => row.id === 'zyra-avatar-komodo' ? { ...row, active: true } : row);
 expect(planCatalog(old, COSMETIC_CATALOG).retire).toEqual(['zyra-avatar-komodo']);
 for (const changed of [catalogRows().map((row, i) => i ? row : { ...row, price_lp: 1 }), catalogRows().map((row, i) => i ? row : { ...row, active: false }), [...catalogRows(), { ...catalogRows()[0], id: 'unknown' }]]) expect(() => planCatalog(changed, COSMETIC_CATALOG)).toThrow('CATALOG_CONFLICT');
});

class OfflineClient implements SqlClient {
 calls: Array<{ text: string; values?: unknown[] }> = [];
 ledger = rows();
 cosmetics: CosmeticRow[] = [];
 ready = false;
 complete = false;
 failOn = '';
 invalidDefinition = false;
 invalidColumns = false;
 partialSchema = false;
 partialCutover = false;
 invalidPrerequisites = false;
 database = 'neondb';
 snapshot = '';
 async query(text: string, values?: unknown[]) {
  this.calls.push({ text, values });
  if (this.failOn && text.includes(this.failOn)) throw new Error('INJECTED_FAILURE');
  const result = (data: Record<string, unknown>[] = []) => ({ rows: data });
  if (text.startsWith('begin')) this.snapshot = JSON.stringify({ ledger: this.ledger, cosmetics: this.cosmetics, ready: this.ready, complete: this.complete });
  if (text === 'rollback') Object.assign(this, JSON.parse(this.snapshot));
  if (text.includes('current_database()')) return result([{ database: this.database }]);
  if (text.startsWith('select relname from pg_class')) return result([{ relname: 'student_quiz_attempts' }, { relname: 'review_item_bundle' }]);
  if (text.startsWith('select id, created_at, hash')) return result(structuredClone(this.ledger));
  if (text.includes('production:indexes') || text.includes('production:constraints')) {
   const defs = text.includes('production:constraints') ? FINAL_CONSTRAINTS : this.complete ? FINAL_INDEXES : BASELINE_INDEXES;
   return result(Object.entries(defs).map(([name, definition], i) => ({ name, definition, valid: !(this.invalidDefinition && i === 0) })));
  }
  if (text.includes('production:tables')) return result(this.complete ? (values![0] as string[]).map(name => ({ name })) : this.partialSchema ? [{ name: 'queue_task_checkpoints' }] : []);
  if (text.includes('production:columns')) return result([{ valid: !this.invalidColumns }]);
  if (text.includes('production:prerequisites')) return result([{ valid: !this.invalidPrerequisites }]);
  if (text.includes('production:cutover-counts')) return result([{ ready: 0, projections: this.partialCutover ? 1 : 0, observations: 0, legacy: 0 }]);
  if (text.startsWith('select id, name, slot')) return result(this.cosmetics);
  if (text.startsWith('select id, completed_at')) return result(this.ready ? [{ id: 'v1', completed_at: '2026-11-20T00:00:00Z' }] : []);
  if (text.startsWith('insert into drizzle.')) {
   this.ledger.push({ id: this.ledger.length + 41, created_at: String(values![1]), hash: String(values![0]) });
   if (this.ledger.length === FILES.length) this.complete = true;
  }
  if (text.startsWith('insert into public.gamification_cosmetics')) {
   const [id, name, slot, price_lp, active] = values as [string, string, string, number, boolean];
   this.cosmetics.push({ id, name, slot, price_lp, active });
  }
  if (text.startsWith('insert into public.gamification_question_history_cutover')) this.ready = true;
  if (text.includes('production:summary')) return result([{ attempts: '10', projections: '0', legacy: '25', cosmetics: String(this.cosmetics.length) }]);
  return result();
 }
}

describe('offline transaction protocol, not PostgreSQL execution', () => {
 test('check is read only, acquires share locks, and emits no SQL/seed/ledger writes', async () => {
  const client = new OfflineClient();
  expect(await runMigration(client, 'check', migrations)).toMatchObject({ state: 'pending', migrations: 32 });
  expect(client.calls[0].text).toBe('begin isolation level repeatable read read only');
  expect(client.calls.some(c => c.text.startsWith('lock table') && c.text.includes('access share mode'))).toBe(true);
  expect(client.calls.some(c => /^(insert|update|alter|create|drop)/i.test(c.text))).toBe(false);
  expect(client.calls.at(-1)?.text).toBe('rollback');
 });
 test('apply executes unchanged 0009..0040, appends true timestamps/hashes, backfills, seeds, and preserves every historical row', async () => {
  const client = new OfflineClient();
  const before = structuredClone(client.ledger);
  expect(await runMigration(client, 'apply', migrations)).toMatchObject({ state: 'applied', migrations: 32 });
  expect(client.ledger.slice(0, 9)).toEqual(before);
  expect(classifyJournal(client.ledger)).toBe('complete');
  const writes = client.calls.filter(c => c.text.startsWith('insert into drizzle.'));
  expect(writes.map(c => c.values)).toEqual(migrations.slice(9).map(m => [m.hash, m.when]));
  const emitted = client.calls.map(c => c.text);
  for (const m of migrations.slice(9)) for (const statement of m.sql.split('--> statement-breakpoint').filter(s => s.trim())) expect(emitted).toContain(statement);
  expect(emitted).toContain(LEGACY_INDEX_BACKFILL_SQL);
  expect(emitted).toContain(PROJECTION_BACKFILL_SQL);
  expect(emitted).toContain("set local lock_timeout = '10s'");
  expect(emitted).toContain("set local statement_timeout = '10min'");
  expect(emitted.findIndex(s => s.startsWith('lock table'))).toBeLessThan(emitted.findIndex(s => s.startsWith('select id, created_at')));
  expect(emitted.some(s => s.includes('pg_advisory_xact_lock'))).toBe(true);
  expect(emitted.at(-1)).toBe('commit');
  expect(client.cosmetics).toHaveLength(COSMETIC_CATALOG.length);
 });
 test('rehearsal rolls back successful DDL, backfill, seed, marker, and ledger work', async () => {
  const client = new OfflineClient();
  expect(await runMigration(client, 'rehearse', migrations)).toMatchObject({ state: 'rehearsed and rolled back' });
  expect(client.ledger).toEqual(rows());
  expect(client.cosmetics).toEqual([]);
  expect(client.ready).toBe(false);
  expect(client.calls.some(c => c.text === 'commit')).toBe(false);
 });
 test('an exact complete rerun verifies schema/marker/catalog and never rewrites or backfills', async () => {
  for (const mode of ['check', 'rehearse', 'apply'] as const) {
   const client = new OfflineClient();
   client.ledger = rows(true); client.complete = true; client.ready = true; client.cosmetics = catalogRows();
   expect(await runMigration(client, mode, migrations)).toMatchObject({ state: 'already complete', migrations: 0 });
   expect(client.calls.some(c => /^(insert|update|alter|create|drop)/i.test(c.text))).toBe(false);
  }
 });
 test('SQL and verification failures roll back instead of claiming readiness', async () => {
  for (const failure of ['CREATE TABLE "gamification_accounts"', 'ADD COLUMN "equipped_pet_suit_id"', LEGACY_INDEX_BACKFILL_SQL, PROJECTION_BACKFILL_SQL, 'insert into public.gamification_cosmetics', 'insert into public.gamification_question_history_cutover']) {
   const client = new OfflineClient(); client.failOn = failure;
   await expect(runMigration(client, 'apply', migrations)).rejects.toThrow('INJECTED_FAILURE');
   expect(client.ledger).toEqual(rows());
   expect(client.ready).toBe(false);
   expect(client.calls.at(-1)?.text).toBe('rollback');
  }
 });
 test('rejects altered SQL before opening a transaction, and database/lock failures before DDL', async () => {
  const altered = migrations.map((m, i) => i === 9 ? { ...m, sql: m.sql + '\n' } : m);
  const client = new OfflineClient();
  await expect(runMigration(client, 'apply', altered)).rejects.toThrow('UNEXPECTED_LOCAL_MIGRATION_CHAIN');
  expect(client.calls).toEqual([]);
  for (const issue of ['database', 'lock']) {
   const failed = new OfflineClient();
   if (issue === 'database') failed.database = 'other'; else failed.failOn = 'lock table';
   await expect(runMigration(failed, 'apply', migrations)).rejects.toThrow();
   expect(failed.calls.some(c => /^(insert|alter|create|drop)/i.test(c.text))).toBe(false);
   expect(failed.calls.at(-1)?.text).toBe('rollback');
  }
 });
 test('a lost COMMIT response is uncertain and never triggers an automatic replay', async () => {
  const client = new OfflineClient(); client.failOn = 'commit';
  await expect(runMigration(client, 'apply', migrations)).rejects.toThrow('COMMIT_OUTCOME_UNCERTAIN_CHECK_BEFORE_RETRY');
  expect(client.calls.filter(c => c.text === 'begin')).toHaveLength(1);
  expect(client.calls.filter(c => c.text === 'commit')).toHaveLength(1);
 });
 test('refuses partial journal/schema/cutover and invalid queue/pet prerequisites', async () => {
  for (const issue of ['partialSchema', 'partialCutover', 'invalidPrerequisites', 'invalidDefinition', 'invalidColumns'] as const) {
   const client = new OfflineClient(); client[issue] = true;
   await expect(runMigration(client, 'apply', migrations)).rejects.toThrow();
   expect(client.ledger).toEqual(rows());
  }
  const client = new OfflineClient(); client.ledger = rows(true).slice(0, 11);
  await expect(runMigration(client, 'apply', migrations)).rejects.toThrow('UNEXPECTED_MIGRATION_HISTORY');
 });
 test('complete-ledger claims require a valid schema, marker and exact catalog', async () => {
  for (const issue of ['marker', 'catalog', 'index', 'columns']) {
   const client = new OfflineClient(); client.ledger = rows(true); client.complete = true;
   client.ready = issue !== 'marker'; client.cosmetics = issue === 'catalog' ? [] : catalogRows();
   client.invalidDefinition = issue === 'index'; client.invalidColumns = issue === 'columns';
   await expect(runMigration(client, 'apply', migrations)).rejects.toThrow();
   expect(client.calls.some(c => /^(insert|update)/i.test(c.text))).toBe(false);
  }
 });
});

test('definition validator rejects missing, duplicate, invalid and changed indexes/constraints', () => {
 const expected = { key: 'PRIMARY KEY (task, step)' };
 for (const invalid of [[], [{ name: 'key', definition: expected.key, valid: false }], [{ name: 'key', definition: 'PRIMARY KEY (task)', valid: true }], [{ name: 'other', definition: expected.key, valid: true }]]) expect(() => assertDefinitions(invalid, expected)).toThrow();
 expect(Object.keys(FINAL_CONSTRAINTS).every(name => name.length <= 63)).toBe(true);
});
