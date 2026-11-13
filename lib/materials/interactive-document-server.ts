import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { InteractiveDocumentSpec } from "./interactive-document";
import { verifyAdmittedInteractiveDocumentAsset } from "./interactive-document-verified";
export { interactiveDocumentResponse, INTERACTIVE_DOCUMENT_CSP } from "./interactive-document-verified";

type ValidationState = { active: boolean; queue: Array<() => void>; admitted: Set<string>; pending: Map<string, Promise<void>> };
const shared = globalThis as typeof globalThis & { __zyxPngValidation?: ValidationState };
const state = shared.__zyxPngValidation ??= { active: false, queue: [], admitted: new Set(), pending: new Map() };

async function validatePng(bytes: Uint8Array): Promise<void> {
  if (state.active) {
    if (state.queue.length >= 8) throw new Error("INTERACTIVE_DOCUMENT_PRINT_BUSY");
    await new Promise<void>(resolve => state.queue.push(resolve));
  } else state.active = true;
  try {
    const worker = new Worker(join(process.cwd(), "lib/materials/interactive-document-png-worker.cjs"), {
      workerData: bytes,
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("INTERACTIVE_DOCUMENT_PRINT_TIMEOUT")), 20_000);
        const finish = (error?: Error) => {
          clearTimeout(timer);
          if (error) reject(error); else resolve();
        };
        worker.once("message", valid => finish(valid === true ? undefined : new Error("INTERACTIVE_DOCUMENT_PRINT_INVALID")));
        worker.once("error", () => finish(new Error("INTERACTIVE_DOCUMENT_PRINT_INVALID")));
        worker.once("exit", () => finish(new Error("INTERACTIVE_DOCUMENT_PRINT_INVALID")));
      });
    } finally {
      await worker.terminate();
    }
  } finally {
    const next = state.queue.shift();
    if (next) next(); else state.active = false;
  }
}

export async function verifyInteractiveDocumentAsset(spec: InteractiveDocumentSpec, kind: "document" | "print", bytes: Uint8Array): Promise<void> {
  if (kind === "print" && bytes.byteLength > 2 * 1024 * 1024) throw new Error("INTERACTIVE_DOCUMENT_PRINT_INVALID");
  verifyAdmittedInteractiveDocumentAsset(spec, kind, bytes);
  if (kind === "document") return;
  const digest = spec.printSha256;
  if (state.admitted.has(digest)) return;
  let pending = state.pending.get(digest);
  if (!pending) {
    pending = validatePng(Buffer.from(bytes)).then(() => {
      if (state.admitted.size >= 128) state.admitted.delete(state.admitted.values().next().value!);
      state.admitted.add(digest);
    });
    state.pending.set(digest, pending);
    void pending.finally(() => state.pending.delete(digest)).catch(() => {});
  }
  await pending;
}
