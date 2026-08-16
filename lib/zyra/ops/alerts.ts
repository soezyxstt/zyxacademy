import type { ZyraOpsAlert, ZyraOpsMetrics } from "./contracts";

type AlertRule = {
  code: ZyraOpsAlert["code"];
  severity: ZyraOpsAlert["severity"];
  dedupKey: ZyraOpsAlert["dedupKey"];
  runbook: ZyraOpsAlert["runbook"];
  rollbackFlag?: ZyraOpsAlert["rollbackFlag"];
  signals: readonly string[];
};

const EVENT_ALERT_RULES: readonly AlertRule[] = [
  {
    code: "QUOTA_OVERSUBSCRIPTION",
    severity: "critical",
    dedupKey: "quota-oversubscription",
    runbook: "docs/operations/zyra-ops-runbooks.md#quota-oversubscription",
    rollbackFlag: "FEATURE_ZYRA_ALLOWANCE_V2",
    signals: ["QUOTA_OVERSUBSCRIPTION", "OVERSUBSCRIPTION", "OVERALLOCATION"],
  },
  {
    code: "RECONCILIATION_DRIFT",
    severity: "critical",
    dedupKey: "reconciliation-drift",
    runbook: "docs/operations/zyra-ops-runbooks.md#reconciliation-drift",
    rollbackFlag: "FEATURE_ZYRA_ALLOWANCE_V2",
    signals: ["RECONCILIATION_DRIFT", "MISSING_COMPATIBILITY_EVENT"],
  },
  {
    code: "PROVIDER_429_SPIKE",
    severity: "warning",
    dedupKey: "provider-429",
    runbook: "docs/operations/zyra-ops-runbooks.md#provider-429-or-timeout",
    rollbackFlag: "FEATURE_ZYRA_PROVIDER_ROUTER_V2",
    signals: ["PROVIDER_429", "HTTP_429", "RATE_LIMIT"],
  },
  {
    code: "PROVIDER_TIMEOUT_SPIKE",
    severity: "warning",
    dedupKey: "provider-timeout",
    runbook: "docs/operations/zyra-ops-runbooks.md#provider-429-or-timeout",
    rollbackFlag: "FEATURE_ZYRA_PROVIDER_ROUTER_V2",
    signals: ["PROVIDER_TIMEOUT", "HTTP_TIMEOUT"],
  },
  {
    code: "PREMIUM_RESERVE_BREACH",
    severity: "warning",
    dedupKey: "premium-reserve",
    runbook: "docs/operations/zyra-ops-runbooks.md#premium-reserve",
    rollbackFlag: "FEATURE_ZYRA_ALLOWANCE_V2",
    signals: ["PREMIUM_RESERVE_BREACH", "PREMIUM_RESERVE"],
  },
  {
    code: "CACHE_ISOLATION_REJECTION",
    severity: "critical",
    dedupKey: "cache-isolation",
    runbook: "docs/operations/zyra-ops-runbooks.md#cache-isolation",
    rollbackFlag: "FEATURE_ZYRA_SEMANTIC_CACHE_V1",
    signals: ["CACHE_ISOLATION", "SHARED_CACHE_REJECTION"],
  },
  {
    code: "SEMANTIC_CACHE_REGRESSION",
    severity: "warning",
    dedupKey: "semantic-cache-quality",
    runbook: "docs/operations/zyra-ops-runbooks.md#semantic-cache-quality",
    rollbackFlag: "FEATURE_ZYRA_SEMANTIC_CACHE_V1",
    signals: ["SEMANTIC_CACHE_REGRESSION", "SEMANTIC_FALSE_REUSE"],
  },
  {
    code: "ATTACHMENT_AUTHORIZATION_FAILURE",
    severity: "critical",
    dedupKey: "attachment-authorization",
    runbook: "docs/operations/zyra-ops-runbooks.md#attachment-authorization",
    rollbackFlag: "FEATURE_ZYRA_IMAGE_INPUT_V1",
    signals: ["ATTACHMENT_AUTHORIZATION", "UNAUTHORIZED_ATTACHMENT"],
  },
  {
    code: "IMAGE_SANITIZER_FAILURE_SPIKE",
    severity: "warning",
    dedupKey: "image-sanitizer",
    runbook: "docs/operations/zyra-ops-runbooks.md#image-sanitizer",
    rollbackFlag: "FEATURE_ZYRA_IMAGE_INPUT_V1",
    signals: ["SANITIZER_FAILURE", "SANITIZER_REJECTION"],
  },
  {
    code: "ASSESSMENT_LEAK",
    severity: "critical",
    dedupKey: "assessment-leak",
    runbook: "docs/operations/zyra-ops-runbooks.md#assessment-safety",
    signals: ["ASSESSMENT_LEAK", "DIRECT_ANSWER_LEAK"],
  },
  {
    code: "TELEMETRY_LOSS",
    severity: "warning",
    dedupKey: "telemetry-loss",
    runbook: "docs/operations/zyra-ops-runbooks.md#telemetry-loss",
    rollbackFlag: "FEATURE_ZYRA_AI_OPS_V1",
    signals: ["TELEMETRY_LOSS", "TELEMETRY_WRITE_FAILURE"],
  },
  {
    code: "PROPOSAL_SAFETY_REJECTION",
    severity: "warning",
    dedupKey: "proposal-safety",
    runbook: "docs/operations/zyra-ops-runbooks.md#proposal-safety",
    rollbackFlag: "FEATURE_ZYRA_ADMIN_COPILOT_V1",
    signals: ["PROPOSAL_SAFETY", "UNREGISTERED_MUTATION", "MUTATION_BOUNDARY"],
  },
];

