import type { NativeResponse } from "./transport";

/** Encode small private images without persisting a remote URL or a disk cache entry. */
export async function inlineImage(response: Pick<NativeResponse, "ok" | "body" | "headers">, mime: string, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Image unavailable");
  const text: string[] = [];
  let length = 0;
  try {
    if (!response.ok || Number(response.headers.get("content-length")) > maxBytes) throw new Error("Image unavailable");
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > maxBytes) throw new Error("Image unavailable");
      for (let index = 0; index < chunk.value.length; index += 4096) {
        text.push(String.fromCharCode(...chunk.value.subarray(index, index + 4096)));
      }
    }
    if (!length) throw new Error("Image unavailable");
    return `data:${mime};base64,${btoa(text.join(""))}`;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
