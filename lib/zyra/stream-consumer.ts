import type { CanvasSpec } from "@/lib/zyra/canvas";

export interface ZyraSource {
  type: string;
  id: string;
  label: string;
  href: string;
}

export interface ZyraWorkStepData {
  stepId: string;
  label: string;
  status: string;
}

export type ZyraResponseLanguage = "id" | "en";

export type ZyraStreamPart =
  | { type: "text-delta"; textDelta: string }
  | { type: "chunk"; text: string }
  | { type: "data-sources"; sources: ZyraSource[] }
  | { type: "data-canvas"; canvasSpec: CanvasSpec }
  | { type: "data-session"; sessionId: string }
  | { type: "data-response-language"; responseLanguage: ZyraResponseLanguage }
  | { type: "data-work-step"; data: ZyraWorkStepData }
  | { type: "data-error"; data: { message: string } }
  | { type: "done" };

export async function* consumeZyraStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<ZyraStreamPart, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const dataStr = trimmed.slice(6).trim();
        if (dataStr === "[DONE]") {
          yield { type: "done" };
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed && typeof parsed === "object" && "type" in parsed) {
            yield parsed as ZyraStreamPart;
          }
        } catch {
          // Ignore malformed JSON chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
