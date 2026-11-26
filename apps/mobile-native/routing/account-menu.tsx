import { useNavigation, useSitemap } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable } from "react-native";
import { useNativeAccountContext } from "../auth/use-account-context";
import { useNativeSession } from "../auth/session-provider";
import { SavedAccounts } from "../auth/SavedAccounts";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { useTourEvent } from "../features/onboarding/tour-events";
import { NativeListRow } from "../features/shared-ui/layout";
import { SharedSheet } from "../features/shared-ui/overlays";
import { accountMenuCopy, accountMenuEntries } from "./account-menu-model";

export function useRoleAccountMenu({ enabled, theme, visit }: {
  enabled: boolean; theme: "light" | "dark"; visit(href: string): void;
}) {
  const tour = useTourEvent();
  const { context } = useNativeAccountContext();
  const { state, transport, getSnapshot } = useNativeSession();
  const navigation = useNavigation();
  const sitemap = useSitemap();
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const [open, setOpen] = useState(false);
  const ready = enabled && !!context && !!transport?.isCurrent() && state.status === "signed-in" &&
    state.accountId === context.accountId && state.sessionId === context.sessionId;

  useEffect(() => {
    if (!ready) setOpen(false);
  }, [ready]);

  const current = () => ready && navigation.isFocused() && transport?.isCurrent() &&
    getSnapshot().state === state && !getSnapshot().revalidating;
  if (!ready) return { trigger, action: undefined, open: () => {}, sheet: null };

  const copy = accountMenuCopy(context.locale);
  const entries = accountMenuEntries(context, sitemap);
  const name = context.display?.name.trim();
  const email = context.display?.email.trim();
  function choose(href: string) {
    if (!current()) return;
    setOpen(false);
    visit(href);
  }

  return {
    trigger,
    action: { label: name ? copy.accountNamed.replace("{name}", name) : copy.account, expanded: open },
    open: () => { if (current()) { setOpen(true); tour?.("account"); } },
    sheet: <SharedSheet open={open} testID="role-account-menu" theme={theme}
      title={copy.account} closeLabel={copy.close} returnFocusRef={trigger} onDismiss={() => setOpen(false)}>
      {(name || email) && <NativeListRow layout="compact" theme={theme} title={name || email || copy.userFallback}
          subtitle={name && email ? email : undefined} leading={<Avatar decorative initials={Array.from(name || email || "?")[0].toUpperCase()} theme={theme} />} />}
      {entries.map(entry => <NativeListRow key={entry.id} layout="compact" theme={theme} title={entry.label}
          testID={`role-account-${entry.id}`} primary={{ role: "link", onPress: () => choose(entry.href) }} />)}
      {open ? <SavedAccounts key={state.sessionId} fromSessionId={state.sessionId} enabled locale={context.locale} theme={theme} /> : null}
      <Button variant="destructive" testID="role-account-sign-out" theme={theme}
          onPress={() => choose(`/sign-out?locale=${context.locale}`)}>{copy.logOut}</Button>
    </SharedSheet>,
  };
}
