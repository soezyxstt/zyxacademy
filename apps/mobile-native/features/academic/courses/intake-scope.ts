import { useIsFocused, useNavigation } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useNativeRouteAccountContext } from "../../../auth/use-account-context";
import { useNativeSession } from "../../../auth/session-provider";
import type { DocumentDraftRequest, NativeFilePolicy } from "../../../device/file-controller";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { bindIntakeDevice } from "./intake-device";

export function useVerifiedIntakeSession() {
  const { context, retaining } = useNativeRouteAccountContext(true);
  const { state, transport, getSnapshot } = useNativeSession();
  const { canInteract } = useProtectedInteraction();
  const screen = useNavigation();
  const focused = useIsFocused();
  if (!focused || (Platform.OS !== "ios" && Platform.OS !== "android") || !transport ||
    state.status !== "signed-in" || context?.accountId !== transport.scope.accountId ||
    context.sessionId !== transport.scope.sessionId || !context.roles.includes("admin")) return null;
  return {
    transport,
    locale: context.locale,
    ready: () => !retaining && canInteract(),
    current() {
      const snapshot = getSnapshot();
      return screen.isFocused() && snapshot.transport === transport &&
        snapshot.state.status === "signed-in" && snapshot.state.expiresAt > Date.now() && transport.isCurrent();
    },
  };
}

export type VerifiedIntakeSession = NonNullable<ReturnType<typeof useVerifiedIntakeSession>>;

export function useIntakeDraft(session: VerifiedIntakeSession, courseId: string, route: string, policy: NativeFilePolicy) {
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => { controller.abort(); lifetime.current = null; };
  }, [courseId, route, session.transport]);

  return () => {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || !session.current() || !session.ready()) return null;
    const draft: DocumentDraftRequest & { signal: AbortSignal } = {
      session: session.transport,
      target: { draftId: randomUUID(), locale: session.locale, route },
      isDraftCurrent: session.current,
      signal, policy,
    };
    return { draft, client: bindIntakeDevice(session.transport, courseId, draft) };
  };
}
