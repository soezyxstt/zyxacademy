import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { z } from "zod";

const descriptorSchema = z.object({ url: z.string().url(), checksum: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional() });
const progressSchema = z.object({ etag: z.string().min(1), total: z.number().int().positive(), checksum: z.string().nullable() });
const CHUNK_BYTES = 1024 * 1024;

async function optionalFile(path: string) {
  try { return await readFile(path, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Descriptor files may be replaced with a fresh signed URL after expiry. */
export async function downloadSourcePdf(descriptor: unknown, output: string) {
  const { url, checksum = null } = descriptorSchema.parse(descriptor);
  const part = `${output}.part`;
  const progressFile = `${output}.resume.json`;
  const saved = await optionalFile(progressFile);
  let progress = saved ? progressSchema.parse(JSON.parse(saved)) : null;
  if (progress && progress.checksum !== checksum) throw new Error("SOURCE_DOWNLOAD_CHANGED");
  let offset = 0;
  try { offset = (await stat(part)).size; } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (offset && !progress) throw new Error("SOURCE_DOWNLOAD_PROGRESS_MISSING");
  if (progress && offset > progress.total) throw new Error("SOURCE_DOWNLOAD_PROGRESS_INVALID");
  // Never overwrite an existing completed destination.
  try { await stat(output); throw new Error("SOURCE_DOWNLOAD_DESTINATION_EXISTS"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  while (!progress || offset < progress.total) {
    const response = await fetch(url, { headers: { "Accept-Encoding": "identity", Range: `bytes=${offset}-${offset + CHUNK_BYTES - 1}`,
      ...(progress ? { "If-Match": progress.etag } : {}) }, signal: AbortSignal.timeout(30_000) });
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
    const etag = response.headers.get("etag");
    if (response.status !== 206 || !range || !etag || !response.body) {
      await response.body?.cancel();
      throw new Error(response.status === 403 ? "SOURCE_DOWNLOAD_URL_EXPIRED" : "SOURCE_DOWNLOAD_RANGE_FAILED");
    }
    const [start, end, total] = range.slice(1).map(Number);
    if (start !== offset || end < start || end >= total || end - start + 1 > CHUNK_BYTES ||
        (progress && (etag !== progress.etag || total !== progress.total))) {
      await response.body.cancel();
      throw new Error("SOURCE_DOWNLOAD_CHANGED");
    }
    progress = { etag, total, checksum };
    await writeFile(`${progressFile}.tmp`, JSON.stringify(progress), { mode: 0o600 });
    await rename(`${progressFile}.tmp`, progressFile);
    const file = await open(part, "a", 0o600);
    const reader = response.body.getReader();
    let finished = false;
    try {
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) { finished = true; break; }
        if (offset + chunk.byteLength > end + 1) throw new Error("SOURCE_DOWNLOAD_RANGE_FAILED");
        let written = 0;
        while (written < chunk.byteLength) {
          const result = await file.write(chunk, written, chunk.byteLength - written);
          if (!result.bytesWritten) throw new Error("SOURCE_DOWNLOAD_WRITE_FAILED");
          written += result.bytesWritten;
          offset += result.bytesWritten;
        }
      }
    } finally {
      if (!finished) await reader.cancel().catch(() => undefined);
      await file.close();
    }
    if (offset !== end + 1) throw new Error("SOURCE_DOWNLOAD_INTERRUPTED");
  }
  if (checksum) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(part)) hash.update(chunk);
    if (hash.digest("hex") !== checksum) throw new Error("SOURCE_DOWNLOAD_CHECKSUM_MISMATCH");
  }
  await link(part, output);
  await rm(part);
  await rm(progressFile);
  return { bytes: offset };
}

if (import.meta.main) {
  const [descriptorPath, output] = process.argv.slice(2);
  if (!descriptorPath || !output) throw new Error("Usage: bun scripts/download-source-pdf.ts descriptor.json output.pdf");
  try {
    const result = await downloadSourcePdf(JSON.parse(await readFile(descriptorPath, "utf8")), output);
    console.info(`Downloaded ${result.bytes} bytes`);
  } catch (error) {
    // Do not print signed URLs or transport errors containing credentials.
    console.error(error instanceof Error && /^SOURCE_/.test(error.message) ? error.message : "SOURCE_DOWNLOAD_FAILED");
    process.exitCode = 1;
  }
}
