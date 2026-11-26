import { assessmentRasterTypes, boundedAssessmentRaster, createAssessmentRasterQueue, fetchPublicAssessmentRaster, publicAssessmentRasterLimit, rasterPrefixLimit, type PublicAssessmentRasterFetch, type RasterAssetResponse } from "./assessment-raster";
import type { NativeSessionScope, NativeSessionTransport } from "../network/transport";
import { MATERIAL_PDF_HEADERS, MATERIAL_PDF_MAX_BYTES, materialPdfPath, type MaterialPdfTarget } from "../../../packages/native-parity/student/courses/pdf";
import { adminMaterialPdfPath, type AdminPdfBundle, ADMIN_PDF_ACCOUNT, ADMIN_PDF_SESSION } from "../../../packages/native-parity/academic/courses/pdf";
import { courseVideoSource } from "../../../packages/course-video/source";
import { matchesCourseVideoUploadHeader } from "../../../lib/video/upload-policy";
import { SCHEDULE_ACCOUNT, SCHEDULE_SESSION, scheduleFilePolicy, scheduleResourcePath, type ScheduleRole } from "../../../packages/native-parity/schedule/resources";
import { formQuestionImageProxyPath } from "../../../lib/forms/attachment";
import { FORM_FILE_MIMES, FORM_IMAGE_MIMES } from "../../../packages/forms/file-types";
import { PUBLIC_FORM_MAX_FILE_SIZE_MB } from "../../../packages/forms/presentation";
import { blogUploadMaxBytes } from "../../../lib/blog/upload-policy";
import { adminMediaDownloadPolicy, adminMediaFilePath, adminMediaPreviewPolicy } from "../../../packages/native-parity/operations/media-content";
import { previewStoragePath, type MarkdownPreviewAudience } from "../../../packages/native-parity/operations/admin-markdown-media";
import { TRYOUT_GRADE_ATTACHMENT_ACCOUNT, TRYOUT_GRADE_ATTACHMENT_SESSION, tryoutGradeAttachmentPath, tryoutGradeAttachmentPolicy,
  type TryoutGradeAttachment } from "../../../packages/academic/tryout-grade-attachment";
import type { PhotoDraftTarget } from "./photo-controller";

export type NativeFilePolicy = Readonly<{ mimeTypes: readonly string[]; maxBytes: number }>;
export type DocumentDraftRequest = {
  session: Pick<NativeSessionTransport, "scope" | "signal" | "isCurrent">;
  target: PhotoDraftTarget;
  isDraftCurrent(): boolean;
  policy: NativeFilePolicy;
  signal?: AbortSignal;
};

export type DraftDocument = Readonly<{
  scope: NativeSessionScope;
  target: PhotoDraftTarget;
  name: string;
  uri: string;
  mimeType: string;
  size: number;
  release(): void;
}>;

export type NativeDownloadTarget =
  | { kind: "admin-media"; key: string }
  | { kind: "diktat-pdf"; courseId: string; diktatId: string }
  | ({ kind: "course-material-pdf" } & MaterialPdfTarget)
  | { kind: "quiz-review-attachment"; courseId: string; attemptId: string; questionId: string }
  | { kind: "quiz-grade-attachment"; courseId: string; attemptId: string; questionId: string }
  | ({ kind: "tryout-grade-attachment" } & TryoutGradeAttachment)
  | { kind: "discussion-image"; attachmentId: string }
  | { kind: "schedule-resource"; role: ScheduleRole; bookingId: string; attachmentId: string }
  | { kind: "form-response-attachment"; formId: string; responseId: string; index: number };

export type NativeDownloadRequest = {
  session: NativeSessionTransport;
  target: NativeDownloadTarget;
  policy: NativeFilePolicy;
  fileName?: string;
  title?: string;
  signal?: AbortSignal;
  isTargetCurrent?(): boolean;
};

type Issue = "policy" | "invalid-target" | "type" | "size" | "incomplete" | "picker" | "read" | "fetch" | "share" | "unauthorized" | "not-found" | "changed";
type FileRejection = { status: "error"; issue: Issue } | { status: "cancelled" | "stale" | "busy" | "unavailable" };
export type DocumentsResult = { status: "ready"; documents: DraftDocument[] } | FileRejection;
export type DocumentResult = { status: "ready"; document: DraftDocument } | FileRejection;
export type ShareFileResult = { status: "finished" } | FileRejection;
export type PdfGrant = { revision: string; expiresAt: number };
export type PreparedMaterialPdf = PdfGrant & { uri: string; release(): void };
export type MaterialPdfRequest = {
  audience?: "admin";
  bundle?: AdminPdfBundle;
  session: NativeSessionTransport;
  target: MaterialPdfTarget;
  signal: AbortSignal;
  sessionExpiresAt: number;
  isTargetCurrent(): boolean;
};
export type MaterialPdfRenewal = { status: "ready"; grant: PdfGrant } | FileRejection;
export type MaterialPdfResult = { status: "ready"; document: PreparedMaterialPdf } | FileRejection;

export type PickerDocument = { uri: string; name: string; mimeType?: string; size?: number };
const videoExtensions = new Map([
  ["video/mp4", "mp4"], ["video/webm", "webm"], ["video/quicktime", "mov"], ["video/x-matroska", "mkv"], ["video/x-m4v", "m4v"],
]);

