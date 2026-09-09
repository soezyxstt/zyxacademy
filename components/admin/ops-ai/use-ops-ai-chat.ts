import { useState, useRef, useCallback } from "react";
import type {
  OpsAiWorkStep,
  OpsAiCitation,
  OpsAiActionProposalV2,
  OpsAiErrorData,
} from "@/lib/admin-ops-ai/contracts";
import type { OpsAiMessageV2 } from "./ops-ai-storage";

// ============================================================================
// 1. Types & Stream Part Definitions (Tahap 4A)
// ============================================================================

export type OpsAiStreamPart =
  | { type: "text-delta"; textDelta: string }
  | { type: "data-work-step"; id: string; data: OpsAiWorkStep }
  | { type: "data-citation"; id: string; data: OpsAiCitation }
  | { type: "data-proposal"; id: string; data: OpsAiActionProposalV2 }
  | { type: "data-error"; id: string; data: OpsAiErrorData }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "done" };

export interface UseOpsAiChatOptions {
  api?: string;
  initialMessages?: OpsAiMessageV2[];
  context?: {
    currentPath?: string;
    queryParams?: Record<string, string>;
    mode?: "ask" | "edit";
  };
  onFinish?: (message: OpsAiMessageV2) => void;
  onError?: (error: Error) => void;
  onWorkStep?: (step: OpsAiWorkStep) => void;
  onCitation?: (citation: OpsAiCitation) => void;
  onProposal?: (proposal: OpsAiActionProposalV2) => void;
}

