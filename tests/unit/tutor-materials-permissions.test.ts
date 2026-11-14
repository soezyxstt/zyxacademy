import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

it("renders material actions only for the admin override", () => {
  const preload = process.env.TUTOR_MATERIALS_TEST_PRELOAD;
  const runner = fileURLToPath(new URL("../helpers/tutor-materials-permissions-renderer.tsx", import.meta.url));
  const result = spawnSync(process.execPath, ["run", "--no-install", ...(preload ? [`--preload=${preload}`] : []), runner], {
    encoding: "utf8",
    timeout: 20_000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
});
