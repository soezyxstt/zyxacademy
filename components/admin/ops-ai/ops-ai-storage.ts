import type {
  OpsAiWorkStep,
  OpsAiCitation,
  OpsAiActionProposalV2,
  OpsAiErrorData,
} from "@/lib/admin-ops-ai/contracts";
import type { OpsFollowup } from "@/lib/admin-ops-ai/followups";

export interface OpsAiMessageV2 {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  workSteps?: OpsAiWorkStep[];
  citations?: OpsAiCitation[];
  proposals?: OpsAiActionProposalV2[];
  followups?: OpsFollowup[];
  error?: OpsAiErrorData;
}

export interface OpsAiSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: OpsAiMessageV2[];
  titleSource?: "default" | "ai" | "manual";
}

export const STORAGE_KEY_PANEL_OPEN_V2 = "zyx_ops_ai_panel_open_v2";
export const STORAGE_KEY_PANEL_WIDTH_V2 = "zyx_ops_ai_panel_width_v2";
export const STORAGE_KEY_SESSIONS_V2 = "zyx_ops_ai_sessions_v2";
export const STORAGE_KEY_ACTIVE_SESSION_ID = "zyx_ops_ai_active_session_id";
export const STORAGE_KEY_MESSAGES_V2 = "zyx_ops_ai_messages_v2";
export const STORAGE_KEY_MESSAGES_V1 = "zyx_ops_ai_messages_v1";

export const OPS_AI_MIN_WIDTH = 360;
export const OPS_AI_DEFAULT_WIDTH = 480;
export const OPS_AI_MAX_WIDTH_CAP = 720;

/**
 * Calculates dynamic maximum width capped at min(720px, 50vw).
 */
export function calculateOpsAiMaxWidth(viewportWidth: number): number {
  const halfVw = Math.floor(viewportWidth * 0.5);
  return Math.min(OPS_AI_MAX_WIDTH_CAP, Math.max(OPS_AI_MIN_WIDTH, halfVw));
}

/**
 * Clamps width between min (360px) and max (min(720px, 50vw)).
 */
export function clampOpsAiWidth(width: number, viewportWidth?: number): number {
  const currentViewport =
    viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1440);
  const maxWidth = calculateOpsAiMaxWidth(currentViewport);
  const effectiveMin = Math.min(OPS_AI_MIN_WIDTH, maxWidth);
  return Math.max(effectiveMin, Math.min(maxWidth, width));
}

/**
 * Safely migrates legacy v1 chat messages to v2 message contracts.
 * Invariant: Never fabricates synthetic tool history or fake workSteps.
 */
export function migrateChatHistoryV1ToV2(rawV1: string | null): OpsAiMessageV2[] {
  if (!rawV1) return [];

  try {
    const parsed = JSON.parse(rawV1);
    if (!Array.isArray(parsed)) return [];

    const migrated: OpsAiMessageV2[] = [];

    for (let index = 0; index < parsed.length; index++) {
      const item = parsed[index];
      if (!item || typeof item !== "object") continue;

      const id = typeof item.id === "string" && item.id.trim() ? item.id : `legacy-msg-${index}`;
      const role = item.role === "assistant" || item.role === "system" ? item.role : "user";
      const content = typeof item.content === "string" ? item.content : "";
      const createdAt = typeof item.createdAt === "number" ? item.createdAt : Date.now();

      // Convert legacy sources to v2 citation shape if available
      let citations: OpsAiCitation[] | undefined;
      if (Array.isArray(item.sources) && item.sources.length > 0) {
        citations = item.sources
          .filter((s: unknown) => s && typeof s === "object")
          .map((src: Record<string, unknown>, srcIdx: number) => ({
            id: `cite-v1-${id}-${srcIdx}`,
            sourceId: String(src.filePath || `doc-${srcIdx}`),
            source: "semantic-rag",
            availability: "available",
            runId: `migrated-${id}`,
            stepId: `migrated-step-${id}`,
            title: String(src.title || "Dokumentasi Zyx"),
            filePath: typeof src.filePath === "string" ? src.filePath : undefined,
            section: typeof src.section === "string" ? src.section : undefined,
            snippet: String(src.snippet || ""),
          }));
      }

      // Convert legacy proposal to v2 preview format without fabricating backend store records
      let proposals: OpsAiActionProposalV2[] | undefined;
      if (item.proposal && typeof item.proposal === "object") {
        const prop = item.proposal as Record<string, unknown>;
        const propId = typeof prop.id === "string" ? prop.id : `prop-v1-${id}`;
        const propTitle = typeof prop.title === "string" ? prop.title : "Proposal Aksi";
        const propDesc = typeof prop.description === "string" ? prop.description : "";
        const propParams = (prop.params && typeof prop.params === "object")
          ? (prop.params as Record<string, unknown>)
          : {};

        const validTypes = ["create_token", "navigate_page", "trigger_job"] as const;
        const rawType = String(prop.type || "");
        const propType = validTypes.includes(rawType as any)
          ? (rawType as (typeof validTypes)[number])
          : "navigate_page";

        const validStatuses = ["pending", "executing", "executed", "cancelled", "failed", "expired"] as const;
        const rawStatus = String(prop.status || "");
        const propStatus = validStatuses.includes(rawStatus as any)
          ? (rawStatus as (typeof validStatuses)[number])
          : "pending";

        proposals = [
          {
            id: propId,
            runId: `migrated-${id}`,
            stepId: `migrated-step-${id}`,
            type: propType,
            title: propTitle,
            description: propDesc,
            preview: {
              summary: propDesc || propTitle,
              fields: Object.entries(propParams).map(([label, value]) => ({
                label,
                value: Array.isArray(value) ? value.join(", ") : String(value),
              })),
            },
            status: propStatus,
            createdAt: createdAt,
          },
        ];
      }

      // Explicitly omit workSteps or keep empty: NEVER synthesize fake tool executions
      migrated.push({
        id,
        role,
        content,
        createdAt,
        citations,
        proposals,
      });
    }

    return migrated;
  } catch {
    return [];
  }
}

