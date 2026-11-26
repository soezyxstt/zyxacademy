import { MEDIA_DOCUMENT_MIME_TYPES, MEDIA_MAX_UPLOAD_BYTES } from "../../../../../lib/media";
import { ManagementFailure, type ManagementReceipt } from "../../../../../packages/native-parity/operations/management-contract";
import type { DocumentDraftRequest, DocumentResult, DraftDocument } from "../../../device/file-controller";
import type { NativeResponse, NativeSessionTransport } from "../../../network/transport";

type UploadTarget = { action: "upload"; destination: string } | { action: "replace"; key: string };
type PreparedMedia = { name: string; release(): void; send(signal: AbortSignal): Promise<ManagementReceipt> };
type MediaSelection = { status: "ready"; file: PreparedMedia } | Exclude<DocumentResult, { status: "ready" }>;
export type PickMediaFile = (input: UploadTarget, target: DocumentDraftRequest["target"], signal: AbortSignal) => Promise<MediaSelection>;

export function createMediaFilePicker(session: NativeSessionTransport, device: {
  pick(draft: DocumentDraftRequest): Promise<DocumentResult>;
  multipart(document: DraftDocument): FormData;
}): PickMediaFile {
  return async (input, target, signal) => {
    const current = () => !signal.aborted && session.isCurrent();
    if (!current()) return { status: "stale" };
    const selected = await device.pick({
      session, target, signal, isDraftCurrent: current,
      policy: { mimeTypes: MEDIA_DOCUMENT_MIME_TYPES, maxBytes: MEDIA_MAX_UPLOAD_BYTES },
    });
    if (selected.status !== "ready") return selected;
    const { document } = selected;
    const file: PreparedMedia = {
      name: document.name,
      release: document.release,
      async send(requestSignal) {
        if (!current() || requestSignal.aborted) throw new ManagementFailure("forbidden");
        let response: NativeResponse | undefined;
        try {
          const body = device.multipart(document);
          body.append("action", input.action);
          if (input.action === "upload") body.append("destination", input.destination);
          else body.append("key", input.key);
          response = await session.request("/api/native/operations/management/media", {
            method: "POST", body, signal: requestSignal, requiredRole: "admin", headers: {
              "x-native-operations-user-id": session.scope.accountId,
              "x-native-operations-session-id": session.scope.sessionId,
              "x-native-operations-request-key": target.draftId,
            },
          });
          if (!current() || requestSignal.aborted) throw new ManagementFailure("forbidden");
          const errors = {
            400: "invalid", 401: "forbidden", 403: "forbidden", 404: "not-found", 409: "conflict", 413: "payload-too-large",
            415: "invalid", 424: "uncertain", 425: "pending",
          } as const;
          const failure = errors[response.status as keyof typeof errors];
          if (failure) throw new ManagementFailure(failure);
          if (!response.ok) throw new ManagementFailure("uncertain");
          const result = await response.json() as ManagementReceipt;
          if (!current() || requestSignal.aborted) throw new ManagementFailure("forbidden");
          if (typeof result?.id !== "string" || !result.id.startsWith("media/")) throw new ManagementFailure("uncertain");
          return result;
        } catch (error) {
          if (error instanceof ManagementFailure) throw error;
          throw new ManagementFailure(!current() || requestSignal.aborted ? "forbidden" : "uncertain");
        } finally {
          response?.dispose();
        }
      },
    };
    return { status: "ready", file };
  };
}