type TemporaryFile = {
  uri: string;
  write(bytes: Uint8Array): Promise<void>;
  close(): void;
  remove(): void;
};

type NativeFileDevice = {
  available: boolean;
  resetOwnedCache?(): void;
  androidExports?: boolean;
  pick(mimeTypes: readonly string[], multiple?: boolean): Promise<PickerDocument[] | null>;
  inspect(asset: PickerDocument): { mimeType?: string; size?: number };
  open(asset: PickerDocument): ReadableStream<Uint8Array>;
  discard(asset: PickerDocument): void;
  createTemporary(name: string): TemporaryFile;
  canShare(): Promise<boolean>;
  share(uri: string, mimeType: string, title: string): Promise<void>;
};

export const ANDROID_FILE_EXPORT_LEASE_MS = 2 * 60_000;

type ExportClock = {
  now(): number;
  schedule(work: () => void, delay: number): () => void;
};

const deviceClock: ExportClock = {
  now: Date.now,
  schedule(work, delay) {
    const timer = setTimeout(work, delay);
    return () => clearTimeout(timer);
  },
};

class FileIssue extends Error {
  constructor(readonly issue: Issue) { super(issue); }
}

function normalizeMimeType(value?: string | null): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function validPolicy({ mimeTypes, maxBytes }: NativeFilePolicy): boolean {
  return Number.isSafeInteger(maxBytes) && maxBytes > 0 && mimeTypes.length > 0
    && mimeTypes.every(mime => /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mime));
}

export function sanitizeNativeFileName(raw: string | undefined, fallback: string): string {
  return (raw ?? "").split(/[\\/]/).pop()?.normalize("NFC")
    .replace(/[\x00-\x1f\x7f%#<>:"|?*\u202a-\u202e\u2066-\u2069]/g, "_")
    .replace(/\.{2,}/g, ".").trim().replace(/^\.+/, "").slice(0, 120) || fallback;
}

const EXTENSIONS = new Map([
  ["application/pdf", "pdf"],
  ["application/json", "json"],
  ["application/zip", "zip"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/quicktime", "mov"],
  ["video/x-matroska", "mkv"],
  ["video/x-m4v", "m4v"],
]);

function fileName(raw: string | undefined, mimeType: string): string {
  const name = sanitizeNativeFileName(raw, "zyx-file");
  const ext = EXTENSIONS.get(mimeType);
  if (!ext || name.toLowerCase().endsWith(`.${ext}`) || (ext === "jpg" && /\.jpeg$/i.test(name))) return name;
  return `${name.replace(/\.[a-z0-9]{1,10}$/i, "").slice(0, 120 - ext.length - 1)}.${ext}`;
}

function dispositionName(disposition: string | null): string | undefined {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { return undefined; }
  }
  return disposition?.match(/filename="?([^";]+)"?/i)?.[1];
}

function downloadPath(target: NativeDownloadTarget): string | null {
  if (target.kind === "admin-media") return adminMediaFilePath(target.key, true);
  const id = (value: string) => /^[A-Za-z0-9:_-][A-Za-z0-9._:-]{0,255}$/.test(value);
  if (target.kind === "schedule-resource") return scheduleResourcePath(target.role, target.bookingId, target.attachmentId);
  if (target.kind === "tryout-grade-attachment") return tryoutGradeAttachmentPath(target);
  if (target.kind === "diktat-pdf" && id(target.courseId) && id(target.diktatId)) {
    return `/api/courses/${encodeURIComponent(target.courseId)}/diktats/${encodeURIComponent(target.diktatId)}/pdf?download=1`;
  }
  if (target.kind === "course-material-pdf") return materialPdfPath(target, true);
  if (target.kind === "discussion-image" && id(target.attachmentId)) {
    return `/api/discussions/attachments/${encodeURIComponent(target.attachmentId)}?download=1`;
  }
  if (target.kind === "form-response-attachment" && id(target.formId) && id(target.responseId) &&
    Number.isSafeInteger(target.index) && target.index >= 0 && target.index < 1_000_000) {
    return `/api/native/operations/forms/${encodeURIComponent(target.formId)}/responses/${encodeURIComponent(target.responseId)}/attachment/${target.index}`;
  }
  if (target.kind === "quiz-review-attachment" && [target.courseId, target.attemptId, target.questionId].every(id)) {
    const [course, attempt, question] = [target.courseId, target.attemptId, target.questionId].map(encodeURIComponent);
    return `/api/native/student/assessment/${course}/my-results/${attempt}/attachment/${question}`;
  }
  if (target.kind === "quiz-grade-attachment" && [target.courseId, target.attemptId, target.questionId].every(id)) {
    const [course, attempt, question] = [target.courseId, target.attemptId, target.questionId].map(encodeURIComponent);
    return `/api/native/academic-assessment/tutor/${course}/grading/${attempt}/attachment/${question}`;
  }
  return null;
}

function sameDraft(document: Pick<DraftDocument, "scope" | "target">, request: DocumentDraftRequest): boolean {
  const { scope, target } = document;
  return scope.origin === request.session.scope.origin && scope.accountId === request.session.scope.accountId
    && scope.sessionId === request.session.scope.sessionId && target.route === request.target.route
    && target.locale === request.target.locale && target.draftId === request.target.draftId;
}

function rejectCurrent(request: Pick<DocumentDraftRequest, "session" | "signal">, isDraftCurrent = () => true): FileRejection | null {
  if (!request.session.isCurrent() || request.session.signal.aborted || !isDraftCurrent()) return { status: "stale" };
  return request.signal?.aborted ? { status: "cancelled" } : null;
}

function sizeIssue(size: number | undefined, max: number): Issue | null {
  if (size === undefined) return null;
  if (!Number.isSafeInteger(size) || size <= 0) return "read";
  return size > max ? "size" : null;
}

async function copyBytes(
  stream: ReadableStream<Uint8Array>,
  file: TemporaryFile,
  mimeType: string,
  limit: number,
  expectedSize: number | undefined,
  assertCurrent: () => void,
  signals: readonly (AbortSignal | undefined)[],
  validateRaster = false,
): Promise<number> {
  const reader = stream.getReader();
  let size = 0;
  let eof = false;
  const prefix = new Uint8Array(validateRaster ? rasterPrefixLimit : 1024);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  for (const signal of signals) signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      assertCurrent();
      const part = await reader.read();
      assertCurrent();
      if (part.done) {
        eof = true;
        break;
      }
      if (size < prefix.byteLength) prefix.set(part.value.subarray(0, prefix.byteLength - size), size);
      size += part.value.byteLength;
      if (size > limit) throw new FileIssue("size");
      if (expectedSize !== undefined && size > expectedSize) throw new FileIssue("incomplete");
      await file.write(part.value);
    }
    if (size === 0 || (expectedSize !== undefined && size !== expectedSize)) throw new FileIssue("incomplete");
    const header = prefix.subarray(0, size);
    if (validateRaster ? !boundedAssessmentRaster(header, mimeType) : !matchesFileHeader(header, mimeType)) throw new FileIssue("type");
    return size;
  } finally {
    for (const signal of signals) signal?.removeEventListener("abort", cancel);
    if (!eof) cancel();
    reader.releaseLock();
    file.close();
  }
}

