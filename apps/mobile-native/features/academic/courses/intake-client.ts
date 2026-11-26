import { z } from "zod";
import {
  bundleIntakePath, intakeAccountHeader, intakeCourseHeader, intakeSessionHeader, pdfIntakeDuplicate, pdfIntakeGrant,
  pdfIntakePath, validPdfGroup, type BundleIntakeKind, type PdfIntakeEntry,
} from "../../../../../packages/native-parity/academic/courses/intake";
import type { DraftDocument } from "../../../device/file-controller";
import { signedStoragePutUrl } from "../../../network/signed-storage-url";
import type { NativeSessionTransport } from "../../../network/transport";

type Target = {
  session: NativeSessionTransport;
  courseId: string;
  current(): boolean;
  signal: AbortSignal;
};
type Device = {
  assertFile(document: DraftDocument): void;
  put(uploadUrl: string, document: DraftDocument, signal: AbortSignal): Promise<void>;
  form(document: DraftDocument): FormData;
};

const duplicatesResponse = z.object({ duplicates: z.record(z.string(), pdfIntakeDuplicate) });
const grantResponse = z.object({ data: z.array(pdfIntakeGrant) });
const commitResponse = z.object({ id: z.string(), created: z.number().int().nonnegative(), updated: z.number().int().nonnegative() });
const previewResponse = z.object({
  persisted: z.literal(false), checksum: z.string().regex(/^[a-f0-9]{64}$/), bundleId: z.string(),
  schemaVersion: z.string(), titles: z.array(z.string()).max(5), total: z.number().int().nonnegative(), proof: z.string().max(100),
});
const stageResponse = z.object({ result: z.object({ importId: z.string().min(1) }) });
export type BundleIntakePreview = z.infer<typeof previewResponse>;
export type PdfIntakeInput = { entry: PdfIntakeEntry; document: DraftDocument };
type PdfReceipt = z.infer<typeof commitResponse>;
type PreparedGroup = { commit(): Promise<PdfReceipt> };

export class IntakeFailure extends Error {
  constructor(readonly status: number, readonly codes: string[] = []) { super("Admin intake request failed"); }
}

export function createIntakeClient(target: Target, device: Device) {
  const { session, courseId, signal } = target;
  const assertCurrent = () => {
    session.assertCurrent();
    if (signal.aborted || !target.current()) throw new IntakeFailure(403);
  };
  const headers = {
    Origin: session.scope.origin,
    [intakeAccountHeader]: session.scope.accountId,
    [intakeSessionHeader]: session.scope.sessionId,
    [intakeCourseHeader]: courseId,
  };
  async function send<T>(path: string, schema: z.ZodType<T>, payload: object) {
    assertCurrent();
    const json = !(payload instanceof FormData);
    const response = await session.request(path, {
      method: "POST", requiredRole: "admin", signal,
      headers: json ? { ...headers, "Content-Type": "application/json" } : headers,
      body: json ? JSON.stringify(payload) : payload,
    });
    try {
      assertCurrent();
      const value = await response.json().catch(() => null);
      assertCurrent();
      if (!response.ok) {
        const trouble = z.object({ error: z.string().optional(), reasonCodes: z.array(z.string()).optional() }).safeParse(value);
        throw new IntakeFailure(response.status, trouble.success ? trouble.data.reasonCodes ?? [trouble.data.error ?? ""] : []);
      }
      const result = schema.safeParse(value);
      if (!result.success) throw new IntakeFailure(502);
      return result.data;
    } finally { response.dispose(); }
  }

  async function bundle(path: string, document: DraftDocument, intent: "preview" | "stage", proof?: string) {
    assertCurrent();
    device.assertFile(document);
    const form = device.form(document);
    form.append("intent", intent);
    if (proof) form.append("proof", proof);
    return intent === "preview" ? send(path, previewResponse, form) : send(path, stageResponse, form);
  }

  return {
    async findDuplicates(checksums: string[]) {
      if (!checksums.length) return {};
      const result = await send(pdfIntakePath + "/check-duplicates", duplicatesResponse, { checksums: Array.from(new Set(checksums)) });
      return result.duplicates;
    },
    async preparePdfGroup(files: readonly PdfIntakeInput[], requestId: string): Promise<PreparedGroup> {
      assertCurrent();
      const entries = files.map(file => file.entry);
      if (!validPdfGroup(entries)) throw new IntakeFailure(400);
      for (const file of files) device.assertFile(file.document);
      const { data } = await send(pdfIntakePath + "/presign", grantResponse, entries);
      if (data.length !== entries.length || new Set(data.map(grant => grant.id)).size !== entries.length) throw new IntakeFailure(502);
      const grants = new Map(data.map(grant => [grant.id, grant]));
      const proofs: string[] = [];
      // Send only device bytes to the storage origin. The session identifies the web requests.
      for (const { entry, document } of files) {
        const grant = grants.get(entry.id);
        if (!grant) throw new IntakeFailure(502);
        const url = signedStoragePutUrl(grant.uploadUrl);
        if (!url || new URL(url).origin === session.scope.origin) {
          throw new IntakeFailure(502);
        }
        assertCurrent();
        device.assertFile(document);
        await device.put(url, document, signal);
        assertCurrent();
        proofs.push(grant.proof);
      }
      return {
        commit() {
          return send(pdfIntakePath + "/commit", commitResponse, { entries, proofs, requestId }).then(result => {
            if (result.id !== requestId || result.created + result.updated !== entries.length) throw new IntakeFailure(502);
            return result;
          });
        },
      };
    },
    async previewBundle(kind: BundleIntakeKind, document: DraftDocument): Promise<BundleIntakePreview> {
      const result = await bundle(bundleIntakePath(kind), document, "preview");
      if (!("proof" in result)) throw new IntakeFailure(502);
      return result;
    },
    async stageBundle(kind: BundleIntakeKind, document: DraftDocument, preview: BundleIntakePreview) {
      const result = await bundle(bundleIntakePath(kind), document, "stage", preview.proof);
      if (!("result" in result)) throw new IntakeFailure(502);
      return result.result.importId;
    },
  };
}
