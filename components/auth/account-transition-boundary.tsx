"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { isRemoteAccountTransitionPending, subscribeRemoteAccountTransition } from "@/lib/auth/account-transition-state";
import { installAccountTransitionInteractionGuard } from "@/lib/auth/account-transition-interaction";
import { normalizeLocale } from "@/lib/i18n/locale";
import commonId from "@/messages/id/common.json";
import commonEn from "@/messages/en/common.json";

const serverSnapshot = () => false;

/** The initiating tab keeps its account-menu loading state; other tabs pause. */
export function AccountTransitionBoundary() {
  const client = useQueryClient();
  const pending = useSyncExternalStore(subscribeRemoteAccountTransition, isRemoteAccountTransitionPending, serverSnapshot);

  useEffect(() => installAccountTransitionInteractionGuard({
    target: document,
    isPending: isRemoteAccountTransitionPending,
    subscribe: subscribeRemoteAccountTransition,
    cancelQueries: () => client.cancelQueries(),
  }), [client]);

  if (!pending) return null;
  // QueryProvider sits above LocaleProvider. Read the existing rendered locale
  // only for this client-only status, without changing the server provider tree.
  const label = normalizeLocale(document.documentElement.lang) === "en"
    ? commonEn.accounts.switching : commonId.accounts.switching;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-account-transition-status=""
      className="fixed inset-0 z-100 flex items-center justify-center gap-2 bg-background/90 px-6 text-body-sm text-foreground"
    >
      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <span>{label}</span>
    </div>,
    document.body,
  );
}
