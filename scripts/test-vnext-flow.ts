import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { validateCanonicalMarkdown } from "../lib/canonical-validator";
import { parseAssessmentMarkdownIntoBlocks, extractAssessmentObjectsForSource } from "../lib/assessment-extractor";
import { validateQuestionAgainstPolicy } from "../lib/pedagogical-validator";
import { db } from "../db";
import { courses, masterTeachingDocuments, assessmentSources, assessmentObjects, assessmentProfiles, coursePolicies, user } from "../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

async function runTests() {
  console.log("=== STARTING Zyx CONTENT ARCHITECTURE VNEXT TESTS ===\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // Test 1: Canonical Markdown Pre-Ingestion Validation
  // ----------------------------------------------------
  console.log("\n--- Test 1: Canonical Markdown Validation ---");
  
  const validMarkdown = `# Kalkulus 1 - Limit
## Bab 1: Limit Intuisi
Ini adalah teks biasa. $x \to c$ maka $f(x) \to L$.
:::concept {koId="ko-1", title="Limit Intuisi"}
Definisi limit secara intuitif:
$$\\lim_{x \\to c} f(x) = L$$
:::`;

  const validRes = validateCanonicalMarkdown(validMarkdown);
  assert(validRes.success === true, "Valid markdown passes validation");

  const invalidMarkdown = `# Bad Document
## Section 1
:::concept {koId="bad-1"}
Unclosed container block
`;

  const invalidRes = validateCanonicalMarkdown(invalidMarkdown);
  assert(invalidRes.success === false, "Unclosed container fails validation");
  assert(
    invalidRes.errors.some(e => e.includes("Unclosed container")),
    "Validation reports unclosed container error correctly"
  );

  const badKaTeXMarkdown = `# Bad KaTeX
## Section 1
This formula is broken: $\\lim_{x \\to \\infty \\frac{1}{x}$
`;
  const badKaTeXRes = validateCanonicalMarkdown(badKaTeXMarkdown);
  assert(badKaTeXRes.success === false, "Malformed KaTeX fails validation");
  assert(
    badKaTeXRes.errors.some(e => e.includes("KaTeX")),
    "Validation reports KaTeX compile failure correctly"
  );

  // ----------------------------------------------------
  // Test 2: Assessment Markdown Ingestion & Profiling
  // ----------------------------------------------------
  console.log("\n--- Test 2: Assessment Ingestion & Profiling ---");

  // Create a temp course to attach test data
  const courseId = `test-course-${randomUUID().slice(0, 8)}`;
  await db.insert(courses).values({
    id: courseId,
    title: "Test Engineering Mathematics",
    description: "Course for testing vNext features",
    category: "Matematika",
  });

  let userId = "test-user";
  const [existingUser] = await db.select().from(user).limit(1);
  if (existingUser) {
    userId = existingUser.id;
  } else {
    await db.insert(user).values({
      id: userId,
      name: "Test User",
      email: "test@example.com",
      role: "admin",
    });
  }

  const mtdId = `test-mtd-${randomUUID().slice(0, 8)}`;
  const mtdMarkdown = `# UTS 2026 - Soal Kalkulus
## Soal 1
Tentukan nilai limit berikut:
$$\\lim_{x \\to 2} \\frac{x^2 - 4}{x - 2}$$
Options:
A. 4
B. 2
C. 0
D. Tidak terdefinisi

## Soal 2
Apakah fungsi $f(x) = |x|$ memiliki turunan di $x = 0$? Jelaskan.
`;

  const sourceId = `source-${randomUUID()}`;
  await db.insert(assessmentSources).values({
    id: sourceId,
    courseId,
    title: "Test UTS 2026",
    category: "uts",
    year: 2026,
    semester: 1,
    sourceMarkdown: mtdMarkdown,
    sourceHash: "test-hash",
    version: 1,
    parserVersion: "1.0.0",
    ingestionStatus: "pending",
    uploadedByUserId: userId,
  });

  const blocks = parseAssessmentMarkdownIntoBlocks(mtdMarkdown);
  assert(blocks.length === 3, `Correctly parsed assessment markdown into ${blocks.length} blocks`);

  // Run assessment objects extraction (MOCK mode)
  process.env.MOCK_GEMINI = "true";
  await extractAssessmentObjectsForSource(sourceId, true);

  const objects = await db
    .select()
    .from(assessmentObjects)
    .where(eq(assessmentObjects.sourceId, sourceId));
  assert(objects.length === 3, `Extracted and stored ${objects.length} Assessment Objects in database`);

  // Assert Assessment Profile was created
  const [profile] = await db
    .select()
    .from(assessmentProfiles)
    .where(eq(assessmentProfiles.courseId, courseId));
  assert(profile !== undefined, "Assessment Profile dynamically created for course");
  assert(Array.isArray(profile.commonPatterns), "Profile features commonPatterns array");
  assert(Array.isArray(profile.topContexts), "Profile features topContexts array");

  // Assert Course Policy was created
  const [policy] = await db
    .select()
    .from(coursePolicies)
    .where(eq(coursePolicies.courseId, courseId));
  assert(policy !== undefined, "Course Policy dynamically initialized for course");

  // ----------------------------------------------------
  // Test 3: Pedagogical Policy Validator
  // ----------------------------------------------------
  console.log("\n--- Test 3: Pedagogical Policy Validation ---");

  // Update policy with forbidden context terms
  await db
    .update(coursePolicies)
    .set({
      forbiddenContexts: ["bannedword", "cheating"],
      maxApplicationLevel: 2,
      maxEstimatedSteps: 4,
    })
    .where(eq(coursePolicies.courseId, courseId));

  const [updatedPolicy] = await db
    .select()
    .from(coursePolicies)
    .where(eq(coursePolicies.courseId, courseId));

  // Valid question passes
  const validQuestion = {
    prompt: "Calculate limit of $x$ as $x \\to c$.",
    options: ["c", "0", "1", "undefined"],
    explanation: "Standard limit calculation.",
    bloomLevel: "apply" as const, // level = 2
    pattern: "direct_computation",
    estimatedSteps: 2,
  };
  const validPolicyRes = validateQuestionAgainstPolicy(validQuestion, updatedPolicy);
  assert(validPolicyRes.success === true, "Valid question satisfies policy rules");

  // Question with forbidden word fails
  const bannedQuestion = {
    prompt: "This is a bannedword question.",
    options: ["A", "B", "C", "D"],
    explanation: "Simple explanation.",
    bloomLevel: "remember" as const, // level = 0
    estimatedSteps: 1,
  };
  const bannedPolicyRes = validateQuestionAgainstPolicy(bannedQuestion, updatedPolicy);
  assert(bannedPolicyRes.success === false, "Question with banned keyword is rejected");
  assert(
    bannedPolicyRes.errors.some(e => e.includes("forbidden")),
    "Validation reports forbidden term correctly"
  );

  // Question with high Bloom level fails
  const highLevelQuestion = {
    prompt: "Evaluate the correctness of the proof.",
    options: ["Correct", "Incorrect", "Incomplete", "Indeterminate"],
    explanation: "Evaluation requires level 4.",
    bloomLevel: "evaluate" as const, // level = 4, exceeds policy maximum of 2
    estimatedSteps: 3,
  };
  const highLevelPolicyRes = validateQuestionAgainstPolicy(highLevelQuestion, updatedPolicy);
  assert(highLevelPolicyRes.success === false, "Question exceeding max Bloom level is rejected");

  // Question with too many estimated steps fails
  const longQuestion = {
    prompt: "Solve this long equation.",
    options: ["1", "2", "3", "4"],
    explanation: "Requires 6 steps.",
    bloomLevel: "apply" as const,
    estimatedSteps: 6, // exceeds policy maximum of 4
  };
  const longPolicyRes = validateQuestionAgainstPolicy(longQuestion, updatedPolicy);
  assert(longPolicyRes.success === false, "Question exceeding max estimated steps is rejected");

  // Cleanup testing records
  await db.delete(assessmentObjects).where(eq(assessmentObjects.sourceId, sourceId));
  await db.delete(assessmentSources).where(eq(assessmentSources.id, sourceId));
  await db.delete(assessmentProfiles).where(eq(assessmentProfiles.courseId, courseId));
  await db.delete(coursePolicies).where(eq(coursePolicies.courseId, courseId));
  await db.delete(masterTeachingDocuments).where(eq(masterTeachingDocuments.id, mtdId));
  await db.delete(courses).where(eq(courses.id, courseId));

  console.log(`\n=== TEST SUITE COMPLETED: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
