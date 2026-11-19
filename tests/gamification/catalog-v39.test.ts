import { describe, expect, test } from 'bun:test';
import { COSMETIC_CATALOG } from '../../lib/gamification/catalog';
import { cosmeticNameKeys } from '../../lib/gamification/labels';
import id from '../../messages/id/student.json';
import en from '../../messages/en/student.json';

const originalPrices = [250,400,750,1000,1250,1750,1500,900,450,600,600,750,750,900,600,700,900,1000,1250,1000,750,2000,750,1000,1500,900,1250,1750] as const;
const originalIds = ['frame-classic','title-scholar','frame-detailed','frame-laurel','frame-circuit','frame-celestial','theme-academy','frame-merah-putih','zyra-skin-orbit','zyra-skin-bara','zyra-skin-samudra','zyra-skin-lontar','zyra-skin-merah-putih','zyra-skin-rimba','zyra-avatar-komodo','zyra-avatar-jalak','zyra-avatar-harimau','zyra-avatar-orangutan','frame-borobudur','frame-khatulistiwa','frame-anggrek','frame-naga','zyra-avatar-anoa','zyra-avatar-bekantan','zyra-avatar-cenderawasih','zyra-avatar-penyu','zyra-avatar-badak','zyra-avatar-elang'];
describe('expanded cosmetic catalog', () => {
  test('retains every original persisted ID and LP price', () => {
    originalIds.forEach((key, index) => expect(COSMETIC_CATALOG.find(item => item.id === key)?.priceLp).toBe(originalPrices[index]));
  });
  test('adds four studio characters to the existing catalog', () => {
    expect(COSMETIC_CATALOG).toHaveLength(36);
    expect(new Set(COSMETIC_CATALOG.map(item => item.id)).size).toBe(36);
    expect(COSMETIC_CATALOG.filter(item => item.slot === 'frame')).toHaveLength(10);
    expect(COSMETIC_CATALOG.filter(item => item.slot === 'zyra_avatar')).toHaveLength(14);
    const added = COSMETIC_CATALOG.filter(item => item.slot === "zyra_avatar" && !originalIds.includes(item.id));
    expect(added.map(item => item.id)).toEqual(['zyra-avatar-studio-cat', 'zyra-avatar-studio-tiger', 'zyra-avatar-studio-rhino', 'zyra-avatar-studio-crocodile']);
    for (const item of added) {
      expect(item.slot).toBe('zyra_avatar');
      if (item.id === "zyra-avatar-studio-cat") expect(item.priceLp).toBe(0);
      else expect(item.priceLp).toBeGreaterThanOrEqual(600);
      expect(item.priceLp).toBeLessThanOrEqual(1250);
    }
  });
  test('every reward and settings choice resolves a label in both locales', () => {
    for (const item of COSMETIC_CATALOG) for (const locale of [id, en]) {
      expect((locale.gamificationUi as Record<string, string>)[cosmeticNameKeys[item.id]]?.length).toBeGreaterThan(0);
    }
    expect(Object.keys(id.cosmeticsStudio).sort()).toEqual(Object.keys(en.cosmeticsStudio).sort());
  });
});
