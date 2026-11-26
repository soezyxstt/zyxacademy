import { File } from "expo-file-system";
import { scopedFiles } from "../../../device/files";
import type { NativeSessionTransport } from "../../../network/transport";
import { createBlogThumbnailPicker } from "./blog-upload";

export function connectBlogThumbnailPicker(session: NativeSessionTransport) {
  return createBlogThumbnailPicker(session, {
    pick: scopedFiles.pickDocument,
    multipart(uri) {
      const data = new FormData();
      data.append("file", new File(uri));
      return data;
    },
  });
}
