export type AuthoringQualitySeverity = "blocking" | "warning";

export type AuthoringQualityIssue = {
  code: string;
  message: string;
  severity: AuthoringQualitySeverity;
  entity?: string;
  path?: string;
  expected?: unknown;
  observed?: unknown;
};

export type AuthoringQualityReport<TMetrics extends Record<string, unknown> = Record<string, unknown>> = {
  version: "authoring-quality.v1";
  valid: boolean;
  issues: readonly AuthoringQualityIssue[];
  blockingIssueCount: number;
  warningCount: number;
  metrics: TMetrics;
};

export function qualityIssue(
  code: string,
  message: string,
  severity: AuthoringQualitySeverity = "blocking",
  extra: Omit<AuthoringQualityIssue, "code" | "message" | "severity"> = {},
): AuthoringQualityIssue {
  return { code, message, severity, ...extra };
}

export function finishQualityReport<TMetrics extends Record<string, unknown>>(
  issues: readonly AuthoringQualityIssue[],
  metrics: TMetrics,
): AuthoringQualityReport<TMetrics> {
  const blockingIssueCount = issues.filter((issue) => issue.severity === "blocking").length;
  return {
    version: "authoring-quality.v1",
    valid: blockingIssueCount === 0,
    issues,
    blockingIssueCount,
    warningCount: issues.length - blockingIssueCount,
    metrics,
  };
}