function accountKey(key: string, accountId?: string): string {
  return accountId ? `${key}:${accountId}` : key;
}

/**
 * Loads all conversation sessions with migration from legacy stores.
 */
export function loadOpsAiSessions(accountId?: string): OpsAiSession[] {
  if (typeof localStorage === "undefined") return [];

  try {
    const rawSessions = localStorage.getItem(accountKey(STORAGE_KEY_SESSIONS_V2, accountId));
    if (rawSessions) {
      const parsed = JSON.parse(rawSessions);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }

    // Check v2 flat messages for migration to session format
    const v2Raw = localStorage.getItem(accountKey(STORAGE_KEY_MESSAGES_V2, accountId));
    if (v2Raw) {
      const parsedV2 = JSON.parse(v2Raw);
      if (Array.isArray(parsedV2) && parsedV2.length > 0) {
        const firstUser = parsedV2.find((m) => m.role === "user");
        const title = firstUser?.content ? firstUser.content.slice(0, 48) : "Sesi Percakapan";
        const session: OpsAiSession = {
          id: `session-default`,
          title,
          createdAt: parsedV2[0]?.createdAt || Date.now(),
          updatedAt: parsedV2[parsedV2.length - 1]?.createdAt || Date.now(),
          messages: parsedV2,
        };
        const sessions = [session];
        localStorage.setItem(accountKey(STORAGE_KEY_SESSIONS_V2, accountId), JSON.stringify(sessions));
        localStorage.setItem(accountKey(STORAGE_KEY_ACTIVE_SESSION_ID, accountId), session.id);
        return sessions;
      }
    }

    // Check v1 data for migration
    const v1Raw = localStorage.getItem(accountKey(STORAGE_KEY_MESSAGES_V1, accountId));
    if (v1Raw) {
      const migrated = migrateChatHistoryV1ToV2(v1Raw);
      // Remove v1 permanently to prevent resurrections
      localStorage.removeItem(accountKey(STORAGE_KEY_MESSAGES_V1, accountId));

      if (migrated.length > 0) {
        const firstUser = migrated.find((m) => m.role === "user");
        const title = firstUser?.content ? firstUser.content.slice(0, 48) : "Sesi Migrasi";
        const session: OpsAiSession = {
          id: `session-migrated`,
          title,
          createdAt: migrated[0]?.createdAt || Date.now(),
          updatedAt: migrated[migrated.length - 1]?.createdAt || Date.now(),
          messages: migrated,
        };
        const sessions = [session];
        localStorage.setItem(accountKey(STORAGE_KEY_SESSIONS_V2, accountId), JSON.stringify(sessions));
        localStorage.setItem(accountKey(STORAGE_KEY_ACTIVE_SESSION_ID, accountId), session.id);
        localStorage.setItem(accountKey(STORAGE_KEY_MESSAGES_V2, accountId), JSON.stringify(migrated));
        return sessions;
      }
    }
  } catch {
    // Ignore storage read errors
  }

  return [];
}

/**
 * Persists all sessions to storage.
 */
export function saveOpsAiSessions(sessions: OpsAiSession[], skipEvent = false, accountId?: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (sessions.length > 0) {
      localStorage.setItem(accountKey(STORAGE_KEY_SESSIONS_V2, accountId), JSON.stringify(sessions));
    } else {
      localStorage.removeItem(accountKey(STORAGE_KEY_SESSIONS_V2, accountId));
    }
    if (!skipEvent && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("zyx:ops-ai-sessions-updated"));
    }
  } catch {
    // Ignore
  }
}

