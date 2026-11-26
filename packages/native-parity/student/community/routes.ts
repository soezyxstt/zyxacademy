import { communityRoutes } from "./contracts";

export function studentCommunityAlias(pattern: string, path: string) {
  if (pattern === "/discussions") return path.replace(/^\/discussions\/?(?=[?#]|$)/, "/dashboard/discussions");
  if (pattern === "/leaderboard/academic") {
    const question = path.indexOf("?");
    const params = new URLSearchParams(question < 0 ? undefined : path.slice(question + 1).split("#")[0]);
    params.delete("tab");
    params.set("tab", "academic");
    return `/leaderboard?${params}`;
  }
  return null;
}

function fixturePath(pattern: string) {
  return pattern.replace("[id]", "matematika-1").replace("[publicId]", "nara-putri");
}

export const communityCases = communityRoutes.flatMap(pattern => ([
  { id: `student.community.${pattern.slice(1).replaceAll("/", ".")}.loaded`, component: pattern, path: fixturePath(pattern), fixture: "loaded", theme: "light" },
  { id: `student.community.${pattern.slice(1).replaceAll("/", ".")}.empty`, component: pattern, path: fixturePath(pattern), fixture: "empty", theme: "dark" },
  { id: `student.community.${pattern.slice(1).replaceAll("/", ".")}.unavailable`, component: pattern, path: fixturePath(pattern), fixture: "unavailable", theme: "light" },
] as const));
