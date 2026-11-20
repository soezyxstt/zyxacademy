// Controllable actions for pending, failure and success presentation states.
export const changeReward = () => new Promise(resolve => { (window as any).__finishAchievementReward = resolve; });
