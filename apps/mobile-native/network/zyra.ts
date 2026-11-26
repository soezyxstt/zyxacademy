import { readZyraStream, type ZyraWireEvent } from "../../../packages/zyra/stream";
import type { NativeResponse, NativeSessionTransport } from "./transport";

const STREAM_TIMEOUT_MS = 65_000;

export type NativeZyraRequest = Readonly<{
  courseId: string;
  question: string;
  /** Reuse the same ID for an explicit retry of the same turn. */
  requestId: string;
  conceptId?: string | null;
  sessionId?: string | null;
  attachmentIds?: readonly string[];
  pathname?: string | null;
  responseLanguage?: "id" | "en";
  selectionContext?: {
    snippet: string;
    blockType?: string;
    surroundingText?: string;
    sectionTitle?: string;
    chapterTitle?: string;
  } | null;
  /** The existing endpoint validates coding locators and execution evidence. */
  codingContext?: Record<string, unknown> | null;
}>;

const ERROR_MESSAGES = {
  http: "Zyra rejected the request.",
  protocol: "Zyra did not return an event stream.",
  incomplete: "The Zyra stream ended before completion.",
  timeout: "The Zyra stream timed out.",
};

export class NativeZyraStreamError extends Error {
  constructor(readonly code: keyof typeof ERROR_MESSAGES, readonly status?: number) {
    super(ERROR_MESSAGES[code]);
    this.name = "NativeZyraStreamError";
  }
}

/** Sends one authenticated turn and yields the wire events for a renderer to interpret. */
export async function* streamNativeZyra(
  session: NativeSessionTransport,
  request: NativeZyraRequest,
  signal?: AbortSignal,
): AsyncGenerator<ZyraWireEvent, void, unknown> {
  if (!/^[A-Za-z0-9._:-]{1,96}$/.test(request.requestId)) {
    throw new TypeError("A valid Zyra request ID is required.");
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const assertCurrent = () => {
    session.assertCurrent();
    if (controller.signal.aborted) {
      if (timedOut) throw new NativeZyraStreamError("timeout");
      throw Object.assign(new Error("The Zyra stream was cancelled."), { name: "AbortError" });
    }
  };
  let timedOut = false;
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  session.signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    cancel();
  }, STREAM_TIMEOUT_MS);

  let response: NativeResponse | undefined;
  try {
    assertCurrent();
    response = await session.request("/api/zyra/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    assertCurrent();
    if (!response.ok) throw new NativeZyraStreamError("http", response.status);
    const contentType = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
    const body = response.body;
    if (contentType !== "text/event-stream" || !body) throw new NativeZyraStreamError("protocol");

    let complete = false;
    for await (const event of readZyraStream(body, controller.signal)) {
      assertCurrent();
      if (event.type === "done") {
        complete = true;
        break;
      }
      yield event;
    }
    assertCurrent();
    if (!complete) throw new NativeZyraStreamError("incomplete");
  } catch (error) {
    assertCurrent();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    session.signal.removeEventListener("abort", cancel);
    response?.dispose();
  }
  yield { type: "done" };
}