function matchesFileHeader(prefix: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255;
  if (mimeType === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => prefix[index] === byte);
  const ascii = (start: number, end: number) => String.fromCharCode(...prefix.subarray(start, end));
  if (mimeType === "image/gif") return ["GIF87a", "GIF89a"].includes(ascii(0, 6));
  if (mimeType === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (mimeType.startsWith("video/")) return matchesCourseVideoUploadHeader(prefix, mimeType);
  if (mimeType === "application/zip") return [80, 75, 3, 4].every((byte, index) => prefix[index] === byte);
  if (mimeType === "application/pdf") return /%PDF-\d\.\d/.test(ascii(0, prefix.length));
  return true;
}

function resultFrom(error: unknown, fallback: Issue): FileRejection {
  return { status: "error", issue: error instanceof FileIssue ? error.issue : fallback };
}

function removeTemporary(file: TemporaryFile | undefined): void {
  if (!file) return;
  try { file.close(); } catch { /* Still try to delete the staged file. */ }
  try { file.remove(); } catch { /* The dedicated cache is also purged on the next launch. */ }
}

export function createNativeFileController(device: NativeFileDevice, clock = deviceClock) {
  const publicAssessmentImages = createAssessmentRasterQueue();
  const heldDocuments = new WeakMap<DraftDocument, AbortSignal>();
  const exports = new Map<TemporaryFile, { expiresAt: number; release(): void }>();
  let initialized = false;
  let picking = false;
  let sharing = false;

  function initialize(): void {
    if (!device.available || initialized) return;
    device.resetOwnedCache?.();
    initialized = true;
  }

  function expireExports(): void {
    const now = clock.now();
    for (const transfer of exports.values()) {
      if (transfer.expiresAt <= now) transfer.release();
    }
  }

  function stageExport(request: Pick<DocumentDraftRequest, "session" | "signal">) {
    const session = request.session.signal;
    const caller = request.signal;
    let file: TemporaryFile | undefined;
    let stopTimer: (() => void) | undefined;
    const release = () => {
      session.removeEventListener("abort", release);
      caller?.removeEventListener("abort", release);
      stopTimer?.();
      if (file) exports.delete(file);
      removeTemporary(file);
      file = undefined;
    };
    session.addEventListener("abort", release, { once: true });
    caller?.addEventListener("abort", release, { once: true });
    return {
      hold(name: string) {
        file = device.createTemporary(name);
        return file;
      },
      retain() {
        if (!device.androidExports || !file || session.aborted || caller?.aborted) return;
        const expiresAt = clock.now() + ANDROID_FILE_EXPORT_LEASE_MS;
        exports.set(file, { expiresAt, release });
        stopTimer = clock.schedule(release, ANDROID_FILE_EXPORT_LEASE_MS);
      },
      finish() {
        if (!stopTimer) release();
      },
    };
  }

  function belongsToDocumentDraft(document: DraftDocument, request: DocumentDraftRequest): boolean {
    return heldDocuments.get(document) === request.session.signal && sameDraft(document, request)
      && !rejectCurrent(request, request.isDraftCurrent);
  }

  async function pickDocument(request: DocumentDraftRequest): Promise<DocumentResult> {
    const result = await pickDocuments(request, { count: 1, bytes: request.policy.maxBytes });
    return result.status === "ready" ? { status: "ready", document: result.documents[0] } : result;
  }

  async function pickDocuments(request: DocumentDraftRequest, limits: { count: number; bytes: number }): Promise<DocumentsResult> {
    if (!device.available) return { status: "unavailable" };
    if (picking) return { status: "busy" };
    if (!validPolicy(request.policy) || !Number.isSafeInteger(limits.count) || limits.count < 1 ||
      !Number.isSafeInteger(limits.bytes) || limits.bytes < 1) return { status: "error", issue: "policy" };
    const sessionSignal = request.session.signal;
    const callerSignal = request.signal;
    const binding = { scope: Object.freeze({ ...request.session.scope }), target: Object.freeze({ ...request.target }) };
    const current = () => sameDraft(binding, request) && request.session.signal === sessionSignal
      ? rejectCurrent({ session: request.session, signal: callerSignal }, request.isDraftCurrent)
      : { status: "stale" } as const;
    const assertCurrent = () => { if (current()) throw new FileIssue("read"); };
    const before = current();
    if (before) return before;
    if (!binding.target.draftId.trim() || !binding.target.route.startsWith("/") || binding.target.route.startsWith("//")
      || (binding.target.locale !== "id" && binding.target.locale !== "en")) return { status: "error", issue: "invalid-target" };
    const { maxBytes } = request.policy;
    const permitted = [...request.policy.mimeTypes];
    picking = true;
    let assets: PickerDocument[] | null = null;
    let file: TemporaryFile | undefined;
    let errorStage: Issue = "picker";
    let ready = false;
    let remaining = limits.bytes;
    const documents: DraftDocument[] = [];
    try {
      initialize();
      const chooserTypes = permitted.includes("application/zip") ? [...permitted, "application/x-zip-compressed", "application/x-zip"] : permitted;
      assets = await device.pick(chooserTypes, limits.count > 1);
      assertCurrent();
      if (!assets) return { status: "cancelled" };
      if (!assets.length || (limits.count === 1 && assets.length !== 1)) return { status: "error", issue: "picker" };
      if (assets.length > limits.count) return { status: "error", issue: "size" };
      for (const asset of assets) {
        errorStage = "read";
        const observed = device.inspect(asset);
        const mime = (value?: string) => {
          const normalized = normalizeMimeType(value);
          return permitted.includes("application/zip") && ["application/x-zip-compressed", "application/x-zip"].includes(normalized)
            ? "application/zip" : normalized;
        };
        const reported = mime(asset.mimeType);
        const observedMime = mime(observed.mimeType);
        let mimeType = reported && reported !== "application/octet-stream" ? reported : observedMime;
        if ((!mimeType || mimeType === "application/octet-stream") && permitted.includes("application/zip") && /\.zip$/i.test(asset.name)) {
          mimeType = "application/zip";
        }
        const jsonFromFiles = permitted.includes("application/json") && /\.json$/i.test(asset.name) &&
          [reported, observedMime].every(type => !type || ["application/json", "application/octet-stream", "text/plain"].includes(type));
        if (jsonFromFiles) mimeType = "application/json";
        if (!permitted.includes(mimeType) || (!jsonFromFiles && observedMime && observedMime !== "application/octet-stream" && observedMime !== mimeType)) {
          return { status: "error", issue: "type" };
        }
        const limit = Math.min(maxBytes, remaining);
        if (limit <= 0) return { status: "error", issue: "size" };
        const issue = sizeIssue(asset.size, limit) ?? sizeIssue(observed.size, limit);
        if (issue) return { status: "error", issue };
        const name = fileName(asset.name, mimeType);
        file = device.createTemporary(name);
        const size = await copyBytes(device.open(asset), file, mimeType, limit, observed.size ?? asset.size, assertCurrent,
          [sessionSignal, callerSignal]);
        assertCurrent();

        const held = file;
        const release = () => {
          if (!heldDocuments.delete(document)) return;
          sessionSignal.removeEventListener("abort", release);
          callerSignal?.removeEventListener("abort", release);
          removeTemporary(held);
        };
        const document: DraftDocument = Object.freeze({ ...binding, name, mimeType, size, uri: held.uri, release });
        heldDocuments.set(document, sessionSignal);
        sessionSignal.addEventListener("abort", release, { once: true });
        callerSignal?.addEventListener("abort", release, { once: true });
        documents.push(document);
        remaining -= size;
        file = undefined;
      }
      ready = true;
      return { status: "ready", documents };
    } catch (error) {
      return current() ?? resultFrom(error, errorStage);
    } finally {
      for (const asset of assets ?? []) device.discard(asset);
      if (!ready) for (const document of documents) document.release();
      removeTemporary(file);
      picking = false;
    }
  }

  async function shareDocument(document: DraftDocument, request: DocumentDraftRequest, title?: string): Promise<ShareFileResult> {
    if (!device.available) return { status: "unavailable" };
    if (sharing) return { status: "busy" };
    if (!belongsToDocumentDraft(document, request)) return rejectCurrent(request, request.isDraftCurrent) ?? { status: "stale" };
    if (!validPolicy(request.policy)) return { status: "error", issue: "policy" };
    if (!request.policy.mimeTypes.includes(document.mimeType)) return { status: "error", issue: "type" };
    if (document.size > request.policy.maxBytes) return { status: "error", issue: "size" };
    sharing = true;
    const staged = stageExport(request);
    const current = () => rejectCurrent(request, request.isDraftCurrent)
      ?? (belongsToDocumentDraft(document, request) ? null : { status: "stale" } as const);
    try {
      initialize();
      expireExports();
      if (!await device.canShare()) return { status: "unavailable" };
      const before = current();
      if (before) return before;
      let uri = document.uri;
      if (device.androidExports) {
        // A recipient can keep the granted URI after the chooser returns.
        // Give it a short-lived copy independent of the editable draft.
        const file = staged.hold(document.name);
        await copyBytes(device.open(document), file, document.mimeType, document.size, document.size, () => {
          if (current()) throw new FileIssue("read");
        }, [request.session.signal, request.signal]);
        const afterCopy = current();
        if (afterCopy) return afterCopy;
        uri = file.uri;
      }
      await device.share(uri, document.mimeType, title?.trim() || document.name);
      const afterShare = current();
      if (afterShare) return afterShare;
      staged.retain();
      return { status: "finished" };
    } catch (error) {
      return current() ?? resultFrom(error, "share");
    } finally {
      staged.finish();
      sharing = false;
    }
  }

  async function shareGeneratedJson(request: Pick<DocumentDraftRequest, "session" | "signal" | "isDraftCurrent"> & {
    name: string; title: string; text: string; maxBytes: number;
  }): Promise<ShareFileResult> {
    if (!device.available) return { status: "unavailable" };
    if (sharing) return { status: "busy" };
    if (!Number.isSafeInteger(request.maxBytes) || request.maxBytes <= 0) return { status: "error", issue: "policy" };
    const current = () => rejectCurrent(request, request.isDraftCurrent);
    const before = current();
    if (before) return before;
    if (sizeIssue(request.text.length, request.maxBytes)) return { status: "error", issue: "size" };
    const bytes = new TextEncoder().encode(request.text);
    const limitIssue = sizeIssue(bytes.byteLength, request.maxBytes);
    if (limitIssue) return { status: "error", issue: limitIssue };

    const mimeType = "application/json";
    const staged = stageExport(request);
    sharing = true;
    try {
      initialize();
      expireExports();
      if (!await device.canShare()) return { status: "unavailable" };
      const beforeWrite = current();
      if (beforeWrite) return beforeWrite;
      const file = staged.hold(fileName(request.name, mimeType));
      await file.write(bytes);
      file.close();
      const afterWrite = current();
      if (afterWrite) return afterWrite;
      await device.share(file.uri, mimeType, request.title);
      const afterShare = current();
      if (afterShare) return afterShare;
      staged.retain();
      return { status: "finished" };
    } catch (error) {
      return current() ?? resultFrom(error, "share");
    } finally {
      staged.finish();
      sharing = false;
    }
  }

  async function shareAuthorizedDownload(request: NativeDownloadRequest): Promise<ShareFileResult> {
    if (!device.available) return { status: "unavailable" };
    if (sharing) return { status: "busy" };
    if (!validPolicy(request.policy)) return { status: "error", issue: "policy" };
    const path = downloadPath(request.target);
    if (!path) return { status: "error", issue: "invalid-target" };
    const current = () => rejectCurrent(request, request.isTargetCurrent);
    const before = current();
    if (before) return before;
    const diskImages = request.target.kind === "discussion-image";
    const materialPdf = request.target.kind === "course-material-pdf";
    const studentQuiz = request.target.kind === "quiz-review-attachment";
    const quiz = studentQuiz || request.target.kind === "quiz-grade-attachment";
    const tryout = request.target.kind === "tryout-grade-attachment";
    const form = request.target.kind === "form-response-attachment";
    const media = request.target.kind === "admin-media";
    const schedule = request.target.kind === "schedule-resource" ? request.target : null;
    // The existing discussion API authorizes only these three image types and caps each at 8 MiB.
    const imageTypes = ["image/jpeg", "image/png", "image/webp"];
    const domainTypes: readonly string[] = schedule ? scheduleFilePolicy.mimeTypes : form ? FORM_FILE_MIMES : media ? adminMediaDownloadPolicy.mimeTypes :
      tryout ? tryoutGradeAttachmentPolicy.mimeTypes :
      quiz ? [...imageTypes, "application/pdf"] : diskImages ? imageTypes : ["application/pdf"];
    const permitted = request.policy.mimeTypes.filter(mimeType => domainTypes.includes(mimeType));
    if (!permitted.length) return { status: "error", issue: "policy" };
    const maxBytes = quiz ? Math.min(request.policy.maxBytes, 4 * 1024 * 1024)
      : tryout ? Math.min(request.policy.maxBytes, tryoutGradeAttachmentPolicy.maxBytes)
      : diskImages ? Math.min(request.policy.maxBytes, 8 * 1024 * 1024)
      : form ? Math.min(request.policy.maxBytes, PUBLIC_FORM_MAX_FILE_SIZE_MB * 1024 * 1024)
      : schedule ? Math.min(request.policy.maxBytes, scheduleFilePolicy.maxBytes)
      : materialPdf ? Math.min(request.policy.maxBytes, MATERIAL_PDF_MAX_BYTES) : media ? Math.min(request.policy.maxBytes, adminMediaDownloadPolicy.maxBytes) : request.policy.maxBytes;
    const assertCurrent = () => { if (current()) throw new FileIssue("fetch"); };
    sharing = true;
    let response: Awaited<ReturnType<NativeSessionTransport["request"]>> | undefined;
    let errorStage: Issue = "share";
    const staged = stageExport(request);
    try {
      initialize();
      expireExports();
      if (!await device.canShare()) return { status: "unavailable" };
      assertCurrent();
      errorStage = "fetch";
      response = await request.session.request(path, { signal: request.signal, requiredRole: schedule?.role ?? (form || media ? "admin" : studentQuiz || materialPdf ? "murid" : (quiz || tryout) ? "tutor" : undefined),
        headers: {
          Accept: permitted.join(", "),
          ...(materialPdf || studentQuiz ? { "x-student-id": request.session.scope.accountId } : {}),
          ...(tryout ? { [TRYOUT_GRADE_ATTACHMENT_ACCOUNT]: request.session.scope.accountId, [TRYOUT_GRADE_ATTACHMENT_SESSION]: request.session.scope.sessionId } : {}),
          ...(form ? { "x-native-operations-user-id": request.session.scope.accountId, "x-native-operations-session-id": request.session.scope.sessionId } : {}),
          ...(schedule ? { [SCHEDULE_ACCOUNT]: request.session.scope.accountId, [SCHEDULE_SESSION]: request.session.scope.sessionId } : {}),
        } });
      if (response.status === 401 || response.status === 403 || ((schedule || materialPdf) && response.status === 409)) return { status: "error", issue: "unauthorized" };
      if (response.status === 404) return { status: "error", issue: "not-found" };
      if (materialPdf && response.status === 413) return { status: "error", issue: "size" };
      if (materialPdf && !/^attachment(?:;|$)/i.test(response.headers.get("Content-Disposition") ?? "")) {
        return { status: "error", issue: "unauthorized" };
      }
      if (response.status !== 200 || !response.body) return { status: "error", issue: "fetch" };
      const mimeType = normalizeMimeType(response.headers.get("Content-Type"));
      if (!permitted.includes(mimeType)) return { status: "error", issue: "type" };
      const rawSize = response.headers.get("Content-Length");
      const encoding = response.headers.get("Content-Encoding");
      if (rawSize !== null && !/^\d+$/.test(rawSize)) return { status: "error", issue: "incomplete" };
      const declaredSize = rawSize !== null && (!encoding || encoding === "identity") ? Number(rawSize) : undefined;
      const issue = sizeIssue(declaredSize, maxBytes);
      if (issue) return { status: "error", issue };
      const name = fileName(request.fileName ?? dispositionName(response.headers.get("Content-Disposition")), mimeType);
      const file = staged.hold(name);
      await copyBytes(response.body, file, mimeType, maxBytes, declaredSize, assertCurrent,
        [request.session.signal, request.signal]);
      assertCurrent();
      errorStage = "share";
      await device.share(file.uri, media && (mimeType === "text/html" || mimeType === "image/svg+xml") ? "application/octet-stream" : mimeType,
        request.title?.trim() || name);
      const afterShare = current();
      if (afterShare) return afterShare;
      staged.retain();
      return { status: "finished" };
    } catch (error) {
      return current() ?? resultFrom(error, errorStage);
    } finally {
      response?.dispose();
      staged.finish();
      sharing = false;
    }
  }

  async function prepareFormQuestionImage(session: NativeSessionTransport, url: string, signal: AbortSignal, isCurrent?: () => boolean) {
    const path = formQuestionImageProxyPath(url, session.scope.origin);
    return prepareScopedAsset(session, path, "form-question-image", PUBLIC_FORM_MAX_FILE_SIZE_MB * 1024 * 1024, signal, isCurrent);
  }

  async function prepareAdminMarkdownImage(session: NativeSessionTransport, url: string, audience: MarkdownPreviewAudience, signal: AbortSignal, isCurrent: () => boolean) {
    const path = previewStoragePath(url, session.scope.origin, audience);
    return prepareScopedAsset(session, path, "document-image", blogUploadMaxBytes, signal, isCurrent);
  }

  async function prepareAdminMedia(session: NativeSessionTransport, key: string, signal: AbortSignal, isCurrent: () => boolean) {
    const path = adminMediaFilePath(key);
    const policy = adminMediaPreviewPolicy(key);
    return prepareScopedAsset(session, path, key.split("/").at(-1) ?? "media", policy.maxBytes, signal, isCurrent, policy.mimeTypes);
  }

  async function prepareAssessmentImage(session: NativeSessionTransport, url: string, signal: AbortSignal, isCurrent: () => boolean) {
    const path = previewStoragePath(url, session.scope.origin, "course");
    return prepareScopedAsset(session, path, "question-image", 8 * 1024 * 1024, signal, isCurrent,
      ["image/jpeg", "image/png", "image/gif", "image/webp"], "murid");
  }

  async function prepareScopedAsset(session: NativeSessionTransport, path: string | null, name: string, limit: number, signal: AbortSignal, isCurrent?: () => boolean,
    mimeTypes: readonly string[] = FORM_IMAGE_MIMES, role: "admin" | "murid" = "admin") {
    if (!device.available || !path || !mimeTypes.length) throw new FileIssue("invalid-target");
    const current = () => {
      session.assertCurrent();
      if (signal.aborted || isCurrent?.() === false) throw new FileIssue("fetch");
    };
    current();
    initialize();
    const response = await session.request(path, { signal, requiredRole: role, headers: { Accept: mimeTypes.join(", ") } });
    try {
      return await prepareAssetResponse({ session, signal, current, response, name, limit, mimeTypes });
    } finally {
      response.dispose();
    }
  }

  async function preparePublicAssessmentImage(session: NativeSessionTransport, url: string, signal: AbortSignal, isCurrent: () => boolean,
    fetcher: PublicAssessmentRasterFetch) {
    if (!device.available) throw new FileIssue("invalid-target");
    const controller = new AbortController();
    const abort = () => controller.abort();
    session.signal.addEventListener("abort", abort, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 12_000);
    const current = () => {
      session.assertCurrent();
      if (!isCurrent() || signal.aborted || controller.signal.aborted) throw new FileIssue("fetch");
    };
    let response: Awaited<ReturnType<PublicAssessmentRasterFetch>> | undefined;
    let release: (() => void) | undefined;
    try {
      current();
      release = await publicAssessmentImages.acquire(controller.signal);
      current();
      initialize();
      response = await fetchPublicAssessmentRaster(url, session.scope.origin, fetcher, controller.signal);
      return await prepareAssetResponse({ session, signal, current, response, name: "question-image",
        limit: publicAssessmentRasterLimit, mimeTypes: assessmentRasterTypes, rasterSignal: controller.signal });
    } finally {
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
      release?.();
      clearTimeout(timeout);
      session.signal.removeEventListener("abort", abort);
      signal.removeEventListener("abort", abort);
    }
  }

  async function prepareAssetResponse({ session, signal, current, response, name, limit, mimeTypes, rasterSignal }: {
    session: NativeSessionTransport; signal: AbortSignal; current(): void;
    response: RasterAssetResponse;
    name: string; limit: number; mimeTypes: readonly string[]; rasterSignal?: AbortSignal;
  }) {
    const staged = stageExport({ session, signal });
    try {
      current();
      const mime = normalizeMimeType(response.headers.get("Content-Type"));
      if (response.status !== 200 || !response.body || !mimeTypes.includes(mime)) throw new FileIssue("type");
      const length = response.headers.get("Content-Length");
      const encoding = response.headers.get("Content-Encoding");
      if (length !== null && !/^\d+$/.test(length)) throw new FileIssue("incomplete");
      const size = length !== null && (!encoding || encoding === "identity") ? Number(length) : undefined;
      const issue = sizeIssue(size, limit);
      if (issue) throw new FileIssue(issue);
      const file = staged.hold(fileName(name, mime));
      await copyBytes(response.body, file, mime, limit, size, current, [session.signal, signal, rasterSignal], !!rasterSignal);
      current();
      return { uri: file.uri, release: staged.finish };
    } catch (error) {
      staged.finish();
      throw error;
    }
  }

  async function prepareCourseVideo(session: NativeSessionTransport, path: string, signal: AbortSignal) {
    const source = courseVideoSource(path, session.scope.origin);
    if (!device.available || source?.kind !== "storage" || source.path !== path) throw new FileIssue("invalid-target");
    const current = () => {
      session.assertCurrent();
      if (signal.aborted) throw new FileIssue("fetch");
    };
    current();
    initialize();
    const response = await session.request(path, { signal });
    const staged = stageExport({ session, signal });
    try {
      current();
      const mime = normalizeMimeType(response.headers.get("Content-Type"));
      const extension = videoExtensions.get(mime);
      if (response.status !== 200 || !response.body || !extension) throw new FileIssue("type");
      const size = response.headers.get("Content-Length");
      const limit = 100 * 1024 * 1024; // The course video upload limit.
      const encoding = response.headers.get("Content-Encoding");
      if (size !== null && !/^\d+$/.test(size)) throw new FileIssue("size");
      const declaredSize = size !== null && (!encoding || encoding === "identity") ? Number(size) : undefined;
      if (sizeIssue(declaredSize, limit)) throw new FileIssue("size");
      const file = staged.hold("course-video." + extension);
      await copyBytes(response.body, file, mime, limit, declaredSize, current, [session.signal, signal]);
      current();
      // On success the screen and session signals own the file until playback closes.
      return file.uri;
    } catch (error) {
      staged.finish();
      throw error;
    } finally {
      response.dispose();
    }
  }

  function pdfResponseIssue(response: Awaited<ReturnType<NativeSessionTransport["request"]>>): FileRejection | null {
    if (response.status === 401 || response.status === 403) return { status: "error", issue: "unauthorized" };
    if (response.status === 404) return { status: "error", issue: "not-found" };
    if (response.status === 409) return { status: "error", issue: "changed" };
    if (response.status === 413) return { status: "error", issue: "size" };
    if (response.status === 422) return { status: "error", issue: "type" };
    return response.status === 200 ? null : { status: "error", issue: "fetch" };
  }

  function pdfGrant(response: Awaited<ReturnType<NativeSessionTransport["request"]>>, sessionExpiresAt: number): PdfGrant | null {
    const revision = response.headers.get(MATERIAL_PDF_HEADERS.revision);
    const expiresAt = Math.min(Number(response.headers.get(MATERIAL_PDF_HEADERS.expiresAt)), sessionExpiresAt);
    return revision && /^[a-f0-9]{64}$/.test(revision) && Number.isSafeInteger(expiresAt) && expiresAt > clock.now()
      ? { revision, expiresAt } : null;
  }

  function materialPdfDownload(request: MaterialPdfRequest): {
    path: string | null; requiredRole: "admin" | "murid"; headers: Record<string, string>;
  } {
    if (request.audience === "admin") return {
      path: adminMaterialPdfPath(request.target, request.bundle), requiredRole: "admin",
      headers: { [ADMIN_PDF_ACCOUNT]: request.session.scope.accountId, [ADMIN_PDF_SESSION]: request.session.scope.sessionId },
    };
    return { path: materialPdfPath(request.target), requiredRole: "murid",
      headers: { "x-student-id": request.session.scope.accountId } };
  }

  async function prepareMaterialPdf(request: MaterialPdfRequest): Promise<MaterialPdfResult> {
    if (!device.available) return { status: "unavailable" };
    const { path, requiredRole, headers } = materialPdfDownload(request);
    if (!path) return { status: "error", issue: "invalid-target" };
    const current = () => rejectCurrent(request, request.isTargetCurrent);
    const before = current();
    if (before) return before;
    const staged = stageExport(request);
    let response: Awaited<ReturnType<NativeSessionTransport["request"]>> | undefined;
    let ready = false;
    try {
      initialize();
      response = await request.session.request(path, { signal: request.signal, requiredRole,
        headers: { ...headers, Accept: "application/pdf" } });
      const issue = pdfResponseIssue(response);
      if (issue) return issue;
      if (!response.body || normalizeMimeType(response.headers.get("Content-Type")) !== "application/pdf") return { status: "error", issue: "type" };
      const grant = pdfGrant(response, request.sessionExpiresAt);
      if (!grant) return { status: "error", issue: "unauthorized" };
      const rawSize = response.headers.get("Content-Length");
      if (rawSize !== null && !/^\d+$/.test(rawSize)) return { status: "error", issue: "incomplete" };
      const encoding = response.headers.get("Content-Encoding");
      const declared = rawSize !== null && (!encoding || encoding === "identity") ? Number(rawSize) : undefined;
      const invalidSize = sizeIssue(declared, MATERIAL_PDF_MAX_BYTES);
      if (invalidSize) return { status: "error", issue: invalidSize };
      const assertCurrent = () => { if (current() || clock.now() >= grant.expiresAt) throw new FileIssue("unauthorized"); };
      assertCurrent();
      const file = staged.hold("course-reading.pdf");
      await copyBytes(response.body, file, "application/pdf", MATERIAL_PDF_MAX_BYTES, declared, assertCurrent, [request.session.signal, request.signal]);
      file.close();
      assertCurrent();
      ready = true;
      return { status: "ready", document: { ...grant, uri: file.uri, release: staged.finish } };
    } catch (error) {
      return current() ?? resultFrom(error, "fetch");
    } finally {
      response?.dispose();
      if (!ready) staged.finish();
    }
  }

  async function renewMaterialPdf(request: MaterialPdfRequest, revision: string): Promise<MaterialPdfRenewal> {
    const { path, requiredRole, headers } = materialPdfDownload(request);
    if (!path || !/^[a-f0-9]{64}$/.test(revision)) return { status: "error", issue: "invalid-target" };
    const current = () => rejectCurrent(request, request.isTargetCurrent);
    const before = current();
    if (before) return before;
    let response: Awaited<ReturnType<NativeSessionTransport["request"]>> | undefined;
    try {
      response = await request.session.request(path, { method: "HEAD", signal: request.signal, requiredRole,
        headers: { ...headers, "If-Match": `"${revision}"` } });
      const issue = current() ?? pdfResponseIssue(response);
      if (issue) return issue;
      const grant = pdfGrant(response, request.sessionExpiresAt);
      return grant?.revision === revision ? { status: "ready", grant } : { status: "error", issue: "changed" };
    } catch (error) {
      return current() ?? resultFrom(error, "fetch");
    } finally {
      response?.dispose();
    }
  }

  return { initialize, expireExports, pickDocument, pickDocuments, belongsToDocumentDraft, shareDocument, shareGeneratedJson, shareAuthorizedDownload,
    prepareFormQuestionImage, prepareAdminMarkdownImage, prepareAssessmentImage, preparePublicAssessmentImage, prepareAdminMedia, prepareCourseVideo, prepareMaterialPdf, renewMaterialPdf };
}
