export interface MuridRouteAdapter {
  newPath: string;
  legacyPath: string;
  owner: string;
  removalCondition: string;
}

export const MURID_ROUTE_ADAPTERS: readonly MuridRouteAdapter[] = [
  { newPath: "/api/murid/today", legacyPath: "/api/student/today", owner: "murid-read-model", removalCondition: "old route telemetry is zero for one complete release window" },
  { newPath: "/api/murid/mastery", legacyPath: "/api/student/mastery", owner: "murid-read-model", removalCondition: "old route telemetry is zero for one complete release window" },
  { newPath: "/murid", legacyPath: "/dashboard", owner: "murid-route-group", removalCondition: "old dashboard bookmarks are migrated and telemetry is zero" },
];

export function adapterForMuridPath(path: string): MuridRouteAdapter | null {
  return MURID_ROUTE_ADAPTERS.find((adapter) => adapter.newPath === path || adapter.legacyPath === path) ?? null;
}
