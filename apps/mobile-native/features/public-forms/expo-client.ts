import type { FormWriteIdentity } from "../../../../packages/forms/response-policy";
import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import { Platform } from "react-native";
import { NATIVE_STAGING_ORIGIN } from "../../auth/session-api";
import { scopedFiles } from "../../device/files";
import type { DocumentDraftRequest } from "../../device/file-controller";
import { scopedPhotos } from "../../device/photo";
import { uploadPublicForm, type FormCredentialRejection, type FormRequest, type FormUpload } from "./client";

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

export type FormUploadSource = "document" | "camera";
export const nativeFormCameraAvailable = Platform.OS === "android" || Platform.OS === "ios";
export type PickedFormUpload = Exclude<FormUpload, { status: "uploaded" }> | { status: "cancelled" }
  | { status: "uploaded"; storageUrl: string; filename: string }
  | { status: "camera-denied"; canAskAgain: boolean };

type SelectedFormFile = { status: "selected"; file: { uri: string; name: string; release(): void } };
type FormFileChoice = SelectedFormFile | Exclude<PickedFormUpload, { status: "uploaded" }>;

async function pickFormDocument(draft: DocumentDraftRequest): Promise<FormFileChoice> {
  const selected = await scopedFiles.pickDocument(draft);
  if (selected.status === "ready") return { status: "selected", file: selected.document };
  if (selected.status === "cancelled" || selected.status === "stale") return { status: "cancelled" };
  if (selected.status === "error" && (selected.issue === "size" || selected.issue === "type")) return { status: selected.issue };
  return { status: "retry" };
}

async function captureFormPhoto(draft: DocumentDraftRequest, questionIndex: number): Promise<FormFileChoice> {
  if (!nativeFormCameraAvailable || !draft.policy.mimeTypes.includes("image/jpeg")) return { status: "type" };
  const captured = await scopedPhotos.pick("camera", {
    session: draft.session,
    target: { ...draft.target, draftId: `${draft.target.draftId}:q${questionIndex + 1}` },
    isDraftCurrent: draft.isDraftCurrent,
    output: { format: "jpeg", maxBytes: draft.policy.maxBytes },
    discardOnRestore: true,
  });
  if (captured.status === "ready") {
    const { photo } = captured;
    if (photo.mimeType !== "image/jpeg" || photo.size > draft.policy.maxBytes) {
      photo.release();
      return { status: photo.mimeType !== "image/jpeg" ? "type" : "size" };
    }
    return { status: "selected", file: photo };
  }
  if (captured.status === "permission-denied") return { status: "camera-denied", canAskAgain: captured.canAskAgain };
  if (captured.status === "cancelled" || captured.status === "stale") return { status: "cancelled" };
  if (captured.status === "error" && captured.issue === "image-size") return { status: "size" };
  return { status: "retry" };
}

export async function pickAndUploadFormFile(source: FormUploadSource,
  resolveWrite: () => Promise<{ request: FormRequest; identity?: FormWriteIdentity } | null>,
  draft: DocumentDraftRequest, formId: string, questionIndex: number): Promise<PickedFormUpload | FormCredentialRejection> {
  const signal = draft.signal ?? draft.session.signal;
  const current = () => !signal.aborted && draft.session.isCurrent() && draft.isDraftCurrent();
  if (!current()) return { status: "cancelled" };
  const selected = source === "camera" ? await captureFormPhoto(draft, questionIndex) : await pickFormDocument(draft);
  if (selected.status !== "selected") return selected;
  const attachment = selected.file;
  try {
    if (!current()) return { status: "cancelled" };
    const verified = await resolveWrite();
    if (!verified || !current()) return { status: "cancelled" };
    const file = new File(attachment.uri);
    const body = new FormData();
    body.append("file", file);
    body.append("formSlug", formId);
    body.append("questionNumber", String(questionIndex + 1));
    const response = await uploadPublicForm(verified.request, body, signal, draft.session.scope.origin, verified.identity);
    return response.status === "uploaded" ? { ...response, filename: attachment.name } : response;
  } finally {
    attachment.release();
  }
}
