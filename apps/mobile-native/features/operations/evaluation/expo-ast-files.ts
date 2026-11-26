import * as Clipboard from "expo-clipboard";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import { scopedFiles } from "../../../device/files";
import type { NativeSessionTransport } from "../../../network/transport";
import type { EvaluationFiles } from "./AstInspectorScreen";

const jsonPolicy = { mimeTypes: ["application/json"], maxBytes: 2 * 1024 * 1024 } as const;

export function connectAstFiles(session: NativeSessionTransport, locale: "id" | "en"): EvaluationFiles | undefined {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return undefined;
  const scope = (signal: AbortSignal) => ({
    session, signal, isDraftCurrent: () => !signal.aborted && session.isCurrent(),
  });

  return {
    async importJson(signal) {
      const request = { ...scope(signal), policy: jsonPolicy, target: { route: "/admin/ast-inspector", locale, draftId: randomUUID() } };
      const result = await scopedFiles.pickDocument(request);
      if (result.status === "cancelled" || result.status === "stale") return null;
      if (result.status !== "ready") throw new Error("JSON could not be opened.");
      const { document } = result;
      try {
        if (!scopedFiles.belongsToDocumentDraft(document, request)) return null;
        const text = await new File(document.uri).text();
        return scopedFiles.belongsToDocumentDraft(document, request) ? text : null;
      } finally {
        document.release();
      }
    },
    async exportJson(name, text, signal) {
      const result = await scopedFiles.shareGeneratedJson({
        ...scope(signal), name, text, maxBytes: jsonPolicy.maxBytes,
        title: locale === "id" ? "Ekspor JSON" : "Export JSON",
      });
      if (result.status !== "finished" && result.status !== "cancelled" && result.status !== "stale") {
        throw new Error("JSON could not be shared.");
      }
    },
    async copyText(text, signal) {
      session.assertCurrent();
      if (signal.aborted) return;
      if (text.length > jsonPolicy.maxBytes || new TextEncoder().encode(text).length > jsonPolicy.maxBytes) {
        throw new Error("JSON is too large for the clipboard.");
      }
      if (!await Clipboard.setStringAsync(text)) throw new Error("JSON could not be copied.");
    },
  };
}
