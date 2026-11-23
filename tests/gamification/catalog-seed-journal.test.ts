import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import journal from '../../drizzle-postgres/meta/_journal.json';
import { assertCatalogSeedJournal } from '../../scripts/staging/catalog-seed-journal';
import { EXPECTED_JOURNAL, PENDING } from '../../scripts/staging/gamification-migration-core';

test('seed accepts the recorded staging chain and rejects missing, extra or changed rows', () => {
  const prefix = [...EXPECTED_JOURNAL, ...PENDING].map(([created_at, hash]) => ({created_at, hash}));
  const suffix = journal.entries.slice(24,39).map(({when, tag}) => ({
    created_at: when,
    hash: createHash('sha256').update(readFileSync('drizzle-postgres/' + tag + '.sql')).digest('hex'),
  }));
  const rows = [...prefix, ...suffix];
  expect(rows).toHaveLength(41);
  for (const length of [38, 39, 40, 41]) {
    expect(() => assertCatalogSeedJournal(rows.slice(0, length))).not.toThrow();
  }
  for (const invalid of [rows.slice(0, 37), rows.slice(1), [...rows, rows[36]], [...rows].reverse(),
    rows.filter((_, i) => i !== 39),
    rows.map((row,i) => i === 40 ? {...row,hash:'changed'} : row)]) {
    expect(() => assertCatalogSeedJournal(invalid)).toThrow();
  }
});
