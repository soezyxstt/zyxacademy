import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "bun:test";
import { downloadSourcePdf } from "@/scripts/download-source-pdf";

it("resumes a truncated Range response with a renewed URL, validates ETag and checksum, and preserves the destination", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zyx-pdf-"));
  const output = join(dir, "source.pdf");
  const bytes = new Uint8Array(2 * 1024 * 1024 + 23).fill(65);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const requests: Array<{ start: number; match: string | null }> = [];
  let interrupt = true;
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(request) {
    const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.get("range") ?? "")!;
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), bytes.length - 1);
    requests.push({ start, match: request.headers.get("if-match") });
    const body = bytes.slice(start, interrupt ? start + 257 : end + 1);
    interrupt = false;
    return new Response(body, { status: 206, headers: { ETag: '"v1"', "Content-Range": `bytes ${start}-${end}/${bytes.length}` } });
  } });
  try {
    const url = `http://127.0.0.1:${server.port}/source.pdf`;
    await expect(downloadSourcePdf({ url, checksum }, output)).rejects.toThrow("SOURCE_DOWNLOAD_INTERRUPTED");
    expect((await stat(`${output}.part`)).size).toBe(257);
    const result = await downloadSourcePdf({ url: `${url}?renewed=true`, checksum }, output);
    expect(requests[1]).toEqual({ start: 257, match: '"v1"' });
    expect(result.bytes).toBe(bytes.byteLength);
    expect(new Uint8Array(await readFile(output))).toEqual(bytes);
    await expect(stat(`${output}.resume.json`)).rejects.toThrow();
    await expect(downloadSourcePdf({ url, checksum }, output)).rejects.toThrow("DESTINATION_EXISTS");
  } finally { server.stop(true); await rm(dir, { recursive: true, force: true }); }
});

it("rejects changed ETags, wrong ranges, and expired URLs without appending untrusted bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zyx-pdf-"));
  const output = join(dir, "source.pdf");
  let state = "initial";
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch() {
    if (state === "expired") return new Response("expired", { status: 403 });
    if (state === "initial") return new Response(new Uint8Array([1, 2]), { status: 206,
      headers: { ETag: '"v1"', "Content-Range": "bytes 0-9/10" } });
    return new Response(new Uint8Array(8), { status: 206, headers: {
      ETag: state === "changed" ? '"v2"' : '"v1"', "Content-Range": state === "range" ? "bytes 0-7/10" : "bytes 2-9/10",
    } });
  } });
  try {
    const descriptor = { url: `http://127.0.0.1:${server.port}/source.pdf` };
    await expect(downloadSourcePdf(descriptor, output)).rejects.toThrow("INTERRUPTED");
    for (const next of ["changed", "range", "expired"]) {
      state = next;
      await expect(downloadSourcePdf(descriptor, output)).rejects.toThrow(next === "expired" ? "URL_EXPIRED" : "SOURCE_DOWNLOAD_CHANGED");
      expect((await stat(`${output}.part`)).size).toBe(2);
    }
  } finally { server.stop(true); await rm(dir, { recursive: true, force: true }); }
});
