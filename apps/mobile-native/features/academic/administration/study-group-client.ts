import {
  isStudyGroupEditorRead, isStudyGroupRecord, type StudyGroupRecord, type StudyGroupWrite,
} from "../../../../../packages/academic/study-group-edit";
import { ADMINISTRATION_API_PREFIX } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";
import { AdministrationReadError } from "./live-client";

export async function readStudyGroupEditor(transport: AcademicTransport, id: string | undefined, signal: AbortSignal) {
  const path = ADMINISTRATION_API_PREFIX + "group-editor" + (id ? `/${encodeURIComponent(id)}` : "");
  const response = await transport.get(path, signal);
  if (!response.ok) throw new AdministrationReadError(response.status);
  const data: unknown = await response.json();
  if (!isStudyGroupEditorRead(data) || (id === undefined && data.type !== "create")
    || (id !== undefined && (data.type !== "edit" || data.record.id !== id))) throw new AdministrationReadError(502);
  return data;
}

type SaveResult =
  | { status: "saved"; id: string }
  | { status: "conflict"; record: StudyGroupRecord }
  | { status: "uncertain" }
  | { status: "error"; message: string };

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function saveStudyGroup(transport: AcademicTransport, command: StudyGroupWrite, requestId: string, signal: AbortSignal): Promise<SaveResult> {
  if (!transport.command) return { status: "error", message: "Akses admin diperlukan." };
  const id = command.type === "edit" ? command.id : undefined;
  const path = ADMINISTRATION_API_PREFIX + "groups" + (id ? `/${encodeURIComponent(id)}` : "");
  const response = await transport.command(path,
    { method: command.type === "edit" ? "PATCH" : "POST", body: command.fields, requestId }, signal);
  if (response.status === 401 || response.status === 403) return { status: "error", message: "Akses admin diperlukan. Periksa sesi Anda." };
  if (response.status === 400 || response.status === 415) return { status: "error", message: "Periksa data kelompok." };
  if (response.status === 404) return { status: "error", message: "Kelompok tidak tersedia untuk diedit." };
  const data: unknown = await response.json().catch(() => null);
  if (object(data)) {
    if (response.ok && data.status === "saved" && data.requestId === requestId && typeof data.id === "string"
      && (!id || id === data.id)) return { status: "saved", id: data.id };
    if (response.status === 409 && data.status === "conflict" && isStudyGroupRecord(data.record) && data.record.id === id) {
      return { status: "conflict", record: data.record };
    }
    if (response.status === 409) return { status: "error", message: "Identitas permintaan telah digunakan. Muat ulang kelompok." };
    if (response.status === 422) {
      if (data.error === "INVALID_COURSE") return { status: "error", message: "Periksa pilihan mata kuliah aktif." };
      if (data.error === "INVALID_QUOTA") return { status: "error", message: "Total kuota harus mencakup sesi yang sudah dipakai." };
      if (data.error === "INVALID_DATES") return { status: "error", message: "Tanggal selesai harus sama dengan atau setelah tanggal mulai." };
      return { status: "error", message: "Periksa data kelompok." };
    }
  }
  return { status: "uncertain" };
}
