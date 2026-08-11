export type ProviderRetryClassification =
  | "none"
  | "timeout"
  | "rate_limited"
  | "transient"
  | "invalid_request"
  | "authentication"
  | "quarantined"
  | "malformed_response"
  | "unknown";

export type ProviderErrorCode =
  | "UNKNOWN_MODEL"
  | "MODEL_QUARANTINED"
  | "CAPABILITY_REJECTED"
  | "INVALID_INPUT"
  | "REQUEST_TIMEOUT"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TRANSIENT"
  | "PROVIDER_AUTHENTICATION"
  | "MALFORMED_RESPONSE"
  | "PROVIDER_ERROR";

export class ProviderAdapterError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryClassification: ProviderRetryClassification;
  readonly modelId?: string;
  readonly httpStatus?: number;

  constructor(input: {
    code: ProviderErrorCode;
    message: string;
    retryClassification: ProviderRetryClassification;
    modelId?: string;
    httpStatus?: number;
    cause?: unknown;
  }) {
    super(`${input.code}: ${input.message}`, { cause: input.cause });
    this.name = "ProviderAdapterError";
    this.code = input.code;
    this.retryClassification = input.retryClassification;
    this.modelId = input.modelId;
    this.httpStatus = input.httpStatus;
  }
}

function readStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode;
  return typeof status === "number" ? status : undefined;
}

function readMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function classifyProviderError(error: unknown, modelId?: string): ProviderAdapterError {
  if (error instanceof ProviderAdapterError) return error;

  const message = readMessage(error).toLowerCase();
  const httpStatus = readStatus(error);
  if (httpStatus === 401 || httpStatus === 403 || /authentication|api key|unauthorized|forbidden/.test(message)) {
    return new ProviderAdapterError({
      code: "PROVIDER_AUTHENTICATION",
      message: "Gemini provider authentication failed",
      retryClassification: "authentication",
      modelId,
      httpStatus,
      cause: error,
    });
  }

  if (httpStatus === 429 || /resource_exhausted|rate.?limit|quota/.test(message)) {
    return new ProviderAdapterError({
      code: "PROVIDER_RATE_LIMITED",
      message: "Gemini provider rate limit reached",
      retryClassification: "rate_limited",
      modelId,
      httpStatus,
      cause: error,
    });
  }

  if (httpStatus !== undefined && httpStatus >= 500 || /temporar|unavailable|overloaded|502|503|504/.test(message)) {
    return new ProviderAdapterError({
      code: "PROVIDER_TRANSIENT",
      message: "Gemini provider returned a transient failure",
      retryClassification: "transient",
      modelId,
      httpStatus,
      cause: error,
    });
  }

  if (/invalid argument|invalid request|bad request|400/.test(message) || httpStatus === 400) {
    return new ProviderAdapterError({
      code: "PROVIDER_ERROR",
      message: "Gemini provider rejected the request",
      retryClassification: "invalid_request",
      modelId,
      httpStatus,
      cause: error,
    });
  }

  return new ProviderAdapterError({
    code: "PROVIDER_ERROR",
    message: "Gemini provider request failed",
    retryClassification: "unknown",
    modelId,
    httpStatus,
    cause: error,
  });
}
