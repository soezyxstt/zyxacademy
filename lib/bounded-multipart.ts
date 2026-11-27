export async function readBoundedMultipart(request: Request, maxBytes: number): Promise<
  { status: "parsed"; form: FormData } | { status: "invalid" | "size" }
> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) return { status: "invalid" };
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) return { status: "size" };
  if (!request.body) return { status: "invalid" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        return { status: "size" };
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const form = await new Response(Buffer.concat(chunks), { headers: { "content-type": contentType } }).formData();
    return { status: "parsed", form };
  } catch {
    return { status: "invalid" };
  }
}
