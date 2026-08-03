import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { computeIdeaMastery, hashIdeaMasteryState } from "@/lib/pemahaman/engine";
import {
  currentSourceCommit,
  parseCliArgs,
  readArtifact,
  requiredCliArg,
  sha256Text,
  stableStringify,
  writeArtifact,
} from "@/lib/staging/migration-ledger";
import { loadEvidenceGroups, openStagingIdeaDb, resolveCourse } from "./idea-mastery-support";

type RecomputeMode = "full" | "incremental";

type PriorResult = {
  asOf?: string;
  fullStateHash?: string;
};

function isMode(value: string | boolean | undefined): value is RecomputeMode {
  return value === "full" || value === "incremental";
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const requestedCourseId = typeof args.course === "string" ? args.course : "tutorial-pka";
  const modeValue = typeof args.mode === "string" ? args.mode : "full";
  if (!isMode(modeValue)) throw new Error("PLAN_011_INVALID_MODE");
  const expectNoop = args["expect-noop"] === true;
  let prior: PriorResult = {};
  if (modeValue === "incremental") {
    try {
      prior = await readArtifact<PriorResult>(runId, "plan-011-result.json");
    } catch {
      throw new Error("PLAN_011_FULL_RESULT_REQUIRED_BEFORE_INCREMENTAL");
    }
  }
  const asOf = new Date(
    prior.asOf ?? (typeof args["as-of"] === "string" ? args["as-of"] : new Date().toISOString()),
  );
  let client: { close(): void } | null = null;

  try {
    const opened = openStagingIdeaDb(true);
    client = opened.client;
    const resolution = await resolveCourse(opened.db, requestedCourseId);
    const groups = await loadEvidenceGroups(opened.db, resolution.ideaIds);
    const computed = groups.map((group) => {
      const state = computeIdeaMastery(group.ideId, group.evidence, asOf);
      return {
        penggunaId: group.penggunaId,
        ideaId: group.ideId,
        score: state.score,
        confidence: state.confidence,
        evidenceCount: state.evidenceCount,
        evidenceIds: state.evidenceIds,
        inputWatermark: state.inputWatermark,
        algorithmVersion: state.algorithmVersion,
        stateHash: hashIdeaMasteryState(state),
      };
    });

    const existingByKey = new Map<string, typeof schema.pemahamanIde.$inferSelect>();
    for (const row of computed) {
      const [existing] = await opened.db
        .select()
        .from(schema.pemahamanIde)
        .where(and(eq(schema.pemahamanIde.penggunaId, row.penggunaId), eq(schema.pemahamanIde.ideId, row.ideaId)))
        .limit(1);
      if (existing) existingByKey.set(`${row.penggunaId}:${row.ideaId}`, existing);
    }

    const changes = computed.filter((row) => {
      const existing = existingByKey.get(`${row.penggunaId}:${row.ideaId}`);
      return !existing || existing.skor !== row.score || existing.keyakinan !== row.confidence || existing.evidenceCount !== row.evidenceCount || existing.algorithmVersion !== row.algorithmVersion || existing.inputWatermark !== row.inputWatermark;
    });
    if (expectNoop && changes.length > 0) throw new Error("PLAN_011_INCREMENTAL_NOT_NOOP");

    let changeRows = 0;
    if (changes.length > 0) {
      await opened.db.transaction(async (tx) => {
        for (const row of changes) {
          const existing = existingByKey.get(`${row.penggunaId}:${row.ideaId}`);
          const masteryId = existing?.id ?? `pemahaman-${sha256Text(`${row.penggunaId}|${row.ideaId}`).slice(0, 40)}`;
          const now = new Date();
          if (existing) {
            await tx
              .update(schema.pemahamanIde)
              .set({
                skor: row.score,
                keyakinan: row.confidence,
                evidenceCount: row.evidenceCount,
                version: existing.version + 1,
                algorithmVersion: row.algorithmVersion,
                inputWatermark: row.inputWatermark,
                updatedAt: now,
              })
              .where(eq(schema.pemahamanIde.id, existing.id));
          } else {
            await tx.insert(schema.pemahamanIde).values({
              id: masteryId,
              penggunaId: row.penggunaId,
              ideId: row.ideaId,
              skor: row.score,
              keyakinan: row.confidence,
              evidenceCount: row.evidenceCount,
              version: 1,
              algorithmVersion: row.algorithmVersion,
              inputWatermark: row.inputWatermark,
              createdAt: now,
              updatedAt: now,
            });
          }
          const changeId = `perubahan-${sha256Text(`${masteryId}|${row.inputWatermark}|${row.stateHash}`).slice(0, 40)}`;
          await tx
            .insert(schema.perubahanPemahaman)
            .values({
              id: changeId,
              pemahamanIdeId: masteryId,
              evidenceId: null,
              previousScore: existing?.skor ?? 0,
              nextScore: row.score,
              previousConfidence: existing?.keyakinan ?? 0,
              nextConfidence: row.confidence,
              reason: modeValue === "full" ? "staging_full_replay" : "staging_incremental_replay",
              evidenceIds: row.evidenceIds,
              algorithmVersion: row.algorithmVersion,
              inputWatermark: row.inputWatermark,
              createdAt: now,
            })
            .onConflictDoNothing();
          changeRows += 1;
        }
      });
    }

    const stored = [];
    for (const row of computed) {
      const [storedRow] = await opened.db
        .select({
          penggunaId: schema.pemahamanIde.penggunaId,
          ideaId: schema.pemahamanIde.ideId,
          score: schema.pemahamanIde.skor,
          confidence: schema.pemahamanIde.keyakinan,
          evidenceCount: schema.pemahamanIde.evidenceCount,
          inputWatermark: schema.pemahamanIde.inputWatermark,
          algorithmVersion: schema.pemahamanIde.algorithmVersion,
        })
        .from(schema.pemahamanIde)
        .where(and(eq(schema.pemahamanIde.penggunaId, row.penggunaId), eq(schema.pemahamanIde.ideId, row.ideaId)))
        .limit(1);
      if (storedRow) stored.push({ ...storedRow, stateHash: row.stateHash });
    }

    const stateHash = sha256Text(stableStringify(stored));
    const hashesMatch = modeValue === "full" ? true : Boolean(prior.fullStateHash && prior.fullStateHash === stateHash);
    const uniqueEvidenceIds = new Set(groups.flatMap((group) => group.evidence.map((item) => item.id)));
    const totalEvidenceRows = groups.reduce((sum, group) => sum + group.evidence.length, 0);
    const report = {
      planNumber: "011",
      phase: "recompute",
      runId,
      mode: modeValue,
      status: hashesMatch && (!expectNoop || changeRows === 0) ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      requestedCourseId,
      normalizedCourseId: resolution.normalizedCourseId,
      fixtureMode: resolution.fixtureMode,
      fallbackReason: resolution.fallbackReason,
      asOf: asOf.toISOString(),
      ideaCount: resolution.ideaIds.length,
      evidenceGroupCount: groups.length,
      totalEvidenceRows,
      duplicateEvidenceRows: totalEvidenceRows - uniqueEvidenceIds.size,
      changedRows: changeRows,
      stateHash,
      fullStateHash: modeValue === "full" ? stateHash : prior.fullStateHash ?? null,
      hashesMatch,
      storedStateCount: stored.length,
      aiCalls: 0,
      legacyRowsModified: 0,
      commands: [
        "bun --env-file=.env.staging run staging:preflight",
        `bun --env-file=.env.staging run staging:recompute-idea-mastery -- --run-id ${runId} --course ${requestedCourseId} --mode ${modeValue}${expectNoop ? " --expect-noop" : ""}`,
      ],
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-011-result.json", report);
    console.log(JSON.stringify({ status: report.status, runId, mode: report.mode, changedRows: report.changedRows, hashesMatch: report.hashesMatch, duplicateEvidenceRows: report.duplicateEvidenceRows }));
    if (report.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ status: "blocked", runId, mode: modeValue, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  } finally {
    client?.close();
  }
}

void main();
