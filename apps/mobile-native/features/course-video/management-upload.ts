import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import {
  ALLOWED_IMAGE_MIME_TYPES, ALLOWED_VIDEO_MIME_TYPES, MAX_THUMBNAIL_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES,
} from "../../../../lib/video/upload-policy";
import { videoManagementPath, type VideoManagerRole, type VideoUploadKind } from "../../../../packages/course-video/management";
import { type DraftDocument } from "../../device/file-controller";
import { scopedFiles } from "../../device/files";
import type { NativeSessionTransport } from "../../network/transport";
import { prepareManagedVideoUpload, VideoManagementFailure } from "./management-client";

function policy(kind: VideoUploadKind) {
  return kind === "video" ? { mimeTypes: ALLOWED_VIDEO_MIME_TYPES, maxBytes: MAX_VIDEO_SIZE_BYTES }
    : { mimeTypes: ALLOWED_IMAGE_MIME_TYPES, maxBytes: MAX_THUMBNAIL_SIZE_BYTES };
}

type UploadScope = { session: NativeSessionTransport; role: VideoManagerRole; courseId: string; locale: "id" | "en" };

export function pickCourseVideoAsset(scope: UploadScope, kind: VideoUploadKind, signal: AbortSignal) {
  const target = videoManagementPath(scope.role, scope.courseId);
  if (!target) throw new VideoManagementFailure(404);
  return scopedFiles.pickDocument({
    session: scope.session, target: { route: `${target}?asset=${kind}`, locale: scope.locale, draftId: randomUUID() },
    policy: policy(kind), signal, isDraftCurrent: () => scope.session.isCurrent() && !signal.aborted,
  });
}

export async function uploadCourseVideoAsset(scope: UploadScope, kind: VideoUploadKind, document: DraftDocument, signal: AbortSignal) {
  const { session, role, courseId, locale } = scope;
  const route = videoManagementPath(role, courseId);
  if (!route || !scopedFiles.belongsToDocumentDraft(document, {
    session, target: { route: `${route}?asset=${kind}`, locale, draftId: document.target.draftId },
    signal, policy: policy(kind), isDraftCurrent: () => session.isCurrent() && !signal.aborted,
  })) throw new VideoManagementFailure(403);
  const grant = await prepareManagedVideoUpload(session, role, courseId, {
    kind, uploadId: randomUUID(), name: document.name, mime: document.mimeType, size: document.size,
  }, signal);
  session.assertCurrent();
  if (signal.aborted) throw new VideoManagementFailure(403);

  const active = new AbortController();
  const cancel = () => active.abort();
  signal.addEventListener("abort", cancel, { once: true });
  session.signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted || session.signal.aborted) active.abort();
    const response = await fetch(grant.uploadUrl, {
      method: "PUT", body: new File(document.uri), headers: { "Content-Type": document.mimeType },
      credentials: "omit", redirect: "error", signal: active.signal,
    });
    await response.body?.cancel();
    if (!response.ok || response.redirected || active.signal.aborted || !session.isCurrent()) throw new VideoManagementFailure(503);
    return grant.token;
  } finally {
    signal.removeEventListener("abort", cancel);
    session.signal.removeEventListener("abort", cancel);
  }
}
