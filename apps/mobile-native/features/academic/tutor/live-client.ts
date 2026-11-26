import type { TutorLiveHost, TutorLiveRoom } from "../../../../../packages/academic/tutor-support";
import { TutorDataError } from "../../../../../packages/native-parity/academic/tutor/model";
import type { AcademicResponse, AcademicTransport } from "../client";

const hostPath = (courseId: string) => `/api/native/academic/tutor-support/courses/${encodeURIComponent(courseId)}/live/host`;

export function tutorLiveSocketUrl(room: TutorLiveRoom): string | null {
  try {
    const url = new URL(room.wsUrl);
    if ((url.protocol !== "https:" && url.protocol !== "wss:") || url.username || url.password || url.search || url.hash ||
      url.pathname !== `/room/${encodeURIComponent(room.id)}/websocket` || !/^[A-Za-z0-9_-]{1,4096}\.[a-f0-9]{64}$/.test(room.hostToken)) return null;
    url.searchParams.set("token", room.hostToken);
    return url.href;
  } catch {
    return null;
  }
}

async function readRoom(response: AcademicResponse, expected?: string) {
  if (!response.ok) throw new TutorDataError(response.status);
  const value = await response.json() as TutorLiveRoom | null;
  if (value === null) return null;
  if (!value || typeof value.id !== "string" || (expected && value.id !== expected) ||
    typeof value.code !== "string" || !/^[A-Z0-9]{6}$/.test(value.code) ||
    !Number.isSafeInteger(value.questionCount) || value.questionCount < 0 || (value.kind !== undefined && value.kind !== "coding") || !tutorLiveSocketUrl(value)) throw new TutorDataError(502);
  return value;
}

export function createTutorLiveHost(transport: AcademicTransport): TutorLiveHost | undefined {
  const command = transport.command?.bind(transport);
  if (!command) return undefined;
  return {
    async resume(courseId, sessionId, signal) {
      const search = sessionId ? `?${new URLSearchParams({ sessionId })}` : "";
      return readRoom(await transport.get(hostPath(courseId) + search, signal), sessionId);
    },
    async create(courseId, selection, requestId, signal) {
      const body = typeof selection === "string" ? { templateId: selection } : selection;
      const room = await readRoom(await command(hostPath(courseId), { method: "POST", body, requestId }, signal));
      if (!room) throw new TutorDataError(502);
      return room;
    },
    async control(courseId, sessionId, action, requestId, signal) {
      const response = await command(hostPath(courseId), { method: "POST", body: { sessionId, action }, requestId }, signal);
      if (!response.ok) throw new TutorDataError(response.status);
      const receipt = await response.json();
      if (!receipt || typeof receipt !== "object" || !("ok" in receipt) || receipt.ok !== true) throw new TutorDataError(502);
    },
  };
}
