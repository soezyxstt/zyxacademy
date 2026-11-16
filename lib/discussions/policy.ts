import type { DiscussionActor, DiscussionChannelKind } from "./contracts";

export const DISCUSSION_REACTIONS = ["👍", "❤️", "🎉", "🤔", "🙏"] as const;
export const DISCUSSION_EDIT_WINDOW_MS = 5 * 60 * 1000;

export function canEditDiscussionMessage(actor: DiscussionActor, message: { authorId: string | null; kind: string; messageType?: string; createdAt: Date; deletedAt: Date | null }, now = new Date()): boolean {
 return !message.deletedAt && message.kind === "human" && message.messageType !== "forward" && (actor.role === "admin" ||
  (message.authorId === actor.id && now.getTime() >= message.createdAt.getTime() && now.getTime() - message.createdAt.getTime() < DISCUSSION_EDIT_WINDOW_MS));
}
export function canDeleteDiscussionMessage(actor: DiscussionActor, message: { authorId: string | null; deletedAt: Date | null }): boolean {
 return !message.deletedAt && (actor.role === "admin" || message.authorId === actor.id);
}
type Audience = { id: string; kind: DiscussionChannelKind; courseId: string | null; legacyCourseId: string | null };
export function canForwardDiscussion(source: Audience, destination: Audience): boolean {
 if (source.id === destination.id) return true;
 if (source.kind === "technical" || source.kind === "academic" || destination.kind === "technical" || destination.kind === "academic") return false;
 if (source.kind === "global") return destination.kind === "global" || destination.kind === "course";
 if (source.kind !== "course" || destination.kind !== "course") return false;
 return source.id === destination.id || Boolean(source.courseId && source.courseId === destination.courseId && source.legacyCourseId === destination.legacyCourseId) ||
  Boolean(!source.courseId && !destination.courseId && source.legacyCourseId && source.legacyCourseId === destination.legacyCourseId);
}
export function validDiscussionId(value: unknown): value is string {
 return typeof value === "string" && value.length > 0 && value.length <= 160 && value.trim() === value && !value.includes("\0");
}
export function validDiscussionText(value: unknown, max: number): value is string {
 return typeof value === "string" && value.trim().length > 0 && value.length <= max && !value.includes("\0");
}
export function validDiscussionReplyType(type: unknown, replyTo: unknown): boolean {
 return (type === "answer" && replyTo == null) || (type === "reply" && validDiscussionId(replyTo));
}
