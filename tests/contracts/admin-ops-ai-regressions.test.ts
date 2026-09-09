import { afterEach, describe, expect, it } from "bun:test";
import {
  buildOpsAiSystemPrompt,
  createOpsAiRuntimeResponse,
} from "@/lib/admin-ops-ai/runtime";
import { setOpsAiModelStreamMock } from "@/lib/admin-ops-ai/model-factory";
import {
  resolveQuizCourseReference,
  scoreQuizTitleMatch,
} from "@/lib/admin-ops-ai/domain-assessment";
import type { OpsAiWorkStep } from "@/lib/admin-ops-ai/contracts";

async function parseSseEvents(response: Response): Promise<Array<Record<string, any>>> {
  const text = await response.text();
  const events: Array<Record<string, any>> = [];

  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const raw = line.slice(6).trim();
    if (raw === "[DONE]") {
      events.push({ type: "done" });
      continue;
    }
    try {
      events.push(JSON.parse(raw));
    } catch {
      // Ignore non-JSON SSE lines.
    }
  }

  return events;
}

describe("Zyx Ops AI conversation regressions", () => {
  afterEach(() => {
    setOpsAiModelStreamMock(null);
  });

  it("resolves human course references and minor quiz title typos", () => {
    const courses = [
      { id: "tutorial-pka", title: "Tutorial PKA" },
      { id: "kalkulus-1", title: "Kalkulus I" },
    ];

    expect(resolveQuizCourseReference(courses, "PKA")).toEqual(["tutorial-pka"]);
    expect(resolveQuizCourseReference(courses, "Tutorial PKA")).toEqual(["tutorial-pka"]);
    expect(resolveQuizCourseReference(courses, "tutorial-pka")).toEqual(["tutorial-pka"]);

    expect(scoreQuizTitleMatch("3.2", "Kuis 3.2: Fisika")).toBeGreaterThanOrEqual(90);
    expect(scoreQuizTitleMatch("kusi uji 5", "Kuis Uji UI 5")).toBeGreaterThanOrEqual(52);
  });

  it("grounds capability claims in the tools actually exposed to the model", () => {
    const prompt = buildOpsAiSystemPrompt();

    expect(prompt).toContain("TOOL AKTIF PADA SESI INI");
    expect(prompt).toContain("list_quizzes");
    expect(prompt).toContain("Hasil 0 BUKAN bukti final");
    expect(prompt).not.toContain("- create_quiz:");
    expect(prompt).not.toContain("- reset_quiz_attempt:");
  });

  it("retries one empty synthesis and never marks an empty final answer completed", async () => {
    let modelCalls = 0;
    setOpsAiModelStreamMock(async function* () {
      modelCalls++;
      yield { type: "finish", finishReason: "stop" };
    });

    const response = createOpsAiRuntimeResponse({
      messages: [
        {
          role: "user",
          content: "Bukannya tadi Anda bilang Kuis Uji UI 5 ada di PKA?",
        },
      ],
    });

    const events = await parseSseEvents(response);
    expect(modelCalls).toBe(2);

    const text = events
      .filter((event) => event.type === "text-delta")
      .map((event) => String(event.textDelta || ""))
      .join("");
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).toContain("Silakan ulangi permintaan terakhir");

    const synthesisSteps = events
      .filter((event) => event.type === "data-work-step")
      .map((event) => event.data as OpsAiWorkStep)
      .filter((step) => step.stepType === "synthesis");

    expect(synthesisSteps.some((step) => step.status === "failed")).toBe(true);
    expect(synthesisSteps.some((step) => step.status === "completed")).toBe(false);
  });

  it("marks all runtime-originated tool calls as model calls", async () => {
    let modelCalls = 0;
    setOpsAiModelStreamMock(async function* () {
      if (modelCalls++ === 0) {
        yield {
          type: "tool-call",
          toolCall: {
            id: "call-forbidden-create-quiz",
            name: "create_quiz",
            args: {
              courseId: "tutorial-pka",
              title: "Tidak boleh dibuat",
            },
          },
        };
        yield { type: "finish", finishReason: "tool-calls" };
        return;
      }

      yield {
        type: "text-delta",
        textDelta: "Aksi tersebut tidak tersedia untuk model pada sesi ini.",
      };
      yield { type: "finish", finishReason: "stop" };
    });

    const response = createOpsAiRuntimeResponse({
      messages: [{ role: "user", content: "Buat kuis baru" }],
      toolContext: { callerRole: "admin", actorId: "admin-test" },
    });

    const events = await parseSseEvents(response);
    const forbiddenResult = events.find(
      (event) =>
        event.type === "tool-result" && event.toolCallId === "call-forbidden-create-quiz"
    );

    expect(forbiddenResult).toBeDefined();
    expect(String(forbiddenResult?.output?.error || "")).toContain(
      "tidak diizinkan untuk dipanggil oleh model AI"
    );
  });
});
