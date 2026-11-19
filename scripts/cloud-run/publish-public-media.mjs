import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("lib/storage/public-media.json", root), "utf8"));
const publish = process.argv[2] === "--publish";
if (process.argv.length > 2 && !publish) throw new Error("Expected --publish or no arguments");

const objects = Object.values(manifest).map(({ path, sha256, contentType }) => {
  const safePath = typeof path === "string" && path.split("/").every(
    (part) => /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(part),
  );
  if (!safePath || !path.startsWith("brand/") || !path.endsWith(".png") || contentType !== "image/png"
    || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("Invalid public media manifest entry");
  }
  const file = fileURLToPath(new URL(`public/${path}`, root));
  const digest = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (digest !== sha256) throw new Error(`Update the manifest checksum for ${path}`);
  return { file, key: `media/${sha256}/${path}`, contentType };
});

for (const { file, key, contentType } of objects) {
  console.log(key);
  if (!publish) continue;
  const result = spawnSync("bun", [
    "x", "--no-install", "wrangler", "r2", "object", "put", `zyx-staging-public/${key}`,
    "--remote", "--file", file, "--content-type", contentType,
    "--cache-control", "public, max-age=31536000, immutable",
  ], { stdio: "inherit", cwd: fileURLToPath(root) });
  if (result.status !== 0) throw new Error("Public R2 upload failed", { cause: result.error });
}
