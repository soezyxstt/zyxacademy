import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";
import { currentSourceCommit, parseCliArgs, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";
import { validateCanvasSpec } from "@/lib/zyra/canvas";

const syntheticSpec = {
  version: "zyra-learning-canvas-v1",
  type: "function_plot",
  title: "Synthetic staging canvas",
  purpose: "Memastikan visual terstruktur dan evaluasi lokal tetap aman.",
  variables: [{ id: "a", label: "Koefisien", min: 0, max: 2, defaultValue: 1 }],
  controls: [{ variableId: "a", label: "Koefisien a", min: 0, max: 2, step: 1, presets: [1, 2] }],
  claimRefs: ["synthetic-claim"],
  altText: "Grafik fungsi kuadrat synthetic dengan kontrol koefisien.",
  fallback: {
    summary: "Tabel synthetic menjadi fallback yang dapat dibaca pembaca layar.",
    columns: [{ id: "x", label: "x" }, { id: "y", label: "y" }],
    rows: [["0", "0"], ["1", "1"]],
  },
  domain: { min: -1, max: 1, sampleCount: 20 },
  series: [{ id: "f", label: "f(x)", expression: "a*x^2" }],
};

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const course = requiredCliArg(args, "course");
  const guard = assertStagingEnvironment({
    productionEnv: parseEnvFile(`${process.cwd()}/.env.prod`),
    requiredResources: ["database", "authUrl", "vectorizeWorker"],
  });
  const valid = validateCanvasSpec(syntheticSpec, ["synthetic-claim"]).isValid;
  const artifact = {
    status: valid ? "passed" : "failed",
    plan: "009",
    phase: "canvas_synthetic_contract",
    runId,
    course,
    sourceCommit: currentSourceCommit(),
    stagingResourceFingerprints: guard.resources.map(({ key, hash }) => ({ key, hash })),
    fixtures: 1,
    providerCalls: 0,
    databaseWrites: 0,
    traceWrites: 0,
    learnerSideEffects: 0,
    networkRequestsDuringControls: 0,
    secretsPrinted: false,
    authenticatedUrlsPrinted: false,
  };
  await writeArtifact(runId, "plan-009-canvas.json", artifact);
  console.log(JSON.stringify(artifact));
  if (!valid) process.exitCode = 1;
}

await main();
