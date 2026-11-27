import type { DocumentDraftRequest, DocumentResult } from "../../../device/file-controller";
import type { NativeSessionTransport } from "../../../network/transport";
import { blogBodyMimeTypes, blogThumbnailMimeTypes, blogUploadMaxBytes, isBlogUploadPath } from "../../../../../lib/blog/upload-policy";

type UploadResult = { status: "uploaded"; url: string } | { status: "cancelled" | "unavailable" | "type" | "size" | "forbidden" | "uncertain" };
export type BlogUploadPurpose = "thumbnail" | "body";
export type PickBlogMedia = (target: DocumentDraftRequest["target"], signal: AbortSignal, purpose?: BlogUploadPurpose) => Promise<UploadResult>;

export function createBlogMediaPicker(session: NativeSessionTransport, device: {
  pick(draft: DocumentDraftRequest): Promise<DocumentResult>;
  multipart(uri: string): FormData;
}): PickBlogMedia {
  return async (target, signal, purpose = "thumbnail") => {
    const current = () => !signal.aborted && session.isCurrent();
    if (!current()) return { status: "cancelled" };
    const edit = /^\/admin\/blog\/([A-Za-z0-9_-]{1,180})\/edit$/.exec(target.route);
    const articleId = edit?.[1];
    const draft = articleId ? `article:${articleId}` : "new";
    if ((!articleId && target.route !== "/admin/blog/new") || target.draftId !== `blog:${articleId ?? "new"}`) return { status: "unavailable" };
    const selected = await device.pick({
      session, target, signal, isDraftCurrent: current,
      policy: { mimeTypes: purpose === "body" ? blogBodyMimeTypes : blogThumbnailMimeTypes, maxBytes: blogUploadMaxBytes },
    });
    if (selected.status !== "ready") {
      if (!current() || selected.status === "cancelled" || selected.status === "stale") return { status: "cancelled" };
      if (selected.status === "error" && (selected.issue === "size" || selected.issue === "type")) return { status: selected.issue };
      return { status: "unavailable" };
    }

    let response: Awaited<ReturnType<NativeSessionTransport["request"]>> | undefined;
    const { document } = selected;
    let sent = false;
    try {
      if (!current()) return { status: "cancelled" };
      const body = device.multipart(document.uri);
      sent = true;
      response = await session.request("/api/blog/upload", {
        method: "POST", body, signal,
        headers: {
          "x-native-operations-user-id": session.scope.accountId,
          "x-native-operations-session-id": session.scope.sessionId,
          "x-native-blog-upload-purpose": purpose,
          "x-native-blog-draft": draft,
        },
      });
      if (response.status === 401 || response.status === 403 || response.status === 404) return { status: "forbidden" };
      if (response.status === 413) return { status: "size" };
      if (response.status === 400) return { status: "type" };
      if (!response.ok) return { status: "uncertain" };
      const data = await response.json() as { url?: unknown } | null;
      if (!current()) return { status: "cancelled" };
      if (typeof data?.url !== "string") return { status: "uncertain" };
      const url = data.url.startsWith("blog/") ? `/api/storage/file/${data.url}` : data.url;
      if (!isBlogUploadPath(url, purpose === "body")) return { status: "uncertain" };
      return { status: "uploaded", url };
    } catch {
      return { status: !current() ? "cancelled" : sent ? "uncertain" : "unavailable" };
    } finally {
      response?.dispose();
      document.release();
    }
  };
}
