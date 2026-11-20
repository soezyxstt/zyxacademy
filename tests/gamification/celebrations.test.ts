import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseCelebration, parseCelebrationAck } from '../../lib/gamification/celebration-contracts';

test('only valid gamification metadata becomes a celebration', () => {
 expect(parseCelebration('a', { namespace: 'gamification', kind: 'badge', family: 'warrior_reader', tier: 2, lp: 50 })).toEqual({ id: 'a', kind: 'badge', family: 'warrior_reader', tier: 2, lp: 50 });
 expect(parseCelebration('b', { namespace: 'gamification', kind: 'rank', rank: 'camat' })).toEqual({ id: 'b', kind: 'rank', rank: 'camat' });
 for (const value of [null, {}, { namespace: 'other', kind: 'rank', rank: 'camat' }, { namespace: 'gamification', kind: 'rank', rank: 'rakyat' }, { namespace: 'gamification', kind: 'badge', family: 'unknown', tier: 1, lp: 25 }, { namespace: 'gamification', kind: 'badge', family: 'warrior_reader', tier: 6, lp: 25 }]) expect(parseCelebration('a', value)).toBeNull();
});
test('acknowledgement is strict, unique and bounded', () => {
 expect(parseCelebrationAck({ ids: ['a', 'b'] })).toEqual(['a', 'b']);
 for (const value of [null, {}, { ids: [] }, { ids: ['a', 'a'] }, { ids: [' '] }, { ids: ['a'.repeat(201)] }, { ids: Array.from({ length: 11 }, (_, i) => String(i)) }, { ids: ['a'], userId: 'other' }]) expect(parseCelebrationAck(value)).toBeNull();
});
test('processor announcements follow new ledger awards and account promotion', () => {
 const source = readFileSync(new URL('../../lib/gamification/processor.ts', import.meta.url), 'utf8');
 expect(source).toMatch(/if \(inserted\)\s*\{\s*lp \+= tier\.lp;\s*await announceBadge/);
 expect(source).toMatch(/await tx\.update\(gamificationAccounts\)[\s\S]*if \(RANKS\.findIndex[^\n]*await announceRank/);
});
