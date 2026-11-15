// Any accidental fallthrough to a live action fails the isolated fixture visibly.
function forbidden(): never { throw new Error("Live social action reached by demo"); }
export const followStudentAction = forbidden;
export const unfollowStudentAction = forbidden;
export const removeFollowerAction = forbidden;
export const getPublicStudentProfileAction = forbidden;
export const getStudentFollowListAction = forbidden;
export const searchVisibleStudentsAction = forbidden;
export const changeReward = forbidden;
