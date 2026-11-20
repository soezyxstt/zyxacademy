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
 if (source.kind === "technical" || source.kind === "academic" || destination.kind === "technical" || destination.kind === "academic") return false;
 if (source.id === destination.id) return true;
 if (source.kind === "global") return destination.kind === "global" || destination.kind === "course";
 if (source.kind !== "course" || destination.kind !== "course") return false;
 return source.id === destination.id || Boolean(source.courseId && source.courseId === destination.courseId && source.legacyCourseId === destination.legacyCourseId) ||
  Boolean(!source.courseId && !destination.courseId && source.legacyCourseId && source.legacyCourseId === destination.legacyCourseId);
}
export function deriveInitialDiscussionTitle(body: string, hasAttachments = false): string {
 const stripped = typeof body === "string"
  ? body
    .replace(/\0/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*_`~>]/g, "")
  : "";
 const firstLine = stripped.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? "";
 if (!firstLine) return hasAttachments ? "Pertanyaan gambar" : "Pertanyaan baru";
 const match = firstLine.match(/^.+?[.!?](?=\s|$)/);
 const sentence = (match ? match[0] : firstLine).replace(/\s+/g, " ").trim();
 const source = sentence || firstLine.replace(/\s+/g, " ").trim();
 if (source.length <= 160) return source;
 const sliced = source.slice(0, 157).trimEnd();
 const lastSpace = sliced.lastIndexOf(" ");
 const compact = lastSpace > 80 ? sliced.slice(0, lastSpace).trimEnd() : sliced;
 return `${compact}...`;
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
