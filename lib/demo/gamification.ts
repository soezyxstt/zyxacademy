import { DEFAULT_PET_ID, petSupportsAction } from "@/lib/gamification/pet-studio";
import { COSMETIC_CATALOG, MICRO } from "@/lib/gamification/catalog";
import type { AchievementBadge, GamificationMission, GamificationReward, GamificationSummary } from "@/lib/gamification/contracts";
import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardScope, PublicStudentProfile, StudentIdentity } from "@/lib/gamification/social-contracts";

export const demoSummary: GamificationSummary = { rankKey: "bupati", baseXpMicro: 40_000 * MICRO, bonusXpMicro: 2_650 * MICRO, courseCreditsMicro: 4 * MICRO, lpBalance: 1240 };
export const demoBadges: AchievementBadge[] = [
  { family: "warrior_reader", count: 46, tier: 3, nextThreshold: 100 },
  { family: "practice_knight", count: 85, tier: 2, nextThreshold: 200 },
  { family: "memory_guardian", count: 310, tier: 3, nextThreshold: 750 },
  { family: "steady_scholar", count: 12, tier: 2, nextThreshold: 30 },
  { family: "comeback_champion", count: 2, tier: 0, nextThreshold: 5 },
  { family: "consistency_captain", count: 4, tier: 2, nextThreshold: 12 },
];
export const demoMissions: GamificationMission[] = [
  { id: "material", kind: "material", progress: 3, target: 5, rewardLp: 10, endsAt: new Date("2030-11-20T16:59:00Z"), completedAt: null },
  { id: "question", kind: "question", progress: 5, target: 5, rewardLp: 10, endsAt: new Date("2030-11-20T16:59:00Z"), completedAt: new Date("2026-11-14T08:00:00Z") },
  { id: "recall", kind: "recall", progress: 2, target: 5, rewardLp: 10, endsAt: new Date("2030-11-20T16:59:00Z"), completedAt: null },
  { id: "days", kind: "qualified_days", progress: 2, target: 4, rewardLp: 50, endsAt: new Date("2030-11-20T16:59:00Z"), completedAt: null },
];
export const demoFeaturedBadges = ["warrior_reader", "practice_knight", "memory_guardian"];
const people = [
  { key: "alya", name: "Alya Putri", rank: "bupati", frame: "frame-classic", xp: 42000 },
  { key: "ayu", name: "Ayu Lestari", rank: "gubernur", frame: "frame-detailed", theme: "theme-academy", xp: 62000 },
  { key: "bima", name: "Bima Saputra", rank: "bupati", frame: "frame-laurel", xp: 47000 },
  { key: "citra", name: "Citra Maharani", rank: "bupati", frame: "frame-anggrek", xp: 45000 },
  { key: "dimas", name: "Dimas Pratama", rank: "camat", frame: "frame-classic", xp: 28000 },
  { key: "farah", name: "Farah Putri", rank: "camat", frame: "frame-merah-putih", xp: 18000 },
  { key: "intan", name: "Intan Sari", rank: "bupati", frame: "frame-khatulistiwa", xp: 35000 },
  { key: "nadia", name: "Nadia Prameswari", rank: "gubernur", frame: "frame-borobudur", xp: 61000 },
  { key: "raka", name: "Raka Aditya", rank: "bupati", frame: "frame-circuit", xp: 39000 },
] as const;
export const demoPeople: StudentIdentity[] = people.map(person => ({ publicId: `demo-${person.key}`, displayName: person.name, avatarUrl: null, rankKey: person.rank, equippedFrameId: person.frame, equippedThemeId: "theme" in person ? person.theme : null }));
export function demoIdentity(name: string): StudentIdentity | undefined {
  return demoPeople.find(person => person.displayName.toLocaleLowerCase("id").split(" ")[0] === name.toLocaleLowerCase("id").split(" ")[0]);
}
export function demoOwnIdentity(name: string, equipped: Record<string, string>): StudentIdentity {
  return { publicId: "demo-self", displayName: name, avatarUrl: null, rankKey: demoSummary.rankKey, equippedFrameId: equipped.frame ?? null, equippedThemeId: equipped.theme ?? null };
}
const peerProfiles: Record<string, {
  faculty: string; major: string; followers: number; following: number;
  pet?: string; suit?: string; action?: string;
  badges: PublicStudentProfile["earnedBadges"];
}> = {
  "demo-alya": { faculty: "FMIPA", major: "Matematika", followers: 8, following: 11, pet: DEFAULT_PET_ID, action: "pet-action-jump", badges: [{ family: "practice_knight", tier: 3 }, { family: "warrior_reader", tier: 2 }] },
  "demo-bima": { faculty: "STEI", major: "Teknik Informatika", followers: 16, following: 9, pet: "zyra-avatar-studio-crocodile", action: "pet-action-giveFlowers", badges: [{ family: "practice_knight", tier: 2 }, { family: "consistency_captain", tier: 3 }] },
  "demo-citra": { faculty: "FMIPA", major: "Kimia", followers: 12, following: 7, pet: DEFAULT_PET_ID, suit: "pet-suit-astronaut-outfit", badges: [{ family: "memory_guardian", tier: 3 }, { family: "warrior_reader", tier: 2 }] },
  "demo-raka": { faculty: "FTMD", major: "Teknik Mesin", followers: 6, following: 10, pet: "zyra-avatar-studio-tiger", action: "pet-action-roar", badges: [{ family: "practice_knight", tier: 2 }, { family: "steady_scholar", tier: 2 }] },
  "demo-ayu": { faculty: "STEI", major: "Sistem dan Teknologi Informasi", followers: 23, following: 14, pet: DEFAULT_PET_ID, action: "pet-action-cycle", badges: [{ family: "warrior_reader", tier: 4 }, { family: "steady_scholar", tier: 3 }] },
  "demo-dimas": { faculty: "FMIPA", major: "Matematika", followers: 4, following: 8, badges: [{ family: "practice_knight", tier: 2 }] },
  "demo-farah": { faculty: "SITH", major: "Biologi", followers: 3, following: 6, badges: [{ family: "warrior_reader", tier: 1 }] },
  "demo-intan": { faculty: "FMIPA", major: "Kimia", followers: 7, following: 5, badges: [{ family: "memory_guardian", tier: 2 }, { family: "steady_scholar", tier: 2 }] },
  "demo-nadia": { faculty: "FTMD", major: "Teknik Dirgantara", followers: 21, following: 13, pet: "zyra-avatar-studio-rhino", action: "pet-action-charge", badges: [{ family: "practice_knight", tier: 3 }, { family: "consistency_captain", tier: 3 }] },
};