export interface UseOpsAiChatReturn {
  messages: OpsAiMessageV2[];
  setMessages: React.Dispatch<React.SetStateAction<OpsAiMessageV2[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  isStreaming: boolean;
  sendMessage: (customPrompt?: string) => Promise<void>;
  stop: () => void;
}

// ============================================================================
// 2. Stream Consumer Helper (Replaces manual getReader in UI)
// ============================================================================

/**
 * Consumes a ReadableStream of SSE events and yields typed OpsAiStreamPart items.
 * Replaces manual reader and string splitting in UI components.
 */
export async function* consumeOpsAiStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<OpsAiStreamPart, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (signal?.aborted) return;
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const dataStr = trimmed.slice(6).trim();
        if (dataStr === "[DONE]") {
          yield { type: "done" };
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed && typeof parsed.type === "string") {
            yield parsed as OpsAiStreamPart;
            if (signal?.aborted) return;
          }
        } catch {
          // Ignore parse errors on individual stream chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ============================================================================
// 3. useOpsAiChat Hook
// ============================================================================

/**
 * Specialized React hook for Zyx Ops AI chat streaming.
 * Provides typed message parts handling for work-steps, citations, and proposals.
 */
export function useOpsAiChat({
  api = "/api/admin/ops-ai",
  initialMessages = [],
  context,
  onFinish,
  onError,
  onWorkStep,
  onCitation,
  onProposal,
}: UseOpsAiChatOptions = {}): UseOpsAiChatReturn {
  const [messages, setMessages] = useState<OpsAiMessageV2[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (customPrompt?: string) => {
      const promptToSend = (customPrompt ?? input).trim();
      if (!promptToSend || isStreaming) return;

      const userMsgId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const assistantMsgId = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const userMsg: OpsAiMessageV2 = {
        id: userMsgId,
        role: "user",
        content: promptToSend,
        createdAt: Date.now(),
      };

      const assistantMsg: OpsAiMessageV2 = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        workSteps: [],
        citations: [],
        proposals: [],
      };

      const nextMessages = [...messages, userMsg, assistantMsg];
      setMessages(nextMessages);
      setInput("");
      setIsStreaming(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const res = await fetch(api, {
          method: "POST",
          signal: abortController.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages
              .filter((m) => m.role === "user" || (m.role === "assistant" && m.content.length > 0))
              .map((m) => ({
                role: m.role === "user" ? "user" : "assistant",
                content: m.content,
              })),
            context,
          }),
        });

        if (!res.ok) {
          let errText = "Gagal menghubungi layanan Zyx Ops AI.";
          try {
            const errJson = await res.json();
            if (errJson.error) errText = errJson.error;
          } catch {
            // Ignore parse errors
          }
          throw new Error(errText);
        }

        if (!res.body) {
          throw new Error("Respons stream tidak tersedia.");
        }

        for await (const part of consumeOpsAiStream(res.body, abortController.signal)) {
          if (part.type === "text-delta") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + part.textDelta }
                  : m
              )
            );
          } else if (part.type === "data-work-step") {
            const step = part.data;
            onWorkStep?.(step);
            setMessages((prev: OpsAiMessageV2[]) =>
              prev.map((m: OpsAiMessageV2) => {
                if (m.id !== assistantMsgId) return m;
                const existing = m.workSteps || [];
                const stepIdx = existing.findIndex((s: OpsAiWorkStep) => s.stepId === step.stepId);
                let updatedSteps: OpsAiWorkStep[];
                if (stepIdx >= 0) {
                  updatedSteps = [...existing];
                  updatedSteps[stepIdx] = step;
                } else {
                  updatedSteps = [...existing, step];
                }
                return { ...m, workSteps: updatedSteps };
              })
            );
          } else if (part.type === "data-citation") {
            const citation = part.data;
            onCitation?.(citation);
            setMessages((prev: OpsAiMessageV2[]) =>
              prev.map((m: OpsAiMessageV2) => {
                if (m.id !== assistantMsgId) return m;
                const existing = m.citations || [];
                if (existing.some((c: OpsAiCitation) => c.id === citation.id)) return m;
                return { ...m, citations: [...existing, citation] };
              })
            );
          } else if (part.type === "data-proposal") {
            const proposal = part.data;
            onProposal?.(proposal);
            setMessages((prev: OpsAiMessageV2[]) =>
              prev.map((m: OpsAiMessageV2) => {
                if (m.id !== assistantMsgId) return m;
                const existing = m.proposals || [];
                if (existing.some((p: OpsAiActionProposalV2) => p.id === proposal.id)) return m;
                return { ...m, proposals: [...existing, proposal] };
              })
            );
          } else if (part.type === "data-error") {
            const errData = part.data;
            setMessages((prev: OpsAiMessageV2[]) =>
              prev.map((m: OpsAiMessageV2) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      error: errData,
                      content: m.content || `Terjadi kendala: ${errData.message}`,
                    }
                  : m
              )
            );
          }
        }

        setMessages((prev: OpsAiMessageV2[]) => {
          const finalAssistantMsg = prev.find((m: OpsAiMessageV2) => m.id === assistantMsgId);
          if (finalAssistantMsg) {
            onFinish?.(finalAssistantMsg);
          }
          return prev;
        });
      } catch (err: unknown) {
        if (abortController.signal.aborted) {
          setMessages((prev: OpsAiMessageV2[]) =>
            prev.map((m: OpsAiMessageV2) => {
              if (m.id !== assistantMsgId) return m;
              const updatedSteps = (m.workSteps || []).map((s: OpsAiWorkStep) =>
                s.status === "running" ? { ...s, status: "cancelled" as const } : s
              );
              return {
                ...m,
                workSteps: updatedSteps,
                content: m.content || "Permintaan dibatalkan.",
              };
            })
          );
        } else {
          const errorObj = err instanceof Error ? err : new Error(String(err));
          onError?.(errorObj);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: m.content || `Terjadi kendala: ${errorObj.message}`,
                  }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [api, context, input, isStreaming, messages, onError, onFinish, onProposal, onCitation, onWorkStep]
  );

  return {
    messages,
    setMessages,
    input,
    setInput,
    isStreaming,
    sendMessage,
    stop,
  };
}
