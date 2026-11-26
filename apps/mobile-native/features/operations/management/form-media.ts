import { File } from "expo-file-system";
import { createFormImagePicker } from "./form-image-upload";
import { FORM_FILE_MIMES } from "../../../../../packages/forms/file-types";
import { PUBLIC_FORM_MAX_FILE_SIZE_MB } from "../../../../../packages/forms/presentation";
import { scopedFiles, type NativeDownloadTarget, type ShareFileResult } from "../../../device/files";
import type { NativeSessionTransport } from "../../../network/transport";

export type OpenFormAttachment = (target: Omit<Extract<NativeDownloadTarget, { kind: "form-response-attachment" }>, "kind">,
  signal: AbortSignal, isCurrent: () => boolean) => Promise<ShareFileResult>;

export function connectFormAttachment(session: NativeSessionTransport): OpenFormAttachment {
  return (target, signal, isTargetCurrent) => scopedFiles.shareAuthorizedDownload({
    session, target: { kind: "form-response-attachment", ...target }, signal, isTargetCurrent, title: "Lampiran formulir",
    policy: { mimeTypes: FORM_FILE_MIMES, maxBytes: PUBLIC_FORM_MAX_FILE_SIZE_MB * 1024 * 1024 },
  });
}

export function connectFormImagePicker(session: NativeSessionTransport) {
  return createFormImagePicker(session, {
    pick: scopedFiles.pickDocument,
    multipart(uri) {
      const data = new FormData();
      data.append("file", new File(uri));
      return data;
    },
  });
}
