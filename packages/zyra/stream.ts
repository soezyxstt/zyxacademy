export type ZyraWireEvent = { type: string } & Record<string, unknown>;

/** Read the newline-terminated data lines emitted by the Zyra chat endpoint. */
export async function* readZyraStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<ZyraWireEvent, void, unknown> {
  if (signal?.aborted) return;

  const decoder = new TextDecoder();
  const reader = body.getReader();
  const cancel = () => {
    // A pending read settles as soon as cancellation starts, even if source cleanup stalls.
    void reader.cancel(signal?.reason).catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });

  let buffer = "";
  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      if (signal?.aborted) {
        // Match the rejection a fetch reader produces when its request is aborted in flight.
        throw signal.reason ?? Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
      }
      if (done) return;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (signal?.aborted) return;
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6).trim();
        if (payload === "[DONE]") {
          yield { type: "done" };
          return;
        }

        let event: unknown;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        if (event && typeof event === "object" && "type" in event && typeof event.type === "string") {
          yield event as ZyraWireEvent;
        }
      }
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
