import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as orm from "drizzle-orm";
import ts from "typescript";
import * as schema from "@/db/schema";
import * as policy from "@/lib/discussions/policy";
import * as countCache from "@/lib/discussions/count-cache";

const client = await PGlite.create();
const db = drizzle(client, { schema });
await client.exec(`
  create table discussion_channels (id text primary key, kind text, course_id text, legacy_course_id text, count_revision bigint not null default 0);
  create table discussion_threads (id text primary key, channel_id text, status text, last_activity_at timestamptz not null default now());
  create table discussion_messages (thread_id text, seq integer, author_id text, deleted_at timestamptz);
  create table discussion_thread_reads (thread_id text, user_id text, through_seq integer);
  create table discussion_channel_preferences (user_id text, channel_id text, read_revision bigint not null default 0, primary key (user_id, channel_id));
  insert into discussion_channels (id, kind, course_id, legacy_course_id) values ('global', 'global', null, null), ('course', 'course', 'c1', 'old-c1'),
    ('empty', 'course', 'c2', null), ('private', 'technical', null, null);
  insert into discussion_threads values ('g1', 'global', 'open'), ('g2', 'global', 'resolved'),
    ('g3', 'global', 'open'), ('c1', 'course', 'open'), ('p1', 'private', 'open');
  insert into discussion_messages values ('g1', 1, 'other', null), ('g2', 1, 'viewer', null),
    ('g3', 1, 'other', now()), ('g3', 2, 'viewer', null), ('c1', 1, 'other', null), ('p1', 1, 'other', null);
  insert into discussion_thread_reads values ('c1', 'viewer', 1);
`);
afterAll(() => client.close());

let allowed = ["global", "course", "empty"];
const dependencies: Record<string, unknown> = {
  "drizzle-orm": orm,
  "node:crypto": crypto,
  "@/db": { db },
  "@/db/schema": schema,
  "./policy": policy,
  "./count-cache": countCache,
  "./access": {
    discussionChannelsWithThreads: () => undefined,
    getDiscussionActor: async (id: string) => ({ id, role: "student" }),
    getDiscussionChannelVisibility: async (id: string, options: { scope?: orm.SQL; discoveryScope?: orm.SQL } = {}) => ({ actor: { id, role: "student" }, predicate: orm.and(orm.inArray(schema.discussionChannels.id, allowed), options.scope) }),
    getAccessibleDiscussionChannels: async (_actorId: string, options: { channelIds: string[] }) => db.select({ id: schema.discussionChannels.id, kind: schema.discussionChannels.kind,
      courseId: schema.discussionChannels.courseId, legacyCourseId: schema.discussionChannels.legacyCourseId, countRevision: schema.discussionChannels.countRevision }).from(schema.discussionChannels)
      .where(orm.and(orm.inArray(schema.discussionChannels.id, allowed), orm.inArray(schema.discussionChannels.id, options.channelIds))),
  },
};
const exports: Record<string, any> = {};
const output = ts.transpileModule(readFileSync("lib/discussions/service.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
runInNewContext(output, { exports, Error, require: (name: string) => dependencies[name] ?? {} });

test("aggregates authorized channels and current unread messages in PostgreSQL", async () => {
  expect((await client.query("select id from discussion_channels c where (select 1 from discussion_threads t where t.channel_id = c.id order by t.last_activity_at, t.id limit 1) is not null")).rows).toHaveLength(3);
  const result = await exports.getDiscussionCounts("viewer");
  expect(result.total).toEqual({ unreadThreads: 1, activeThreads: 3 });
  expect(result.scopes.global).toEqual({ unreadThreads: 1, activeThreads: 2 });
  expect(result.scopes.course).toEqual({ unreadThreads: 0, activeThreads: 1 });
  expect(result.course).toBeNull();
  const scoped = await exports.getDiscussionCounts("viewer", { courseId: "old-c1" });
  expect(scoped.total).toEqual({ unreadThreads: 0, activeThreads: 1 });
  expect(scoped.scopes.global).toEqual({ unreadThreads: 0, activeThreads: 0 });
  expect(scoped.scopes.course).toEqual(scoped.course);
  await client.exec("insert into discussion_messages values ('c1', 2, 'other', null); update discussion_channels set count_revision = count_revision + 1 where id = 'course'");
  const updated = await exports.getDiscussionCounts("viewer", { courseId: "c1" });
  expect(updated.course.unreadThreads).toBe(1);
  allowed = ["global", "empty"];
  const revoked = await exports.getDiscussionCounts("viewer", { courseId: "c1" });
  expect(revoked.course).toEqual({ unreadThreads: 0, activeThreads: 0 });
  expect(revoked.scopes.technical).toEqual({ unreadThreads: 0, activeThreads: 0 });
  expect(revoked.total).toEqual({ unreadThreads: 0, activeThreads: 0 });
  expect((await exports.getDiscussionCounts("viewer")).total).toEqual({ unreadThreads: 1, activeThreads: 2 });
});
