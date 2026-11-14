"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { emptyOverlay, overlayKey, scopedDemoReviewId, type DemoEvent, type DemoOverlay } from "@/lib/demo/session-overlay";
import { getBrowserDemoOverlayStore } from "@/lib/demo/session-store";
import { clearDemoTryoutCompletions } from "@/lib/demo/assessment/tryout";
import { todayUtc } from "@/lib/date-utils";
import { resetDemoCommunity } from "./use-demo-community";
import { toast } from "@/components/ui/toast";

type Session = { scope: { courseId: string; revision: string }; reviewScope?: {setId: string; offset: number}; overlay: DemoOverlay; overlays: Readonly<Record<string, DemoOverlay>>; record: (kind: DemoEvent["kind"], id: string, grade?: number) => void; reset: () => void; generation: number; ready: boolean };
const Context = createContext<Session | null>(null);
export function DemoSession({ courseId, revision, scopes, reviewScope, children }: { courseId: string; revision: string; scopes: readonly { courseId: string; revision: string }[]; reviewScope?: { setId: string; offset: number }; children: ReactNode }) {
  const key = overlayKey(courseId, revision);
  const [overlay, setOverlay] = useState(emptyOverlay);
  const [overlays, setOverlays] = useState<Record<string, DemoOverlay>>({});
  const scopeKey = JSON.stringify(scopes.map((scope) => [scope.courseId, scope.revision]));
  const storeRef = useRef<ReturnType<typeof getBrowserDemoOverlayStore> | null>(null);
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const store = getBrowserDemoOverlayStore();
    const activeScopes = (JSON.parse(scopeKey) as [string, string][]).map(([id, rev]) => ({ courseId: id, revision: rev }));
    const keys = new Set(activeScopes.map(scope => overlayKey(scope.courseId, scope.revision)));
    keys.add(key);
    const sync = () => {
      const loadedOverlays: Record<string, DemoOverlay> = {};
      for (const scope of activeScopes) loadedOverlays[scope.courseId] = store.read(scope);
      const loaded = store.read({ courseId, revision });
      setOverlays(loadedOverlays);
      setOverlay(loaded);
    };
    const unsubscribe = store.subscribe(change => {
      if (change.keys && !change.keys.some(changed => keys.has(changed))) return;
      sync();
      if (change.kind === "reset") setGeneration(n => n + 1);
    });
    storeRef.current = store;
    sync();
    setReady(true);
    return () => { storeRef.current = null; unsubscribe(); };
  }, [key, courseId, revision, scopeKey]);
  const record = (kind: DemoEvent["kind"], id: string, grade?: number) => {
    if (!ready || !storeRef.current) return;
    const eventId = kind === "review" && reviewScope ? scopedDemoReviewId(reviewScope.setId, reviewScope.offset, id) : id;
    storeRef.current.record({ courseId, revision }, { kind, id: eventId, date: todayUtc(), ...(grade === undefined ? {} : { grade }) });
  };
  const reset = () => {
    const subscribed = storeRef.current !== null;
    const store = storeRef.current ?? getBrowserDemoOverlayStore();
    const activeScopes = (JSON.parse(scopeKey) as [string, string][]).map(([id, rev]) => ({ courseId: id, revision: rev }));
    if (!activeScopes.some(scope => scope.courseId === courseId && scope.revision === revision)) activeScopes.push({ courseId, revision });
    for (const scope of activeScopes) {
      clearDemoTryoutCompletions(scope.courseId);
      void resetDemoCommunity(scope).catch(() => toast.error("Data jadwal belum dapat dihapus. Periksa penyimpanan browser, lalu coba lagi."));
    }
    try {
      const owned = ["zyx-demo-quiz-result:v2:", "zyx-demo-profile:", "zyx-demo-flashcards:", "zyx-quiz-answers-demo:", "zyx-quiz-flags-demo:", "zyx-quiz-timer-deadline-demo:"];
      const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((item): item is string => Boolean(item && owned.some(prefix => item.startsWith(prefix))));
      keys.forEach(item => localStorage.removeItem(item));
    } catch { /* Reset also works when browser storage is unavailable. */ }
    store.reset(activeScopes);
    if (!subscribed) {
      setOverlay(store.read({ courseId, revision }));
      setOverlays(Object.fromEntries(activeScopes.map(scope => [scope.courseId, store.read(scope)])));
      setGeneration(n => n + 1);
    }
  };
  return <Context.Provider value={{ scope: { courseId, revision }, reviewScope, overlay, overlays, record, reset, generation, ready }}>{children}</Context.Provider>;
}
export function useDemoSession() { const value = useContext(Context); if (!value) throw new Error("DemoSession missing"); return value; }

export function DemoReviewScope({ setId, offset, children }: { setId: string; offset: number; children: ReactNode }) {
  const session = useDemoSession();
  return <Context.Provider value={{ ...session, reviewScope: { setId, offset }, record: (kind, id, grade) => session.record(kind, kind === "review" ? scopedDemoReviewId(setId, offset, id) : id, grade) }}>{children}</Context.Provider>;
}
