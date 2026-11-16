import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';

const client = new PGlite({ parsers: { 20: Number } });
const fixtureDb = drizzle(client);
mock.module('@/db', { exports: { db: fixtureDb } });
mock.module('server-only', { exports: {} });

const { enqueueDiscussionReward } = await import('../../lib/discussions/rewards');
const { processGamificationOutbox } = await import('../../lib/gamification/processor');

before(async () => {
 await client.exec(`
  create table "user" (id text primary key, role text);
  create table pengguna (id text primary key, status text not null);
  create table peran (id text primary key, code text not null unique);
  create table pengguna_peran (id text primary key, pengguna_id text not null, peran_id text not null);
  create table discussion_threads (id text primary key, author_id text not null, channel_id text not null);
  create table discussion_messages (id text primary key, thread_id text not null, author_id text,
   kind text not null, message_type text not null, reply_to_id text, forwarded_from_id text,
   created_at timestamptz not null, deleted_at timestamptz);
  create table gamification_event_outbox (id text primary key, user_id text not null, source text not null,
   source_id text not null, evidence_id text not null, occurred_at timestamptz not null,
   status text not null default 'pending', created_at timestamptz not null default now(), processed_at timestamptz,
   error_code text, unique (user_id, source, evidence_id));
  create index event_user_status_time on gamification_event_outbox(user_id, status, occurred_at, created_at, id);
  create table gamification_accounts (user_id text primary key, base_xp_micro bigint not null default 0,
   bonus_xp_micro bigint not null default 0, course_credits_micro bigint not null default 0,
   lp_balance bigint not null default 0, rank_key text not null default 'rakyat', updated_at timestamptz not null default now());
  create table gamification_xp_ledger (id text primary key, user_id text not null, event_id text not null unique,
   reward_key text not null, base_xp_micro bigint not null, bonus_xp_micro bigint not null, rank_key text not null,
   created_at timestamptz not null default now(), unique (user_id, reward_key));
  create table gamification_lp_ledger (id text primary key, user_id text not null, reward_key text not null,
   amount bigint not null, reason text not null, created_at timestamptz not null default now(), unique (user_id, reward_key));
  create table gamification_leaderboard_periods (user_id text not null, period_key text not null,
   base_xp_micro bigint not null default 0, updated_at timestamptz not null default now(), primary key (user_id, period_key));
  create table notifications (id text primary key, user_id text, type text, title text, body text, metadata jsonb,
   read boolean not null default false, attempted bigint not null default 0, succeeded bigint not null default 0,
   failed_count bigint not null default 0, sent_at timestamptz, created_at timestamptz not null default now());
  insert into peran values ('murid', 'murid'), ('admin', 'admin'), ('tutor', 'tutor');
 `);
});
beforeEach(async () => {
 await client.exec(`truncate "user", pengguna, pengguna_peran, discussion_threads, discussion_messages,
  gamification_event_outbox, gamification_accounts, gamification_xp_ledger, gamification_lp_ledger,
  gamification_leaderboard_periods, notifications`);
});
after(async () => { await client.close(); });

async function actor(id: string, roles: string[] = ['murid'], status = 'active') {
 await client.query('insert into "user" (id, role) values ($1, $2)', [id, 'student']);
 await client.query('insert into pengguna (id, status) values ($1, $2)', [id, status]);
 for (const role of roles) await client.query('insert into pengguna_peran (id, pengguna_id, peran_id) values ($1, $2, $3)', [`${id}:${role}`, id, role]);
}

type Message = { thread: string; id: string; author: string; owner?: string; type?: string; kind?: string;
 at?: Date; deleted?: boolean; replyTo?: string; forwardedFrom?: string; channel?: string; rewardKind?: 'question' | 'answer' };
async function message(input: Message) {
 const at = input.at ?? new Date('2025-01-01T12:00:00.000Z');
 const type = input.type ?? 'answer';
 await fixtureDb.transaction(async tx => {
  await tx.execute(sql`insert into discussion_threads (id, author_id, channel_id) values (${input.thread}, ${input.owner ?? 'owner'}, ${input.channel ?? 'global'}) on conflict do nothing`);
  await tx.execute(sql`insert into discussion_messages (id, thread_id, author_id, kind, message_type, reply_to_id, forwarded_from_id, created_at, deleted_at)
   values (${input.id}, ${input.thread}, ${input.author}, ${input.kind ?? 'human'}, ${type}, ${input.replyTo ?? null}, ${input.forwardedFrom ?? null}, ${at}, ${input.deleted ? at : null})`);
  await enqueueDiscussionReward(tx, { userId: input.author, threadId: input.thread, messageId: input.id, kind: input.rewardKind ?? (type === 'question' ? 'question' : 'answer'), occurredAt: at });
 });
}
async function rows(query: string, values: unknown[] = []) { return (await client.query(query, values)).rows as Record<string, any>[]; }

