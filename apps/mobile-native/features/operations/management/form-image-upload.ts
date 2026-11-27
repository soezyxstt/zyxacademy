import { FORM_IMAGE_MIMES } from "../../../../../packages/forms/file-types";
import { PUBLIC_FORM_MAX_FILE_SIZE_MB } from "../../../../../packages/forms/presentation";
import type { DocumentDraftRequest, DocumentResult } from "../../../device/file-controller";
import type { NativeSessionTransport } from "../../../network/transport";

type FormImageInput = {
  draft: DocumentDraftRequest["target"]; formTitle: string; questionIndex: number; signal: AbortSignal; isCurrent(): boolean;
};
type FormImageResult = { status: "uploaded"; url: string } |
  { status: "cancelled" | "unavailable" | "type" | "size" | "forbidden" | "uncertain" };
export type PickFormImage = (input: FormImageInput) => Promise<FormImageResult>;

export function createFormImagePicker(session: NativeSessionTransport, device: {
  pick(draft: DocumentDraftRequest): Promise<DocumentResult>;
  multipart(uri: string): FormData;
}): PickFormImage {
  return async ({ draft, formTitle, questionIndex, signal, isCurrent }) => {
    const current = () => !signal.aborted && session.isCurrent() && isCurrent();
    if (!current() || !Number.isSafeInteger(questionIndex) || questionIndex < 0) return { status: "cancelled" };
    const selected = await device.pick({ session, target: draft, signal, isDraftCurrent: current,
      policy: { mimeTypes: FORM_IMAGE_MIMES, maxBytes: PUBLIC_FORM_MAX_FILE_SIZE_MB * 1024 * 1024 } });
    if (selected.status !== "ready") {
      if (!current() || selected.status === "cancelled" || selected.status === "stale") return { status: "cancelled" };
      if (selected.status === "error" && (selected.issue === "size" || selected.issue === "type")) return { status: selected.issue };
      return { status: "unavailable" };
    }
    const { document } = selected;
    let response: Awaited<ReturnType<NativeSessionTransport["request"]>> | undefined;
    try {
      if (!current()) return { status: "cancelled" };
      const body = device.multipart(document.uri);
      body.append("formTitle", formTitle);
      body.append("questionNumber", String(questionIndex + 1));
      response = await session.request("/api/admin/custom-forms/image", {
        method: "POST", requiredRole: "admin", signal, body,
        headers: { Origin: session.scope.origin, "x-native-operations-user-id": session.scope.accountId, "x-native-operations-session-id": session.scope.sessionId },
      });
      if (response.status === 401 || response.status === 403) return { status: "forbidden" };
      if (response.status === 413) return { status: "size" };
      if (response.status === 415) return { status: "type" };
      if (!response.ok) return { status: "uncertain" };
      const result = await response.json() as { success?: true; url?: string; key?: string };
      if (!current()) return { status: "cancelled" };
      const key = result.key;
      if (result.success !== true || typeof key !== "string" || !new RegExp(`^forms/[a-z0-9-]+/question-${questionIndex + 1}/[a-z0-9_-]+\\.(?:jpe?g|png|webp|gif)$`).test(key)) {
        return { status: "uncertain" };
      }
      return { status: "uploaded", url: `/api/storage/file/${key}` };
    } catch {
      return { status: current() ? "uncertain" : "cancelled" };
    } finally {
      response?.dispose();
      document.release();
    }
  };
}