function hasEventSignal(metrics: ZyraOpsMetrics, signals: readonly string[]): boolean {
  return metrics.events.some((event) => {
    if (event.count <= 0) return false;
    const value = `${event.eventType}:${event.resultCode}`.toUpperCase();
    return signals.some((signal) => value.includes(signal));
  });
}

export function evaluateZyraOpsAlerts(metrics: ZyraOpsMetrics): ZyraOpsAlert[] {
  const alerts: ZyraOpsAlert[] = [];
  const seen = new Set<string>();
  const add = (alert: ZyraOpsAlert) => {
    if (seen.has(alert.dedupKey)) return;
    seen.add(alert.dedupKey);
    alerts.push(alert);
  };

  if (metrics.ledger.activeReservations > 100) {
    add({
      code: "ACTIVE_RESERVATION_SPIKE",
      severity: "critical",
      dedupKey: "active-reservations",
      runbook: "docs/operations/zyra-ops-runbooks.md#active-reservation-spike",
      rollbackFlag: "FEATURE_ZYRA_ALLOWANCE_V2",
    });
  }
  if (metrics.image.failed > 10) {
    add({
      code: "IMAGE_SANITIZER_FAILURE_SPIKE",
      severity: "warning",
      dedupKey: "image-sanitizer",
      runbook: "docs/operations/zyra-ops-runbooks.md#image-sanitizer",
      rollbackFlag: "FEATURE_ZYRA_IMAGE_INPUT_V1",
    });
  }
  if (metrics.traces.validationViolations > 0) {
    add({
      code: "TEACHING_VALIDATION_VIOLATION",
      severity: "critical",
      dedupKey: "teaching-validation",
      runbook: "docs/operations/zyra-ops-runbooks.md#teaching-validation",
    });
  }
  if (metrics.projectSlots.every((slot) => slot.health === "degraded")) {
    add({
      code: "ALL_PROJECTS_DEGRADED",
      severity: "critical",
      dedupKey: "all-projects-degraded",
      runbook: "docs/operations/zyra-ops-runbooks.md#all-projects-degraded",
      rollbackFlag: "FEATURE_ZYRA_PROVIDER_ROUTER_V2",
    });
  }
  for (const rule of EVENT_ALERT_RULES) {
    if (hasEventSignal(metrics, rule.signals)) {
      add({
        code: rule.code,
        severity: rule.severity,
        dedupKey: rule.dedupKey,
        runbook: rule.runbook,
        rollbackFlag: rule.rollbackFlag,
      });
    }
  }
  return alerts;
}
