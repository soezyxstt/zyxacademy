import type { CosmeticSlot, EquipGamificationCosmeticsInput } from './contracts';
import { COSMETIC_CATALOG } from './catalog';

export const COSMETIC_FIELDS = [
 { slot: 'frame', input: 'frameId', profile: 'equippedFrameId' },
 { slot: 'theme', input: 'themeId', profile: 'equippedThemeId' },
 { slot: 'title', input: 'titleId', profile: 'equippedTitleId' },
 { slot: 'zyra_skin', input: 'zyraSkinId', profile: 'equippedZyraSkinId' },
 { slot: 'zyra_avatar', input: 'zyraAvatarId', profile: 'equippedZyraAvatarId' },
] as const;
export function cosmeticEquipInput(slot: CosmeticSlot, id: string): EquipGamificationCosmeticsInput {
 const field = COSMETIC_FIELDS.find(field => field.slot === slot);
 if (!field) throw new Error('INVALID_COSMETIC_SLOT');
 return { [field.input]: id };
}
export function cosmeticProfilePatch(input: EquipGamificationCosmeticsInput) {
 if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !COSMETIC_FIELDS.some(field => field.input === key))) throw new Error('INVALID_COSMETIC_INPUT');
 const patch: Partial<Record<typeof COSMETIC_FIELDS[number]['profile'], string | null>> = {};
 for (const field of COSMETIC_FIELDS) {
  const id = input[field.input];
  if (id === undefined) continue;
  if (id !== null && !COSMETIC_CATALOG.some(item => item.id === id && item.slot === field.slot)) throw new Error('INVALID_COSMETIC_SLOT');
  patch[field.profile] = id;
 }
 return patch;
}
