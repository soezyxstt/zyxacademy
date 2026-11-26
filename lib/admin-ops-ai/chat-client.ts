import { useState, useRef, useCallback, useEffect } from "react";
import { OPS_AI_POLICY_BOUNDS } from "./contracts";
import { validateOpsFollowups, type OpsFollowup } from "./followups";
import type {
  OpsAiWorkStep,
  OpsAiCitation,
  OpsAiActionProposalV2,
  OpsAiErrorData,
} from "./contracts";
import type { OpsAiMessageV2 } from "./chat-message";

// ============================================================================
// 1. Types & Stream Part Definitions (Tahap 4A)
// ============================================================================

export type OpsAiStreamPart =
  | { type: "text-delta"; textDelta: string }
  | { type: "data-work-step"; id: string; data: OpsAiWorkStep }
  | { type: "data-citation"; id: string; data: OpsAiCitation }
  | { type: "data-proposal"; id: string; data: OpsAiActionProposalV2 }
  | { type: "data-followups"; followups: OpsFollowup[] }
  | { type: "data-session-title"; sessionId?: string; title: string }
  | { type: "data-error"; id: string; data: OpsAiErrorData }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "done" };

export type OpsAiChatResponse = Pick<Response, "ok" | "body"> & {
  json(): Promise<unknown>;
  dispose?(): void;
};

export interface UseOpsAiChatOptions {
  request?: (path: string, init: RequestInit) => Promise<OpsAiChatResponse>;
  api?: string;
  initialMessages?: OpsAiMessageV2[];
  context?: {
    currentPath?: string;
    queryParams?: Record<string, string>;
    mode?: "ask" | "edit";
  };
  needsTitle?: boolean;
  onFinish?: (message: OpsAiMessageV2) => void;
  onError?: (error: Error) => void;
  onWorkStep?: (step: OpsAiWorkStep) => void;
  onCitation?: (citation: OpsAiCitation) => void;
  onProposal?: (proposal: OpsAiActionProposalV2) => void;
  onSessionTitle?: (title: string, sessionId?: string) => void;
}

type ChatRequestOptions = {
  chatId: string;
  grantIds: string[];
  mode?: "ask" | "edit";
  needsTitle?: boolean;
};