test('thread claim stays unique after deletion and message plus outbox roll back together', async () => {
 await actor('student');
 const input = { thread: 'thread', id: 'first', author: 'student' };
 await message(input);
 assert.deepEqual(await processGamificationOutbox({ limit: 10 }), { processed: 1, rejected: 0, failed: 0 });
 await client.query('update discussion_messages set deleted_at = now() where id = $1', ['first']);
 await message({ ...input, id: 'second' });
 assert.deepEqual(await rows('select source_id, evidence_id from gamification_event_outbox'), [{ source_id: 'first', evidence_id: 'thread' }]);
 assert.equal((await rows('select amount from gamification_lp_ledger'))[0].amount, 1);
 assert.equal((await rows('select base_xp_micro from gamification_accounts'))[0].base_xp_micro, 10_000_000);
 await assert.rejects(fixtureDb.transaction(async tx => {
  await tx.execute(sql`insert into discussion_threads (id, author_id, channel_id) values ('rolled-back', 'owner', 'global')`);
  await tx.execute(sql`insert into discussion_messages (id, thread_id, author_id, kind, message_type, created_at) values ('rolled-back', 'rolled-back', 'student', 'human', 'answer', now())`);
  await enqueueDiscussionReward(tx, { userId: 'student', threadId: 'rolled-back', messageId: 'rolled-back', kind: 'answer', occurredAt: new Date() });
  throw new Error('rollback');
 }), /rollback/);
 assert.deepEqual(await rows("select id from discussion_messages where id = 'rolled-back'"), []);
 assert.deepEqual(await rows("select id from gamification_event_outbox where evidence_id = 'rolled-back'"), []);
});

test('daily question and answer limits span channels and reset at Jakarta midnight', async () => {
 await actor('student');
 for (let i = 0; i < 7; i++) await message({ thread: `q${i}`, id: `q${i}`, author: 'student', owner: 'student', type: 'question', channel: i % 2 ? 'course' : 'global', at: new Date(Date.parse('2025-01-01T16:59:50Z') + i * 1000) });
 await message({ thread: 'q-next', id: 'q-next', author: 'student', owner: 'student', type: 'question', at: new Date('2025-01-01T17:00:00Z') });
 for (let i = 0; i < 12; i++) await message({ thread: `a${i}`, id: `a${i}`, author: 'student', channel: i % 2 ? 'course' : 'global', at: new Date(Date.parse('2025-01-01T16:59:40Z') + i * 1000) });
 await message({ thread: 'a-next', id: 'a-next', author: 'student', at: new Date('2025-01-01T17:00:00Z') });
 assert.deepEqual(await processGamificationOutbox({ limit: 100 }), { processed: 21, rejected: 0, failed: 0 });
 const counts = await rows('select o.source, count(*)::int count from gamification_event_outbox o join gamification_xp_ledger x on x.event_id = o.id group by o.source order by o.source');
 assert.deepEqual(counts, [{ source: 'discussion_answer', count: 11 }, { source: 'discussion_question', count: 6 }]);
 assert.deepEqual((await rows('select base_xp_micro, bonus_xp_micro, lp_balance, course_credits_micro from gamification_accounts'))[0], { base_xp_micro: 140_000_000, bonus_xp_micro: 0, lp_balance: 11, course_credits_micro: 0 });
 assert.equal((await rows("select base_xp_micro from gamification_leaderboard_periods where period_key = 'all'"))[0].base_xp_micro, 140_000_000);
});

