import { EventSourceParserStream } from "eventsource-parser/stream";

export async function readChatCompletion(response: Response, received: (delta: string) => void) {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) return response.json();
  if (!response.body) throw new Error("Missing provider stream");
  const events = response.body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream());
  const reader = events.getReader();
  let content = "", finishReason: string | undefined, usage;
  let sawDone = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value.data || !value.data.trim()) continue;
      if (value.data.trim() === "[DONE]") {
        sawDone = true;
        break;
      }
      let chunk: Record<string, any>;
      try {
        chunk = JSON.parse(value.data);
      } catch (parseError) {
        if (content.length > 0) {
          console.warn("[ChatStream] Ignoring malformed trailing SSE frame after content:", parseError);
          continue;
        }
        throw parseError;
      }
      if (!chunk || typeof chunk !== "object") continue;
      if (chunk.error) throw new Error("Provider stream failed");
      const choice = chunk.choices?.[0];
      if (typeof choice?.delta?.content === "string" && choice.delta.content) {
        content += choice.delta.content;
        received(choice.delta.content);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk.usage) usage = chunk.usage;
    }
    if (!finishReason) {
      if (sawDone && content.length > 0) {
        finishReason = "stop";
      } else {
        throw new Error("Incomplete provider stream");
      }
    }
    return { choices: [{ message: { content }, finish_reason: finishReason }], usage };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
