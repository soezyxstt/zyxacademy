import { expect, test } from "bun:test";
import { parseLeaderboardInput, parseSocialSettings, ownsSelectedBadges } from "../../lib/gamification/social-contracts";

const settings = { displayName: "  Rani  ", visibility: "members", showMajor: false, showFaculty: false, allowFollows: false, leaderboardOptIn: true, avatarBadgeId: null, avatarMode: "photo", badgeTier: null, featuredBadgeIds: [] };
test("social settings require explicit independent consent and reject unknown fields", () => {
  expect(parseSocialSettings(settings)).toEqual({ ...settings, displayName: "Rani" });
  expect(() => parseSocialSettings({ ...settings, allowFollows: undefined })).toThrow();
  expect(() => parseSocialSettings({ ...settings, featuredBadgeIds: ["a", "a"] })).toThrow();
  expect(() => parseSocialSettings({ ...settings, featuredBadgeIds: ["a", "b", "c", "d"] })).toThrow();
  expect(() => parseSocialSettings({ ...settings, userId: "forged" })).toThrow();
});
test("leaderboard bounds page size and rejects invalid filters", () => {
  expect(parseLeaderboardInput({ period: "week", scope: "global" }).pageSize).toBe(20);
  expect(() => parseLeaderboardInput({ period: "all", scope: "following", pageSize: 51 })).toThrow();
  expect(() => parseLeaderboardInput({ period: "day" as never, scope: "global" })).toThrow();
});


test("leaderboard rejects unknown fields and empty cursors", () => {
  expect(() => parseLeaderboardInput({ period: "week", scope: "global", cursor: "" })).toThrow();
  expect(() => parseLeaderboardInput({ period: "week", scope: "global", extra: true } as never)).toThrow();
});

test("legacy avatar choices normalize to photo while featured badges require ownership", () => {
  const choice = parseSocialSettings({ ...settings, avatarMode: "badge", avatarBadgeId: "warrior_reader", badgeTier: 2, featuredBadgeIds: ["practice_knight"] });
  expect(choice).toMatchObject({ avatarMode: "photo", avatarBadgeId: null, badgeTier: null });
  expect(ownsSelectedBadges(choice, [{ family: "practice_knight", tier: 1 }])).toBe(true);
  expect(ownsSelectedBadges(choice, [])).toBe(false);
  expect(() => parseSocialSettings({ ...settings, avatarMode: "badge" })).toThrow();
  expect(() => parseSocialSettings({ ...settings, badgeTier: 0 })).toThrow();
});
