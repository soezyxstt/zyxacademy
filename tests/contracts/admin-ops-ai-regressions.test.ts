import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOpsAiSystemPrompt,
  createOpsAiRuntimeResponse,
  DEFAULT_OPS_AI_TOOLS,
} from "@/lib/admin-ops-ai/runtime";
import { setOpsAiModelStreamMock } from "@/lib/admin-ops-ai/model-factory";
import {
  createOpsAiTools,
  OPS_TOOL_DEFINITIONS,
} from "@/lib/admin-ops-ai/runtime-tools";
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

  it("derives the compatibility capability manifest from the authoritative tool registry", () => {
    const exposedToolNames = Object.keys(createOpsAiTools()).sort();
    const compatibilityToolNames = DEFAULT_OPS_AI_TOOLS.map((tool) => tool.name).sort();
    const expectedToolNames = Object.entries(OPS_TOOL_DEFINITIONS)
      .filter(([, definition]) => definition.security.isModelCallable)
      .map(([name]) => name)
      .sort();

    expect(exposedToolNames).toEqual(expectedToolNames);
    expect(compatibilityToolNames).toEqual(expectedToolNames);
  });

  it("uses ToolLoopAgent as the production runtime instead of a manual model loop", () => {
    const runtimeFacade = readFileSync(
      join(process.cwd(), "lib/admin-ops-ai/runtime.ts"),
      "utf8"
    );
    const agentRuntime = readFileSync(
      join(process.cwd(), "lib/admin-ops-ai/agent-runtime.ts"),
      "utf8"
    );

    expect(runtimeFacade).toContain('from "./agent-runtime"');
    expect(runtimeFacade).not.toContain("streamOpsAiModel");
    expect(runtimeFacade).not.toContain("while (toolStepCount");
    expect(agentRuntime).toContain("new ToolLoopAgent");
    expect(agentRuntime).toContain("createOpsAiTools");
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

  it("never exposes mutation-only tools to ToolLoopAgent", () => {
    const tools = createOpsAiTools({
      callerRole: "admin",
      actorId: "admin-test",
    });

    expect(tools.list_quizzes).toBeDefined();
    expect(tools.retrieve_admin_knowledge).toBeDefined();
    expect(tools.create_quiz).toBeUndefined();
    expect(tools.update_quiz).toBeUndefined();
    expect(tools.reset_quiz_attempt).toBeUndefined();
  });
});
