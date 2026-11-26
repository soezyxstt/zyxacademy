import { useMemo } from "react";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { getDocumentAsync } from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { belongsToPhotoDraft, scopedPhotos, type PhotoDraftRequest } from "../../../device/photo";
import { isPhotoCacheFile } from "../../../device/photo-image";
import type { NativeSessionTransport } from "../../../network/transport";
import type { AssessmentKind } from "../../../../../packages/native-parity/student/assessment/contract";

export type AssessmentFile = { uri: string; name: string; type: string; size?: number; release?: () => void };
export type AssessmentAttachmentTarget = {
  route: string;
  kind: AssessmentKind;
  assessmentId: string;
  attemptId?: string;
  questionId: string;
  requestId: string;
  isDraftCurrent: () => boolean;
};
export type AssessmentPhotoPicker = {
  pick(target: AssessmentAttachmentTarget): Promise<AssessmentFile | null>;
  recover(target: AssessmentAttachmentTarget): Promise<AssessmentFile | null>;
  pickDocument?(target: AssessmentAttachmentTarget): Promise<AssessmentFile | null>;
};

const attachmentTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

function cachedDocument(uri: string): File | null {
  return isPhotoCacheFile(uri, Paths.cache.uri, Platform.OS === "ios") ? new File(uri) : null;
}

function releaseDocument(file: File) {
  try { if (file.exists) file.delete(); } catch { /* The source is a private cache copy. */ }
}

export function useAssessmentPhotos(transport: NativeSessionTransport | null, locale: "id" | "en"): AssessmentPhotoPicker | undefined {
  return useMemo(() => {
    if (!transport) return undefined;
    const session = transport;
    let documentPending = false;
    async function choose(mode: "pick" | "recover", input: AssessmentAttachmentTarget) {
      const draftId = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify([
        "assessment", input.kind, input.assessmentId, input.attemptId ?? null, input.questionId, input.requestId,
      ]));
      const request: PhotoDraftRequest = { session, target: { route: input.route, locale, draftId }, isDraftCurrent: input.isDraftCurrent };
      const result = mode === "recover" ? await scopedPhotos.recover(request) : await scopedPhotos.pick("library", request);
      if (result.status === "cancelled" || result.status === "no-pending" || result.status === "stale") return null;
      if (result.status !== "ready") {
        if (mode === "recover" && (result.status === "busy" || result.status === "unavailable")) return null;
        throw new Error("Assessment photo unavailable");
      }
      const photo = result.photo;
      if (!belongsToPhotoDraft(photo, request)) { photo.release(); return null; }
      return { uri: photo.uri, name: photo.name, type: photo.mimeType, size: photo.size, release: photo.release };
    }
    return {
      pick: (target) => choose("pick", target),
      recover: (target) => choose("recover", target),
      async pickDocument(target) {
        const isCurrent = () => session.isCurrent() && target.isDraftCurrent();
        if (!isCurrent() || documentPending) return null;
        documentPending = true;
        try {
          const result = await getDocumentAsync({ type: attachmentTypes, multiple: false, copyToCacheDirectory: true });
          if (result.canceled) return null;
          const files = result.assets.map((asset) => ({ asset, file: cachedDocument(asset.uri) }));
          const selected = files[0];
          if (!isCurrent() || files.length !== 1 || !selected?.file) {
            for (const { file } of files) if (file) releaseDocument(file);
            if (!isCurrent()) return null;
            throw new Error("Document selection unavailable");
          }
          const { asset, file } = selected;
          const type = asset.mimeType || file.type;
          if (!attachmentTypes.includes(type)) {
            releaseDocument(file);
            throw new Error("Unsupported document type");
          }
          return { uri: file.uri, name: file.name, type, size: file.size, release: () => releaseDocument(file) };
        } finally {
          documentPending = false;
        }
      },
    };
  }, [transport, locale]);
}
