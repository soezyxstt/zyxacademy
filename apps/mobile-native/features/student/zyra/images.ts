import { ZYRA_IMAGE_MAX_SANITIZED_BYTES, ZyraImageMimeSchema, ZyraMessageAttachmentSchema, type ZyraMessageAttachment } from "../../../../../lib/zyra/images/contracts";
import type { NativeSessionTransport } from "../../../network/transport";

const endpoint = "/api/zyra/attachments";

export type ZyraUploadedImage = ZyraMessageAttachment & { sessionId: string; expiresAt: number; byteSize: number };

export async function uploadZyraImage(session: NativeSessionTransport, courseId: string, sessionId: string | null,
  photo: { uri: string; name: string; mimeType: string }, signal: AbortSignal): Promise<ZyraUploadedImage> {
  const form = new FormData();
  form.append("courseId", courseId);
  if (sessionId) form.append("sessionId", sessionId);
  form.append("file", { uri: photo.uri, name: photo.name, type: photo.mimeType } as unknown as Blob);
  const response = await session.request(endpoint, { method: "POST", signal, requiredRole: "murid",
    headers: { "x-student-id": session.scope.accountId, Origin: session.scope.origin }, body: form });
  try {
    if (response.status !== 201) throw new Error("Zyra image upload failed");
    const data = await response.json() as Partial<ZyraMessageAttachment & { sessionId: string; expiresAt: string; byteSize: number }>;
    const attachment = ZyraMessageAttachmentSchema.safeParse({ id: data.id, mimeType: data.mimeType, width: data.width, height: data.height });
    const expiresAt = Date.parse(data.expiresAt ?? "");
    if (!attachment.success || typeof data.sessionId !== "string" ||
      !data.sessionId || (sessionId && data.sessionId !== sessionId) || !Number.isFinite(expiresAt) ||
      typeof data.byteSize !== "number" || !Number.isSafeInteger(data.byteSize) || data.byteSize < 1 || data.byteSize > ZYRA_IMAGE_MAX_SANITIZED_BYTES) {
      throw new Error("Invalid Zyra image receipt");
    }
    session.assertCurrent();
    return { ...attachment.data, sessionId: data.sessionId, expiresAt, byteSize: data.byteSize };
  } finally { response.dispose(); }
}

function imagePath(courseId: string, sessionId: string, id: string) {
  return `${endpoint}/${encodeURIComponent(id)}?${new URLSearchParams({ courseId, sessionId })}`;
}

export async function deleteZyraImage(session: NativeSessionTransport, courseId: string, image: Pick<ZyraUploadedImage, "id" | "sessionId">, signal: AbortSignal) {
  const response = await session.request(imagePath(courseId, image.sessionId, image.id), { method: "DELETE", signal, requiredRole: "murid",
    headers: { "x-student-id": session.scope.accountId, Origin: session.scope.origin } });
  try {
    if (!response.ok && response.status !== 404) throw new Error("Could not remove image");
    session.assertCurrent();
  } finally { response.dispose(); }
}

export async function readZyraImage(session: NativeSessionTransport, courseId: string, sessionId: string, id: string, signal: AbortSignal) {
  const response = await session.request(imagePath(courseId, sessionId, id), { signal, headers: { "x-student-id": session.scope.accountId } });
  try {
    const mime = ZyraImageMimeSchema.safeParse(response.headers.get("content-type"));
    if (!response.ok || !mime.success || Number(response.headers.get("content-length")) > ZYRA_IMAGE_MAX_SANITIZED_BYTES) throw new Error("Image unavailable");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Image unavailable");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > ZYRA_IMAGE_MAX_SANITIZED_BYTES) throw new Error("Image unavailable");
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    if (!length) throw new Error("Image unavailable");
    session.assertCurrent();
    const text: string[] = [];
    for (const chunk of chunks) {
      for (let offset = 0; offset < chunk.length; offset += 4096) text.push(String.fromCharCode(...chunk.subarray(offset, offset + 4096)));
    }
    return `data:${mime.data};base64,${btoa(text.join(""))}`;
  } finally { response.dispose(); }
}
