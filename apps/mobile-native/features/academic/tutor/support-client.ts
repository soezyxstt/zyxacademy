import type { TutorDiscussionDraft, TutorDiscussionSendResult, TutorSupportClient } from "../../../../../packages/academic/tutor-support";
import { tutorPlaybackUrl } from "../../../../../packages/academic/tutor-support";
import { TutorDataError } from "../../../../../packages/native-parity/academic/tutor/model";
import { NativeRequestNotDispatched } from "../../../network/transport";
import type { AcademicTransport } from "../client";
import { createTutorLiveHost } from "./live-client";
import { createTryoutGradeEditor } from "./tryout-grade-client";
import { createTutorSlotEditor } from "./slot-client";

function coursePath(courseId: string, page: string) {
  return `courses/${encodeURIComponent(courseId)}/${page}`;
}

const apiRoot = "/api/native/academic/tutor-support/";
const discussionsPath = (courseId: string | undefined) => courseId ? coursePath(courseId, "discussions") : "discussions";
const sendErrors = new Set(["invalid", "unavailable", "rate_limited", "conflict", "resolved", "attachment_expired", "unknown"]);

function isSendResult(value: unknown): value is TutorDiscussionSendResult {
  if (!value || typeof value !== "object") return false;
  const result = value as { ok?: unknown; error?: unknown; value?: { threadId?: unknown; messageId?: unknown } };
  if (result.ok === true || (result.ok === false && result.error === "replay_unverified")) {
    return Boolean(result.value && typeof result.value.threadId === "string" && typeof result.value.messageId === "string");
  }
  return result.ok === false && typeof result.error === "string" && sendErrors.has(result.error);
}

export function createTutorSupportClient(transport: AcademicTransport): TutorSupportClient {
  const pending = new Map<string, TutorDiscussionDraft>();
  const command = transport.command?.bind(transport);
  async function read<T>(path: string, signal: AbortSignal, query?: URLSearchParams): Promise<T> {
    const response = await transport.get(`${apiRoot}${path}${query ? `?${query}` : ""}`, signal);
    if (!response.ok) throw new TutorDataError(response.status);
    return response.json() as Promise<T>;
  }

  async function loadVideo(videoId: string, signal: AbortSignal) {
    const response = await transport.get(`/api/videos/${encodeURIComponent(videoId)}/playback-url`, signal);
    if (!response.ok) throw new TutorDataError(response.status);
    const body = await response.json();
    if (!body || typeof body !== "object" || !("url" in body)) throw new TutorDataError(422);
    return { url: body.url, fallbackUrl: "fallbackUrl" in body ? body.fallbackUrl : undefined };
  }

  return {
    videoPlayer: { origin: transport.origin, locale: transport.locale, load: loadVideo },
    liveHost: createTutorLiveHost(transport),
    slotEditor: createTutorSlotEditor(transport),
    tryoutGrade: createTryoutGradeEditor(transport),
    schedule: (week, signal) => read("schedule", signal, new URLSearchParams({ week: String(week) })),
    discussions: (courseId, search, cursor, signal) => {
      const query = new URLSearchParams({ search });
      if (cursor) query.set("cursor", cursor);
      return read(discussionsPath(courseId), signal, query);
    },
    discussion: (courseId, threadId, cursor, signal, targetMessageId) => {
      const query = new URLSearchParams({ thread: threadId });
      if (cursor) query.set("cursor", cursor);
      if (targetMessageId) query.set("message", targetMessageId);
      return read(discussionsPath(courseId), signal, query);
    },
    materials: (courseId, signal) => read(coursePath(courseId, "materials"), signal),
    videos: (courseId, signal) => read(coursePath(courseId, "videos"), signal),
    live: (courseId, signal) => read(coursePath(courseId, "live"), signal),
    async playback(videoId, signal) {
      const body = await loadVideo(videoId, signal);
      const url = tutorPlaybackUrl(body.url);
      if (!url) throw new TutorDataError(422);
      return url;
    },
    ...(command ? {
      pendingAnswer: (threadId) => pending.get(threadId),
      async answer(courseId, threadId, draft, signal) {
        const existing = pending.get(threadId);
        if (existing && existing.body !== draft.body) return { ok: false, error: "unknown" };
        const attempt = existing ?? draft;
        pending.set(threadId, attempt);
        const response = await command(apiRoot + discussionsPath(courseId), {
          method: "POST",
          body: { ...attempt, threadId },
          requestId: attempt.requestId,
        }, signal).catch((error: unknown) => {
          if (error instanceof NativeRequestNotDispatched && !existing && pending.get(threadId) === attempt) pending.delete(threadId);
          throw error;
        });
        if (!response.ok) {
          if ([400, 413, 415, 422].includes(response.status)) {
            pending.delete(threadId);
            return { ok: false, error: "invalid" };
          }
          if ([401, 403, 404, 409].includes(response.status)) pending.delete(threadId);
          throw new TutorDataError(response.status);
        }
        const result = await response.json();
        if (!isSendResult(result)) throw new TutorDataError(502);
        if ((result.ok || result.error === "replay_unverified") && result.value.threadId !== threadId) throw new TutorDataError(502);
        if (result.ok || !["unknown", "rate_limited", "replay_unverified"].includes(result.error)) pending.delete(threadId);
        return result;
      },
    } satisfies Pick<TutorSupportClient, "pendingAnswer" | "answer"> : {}),
  };
}
