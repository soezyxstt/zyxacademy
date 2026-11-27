import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { makeSignature } from "better-auth/crypto";
import { Client } from "pg";
import { learningApi, PKA_PATH, type LearningData } from "../../../../../packages/native-parity/student/learning/contracts";
import { learningEvidence, learningEvidenceDatabase } from "./learning-seed";

const origin = new URL(process.env.BETTER_AUTH_URL ?? "");
const secret = process.env.BETTER_AUTH_SECRET;
const sourceCommit = process.env.STUDENT_SERVER_SHA;
const output = process.env.STUDENT_PKA_REFERENCE_OUTPUT;
assert(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) && secret && secret.length >= 32,
  "Expected a loopback Next server and a synthetic Better Auth secret");
assert(sourceCommit && /^[a-f0-9]{40}$/.test(sourceCommit), "Provide the signed source checkout commit");
assert(output, "Provide STUDENT_PKA_REFERENCE_OUTPUT");

const views = ["pka-home", "pka-schedule", "pka-report", "pka-registration"] as const;
type ReferenceView = typeof views[number];
type Ready = Extract<LearningData, { state: "ready" }>;
const database = new Client({ connectionString: learningEvidenceDatabase().href });

async function read(actor: string, view: ReferenceView, cookie: string): Promise<LearningData> {
  const url = new URL(learningApi, origin);
  url.searchParams.set("view", view);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(180_000),
    headers: { cookie, "x-student-id": actor, "x-app-locale": "id" } });
  assert.equal(response.status, 200, view);
  assert.equal(response.headers.get("cache-control"), "private, no-store", view);
  const data: LearningData = await response.json();
  assert.equal(data.view, view);
  return data;
}

async function capture(actor: string) {
  const result = await database.query<{ token: string }>(
    "SELECT token FROM session WHERE id = $1 AND user_id = $1 AND expires_at > now()", [actor]);
  assert.equal(result.rowCount, 1, "Run learning-seed.ts in a disposable database first");
  const { token } = result.rows[0];
  const cookie = "better-auth.session_token=" + encodeURIComponent(token + "." + await makeSignature(token, secret!));
  return Object.fromEntries(await Promise.all(views.map(async view => [view, await read(actor, view, cookie)])));
}

function ready<View extends ReferenceView>(input: LearningData, view: View): Extract<Ready, { view: View }> {
  assert(input.state === "ready" && input.view === view);
  return input as Extract<Ready, { view: View }>;
}

await database.connect();
try {
  const member = await capture(learningEvidence.learner);
  const visitor = await capture(learningEvidence.visitor);
  const home = ready(member["pka-home"], "pka-home");
  assert.equal(home.courseTitle, "Tutorial PKA Referensi");
  assert(home.announcements.some(item => item.isPinned && item.title === "Persiapan sesi Matematika"));
  assert.equal(home.simulationCount, 9);
  assert.equal(home.bestScore, 85);
  assert.equal(home.nextSession?.title, "Diskusi limit PKA");
  const schedule = ready(member["pka-schedule"], "pka-schedule");
  assert(schedule.schedules.some(item => item.isPast && item.meetLink === null));
  assert(schedule.schedules.some(item => !item.isPast && item.title === home.nextSession?.title && item.meetLink === home.nextSession?.meetLink));
  const report = ready(member["pka-report"], "pka-report");
  assert(report.results.some(item => item.subject === "fisika" && item.bestScore === 85));
  for (const view of views) {
    if (view === "pka-registration") {
      assert.deepEqual(member[view], { view, state: "redirect", path: PKA_PATH });
      ready(visitor[view], view);
    } else {
      assert.deepEqual(visitor[view], { view, state: "redirect", path: PKA_PATH + "/daftar" });
    }
  }
  await writeFile(output, JSON.stringify({ sourceCommit, source: "signed-local-synthetic-student-api", locale: "id", member, visitor }, null, 2) + "\n");
  console.log("PKA signed reference captured: four member and four visitor GET responses");
} finally {
  await database.end();
}
