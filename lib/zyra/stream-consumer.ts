import { validateFollowups, type Followup } from "@/lib/zyra/followups";
import type { CanvasSpec } from "@/lib/zyra/canvas";
import { readZyraStream } from "@/packages/zyra/stream";

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
  | { type: "text-replace"; text: string }
  | { type: "chunk"; text: string }
  | { type: "data-followups"; followups: Followup[] }
  | { type: "data-sources"; sources: ZyraSource[] }
  | { type: "data-canvas"; canvasSpec: CanvasSpec }
  | { type: "data-session"; sessionId: string }
  | { type: "data-session-title"; sessionId: string; title: string }
  | { type: "data-history"; saved: boolean; message?: string }
  | { type: "data-response-language"; responseLanguage: ZyraResponseLanguage }
  | { type: "data-work-step"; data: ZyraWorkStepData }
  | { type: "data-error"; data: { message: string } }
  | { type: "done" };

export async function* consumeZyraStream<Part extends { type: string } = ZyraStreamPart>(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<Part | Extract<ZyraStreamPart, { type: "done" | "data-followups" }>, void, unknown> {
  for await (const event of readZyraStream(body, signal)) {
    if (signal?.aborted) return;
    if (event.type === "data-followups") {
      yield { type: "data-followups", followups: validateFollowups(event.followups) };
    } else {
      yield event as Part;
    }
  }
}
