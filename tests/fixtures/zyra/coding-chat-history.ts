import { expect, mock, test } from "bun:test";

const saves: unknown[][] = [];
let answer = "Penjelasan.\n```python\nprint(2)\n```";
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "student" } }) } } }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => ({ hasCourseAccess: true, tier: "paid" }) }));
mock.module("@/lib/usage-budget-service", () => ({ FREE_ALLOWANCE_IDEMPOTENCY_PREFIX: "zyra-free:" }));
mock.module("@/app/actions/tutor", () => ({
  askTutorRagAction: async () => ({ sessionId: "session", answer, sources: [], responseLanguage: "id" }),
  saveTutorMessagesAction: async (...args: unknown[]) => { saves.push(args); },
}));
const { POST } = await import("@/app/api/zyra/chat/route");

async function request(intent: "generate" | "hint", signal?: AbortSignal) {
  const response = await POST(new Request("http://localhost/api/zyra/chat", { method: "POST", signal, body: JSON.stringify({
    courseId: "course", question: "Tampilkan dua", attachmentIds: ["image"],
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
  const rows = saves[0][1] as Array<{ content: string; attachmentIds?: string[] }>;
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ content: "Tampilkan dua", attachmentIds: ["image"] });
  expect(rows[1].content).not.toContain("print(2)");
  expect(rows[1].content).toContain("Jika belum diterapkan");
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
