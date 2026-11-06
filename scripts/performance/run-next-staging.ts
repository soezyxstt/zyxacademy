import { createConnection } from "node:net";
import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { parseBuildKind, preserveOriginalBaseline, recordCandidateBuild, sourceHash, verifyBuild, writeServerRecord } from "./build-provenance";
import { resolve } from "node:path";
import {
  loadVerifiedStagingEnvironment,
} from "./staging-env-loader";

const args = process.argv.slice(2);
const kindIndex = args.indexOf("--build-kind");
if (kindIndex >= 0 && !args[kindIndex + 1]) throw new Error("MISSING_BUILD_KIND");
const buildKind = parseBuildKind(kindIndex < 0 ? undefined : args[kindIndex + 1]);
if (kindIndex >= 0) args.splice(kindIndex, 2);
const recordIndex = args.indexOf("--server-record");
if (recordIndex >= 0 && !args[recordIndex + 1]) throw new Error("MISSING_SERVER_RECORD_PATH");
const serverRecord = recordIndex >= 0 ? resolve(args[recordIndex + 1]!) : null;
if (recordIndex >= 0) args.splice(recordIndex, 2);
const command = args[0] || "start";
if (!["start", "build"].includes(command)) throw new Error("UNSUPPORTED_VERIFIED_COMMAND");
if (!args.length) args.push(command);
const portIdx = args.indexOf("--port");
const port =
  portIdx >= 0 && args[portIdx + 1] ? Number(args[portIdx + 1]) : Number(process.env.PORT || 3100);

const verification = loadVerifiedStagingEnvironment({ port });
process.env.NODE_ENV = "production";

if (command === "build") {
  if (buildKind !== "candidate") throw new Error("BASELINE_BUILD_IMMUTABLE: Use --build-kind candidate to build");
  preserveOriginalBaseline();
  const identityPath = resolve(".next/zyx-candidate-identity.json");
  if (existsSync(identityPath)) unlinkSync(identityPath);
}
const beforeBuildHash = command === "build" ? sourceHash() : null;
const buildProvenance = command === "start" ? verifyBuild(buildKind, verification) : null;
if (serverRecord && command !== "start") throw new Error("SERVER_RECORD_REQUIRES_START");
if (serverRecord) {
  const listening = await new Promise<boolean>((done) => {
    const socket = createConnection({ host: "localhost", port });
    socket.setTimeout(1500);
    socket.once("connect", () => { socket.destroy(); done(true); });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code !== "ECONNREFUSED") throw error;
      done(false);
    });
    socket.once("timeout", () => { socket.destroy(); done(true); });
  });
  if (listening) throw new Error("SERVER_RECORD_PORT_ALREADY_OWNED");
}
if (serverRecord) writeServerRecord(serverRecord, {
  launcher: "run-next-staging", pid: process.pid, port, buildKind, verification, buildProvenance,
});

if (!process.env.NODE_OPTIONS?.includes("--max-old-space-size")) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=4096`.trim();
}

console.log(
  JSON.stringify({
    launcher: "run-next-staging",
    buildKind,
    command: args[0] || "start",
    port,
    nodeEnv: process.env.NODE_ENV,
    verification,
    buildProvenance,
  })
);

const nextBin = resolve(process.cwd(), "node_modules/next/dist/bin/next");
const child = spawn("node", [nextBin, ...args], {
  stdio: "inherit",
  env: process.env,
  cwd: process.cwd(),
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (serverRecord) unlinkSync(serverRecord);
  if (!signal && code === 0 && command === "build") {
    recordCandidateBuild(verification, beforeBuildHash!);
  }
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
