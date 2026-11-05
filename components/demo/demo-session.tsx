"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { addDemoEvent, emptyOverlay, overlayKey, parseOverlay, scopedDemoReviewId, type DemoEvent, type DemoOverlay } from "@/lib/demo/session-overlay";
import { clearDemoTryoutCompletions } from "@/lib/demo/assessment/tryout";
import { todayUtc } from "@/lib/date-utils";

type Session = { overlay: DemoOverlay; overlays: Readonly<Record<string, DemoOverlay>>; record: (kind: DemoEvent["kind"], id: string, grade?: number) => void; reset: () => void; generation: number; ready: boolean };
const Context = createContext<Session | null>(null);
export function DemoSession({ courseId, revision, scopes, reviewScope, children }: { courseId: string; revision: string; scopes: readonly { courseId: string; revision: string }[]; reviewScope?: { setId: string; offset: number }; children: ReactNode }) {
  const key = overlayKey(courseId, revision);
  const [overlay, setOverlay] = useState(emptyOverlay);
  const [overlays, setOverlays] = useState<Record<string, DemoOverlay>>({});
  const scopeKey = JSON.stringify(scopes.map((scope) => [scope.courseId, scope.revision]));
  const current = useRef(overlay);
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const loadedOverlays: Record<string, DemoOverlay> = {};
    for (const [id, rev] of JSON.parse(scopeKey) as [string, string][]) {
      try { loadedOverlays[id] = parseOverlay(sessionStorage.getItem(overlayKey(id, rev))); } catch { loadedOverlays[id] = emptyOverlay(); }
    }
    const loaded = loadedOverlays[courseId] ?? emptyOverlay();
    setOverlays(loadedOverlays);
    current.current = loaded;
    setOverlay(loaded);
    setReady(true);
  }, [key, courseId, scopeKey]);
  const record = (kind: DemoEvent["kind"], id: string, grade?: number) => {
    if (!ready) return;
    const eventId = kind === "review" && reviewScope ? scopedDemoReviewId(reviewScope.setId, reviewScope.offset, id) : id;
    const next = addDemoEvent(current.current, { kind, id: eventId, date: todayUtc(), ...(grade === undefined ? {} : { grade }) });
    current.current = next;
    setOverlay(next);
    setOverlays((currentOverlays) => ({ ...currentOverlays, [courseId]: next }));
    try { sessionStorage.setItem(key, JSON.stringify(next)); } catch {}
  };
  const reset = () => {
    const next = emptyOverlay();
    current.current = next;
    setOverlay(next);
    const cleared: Record<string, DemoOverlay> = {};
    for (const [id, rev] of JSON.parse(scopeKey) as [string, string][]) {
      cleared[id] = emptyOverlay();
      try { sessionStorage.removeItem(overlayKey(id, rev)); } catch {}
      clearDemoTryoutCompletions(id);
    }
    setOverlays(cleared);
    setGeneration(n => n + 1);
    try {
      const owned = ["zyx-demo-quiz-result:v2:", "zyx-demo-profile:", "zyx-quiz-answers-demo:", "zyx-quiz-flags-demo:", "zyx-quiz-timer-deadline-demo:"];
      const keys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index)).filter((item): item is string => Boolean(item && owned.some(prefix => item.startsWith(prefix))));
      keys.forEach(item => sessionStorage.removeItem(item));
    } catch { /* Reset also works when browser storage is unavailable. */ }
  };
  return <Context.Provider value={{ overlay, overlays, record, reset, generation, ready }}>{children}</Context.Provider>;
}
export function useDemoSession() { const value = useContext(Context); if (!value) throw new Error("DemoSession missing"); return value; }
