/** Student mutations accept bounded JSON bodies before their operation schema runs. */
export async function readNativeStudentJson(request: Request, limit = 64 * 1024): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!request.body || contentType !== "application/json") throw new SyntaxError("Expected JSON");
  if (Number(request.headers.get("content-length")) > limit) throw new SyntaxError("Request too large");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => {});
        throw new SyntaxError("Request too large");
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(body + decoder.decode()) as unknown;
}
