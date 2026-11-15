import { expect, test } from "bun:test";
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
  expect(demoProfile("demo-bima", state.following)?.equippedZyraAvatarId).toBe("zyra-avatar-komodo");
  expect(state.equipped.zyra_avatar).toBe("zyra-avatar-jalak");
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
