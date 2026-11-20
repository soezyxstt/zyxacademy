import { expect, test } from "bun:test";
import { DEFAULT_PET_ID } from "@/lib/gamification/pet-studio";
import { COSMETIC_CATALOG, MICRO } from "@/lib/gamification/catalog";
import { changeDemoReward, demoBadges, demoGamificationKey, demoIdentity, demoProfile, demoRankings, demoRewards, demoSummary, initialDemoGamification, readDemoGamification } from "@/lib/demo/gamification";
import { demoStudentHref, demoStudentPath } from "@/lib/demo/routes";

test("fictional achievement and identity data use the production catalog", () => {
  const state = initialDemoGamification();
  expect(demoSummary.rankKey).toBe("bupati");
  expect(demoSummary.baseXpMicro).toBe(40_000 * MICRO);
  expect(demoBadges.filter(badge => badge.tier > 0).length).toBeGreaterThan(2);
  expect(COSMETIC_CATALOG.some(item => item.id === state.equipped.frame && item.slot === "frame")).toBe(true);
  expect(demoIdentity("Bima")?.publicId).toBe("demo-bima");
  expect(demoProfile("unknown", state.following)).toBeNull();
  expect(demoProfile("demo-bima", state.following)?.isFollowing).toBe(true);
  expect(demoProfile("demo-bima", state.following)?.equippedZyraAvatarId).toBe("zyra-avatar-studio-crocodile");
  expect(state.equipped.zyra_avatar).toBe(DEFAULT_PET_ID);
  expect(demoRewards(state).find(item => item.id === state.equipped.frame)?.equipped).toBe(true);
});

test("reward transactions validate ownership, price, slot and balance", () => {
  const initial = initialDemoGamification();
  expect(changeDemoReward(initial, "frame-anggrek", "equip", "frame")).toBeNull();
  expect(changeDemoReward(initial, "frame-anggrek", "buy", "theme")).toBeNull();
  expect(changeDemoReward(initial, "frame-naga", "buy", "frame")).toBeNull();
  const bought = changeDemoReward(initial, "frame-anggrek", "buy", "frame")!;
  expect(bought.balance).toBe(490);
  expect(bought.owned).toContain("frame-anggrek");
  expect(changeDemoReward(bought, "frame-anggrek", "buy", "frame")).toBeNull();
  const equipped = changeDemoReward(bought, "frame-anggrek", "equip", "frame")!;
  expect(equipped.equipped.frame).toBe("frame-anggrek");
  expect(equipped.balance).toBe(490);
  expect(readDemoGamification(JSON.stringify(equipped))).toEqual(equipped);
  expect(readDemoGamification('{"balance":-1}')).toEqual(initial);
  expect(demoGamificationKey.startsWith("zyx-demo-")).toBe(true);
});

test("rank filters and demo URLs preserve context and isolate academic course", () => {
  const state = initialDemoGamification();
  const global = demoRankings("Pelajar Demo", state.equipped.frame, "all", "global", state.following);
  const following = demoRankings("Pelajar Demo", state.equipped.frame, "week", "following", state.following);
  expect(global.entries.length).toBeGreaterThan(following.entries.length);
  expect(following.entries.map(entry => entry.publicId)).toEqual(expect.arrayContaining(["demo-self", "demo-ayu", "demo-bima"]));
  expect(global.ownEntry?.baseXpMicro).toBe(40_000 * MICRO);
  expect(following.ownEntry?.baseXpMicro).not.toBe(global.ownEntry?.baseXpMicro);
  expect(demoStudentPath("achievements", "context")).toBe("/achievements");
  expect(demoStudentHref("id", "/leaderboard/academic?course=other", "context")).toBe("/id/demo/leaderboard?course=context&academic=1&academicCourse=other");
  expect(demoStudentHref("en", "/achievements?tab=rewards", "context")).toBe("/en/demo/achievements?course=context&tab=rewards");
});

test("pet gear persists across pages and legacy inventories keep their purchases", () => {
  const initial = initialDemoGamification();
  const legacy = readDemoGamification(JSON.stringify({
    ...initial, balance: 490, owned: ["frame-classic", "frame-anggrek", "zyra-avatar-jalak"],
    equipped: { frame: "frame-anggrek", zyra_avatar: "zyra-avatar-jalak" },
  }), true);
  expect(legacy.balance).toBe(490);
  expect(legacy.equipped.frame).toBe("frame-anggrek");
  expect(legacy.equipped.zyra_avatar).toBe(DEFAULT_PET_ID);
  expect(legacy.equipped.pet_action).toBe("pet-action-cycle");
  expect(demoRewards(legacy).some(item => item.id === "zyra-avatar-jalak")).toBe(false);

  const bought = changeDemoReward(initial, "zyra-avatar-studio-tiger", "buy", "zyra_avatar")!;
  const tiger = changeDemoReward(bought, "zyra-avatar-studio-tiger", "equip", "zyra_avatar")!;
  expect(tiger.equipped.pet_action).toBeUndefined();
  expect(tiger.equipped.pet_suit).toBe(initial.equipped.pet_suit);
  expect(changeDemoReward(tiger, "pet-action-jump", "equip", "pet_action")).toBeNull();
  const cat = changeDemoReward(tiger, DEFAULT_PET_ID, "equip", "zyra_avatar")!;
  const jumping = changeDemoReward(cat, "pet-action-jump", "equip", "pet_action")!;
  const cleared = changeDemoReward(jumping, "pet-action-jump", "remove", "pet_action")!;
  expect(readDemoGamification(JSON.stringify(cleared)).equipped.pet_action).toBeUndefined();
  expect(cleared.owned).toContain("pet-action-jump");
  expect(cleared.balance).toBe(340);
});
