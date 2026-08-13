export const PLAN_ID = "001";
export const DEFAULT_DEPLOYMENT_VERSION = "plan-001";
export const SEMANTIC_CACHE_DIMENSIONS = 768;
export const SEMANTIC_CACHE_METRIC = "cosine" as const;
export const PRIVATE_ATTACHMENT_PREFIX = "zyx-attachments/";
export const PRIVATE_ATTACHMENT_RETENTION_DAYS = 7;

export const STAGING_RESOURCES = {
  worker: "zyx-zyra-control-staging",
  kv: "zyx-staging",
  privateBucket: "zyx-zyra-private-staging",
  semanticCache: "zyx-zyra-cache-staging",
  analyticsDataset: "zyx_zyra_events_staging"
} as const;

export type SemanticCacheContract = {
  dimensions: number;
  metric: string;
};

export function validateSemanticCacheContract(contract: SemanticCacheContract): string[] {
  const failures: string[] = [];

  if (contract.dimensions !== SEMANTIC_CACHE_DIMENSIONS) {
    failures.push(`dimensions must be ${SEMANTIC_CACHE_DIMENSIONS}`);
  }

  if (contract.metric.toLowerCase() !== SEMANTIC_CACHE_METRIC) {
    failures.push(`metric must be ${SEMANTIC_CACHE_METRIC}`);
  }

  return failures;
}

export function validatePrivateAttachmentPolicy(policy: {
  publicAccess: boolean;
  prefix: string;
  retentionDays: number;
}): string[] {
  const failures: string[] = [];

  if (policy.publicAccess) {
    failures.push("public access must be disabled");
  }

  if (policy.prefix !== PRIVATE_ATTACHMENT_PREFIX) {
    failures.push(`prefix must be ${PRIVATE_ATTACHMENT_PREFIX}`);
  }

  if (policy.retentionDays !== PRIVATE_ATTACHMENT_RETENTION_DAYS) {
    failures.push(`retentionDays must be ${PRIVATE_ATTACHMENT_RETENTION_DAYS}`);
  }

  return failures;
}

export type HealthPayload = {
  status: "ok";
  service: "zyra-control-plane";
  plan: typeof PLAN_ID;
  deploymentVersion: string;
  environment: string;
  auth: {
    controlPlaneTokenConfigured: boolean;
  };
  bindings: {
    stagingKv: boolean;
    privateAttachments: boolean;
    semanticCache: boolean;
    analytics: boolean;
    quotaCoordinator: boolean;
  };
  resources: {
    worker: typeof STAGING_RESOURCES.worker;
    kv: typeof STAGING_RESOURCES.kv;
    privateBucket: typeof STAGING_RESOURCES.privateBucket;
    semanticCache: typeof STAGING_RESOURCES.semanticCache;
    analyticsDataset: typeof STAGING_RESOURCES.analyticsDataset;
    semanticCacheDimensions: typeof SEMANTIC_CACHE_DIMENSIONS;
    semanticCacheMetric: typeof SEMANTIC_CACHE_METRIC;
    privateAttachmentPrefix: typeof PRIVATE_ATTACHMENT_PREFIX;
    privateAttachmentRetentionDays: typeof PRIVATE_ATTACHMENT_RETENTION_DAYS;
  };
};

export function buildHealthPayload(env: WorkerEnv): HealthPayload {
  return {
    status: "ok",
    service: "zyra-control-plane",
    plan: PLAN_ID,
    deploymentVersion: env.ZYRA_DEPLOYMENT_VERSION ?? DEFAULT_DEPLOYMENT_VERSION,
    environment: env.ZYX_ENVIRONMENT ?? "unknown",
    auth: {
      controlPlaneTokenConfigured: Boolean(env.ZYRA_CONTROL_PLANE_TOKEN)
    },
    bindings: {
      stagingKv: Boolean(env.ZYX_STAGING_KV),
      privateAttachments: Boolean(env.ZYRA_PRIVATE_ATTACHMENTS),
      semanticCache: Boolean(env.ZYRA_SEMANTIC_CACHE),
      analytics: Boolean(env.ZYRA_ANALYTICS),
      quotaCoordinator: Boolean(env.ZYRA_QUOTA_COORDINATOR)
    },
    resources: {
      worker: STAGING_RESOURCES.worker,
      kv: STAGING_RESOURCES.kv,
      privateBucket: STAGING_RESOURCES.privateBucket,
      semanticCache: STAGING_RESOURCES.semanticCache,
      analyticsDataset: STAGING_RESOURCES.analyticsDataset,
      semanticCacheDimensions: SEMANTIC_CACHE_DIMENSIONS,
      semanticCacheMetric: SEMANTIC_CACHE_METRIC,
      privateAttachmentPrefix: PRIVATE_ATTACHMENT_PREFIX,
      privateAttachmentRetentionDays: PRIVATE_ATTACHMENT_RETENTION_DAYS
    }
  };
}

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

export function safeError(code: string): { error: string } {
  return { error: code };
}
