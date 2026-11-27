import { z } from "zod";

export const nativeAdminIdSchema = z.string().trim().min(1).max(256).regex(/^[^/\\\u0000-\u001f]+$/u);

export async function readNativeAdminJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  try {
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return JSON.parse(text + decoder.decode()) as unknown;
      bytes += chunk.value.byteLength;
      if (bytes > 48 * 1024) { await reader.cancel(); return null; }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
