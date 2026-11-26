"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { isAccountTransitionPending, subscribeAccountTransition } from "@/lib/auth/account-transition-state";

const reusableTabs = new Set(["/dashboard", "/courses"]);

type TabLinkOptions = {
  prefetch?: boolean;
  onNavigate?: (event: { preventDefault(): void }) => false | void;
};

const StudentTabReuseContext = createContext<(href: string) => TabLinkOptions>(() => ({}));
const initialTransition = () => false;

export function StudentTabReuse({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const sessionId = session.data?.session?.id ?? null;
  const confirmed = !session.isPending && !session.error;
  const transitioning = useSyncExternalStore(subscribeAccountTransition, isAccountTransitionPending, initialTransition);
  const [documentSession, setDocumentSession] = useState<string | null>();
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (!confirmed || transitioning) return;
    if (documentSession === undefined) setDocumentSession(sessionId);
    else if (documentSession !== sessionId) return;
    if (sessionId && reusableTabs.has(pathname)) {
      setVisited(previous => previous.has(pathname) ? previous : new Set([...previous, pathname]));
    }
  }, [confirmed, documentSession, pathname, sessionId, transitioning]);

  const optionsFor = useCallback((href: string): TabLinkOptions => {
    if (!reusableTabs.has(href)) return {};
    const changed = documentSession !== undefined && documentSession !== sessionId;
    const visitedDestination = Boolean(confirmed && sessionId && href !== pathname && visited.has(href));
    return {
      // Next can reuse a recent full RSC payload for a visible return link.
      // First visits keep Next's default partial prefetch behavior.
      prefetch: transitioning || changed ? false : visitedDestination || undefined,
      onNavigate: event => {
        if (changed || isAccountTransitionPending()) {
          event.preventDefault();
          // The router cache belongs to the document. If the session changed
          // outside the usual account redirect, enter through the server again.
          if (changed && confirmed && !isAccountTransitionPending()) {
            window.location.assign(new URL(href, window.location.origin).href);
          }
          return false;
        }
      },
    };
  }, [confirmed, documentSession, pathname, sessionId, transitioning, visited]);

  return <StudentTabReuseContext.Provider value={optionsFor}>{children}</StudentTabReuseContext.Provider>;
}

export function useStudentTabLinkOptions() {
  return useContext(StudentTabReuseContext);
}
