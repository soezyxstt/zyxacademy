import { verificationBrowserFailureCode } from "./product-v4-browser-config";

export const PRODUCT_V4_QUEUE_EVENT = "product.verification.requested";
export const PRODUCT_V4_QUEUE_PATH = `/internal/tasks/${PRODUCT_V4_QUEUE_EVENT}`;
const hash = /^[a-f0-9]{64}$/;
const errorNames = new Set(["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "AbortError", "TimeoutError", "ZodError", "RetryAfterError", "NonRetriableError", "DatabaseError", "error"]);
const failureCodes = new Set([
  "QUEUE_JOB_BUSY", "QUEUE_JOB_UNKNOWN", "STORAGE_DOWNLOAD_UNSUPPORTED",
  "PRODUCT_BUNDLE_ADMISSION_REQUIRED", "PRODUCT_BUNDLE_CHECKSUM_MISMATCH", "PRODUCT_BUNDLE_NOT_FOUND", "PRODUCT_BUNDLE_STORAGE_DOWNLOAD_UNAVAILABLE",
  "PRODUCT_V4_BUILD_RUNTIME_INVALID", "PRODUCT_V4_CAPTURE_BATCH_INVALID", "PRODUCT_V4_COMPUTE_EXECUTOR_REQUIRED", "PRODUCT_V4_COURSE_MISMATCH",
  "PRODUCT_V4_DEPENDENCY_AMBIGUOUS", "PRODUCT_V4_DEPENDENCY_STALE", "PRODUCT_V4_EXCERPT_SCOPE_MISMATCH", "PRODUCT_V4_IMPORT_MISMATCH",
  "PRODUCT_V4_VERIFICATION_ARTIFACT_INVALID", "PRODUCT_V4_VERIFICATION_ATTEMPT_STALE", "PRODUCT_V4_VERIFICATION_CHECK_INVALID",
  "PRODUCT_V4_VERIFICATION_CONFLICT", "PRODUCT_V4_VERIFICATION_KEY_INVALID", "PRODUCT_V4_VERIFICATION_KEY_REQUIRED",
  "PRODUCT_V4_VERIFICATION_PLAN_INVALID", "PRODUCT_V4_VERIFICATION_RETRY_TIME_INVALID", "PRODUCT_V4_VERIFICATION_SCOPE_MISMATCH",
  "VERIFICATION_REQUIREMENT_INVALID", "INTERACTIVE_DOCUMENT_INTEGRITY", "INTERACTIVE_DOCUMENT_METADATA_CONFLICT", "INTERACTIVE_DOCUMENT_STORAGE_UNAVAILABLE", "INTERACTIVE_DOCUMENT_TOTAL_LIMIT",
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN", "ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND", "ERR_DLOPEN_FAILED", "ERR_INVALID_ARG_TYPE", "ERR_OUT_OF_RANGE",
  "08000", "08003", "08006", "23505", "25P02", "40001", "40P01", "53300", "55P03", "57014", "57P01",
]);

function describe(error: unknown) {
  const value = error && typeof error === "object" ? error as { name?: unknown; message?: unknown; code?: unknown; stack?: unknown } : {};
  const errorType = typeof value.name === "string" && errorNames.has(value.name) ? value.name : "UnknownError";
  const failureCode = verificationBrowserFailureCode(error)
    ?? (typeof value.message === "string" && failureCodes.has(value.message) ? value.message : undefined)
    ?? (typeof value.code === "string" && failureCodes.has(value.code) ? value.code : "UNCLASSIFIED");
  // The deployed worker is one index.mjs. Keep numeric locations, never stack text or paths.
  const workerFrames = typeof value.stack === "string"
    ? [...value.stack.slice(0, 32_768).matchAll(/[/\\]index\.mjs:(\d{1,7}):(\d{1,9})(?=[)\s]|$)/g)].slice(0, 3).map(match => ({ line: Number(match[1]), column: Number(match[2]) }))
    : [];
  return { errorType, failureCode, ...(workerFrames.length ? { workerFrames } : {}) };
}

/** Diagnostic output cannot change delivery, retry, authorization or verification outcomes. */
export function logProductV4QueueFailure(boundary: "queue" | "request", error: unknown, task?: string | null, retry?: string | number | null) {
  try {
    const retryCount = typeof retry === "number" ? retry : typeof retry === "string" && /^\d{1,9}$/.test(retry) ? Number(retry) : undefined;
    const cause = error instanceof Error ? error.cause : undefined;
    console.error(JSON.stringify({ event: "product_v4.queue_failure", boundary, job: "product-v4-verification",
      ...(typeof task === "string" && hash.test(task) ? { task } : {}),
      ...(Number.isSafeInteger(retryCount) && retryCount! >= 0 ? { retry: retryCount } : {}),
      ...describe(error), ...(cause === undefined ? {} : { cause: describe(cause) }),
    }));
  } catch { /* Logging must not replace the original error or response. */ }
}

export function logProductV4BrowserStart(planHash: string, checkId: string) {
  try {
    if (hash.test(planHash) && hash.test(checkId)) console.info(JSON.stringify({ event: "product_v4.browser_start", phase: "browser_execute", planHash, checkId }));
  } catch { /* Logging must not prevent the browser check. */ }
}