export function demoProfile(id: string, following: string[]): PublicStudentProfile | null {
  const person = demoPeople.find(item => item.publicId === id);
  const peer = peerProfiles[id];
  if (!person || !peer) return null;
  const xp = people.find(item => `demo-${item.key}` === id)!.xp;
  const isFollowing = following.includes(id);
  return { ...person, avatarMode: "photo", avatarBadgeId: null, avatarBadgeTier: null, baseXpMicro: xp * MICRO,
    earnedBadges: peer.badges, featuredBadgeIds: peer.badges.map(badge => badge.family), equippedTitleId: null,
    equippedZyraAvatarId: peer.pet ?? null,
    equippedPetSuitId: peer.suit ?? null, equippedPetActionId: peer.action ?? null,
    major: peer.major, faculty: peer.faculty, followerCount: peer.followers + Number(isFollowing),
    followingCount: peer.following, canFollow: true, isFollowing };
}
export type DemoGamificationState = { following: string[]; followers: string[]; owned: string[]; equipped: Record<string, string>; balance: number };
export const legacyDemoGamificationKey = "zyx-demo-gamification:v1";
export const demoGamificationKey = "zyx-demo-gamification:v2";
export const demoGamificationChangeEvent = "zyx-demo-gamification-change";
export function initialDemoGamification(): DemoGamificationState {
  return {
    following: ["demo-ayu", "demo-bima"], followers: ["demo-citra", "demo-nadia"],
    owned: ["frame-classic", "frame-detailed", "title-scholar", "zyra-skin-samudra", DEFAULT_PET_ID,
      "pet-suit-itb-sport-outfit", "pet-action-jump", "pet-action-cycle"],
    equipped: { frame: "frame-classic", title: "title-scholar", zyra_skin: "zyra-skin-samudra",
      zyra_avatar: DEFAULT_PET_ID, pet_suit: "pet-suit-itb-sport-outfit", pet_action: "pet-action-cycle" },
    balance: demoSummary.lpBalance,
  };
}
export function readDemoGamification(raw: string | null, legacy = false): DemoGamificationState {
  const initial = initialDemoGamification();
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || !Array.isArray(value.following) || !Array.isArray(value.followers) || !Array.isArray(value.owned) || !value.equipped || typeof value.equipped !== "object" || !Number.isSafeInteger(value.balance) || value.balance < 0 || value.balance > demoSummary.lpBalance) return initial;
    const ids = new Set(demoPeople.map(person => person.publicId));
    const catalog = new Map<string, (typeof COSMETIC_CATALOG)[number]>(COSMETIC_CATALOG.map(item => [item.id, item]));
    const following: string[] = [...new Set<string>(value.following.filter((id: unknown): id is string => typeof id === "string" && ids.has(id)))];
    const followers: string[] = [...new Set<string>(value.followers.filter((id: unknown): id is string => typeof id === "string" && ids.has(id)))];
    const savedOwned: string[] = [...new Set<string>(value.owned.filter((id: unknown): id is string => typeof id === "string" && catalog.has(id)))];
    const owned = [...new Set([...savedOwned, ...(legacy ? initial.owned : [DEFAULT_PET_ID])])];
    const equipped = Object.fromEntries(Object.entries(value.equipped).filter(([slot, id]) => typeof id === "string" && owned.includes(id) && catalog.get(id)?.slot === slot && catalog.get(id)?.active)) as Record<string, string>;
    const appearance = legacy ? { ...initial.equipped, ...equipped } : equipped;
    appearance.zyra_avatar ??= DEFAULT_PET_ID;
    if (appearance.pet_action && !petSupportsAction(appearance.zyra_avatar, appearance.pet_action)) delete appearance.pet_action;
    return { following, followers, owned, equipped: appearance, balance: value.balance };
  } catch { return initial; }
}
export function demoRewards(state: DemoGamificationState): GamificationReward[] {
  return COSMETIC_CATALOG.filter(item => item.active).map(item => ({ ...item, owned: state.owned.includes(item.id), equipped: state.equipped[item.slot] === item.id }));
}
export function changeDemoReward(state: DemoGamificationState, id: string, action: "buy" | "equip" | "remove", slot: string): DemoGamificationState | null {
  const item = COSMETIC_CATALOG.find(item => item.active && item.id === id && item.slot === slot);
  if (!item) return null;
  if (action === "buy") {
    if (id === DEFAULT_PET_ID || state.owned.includes(id) || state.balance < item.priceLp) return null;
    return { ...state, balance: state.balance - item.priceLp, owned: [...state.owned, id] };
  }
  const equipped = { ...state.equipped };
  if (action === "remove") {
    if (slot !== "pet_suit" && slot !== "pet_action") return null;
    if (equipped[slot] === id) delete equipped[slot];
  } else {
    if ((!state.owned.includes(id) && id !== DEFAULT_PET_ID) || (slot === "pet_action" && !petSupportsAction(equipped.zyra_avatar, id))) return null;
    equipped[slot] = id;
    if (slot === "zyra_avatar" && equipped.pet_action && !petSupportsAction(id, equipped.pet_action)) delete equipped.pet_action;
  }
  return { ...state, equipped };
}
export function demoRankings(name: string, frame: string | undefined, period: LeaderboardPeriod, scope: LeaderboardScope, following: string[]) {
  const factors = period === "week" ? [2400, 2100, 1800, 1500, 1200, 1000, 900, 800, 700, 600] : period === "month" ? [9000, 8100, 7700, 7200, 6500, 6000, 5600, 4900, 4100, 3800] : null;
  const own: LeaderboardEntry = { publicId: "demo-self", displayName: name, avatarUrl: null, avatarMode: "photo", avatarBadgeId: null, badgeTier: null, equippedFrameId: frame ?? null, equippedThemeId: null, rankKey: "bupati", baseXpMicro: demoSummary.baseXpMicro, position: 0 };
  const entries: LeaderboardEntry[] = [...people.map((person, index) => ({ ...demoPeople[index], avatarMode: "photo" as const, avatarBadgeId: null, badgeTier: null, baseXpMicro: person.xp * MICRO, position: 0 })), own];
  const sorted = entries.sort((a, b) => b.baseXpMicro - a.baseXpMicro).map((entry, index) => ({ ...entry, baseXpMicro: factors ? factors[index] * MICRO : entry.baseXpMicro, position: index + 1 }));
  return { entries: scope === "following" ? sorted.filter(entry => entry.publicId === own.publicId || following.includes(entry.publicId)) : sorted, ownEntry: sorted.find(entry => entry.publicId === own.publicId) ?? null, nextCursor: null };
}
