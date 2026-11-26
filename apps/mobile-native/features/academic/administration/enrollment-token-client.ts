import {
  isEnrollmentTokenDetails, isEnrollmentTokenEditor, type EnrollmentTokenDetails, type EnrollmentTokenWrite,
} from "../../../../../packages/academic/enrollment-token-admin";
import { ADMINISTRATION_API_PREFIX } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";
import { AdministrationReadError } from "./live-client";

export async function readEnrollmentTokenEditor(transport: AcademicTransport, id: string | undefined, signal: AbortSignal) {
  const path = ADMINISTRATION_API_PREFIX + "token-editor" + (id ? `/${encodeURIComponent(id)}` : "");
  const response = await transport.get(path, signal);
  if (!response.ok) throw new AdministrationReadError(response.status);
  const data: unknown = await response.json();
  if (!isEnrollmentTokenEditor(data) || (!id && data.type !== "issue") || (id && (data.type !== "token" || data.token.id !== id))) {
    throw new AdministrationReadError(502);
  }
  return data;
}

type Result = { status: "saved"; id: string } | { status: "conflict"; token: EnrollmentTokenDetails }
  | { status: "error"; message: string } | { status: "uncertain" };

export async function saveEnrollmentToken(transport: AcademicTransport, command: EnrollmentTokenWrite, requestId: string, signal: AbortSignal): Promise<Result> {
  if (!transport.command) return { status: "error", message: "Akses admin diperlukan." };
  const id = command.type === "revoke" ? command.id : undefined;
  const path = ADMINISTRATION_API_PREFIX + "tokens" + (id ? `/${encodeURIComponent(id)}` : "");
  const response = await transport.command(path, { method: id ? "PATCH" : "POST", body: command.fields, requestId }, signal);
  if (response.status === 401 || response.status === 403) return { status: "error", message: "Akses admin diperlukan. Periksa sesi Anda." };
  if (response.status === 404) return { status: "error", message: "Token tidak tersedia." };
  const data: unknown = await response.json().catch(() => null);
  if (data && typeof data === "object" && "status" in data) {
    if (response.ok && data.status === "saved" && "requestId" in data && data.requestId === requestId
      && "id" in data && typeof data.id === "string" && (!id || data.id === id)) return { status: "saved", id: data.id };
    if (response.status === 409 && data.status === "conflict" && "token" in data && isEnrollmentTokenDetails(data.token)
      && data.token.id === id) return { status: "conflict", token: data.token };
  }
  if (response.status === 409) return { status: "error", message: "Identitas permintaan telah digunakan. Muat ulang token." };
  if (response.status === 400 || response.status === 415 || response.status === 422) return {
    status: "error",
    message: data && typeof data === "object" && "error" in data && data.error === "INVALID_COURSE"
      ? "Periksa pilihan mata kuliah aktif." : "Periksa data token.",
  };
  return { status: "uncertain" };
}
