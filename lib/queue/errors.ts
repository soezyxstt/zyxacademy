/**
 * Internal queue execution error types for background jobs and compute helpers.
 * Replaces legacy Inngest SDK error classes with zero external dependencies.
 */

export interface QueueErrorOptions {
  cause?: unknown;
}

export class NonRetriableError extends Error {
  constructor(message: string, options?: QueueErrorOptions) {
    super(message, options);
    this.name = "NonRetriableError";
  }
}

function normalizeRetryAfter(value: number | string | Date): string {
  if (typeof value === "number") {
    const seconds = Number.isFinite(value) && value > 0 ? Math.ceil(value / 1000) : 1;
    return String(seconds);
  }
  if (value instanceof Date) {
    return value.toUTCString();
  }
  return String(value);
}

export class RetryAfterError extends Error {
  readonly retryAfter: string;

  constructor(message: string, retryAfter: number | string | Date, options?: QueueErrorOptions) {
    super(message, options);
    this.name = "RetryAfterError";
    this.retryAfter = normalizeRetryAfter(retryAfter);
  }
}
