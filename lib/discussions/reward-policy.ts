import { MICRO } from '@/lib/gamification/catalog';

export const DISCUSSION_REWARDS = {
 question: { source: 'discussion_question', baseXpMicro: 5 * MICRO, lp: 0, dailyLimit: 5 },
 answer: { source: 'discussion_answer', baseXpMicro: 10 * MICRO, lp: 1, dailyLimit: 10 },
} as const;

export type DiscussionRewardKind = keyof typeof DISCUSSION_REWARDS;

export function discussionRewardKind(source: string): DiscussionRewardKind | null {
 if (source === DISCUSSION_REWARDS.question.source) return 'question';
 if (source === DISCUSSION_REWARDS.answer.source) return 'answer';
 return null;
}

export function discussionRewardKey(kind: DiscussionRewardKind, threadId: string) {
 return `discussion:${kind}:${threadId}`;
}
