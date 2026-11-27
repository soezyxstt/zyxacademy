import { stripPublicLocalePrefix } from "../../../../lib/public-locale-routes";
import { evaluationRoutes } from "../../../../packages/native-parity/operations/evaluation-routes";
import { managementRoutes } from "../../../../packages/native-parity/operations/management-contract";
import { monitoringPaths } from "../../../../packages/native-parity/operations/monitoring-contract";
import { publicStaticRoutes } from "../../../../packages/native-parity/operations/public-contract";

export const operationsPatterns = {
  evaluation: evaluationRoutes.map(route => route.path),
  management: managementRoutes,
  monitoring: monitoringPaths,
  public: [...publicStaticRoutes, "/blog", "/blog/[slug]", "/demo", "/demo/[view]", "/unsubscribe"],
} as const;

export type OperationsArea = keyof typeof operationsPatterns;

function hasValidSegments(path: string): boolean {
  try {
    return path.split("/").every(part => {
      const decoded = decodeURIComponent(part);
      return decoded !== "." && decoded !== ".." && !/[/\\\x00-\x1f]/.test(decoded);
    });
  } catch {
    return false;
  }
}

export function resolveOperationsArea(href: string): OperationsArea | null {
  const path = href.split(/[?#]/, 1)[0].replace(/\/$/, "");
  if (!href.startsWith("/") || href.startsWith("//") || !hasValidSegments(path)) return null;
  const localized = stripPublicLocalePrefix(path);
  if (localized) return "public";
  const segments = path.split("/");
  for (const [area, patterns] of Object.entries(operationsPatterns)) {
    for (const pattern of patterns) {
      const parts = (pattern === "/" ? "" : pattern).split("/");
      if (parts.length === segments.length && parts.every((part, i) =>
        part.startsWith("[") ? Boolean(segments[i]) : part === segments[i]
      )) return area as OperationsArea;
    }
  }
  return null;
}
