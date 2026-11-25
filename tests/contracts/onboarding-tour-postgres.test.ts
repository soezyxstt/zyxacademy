import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { createTourRepository } from "@/lib/onboarding/tour-repository";

const client = await PGlite.create();
const database = drizzle(client, { schema });
await client.exec('create table "user" (id text primary key); insert into "user" values (\'account-a\'), (\'account-b\'), (\'account-c\');');
await client.exec(readFileSync("drizzle-postgres/0043_onboarding_tours.sql", "utf8"));
const repository = createTourRepository(database as unknown as Parameters<typeof createTourRepository>[0]);
afterAll(() => client.close());

test("PostgreSQL keeps account and role progress separate and retains course context", async () => {
  expect(await repository.get("account-a", "student")).toBeNull();
  expect(await repository.mutate("account-a", "student", { action: "start", generation: 0, courseId: "course-a" })).toMatchObject({ status: "in_progress", stepIndex: 0, courseId: "course-a" });
  await repository.mutate("account-a", "student", { action: "progress", generation: 1, stepIndex: 3 });
  await repository.mutate("account-a", "student", { action: "progress", generation: 1, stepIndex: 1 });
  await repository.mutate("account-a", "tutor", { action: "skip", generation: 0 });
  expect(await repository.get("account-a", "student")).toMatchObject({ stepIndex: 3, courseId: "course-a" });
  expect(await repository.get("account-a", "tutor")).toMatchObject({ status: "skipped", stepIndex: 0, courseId: null });
  expect(await repository.get("account-b", "student")).toBeNull();
});

test("PostgreSQL preserves skip and completion through delayed and concurrent progress writes", async () => {
  await repository.mutate("account-a", "student", { action: "skip", generation: 1 });
  await Promise.all([
    repository.mutate("account-a", "student", { action: "start", generation: 0, courseId: "wrong-course" }),
    repository.mutate("account-a", "student", { action: "progress", generation: 1, stepIndex: 8 }),
    repository.mutate("account-a", "student", { action: "complete", generation: 1 }),
  ]);
  expect(await repository.get("account-a", "student")).toMatchObject({ status: "skipped", stepIndex: 3, courseId: "course-a" });
  await repository.mutate("account-a", "student", { action: "restart", generation: 1, courseId: "course-b" });
  await repository.mutate("account-a", "student", { action: "complete", generation: 2 });
  expect(await repository.get("account-a", "student")).toMatchObject({ status: "in_progress", stepIndex: 0, courseId: "course-b" });
  await repository.mutate("account-a", "student", { action: "progress", generation: 2, stepIndex: 8 });
  await repository.mutate("account-a", "student", { action: "complete", generation: 2 });
  await repository.mutate("account-a", "student", { action: "progress", generation: 2, stepIndex: 4 });
  await repository.mutate("account-a", "student", { action: "skip", generation: 2 });
  expect(await repository.get("account-a", "student")).toMatchObject({ status: "completed", stepIndex: 8, courseId: "course-b" });
});

test("PostgreSQL creates no choice for unsolicited progress, enforces constraints and cascades account deletion", async () => {
  expect(await repository.mutate("account-b", "student", { action: "progress", generation: 1, stepIndex: 3 })).toBeNull();
  expect(await repository.mutate("account-b", "student", { action: "complete", generation: 1 })).toBeNull();
  await expect(client.exec("insert into onboarding_tours (user_id, role, status) values ('account-b', 'admin', 'in_progress')")).rejects.toThrow();
  await expect(client.exec("insert into onboarding_tours (user_id, role, status, step_index) values ('account-b', 'student', 'completed', 3)")).rejects.toThrow();
  await expect(client.exec("insert into onboarding_tours (user_id, role, status, generation) values ('account-b', 'student', 'in_progress', 0)")).rejects.toThrow();
  await repository.mutate("account-b", "student", { action: "skip", generation: 0 });
  await client.exec("delete from \"user\" where id = 'account-b'");
  expect(await repository.get("account-b", "student")).toBeNull();
});

test("PostgreSQL rejects old-run writes and applies concurrent restart retries only once", async () => {
  await repository.mutate("account-c", "student", { action: "start", generation: 0, courseId: "course-a" });
  await repository.mutate("account-c", "student", { action: "progress", generation: 1, stepIndex: 7 });
  await repository.mutate("account-c", "student", { action: "restart", generation: 1, courseId: "course-b" });
  await Promise.all([
    repository.mutate("account-c", "student", { action: "progress", generation: 1, stepIndex: 8 }),
    repository.mutate("account-c", "student", { action: "complete", generation: 1 }),
    repository.mutate("account-c", "student", { action: "skip", generation: 1 }),
    repository.mutate("account-c", "student", { action: "restart", generation: 1, courseId: "wrong-course" }),
  ]);
  expect(await repository.get("account-c", "student")).toMatchObject({ generation: 2, status: "in_progress", stepIndex: 0, courseId: "course-b" });
  await repository.mutate("account-c", "student", { action: "progress", generation: 2, stepIndex: 3 });
  await Promise.all([
    repository.mutate("account-c", "student", { action: "restart", generation: 2, courseId: "course-c" }),
    repository.mutate("account-c", "student", { action: "restart", generation: 2, courseId: "course-c" }),
  ]);
  expect(await repository.get("account-c", "student")).toMatchObject({ generation: 3, status: "in_progress", stepIndex: 0, courseId: "course-c" });
  expect(await repository.get("account-c", "tutor")).toBeNull();
});
