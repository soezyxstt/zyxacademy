import type { AdminChapterDraft, AdminChapterEditor, AdminCourseEditDraft, AdminCourseEditor } from "../../../../packages/native-parity/academic/courses/edit-contract";
import type { AdminCourseSectionResult } from "../../../../packages/native-parity/academic/courses/sections";
import type { AdminCourse, AdminCourseOverview } from "../../../../packages/native-parity/academic/courses/model";
import { TutorDataError, type TutorDataSource } from "../../../../packages/native-parity/academic/tutor/model";

import { createCourseCommandTarget } from "./courses/write-client";
import { createTutorSupportClient } from "./tutor/support-client";

export interface AcademicResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type AcademicCommand = {
  method: "POST" | "PATCH" | "DELETE";
  body: unknown;
  requestId: string;
};

/** The host supplies its authenticated, origin-bound transport for this account. */
export interface AcademicTransport {
  accountId: string;
  origin: string;
  locale: string;
  get(path: string, signal: AbortSignal): Promise<AcademicResponse>;
  command?(path: string, init: AcademicCommand, signal: AbortSignal): Promise<AcademicResponse>;
}

const sessionClients = new WeakMap<AcademicTransport, ReturnType<typeof buildAcademicClient>>();

export function createAcademicClient(transport: AcademicTransport) {
  const current = sessionClients.get(transport);
  if (current) return current;
  const client = buildAcademicClient(transport);
  sessionClients.set(transport, client);
  return client;
}

function buildAcademicClient(transport: AcademicTransport) {
  async function read<T>(path: string, signal: AbortSignal): Promise<T> {
    const response = await transport.get(path, signal);
    if (!response.ok) throw new TutorDataError(response.status);
    return response.json() as Promise<T>;
  }
  const tutor: TutorDataSource = {
    support: createTutorSupportClient(transport),
    dashboard: signal => read("/api/native/academic/tutor/dashboard", signal),
    analytics: (id, signal) => read(`/api/native/academic/tutor/courses/${encodeURIComponent(id)}/analytics`, signal),
    participants: (id, signal) => read(`/api/native/academic/tutor/courses/${encodeURIComponent(id)}/participants`, signal),
    grading: (id, signal) => read(`/api/native/academic/tutor/courses/${encodeURIComponent(id)}/grading`, signal),
  };
  const command = transport.command?.bind(transport);
  const settingsTarget = command ? createCourseCommandTarget<AdminCourseEditDraft>(command) : undefined;
  const chapterTarget = command ? createCourseCommandTarget<AdminChapterDraft>(command) : undefined;
  const updateCourseSettings: AdminCourseEditor | undefined = settingsTarget ? (courseId) =>
    settingsTarget(`${encodeURIComponent(courseId)}/settings`, "PATCH") : undefined;
  const saveChapter: AdminChapterEditor | undefined = chapterTarget ? (courseId, chapterId) =>
    chapterTarget(`${encodeURIComponent(courseId)}/chapters${chapterId ? `/${encodeURIComponent(chapterId)}` : ""}`,
      chapterId ? "PATCH" : "POST") : undefined;
  return {
    tutor,
    updateCourseSettings,
    saveChapter,
    courses: (signal: AbortSignal) => read<AdminCourse[]>("/api/native/academic/admin/courses", signal),
    course: (slug: string, signal: AbortSignal) => read<AdminCourseOverview>(`/api/native/academic/admin/courses/${encodeURIComponent(slug)}`, signal),
    courseSection: (slug: string, section: string, itemId: string | undefined, signal: AbortSignal) => {
      const parts = [slug, section, ...(itemId ? [itemId] : [])].map(encodeURIComponent);
      return read<AdminCourseSectionResult>(`/api/native/academic/admin/courses/${parts.join("/")}`, signal);
    },
  };
}
