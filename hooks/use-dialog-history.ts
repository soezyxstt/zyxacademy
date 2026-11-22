"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

export const DIALOG_PARAM = "dialog";

type Entry = {
  requestClose: () => void;
  open: boolean;
  token?: string;
  parent?: Entry;
  base?: URL;
};

const openEntries = new Set<Entry>();
const traversalGuards = new Set<(event: PopStateEvent) => void>();
let current: Entry | undefined;
let traversing = false;
let closingUrl: URL | undefined;
let closingBase: URL | undefined;
let scheduled = false;
let nextToken = 0;
let popVersion = 0;
const session = Math.random().toString(36).slice(2);
const afterClose: (() => void)[] = [];

function withoutDialog(url: URL) {
  const clean = new URL(url);
  clean.searchParams.delete(DIALOG_PARAM);
  return clean;
}

export function isDialogHistoryTraversal(from: string, to: string) {
  const origin = new URL(from);
  const target = new URL(to);
  const originToken = origin.searchParams.get(DIALOG_PARAM);
  const targetToken = target.searchParams.get(DIALOG_PARAM);
  // Router history stamping can observe the base URL while a dialog entry
  // is being restored. Use the live entry to recognize its actual base.
  const entry = entryAt(origin) ?? current;
  if (entry && entry.base?.pathname === origin.pathname) {
    if (target.href === closingBase?.href || target.href === entry.base.href) return true;
    if (entry.parent && entryAt(target, entry.parent)) return true;
  }
  return originToken !== targetToken && withoutDialog(origin).href === withoutDialog(target).href;
}

function entryAt(url: URL, entry = current) {
  for (; entry; entry = entry.parent) {
    if (entry.base?.pathname === url.pathname && entry.token === url.searchParams.get(DIALOG_PARAM)) return entry;
  }
}

function syncHistory() {
  scheduled = false;
  if (traversing) return;
  let url = new URL(window.location.href);
  const target = entryAt(url);
  // A docked panel can remain mounted across navigation. Track it on the new page.
  for (let entry = current; entry && entry !== target; entry = entry.parent) {
    entry.token = undefined;
  }
  current = target;

  if (current && !current.open) {
    let depth = 0;
    let entry: Entry | undefined = current;
    while (entry && !entry.open) {
      depth++;
      closingBase = entry.base;
      entry = entry.parent;
    }
    closingUrl = closingBase && withoutDialog(url).href !== withoutDialog(closingBase).href ? withoutDialog(url) : undefined;
    traversing = true;
    window.history.go(-depth);
    return;
  }

  if (!current && url.searchParams.has(DIALOG_PARAM)) {
    url = withoutDialog(url);
    window.history.replaceState(null, "", url);
  }

  for (const entry of openEntries) {
    if (entry.token) continue;
    entry.parent = current;
    entry.base = url;
    entry.token = `${session}.${++nextToken}`;
    url = new URL(url);
    url.searchParams.set(DIALOG_PARAM, entry.token);
    // Let Next's history integration preserve its router state.
    window.history.pushState(null, "", url);
    current = entry;
  }

  for (const callback of afterClose.splice(0)) callback();
}

export function syncDialogHistory() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(syncHistory);
}

export function closeDialogsThen(close: () => void, callback: () => void) {
  flushSync(close);
  afterClose.push(callback);
  syncDialogHistory();
}

function onPopState(event: PopStateEvent) {
  // Give route guards the original entry before a modal callback can cause
  // React or the App Router to commit changes to history.state.
  for (const guard of traversalGuards) {
    guard(event);
    if (event.cancelBubble) return;
  }
  const url = new URL(window.location.href);
  if (!traversing && !current && !url.searchParams.has(DIALOG_PARAM)) return;
  const version = ++popVersion;
  traversing = true;
  const target = entryAt(url);
  if (closingUrl && url.href === closingBase?.href) {
    if (target?.token) closingUrl.searchParams.set(DIALOG_PARAM, target.token);
    window.history.replaceState(null, "", closingUrl);
  }
  closingBase = undefined;
  closingUrl = undefined;
  let depth = 0;
  for (let entry = current; entry && entry !== target; entry = entry.parent) {
    depth++;
    if (!entry.open) continue;
    flushSync(entry.requestClose);
    // Controlled dialogs can still decline dismissal while an action is in progress.
    if (entry.open && (target || entry.base && withoutDialog(url).href === withoutDialog(entry.base).href)) {
      window.history.go(depth);
      return;
    }
  }
  current = target;
  // The App Router also restores its state in popstate. Start any follow-up
  // navigation after all listeners have handled this traversal.
  window.setTimeout(() => {
    if (version !== popVersion) return;
    traversing = false;
    syncDialogHistory();
  }, 0);
}

export function listenToDialogHistory() {
  window.addEventListener("popstate", onPopState);
  syncDialogHistory();
  return () => window.removeEventListener("popstate", onPopState);
}

export function addHistoryTraversalGuard(guard: (event: PopStateEvent) => void) {
  traversalGuards.add(guard);
  return () => { traversalGuards.delete(guard); };
}

export function useDialogHistory(open: boolean, requestClose: () => void) {
  const close = useRef(requestClose);
  useLayoutEffect(() => { close.current = requestClose; }, [requestClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const entry: Entry = { open: true, requestClose: () => close.current() };
    openEntries.add(entry);
    syncDialogHistory();
    return () => {
      entry.open = false;
      openEntries.delete(entry);
      syncDialogHistory();
    };
  }, [open]);
}

export function useDialogOpenState({
  open,
  defaultOpen,
  onOpenChange,
  trackHistory = true,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trackHistory?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const isOpen = open ?? internalOpen;
  const changeOpen = (next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  useDialogHistory(trackHistory && isOpen, () => changeOpen(false));
  return { open: isOpen, onOpenChange: changeOpen };
}
