export const changeReward = async () => ({ ok: true });
export const equipProfileCosmetics = async () => ({ ok: true });
export const updateStudentSocialSettingsAction = async () => {
 const state = new URLSearchParams(window.location.search).get('fixtureAction');
 if (state === 'pending') await new Promise(resolve => setTimeout(resolve, 30000));
 if (state === 'error') throw new Error('Fixture save failure');
 return { ok: true };
};
export const followStudentAction = async () => ({ ok: true });
export const unfollowStudentAction = async () => ({ ok: true });
export const blockStudentAction = async () => ({ ok: true });
export const reportStudentAction = async () => ({ ok: true });
export const getStudentFollowListAction = async () => ({ ok: true, users: [] });
export const removeFollowerAction = async () => ({ ok: true });

export const gamificationAdminAction = async () => ({});
export const updateStudentProfileAction = async () => ({ success: true, message: '', submittedAt: Date.now() });
export const completeExplanationAction = async () => ({ ok: true });