/**
 * Loads the active session ID.
 */
export function loadActiveSessionId(accountId?: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(accountKey(STORAGE_KEY_ACTIVE_SESSION_ID, accountId));
  } catch {
    return null;
  }
}

/**
 * Saves the active session ID.
 */
export function saveActiveSessionId(sessionId: string, accountId?: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(accountKey(STORAGE_KEY_ACTIVE_SESSION_ID, accountId), sessionId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("zyx:ops-ai-active-session-updated"));
    }
  } catch {
    // Ignore
  }
}

/**
 * Creates a brand new conversation session and saves it.
 */
export function createOpsAiSession(initialTitle = "Percakapan Baru", accountId?: string): OpsAiSession {
  const newSession: OpsAiSession = {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: initialTitle,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };

  if (typeof localStorage !== "undefined") {
    const existing = loadOpsAiSessions(accountId);
    const updated = [newSession, ...existing];
    saveOpsAiSessions(updated, true, accountId);
    saveActiveSessionId(newSession.id, accountId);
  }

  return newSession;
}

/**
 * Updates messages of a specific session and generates title if needed.
 */
export function updateOpsAiSessionMessages(
  sessionId: string,
  messages: OpsAiMessageV2[],
  accountId?: string,
): void {
  if (typeof localStorage === "undefined") return;

  const sessions = loadOpsAiSessions(accountId);
  const targetIndex = sessions.findIndex((s) => s.id === sessionId);

  if (targetIndex >= 0) {
    const target = sessions[targetIndex];
    let title = target.title;
    if (
      target.titleSource !== "ai" &&
      target.titleSource !== "manual" &&
      (!title || title === "Percakapan Baru" || title === "Sesi Percakapan") &&
      messages.length > 0
    ) {
      const firstUser = messages.find((m) => m.role === "user");
      if (firstUser?.content) {
        title = firstUser.content.trim().slice(0, 48);
      }
    }

    sessions[targetIndex] = {
      ...target,
      title,
      updatedAt: Date.now(),
      messages,
    };
    saveOpsAiSessions(sessions, true, accountId);
  } else {
    // Create new session if not found
    const firstUser = messages.find((m) => m.role === "user");
    const title = firstUser?.content ? firstUser.content.trim().slice(0, 48) : "Percakapan Baru";
    const session: OpsAiSession = {
      id: sessionId,
      title,
      titleSource: "default",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages,
    };
    saveOpsAiSessions([session, ...sessions], true, accountId);
  }

  // Also sync active messages key for backwards compatibility
  saveOpsAiMessages(messages, true, accountId);
}

/**
 * Renames a session with an AI-generated title and persists cleanly.
 */
export function renameOpsAiSession(
  sessionId: string,
  title: string,
  accountId?: string | null,
): OpsAiSession[] {
  if (typeof localStorage === "undefined") return [];

  const normalizedAccountId = accountId ?? undefined;
  const cleanedTitle = title
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .slice(0, 80);

  const sessions = loadOpsAiSessions(normalizedAccountId);
  if (!cleanedTitle) return sessions;

  const targetIndex = sessions.findIndex((s) => s.id === sessionId);
  if (targetIndex < 0) return sessions;

  const updated = [...sessions];
  updated[targetIndex] = {
    ...updated[targetIndex],
    title: cleanedTitle,
    titleSource: "ai",
    updatedAt: Date.now(),
  };
  saveOpsAiSessions(updated, true, normalizedAccountId);
  return updated;
}

/**
 * Deletes a single conversation session.
 */
export function deleteOpsAiSession(sessionId: string, accountId?: string): OpsAiSession[] {
  if (typeof localStorage === "undefined") return [];

  const sessions = loadOpsAiSessions(accountId);
  const filtered = sessions.filter((s) => s.id !== sessionId);
  saveOpsAiSessions(filtered, true, accountId);

  const activeId = loadActiveSessionId(accountId);
  if (activeId === sessionId) {
    if (filtered.length > 0) {
      saveActiveSessionId(filtered[0].id, accountId);
      saveOpsAiMessages(filtered[0].messages, true, accountId);
    } else {
      localStorage.removeItem(accountKey(STORAGE_KEY_ACTIVE_SESSION_ID, accountId));
      localStorage.removeItem(accountKey(STORAGE_KEY_MESSAGES_V2, accountId));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("zyx:ops-ai-messages-updated"));
      }
    }
  }

  return filtered;
}

/**
 * Clears ALL chat messages and sessions completely from storage.
 */
