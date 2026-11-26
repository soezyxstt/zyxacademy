import { useMemo } from "react";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { scopedFiles, type DocumentDraftRequest } from "../../../device/files";
import { belongsToPhotoDraft, scopedPhotos } from "../../../device/photo";
import type { NativeSessionTransport } from "../../../network/transport";
import { assessmentAttachmentLimit, type AssessmentAttachmentTarget, type AssessmentPhotoPicker } from "./device-contract";

const attachmentTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export function useAssessmentPhotos(transport: NativeSessionTransport | null, locale: "id" | "en"): AssessmentPhotoPicker | undefined {
  return useMemo(() => {
    if (!transport) return undefined;
    const session = transport;

    async function binding(input: AssessmentAttachmentTarget) {
      const draftId = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify([
        "assessment", input.kind, input.assessmentId, input.attemptId ?? null, input.questionId, input.requestId,
      ]));
      return { session, target: { route: input.route, locale, draftId }, isDraftCurrent: input.isDraftCurrent };
    }

    async function choose(mode: "pick" | "recover", input: AssessmentAttachmentTarget) {
      const request = await binding(input);
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
      async pickDocument(input) {
        const request: DocumentDraftRequest = { ...await binding(input), signal: input.signal,
          policy: { mimeTypes: attachmentTypes, maxBytes: assessmentAttachmentLimit(input.kind) } };
        const result = await scopedFiles.pickDocument(request);
        if (result.status === "cancelled" || result.status === "stale") return null;
        if (result.status !== "ready") throw new Error("Assessment document unavailable");
        const document = result.document;
        if (!scopedFiles.belongsToDocumentDraft(document, request)) { document.release(); return null; }
        return { uri: document.uri, name: document.name, type: document.mimeType, size: document.size, release: document.release };
      },
    };
  }, [transport, locale]);
}
