import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MAX_SAVED_ACCOUNTS } from "../../../lib/auth/account-switch-contract";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { Button } from "../components/Button";
import { NativeListRow } from "../features/shared-ui/layout";
import { nativeTypography } from "../typography";
import { authCopy } from "./auth-copy";
import { useNativeBrowserLogin } from "./browser-login";
import type { NativeLoginIntent } from "./login-intent";
import { allowsSavedAccountLogin, describeSavedAccount, savedAccountCopy, savedAccountError, type SavedAccountLocale, type SavedNativeAccount } from "./saved-account-model";
import { useNativeSession } from "./session-provider";

type Theme = keyof typeof nativeColors;
type Load = { accounts?: SavedNativeAccount[]; error?: true };

export function SavedAccounts({ fromSessionId, loginIntent, locale, theme, enabled, onBusyChange }: {
  fromSessionId: string | null; locale: SavedAccountLocale; theme: Theme; enabled: boolean; onBusyChange?(busy: boolean): void;
  loginIntent?: NativeLoginIntent;
}) {
  const router = useRouter();
  const focused = useIsFocused();
  const { listSavedAccounts, switchSavedAccount, removeSavedAccount, getSnapshot, revalidating, state,
    accountChangeIssue, dismissAccountChangeIssue } = useNativeSession();
  const login = useNativeBrowserLogin();
  const [load, setLoad] = useState<Load>();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [remove, setRemove] = useState<SavedNativeAccount | null>(null);
  const [mutation, setMutation] = useState<"add" | "switch" | "remove" | null>(null);
  const [browserFallback, setBrowserFallback] = useState(false);
  const active = useRef(false);
  const request = useRef<string | null>(null);
  const copy = savedAccountCopy(locale);
  const auth = authCopy[locale];
  const colors = nativeColors[theme];
  const loading = !load && fromSessionId !== null;
  const googleBusy = login.status === "opening" || login.status === "exchanging";
  const busy = Boolean(mutation) || googleBusy;
  const atLimit = (load?.accounts?.length ?? 0) + (fromSessionId === null ? 0 : 1) >= MAX_SAVED_ACCOUNTS;
  const rollback = fromSessionId === null ? state.status === "signed-out" : state.status === "signed-in" && state.sessionId === fromSessionId;
  const issue = rollback ? accountChangeIssue : undefined;

  useEffect(() => {
    onBusyChange?.(Boolean(mutation));
    return () => onBusyChange?.(false);
  }, [mutation, onBusyChange]);

  useEffect(() => {
    active.current = enabled && focused && login.isAvailable;
    if (!active.current) return;
    let mounted = true;
    void listSavedAccounts().then(
      accounts => { if (mounted) setLoad({ accounts }); },
      () => { if (mounted) setLoad({ error: true }); },
    );
    return () => { mounted = false; active.current = false; };
  }, [attempt, enabled, focused, fromSessionId, listSavedAccounts, login.isAvailable]);

  function current() {
    return active.current && allowsSavedAccountLogin(getSnapshot(), fromSessionId === null
      ? undefined : { kind: "additional", fromSessionId });
  }

  function retry() {
    setLoad(undefined);
    setAttempt(value => value + 1);
  }

  async function mutate(action: "switch" | "remove", account: SavedNativeAccount) {
    if (!current() || busy || request.current) return;
    request.current = action;
    setMutation(action);
    setError(null);
    try {
      if (action === "switch") {
        await switchSavedAccount(account.accountId, fromSessionId, loginIntent);
        if (fromSessionId !== null || !loginIntent) router.replace("/");
      } else {
        await removeSavedAccount(account.accountId, fromSessionId);
      }
    } catch (failure) {
      if (active.current && getSnapshot().accountChangeIssue?.action !== action) setError(savedAccountError(locale, failure, action));
    } finally {
      request.current = null;
      if (active.current) {
        setMutation(null);
        setRemove(null);
        retry();
      }
    }
  }

  async function add(preferBrowser = false) {
    if (fromSessionId === null || !current() || !login.isAvailable || atLimit || !load?.accounts || busy || request.current) return;
    request.current = "add";
    setMutation("add");
    setError(null);
    setBrowserFallback(false);
    try {
      const outcome = await login.addAccount(fromSessionId, preferBrowser);
      if (!active.current || getSnapshot().accountChangeIssue?.action === "add") return;
      if (outcome === "accepted") router.replace("/");
      else if (outcome === "stale") setError(savedAccountError(locale, "SESSION_EXPIRED", "add"));
      else if (outcome === "unavailable" || outcome === "cancelled") {
        setBrowserFallback(!preferBrowser && login.isCredentialAvailable);
        if (outcome === "unavailable") setError(copy.nativeUnavailable);
      } else if (outcome === "error" || login.getAddStatus(preferBrowser) === "error") {
        setError(savedAccountError(locale, login.getAddFailure(preferBrowser), "add"));
        setBrowserFallback(!preferBrowser && login.isCredentialAvailable);
      }
    } catch (failure) {
      if (active.current && getSnapshot().accountChangeIssue?.action !== "add") setError(savedAccountError(locale, failure, "add"));
    } finally {
      request.current = null;
      if (active.current) {
        setMutation(null);
        retry();
      }
    }
  }

  if (!enabled || !focused || !login.isAvailable || (fromSessionId === null && !load?.accounts?.length && !load?.error && !error && !issue)) return null;
  const locked = busy || revalidating;
  const caption = [styles.caption, { color: colors.mutedForeground }];
  const removeRow = remove && load?.accounts?.findIndex(row => row.accountId === remove.accountId);
  return <View style={styles.stack} testID="native-saved-accounts">
    {load?.accounts?.length ? <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>{copy.saved}</Text> : null}
    {loading ? <Text style={caption}>{copy.loading}</Text> : null}
    {load?.error ? <View style={styles.actions}>
      <Text accessibilityRole="alert" style={caption}>{copy.loadFailed}</Text>
      <Button theme={theme} variant="outline" onPress={retry}>{copy.retry}</Button>
    </View> : null}
    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.destructive }]}>{error}</Text> : null}
    {issue ? <View style={styles.actions} testID="native-saved-account-recovery">
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.destructive }]}>
        {savedAccountError(locale, issue.code, issue.action)}
      </Text>
      <Button theme={theme} variant="outline" disabled={locked} onPress={() => { dismissAccountChangeIssue(issue); retry(); }}>{copy.retry}</Button>
    </View> : null}
    {remove && typeof removeRow === "number" && removeRow >= 0 ? <View style={styles.stack} testID="native-account-remove-confirmation">
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>{copy.removeTitle}</Text>
      <Text style={caption}>{copy.removeDescription.replace("{email}", describeSavedAccount(remove, removeRow, locale).identity)}</Text>
      <View style={styles.actions}>
        <Button theme={theme} variant="outline" disabled={locked} onPress={() => setRemove(null)}>{copy.cancel}</Button>
        <Button theme={theme} variant="destructive" isLoading={mutation === "remove"} disabled={revalidating}
          testID="native-account-confirm-remove" onPress={() => void mutate("remove", remove)}>{copy.remove}</Button>
      </View>
    </View> : <>
      {load?.accounts?.map((account, index) => {
        const item = describeSavedAccount(account, index, locale);
        return <NativeListRow key={account.accountId} layout="compact" theme={theme} title={item.title} subtitle={item.subtitle}
          testID={`native-saved-account-${index}`}
          primary={{ label: item.switchLabel, disabled: locked, onPress: () => void mutate("switch", account) }}
          actions={[{ id: "remove", label: copy.remove, accessibilityLabel: `${copy.remove}: ${item.identity}`, disabled: locked }]}
          onAction={() => { if (current() && !busy) { setRemove(account); setError(null); } }} />;
      })}
      {mutation === "switch" ? <Text accessibilityLiveRegion="polite" style={caption}>{copy.switching}</Text> : null}
      {fromSessionId !== null && load?.accounts ? <>
        <Button theme={theme} variant="outline" disabled={locked || atLimit || !login.isAvailable}
          testID="native-account-add" onPress={() => void add()}>{copy.add}</Button>
        {atLimit ? <Text style={caption}>{copy.limit.replace("{count}", String(MAX_SAVED_ACCOUNTS))}</Text> : null}
        {browserFallback && !busy && !atLimit ? <Button theme={theme} variant="outline" onPress={() => void add(true)}>{copy.browserFallback}</Button> : null}
        {googleBusy && mutation === "add" ? <>
          <Text accessibilityLiveRegion="polite" style={caption}>{login.status === "exchanging" ? auth.native.finishing : auth.native.connecting}</Text>
          <Button theme={theme} variant="ghost" onPress={login.cancel}>{copy.cancel}</Button>
        </> : null}
      </> : null}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  heading: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 22 },
  caption: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20 },
});
