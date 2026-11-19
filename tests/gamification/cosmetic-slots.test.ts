import { describe, expect, test } from 'bun:test';
import { COSMETIC_FIELDS, cosmeticEquipInput, cosmeticProfilePatch } from '../../lib/gamification/cosmetic-slots';
import { COSMETIC_CATALOG } from '../../lib/gamification/catalog';

describe('cosmetic slot boundaries', () => {
 test('catalog keeps old prices and includes separate action and suit slots', () => {
  expect(COSMETIC_CATALOG).toHaveLength(39);
  expect(COSMETIC_CATALOG.find(item => item.id === 'frame-classic')?.priceLp).toBe(250);
  expect(new Set(COSMETIC_CATALOG.map(item => item.slot)).size).toBe(7);
 });
 test('every catalog ID equips only its own slot', () => {
  for (const item of COSMETIC_CATALOG) for (const field of COSMETIC_FIELDS) {
   const apply = () => cosmeticProfilePatch(cosmeticEquipInput(field.slot, item.id));
   if (item.active && field.slot === item.slot) expect(apply()).toEqual({[field.profile]: item.id});
   else expect(apply).toThrow();
  }
 });
 test('unknown IDs and fields cannot bypass validation', () => {
  expect(() => cosmeticProfilePatch({zyraSkinId: 'unknown'})).toThrow();
  expect(() => cosmeticProfilePatch({other: 'frame-classic'} as never)).toThrow();
  expect(() => cosmeticEquipInput('unknown' as never, 'frame-classic')).toThrow();
 });
 test('old and partial inputs preserve unrelated slots; null clears only its slot', () => {
  expect(cosmeticProfilePatch({frameId: 'frame-classic'})).toEqual({equippedFrameId: 'frame-classic'});
  expect(cosmeticProfilePatch({zyraSkinId: null})).toEqual({equippedZyraSkinId: null});
  expect(cosmeticProfilePatch({})).toEqual({});
 });
});
