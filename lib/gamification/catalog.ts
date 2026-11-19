import type { BadgeFamily, RankKey } from './contracts';
export const MICRO = 1_000_000;
export const RANKS: ReadonlyArray<{ key: RankKey; xp: number; courses: number; bonusPercent: number; zyraPercent: number }> = [
 { key: 'rakyat', xp: 0, courses: 0, bonusPercent: 0, zyraPercent: 0 },
 { key: 'kades', xp: 1000, courses: 0, bonusPercent: 0, zyraPercent: 0 },
 { key: 'camat', xp: 10000, courses: 1, bonusPercent: 5, zyraPercent: 5 },
 { key: 'bupati', xp: 30000, courses: 3, bonusPercent: 10, zyraPercent: 10 },
 { key: 'gubernur', xp: 60000, courses: 6, bonusPercent: 15, zyraPercent: 15 },
 { key: 'presiden', xp: 100000, courses: 10, bonusPercent: 20, zyraPercent: 25 },
];
export const BADGE_THRESHOLDS: Record<BadgeFamily, readonly number[]> = {
 warrior_reader: [5, 15, 40, 100, 200], practice_knight: [20, 75, 200, 500, 1000],
 memory_guardian: [25, 100, 300, 750, 1500], steady_scholar: [3, 10, 30, 90, 180],
 comeback_champion: [5, 20, 50, 150, 300], consistency_captain: [1, 4, 12, 26, 52],
};
export const BADGE_LP = [25, 50, 100, 200, 400] as const;
export const CATEGORY_POOLS = { article: { reference: 10, xp: 1000 }, explanation: { reference: 10, xp: 1000 }, question: { reference: 300, xp: 6000 }, flashcard: { reference: 200, xp: 2000 } } as const;
export const COSMETIC_PRICES = [250, 400, 750, 1000, 1250, 1500, 1750, 2000] as const;

/** Stable identifiers are persisted in inventory and profiles. */
export const COSMETIC_CATALOG = [
 { id: 'frame-classic', name: 'Bingkai klasik', slot: 'frame', priceLp: 250, active: true },
 { id: 'title-scholar', name: 'Gelar pelajar', slot: 'title', priceLp: 400, active: true },
 { id: 'frame-detailed', name: 'Bingkai detail', slot: 'frame', priceLp: 750, active: true },
 { id: 'frame-laurel', name: 'Bingkai laurel', slot: 'frame', priceLp: 1000, active: true },
 { id: 'frame-circuit', name: 'Bingkai sirkuit', slot: 'frame', priceLp: 1250, active: true },
 { id: 'frame-celestial', name: 'Bingkai selestial', slot: 'frame', priceLp: 1750, active: true },
 { id: 'theme-academy', name: 'Tema akademi', slot: 'theme', priceLp: 1500, active: true },
 { id: 'frame-merah-putih', name: 'Merah Putih', slot: 'frame', priceLp: 900, active: true },
 { id: 'zyra-skin-orbit', name: 'Orbit', slot: 'zyra_skin', priceLp: 450, active: true },
 { id: 'zyra-skin-bara', name: 'Bara', slot: 'zyra_skin', priceLp: 600, active: true },
 { id: 'zyra-skin-samudra', name: 'Samudra', slot: 'zyra_skin', priceLp: 600, active: true },
 { id: 'zyra-skin-lontar', name: 'Lontar', slot: 'zyra_skin', priceLp: 750, active: true },
 { id: 'zyra-skin-merah-putih', name: 'Merah Putih', slot: 'zyra_skin', priceLp: 750, active: true },
 { id: 'zyra-skin-rimba', name: 'Rimba', slot: 'zyra_skin', priceLp: 900, active: true },
 { id: 'zyra-avatar-komodo', name: 'Komodo', slot: 'zyra_avatar', priceLp: 600, active: false },
 { id: 'zyra-avatar-jalak', name: 'Jalak', slot: 'zyra_avatar', priceLp: 700, active: false },
 { id: 'zyra-avatar-harimau', name: 'Harimau', slot: 'zyra_avatar', priceLp: 900, active: false },
 { id: 'zyra-avatar-orangutan', name: 'Orangutan', slot: 'zyra_avatar', priceLp: 1000, active: false },
 { id: 'frame-borobudur', name: 'Borobudur', slot: 'frame', priceLp: 1250, active: true },
 { id: 'frame-khatulistiwa', name: 'Khatulistiwa', slot: 'frame', priceLp: 1000, active: true },
 { id: 'frame-anggrek', name: 'Anggrek', slot: 'frame', priceLp: 750, active: true },
 { id: 'frame-naga', name: 'Naga', slot: 'frame', priceLp: 2000, active: true },
 { id: 'zyra-avatar-anoa', name: 'Anoa', slot: 'zyra_avatar', priceLp: 750, active: false },
 { id: 'zyra-avatar-bekantan', name: 'Bekantan', slot: 'zyra_avatar', priceLp: 1000, active: false },
 { id: 'zyra-avatar-cenderawasih', name: 'Cenderawasih', slot: 'zyra_avatar', priceLp: 1500, active: false },
 { id: 'zyra-avatar-penyu', name: 'Penyu', slot: 'zyra_avatar', priceLp: 900, active: false },
 { id: 'zyra-avatar-badak', name: 'Badak', slot: 'zyra_avatar', priceLp: 1250, active: false },
 { id: 'zyra-avatar-elang', name: 'Elang', slot: 'zyra_avatar', priceLp: 1750, active: false },
 { id: 'pet-action-cycle', name: 'Bersepeda', slot: 'pet_action', priceLp: 400, active: true },
 { id: 'pet-action-jump', name: 'Lompat', slot: 'pet_action', priceLp: 250, active: true },
 { id: 'pet-action-roar', name: 'Mengaum', slot: 'pet_action', priceLp: 400, active: true },
 { id: 'pet-action-charge', name: 'Menyeruduk', slot: 'pet_action', priceLp: 400, active: true },
 { id: 'pet-action-giveFlowers', name: 'Memberi bunga', slot: 'pet_action', priceLp: 400, active: true },
 { id: 'pet-suit-itb-sport-outfit', name: 'Seragam olahraga', slot: 'pet_suit', priceLp: 500, active: true },
 { id: 'pet-suit-astronaut-outfit', name: 'Baju astronaut', slot: 'pet_suit', priceLp: 750, active: true },
 // Draft studio prices follow existing character tiers. Confirm them before catalog seeding.
 { id: 'zyra-avatar-studio-cat', name: 'Zyra', slot: 'zyra_avatar', priceLp: 0, active: true },
 { id: 'zyra-avatar-studio-tiger', name: 'Harimau', slot: 'zyra_avatar', priceLp: 900, active: true },
 { id: 'zyra-avatar-studio-rhino', name: 'Badak', slot: 'zyra_avatar', priceLp: 1250, active: true },
 { id: 'zyra-avatar-studio-crocodile', name: 'Buaya', slot: 'zyra_avatar', priceLp: 1000, active: true },
] as const;
