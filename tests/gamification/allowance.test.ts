import { describe, expect, it } from 'bun:test';
import { getDailyRankSnapshot, rankProviderTurnLimit } from '../../lib/gamification/allowance';
import { RANKS } from '../../lib/gamification/catalog';

describe('rank provider allowance', () => {
  it('uses the approved rates, rounds once, and enforces the derived and separate caps', () => {
    expect(RANKS.map((rank) => rankProviderTurnLimit(15, rank.key))).toEqual([15, 15, 15, 16, 17, 18]);
    expect(rankProviderTurnLimit(15, 'presiden', 16)).toBe(16);
    expect(rankProviderTurnLimit(0, 'presiden')).toBe(0);
    expect(rankProviderTurnLimit(15, 'unknown')).toBe(15);
  });

  it('keeps the first snapshot for repeated reads and adopts promotion next day', async () => {
    const snapshots = new Map<string, string>();
    let currentRank = 'camat';
    const read = (day: string) => getDailyRankSnapshot(
      async () => snapshots.get(day) ?? null,
      async () => { if (!snapshots.has(day)) snapshots.set(day, currentRank); },
    );
    expect(await read('2026-01-01')).toBe('camat');
    currentRank = 'presiden';
    expect(await read('2026-01-01')).toBe('camat');
    expect(await read('2026-01-02')).toBe('presiden');
    expect(rankProviderTurnLimit(15, await read('2026-01-02'))).toBe(18);
  });

  it('uses the conflict winner for concurrent first reads', async () => {
    let saved: string | null = null;
    const capture = (rank: string) => getDailyRankSnapshot(async () => saved, async () => { saved ??= rank; });
    expect(await Promise.all([capture('bupati'), capture('presiden')])).toEqual(['bupati', 'bupati']);
  });
});
