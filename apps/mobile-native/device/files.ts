import { randomUUID } from "expo-crypto";
import { getDocumentAsync } from "expo-document-picker";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { Platform } from "react-native";

import { createNativeFileController, type PickerDocument } from "./file-controller";

export type {
  DocumentDraftRequest, DocumentResult, DraftDocument, NativeDownloadRequest, NativeDownloadTarget,
  NativeFilePolicy, ShareFileResult,
} from "./file-controller";

const native = Platform.OS === "android" || Platform.OS === "ios";
let cache: Directory | undefined;

function ownedCache(): Directory {
  if (cache) return cache;
  const directory = new Directory(Paths.cache, "zyx-native-file-actions");
  // No draft file or private download from a previous process can be resumed.
  if (directory.exists) directory.delete();
  directory.create({ intermediates: true });
  cache = directory;
  return directory;
}

function localPath(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "file:" || parsed.hostname || parsed.search || parsed.hash) return null;
    const path = decodeURIComponent(parsed.pathname).replace(/^\/private\/var\//, "/var/");
    return /(?:^|\/)\.{1,2}(?:\/|$)|[\\\u0000]/.test(path) ? null : path;
  } catch {
    return null;
  }
}

function pickerFile(asset: PickerDocument): File {
  const folder = localPath(new Directory(Paths.cache, "DocumentPicker").uri)?.replace(/\/$/, "");
  const path = localPath(asset.uri);
  if (!folder || !path?.startsWith(`${folder}/`) || path.slice(folder.length + 1).includes("/")) {
    throw new Error("Invalid document picker cache URI.");
  }
  return new File(asset.uri);
}

function openPickerFile(asset: PickerDocument): ReadableStream<Uint8Array> {
  const handle = pickerFile(asset).open(FileMode.ReadOnly);
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    handle.close();
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const bytes = await handle.readBytes(64 * 1024);
        if (!open) return;
        if (bytes.byteLength) controller.enqueue(bytes);
        else {
          close();
          controller.close();
        }
      } catch (error) {
        if (!open) return;
        close();
        controller.error(error);
      }
    },
    cancel: close,
  }, { highWaterMark: 0 });
}

export const scopedFiles = createNativeFileController({
  available: native,
  async pick(mimeTypes) {
    ownedCache();
    const result = await getDocumentAsync({ type: [...mimeTypes], multiple: false, copyToCacheDirectory: true });
    return result.canceled ? null : result.assets;
  },
  inspect(asset) {
    const file = pickerFile(asset);
    return { mimeType: file.type, size: file.size };
  },
  open: openPickerFile,
  discard(asset) {
    try {
      const file = pickerFile(asset);
      if (file.exists) file.delete();
    } catch { /* Never delete a provider-owned URI. */ }
  },
  createTemporary(name) {
    const directory = new Directory(ownedCache(), randomUUID());
    directory.create();
    const file = new File(directory, name);
    try {
      file.create();
      const handle = file.open(FileMode.WriteOnly);
      let open = true;
      return {
        uri: file.uri,
        write: bytes => handle.writeBytes(bytes),
        close() {
          if (!open) return;
          open = false;
          handle.close();
        },
        remove() {
          if (directory.exists) directory.delete();
        },
      };
    } catch (error) {
      if (directory.exists) directory.delete();
      throw error;
    }
  },
  canShare: isAvailableAsync,
  // Let iOS infer the UTI from the filename so the sharing plugin cannot create a second cache copy.
  share: (uri, mimeType, title) => shareAsync(uri, { dialogTitle: title, mimeType: Platform.OS === "android" ? mimeType : undefined }),
});
