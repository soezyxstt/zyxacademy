import { test, expect } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Operations generates protected cases by default and retains historical public cases on request", () => {
  const directory = mkdtempSync(join(tmpdir(), "zyx-operations-cases-"));
  try {
    for (const [flag, expectedCount] of [["0", 108], ["1", 147]] as const) {
      const flows = join(directory, `flows-${flag}`);
      const cases = join(directory, `cases-${flag}`);
      const run = Bun.spawnSync([process.execPath, "scripts/native-parity/operations/capture-cases.ts", flows, cases], {
        env: { ...process.env, NATIVE_PARITY_PUBLIC_FIXTURES: flag },
      });
      expect(run.stderr.toString()).toBe("");
      expect(run.exitCode).toBe(0);
      const rows = JSON.parse(readFileSync(join(cases, "manifest.json"), "utf8")) as { id: string; path: string }[];
      expect(readdirSync(flows)).toHaveLength(expectedCount);
      expect(rows).toHaveLength(expectedCount);
      expect(rows.filter(row => row.id.startsWith("operations-public-"))).toHaveLength(flag === "1" ? 39 : 0);
      expect(rows.some(row => row.path === "/admin/forms")).toBe(true);
      expect(rows.some(row => row.path === "/admin/meet")).toBe(true);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
