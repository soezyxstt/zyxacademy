import { matchStudentRoute, studentPathWithQuery } from "./routes";

const queryPrefix = "query_";

export function studentFixturePath(params: Record<string, string | string[] | undefined>, scenario: string) {
  const path = typeof params.path === "string" && matchStudentRoute(params.path)
    ? params.path : scenario === "catalog-parity" ? "/courses" : "/dashboard";
  // Keep route selectors flat on the fixture link so Expo can read them after Android URI decoding.
  const query = Object.entries(params).flatMap(([name, value]) => name.startsWith(queryPrefix) && name.length > queryPrefix.length && typeof value === "string"
    ? [[name.slice(queryPrefix.length), value] as const] : []);
  return query.length ? studentPathWithQuery(path, Object.fromEntries(query)) : path;
}
