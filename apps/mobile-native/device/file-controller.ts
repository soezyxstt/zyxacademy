import type { NativeSessionScope, NativeSessionTransport } from "../network/transport";
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
  | { kind: "diktat-pdf"; courseId: string; diktatId: string }
  | { kind: "discussion-image"; attachmentId: string };

export type NativeDownloadRequest = {
  session: NativeSessionTransport;
  target: NativeDownloadTarget;
  policy: NativeFilePolicy;
  fileName?: string;
  title?: string;
  signal?: AbortSignal;
};

type Issue = "policy" | "invalid-target" | "type" | "size" | "incomplete" | "picker" | "read" | "fetch" | "share" | "unauthorized" | "not-found";
type FileRejection = { status: "error"; issue: Issue } | { status: "cancelled" | "stale" | "busy" | "unavailable" };
export type DocumentResult = { status: "ready"; document: DraftDocument } | FileRejection;
export type ShareFileResult = { status: "finished" } | FileRejection;

export type PickerDocument = { uri: string; name: string; mimeType?: string; size?: number };
type TemporaryFile = {
  uri: string;
  write(bytes: Uint8Array): Promise<void>;
  close(): void;
  remove(): void;
};

type NativeFileDevice = {
  available: boolean;
  pick(mimeTypes: readonly string[]): Promise<PickerDocument[] | null>;
  inspect(asset: PickerDocument): { mimeType?: string; size?: number };
  open(asset: PickerDocument): ReadableStream<Uint8Array>;
  discard(asset: PickerDocument): void;
  createTemporary(name: string): TemporaryFile;
  canShare(): Promise<boolean>;
  share(uri: string, mimeType: string, title: string): Promise<void>;
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
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
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
  const id = (value: string) => /^[A-Za-z0-9:_-][A-Za-z0-9._:-]{0,255}$/.test(value);
  if (target.kind === "diktat-pdf" && id(target.courseId) && id(target.diktatId)) {
    return `/api/courses/${encodeURIComponent(target.courseId)}/diktats/${encodeURIComponent(target.diktatId)}/pdf?download=1`;
  }
  if (target.kind === "discussion-image" && id(target.attachmentId)) {
    return `/api/discussions/attachments/${encodeURIComponent(target.attachmentId)}?download=1`;
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
): Promise<number> {
  const reader = stream.getReader();
  let size = 0;
  let eof = false;
  const prefix = new Uint8Array(1024);
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
    if (!matchesFileHeader(prefix.subarray(0, size), mimeType)) throw new FileIssue("type");
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
  if (mimeType === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
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

export function createNativeFileController(device: NativeFileDevice) {
  const heldDocuments = new WeakMap<DraftDocument, AbortSignal>();
  let picking = false;
  let sharing = false;

  function belongsToDocumentDraft(document: DraftDocument, request: DocumentDraftRequest): boolean {
    return heldDocuments.get(document) === request.session.signal && sameDraft(document, request)
      && !rejectCurrent(request, request.isDraftCurrent);
  }

  async function pickDocument(request: DocumentDraftRequest): Promise<DocumentResult> {
    if (!device.available) return { status: "unavailable" };
    if (picking) return { status: "busy" };
    if (!validPolicy(request.policy)) return { status: "error", issue: "policy" };
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
    try {
      assets = await device.pick(permitted);
      assertCurrent();
      if (!assets) return { status: "cancelled" };
      if (assets.length !== 1) return { status: "error", issue: "picker" };
      const asset = assets[0];
      errorStage = "read";
      const observed = device.inspect(asset);
      const reported = normalizeMimeType(asset.mimeType);
      const observedMime = normalizeMimeType(observed.mimeType);
      const mimeType = reported && reported !== "application/octet-stream" ? reported : observedMime;
      if (!permitted.includes(mimeType) || (observedMime && observedMime !== "application/octet-stream" && observedMime !== mimeType)) {
        return { status: "error", issue: "type" };
      }
      const issue = sizeIssue(asset.size, maxBytes) ?? sizeIssue(observed.size, maxBytes);
      if (issue) return { status: "error", issue };
      const name = fileName(asset.name, mimeType);
      file = device.createTemporary(name);
      const size = await copyBytes(device.open(asset), file, mimeType, maxBytes, observed.size ?? asset.size, assertCurrent,
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
      file = undefined;
      return { status: "ready", document };
    } catch (error) {
      return current() ?? resultFrom(error, errorStage);
    } finally {
      for (const asset of assets ?? []) device.discard(asset);
      removeTemporary(file);
      picking = false;
    }
  }

  async function shareDocument(document: DraftDocument, request: DocumentDraftRequest, title?: string): Promise<ShareFileResult> {
    if (!device.available) return { status: "unavailable" };
    if (sharing) return { status: "busy" };
    if (!belongsToDocumentDraft(document, request)) return rejectCurrent(request, request.isDraftCurrent) ?? { status: "stale" };
    sharing = true;
    try {
      if (!await device.canShare()) return { status: "unavailable" };
      if (!belongsToDocumentDraft(document, request)) return rejectCurrent(request, request.isDraftCurrent) ?? { status: "stale" };
      await device.share(document.uri, document.mimeType, title?.trim() || document.name);
      return rejectCurrent(request, request.isDraftCurrent) ?? { status: "finished" };
    } catch (error) {
      return rejectCurrent(request, request.isDraftCurrent) ?? resultFrom(error, "share");
    } finally {
      sharing = false;
    }
  }

  async function shareAuthorizedDownload(request: NativeDownloadRequest): Promise<ShareFileResult> {
    if (!device.available) return { status: "unavailable" };
    if (sharing) return { status: "busy" };
    if (!validPolicy(request.policy)) return { status: "error", issue: "policy" };
    const path = downloadPath(request.target);
    if (!path) return { status: "error", issue: "invalid-target" };
    const before = rejectCurrent(request);
    if (before) return before;
    const diskImages = request.target.kind === "discussion-image";
    // The existing discussion API authorizes only these three image types and caps each at 8 MiB.
    const domainTypes = diskImages ? ["image/jpeg", "image/png", "image/webp"] : ["application/pdf"];
    const permitted = request.policy.mimeTypes.filter(mimeType => domainTypes.includes(mimeType));
    if (!permitted.length) return { status: "error", issue: "policy" };
    const maxBytes = diskImages ? Math.min(request.policy.maxBytes, 8 * 1024 * 1024) : request.policy.maxBytes;
    const assertCurrent = () => { if (rejectCurrent(request)) throw new FileIssue("fetch"); };
    sharing = true;
    let file: TemporaryFile | undefined;
    let response: Awaited<ReturnType<NativeSessionTransport["request"]>> | undefined;
    let errorStage: Issue = "share";
    // Remove the temporary file at session exit even if the OS share sheet is still open.
    const purge = () => removeTemporary(file);
    request.session.signal.addEventListener("abort", purge, { once: true });
    request.signal?.addEventListener("abort", purge, { once: true });
    try {
      if (!await device.canShare()) return { status: "unavailable" };
      assertCurrent();
      errorStage = "fetch";
      response = await request.session.request(path, { signal: request.signal, headers: { Accept: permitted.join(", ") } });
      if (response.status === 401 || response.status === 403) return { status: "error", issue: "unauthorized" };
      if (response.status === 404) return { status: "error", issue: "not-found" };
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
      file = device.createTemporary(name);
      await copyBytes(response.body, file, mimeType, maxBytes, declaredSize, assertCurrent,
        [request.session.signal, request.signal]);
      assertCurrent();
      errorStage = "share";
      await device.share(file.uri, mimeType, request.title?.trim() || name);
      return rejectCurrent(request) ?? { status: "finished" };
    } catch (error) {
      return rejectCurrent(request) ?? resultFrom(error, errorStage);
    } finally {
      response?.dispose();
      request.session.signal.removeEventListener("abort", purge);
      request.signal?.removeEventListener("abort", purge);
      purge();
      sharing = false;
    }
  }

  return { pickDocument, belongsToDocumentDraft, shareDocument, shareAuthorizedDownload };
}
