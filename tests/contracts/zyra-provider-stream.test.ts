import { expect, test } from "bun:test";
import { readChatCompletion } from "@/lib/ai/provider/chat-stream";

function response(frames: string[]) {
  return new Response(new ReadableStream({
    start(controller) {
      const bytes = new TextEncoder().encode(frames.map(frame => "data: " + frame + "\r\n\r\n").join(""));
      for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
}

test("reports visible deltas and preserves usage across fragmented SSE frames", async () => {
  const frames = [
    { choices: [{ delta: { reasoning_content: "private" } }] },
    { choices: [{ delta: { content: "Hasil " } }] },
    { choices: [{ delta: { content: "✓" }, finish_reason: "stop" }] },
    { choices: [], usage: { total_tokens: 9 } },
  ];
  let count = 0;
  const data = await readChatCompletion(response([...frames.map(frame => JSON.stringify(frame)), "[DONE]"]), () => count++);
  expect(count).toBe(2);
  expect(data.choices[0].message.content).toBe("Hasil ✓");
  expect(data.usage.total_tokens).toBe(9);
});

test("an interrupted stream cannot become a completed answer", async () => {
  await expect(readChatCompletion(response(['{"choices":[{"delta":{"content":"partial"}}]}']), () => {})).rejects.toThrow("Incomplete");
});
