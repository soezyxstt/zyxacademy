/** A decoder must check the response at runtime, not merely assert a TypeScript type. */
export type ResponseDecoder<T> = { parse: (value: unknown) => T };

export class ApiError extends Error {
  constructor(readonly status: number) {
    // Never expose internal response bodies, URLs, tokens, or server stack traces.
    super("Request failed");
    this.name = "ApiError";
  }
}
export class ResponseValidationError extends Error {
  constructor() {
    super("Invalid response");
    this.name = "ResponseValidationError";
  }
}

async function request(path: string, init: RequestInit): Promise<Response> {
  if (!path.startsWith("/api/") || path.includes("\\")) throw new Error("Expected a same-origin API path");
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init });
  if (!response.ok) throw new ApiError(response.status);
  return response;
}

export async function requestJson<T>(path: string, decoder: ResponseDecoder<T>, init: RequestInit = {}): Promise<T> {
  const response = await request(path, init);
  try {
    const value: unknown = await response.json();
    return decoder.parse(value);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ResponseValidationError();
  }
}

/** For write endpoints whose contract is only a successful HTTP status. */
export async function requestVoid(path: string, init: RequestInit): Promise<void> {
  await request(path, init);
}

export function jsonBody(value: unknown): { body: string; headers: Record<string, string> } {
  return { body: JSON.stringify(value), headers: { "Content-Type": "application/json" } };
}

export function requireAccount(userId: string | null): string {
  if (!userId) throw new ApiError(401);
  return userId;
}
