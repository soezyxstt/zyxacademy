import { formWriteSessionHeaders, type FormWriteIdentity } from "../../../../packages/forms/response-policy";
import { NativeTransportError, type NativeRequestInit, type NativeResponse } from "../../network/transport";
import { parsePublicForm, publicFormApiPath, submitFormBody, type FormDraft, type FormEntry, type PublicForm, type PublicFormLoad } from "./model";

type FormResponse = Pick<NativeResponse, "status" | "headers" | "body" | "dispose">;
export type FormRequest = (path: string, init: NativeRequestInit) => Promise<FormResponse>;
export type FormSubmission =
  | { status: "sent" }
  | { status: "login" | "verify-email" | "already-sent" | "missing" | "denied" | "invalid" | "uncertain" | "session-pending" | "session-retry" };
export type FormUpload =
  | { status: "uploaded"; storageUrl: string }
  | { status: "login" | "verify-email" | "type" | "size" | "missing" | "denied" | "retry" | "session-pending" | "session-retry" };
export type FormCredentialRejection = { status: "credential-rejected" };

function credentialRejection(identity: FormWriteIdentity | undefined): FormCredentialRejection | { status: "login" } {
  return { status: identity ? "credential-rejected" : "login" };
}

function object(input: unknown) {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

async function readJson(response: FormResponse, limit: number) {
  if (response.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/json") return null;
  const length = response.headers.get("content-length");
  if (length && Number(length) > limit) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let total = 0;
  let body = "";
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return object(JSON.parse(body + decoder.decode()));
      total += result.value.byteLength;
      if (total > limit) return null;
      body += decoder.decode(result.value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function withResponse<T>(
  request: FormRequest, path: string, init: NativeRequestInit, timeout: number,
  consume: (response: FormResponse) => Promise<T>,
) {
  const attempt = new AbortController();
  const abort = () => attempt.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  if (init.signal?.aborted) abort();
  const timer = setTimeout(abort, timeout);
  let response: FormResponse | undefined;
  try {
    response = await request(path, { ...init, signal: attempt.signal });
    return await consume(response);
  } finally {
    response?.dispose();
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}

export async function loadPublicForm(request: FormRequest, entry: FormEntry, identifier: string, signal: AbortSignal): Promise<PublicFormLoad> {
  try {
    return await withResponse<PublicFormLoad>(request, publicFormApiPath(identifier, entry), { method: "GET", signal }, 15_000, async response => {
      if (response.status === 404) return { status: "missing" };
      if (response.status !== 200) return { status: "error" };
      return parsePublicForm(await readJson(response, 12 * 1024 * 1024), entry);
    });
  } catch {
    return { status: "error" };
  }
}

const verifiedEmailError = "Verifikasi alamat email akun Zyx Anda sebelum mengisi formulir ini.";
const alreadySentError = "Anda sudah pernah mengisi formulir ini (Dibatasi 1 kali pengisian).";

export async function submitPublicForm(request: FormRequest, form: PublicForm, draft: FormDraft, signal: AbortSignal, identity?: FormWriteIdentity): Promise<FormSubmission | FormCredentialRejection> {
  try {
    return await withResponse<FormSubmission | FormCredentialRejection>(request, publicFormApiPath(form.id) + (identity ? "?target=id&respondent=session" : "?target=id"), {
      method: "POST", signal, headers: { "Content-Type": "application/json", ...(identity && formWriteSessionHeaders(identity)) },
      body: JSON.stringify(submitFormBody(form, draft)),
    }, 20_000, async response => {
      if (response.status === 401) return credentialRejection(identity);
      if (response.status === 404) return { status: "missing" };
      if (response.status === 400 || response.status === 413) return { status: "invalid" };
      if (response.status !== 200 && response.status !== 403) return { status: "uncertain" };
      const value = await readJson(response, 12 * 1024 * 1024);
      if (response.status === 403) {
        if (value?.error === verifiedEmailError) return { status: "verify-email" };
        if (value?.error === alreadySentError) return { status: "already-sent" };
        return { status: "denied" };
      }
      return value?.success === true ? { status: "sent" } : { status: "uncertain" };
    });
  } catch (error) {
    return error instanceof NativeTransportError && error.code === "credentials"
      ? credentialRejection(identity) : { status: "uncertain" };
  }
}

export async function uploadPublicForm(request: FormRequest, body: FormData, signal: AbortSignal, origin: string, identity?: FormWriteIdentity): Promise<FormUpload | FormCredentialRejection> {
  try {
    const path = identity ? "/api/forms/upload?target=id&respondent=session" : "/api/forms/upload?target=id";
    return await withResponse<FormUpload | FormCredentialRejection>(request, path, {
      method: "POST", body, signal, headers: identity && formWriteSessionHeaders(identity),
    }, 90_000, async response => {
      if (response.status === 401) return credentialRejection(identity);
      if (response.status === 403) {
        const data = await readJson(response, 4096);
        return { status: data?.error === verifiedEmailError ? "verify-email" : "denied" };
      }
      if (response.status === 404) return { status: "missing" };
      if (response.status === 415) return { status: "type" };
      if (response.status === 413) return { status: "size" };
      const data = await readJson(response, 8192);
      if (response.status === 400 && typeof data?.error === "string" && data.error.startsWith("Maksimal ")) return { status: "size" };
      if (response.status === 200 && data?.success === true && typeof data.url === "string") {
        const parsed = new URL(data.url, origin);
        if (parsed.origin === origin && !parsed.username && !parsed.password && parsed.pathname.startsWith("/api/storage/file/forms/")) {
          return { status: "uploaded", storageUrl: data.url };
        }
      }
      return { status: "retry" };
    });
  } catch (error) {
    return error instanceof NativeTransportError && error.code === "credentials"
      ? credentialRejection(identity) : { status: "retry" };
  }
}

/** Keep a response attempt attached to its route and respondent through transient screen remounts. */
export function createFormSubmissionGate() {
  const attempts = new Map<string, Promise<FormSubmission>>();
  return {
    send(key: string, submit: () => Promise<FormSubmission>) {
      const current = attempts.get(key);
      if (current) return current;
      const attempt = Promise.resolve().then(submit).catch((): FormSubmission => ({ status: "uncertain" })).then(result => {
        if (result.status !== "sent" && result.status !== "uncertain" && result.status !== "already-sent") attempts.delete(key);
        return result;
      });
      attempts.set(key, attempt);
      return attempt;
    },
    fillAgain(key: string) {
      const attempt = attempts.get(key);
      if (!attempt) return;
      void attempt.then(result => {
        if (result.status === "sent" && attempts.get(key) === attempt) attempts.delete(key);
      });
    },
  };
}
