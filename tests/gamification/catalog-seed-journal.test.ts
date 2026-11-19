import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import journal from '../../drizzle-postgres/meta/_journal.json';
import { assertCatalogSeedJournal } from '../../scripts/staging/catalog-seed-journal';
import { EXPECTED_JOURNAL, PENDING } from '../../scripts/staging/gamification-migration-core';

test('seed accepts the recorded staging chain and rejects missing, extra or changed rows', () => {
  const prefix = [...EXPECTED_JOURNAL, ...PENDING].map(([created_at, hash]) => ({created_at, hash}));
  const suffix = journal.entries.slice(24,35).map(({when, tag}) => ({
    created_at: when,
    hash: createHash('sha256').update(readFileSync('drizzle-postgres/' + tag + '.sql')).digest('hex'),
  }));
  const rows = [...prefix, ...suffix];
  expect(rows).toHaveLength(37);
  expect(() => assertCatalogSeedJournal(rows)).not.toThrow();
  for (const invalid of [prefix, rows.slice(1), [...rows, rows[36]], [...rows].reverse(),
    rows.map((row,i) => i === 36 ? {...row,hash:'changed'} : row)]) {
    expect(() => assertCatalogSeedJournal(invalid)).toThrow();
  }
});
