/** Public fields are explicitly listed so account data cannot leak through a profile. */
export type PublicStudentProfile = {
  publicId: string;
  displayName: string;
  avatarUrl: string | null;
  avatarBadgeId: string | null;
  avatarMode: "photo" | "badge";
  rankKey: string;
  /** Base XP is visible only with leaderboard participation consent. */
  baseXpMicro: number | null;
  avatarBadgeTier: number | null;
  earnedBadges: { family: string; tier: number }[];
  featuredBadgeIds: string[];
  equippedFrameId: string | null;
  equippedThemeId: string | null;
  equippedTitleId: string | null;
  equippedZyraAvatarId: string | null;
  major: string | null;
  faculty: string | null;
  followerCount: number;
  followingCount: number;
  canFollow: boolean;
  isFollowing: boolean;
};

/** The member directory exposes only this projection, never account identifiers. */
export type StudentIdentity = {
  publicId: string;
  displayName: string;
  avatarUrl: string | null;
  rankKey: string;
  equippedFrameId: string | null;
  equippedThemeId: string | null;
};

/** Bound directory work and treat SQL wildcard characters as literal text. */
export function peopleSearchPattern(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const query = input.trim();
  if (query.length < 2 || query.length > 80) return null;
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

export type StudentSocialSettings = {
  publicId: string | null;
  displayName: string | null;
  visibility: "private" | "members";
  showMajor: boolean;
  showFaculty: boolean;
  allowFollows: boolean;
  leaderboardOptIn: boolean;
  avatarBadgeId: string | null;
  avatarMode: "photo" | "badge";
  badgeTier: number | null;
  featuredBadgeIds: string[];
};

export type StudentSocialSettingsInput = Omit<StudentSocialSettings, "publicId">;
export type LeaderboardPeriod = "week" | "month" | "all";
export type LeaderboardScope = "global" | "following";
export type LeaderboardInput = {
  period: LeaderboardPeriod;
  scope: LeaderboardScope;
  cursor?: string;
  pageSize?: number;
};
export type LeaderboardEntry = {
  avatarMode: "photo" | "badge";
  avatarBadgeId: string | null;
  badgeTier: number | null;
  equippedFrameId: string | null;
  equippedThemeId: string | null;
  publicId: string;
  displayName: string;
  avatarUrl: string | null;
  rankKey: string;
  baseXpMicro: number;
  position: number;
};
export type LeaderboardPage = {
  entries: LeaderboardEntry[];
  nextCursor: string | null;
  ownEntry: LeaderboardEntry | null;
};

/** Strictly validate data at the server boundary; ignore no extra fields. */
export function parseSocialSettings(input: unknown): StudentSocialSettingsInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid settings");
  const value = input as Record<string, unknown>;
  const keys = ["displayName", "visibility", "showMajor", "showFaculty", "allowFollows", "leaderboardOptIn", "avatarBadgeId", "avatarMode", "badgeTier", "featuredBadgeIds"];
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error("Invalid settings");
  if (value.displayName !== null && (typeof value.displayName !== "string" || !value.displayName.trim() || value.displayName.trim().length > 80)) throw new Error("Invalid display name");
  if (value.visibility !== "private" && value.visibility !== "members") throw new Error("Invalid visibility");
  if ([value.showMajor, value.showFaculty, value.allowFollows, value.leaderboardOptIn].some((item) => typeof item !== "boolean")) throw new Error("Invalid settings");
  if (value.avatarBadgeId !== null && (typeof value.avatarBadgeId !== "string" || !value.avatarBadgeId || value.avatarBadgeId.length > 80)) throw new Error("Invalid badge");
  if (value.avatarMode !== "photo" && value.avatarMode !== "badge") throw new Error("Invalid avatar mode");
  if (value.badgeTier !== null && (!Number.isInteger(value.badgeTier) || (value.badgeTier as number) < 1 || (value.badgeTier as number) > 5)) throw new Error("Invalid badge tier");
  if ((value.avatarBadgeId === null) !== (value.badgeTier === null) || (value.avatarMode === "badge" && value.avatarBadgeId === null)) throw new Error("Invalid avatar badge");
  if (!Array.isArray(value.featuredBadgeIds) || value.featuredBadgeIds.length > 3 || value.featuredBadgeIds.some((x) => typeof x !== "string" || !x || x.length > 80) || new Set(value.featuredBadgeIds).size !== value.featuredBadgeIds.length) throw new Error("Invalid badges");
  return {
    avatarBadgeId: null,
    avatarMode: "photo",
    badgeTier: null,
    featuredBadgeIds: value.featuredBadgeIds as string[],
    displayName: typeof value.displayName === "string" ? value.displayName.trim() : null,
    visibility: value.visibility,
    showMajor: value.showMajor as boolean,
    showFaculty: value.showFaculty as boolean,
    allowFollows: value.allowFollows as boolean,
    leaderboardOptIn: value.leaderboardOptIn as boolean,
  };
}

export function ownsSelectedBadges(settings: StudentSocialSettingsInput, owned: { family: string; tier: number }[]): boolean {
  return settings.featuredBadgeIds.every(id => owned.some(b => b.family === id && Number(b.tier) > 0)) && (!settings.avatarBadgeId || owned.some(b => b.family === settings.avatarBadgeId && Number(b.tier) >= Number(settings.badgeTier)));
}

export function parseLeaderboardInput(input: LeaderboardInput): Required<Omit<LeaderboardInput, "cursor">> & { cursor?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !["period", "scope", "pageSize", "cursor"].includes(key)) || !["week", "month", "all"].includes(input.period) || !["global", "following"].includes(input.scope)) throw new Error("Invalid leaderboard filter");
  if (input.pageSize !== undefined && (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 50)) throw new Error("Invalid page size");
  if (input.cursor !== undefined && (typeof input.cursor !== "string" || input.cursor.length === 0 || input.cursor.length > 512)) throw new Error("Invalid cursor");
  return { period: input.period, scope: input.scope, pageSize: input.pageSize ?? 20, cursor: input.cursor };
}
