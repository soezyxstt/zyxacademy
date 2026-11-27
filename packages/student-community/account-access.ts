/** Personal routes share the authenticated account across the product roles. */
export const personalAccountRoutes = [
  "/profile", "/profile/edit", "/settings", "/settings/notifications", "/settings/notifications/browser",
] as const;

export function isPersonalAccountRoute(pattern: string): boolean {
  return personalAccountRoutes.some(route => route === pattern);
}

const readOperations = new Set(["profile", "notifications"]);
const writeOperations = new Set(["profile", "locale", "notification-email", "notification-activity", "notification-timing"]);

export const personalCommunityPrefix = "/api/native/student/community/";
export const personalAccountSessionHeader = "x-native-account-session-id";

export function isPersonalCommunityOperation(method: string, operation: string): boolean {
  return (method === "GET" && readOperations.has(operation)) ||
    (method === "POST" && writeOperations.has(operation));
}

export function isPersonalAccountRequest(method: string, pathname: string): boolean {
  if (pathname === "/api/account/sessions") return method === "GET" || method === "DELETE";
  if (pathname === "/api/notifications/quiet-hours") return method === "GET" || method === "PUT";
  return pathname.startsWith(personalCommunityPrefix) &&
    isPersonalCommunityOperation(method, pathname.slice(personalCommunityPrefix.length));
}
