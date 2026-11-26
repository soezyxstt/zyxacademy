import { requireNativeModule } from "expo";
import { openAndroidDocument, type AndroidDocumentReader } from "./document-stream";
import { randomUUID } from "expo-crypto";
import { getDocumentAsync } from "expo-document-picker";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { AppState, Platform } from "react-native";

import { createNativeFileController, type PickerDocument } from "./file-controller";

export type {
  DocumentDraftRequest, DocumentResult, DraftDocument, NativeDownloadRequest, NativeDownloadTarget,
  NativeFilePolicy, ShareFileResult,
} from "./file-controller";

const native = Platform.OS === "android" || Platform.OS === "ios";
let cache: Directory | undefined;

function resetOwnedCache(): void {
  const directory = new Directory(Paths.cache, "zyx-native-file-actions");
  if (directory.exists) directory.delete();
  directory.create({ intermediates: true });
  cache = directory;
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

function sourceFile(asset: PickerDocument): File {
  if (!localPath(asset.uri) && !(Platform.OS === "android" && /^content:\/\/[^/\\\s]+\//.test(asset.uri))) {
    throw new Error("Invalid document picker URI.");
  }
  return new File(asset.uri);
}

function discardPickerImport(asset: PickerDocument): void {
  if (Platform.OS !== "ios") return;
  // Both SDK file pickers import an OS-managed temporary copy on iOS. Only
  // unlink returned files inside this app's tmp folder, never the provider URI.
  const root = Paths.cache.parentDirectory.parentDirectory;
  const temporary = localPath(new Directory(root, "tmp").uri)?.replace(/\/$/, "");
  const path = localPath(asset.uri);
  if (!temporary || !path?.startsWith(`${temporary}/`)) return;
  try {
    const file = new File(asset.uri);
    if (file.exists) file.delete();
  } catch { /* UIKit owns the temporary import lifetime. */ }
}

function openSourceFile(asset: PickerDocument): ReadableStream<Uint8Array> {
  if (Platform.OS === "android" && asset.uri.startsWith("content://")) {
    return openAndroidDocument(requireNativeModule<AndroidDocumentReader>("ZyxDocumentStream"), asset.uri);
  }
  const handle = sourceFile(asset).open(FileMode.ReadOnly);
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
  resetOwnedCache,
  androidExports: Platform.OS === "android",
  async pick(mimeTypes) {
    const result = await getDocumentAsync({ type: [...mimeTypes], multiple: false, copyToCacheDirectory: false });
    if (result.canceled) return null;
    return result.assets.map(asset => {
      if (Platform.OS === "android" && asset.uri.startsWith("content://") && (asset.size ?? 0) <= 0) {
        return { ...asset, size: undefined };
      }
      return asset;
    });
  },
  inspect(asset) {
    if (Platform.OS === "android" && asset.uri.startsWith("content://")) {
      return { mimeType: asset.mimeType ?? undefined, size: asset.size };
    }
    const file = sourceFile(asset);
    return { mimeType: file.type, size: file.size };
  },
  open: openSourceFile,
  discard: discardPickerImport,
  createTemporary(name) {
    if (!cache) throw new Error("Temporary file storage is not available.");
    const directory = new Directory(cache, randomUUID());
    directory.create({ intermediates: true });
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

export function startNativeFileCacheLifecycle(): () => void {
  if (!native) return () => {};
  try { scopedFiles.initialize(); } catch { /* The next file action retries initialization. */ }
  const subscription = AppState.addEventListener("change", state => {
    if (state === "active") scopedFiles.expireExports();
  });
  return () => subscription.remove();
}
