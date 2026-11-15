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
export const followStudentAction = async () => ({ ok: true });
export const unfollowStudentAction = async () => ({ ok: true });
export const blockStudentAction = async () => ({ ok: true });
export const reportStudentAction = async () => ({ ok: true });
export const getStudentFollowListAction = async () => ({ entries: [], nextCursor: null });
export const removeFollowerAction = async () => ({ ok: true });

export const gamificationAdminAction = async () => ({});
export const updateStudentProfileAction = async (_previous: unknown, form: FormData) => {
 try { await saveProfile('academic', Object.fromEntries(form)); return { success: true, message: '', submittedAt: Date.now() }; }
 catch { return { success: false, message: 'Fixture save failure', errorCode: 'saveFailed', submittedAt: Date.now() }; }
};
export const completeExplanationAction = async () => ({ ok: true });
