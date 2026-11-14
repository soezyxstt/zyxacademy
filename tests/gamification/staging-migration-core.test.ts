import { describe, expect, test } from 'bun:test';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { classifyJournal, EXPECTED_JOURNAL, PENDING } from '../../scripts/staging/gamification-migration-core';

const rows = (entries: ReadonlyArray<readonly [number, string]>) => entries.map(([created_at, hash]) => ({ created_at: String(created_at), hash }));
describe('staging gamification migration history', () => {
 test('accepts only the full observed history and an exact completed retry', () => {
  expect(classifyJournal(rows(EXPECTED_JOURNAL))).toBe('pending');
  expect(classifyJournal(rows([...EXPECTED_JOURNAL, ...PENDING]))).toBe('complete');
  expect(() => classifyJournal(rows([...EXPECTED_JOURNAL, PENDING[0]]))).toThrow();
  expect(() => classifyJournal(rows(EXPECTED_JOURNAL.slice(0, -1)))).toThrow();
  const altered = rows(EXPECTED_JOURNAL); altered[9].hash = 'unknown';
  expect(() => classifyJournal(altered)).toThrow();
  const duplicate = rows(EXPECTED_JOURNAL); duplicate[10] = duplicate[9];
  expect(() => classifyJournal(duplicate)).toThrow();
 });
 test('pins the actual unmodified generated migrations and timestamps', () => {
  const migrations = readMigrationFiles({ migrationsFolder: 'drizzle-postgres' });
  expect(migrations.length).toBe(23);
  for (const [index, expected] of PENDING.entries()) {
   expect([migrations[index + 16].folderMillis, migrations[index + 16].hash]).toEqual([...expected]);
   expect(migrations[index + 16].sql.length).toBe(index === 6 ? 1 : index === 5 ? 10 : index === 4 ? 1 : index % 2 === 1 ? 4 : 2);
  }
 });
});
