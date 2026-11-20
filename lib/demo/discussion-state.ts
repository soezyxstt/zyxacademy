import { z } from "zod";
import { DISCUSSION_REACTIONS, validDiscussionId, validDiscussionText } from "@/lib/discussions/policy";

export const demoDiscussionKey = "zyx-demo-discussions:v1";
export const maxDemoPosts = 100;
const id = z.string().refine(validDiscussionId);
const post = z.object({
  id,
  body: z.string().refine(value => validDiscussionText(value, 12_000)),
  createdAt: z.string().datetime(),
  messageType: z.enum(["question", "answer", "reply"]),
  replyTo: id.optional(),
  mentions: z.array(z.object({ id, mention: z.string().max(64) })).max(10),
});

const schema = z.object({
  questions: z.array(z.object({ id, channelId: id, title: z.string().max(160) })).max(maxDemoPosts),
  posts: z.array(post.extend({ threadId: id })).max(maxDemoPosts),
  status: z.record(z.string(), z.boolean()),
  read: z.array(id),
  muted: z.array(id),
  reactions: z.array(z.object({ messageId: id, emoji: z.enum(DISCUSSION_REACTIONS) })),
});

export type DemoDiscussionState = z.infer<typeof schema>;
export function emptyDemoDiscussion(): DemoDiscussionState {
  return { questions: [], posts: [], status: {}, read: [], muted: [], reactions: [] };
}
export function readDemoDiscussion(raw: string | null): DemoDiscussionState {
  try {
    const result = schema.safeParse(JSON.parse(raw ?? "null"));
    if (result.success) return result.data;
  } catch { /* Invalid browser data falls back to the seeded discussion. */ }
  return emptyDemoDiscussion();
}
