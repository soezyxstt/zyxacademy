/** Public, transport-safe gamification contracts. XP and course credits use millionths. */
export type RankKey = 'rakyat' | 'kades' | 'camat' | 'bupati' | 'gubernur' | 'presiden';
export type BadgeFamily = 'warrior_reader' | 'practice_knight' | 'memory_guardian' | 'steady_scholar' | 'comeback_champion' | 'consistency_captain';
export type AvatarMode = 'photo' | 'badge';
export interface GamificationAvatarChoice { avatarMode: AvatarMode; avatarBadgeId: string | null; badgeTier: number | null }
export type CosmeticSlot = 'frame' | 'theme' | 'title' | 'zyra_skin' | 'zyra_avatar' | 'pet_action' | 'pet_suit';
export type ChecklistCategory = 'article' | 'explanation' | 'question' | 'flashcard';
export interface GamificationSummary { baseXpMicro: number; bonusXpMicro: number; courseCreditsMicro: number; lpBalance: number; rankKey: RankKey }
export interface AchievementBadge { family: BadgeFamily; count: number; tier: number; nextThreshold: number | null; earnedTiers?: { tier: number; awardedAt: Date }[] }
export interface GamificationMission { id: string; kind: string; target: number; progress: number; rewardLp: number; endsAt: Date; completedAt: Date | null }
export interface GamificationReward { id: string; name: string; slot: CosmeticSlot; priceLp: number; owned: boolean; equipped: boolean }
export interface EquipGamificationCosmeticsInput { frameId?: string | null; themeId?: string | null; titleId?: string | null; zyraSkinId?: string | null; zyraAvatarId?: string | null; petActionId?: string | null; petSuitId?: string | null }
/** Server-originated reference only. The processor must resolve and verify persisted evidence. */
export interface GamificationEventInput { userId: string; source: 'article' | 'explanation' | 'question' | 'flashcard'; sourceId: string; evidenceId: string; occurredAt: string }

/** Trusted server writer input, never deserialize this from a client request. */
export type GamificationEvidenceInput = {
 userId: string; courseId: string; sourceId: string; sourceVersion: string;
 sourceEvidenceId: string; occurredAt: Date;
} & (
 | { source: 'article'; details: { sectionIds: string[] } }
 | { source: 'explanation'; details: { completionId: string; itemIds: string[] } }
 | { source: 'question'; details: { correct: boolean; attemptId: string; lastReveal?: { attemptId: string; occurredAt: string } | null } }
 | { source: 'flashcard'; details: { grade: number; adapter: 'canonical' | 'legacy'; previousDueAt: string } }
);
