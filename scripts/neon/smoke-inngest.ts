import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import * as schema from "../../db/schema";
import { inngest } from "../../jobs/client";
import { assertTarget } from "./import-core";

assertTarget(process.env.DATABASE_URL ?? "", process.env.NEON_EXPECTED_HOST ?? "", process.env.NEON_EXPECTED_DATABASE ?? "");
assert.equal(process.env.NEON_BRANCH_ID, "br-cool-water-az2xxbul");
assert.equal(process.env.INNGEST_ENV, "neon-migration");
const headers = { Authorization: `Bearer ${process.env.INNGEST_SIGNING_KEY}`, "X-Inngest-Env": "neon-migration" };
async function api(path: string) {
  const response = await fetch(`https://api.inngest.com/v2${path}`, { headers, signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `Inngest read ${response.status}`);
  return response.json();
}
const environments = await api("/envs?limit=250");
assert.deepEqual(environments.data?.map((env: { id: string }) => env.id), ["neon-migration"]);
const keys = await api("/keys/events?limit=100");
assert.ok(keys.data?.some((key: { key: string }) => key.key === process.env.INNGEST_EVENT_KEY), "Event key environment mismatch");
const functions = await api("/apps/zyx-academy/functions?limit=100");
const cron = functions.data.filter((fn: { triggers?: Array<{ type: string }> }) => fn.triggers?.some(trigger => trigger.type === "CRON"));
assert.equal(cron.length, 5);
assert.ok(cron.every((fn: { isPaused?: boolean }) => fn.isPaused), "Scheduled functions must remain paused during rehearsal");
const id = `migration-inngest-${randomUUID()}`;
let sent = false, terminal = false;
try {
  await db.transaction(async tx => {
    await tx.insert(schema.user).values({ id, name: "Inngest smoke fixture", email: `${id}@example.invalid` });
    await tx.insert(schema.courses).values({ id, title: "Inngest smoke fixture", category: "Test" });
    await tx.insert(schema.quizTemplates).values({ id, courseId: id, title: "Inngest smoke fixture", category: "chapter", selectionRules: {} });
    await tx.insert(schema.studentQuizAttempts).values({
      id, studentId: id, templateId: id, status: "completed", score: 100,
      questionsSnapshot: [{ id: "synthetic-question", correct_indices: [0] }],
      answersSnapshot: { "synthetic-question": [0] }, submittedAt: new Date(),
    });
  });
  const event = await inngest.send({ id, name: "quiz/feedback.requested", data: { attemptId: id } });
  sent = true;
  assert.equal(event.ids.length, 1);
  writeFileSync("artifacts/neon-migration/inngest-smoke-pending.json", JSON.stringify({ fixtureId: id, eventId: event.ids[0] }));
  let run: { id: string; status: string; function?: { id: string }; output?: unknown } | undefined;
  for (let attempt = 0; attempt < 40; attempt++) {
    const runs = await api(`/events/${encodeURIComponent(event.ids[0])}/runs?include=output`);
    run = runs.data?.find((candidate: { function?: { id: string } }) => candidate.function?.id === "quiz-feedback-worker");
    if (run && ["COMPLETED", "FAILED", "CANCELLED"].includes(run.status.toUpperCase())) { terminal = true; break; }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  assert.ok(run && terminal, "Synthetic run did not reach a terminal state; retain fixture for diagnosis");
  const trace = await api(`/runs/${encodeURIComponent(run.id)}/trace`);
  writeFileSync("artifacts/neon-migration/inngest-smoke-run.json", JSON.stringify({ eventId: event.ids[0], run, trace }));
  assert.equal(run.status.toUpperCase(), "COMPLETED");
  assert.ok(JSON.stringify(trace).includes("generate-feedback"), "Expected database-reading step missing from trace");
  assert.equal((await db.select().from(schema.attemptFeedback).where(eq(schema.attemptFeedback.attemptId, id))).length, 0);
  console.log(JSON.stringify({ status: "passed", environment: "neon-migration", eventId: event.ids[0], runId: run.id, step: "generate-feedback", aiCalls: 0, cronPaused: 5 }));
} finally {
  if (!sent || terminal) {
    await db.transaction(async tx => {
      await tx.delete(schema.studentQuizAttempts).where(eq(schema.studentQuizAttempts.id, id));
      await tx.delete(schema.quizTemplates).where(eq(schema.quizTemplates.id, id));
      await tx.delete(schema.courses).where(eq(schema.courses.id, id));
      await tx.delete(schema.user).where(eq(schema.user.id, id));
    });
    console.log(JSON.stringify({ fixtureCleanup: "passed" }));
  }
  await db.$client.end();
}
