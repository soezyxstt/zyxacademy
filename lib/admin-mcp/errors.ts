import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { insufficientScopeChallenge } from "@/lib/authoring/mcp-oauth";
import { AdminMcpError } from "./mutations";

type RecoveryAction = "reauthorize" | "refresh_revision" | "correct_input" | "retry_same_request" | "inspect_operation" | "reconcile_provider" | "verify_environment";
/** Machine-readable guidance never includes SQL, provider messages, input values or credentials. */
export function adminMcpFailure(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : "";
  const missing = /^AUTHORING_MCP_SCOPE_REQUIRED:([a-z][a-z0-9:_-]+)$/.exec(message)?.[1];
  let cause: unknown = error;
  let concurrent = false;
  for (let depth = 0; cause && typeof cause === "object" && depth < 4; depth++) {
    const value = cause as { code?: unknown; cause?: unknown };
    if (value.code === "40001" || value.code === "40P01") concurrent = true;
    cause = value.cause;
  }
  const authorization = /^AUTHORING_MCP_(?:SESSION_INVALID|ADMIN_REQUIRED|CONSENT_REQUIRED)$/.test(message);
  const code = error instanceof AdminMcpError ? error.code : concurrent ? "CONCURRENT_WRITE_RETRY_REQUIRED" : missing ? "AUTHORING_MCP_SCOPE_REQUIRED" : error instanceof z.ZodError ? "INVALID_INPUT" : authorization ? message : /^MCP_[A-Z0-9_]+$/.test(message) ? message : "ADMIN_MCP_REQUEST_FAILED";
  let action: RecoveryAction = "inspect_operation";
  let recovery = "Periksa target dan status operasi sebelum mencoba lagi. Respons yang hilang bukan bukti bahwa operasi gagal.";
  let retryable = false;
  if (missing || authorization || code === "OAUTH_CONSENT_REQUIRED") { action = "reauthorize"; recovery = "Hubungkan ulang akun dengan izin yang diperlukan, lalu ulangi pada environment yang sama."; }
  else if (/REVISION_CONFLICT|STALE|SNAPSHOT_CHANGED/.test(code)) { action = "refresh_revision"; recovery = "Baca target terbaru, rekonsiliasi perubahan, lalu siapkan rencana baru."; }
  else if (/INVALID_INPUT|SLUG_CONFLICT|VALIDATION|TOO_LARGE|REDUCE_PAGE_SIZE|INVALID_|UNSUPPORTED|LIMIT/.test(code)) { action = "correct_input"; recovery = "Periksa bidang masukan dan batas tool sebelum menyiapkan ulang perubahan."; }
  else if (/TARGET_ENVIRONMENT|ENVIRONMENT_MISMATCH/.test(code)) { action = "verify_environment"; recovery = "Panggil admin.environment dan cocokkan environment serta origin. Jangan berpindah environment untuk mencoba ulang."; }
  else if (/RECONCILIATION_REQUIRED|JOB_NOT_UNKNOWN/.test(code)) { action = "reconcile_provider"; recovery = "Periksa adminjobs.get dan provider. Jangan ulangi efek eksternal yang hasilnya belum diketahui."; }
  else if (code === "CONCURRENT_WRITE_RETRY_REQUIRED") { action = "retry_same_request"; recovery = "Operasi bersamaan belum selesai. Periksa receipt, lalu ulangi operasi dan payload dengan requestKey yang sama."; retryable = true; }
  else if (/CONFIRMATION_/.test(code)) { action = "retry_same_request"; recovery = "Periksa admin.operation_receipt. Jika belum tercatat, siapkan token baru dengan operasi, payload dan requestKey yang sama."; retryable = true; }
  else if (code === "ADMIN_MCP_REQUEST_FAILED") { action = "retry_same_request"; recovery = "Periksa admin.operation_receipt sebelum mengulang. Pertahankan operasi, payload dan requestKey; jangan membuat key baru karena respons hilang."; retryable = true; }
  const issues = error instanceof z.ZodError ? error.issues.map(issue => ({ code: issue.code, path: issue.path.filter(part => typeof part === "string" || typeof part === "number") })) : undefined;
  const payload = { ok: false, error: code, recovery, action, retryable, ...(missing ? { requiredScope: missing } : {}), ...(issues ? { issues } : {}) };
  let challenge: string | undefined;
  if (missing) { try { challenge = insufficientScopeChallenge(missing); } catch { /* Unknown scopes must not invent a consent grant. */ } }
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError: true, ...(challenge ? { _meta: { "mcp/www_authenticate": [challenge] } } : {}) };
}
