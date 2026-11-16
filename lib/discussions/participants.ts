import { sql } from "drizzle-orm";
import { discussionMessages, discussionThreadParticipants, discussionThreads } from "@/db/schema";
import type { DiscussionTransaction } from "./access";

/** Record the actual message author in the message creation transaction. */
export async function recordDiscussionParticipant(tx: DiscussionTransaction, messageId: string) {
 await tx.execute(sql`
  insert into ${discussionThreadParticipants} (thread_id, user_id, channel_id, first_seq, first_created_at, earliest_created_at, earliest_created_seq)
  select m.thread_id, m.author_id, t.channel_id, m.seq, m.created_at, m.created_at, m.seq from ${discussionMessages} m
  join ${discussionThreads} t on t.id = m.thread_id
  where m.id = ${messageId} and m.author_id is not null
  on conflict (thread_id, user_id) do update set
   channel_id = excluded.channel_id,
   first_created_at = case when excluded.first_seq < ${discussionThreadParticipants.firstSeq} then excluded.first_created_at else ${discussionThreadParticipants.firstCreatedAt} end,
   first_seq = least(${discussionThreadParticipants.firstSeq}, excluded.first_seq),
   earliest_created_seq = case when excluded.earliest_created_at < ${discussionThreadParticipants.earliestCreatedAt}
    or (excluded.earliest_created_at = ${discussionThreadParticipants.earliestCreatedAt} and excluded.earliest_created_seq < ${discussionThreadParticipants.earliestCreatedSeq})
    then excluded.earliest_created_seq else ${discussionThreadParticipants.earliestCreatedSeq} end,
   earliest_created_at = least(${discussionThreadParticipants.earliestCreatedAt}, excluded.earliest_created_at)
 `);
}
