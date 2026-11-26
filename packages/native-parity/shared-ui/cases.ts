import { layoutCases } from "./layout-cases";
import { navigationCases } from "./navigation-cases";
import { dataCases } from "./data-cases";
import { sharedUiControlCases } from "./control-cases";

export const sharedUiCases = [
  ...layoutCases.map(item => ({ ...item, family: "layout" as const })),
  ...navigationCases.map(item => ({ width: 380, height: 760, ...item, family: "navigation" as const })),
  ...dataCases.map(item => ({ ...item, family: "data" as const })),
  ...sharedUiControlCases.map(item => ({ width: 380, height: 760, ...item, family: "controls" as const })),
];

export type SharedUiCaseId = (typeof sharedUiCases)[number]["id"];
