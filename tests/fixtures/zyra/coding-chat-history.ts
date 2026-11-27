import { expect, mock, test } from "bun:test";

import { zyraLiveProgress } from "@/lib/zyra/live-progress";

const saves: unknown[][] = [];
let pendingGeneration: Promise<void> | undefined;
let answer = "Penjelasan.\n```python\nprint(2)\n```";
let failSave = false;
mock.module("server-only", () => ({}));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "student" } }) } } }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => ({ hasCourseAccess: true, tier: "paid" }) }));
mock.module("@/lib/usage-budget-service", () => ({ FREE_ALLOWANCE_IDEMPOTENCY_PREFIX: "zyra-free:" }));
mock.module("@/app/actions/tutor", () => ({
  askTutorRagAction: async () => {
    if (pendingGeneration) {
      zyraLiveProgress.getStore()?.("receiving");
      await pendingGeneration;
    }
    return { sessionId: "session", answer, sources: [], responseLanguage: "id" };
  },
  saveTutorMessagesAction: async (...args: unknown[]) => { if (failSave) throw new Error("ZYRA_ATTACHMENT_LINK_FAILED"); saves.push(args); },
}));
const { POST } = await import("@/app/api/zyra/chat/route");

async function request(intent: "generate" | "hint", signal?: AbortSignal) {
  const response = await POST(new Request("http://localhost/api/zyra/chat", { method: "POST", signal, body: JSON.stringify({
    courseId: "course", question: "Tampilkan dua", attachmentIds: ["image"], requestId: "same-request",
    codingContext: { kind: "playground", code: "", stdin: "", execution: null, intent },
  }) }));
  expect(response.status).toBe(200);
  return response.text();
}

test("generation saves exactly one pair with image linkage and replay-safe explanation", async () => {
  saves.length = 0;
  const stream = await request("generate");
  expect(stream).toContain("print(2)");
  expect(saves).toHaveLength(1);
  expect(saves[0][3]).toBe("zyra:same-request");
  expect(stream).toContain('"saved":true');
  const rows = saves[0][1] as Array<{ content: string; attachmentIds?: string[] }>;
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ content: "Tampilkan dua", attachmentIds: ["image"] });
  expect(rows[1].content).not.toContain("print(2)");
  expect(rows[1].content).toContain("Jika belum diterapkan");
});

test("a failed history save preserves the answer and reports recovery without claiming persistence", async () => {
  failSave = true;
  try {
    const stream = await request("generate");
    expect(stream).toContain("print(2)");
    expect(stream).toContain('"saved":false');
    expect(stream).toContain("belum tersimpan");
    expect(stream).not.toContain("ZYRA_ATTACHMENT_LINK_FAILED");
  } finally { failSave = false; }
});

test("Tutor snippets remain in history, while aborted generation is not saved", async () => {
  saves.length = 0;
  await request("hint");
  expect((saves[0][1] as Array<{ content: string }>)[1].content).toContain("print(2)");
  saves.length = 0;
  const controller = new AbortController();
  controller.abort();
  await request("generate", controller.signal);
  expect(saves).toHaveLength(0);
});

test("stopping while the provider is streaming does not emit an answer or save a turn", async () => {
  saves.length = 0;
  let finishGeneration!: () => void;
  pendingGeneration = new Promise<void>(resolve => { finishGeneration = resolve; });
  const controller = new AbortController();
  try {
    const response = await POST(new Request("http://localhost/api/zyra/chat", { method: "POST", signal: controller.signal,
      body: JSON.stringify({ courseId: "course", question: "Help", codingContext: { kind: "playground", code: "", stdin: "", execution: null, intent: "generate" } }) }));
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let frames = "";
    while (!frames.includes('"stepId":"provider"')) {
      const { done, value } = await reader.read();
      if (done) throw new Error("Provider progress missing from stream");
      frames += decoder.decode(value, { stream: true });
    }
    controller.abort();
    finishGeneration();
    expect((await reader.read()).done).toBe(true);
    expect(frames).not.toContain('"type":"text-delta"');
    expect(saves).toHaveLength(0);
  } finally {
    finishGeneration();
    pendingGeneration = undefined;
  }
});

test("unframed Python is replaced by recovery guidance in saved history", async () => {
  saves.length = 0;
  const previous = answer;
  answer = "print(99)";
  try {
    await request("generate");
    const content = (saves[0][1] as Array<{ content: string }>)[1].content;
    expect(content).not.toContain("print(99)");
    expect(content).toContain("mode Tutor");
  } finally { answer = previous; }
});
