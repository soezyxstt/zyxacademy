const encoder = new TextEncoder();

async function digestToken(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export async function isAuthorizedRequest(request: Request, expectedToken: string | undefined): Promise<boolean> {
  if (!expectedToken) {
    return false;
  }

  const candidateToken = extractBearerToken(request);
  if (!candidateToken) {
    return false;
  }

  const [expectedDigest, candidateDigest] = await Promise.all([
    digestToken(expectedToken),
    digestToken(candidateToken)
  ]);

  return constantTimeEqual(expectedDigest, candidateDigest);
}
