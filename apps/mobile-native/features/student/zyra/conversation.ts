import type { ZyraWireEvent } from "../../../../../packages/zyra/stream";
import { NativeZyraStreamError, type NativeZyraRequest } from "../../../network/zyra";
import { NativeRequestNotDispatched, type NativeSessionTransport } from "../../../network/transport";

export const studentZyraEndpoint = "/api/native/student/zyra";
export const maxQuestionLength = 4_000;

export type ZyraMessage = { id: string; role: "student" | "ai"; content: string };
export type ZyraConversation = { sessionId: string; sessionTitle?: string; messages: ZyraMessage[] };
export type ZyraHistory = {
  tier: "free" | "standard";
  sessions: { id: string; title: string }[];
  history: ZyraConversation | null;
};
export type Turn = {
  request: NativeZyraRequest;
  response: string;
  sessionId: string | null;
  title?: string;
  stage: string;
  receipt: "pending" | "saved" | "unsaved";
  failed: boolean;
};

export function newTurn(request: NativeZyraRequest): Turn {
  return { request, response: "", sessionId: request.sessionId ?? null, stage: "", receipt: "pending", failed: false };
}

export function applyZyraEvent(turn: Turn, event: ZyraWireEvent): Turn {
  switch (event.type) {
    case "text-delta": case "chunk": {
      const text = event.type === "chunk" ? event.text : event.textDelta;
      return typeof text === "string" ? { ...turn, response: turn.response + text } : turn;
    }
    case "text-replace": return typeof event.text === "string" ? { ...turn, response: event.text } : turn;
    case "data-session": return typeof event.sessionId === "string" && event.sessionId ? { ...turn, sessionId: event.sessionId } : turn;
    case "data-session-title": return event.sessionId === turn.sessionId && typeof event.title === "string" ? { ...turn, title: event.title } : turn;
    case "data-history": return typeof event.saved === "boolean" ? { ...turn, receipt: event.saved ? "saved" : "unsaved" } : turn;
    case "data-error": return { ...turn, failed: true };
    case "data-work-step": {
      const data = record(event.data);
      return data?.status === "running" && typeof data.label === "string" ? { ...turn, stage: data.label } : turn;
    }
    default: return turn;
  }
}

export function turnCompletion(turn: Turn, completed: boolean, error?: unknown) {
  // A durable receipt wins even when the final stream terminator was lost.
  if (turn.receipt === "saved" && turn.sessionId && turn.response) return "saved";
  if (completed && !turn.failed && turn.receipt === "unsaved" && turn.response) return "unsaved";
  if (error instanceof NativeRequestNotDispatched) return "retry";
  if (error instanceof NativeZyraStreamError && error.code === "http" && error.status && error.status < 500 && error.status !== 408) {
    return [401, 403, 409].includes(error.status) ? "access" : "retry";
  }
  return "uncertain";
}

export function courseZyraAvailable(path: string) {
  const pathname = path.split(/[?#]/, 1)[0];
  const [, root, courseId, section] = pathname.split("/");
  return root === "courses" && Boolean(courseId) && !["quiz", "tryout", "simulasi", "my-results", "discussions", "playground", "live", "solutions"].includes(section);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function conversation(value: unknown): ZyraConversation {
  const item = record(value);
  if (!item || typeof item.sessionId !== "string" || !Array.isArray(item.messages)) throw new Error("Invalid Zyra conversation");
  const messages = item.messages.map((entry): ZyraMessage => {
    const message = record(entry);
    if (!message || typeof message.id !== "string" || typeof message.content !== "string" ||
      (message.role !== "student" && message.role !== "ai")) throw new Error("Invalid Zyra message");
    return { id: message.id, role: message.role, content: message.content };
  });
  return { sessionId: item.sessionId, sessionTitle: typeof item.sessionTitle === "string" ? item.sessionTitle : undefined, messages };
}

export class ZyraHistoryError extends Error {
  constructor(readonly status: number) { super("Zyra history unavailable"); }
}

async function read(session: NativeSessionTransport, query: URLSearchParams, signal: AbortSignal) {
  const response = await session.request(`${studentZyraEndpoint}?${query}`, { headers: { "x-student-id": session.scope.accountId }, signal });
  try {
    if (!response.ok) throw new ZyraHistoryError(response.status);
    const value = record(await response.json());
    session.assertCurrent();
    if (!value) throw new Error("Invalid Zyra history");
    return value;
  } finally { response.dispose(); }
}

export async function readZyraHistory(session: NativeSessionTransport, courseId: string, signal: AbortSignal, sessionId?: string): Promise<ZyraHistory> {
  const query = new URLSearchParams({ view: "history", courseId });
  if (sessionId) query.set("sessionId", sessionId);
  const value = await read(session, query, signal);
  if ((value.tier !== "free" && value.tier !== "standard") || !Array.isArray(value.sessions)) throw new Error("Invalid Zyra history");
  const sessions = value.sessions.map(entry => {
    const item = record(entry);
    if (!item || typeof item.id !== "string" || typeof item.title !== "string") throw new Error("Invalid Zyra session");
    return { id: item.id, title: item.title };
  });
  return { tier: value.tier, sessions, history: value.history === null ? null : conversation(value.history) };
}

export async function readZyraReceipt(session: NativeSessionTransport, courseId: string, requestId: string, signal: AbortSignal) {
  const value = await read(session, new URLSearchParams({ view: "receipt", courseId, requestId }), signal);
  if (value.saved === false) return null;
  if (value.saved !== true) throw new Error("Invalid Zyra receipt");
  return conversation(value.history);
}
