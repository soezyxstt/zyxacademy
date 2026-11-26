import type { FormWriteIdentity } from "../../../../packages/forms/response-policy";
import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import { NATIVE_STAGING_ORIGIN } from "../../auth/session-api";
import { scopedFiles } from "../../device/files";
import type { DocumentDraftRequest } from "../../device/file-controller";
import { uploadPublicForm, type FormRequest, type FormUpload } from "./client";

export const requestPublicForm: FormRequest = async (path, init) => {
  const url = new URL(path, NATIVE_STAGING_ORIGIN);
  if (url.origin !== NATIVE_STAGING_ORIGIN || url.username || url.password || url.hash
    || !(url.pathname.startsWith("/api/forms/"))) throw new Error("Invalid public form path.");
  const response: Pick<Response, "body" | "headers" | "redirected" | "status" | "type" | "url"> =
    await fetch(url.href, { ...init, credentials: "omit", redirect: "manual" });
  const dispose = () => { void response.body?.cancel().catch(() => {}); };
  if (response.redirected || response.status === 0 || (response.status >= 300 && response.status < 400)
    || (response.url && new URL(response.url).origin !== NATIVE_STAGING_ORIGIN)) {
    dispose();
    throw new Error("Unexpected public form redirect.");
  }
  return { status: response.status, headers: response.headers, body: response.body, dispose };
};

export type PickedFormUpload = Exclude<FormUpload, { status: "uploaded" }> | { status: "cancelled" } | { status: "uploaded"; storageUrl: string; filename: string };

export async function pickAndUploadFormFile(resolveWrite: () => Promise<{ request: FormRequest; identity?: FormWriteIdentity } | null>, draft: DocumentDraftRequest, formId: string, questionIndex: number): Promise<PickedFormUpload> {
  const selected = await scopedFiles.pickDocument(draft);
  if (selected.status !== "ready") {
    if (selected.status === "cancelled" || selected.status === "stale") return { status: "cancelled" };
    if (selected.status === "error" && (selected.issue === "size" || selected.issue === "type")) return { status: selected.issue };
    return { status: "retry" };
  }
  const { document } = selected;
  try {
    const verified = await resolveWrite();
    if (!verified || !draft.session.isCurrent() || !draft.isDraftCurrent()) return { status: "cancelled" };
    const file = new File(document.uri);
    const body = new FormData();
    body.append("file", file);
    body.append("formSlug", formId);
    body.append("questionNumber", String(questionIndex + 1));
    const response = await uploadPublicForm(verified.request, body, draft.signal ?? draft.session.signal, draft.session.scope.origin, verified.identity);
    return response.status === "uploaded" ? { ...response, filename: document.name } : response;
  } finally {
    document.release();
  }
}
