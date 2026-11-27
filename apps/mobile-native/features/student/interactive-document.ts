import type { InteractiveDocumentSpec } from "../../../../lib/materials/interactive-document";
import { interactiveDocumentPath, type InteractiveDocumentAssetKind, type InteractiveDocumentScope } from "../../../../lib/materials/interactive-document-path";
import { INTERACTIVE_DOCUMENT_CONTENT_CSP, INTERACTIVE_DOCUMENT_CSP, READY_BOOTSTRAP } from "../../../../lib/materials/interactive-document-policy";
import type { StudentRequest } from "./contracts";

export type VisualSource = { spec: InteractiveDocumentSpec; scope: InteractiveDocumentScope | null };

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

export function interactiveFrameHtml(document: string, title: string, theme: "light" | "dark" = "light") {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="content-security-policy" content="${escape(INTERACTIVE_DOCUMENT_CONTENT_CSP)}"><style>html{color-scheme:${theme}}html,body{height:100%;margin:0}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe sandbox="allow-scripts" referrerpolicy="no-referrer" title="${escape(title)}" srcdoc="${escape(document)}"></iframe><script>
const frame = document.querySelector("iframe");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const send = () => frame.contentWindow?.postMessage({
  type: "zyx:preferences", theme: "${theme}", reducedMotion: motion.matches, active: !document.hidden
}, "*");
frame.addEventListener("load", send);
document.addEventListener("visibilitychange", send);
motion.addEventListener("change", send);
</script></body></html>`;
}

export const isInteractiveDocumentNavigation = (url: string) => url === "about:blank" || url === "about:srcdoc";

export async function loadInteractiveDocument(
  request: StudentRequest,
  { spec, scope }: VisualSource,
  kind: InteractiveDocumentAssetKind,
  signal: AbortSignal,
  verify: (bytes: Uint8Array<ArrayBuffer>, sha256: string) => Promise<boolean>,
): Promise<Uint8Array<ArrayBuffer>> {
  const path = interactiveDocumentPath(scope, spec, kind);
  if (!path) throw new Error("VISUAL_SCOPE_UNAVAILABLE");
  const response = await request(path, { signal });
  try {
    const document = kind === "document";
    const length = document ? spec.documentBytes : spec.printBytes;
    const expectedLength = length + (document ? READY_BOOTSTRAP.length : 0);
    const type = response.headers.get("content-type");
    const declared = response.headers.get("content-length");
    const encoding = response.headers.get("content-encoding");
    if (!response.ok || type !== (document ? "text/html; charset=utf-8" : "image/png") ||
      response.headers.get("content-security-policy") !== INTERACTIVE_DOCUMENT_CSP ||
      (declared !== null && (!encoding || encoding === "identity") && Number(declared) !== expectedLength)) throw new Error("VISUAL_UNAVAILABLE");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("VISUAL_UNAVAILABLE");
    const body = new Uint8Array(expectedLength);
    let offset = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        if (next.value.length > expectedLength - offset) throw new Error("VISUAL_FORMAT_INVALID");
        body.set(next.value, offset);
        offset += next.value.length;
      }
    } finally {
      reader.releaseLock();
    }
    if (offset !== expectedLength || (document && !body.subarray(length).every((byte, index) => byte === READY_BOOTSTRAP.charCodeAt(index)))) {
      throw new Error("VISUAL_FORMAT_INVALID");
    }
    const bytes = body.subarray(0, length);
    if (signal.aborted || !await verify(bytes, document ? spec.documentSha256 : spec.printSha256) || signal.aborted) {
      throw new Error("VISUAL_VALIDATION_FAILED");
    }
    return bytes;
  } finally {
    response.dispose?.();
  }
}
