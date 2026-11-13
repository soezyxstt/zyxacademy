"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type State = { dirty: boolean; pending: boolean };
type Destination = { kind: "link"; href: string } | { kind: "history"; delta: number; href: string };
const NavigationState = createContext<((id: string, state: State | null) => void) | null>(null);

/** Changing only the question in a mounted review keeps its drafts in place. */
export function isReviewItemNavigation(origin: string, destination: string): boolean {
  try {
    const from = new URL(origin), to = new URL(destination);
    if (from.origin !== to.origin || from.pathname !== to.pathname || from.hash !== to.hash || !(from.searchParams.has("item") || to.searchParams.has("item"))) return false;
    from.searchParams.delete("item"); to.searchParams.delete("item");
    from.searchParams.sort(); to.searchParams.sort();
    return from.searchParams.toString() === to.searchParams.toString();
  } catch { return false; }
}

/** Shares in-memory review state with the workspace without persisting private content. */
export function useMaterialReviewNavigation(dirty: boolean, pending: boolean) {
  const update = useContext(NavigationState);
  const id = useId();
  useEffect(() => { update?.(id, { dirty, pending }); }, [dirty, pending, update, id]);
  useEffect(() => () => update?.(id, null), [update, id]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);
}

export function MaterialReviewNavigation({ children }: { children: ReactNode }) {
  const t = useTranslations("adminAcademic");
  const router = useRouter();
  const commonT = useTranslations("admin.states");
  const [states, setStates] = useState<Record<string, State>>({});
  const state = { dirty: Object.values(states).some(item => item.dirty), pending: Object.values(states).some(item => item.pending) };
  const stateRef = useRef(state);
  stateRef.current = state;
  const [destination, setDestination] = useState<Destination | null>(null);
  const historyRef = useRef<{ marker: string; index: number | null; restoring: boolean; allow: boolean } | null>(null);
  const update = useCallback((id: string, next: State | null) => setStates(current => {
    if (!next) { if (!current[id]) return current; const copy = { ...current }; delete copy[id]; return copy; }
    return current[id]?.dirty === next.dirty && current[id]?.pending === next.pending ? current : { ...current, [id]: next };
  }), []);

  useEffect(() => {
    const navigation = (window as Window & { navigation?: { currentEntry?: { index: number } } }).navigation;
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    const token = () => `review-${window.crypto.randomUUID()}`;
    const guard = { marker: token(), index: navigation?.currentEntry?.index ?? null, chain: token(), position: 0, href: window.location.href, entryState: window.history.state, restoring: false, allow: false };
    historyRef.current = guard;
    let active = true;
    let requested: Destination | null = null;
    const positionOf = (data: any) => {
      const value = data?.__materialReviewPosition;
      return value && typeof value.chain === "string" && Number.isSafeInteger(value.index) ? value as { chain: string; index: number } : null;
    };
    // Caller null state must reach Next without an inherited __NA flag, so its
    // native-history patch still synchronizes URL hooks. Internal stamps retain
    // the current router state explicitly.
    const stamp = (data: any, marker = guard.marker, position = guard.position, chain = guard.chain) => ({ ...(data && typeof data === "object" ? data : {}), __materialReviewGuard: marker, __materialReviewPosition: { chain, index: position } });
    const remember = () => {
      guard.index = navigation?.currentEntry?.index ?? null;
      guard.href = window.location.href;
      guard.entryState = window.history.state;
    };
    originalReplace.call(window.history, stamp(window.history.state), "", guard.href);
    remember();
    const guardedReplace: History["replaceState"] = (data, unused, url) => {
      if (!active) return originalReplace.call(window.history, data, unused, url);
      const current = positionOf(window.history.state);
      originalReplace.call(window.history, guard.restoring
        ? { ...(data && typeof data === "object" ? data : {}), __materialReviewGuard: window.history.state?.__materialReviewGuard, __materialReviewPosition: current }
        : stamp(data), unused, url);
      if (!guard.restoring) remember();
    };
    const guardedPush: History["pushState"] = (data, unused, url) => {
      if (!active) return originalPush.call(window.history, data, unused, url);
      const marker = token();
      const position = guard.position + 1;
      originalPush.call(window.history, stamp(data, marker, position), unused, url);
      guard.marker = marker;
      guard.position = position;
      remember();
    };
    window.history.pushState = guardedPush;
    window.history.replaceState = guardedReplace;

    const adoptCurrent = (data: any) => {
      const next = positionOf(data);
      if (next?.chain === guard.chain) guard.position = next.index;
      else { guard.chain = token(); guard.position = 0; }
      guard.marker = token();
      originalReplace.call(window.history, stamp(data), "", window.location.href);
      remember();
    };
    const reanchor = (destination: Destination) => {
      // An untracked target has no safe inverse traversal. Push the exact origin
      // instead of probing into unknown documents. This drops forward entries,
      // keeps the draft mounted, and offers the intended URL after confirmation.
      guard.chain = token();
      guard.position = 0;
      guard.marker = token();
      guard.restoring = false;
      originalPush.call(window.history, stamp(guard.entryState), "", guard.href);
      remember();
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
      setDestination(destination);
    };
    const onPopState = (event: PopStateEvent) => {
      if (guard.allow) { guard.allow = false; adoptCurrent(event.state); return; }
      const target = positionOf(event.state);
      const isOrigin = target?.chain === guard.chain && target.index === guard.position && window.location.href === guard.href;
      if (guard.restoring) {
        event.stopImmediatePropagation();
        if (isOrigin) { guard.restoring = false; if (requested) setDestination(requested); }
        else if (requested) reanchor({ kind: "link", href: requested.href });
        return;
      }
      if (!stateRef.current.dirty && !stateRef.current.pending) { adoptCurrent(event.state); return; }
      if (isOrigin) return;
      if (!stateRef.current.pending && target?.chain === guard.chain && isReviewItemNavigation(guard.href, window.location.href)) { adoptCurrent(event.state); return; }
      event.stopImmediatePropagation();
      const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const targetIndex = navigation?.currentEntry?.index;
      const delta = guard.index != null && targetIndex != null ? targetIndex - guard.index
        : target?.chain === guard.chain ? target.index - guard.position : null;
      if (delta == null || delta === 0) { reanchor({ kind: "link", href }); return; }
      requested = { kind: "history", delta, href };
      guard.restoring = true;
      window.history.go(-delta);
    };
    const onClick = (event: MouseEvent) => {
      if ((!stateRef.current.dirty && !stateRef.current.pending) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.download || link.target && link.target !== "_self") return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.href === window.location.href) return;
      event.preventDefault(); event.stopImmediatePropagation();
      setDestination({ kind: "link", href: `${url.pathname}${url.search}${url.hash}` });
    };
    window.addEventListener("popstate", onPopState, true);
    document.addEventListener("click", onClick, true);
    return () => {
      active = false;
      if (window.history.pushState === guardedPush) window.history.pushState = originalPush;
      if (window.history.replaceState === guardedReplace) window.history.replaceState = originalReplace;
      window.removeEventListener("popstate", onPopState, true);
      document.removeEventListener("click", onClick, true);
      if (historyRef.current === guard) historyRef.current = null;
    };
  }, []);

  return <NavigationState.Provider value={update}>{children}<AdminConfirmDialog
    open={destination !== null && !state.pending} onOpenChange={open => { if (!open) setDestination(null); }}
    title={t("materials.leaveReviewTitle")} description={t("materials.leaveReviewDescription")}
    confirmLabel={t("materials.leaveReviewConfirm")}
    onConfirm={() => {
      if (stateRef.current.pending || !destination) return;
      const next = destination;
      setDestination(null);
      if (next.kind === "link") router.push(next.href);
      else if (next.delta !== 0) { if (historyRef.current) historyRef.current.allow = true; window.history.go(next.delta); }
    }}
  /><Dialog open={destination !== null && state.pending} onOpenChange={open => { if (!open) setDestination(null); }}>
    <DialogContent className="max-w-md rounded-xl border border-border p-6 text-left">
      <DialogHeader><DialogTitle>{t("materials.leaveReviewTitle")}</DialogTitle><DialogDescription>{t("materials.leaveReviewPending")}</DialogDescription></DialogHeader>
      <DialogFooter><Button type="button" variant="outline" onClick={() => setDestination(null)}>{commonT("cancel")}</Button></DialogFooter>
    </DialogContent>
  </Dialog></NavigationState.Provider>;
}
