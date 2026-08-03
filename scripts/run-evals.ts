/**
 * P10 eval harness. One command, seeded DB, green/red summary.
 *
 * Gates covered:
 * 2.3 Streak math (consecutive, gap reset, same-day no-op)
 * 5.2 Study path soundness (prerequisites never violated)
 * 5.3 Study path determinism (byte-identical recompute)
 * B.1 Usage budget (canUseFeature gates correctly)
 *
 * Gates requiring external services or dedicated fixtures:
 * 3.4 Tutor Tier-2 addendum ; use the deterministic tutor fixtures separately
 * 3.5 Tutor grounding ; use the canonical retrieval contract suite separately
 * WR.1 Reflection math ; run seed-mastery.ts separately
 *
 * Usage: bunx tsx scripts/run-evals.ts
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
 user,
 courses,
 chapters,
 masterTeachingDocuments,
 knowledgeObjects,
 knowledgeRelationships,
 enrollments,
 studentConceptMastery,
 studentStreaks,
 learningEvents,
 studyPaths,
 aiUsageEvents,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getOrUpdateStreak } from "@/lib/streak-service";
import { computeStudyPath } from "@/lib/study-path-service";
import { UsageBudgetService, BUDGETS } from "@/lib/usage-budget-service";

// ── Helpers ────────────────────────────────────────────────────────────────────

type Result = { gate: string; passed: boolean; detail?: string };
const results: Result[] = [];

function pass(gate: string, detail?: string) {
 results.push({ gate, passed: true, detail });
 console.log(` [PASS] ${gate}${detail ? ": " + detail : ""}`);
}

function fail(gate: string, detail: string) {
 results.push({ gate, passed: false, detail });
 console.log(` [FAIL] ${gate}: ${detail}`);
}

function dateStr(offsetDays: number): string {
 const d = new Date();
 d.setUTCDate(d.getUTCDate() + offsetDays);
 return d.toISOString().slice(0, 10);
}

function dateAt(offsetDays: number): Date {
 const d = new Date();
 d.setUTCDate(d.getUTCDate() + offsetDays);
 d.setUTCHours(12, 0, 0, 0);
 return d;
}

const EVAL_USER = { id: "eval-harness-user", email: "eval-harness@internal", name: "Eval Harness" };
const EVAL_COURSE_ID = "eval-harness-course";
const EVAL_CHAPTER_ID = "eval-harness-chapter";
const EVAL_MTD_ID = "eval-harness-mtd";

async function setup() {
 await db.insert(user).values({ ...EVAL_USER, emailVerified: false, role: "student" }).onConflictDoNothing();

 await db.insert(courses).values({
 id: EVAL_COURSE_ID,
 title: "Eval Harness Course",
 category: "eval" as any,
 }).onConflictDoNothing();

 await db.insert(chapters).values({
 id: EVAL_CHAPTER_ID,
 courseId: EVAL_COURSE_ID,
 title: "Eval Chapter",
 orderIndex: 1,
 status: "published",
 }).onConflictDoNothing();

 await db.insert(masterTeachingDocuments).values({
 id: EVAL_MTD_ID,
 courseId: EVAL_COURSE_ID,
 title: "Eval MTD",
 markdownContent: "# Eval",
 version: 1,
 status: "active",
 createdById: EVAL_USER.id,
 }).onConflictDoNothing();

 const future = new Date();
 future.setFullYear(future.getFullYear() + 1);
 const [existing] = await db.select({ id: enrollments.id })
 .from(enrollments)
 .where(and(eq(enrollments.userId, EVAL_USER.id), eq(enrollments.courseId, EVAL_COURSE_ID)));
 if (!existing) {
 await db.insert(enrollments).values({
 id: randomUUID(),
 userId: EVAL_USER.id,
 courseId: EVAL_COURSE_ID,
 enrolledAt: new Date(),
 expiresAt: future,
 });
 }
}

async function teardown() {
 await db.delete(studentStreaks).where(eq(studentStreaks.studentId, EVAL_USER.id));
 await db.delete(learningEvents).where(eq(learningEvents.studentId, EVAL_USER.id));
 await db.delete(studentConceptMastery).where(eq(studentConceptMastery.studentId, EVAL_USER.id));
 await db.delete(knowledgeRelationships); // eval-harness KOs only if isolated; safe because relation table is global
 await db.delete(knowledgeObjects).where(eq(knowledgeObjects.courseId, EVAL_COURSE_ID));
 await db.delete(studyPaths).where(eq(studyPaths.studentId, EVAL_USER.id));
 await db.delete(aiUsageEvents).where(eq(aiUsageEvents.userId, EVAL_USER.id));
}

// ── Gate 2.3: Streak math ──────────────────────────────────────────────────────

async function runStreakGates() {
 console.log("\nGate 2.3: Streak math");

 const sid = EVAL_USER.id;
 const cid = EVAL_COURSE_ID;

 const resetStreak = async () => {
 await db.delete(studentStreaks).where(eq(studentStreaks.studentId, sid));
 await db.delete(learningEvents).where(and(eq(learningEvents.studentId, sid), eq(learningEvents.courseId, cid)));
 };

 const insertEvent = async (offsetDays: number) => {
 await db.insert(learningEvents).values({
 id: randomUUID(),
 studentId: sid,
 courseId: cid,
 eventType: "material_completed",
 weight: 1,
 createdAt: dateAt(offsetDays),
 });
 };

 // Test 1: consecutive increment (lastActive=yesterday, streak=5 => today => 6)
 await resetStreak();
 await db.insert(studentStreaks).values({ studentId: sid, currentStreak: 5, longestStreak: 8, lastActiveDate: dateStr(-1) });
 await insertEvent(0);
 const r1 = await getOrUpdateStreak(sid);
 if (r1.current === 6 && r1.longest === 8) {
 pass("2.3a", `consecutive increment current=${r1.current} longest=${r1.longest}`);
 } else {
 fail("2.3a", `expected current=6 longest=8, got ${r1.current}/${r1.longest}`);
 }

 // Test 2: gap resets to 1 (lastActive=3 days ago, streak=12)
 await resetStreak();
 await db.insert(studentStreaks).values({ studentId: sid, currentStreak: 12, longestStreak: 12, lastActiveDate: dateStr(-3) });
 await insertEvent(0);
 const r2 = await getOrUpdateStreak(sid);
 if (r2.current === 1 && r2.longest === 12) {
 pass("2.3b", `gap reset current=${r2.current} longest=${r2.longest}`);
 } else {
 fail("2.3b", `expected current=1 longest=12, got ${r2.current}/${r2.longest}`);
 }

 // Test 3: same-day no-op (second call same day should not increment)
 await resetStreak();
 await db.insert(studentStreaks).values({ studentId: sid, currentStreak: 3, longestStreak: 3, lastActiveDate: dateStr(0) });
 await insertEvent(0);
 const r3a = await getOrUpdateStreak(sid);
 const r3b = await getOrUpdateStreak(sid);
 if (r3a.current === 3 && r3b.current === 3) {
 pass("2.3c", `same-day no-op current=${r3a.current}/${r3b.current}`);
 } else {
 fail("2.3c", `expected both=3, got ${r3a.current}/${r3b.current}`);
 }

 await resetStreak();
}

// ── Gates 5.2/5.3: Study path soundness and determinism ───────────────────────

const KO_CONCEPTS = ["Alpha", "Beta", "Gamma", "Delta"] as const;
const KO_IDS = KO_CONCEPTS.map((c) => `ko-eval-${c.toLowerCase()}`);

async function seedPathFixtures() {
 await db.delete(studentConceptMastery).where(eq(studentConceptMastery.studentId, EVAL_USER.id));
 await db.delete(studyPaths).where(eq(studyPaths.studentId, EVAL_USER.id));
 await db.delete(knowledgeRelationships);
 await db.delete(knowledgeObjects).where(eq(knowledgeObjects.courseId, EVAL_COURSE_ID));

 for (let i = 0; i < KO_CONCEPTS.length; i++) {
 await db.insert(knowledgeObjects).values({
 id: KO_IDS[i],
 courseId: EVAL_COURSE_ID,
 mtdId: EVAL_MTD_ID,
 chapterId: EVAL_CHAPTER_ID,
 conceptId: `eval-concept-${i}`,
 learningOrder: i + 1,
 title: KO_CONCEPTS[i],
 conceptName: KO_CONCEPTS[i],
 content: `Content for ${KO_CONCEPTS[i]}`,
 type: "definition",
 difficulty: "medium",
 bloomLevel: "understand",
 importance: "medium",
 tags: [],
 });
 }

 // Prerequisite chain: Alpha -> Beta -> Gamma -> Delta
 for (let i = 0; i < KO_IDS.length - 1; i++) {
 await db.insert(knowledgeRelationships).values({
 id: `rel-eval-${i}`,
 sourceKoId: KO_IDS[i],
 targetKoId: KO_IDS[i + 1],
 type: "prerequisite",
 });
 }
}

async function runPathGates() {
 console.log("\nGates 5.2 / 5.3: Study path soundness and determinism");

 await seedPathFixtures();

 const now = new Date();

 // Seed mastery: Alpha=90, Beta=30 (weak), Gamma=80, Delta=25 (weak)
 const masteries = [
 { concept: "Alpha", score: 90 },
 { concept: "Beta", score: 30 },
 { concept: "Gamma", score: 80 },
 { concept: "Delta", score: 25 },
 ];
 for (const m of masteries) {
 await db.insert(studentConceptMastery).values({
 id: randomUUID(),
 studentId: EVAL_USER.id,
 courseId: EVAL_COURSE_ID,
 conceptName: m.concept,
 masteryScore: m.score,
 confidence: 70,
 evidenceCount: 3,
 lastEvidenceAt: now,
 });
 }

 // Gate 5.3: determinism ; two identical calls must produce identical output
 const pathA = await computeStudyPath(EVAL_USER.id, EVAL_COURSE_ID);
 const pathB = await computeStudyPath(EVAL_USER.id, EVAL_COURSE_ID);

 if (JSON.stringify(pathA) === JSON.stringify(pathB)) {
 pass("5.3", "recompute is byte-identical");
 } else {
 fail("5.3", "two calls produced divergent paths");
 }

 // Gate 5.2: soundness ; no available/in_progress step may have an unmet prerequisite
 const scoreMap = new Map(masteries.map((m) => [m.concept, m.score]));
 let violations = 0;
 for (const step of pathA) {
 if (step.status === "available" || step.status === "in_progress") {
 for (const prereq of step.prerequisites ?? []) {
 const s = scoreMap.get(prereq) ?? 0;
 if (s < 40) {
 violations++;
 console.error(` soundness violation: ${step.conceptName} unlocked but prereq ${prereq}=${s}`);
 }
 }
 }
 }
 if (violations === 0) {
 pass("5.2", `${pathA.length} steps, zero prerequisite violations`);
 } else {
 fail("5.2", `${violations} prerequisite violations found`);
 }

 // Cleanup
 await db.delete(studentConceptMastery).where(eq(studentConceptMastery.studentId, EVAL_USER.id));
 await db.delete(studyPaths).where(eq(studyPaths.studentId, EVAL_USER.id));
 await db.delete(knowledgeRelationships);
 await db.delete(knowledgeObjects).where(eq(knowledgeObjects.courseId, EVAL_COURSE_ID));
}

// ── Gate B.1: Usage budget ────────────────────────────────────────────────────

async function runBudgetGates() {
 console.log("\nGate B.1: Usage budget");

 const sid = EVAL_USER.id;

 // Clean slate
 await db.delete(aiUsageEvents).where(eq(aiUsageEvents.userId, sid));

 // With 0 events, should be allowed
 const ok0 = await UsageBudgetService.canUseFeature(sid, BUDGETS.tutorPerDay);
 if (ok0) {
 pass("B.1a", "canUseFeature true with 0 events");
 } else {
 fail("B.1a", "expected true with 0 events");
 }

 // Insert exactly BUDGETS.tutorPerDay non-cache events
 const inserts = Array.from({ length: BUDGETS.tutorPerDay }).map(() => ({
 id: randomUUID(),
 userId: sid,
 feature: "tutor_rag",
 model: "gemini-2.5-flash",
 tokens: 500,
 requestType: "grounded_answer",
 }));
 for (const v of inserts) {
 await db.insert(aiUsageEvents).values(v);
 }

 const okN = await UsageBudgetService.canUseFeature(sid, BUDGETS.tutorPerDay);
 if (!okN) {
 pass("B.1b", `canUseFeature false after ${BUDGETS.tutorPerDay} events (limit hit)`);
 } else {
 fail("B.1b", `expected false after ${BUDGETS.tutorPerDay} events`);
 }

 // Cache hits must not count against budget
 await db.insert(aiUsageEvents).values({
 id: randomUUID(),
 userId: sid,
 feature: "tutor_rag",
 model: "kv-cache",
 tokens: 0,
 requestType: "cache:hit",
 });

 const count = await UsageBudgetService.getDailyUsageCount(sid);
 if (count === BUDGETS.tutorPerDay) {
 pass("B.1c", `cache hits excluded from count (count=${count})`);
 } else {
 fail("B.1c", `expected count=${BUDGETS.tutorPerDay}, got ${count}`);
 }

 await db.delete(aiUsageEvents).where(eq(aiUsageEvents.userId, sid));
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
 console.log("=== P10 Eval Harness ===");

 await setup();

 try {
 await runStreakGates();
 await runPathGates();
 await runBudgetGates();
 } finally {
 await teardown();
 }

 const passed = results.filter((r) => r.passed).length;
 const total = results.length;

 console.log(`\n=== Result: ${passed}/${total} gates passed ===`);

 if (passed < total) {
 const failed = results.filter((r) => !r.passed);
 console.log("Failed gates:");
 for (const f of failed) {
 console.log(` [FAIL] ${f.gate}: ${f.detail}`);
 }
 process.exit(1);
 }

 console.log("All gates green.");
 process.exit(0);
}

main().catch((err) => {
 console.error("Eval harness error:", err?.message || err);
 process.exit(1);
});
