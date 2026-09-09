import { describe, it, expect, afterEach } from "bun:test";
import {
  ZyxLanguageModel,
  createZyxLanguageModel,
} from "@/lib/admin-ops-ai/zyx-language-model-adapter";
import {
  setOpsAiModelStreamMock,
} from "@/lib/admin-ops-ai/model-factory";
import { createOpsAiAgent } from "@/lib/admin-ops-ai/runtime";

describe("Zyx Ops AI - LanguageModel Adapter (Tahap 3B)", () => {
  afterEach(() => {
    setOpsAiModelStreamMock(null);
  });

  it("instantiates with specificationVersion v3 and provider zyx-gemini", () => {
    const model = createZyxLanguageModel("gemini-2.5-flash");
    expect(model.specificationVersion).toBe("v3");
    expect(model.provider).toBe("zyx-gemini");
    expect(model.modelId).toBe("gemini-2.5-flash");
  });

  it("streams text-delta and finish events via doStream", async () => {
    setOpsAiModelStreamMock(async function* () {
      yield { type: "text-delta", textDelta: "Halo dari " };
      yield { type: "text-delta", textDelta: "Zyx Ops AI." };
      yield {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
      };
    });

    const model = new ZyxLanguageModel("gemini-2.5-flash");
    const streamResult = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Halo" }] }],
    });

    expect(streamResult.stream).toBeDefined();

    const reader = streamResult.stream.getReader();
    const parts: any[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }

    const deltas = parts.filter((p) => p.type === "text-delta").map((p) => p.delta);
    expect(deltas).toEqual(["Halo dari ", "Zyx Ops AI."]);

    const finishPart = parts.find((p) => p.type === "finish");
    expect(finishPart).toBeDefined();
    expect(finishPart.finishReason.unified).toBe("stop");
  });

  it("generates aggregated text and usage via doGenerate", async () => {
    setOpsAiModelStreamMock(async function* () {
      yield { type: "text-delta", textDelta: "Sistem " };
      yield { type: "text-delta", textDelta: "berjalan normal." };
      yield {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 15, completionTokens: 5, totalTokens: 20 },
      };
    });

    const model = new ZyxLanguageModel("gemini-2.5-flash");
    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Status sistem" }] }],
    });

    expect(result.finishReason.unified).toBe("stop");
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect((result.content[0] as any).text).toBe("Sistem berjalan normal.");
    expect(result.usage.outputTokens.total).toBe(5);
  });

  it("translates tool calls in streaming response properly", async () => {
    setOpsAiModelStreamMock(async function* () {
      yield {
        type: "tool-call",
        toolCall: {
          id: "call-inspect-1",
          name: "inspect_schema",
          args: { tableName: "user" },
        },
      };
      yield { type: "finish", finishReason: "tool-calls" };
    });

    const model = new ZyxLanguageModel("gemini-2.5-flash");
    const streamResult = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Periksa tabel user" }] }],
    });

    const reader = streamResult.stream.getReader();
    const parts: any[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }

    const toolCallPart = parts.find((p) => p.type === "tool-call");
    expect(toolCallPart).toBeDefined();
    expect(toolCallPart.toolCallId).toBe("call-inspect-1");
    expect(toolCallPart.toolName).toBe("inspect_schema");
    expect(JSON.parse(toolCallPart.input)).toEqual({ tableName: "user" });

    const finishPart = parts.find((p) => p.type === "finish");
    expect(finishPart.finishReason.unified).toBe("tool-calls");
  });

  it("creates an AI SDK 6 ToolLoopAgent instance with unified tools and bounds (Tahap 3A)", () => {
    const agent = createOpsAiAgent({
      systemPrompt: "Instruksi sistem Zyx Ops AI",
      maxConsecutiveToolCalls: 3,
    });

    expect(agent).toBeDefined();
    expect(agent.version).toBe("agent-v1");
    expect(agent.id).toBe("zyx-ops-ai-agent");
    expect(agent.tools).toBeDefined();

    // Verify tools include model callable tools
    const toolNames = Object.keys(agent.tools || {});
    expect(toolNames).toContain("inspect_schema");
    expect(toolNames).toContain("get_system_metrics");
    expect(toolNames).toContain("navigate_admin");
    expect(toolNames).toContain("retrieve_admin_knowledge");

    // Strictly ensure no mutation executor is in agent tools
    expect(toolNames).not.toContain("execute_confirmed_proposal");
    expect(toolNames).not.toContain("update_course");
    expect(toolNames).not.toContain("delete_course");
  });
});
