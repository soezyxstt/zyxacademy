import { File } from "expo-file-system";
import { scopedFiles } from "../../../device/files";
import type { NativeSessionTransport } from "../../../network/transport";
import { createMediaFilePicker } from "./media-upload";

export function connectMediaFilePicker(session: NativeSessionTransport) {
  return createMediaFilePicker(session, {
    pick: scopedFiles.pickDocument,
    multipart(document) {
      const body = new FormData();
      body.append("file", new File(document.uri));
      return body;
    },
  });
}
