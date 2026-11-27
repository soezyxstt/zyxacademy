import { digest, CryptoDigestAlgorithm } from "expo-crypto";
import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import { scopedFiles } from "../../../device/files";
import type { DocumentDraftRequest, DraftDocument } from "../../../device/file-controller";
import { createIntakeClient, IntakeFailure } from "./intake-client";
import type { NativeSessionTransport } from "../../../network/transport";

export async function fingerprintPdf(document: DraftDocument) {
  const data = await new File(document.uri).arrayBuffer();
  if (data.byteLength !== document.size) throw new IntakeFailure(422);
  const result = await digest(CryptoDigestAlgorithm.SHA256, data);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function bindIntakeDevice(session: NativeSessionTransport, courseId: string, draft: DocumentDraftRequest & { signal: AbortSignal }) {
  const current = () => draft.isDraftCurrent() && session.isCurrent() && !draft.signal.aborted;
  return createIntakeClient({ session, courseId, current, signal: draft.signal }, {
    assertFile(document) {
      if (!current() || !scopedFiles.belongsToDocumentDraft(document, draft)) throw new IntakeFailure(403);
    },
    async put(uploadUrl, document, signal) {
      const active = new AbortController();
      const abort = () => active.abort();
      signal.addEventListener("abort", abort, { once: true });
      session.signal.addEventListener("abort", abort, { once: true });
      try {
        if (signal.aborted || session.signal.aborted) abort();
        const response = await fetch(uploadUrl, {
          method: "PUT", body: new File(document.uri), credentials: "omit", redirect: "error",
          signal: active.signal, headers: { "Content-Type": "application/pdf" },
        });
        await response.body?.cancel().catch(() => {});
        if (!response.ok || response.redirected || !current()) throw new IntakeFailure(503);
      } finally {
        signal.removeEventListener("abort", abort);
        session.signal.removeEventListener("abort", abort);
      }
    },
    form(document) {
      const form = new FormData();
      form.append("file", new File(document.uri), document.name);
      return form;
    },
  });
}
