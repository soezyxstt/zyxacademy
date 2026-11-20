import { randomUUID } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export async function runIsolatedAiTest(fixture: URL): Promise<void> {
  const envFile = join(tmpdir(), `zyx-ai-test-${randomUUID()}.env`);
  writeFileSync(envFile, "", { flag: "wx" });
  const env: Record<string, string> = {
    DATABASE_URL: "postgresql://local:local@127.0.0.1:5432/dummy",
    SKIP_ENV_VALIDATION: "1",
  };
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA"]) {
    if (process.env[key]) env[key] = process.env[key]!;
  }
  try {
    const child = Bun.spawn([process.execPath, `--env-file=${envFile}`, "test", "--timeout", "60000", fileURLToPath(fixture)], {
      cwd: process.cwd(), env, stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    const output = `${stdout}\n${stderr}`;
    const passed = output.match(/\b(\d+) pass\b/)?.[1];
    if (status !== 0 || !passed) throw new Error(`Isolated AI test failed with exit ${status}:\n${output}`);
    console.log(`${fileURLToPath(fixture)}: ${passed} pass, exit ${status}`);
  } finally {
    unlinkSync(envFile);
  }
}
