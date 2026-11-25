import { and, eq, exists, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { discussionChannels, notifications } from "@/db/schema";
import { getDiscussionChannelVisibility } from "@/lib/discussions/access";

/** Build the visibility predicate before applying a history limit or count. */
export async function notificationVisibility(userId: string, viewerId: string, options: { unreadOnly?: boolean; ids?: readonly string[] } = {}) {
 const referencedChannels = inArray(discussionChannels.id, db.select({ id: sql<string>`${notifications.metadata}->>'channelId'` })
  .from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, "discussion"),
   options.unreadOnly ? eq(notifications.read, false) : undefined,
   options.ids ? (options.ids.length ? inArray(notifications.id, [...options.ids]) : sql`false`) : undefined)));
 const scope = async (id: string) => {
  try {
   const { actor, predicate } = await getDiscussionChannelVisibility(id, { discoveryScope: referencedChannels });
   return { predicate, admin: actor.role === "admin" };
  } catch (error) {
   if (error instanceof Error && error.message === "DISCUSSION_UNAVAILABLE") return { predicate: sql`false`, admin: false };
   throw error;
  }
 };
 const [owner, viewer] = await Promise.all([scope(userId), viewerId === userId ? Promise.resolve(null) : scope(viewerId)]);
 const visibleChannel = exists(db.select({ id: discussionChannels.id }).from(discussionChannels).where(and(
  eq(discussionChannels.id, sql<string>`${notifications.metadata}->>'channelId'`), owner.predicate, viewer?.predicate,
 )));
 // Suppress historic unsolicited staff notifications as well as new fanout.
 const participantActivity = sql`coalesce(${notifications.metadata}->>'staffOnly', 'false') <> 'true' or ${notifications.metadata}->>'eventKind' = 'report'`;
 const visibleReport = owner.admin && (!viewer || viewer.admin)
  ? undefined : sql`coalesce(${notifications.metadata}->>'eventKind', '') <> 'report'`;
 return or(ne(notifications.type, "discussion"), and(visibleChannel, visibleReport, participantActivity))!;
}
