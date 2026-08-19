import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { currentSourceCommit, parseCliArgs, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile, safeGuardError } from "@/lib/staging/staging-guard";
import { classifyPineconeCaller, isLegacyWriteCaller } from "@/lib/staging/cutover-contract";

type Finding = { file: string; line: number; classification: string; writeCaller: boolean; token: string };

function filesWithPinecone(): string[] {
  try {
    const output = execFileSync("rg", ["-l", "-i", "pinecone|PINECONE_|getNs\\(|shouldMirrorToVectorize", "app", "components", "db", "lib", "scripts", "workers", "package.json", "bun.lock", "docs", "AGENTS.md", "--glob", "!plans/**", "--glob", "!node_modules/**"], { encoding: "utf8" });
    return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const failOnWrite = args["fail-on-write"] === true;
  try {
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl"],
    });
    const findings: Finding[] = [];
    for (const relativePath of filesWithPinecone()) {
      const absolutePath = join(process.cwd(), relativePath);
      const content = await Bun.file(absolutePath).text();
      content.split(/\r?\n/).forEach((line, index) => {
        if (!/pinecone|PINECONE_|getNs\(|shouldMirrorToVectorize/i.test(line)) return;
        findings.push({
          file: relativePath.replaceAll("\\", "/"),
          line: index + 1,
          classification: classifyPineconeCaller(relativePath, line),
          writeCaller: isLegacyWriteCaller(line),
          token: line.toLowerCase().includes("pinecone") ? "pinecone" : "vector-routing",
        });
      });
    }
    const runtime = findings.filter((finding) => finding.classification === "runtime");
    const writeCallers = runtime.filter((finding) => finding.writeCaller);
    const artifact = {
      planNumber: "016",
      runId,
      status: failOnWrite && writeCallers.length > 0 ? "blocked" : runtime.length === 0 ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      stagingResourceFingerprints: guard.resources,
      failOnWrite,
      findings,
      counts: {
        total: findings.length,
        controlledDecommission: findings.filter((finding) => finding.classification === "controlled-decommission").length,
        legacyPreservation: findings.filter((finding) => finding.classification === "legacy-preservation").length,
        runtime: runtime.length,
        runtimeWriteCallers: writeCallers.length,
      },
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-016-legacy-caller-inventory.json", artifact);
    console.log(JSON.stringify({ status: artifact.status, runId, runtime: runtime.length, runtimeWriteCallers: writeCallers.length }));
    if (artifact.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", runId, ...safe }));
    process.exitCode = 1;
  }
}

void main();
