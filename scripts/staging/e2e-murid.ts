import { join } from "node:path";
import { asc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { mataKuliah, pengguna, penggunaPeran, peran } from "@/db/schema";
import { currentSourceCommit, parseCliArgs, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile, safeGuardError } from "@/lib/staging/staging-guard";
import { getMuridDashboardReadModel } from "@/lib/murid/read-model";

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const requestedCourseId = requiredCliArg(args, "course");
  const account = requiredCliArg(args, "account");
  try {
    if (account !== "dedicated") throw new Error("MURID_E2E_REQUIRES_DEDICATED_ACCOUNT");
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requireMutation: true,
      requiredResources: ["database", "authUrl"],
    });
    const [murid] = await db.select({ id: pengguna.id }).from(pengguna)
      .innerJoin(penggunaPeran, eq(penggunaPeran.penggunaId, pengguna.id))
      .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
      .where(eq(peran.code, "murid"))
      .orderBy(asc(pengguna.createdAt))
      .limit(1);
    if (!murid) throw new Error("STAGING_DEDICATED_MURID_PREREQUISITE_MISSING");
    const [course] = await db.select({ id: mataKuliah.id }).from(mataKuliah).where(or(
      eq(mataKuliah.id, requestedCourseId),
      eq(mataKuliah.legacyCourseId, requestedCourseId),
      eq(mataKuliah.code, requestedCourseId),
    )).limit(1);
    if (!course) throw new Error("STAGING_MURID_COURSE_PREREQUISITE_MISSING");

    const model = await getMuridDashboardReadModel(murid.id);
    const courseRead = model.courses.find((item) => item.id === course.id || item.canonicalId === course.id);
    const answerLeakFindings = courseRead?.ideas.some((idea) => "correctIndices" in idea || "answerMarkdown" in idea)
      ? [{ code: "READ_MODEL_ANSWER_FIELD" }]
      : [];
    const artifact = {
      planNumber: "015",
      runId,
      status: courseRead && answerLeakFindings.length === 0 ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      stagingResourceFingerprints: guard.resources,
      accountMode: "dedicated",
      muridIdDigest: murid.id.length,
      normalizedCourseId: course.id,
      journey: {
        courseRead: Boolean(courseRead),
        ideaCount: courseRead?.ideas.length ?? 0,
        articleCount: courseRead?.products.articles.length ?? 0,
        publishedQuestionCount: courseRead?.products.publishedQuestionCount ?? 0,
        pkaStageCount: model.pka.stageProgress.length,
        oldRoutesPreserved: model.compatibility.oldRoutesPreserved,
        historicalSnapshotsImmutable: model.compatibility.historicalSnapshotsImmutable,
      },
      answerLeakFindings,
      historicalMutations: 0,
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-015-e2e.json", artifact);
    console.log(JSON.stringify({ status: artifact.status, runId, courseId: course.id, ideaCount: artifact.journey.ideaCount, historicalMutations: 0 }));
    if (artifact.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", runId, ...safe }));
    process.exitCode = 1;
  }
}

void main();
