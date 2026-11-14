import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mapLegacyQuizSnapshotToCanonicalIdeas } from "../../lib/asesmen/live-idea-evidence";

const route = readFileSync("app/api/quiz/attempts/[id]/route.ts", "utf8");
const start = route.indexOf("const canonicalEvidenceEnabled =");
const end = route.indexOf("const canonicalEvidenceIdeaIds =", start);
if (start < 0 || end <= start) throw new Error("Canonical evidence preflight missing");
const body = new Bun.Transpiler({ loader: "ts" }).transformSync(route.slice(start, end));
const preflight = new Function("loadCanonicalQuestionsForEvidence", "mapLegacyQuizSnapshotToCanonicalIdeas", "isCanonicalIdeaEvidenceEnabled", "db", "questionIds", "snapshot", "id", "console", `return (async () => { ${body}; return canonicalEvidencePlan; })();`);
const snapshot = [{ id: "q", question_type: "multiple_choice", options: ["A", "B"], correct_indices: [0] }];
function run(loader: () => Promise<unknown[]>) {
  return preflight(loader, mapLegacyQuizSnapshotToCanonicalIdeas, () => true, {}, ["q"], snapshot, "attempt", { warn() {} });
}

test("canonical lookup failure propagates before submission writes", async () => {
  const unavailable = new Error("DATABASE_TEMPORARILY_UNAVAILABLE");
  let writesReached = false;
  await expect((async () => {
    await run(async () => { throw unavailable; });
    writesReached = true;
  })()).rejects.toBe(unavailable);
  expect(writesReached).toBe(false);
});

test("a successful lookup distinguishes matching and missing canonical data", async () => {
  const mapped = await run(async () => [{ id: "q", status: "published", version: 1, questionType: "multiple_choice", generationHash: "fixture", ideaLinks: [{ ideaId: "idea", weight: 1, role: "primary", ideaStatus: "published", ideaVersion: 1 }] }]);
  expect(mapped.status).toBe("mapped");
  expect(mapped.mappings).toHaveLength(1);
  const blocked = await run(async () => []);
  expect(blocked.status).toBe("blocked");
  expect(blocked.issues[0].code).toBe("MISSING_CANONICAL_QUESTION");
});
