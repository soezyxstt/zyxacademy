import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

type Capture = { file: string; sha256?: string };
type ProductCapture = { id: string; screenshot?: string; screenshotSha256?: string; screenshots?: (string | Capture)[] };

export function verifyWebCaptures(entry: ProductCapture, directory: string, passed: boolean) {
  const names = entry.screenshots ?? (entry.screenshot ? [{ file: entry.screenshot, sha256: entry.screenshotSha256 }]
    : passed ? [{ file: `${entry.id}.png` }] : []);
  return names.map(item => {
    const { file: name, sha256 } = typeof item === "string" ? { file: item, sha256: undefined } : item;
    if (typeof name !== "string" || basename(name) !== name) return { status: "invalid_path", name };
    const file = join(directory, name);
    if (!existsSync(file)) return { status: "missing", file };
    const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
    return { status: sha256 !== undefined && sha256 !== digest ? "sha256_mismatch" : "available", file, sha256: digest };
  });
}