export function clearAllOpsAiSessions(accountId?: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(accountKey(STORAGE_KEY_SESSIONS_V2, accountId));
    localStorage.removeItem(accountKey(STORAGE_KEY_ACTIVE_SESSION_ID, accountId));
    localStorage.removeItem(accountKey(STORAGE_KEY_MESSAGES_V2, accountId));
    localStorage.removeItem(accountKey(STORAGE_KEY_MESSAGES_V1, accountId));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("zyx:ops-ai-sessions-updated"));
      window.dispatchEvent(new CustomEvent("zyx:ops-ai-messages-updated"));
    }
  } catch {
    // Ignore
  }
}

/**
 * Loads messages with automatic v1 to v2 migration.
 */
export function loadOpsAiMessages(accountId?: string): OpsAiMessageV2[] {
  if (typeof localStorage === "undefined") return [];

  try {
    const activeId = loadActiveSessionId(accountId);
    if (activeId) {
      const sessions = loadOpsAiSessions(accountId);
      const current = sessions.find((s) => s.id === activeId);
      if (current) return current.messages;
    }

    const v2Raw = localStorage.getItem(accountKey(STORAGE_KEY_MESSAGES_V2, accountId));
    if (v2Raw) {
      const parsed = JSON.parse(v2Raw);
      if (Array.isArray(parsed)) return parsed;
    }

    // Check v1 data for migration
    const v1Raw = localStorage.getItem(accountKey(STORAGE_KEY_MESSAGES_V1, accountId));
    if (v1Raw) {
      const migrated = migrateChatHistoryV1ToV2(v1Raw);
      // Remove v1 permanently
      localStorage.removeItem(accountKey(STORAGE_KEY_MESSAGES_V1, accountId));
      if (migrated.length > 0) {
        localStorage.setItem(accountKey(STORAGE_KEY_MESSAGES_V2, accountId), JSON.stringify(migrated));
      }
      return migrated;
    }
  } catch {
    // Ignore storage read errors
  }

  return [];
}

/**
 * Persists messages to v2 storage.
 */
export function saveOpsAiMessages(messages: OpsAiMessageV2[], skipEvent = false, accountId?: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (messages.length > 0) {
      localStorage.setItem(accountKey(STORAGE_KEY_MESSAGES_V2, accountId), JSON.stringify(messages));
    } else {
      localStorage.removeItem(accountKey(STORAGE_KEY_MESSAGES_V2, accountId));
    }
    if (!skipEvent && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("zyx:ops-ai-messages-updated"));
    }
  } catch {
    // Ignore storage write errors
  }
}

/**
 * Clears chat messages from v2 storage.
 */
export function clearOpsAiMessages(accountId?: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(accountKey(STORAGE_KEY_MESSAGES_V2, accountId));
    localStorage.removeItem(accountKey(STORAGE_KEY_MESSAGES_V1, accountId));
    const activeId = loadActiveSessionId(accountId);
    if (activeId) {
      updateOpsAiSessionMessages(activeId, [], accountId);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("zyx:ops-ai-messages-updated"));
    }
  } catch {
    // Ignore
  }
}

/**
 * Loads panel open preference from localStorage.
 */
export function loadOpsAiOpenPreference(defaultVal = false): boolean {
  if (typeof localStorage === "undefined") return defaultVal;
  try {
    const val = localStorage.getItem(STORAGE_KEY_PANEL_OPEN_V2);
    if (val !== null) return val === "true";
  } catch {
    // Ignore
  }
  return defaultVal;
}

/**
 * Saves panel open preference to localStorage.
 */
export function saveOpsAiOpenPreference(open: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_PANEL_OPEN_V2, String(open));
  } catch {
    // Ignore
  }
}

/**
 * Loads panel width preference from localStorage.
 */
export function loadOpsAiWidthPreference(): number {
  if (typeof localStorage === "undefined") return OPS_AI_DEFAULT_WIDTH;
  try {
    const val = localStorage.getItem(STORAGE_KEY_PANEL_WIDTH_V2);
    if (val) {
      const num = Number.parseInt(val, 10);
      if (!Number.isNaN(num)) {
        return clampOpsAiWidth(
          num,
          typeof window !== "undefined" ? window.innerWidth : 1440
        );
      }
    }
  } catch {
    // Ignore
  }
  return clampOpsAiWidth(
    OPS_AI_DEFAULT_WIDTH,
    typeof window !== "undefined" ? window.innerWidth : 1440
  );
}

/**
 * Saves panel width preference to localStorage.
 */
export function saveOpsAiWidthPreference(width: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_PANEL_WIDTH_V2, String(width));
  } catch {
    // Ignore
  }
}
