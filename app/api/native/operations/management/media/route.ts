import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { getAuthSession } from "@/lib/auth-session";
import { getNativeOperationsAdmin } from "@/lib/auth/native-operations-admin";
import { MEDIA_DOCUMENT_MIME_TYPES, MEDIA_MAX_UPLOAD_BYTES } from "@/lib/media";
import { storage } from "@/lib/storage";
import { replaceMediaLibraryFile, uploadMediaLibraryFile } from "@/lib/storage/media-library-files";
import { ManagementFailure } from "@/packages/native-parity/operations/management-contract";
import { nativeProviderMutation } from "../provider";

const maxMultipartBytes = MEDIA_MAX_UPLOAD_BYTES + 16 * 1024;
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const statuses = { invalid: 400, forbidden: 403, "not-found": 404, conflict: 409, "payload-too-large": 413,
  unsupported: 415, uncertain: 424, pending: 425, unavailable: 503 } satisfies Record<ManagementFailure["code"], number>;

async function mediaForm(request: Request) {
  if (Number(request.headers.get("content-length")) > maxMultipartBytes) throw new ManagementFailure("payload-too-large");
  if (!request.body) throw new ManagementFailure("invalid");
  let read = 0;
  let oversized = false;
  const bounded = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      read += chunk.byteLength;
      if (read > maxMultipartBytes) {
        oversized = true;
        controller.error(new ManagementFailure("payload-too-large"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
  try {
    return await new Response(bounded, { headers: request.headers }).formData();
  } catch {
    throw new ManagementFailure(oversized ? "payload-too-large" : "invalid");
  }
}

async function fingerprint(file: File) {
  const hash = createHash("sha256");
  const reader = file.stream().getReader();
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) return hash.digest("hex");
      hash.update(item.value);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if ((origin && origin !== request.nextUrl.origin) || (fetchSite && fetchSite !== "same-origin")) return reply({ error: "forbidden" }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "multipart/form-data") return reply({ error: "expected-multipart" }, 415);
  try {
    const admin = await getNativeOperationsAdmin();
    if (!admin.ok) return reply({ error: "forbidden" }, admin.status);
    const auth = await getAuthSession();
    const sessionId = auth?.session?.id;
    if (!sessionId || auth.user.id !== admin.user.id || request.headers.get("x-native-operations-user-id") !== admin.user.id ||
      request.headers.get("x-native-operations-session-id") !== sessionId) return reply({ error: "forbidden" }, 403);
    const requestKey = request.headers.get("x-native-operations-request-key");
    if (!requestKey || !/^[A-Za-z0-9_-]{16,100}$/.test(requestKey)) return reply({ error: "invalid" }, 400);

    const form = await mediaForm(request);
    const type = form.get("action");
    const file = form.get("file");
    const field = type === "upload" ? "destination" : "key";
    const target = form.get(field);
    if ((type !== "upload" && type !== "replace") || [...form.keys()].sort().join(",") !== ["action", "file", field].sort().join(",") ||
      !(file instanceof File) || !file.size || typeof target !== "string" || !MEDIA_DOCUMENT_MIME_TYPES.includes(file.type)) return reply({ error: "invalid" }, 400);
    if (file.size > MEDIA_MAX_UPLOAD_BYTES) return reply({ error: "payload-too-large" }, 413);
    const media = { fileHash: await fingerprint(file), mime: file.type };
    const action = type === "upload" ? { ...media, type: "media.upload", destination: target, name: file.name }
      : { ...media, type: "media.replace", key: target };
    const receipt = await nativeProviderMutation({ id: admin.user.id, sessionId }, request.nextUrl.origin, requestKey, action, async checked => {
      if (checked.type === "media.upload") return { id: (await uploadMediaLibraryFile(file, checked.destination.replace(/^media\//, ""))).key };
      if (checked.type !== "media.replace") throw new ManagementFailure("invalid");
      if (!(await storage.exists(checked.key))) throw new ManagementFailure("not-found");
      return { id: (await replaceMediaLibraryFile(file, checked.key)).key };
    });
    return reply(receipt);
  } catch (error) {
    const code = error instanceof ZodError ? "invalid" : error instanceof ManagementFailure ? error.code : "unavailable";
    return reply({ error: code }, statuses[code]);
  }
}
