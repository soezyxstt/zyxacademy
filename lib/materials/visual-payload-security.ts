const FORBIDDEN_SECURITY_PATTERNS = [
  /<script[\s>]/i,
  /<\/script>/i,
  /<svg[\s>]/i,
  /<\/svg>/i,
  /<html[\s>]/i,
  /<\/html>/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<path[\s>]/i,
  /<circle[\s>]/i,
  /<rect[\s>]/i,
  /javascript:/i,
  /vbscript:/i,
  /data:text\/html/i,
  /onload[\s=]/i,
  /onerror[\s=]/i,
  /onclick[\s=]/i,
  /onmouseover[\s=]/i,
  /eval\s*\(/i,
  /Function\s*\(/i,
  /setTimeout\s*\(/i,
  /setInterval\s*\(/i,
  /=>/,
];

export function inspectPayloadSecurity(value: unknown): { safe: boolean; reason?: string } {
  if (typeof value === "string") {
    for (const pattern of FORBIDDEN_SECURITY_PATTERNS) {
      if (pattern.test(value)) {
        return {
          safe: false,
          reason: `Forbidden executable or markup pattern detected: ${pattern.source}`,
        };
      }
    }
    return { safe: true };
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = inspectPayloadSecurity(item);
      if (!result.safe) return result;
    }
    return { safe: true };
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const keyResult = inspectPayloadSecurity(key);
      if (!keyResult.safe) return keyResult;
      const valResult = inspectPayloadSecurity(nested);
      if (!valResult.safe) return valResult;
    }
    return { safe: true };
  }

  return { safe: true };
}
