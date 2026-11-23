import { EventSourceParserStream } from "eventsource-parser/stream";

export async function readChatCompletion(response: Response, received: (delta: string) => void) {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) return response.json();
  if (!response.body) throw new Error("Missing provider stream");
  const events = response.body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream());
  const reader = events.getReader();
  let content = "", finishReason: string | undefined, usage;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done || value.data === "[DONE]") break;
      const chunk = JSON.parse(value.data);
      if (chunk.error) throw new Error("Provider stream failed");
      const choice = chunk.choices?.[0];
      if (typeof choice?.delta?.content === "string" && choice.delta.content) {
        content += choice.delta.content;
        received(choice.delta.content);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk.usage) usage = chunk.usage;
    }
    if (!finishReason) throw new Error("Incomplete provider stream");
    return { choices: [{ message: { content }, finish_reason: finishReason }], usage };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