export interface UseOpsAiChatReturn {
  messages: OpsAiMessageV2[];
  setMessages: React.Dispatch<React.SetStateAction<OpsAiMessageV2[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  isStreaming: boolean;
  sendMessage: (customPrompt?: string, chat?: ChatRequestOptions) => Promise<void>;
  stop: () => void;
}

// ============================================================================
// 2. Stream Consumer Helper (Replaces manual getReader in UI)
// ============================================================================

/**
 * Consumes a ReadableStream of SSE events and yields typed OpsAiStreamPart items.
 * Re-validates data-followups payloads using validateOpsFollowups.
 */
export async function* consumeOpsAiStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<OpsAiStreamPart> {
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
            if (parsed.type === "data-followups") {
              const followups = validateOpsFollowups(parsed.followups ?? parsed.data);
              if (followups.length > 0) {
                yield { type: "data-followups", followups };
              }
            } else if (parsed.type === "data-session-title") {
              const rawTitle =
                typeof parsed.title === "string"
                  ? parsed.title
                  : typeof parsed.data?.title === "string"
                    ? parsed.data.title
                    : "";
              const cleanedTitle = rawTitle.trim();
              if (cleanedTitle) {
                const sessionId =
                  typeof parsed.sessionId === "string"
                    ? parsed.sessionId
                    : typeof parsed.data?.sessionId === "string"
                      ? parsed.data.sessionId
                      : undefined;
                yield {
                  type: "data-session-title",
                  ...(sessionId ? { sessionId } : {}),
                  title: cleanedTitle,
                };
              }
            } else {
              yield parsed as OpsAiStreamPart;
            }
          }
        } catch {
          // Ignore malformed JSON chunks
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
  request = fetch,
  initialMessages = [],
  context,
  needsTitle,
  onFinish,
  onError,
  onWorkStep,
  onCitation,
  onProposal,
  onSessionTitle,
}: UseOpsAiChatOptions = {}): UseOpsAiChatReturn {
  const [messages, setMessages] = useState<OpsAiMessageV2[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (customPrompt?: string, chat?: ChatRequestOptions) => {
      const promptToSend = (customPrompt ?? input).trim();
      if (!promptToSend || promptToSend.length > OPS_AI_POLICY_BOUNDS.maxMessageCharLength || abortControllerRef.current) return;

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

      const clearedMessages = messages.map((m) =>
        m.followups ? { ...m, followups: undefined } : m
      );
      const nextMessages = [...clearedMessages, userMsg, assistantMsg];
      setMessages(nextMessages);
      setInput("");
      setIsStreaming(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let response: OpsAiChatResponse | undefined;
      try {
        const history: Array<{ role: "user" | "assistant"; content: string }> = [];
        let remaining = OPS_AI_POLICY_BOUNDS.maxTotalPromptChars;
        for (const message of [...messages, userMsg].reverse()) {
          if (message.role === "system") continue;
          const approved = message.role === "assistant" && chat
            ? (message.proposals ?? []).filter(proposal => proposal.type === "admin_operation").slice(-8).map(proposal => proposal.id)
            : [];
          const reference = approved.length ? `\n\nID persetujuan dalam chat ini: ${approved.join(", ")}` : "";
          if (!message.content && !reference) continue;
          const content = message.content.slice(0, Math.max(0, OPS_AI_POLICY_BOUNDS.maxMessageCharLength - reference.length)) + reference;
          if (history.length >= OPS_AI_POLICY_BOUNDS.maxMessagesHistory || content.length > remaining) break;
          history.unshift({ role: message.role, content });
          remaining -= content.length;
        }
        const requestContext = chat?.mode
          ? { ...context, mode: chat.mode }
          : context;
        const effectiveNeedsTitle = chat?.needsTitle ?? needsTitle;
        const res = response = await request(api, {
          method: "POST",
          signal: abortController.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            context: requestContext,
            ...(chat ? { chatId: chat.chatId, grantIds: chat.grantIds } : {}),
            ...(effectiveNeedsTitle !== undefined ? { needsTitle: effectiveNeedsTitle } : {}),
          }),
        });

        if (!res.ok) {
          let errText = "Gagal menghubungi layanan Zyx Ops AI.";
          try {
            const errJson = await res.json();
            if (errJson && typeof errJson === "object" && "error" in errJson && typeof errJson.error === "string") errText = errJson.error;
          } catch {
            // Ignore parse errors
          }
          throw new Error(errText);
        }

        if (!res.body) {
          throw new Error("Respons stream tidak tersedia.");
        }

        let completed = false;
        for await (const part of consumeOpsAiStream(res.body, abortController.signal)) {
          if (part.type === "done") {
            completed = true;
          } else if (part.type === "text-delta") {
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
                return { ...m, proposals: [...existing, proposal], followups: undefined };
              })
            );
          } else if (part.type === "data-followups") {
            const followups = validateOpsFollowups(part.followups);
            if (followups.length > 0) {
              setMessages((prev: OpsAiMessageV2[]) =>
                prev.map((m: OpsAiMessageV2) =>
                  m.id === assistantMsgId && !m.error && !m.proposals?.length
                    ? { ...m, followups }
                    : m
                )
              );
            }
          } else if (part.type === "data-session-title") {
            onSessionTitle?.(part.title, part.sessionId ?? chat?.chatId);
          } else if (part.type === "data-error") {
            const errData = part.data;
            setMessages((prev: OpsAiMessageV2[]) =>
              prev.map((m: OpsAiMessageV2) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      error: errData,
                      followups: undefined,
                      content: m.content || `Terjadi kendala: ${errData.message}`,
                    }
                  : m
              )
            );
          }
        }

        if (abortController.signal.aborted) throw new Error("Permintaan dihentikan.");
        if (!completed && chat) throw new Error("Koneksi terputus saat menerima respons.");

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
                followups: undefined,
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
                    followups: undefined,
                    content: m.content ? `${m.content}\n\n${errorObj.message}` : errorObj.message,
                  }
                : m
            )
          );
        }
      } finally {
        response?.dispose?.();
        if (abortControllerRef.current === abortController) {
          setIsStreaming(false);
          abortControllerRef.current = null;
        }
      }
    },
    [
      api,
      request,
      context,
      needsTitle,
      input,
      messages,
      onError,
      onFinish,
      onProposal,
      onCitation,
      onWorkStep,
      onSessionTitle,
    ]
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
