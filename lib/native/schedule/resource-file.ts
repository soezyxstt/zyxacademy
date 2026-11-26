import { createHash } from "node:crypto";
import { extractStorageKey, isSafeKey, slugifySegment } from "@/lib/storage/keys";
import { scheduleFilePolicy, type SchedulePhase } from "@/packages/native-parity/schedule/resources";

export function matchesScheduleFile(bytes: Uint8Array, mime: string): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  switch (mime) {
    case "application/pdf": return /%PDF-\d\.\d/.test(ascii(0, 32));
    case "image/jpeg": return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    case "image/png": return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    case "image/webp": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    default: return false;
  }
}

export function resourceDownloadKey(bookingId: string, phase: SchedulePhase, storedUrl: string): string | null {
  if (/^https?:\/\//i.test(storedUrl)) {
    const provider = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
    if (!provider || !storedUrl.startsWith(provider + "/")) return null;
  }
  if (storedUrl.startsWith("//") || /[?#]/.test(storedUrl)) return null;
  const key = extractStorageKey(storedUrl);
  if (!key || !isSafeKey(key)) return null;
  const [root, booking, folder, leaf, extra] = key.split("/");
  if (root !== "schedules" || booking !== slugifySegment(bookingId, "booking") ||
    folder !== (phase === "pre" ? "pre_session" : "post_session") ||
    !leaf || leaf === "." || extra !== undefined) return null;
  return key;
}

export function scopedUploadId(sessionId: string, bookingId: string, requestId: string) {
  return createHash("sha256").update(JSON.stringify([sessionId, bookingId, requestId])).digest("hex");
}

export async function readScheduleMultipart(request: Request): Promise<FormData | 400 | 413 | 415> {
  const limit = scheduleFilePolicy.maxBytes + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit) return 413;
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "multipart/form-data") return 415;
  if (!request.body) return 400;
  let size = 0;
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > limit) controller.error(new Error("Multipart limit"));
      else controller.enqueue(chunk);
    },
  }));
  try {
    return await new Response(body, { headers: request.headers }).formData();
  } catch {
    return size > limit ? 413 : 400;
  }
}
