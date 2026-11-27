// Run as an isolated Bun process because module replacements are process-wide.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { mock } from "bun:test";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getRedirectStatusCodeFromError, getURLFromRedirectError } from "next/dist/client/components/redirect";
import { getAccessFallbackHTTPStatus, isHTTPAccessFallbackError } from "next/dist/client/components/http-access-fallback/http-access-fallback";
import { legacyEvaluationCases } from "../visual/native-parallel/operations/legacy-evaluation/cases";
import * as mockIdentity from "../visual/native-parallel/operations/mocks/evaluation-identity";
import { createEvaluationFixtureRequest } from "../../packages/native-parity/operations/evaluation-fixtures";
import { evaluationRead } from "../../packages/native-parity/operations/evaluation-contract";

let allowed = true;
const assertAdmin = async () => {
  if (!allowed) throw new Error("Fixture access denied");
  return { user: { id: "synthetic-admin" } };
};
mock.module("@/lib/auth/admin-guards-server", () => ({ assertAdmin, assertTutorOrAdmin: assertAdmin }));
mock.module("@/lib/admin/course-identity", () => mockIdentity);

const { runLegacyEvaluationPage } = await import("../visual/native-parallel/operations/legacy-evaluation/pages");
const fixture = createEvaluationFixtureRequest();
async function observe(href) {
  const url = new URL(href, "https://local.invalid");
  const segments = url.pathname.split("/").slice(2).map(decodeURIComponent);
  const search = Object.fromEntries(url.searchParams);
  try {
    await runLegacyEvaluationPage(segments, search);
  } catch (error) {
    if (isRedirectError(error)) return { status: getRedirectStatusCodeFromError(error), href: getURLFromRedirectError(error) };
    if (isHTTPAccessFallbackError(error)) return { status: getAccessFallbackHTTPStatus(error) };
    throw error;
  }
  throw new Error(`Alias returned without a Next.js redirect or notFound signal: ${href}`);
}

const cases = [];
for (const entry of legacyEvaluationCases) {
  const observed = await observe(entry.href);
  assert.equal(observed.status, entry.expected, entry.id);
  if (entry.expected === 404) {
    await assert.rejects(() => fixture(evaluationRead(entry.href)), { status: 404 }, entry.id);
    cases.push({ id: entry.id, path: entry.href, web: observed, native: { status: 404 } });
  } else {
    assert.equal(observed.href, entry.destination, entry.id);
    const native = await fixture(evaluationRead(entry.href));
    assert.deepEqual(native, { kind: "redirect", href: observed.href }, entry.id);
    cases.push({ id: entry.id, path: entry.href, web: observed, native });
  }
}

allowed = false;
const leafDenials = [];
for (const href of ["/admin/assessments", "/admin/assessments/retired", "/admin/diktats"]) {
  await assert.rejects(() => observe(href), { message: "Fixture access denied" });
  leafDenials.push({ path: href, outcome: "propagates the guard rejection" });
}
for (const href of ["/admin/leaderboard", "/admin/quiz-insights", "/admin/quiz-insights/kuis-energi"]) {
  const observed = await observe(href);
  assert.deepEqual(observed, { status: 307, href: "/admin" });
  leafDenials.push({ path: href, ...observed });
}
for (const href of ["/admin/quizzes", "/admin/quizzes/new", "/admin/quizzes/kuis-energi/edit"]) {
  const observed = await observe(href);
  assert.deepEqual(observed, { status: 307, href: "/" });
  leafDenials.push({ path: href, ...observed });
}
if (process.argv[2]) {
  await writeFile(process.argv[2], JSON.stringify({
    source: "Actual Next.js evaluation page redirect or notFound signals, called with local authorization and identity doubles",
    cases,
    leafDenials,
  }, null, 2) + "\n");
}
console.log(`${legacyEvaluationCases.length} route and 9 leaf authorization cases passed`);
