import type { AdminCourseEditor } from "../../../../packages/native-parity/academic/courses/edit-contract";
import type { AdminCourseSectionResult } from "../../../../packages/native-parity/academic/courses/sections";
import type { AdminCourse, AdminCourseOverview } from "../../../../packages/native-parity/academic/courses/model";
import { TutorDataError, type TutorDataSource } from "../../../../packages/native-parity/academic/tutor/model";

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
  const command = transport.command;
  const updateCourseSettings: AdminCourseEditor | undefined = command ? async (slug, draft, requestId, signal) => {
    const response = await command(`/api/native/academic/admin/courses/${encodeURIComponent(slug)}/settings`,
      { method: "PATCH", body: draft, requestId }, signal);
    switch (response.status) {
      case 200: {
        const result = await response.json();
        if (result && typeof result === "object" && "status" in result && "requestId" in result &&
            result.status === "saved" && result.requestId === requestId) return { status: "saved" };
        return { status: "retry" };
      }
      case 400:
      case 422: return { status: "invalid" };
      case 401:
      case 403: return { status: "denied" };
      case 404: return { status: "missing" };
      case 409: return { status: "conflict" };
      default: return { status: "retry" };
    }
  } : undefined;
  return {
    tutor,
    updateCourseSettings,
    courses: (signal: AbortSignal) => read<AdminCourse[]>("/api/native/academic/admin/courses", signal),
    course: (slug: string, signal: AbortSignal) => read<AdminCourseOverview>(`/api/native/academic/admin/courses/${encodeURIComponent(slug)}`, signal),
    courseSection: (slug: string, section: string, itemId: string | undefined, signal: AbortSignal) => {
      const parts = [slug, section, ...(itemId ? [itemId] : [])].map(encodeURIComponent);
      return read<AdminCourseSectionResult>(`/api/native/academic/admin/courses/${parts.join("/")}`, signal);
    },
  };
}
