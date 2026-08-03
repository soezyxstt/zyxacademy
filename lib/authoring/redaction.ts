const FORBIDDEN_FIELD = /(?:password|passwd|secret|token|authorization|credential|api[_-]?key|private[_-]?key|access[_-]?key|email|phone|ip[_-]?address|user[_-]?agent|enrollment|attempt|answer|mastery|chat|embedding|signature|presigned|signed[_-]?url)/i;
const FORBIDDEN_STRING = /(?:SECRET_CANARY|MURID_CANARY|HOLDOUT_CANARY|BEGIN\s+(?:RSA|OPENSSH)\s+PRIVATE KEY|X-Amz-(?:Signature|Credential)|(?:access[_-]?key|api[_-]?key|authorization|token)=)/i;

export type RedactionFinding = {
  code: "FORBIDDEN_FIELD" | "FORBIDDEN_VALUE" | "SIGNED_URL" | "INTERNAL_URL";
  path: string;
};

function pathFor(parent: string, key: string | number): string {
  return parent ? `${parent}.${String(key)}` : String(key);
}

function scanValue(value: unknown, path: string, findings: RedactionFinding[]): void {
  if (typeof value === "string") {
    if (FORBIDDEN_STRING.test(value)) findings.push({ code: "FORBIDDEN_VALUE", path });
    if (/https?:\/\/[^\s]+[?&](?:X-Amz-[^=]+|token|signature|secret|key)=/i.test(value)) findings.push({ code: "SIGNED_URL", path });
    if (/https?:\/\/(?:localhost|127\.0\.0\.1|[^/]+\/api\/)/i.test(value)) findings.push({ code: "INTERNAL_URL", path });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, pathFor(path, index), findings));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const childPath = pathFor(path, key);
    if (FORBIDDEN_FIELD.test(key)) findings.push({ code: "FORBIDDEN_FIELD", path: childPath });
    scanValue(nested, childPath, findings);
  }
}

export function scanAuthoringContext(value: unknown): RedactionFinding[] {
  const findings: RedactionFinding[] = [];
  scanValue(value, "", findings);
  return findings.sort((left, right) => `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`));
}

export function assertAuthoringContextSafe(value: unknown): void {
  const findings = scanAuthoringContext(value);
  if (findings.length > 0) throw new Error(`AUTHORING_CONTEXT_REDACTION_FAILED:${findings.map((finding) => `${finding.code}@${finding.path}`).join(",")}`);
}

export function isSafeRelativeCitation(value: string): boolean {
  return value.length > 0 && !value.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(value) && !/^https?:\/\//i.test(value) && !value.includes("?") && !value.includes("#");
}
