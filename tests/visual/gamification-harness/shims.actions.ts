export const changeReward = async () => ({ ok: true });
async function saveProfile(kind: string, input: unknown) {
 (window as any).__profileSaves ??= [];
 (window as any).__profileSaves.push({ kind, input });
 const state = new URLSearchParams(window.location.search).get('fixtureAction');
 if (state === 'pending') await new Promise<void>(resolve => { (window as any).__finishProfileSave = resolve; });
 if (state === 'error') throw new Error('Fixture save failure');
}
export const equipProfileCosmetics = (input: unknown) => saveProfile('appearance', input);
export const updateStudentSocialSettingsAction = (input: unknown) => saveProfile('privacy', input);
export const followStudentAction = async () => {
 const state = new URLSearchParams(window.location.search).get('identityState');
 if (state === 'follow-pending') await new Promise<void>(() => {});
 if (state === 'follow-error') throw new Error('Fixture follow failure');
 return { ok: true };
};
export const unfollowStudentAction = async () => ({ ok: true });
export const blockStudentAction = async () => ({ ok: true });
export const reportStudentAction = async () => ({ ok: true });
export const getStudentFollowListAction = async () => ({ entries: [], nextCursor: null });
export const removeFollowerAction = async () => ({ ok: true });

export const updateStudentProfileAction = async (_previous: unknown, form: FormData) => {
 try { await saveProfile('academic', Object.fromEntries(form)); return { success: true, message: '', submittedAt: Date.now() }; }
 catch { return { success: false, message: 'Fixture save failure', errorCode: 'saveFailed', submittedAt: Date.now() }; }
};
export const completeExplanationAction = async () => ({ ok: true });

export async function getPublicStudentProfileAction(publicId: string) {
 const state = new URLSearchParams(window.location.search).get('identityState');
 if (state === 'loading') await new Promise<void>(() => {});
 if (state === 'unavailable') return null;
 return {
  publicId, displayName: 'Alya Putri Maharani Kusumawardhani', avatarUrl: null,
  avatarBadgeId: null, avatarMode: 'photo' as const, avatarBadgeTier: null,
  rankKey: 'bupati', baseXpMicro: 40000000, earnedBadges: [{ family: 'warrior_reader', tier: 3 }, { family: 'practice_knight', tier: 2 }],
  featuredBadgeIds: ['warrior_reader'], equippedFrameId: 'frame-classic', equippedThemeId: null,
  equippedTitleId: null, equippedZyraAvatarId: 'zyra-avatar-komodo', major: 'Matematika', faculty: 'FMIPA', followerCount: 12, followingCount: 8,
  canFollow: true, isFollowing: state === 'following',
 };
}
export async function searchVisibleStudentsAction() { return []; }
