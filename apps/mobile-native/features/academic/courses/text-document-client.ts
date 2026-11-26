import { textDocumentSources, type TextDocumentDraft, type TextDocumentEdit } from "../../../../../packages/native-parity/academic/courses/text-document";
import { parseReadingData, type OfflineReadingData } from "../../../offline/reading-contract";
import type { AcademicTransport } from "../client";
import { createCourseCommandTarget } from "./write-client";

type DocumentView = { edit: TextDocumentEdit | null; kind: "article" | "diktat"; data: OfflineReadingData };
const base = "/api/native/academic-document";
const clients = new WeakMap<AcademicTransport, ReturnType<typeof buildClient>>();

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid document payload");
  return value as Record<string, unknown>;
}

function parseEdit(value: unknown): TextDocumentEdit | null {
  if (value === null) return null;
  const row = record(value);
  const { source, status, title, revision, markdown, chapterId, chapters } = row;
  if (!textDocumentSources.some(option => option === source) || (status !== "published" && status !== "draft") ||
    typeof title !== "string" || typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision) ||
    typeof markdown !== "string" || (chapterId !== null && typeof chapterId !== "string") || !Array.isArray(chapters) ||
    chapters.some(item => typeof record(item).id !== "string" || typeof record(item).title !== "string")) {
    throw new Error("Invalid document edit payload");
  }
  return row as unknown as TextDocumentEdit;
}

function buildClient(transport: AcademicTransport) {
  const target = transport.command && createCourseCommandTarget<TextDocumentDraft>(transport.command, undefined, base);
  const path = (slug: string, id: string) => `${encodeURIComponent(slug)}/${encodeURIComponent(id)}`;
  return {
    edit(slug: string, id: string) {
      return target ? target(path(slug, id), "PATCH") : undefined;
    },
    async read(slug: string, courseId: string, id: string, signal: AbortSignal): Promise<DocumentView> {
      const response = await transport.get(`${base}/${path(slug, id)}`, signal);
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "DENIED" : "UNAVAILABLE");
      const { kind, data, edit } = record(await response.json());
      if (kind !== "article" && kind !== "diktat") throw new Error("Invalid reading kind");
      return { kind, data: parseReadingData(data, { kind, id, courseId }), edit: parseEdit(edit) };
    },
  };
}

export function createTextDocumentClient(transport: AcademicTransport) {
  const client = clients.get(transport) ?? buildClient(transport);
  clients.set(transport, client);
  return client;
}
