/** HTTP and shape validation run before a response enters the query cache. */
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiResponseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiResponseError";
  }
}

type ResponseSchema<T> = { parse(input: unknown): T };

export async function requestJson<T>(
  path: string,
  schema: ResponseSchema<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
    headers,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new ApiResponseError("The server returned invalid JSON", { cause });
  }
  try {
    return schema.parse(body);
  } catch (cause) {
    throw new ApiResponseError("The server returned an invalid response", { cause });
  }
}

/** Reads may retry once after a transient failure; invalid data and 4xx do not. */
export function retryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof ApiError) return error.status >= 500 && error.status <= 599;
  return error instanceof TypeError;
}