test('self answers, staff, contextual replies, forwards, deleted and mismatched evidence are rejected', async () => {
 await actor('student');
 await actor('mixed', ['murid', 'tutor']);
 await actor('admin', ['murid', 'admin']);
 await actor('suspended', ['murid'], 'suspended');
 await client.query("insert into \"user\" (id, role) values ('legacy', 'student')");
 await message({ thread: 'self', id: 'self', author: 'student', owner: 'student' });
 await message({ thread: 'staff', id: 'staff', author: 'mixed' });
 await message({ thread: 'admin', id: 'admin', author: 'admin' });
 await message({ thread: 'suspended', id: 'suspended', author: 'suspended' });
 await message({ thread: 'legacy', id: 'legacy', author: 'legacy' });
 await message({ thread: 'reply', id: 'reply', author: 'student', type: 'reply' });
 await message({ thread: 'forward', id: 'forward', author: 'student', type: 'forward' });
 await message({ thread: 'reply-flag', id: 'reply-flag', author: 'student', replyTo: 'prior' });
 await message({ thread: 'forward-flag', id: 'forward-flag', author: 'student', forwardedFrom: 'prior' });
 await message({ thread: 'deleted', id: 'deleted', author: 'student', deleted: true });
 await message({ thread: 'ai', id: 'ai', author: 'student', kind: 'zyra' });
 await message({ thread: 'mismatch', id: 'mismatch', author: 'student' });
 await client.query("update gamification_event_outbox set occurred_at = occurred_at + interval '1 second' where source_id = 'mismatch'");
 assert.deepEqual(await processGamificationOutbox({ limit: 100 }), { processed: 0, rejected: 12, failed: 0 });
 assert.deepEqual(await rows('select id from gamification_xp_ledger'), []);
 assert.deepEqual(await rows('select id from gamification_lp_ledger'), []);
 await message({ thread: 'deleted', id: 'replacement', author: 'student' });
 assert.deepEqual(await processGamificationOutbox({ limit: 100 }), { processed: 0, rejected: 0, failed: 0 });
 assert.deepEqual(await rows("select source_id, status from gamification_event_outbox where evidence_id = 'deleted'"), [{ source_id: 'deleted', status: 'rejected' }]);
});

test('concurrent processor calls do not award the same event twice', async () => {
 await actor('student');
 await message({ thread: 'thread', id: 'answer', author: 'student' });
 const results = await Promise.all([processGamificationOutbox({ limit: 1 }), processGamificationOutbox({ limit: 1 })]);
 assert.equal(results.reduce((sum, result) => sum + result.processed, 0), 1);
 assert.equal(results.reduce((sum, result) => sum + result.failed, 0), 0);
 assert.equal((await rows('select count(*)::int count from gamification_xp_ledger'))[0].count, 1);
 assert.equal((await rows('select count(*)::int count from gamification_lp_ledger'))[0].count, 1);
});

test('an LP ledger conflict rolls back XP and leaves the outbox pending', async () => {
 await actor('student');
 await message({ thread: 'thread', id: 'answer', author: 'student' });
 await client.query("insert into gamification_lp_ledger (id, user_id, reward_key, amount, reason) values ('existing', 'student', 'discussion:answer:thread', 1, 'discussion')");
 assert.deepEqual(await processGamificationOutbox({ limit: 1 }), { processed: 0, rejected: 0, failed: 1 });
 assert.deepEqual(await rows('select id from gamification_xp_ledger'), []);
 assert.deepEqual(await rows('select user_id from gamification_accounts'), []);
 assert.deepEqual(await rows('select status from gamification_event_outbox'), [{ status: 'pending' }]);
 await client.query("delete from gamification_lp_ledger where id = 'existing'");
 assert.deepEqual(await processGamificationOutbox({ limit: 1 }), { processed: 1, rejected: 0, failed: 0 });
 assert.equal((await rows('select count(*)::int count from gamification_xp_ledger'))[0].count, 1);
});

test('rank bonus uses the pre-event rank and leaves course credits unchanged', async () => {
 await actor('student');
 await client.query("insert into gamification_accounts (user_id, base_xp_micro, course_credits_micro, rank_key) values ('student', 9995000000, 1000000, 'kades')");
 await message({ thread: 'one', id: 'one', author: 'student', at: new Date('2025-01-01T12:00:00Z') });
 await message({ thread: 'two', id: 'two', author: 'student', at: new Date('2025-01-01T12:00:01Z') });
 assert.deepEqual(await processGamificationOutbox({ limit: 10 }), { processed: 2, rejected: 0, failed: 0 });
 const awards = await rows('select rank_key, bonus_xp_micro from gamification_xp_ledger order by rank_key');
 assert.deepEqual(awards, [{ rank_key: 'camat', bonus_xp_micro: 500_000 }, { rank_key: 'kades', bonus_xp_micro: 0 }]);
 assert.deepEqual((await rows('select base_xp_micro, bonus_xp_micro, course_credits_micro, lp_balance, rank_key from gamification_accounts'))[0], { base_xp_micro: 10_015_000_000, bonus_xp_micro: 500_000, course_credits_micro: 1_000_000, lp_balance: 2, rank_key: 'camat' });
 assert.equal((await rows('select count(*)::int count from notifications'))[0].count, 1);
});
