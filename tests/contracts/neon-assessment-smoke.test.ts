import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { assessmentSmokeArguments, assessmentProvenance, waitForAssessmentVectors } from "../../scripts/neon/smoke-assessment-worker";

test("assessment smoke requires an explicit production target before private config", () => {
  for (const args of [[], ["prod"], ["staging"], ["production", "extra"]]) expect(() => assessmentSmokeArguments(args)).toThrow();
  expect(assessmentSmokeArguments(["production"]).name).toBe("production");
});
test("assessment provenance rejects missing, malformed, or duplicate ownership IDs", () => {
  const created = { conceptId: "12345678-1234-4234-8234-123456789abc", localizationId: "cl-12345678-1234-4234-8234-123456789abc" };
  expect(assessmentProvenance([created])).toEqual([created]);
  expect(assessmentProvenance([])).toEqual([]);
  for (const value of [undefined, {}, [{ conceptId: "foreign", localizationId: "foreign" }], [created, created]]) {
    expect(() => assessmentProvenance(value)).toThrow();
  }
});
test("assessment acceptance requires the exact vector hash, dimensions, and observed deletion", async () => {
  const expected = [{ vectorId: "owned", contentHash: "hash", courseId: "course" }];
  const vector = { id: "owned", values: Array(768).fill(0.2), metadata: { contentHash: "hash", courseId: "course", profileId: "canonical-content-v2", namespace: "itb_question_references" } };
  let reads = 0;
  await waitForAssessmentVectors(async () => ++reads === 1 ? [] : [vector], expected, true, async () => {});
  expect(reads).toBe(2);
  await expect(waitForAssessmentVectors(async () => [{ ...vector, id: "foreign" }], expected, true)).rejects.toThrow("FOREIGN_VECTOR");
  await expect(waitForAssessmentVectors(async () => [{ ...vector, values: [1] }], expected, true)).rejects.toThrow("VECTOR_MISMATCH");
  await expect(waitForAssessmentVectors(async () => [{ ...vector, metadata: { ...vector.metadata, courseId: "foreign" } }], expected, true)).rejects.toThrow("VECTOR_MISMATCH");
  await expect(waitForAssessmentVectors(async () => { throw new Error("HTTP_FAILURE"); }, expected, false)).rejects.toThrow("HTTP_FAILURE");
  await expect(waitForAssessmentVectors(async () => [vector], expected, false, async () => {})).rejects.toThrow("DELETE_PENDING");
});
test("assessment smoke guards production identity and preserves uncertain catalog ownership", () => {
  const source = readFileSync("scripts/neon/smoke-assessment-worker.ts", "utf8");
  const write = source.indexOf("await db.transaction(");
  for (const guard of ["assertWorkerEnvironment(target, config)", 'assert.equal(environments.data[0].id, target.inngestEnvironment)',
    "ASSESSMENT_SMOKE_EVENT_KEY_MISMATCH", "assert.equal(worker.version, config.ZYX_COMPUTE_REVISION)"]) {
    expect(source.indexOf(guard)).toBeGreaterThan(-1); expect(source.indexOf(guard)).toBeLessThan(write);
  }
  expect(source.indexOf("if (createdConcepts.length)")).toBeLessThan(source.indexOf("await vectors.delete("));
  expect(source).toContain("assessment-retained.json");
  expect(source).toContain("for update");
  expect(source.indexOf("await waitForAssessmentVectors(readVectors, expected, false)")).toBeLessThan(source.indexOf("await tx.delete(s.assessmentSources)"));
  expect(source).not.toContain("tx.delete(s.concepts).where(inArray");
});
