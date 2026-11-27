import { useMemo, useSyncExternalStore } from "react";
import { fixture } from "./config";

const EVENT = "onboarding-fixture:navigation";
const subscribe = (listener: () => void) => {
  window.addEventListener(EVENT, listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("popstate", listener);
  };
};
const snapshot = () => window.location.pathname + window.location.search;

function navigate(href: string, replace = false) {
  const next = new URL(href, window.location.origin);
  if (next.origin !== window.location.origin) throw new Error("Fixture navigation must stay local");
  const current = new URL(window.location.href);
  for (const key of ["role", "course", "locale", "theme"]) {
    if (!next.searchParams.has(key) && current.searchParams.has(key)) next.searchParams.set(key, current.searchParams.get(key)!);
  }
  window.history[replace ? "replaceState" : "pushState"]({}, "", next.pathname + next.search + next.hash);
  window.dispatchEvent(new Event(EVENT));
  window.scrollTo(0, 0);
}

const router = {
  push: (href: string) => navigate(href),
  replace: (href: string) => navigate(href, true),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  refresh: () => window.dispatchEvent(new Event(EVENT)),
  prefetch: async () => {},
};

export function usePathname() {
  const url = useSyncExternalStore(subscribe, snapshot, snapshot);
  const pathname = url.split("?")[0];
  return pathname === "/" ? (fixture.role === "tutor" ? "/tutor" : "/dashboard") : pathname;
}
export function useSearchParams() {
  const url = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(() => new URLSearchParams(url.split("?")[1] ?? ""), [url]);
}
export function useRouter() { return router; }
export function useParams() { return {}; }
export function redirect(href: string) { navigate(href, true); }
