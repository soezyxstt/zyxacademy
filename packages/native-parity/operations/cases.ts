import { evaluationCases } from "./evaluation-fixtures";
import { managementCases } from "./management-fixtures";
import { monitoringCases } from "./monitoring-fixtures";
import { publicCases } from "./public-fixtures";

export type OperationsFixtureCase = {
  id: string;
  path: string;
  component: string;
  mode: "populated" | "empty" | "recoverable" | "denied";
  theme: "light" | "dark";
  locale: "id" | "en";
};

export const operationsCases: OperationsFixtureCase[] = [
  ...publicCases.map(c => ({
    id: c.id, path: c.href, component: c.component, mode: c.scenario, theme: c.theme, locale: c.locale,
  })),
  ...managementCases.map(c => ({
    id: c.id, path: c.path, component: c.route, mode: c.mode === "recoverable-error" ? "recoverable" as const : c.mode,
    theme: c.theme, locale: "id" as const,
  })),
  ...evaluationCases.map(c => ({
    id: c.id.startsWith("operations-") ? c.id : "operations-" + c.id, path: c.route, component: c.component,
    mode: c.mode === "recovery" ? "recoverable" as const : c.mode, theme: c.theme, locale: "id" as const,
  })),
  ...monitoringCases.map(c => ({
    id: c.id, path: c.path, component: c.name, mode: c.mode === "retry" ? "recoverable" as const : c.mode,
    theme: c.theme, locale: "id" as const,
  })),
];
