import { useNavigation, useSitemap } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef, type RefObject } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SEARCH_PREFIX_DEFINITIONS } from "../../../../lib/search/parser";
import searchEn from "../../../../messages/en/search.json";
import searchId from "../../../../messages/id/search.json";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import type { NativeAccountContext } from "../../../../packages/native-session/context";
import { useNativeSession } from "../../auth/session-provider";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { Input } from "../../components/Input";
import type { NativeSessionTransport } from "../../network/transport";
import { accountMenuEntries } from "../../routing/account-menu-model";
import { nativeTypography } from "../../typography";
import { NativeListRow, NativeStatusPanel } from "../shared-ui/layout";
import { SharedDialog } from "../shared-ui/overlays";
import { readSearchHits, searchCategories, searchDestination, type SearchHit } from "./results";

type Theme = keyof typeof nativeColors;
type SearchState = { query: string; hits: SearchHit[] } | { query: string; error: true };
const labels = { id: searchId, en: searchEn };

function SearchDialog({ open, account, transport, trigger, theme, dismiss, choose }: {
  open: boolean; account: NativeAccountContext; transport: NativeSessionTransport; theme: Theme;
  trigger: RefObject<ComponentRef<typeof Pressable> | null>; dismiss(): void; choose(path: string): void;
}) {
  const sitemap = useSitemap();
  const [text, setText] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<SearchState>();
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const query = text.trim();
  const copy = labels[account.locale];
  const help = query === "?";
  useEffect(() => {
    if (!open) { setText(""); setResult(undefined); return; }
    if (!query || help) return;
    const request = new AbortController();
    const timer = setTimeout(() => {
      void readSearchHits(transport, query, account, sitemap, request.signal)
        .then(hits => { if (!request.signal.aborted && transport.isCurrent()) setResult({ query, hits }); })
        .catch(() => { if (!request.signal.aborted && transport.isCurrent()) setResult({ query, error: true }); });
    }, 250);
    return () => { clearTimeout(timer); request.abort(); };
  }, [account, attempt, help, open, query, sitemap, transport]);
  const current = result?.query === query ? result : undefined;
  const titleStyle = [styles.heading, { color: nativeColors[theme].foreground }];
  const setQuery = (next: string) => { setResult(undefined); setText(next); };
  return <SharedDialog open={open} title={copy.dialogLabel} closeLabel={copy.closeSearch} theme={theme}
    onDismiss={dismiss} initialFocusRef={field} returnFocusRef={trigger} testID="role-site-search">
    <Input ref={field} theme={theme} accessibilityLabel={copy.dialogLabel} value={text} onChangeText={setQuery}
      placeholder={copy.placeholder} autoCapitalize="none" returnKeyType="search" maxLength={512} testID="role-site-search-query" />
    {!query && <><Text style={titleStyle}>{copy.quickAccess}</Text>
      {accountMenuEntries(account, sitemap).map(item => <NativeListRow key={item.id} theme={theme} layout="compact"
        title={item.label} primary={{ role: "link", onPress: () => choose(item.href) }} />)}</>}
    {help && <><Text style={titleStyle}>{copy.helpAuthenticated}</Text>
      {SEARCH_PREFIX_DEFINITIONS.filter(item => account.roles.includes("admin") || !["token", "user"].includes(item.type))
        .map(item => <NativeListRow key={item.type} theme={theme} layout="compact" title={copy.prefixLabels[item.type]} subtitle={item.example}
          primary={{ onPress: () => { setQuery(item.type + ": "); field.current?.focus(); } }} />)}</>}
    {query && !help ? !current ? <ActivityIndicator accessibilityLabel={copy.loading} color={nativeColors[theme].primary} /> :
      "error" in current ? <NativeStatusPanel theme={theme} tone="error"
        title={account.locale === "id" ? "Hasil pencarian belum bisa dimuat." : "Search results could not be loaded."}
        action={{ id: "retry", label: account.locale === "id" ? "Coba lagi" : "Try again" }}
        onAction={() => { setResult(undefined); setAttempt(value => value + 1); }} /> :
      current.hits.length === 0 ? <NativeStatusPanel theme={theme} title={copy.noResults.replace("{query}", query)} /> :
        searchCategories.map(([category, key]) => {
          const hits = current.hits.filter(hit => hit.category === category);
          return hits.length ? <View key={category}><Text accessibilityRole="header" style={titleStyle}>{copy.categories[key]}</Text>
            {hits.map(hit => <NativeListRow key={hit.href} theme={theme} layout="compact" title={hit.title}
              subtitle={hit.subtitle} primary={{ role: "link", onPress: () => choose(hit.href) }} />)}</View> : null;
        }) : null}
  </SharedDialog>;
}

import { useTourEvent } from "../onboarding/tour-events";

export function useSiteSearch({ enabled, theme, visit }: { enabled: boolean; theme: Theme; visit(path: string): void }) {
  const tour = useTourEvent();
  const navigation = useNavigation();
  const sitemap = useSitemap();
  const { context } = useNativeAccountContext();
  const { state, transport, revalidating, getSnapshot } = useNativeSession();
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const [opened, setOpened] = useState<NativeSessionTransport | null>(null);
  const ready = enabled && !revalidating && !!context && !!transport && transport.isCurrent() && state.status === "signed-in"
    && context.accountId === state.accountId && context.sessionId === state.sessionId;
  useEffect(() => { if (!ready) setOpened(null); }, [ready]);
  const current = () => ready && navigation.isFocused() && getSnapshot().state === state &&
    !getSnapshot().revalidating && transport?.isCurrent();
  const active = ready && opened === transport;
  return {
    trigger,
    action: ready ? { label: labels[context.locale].searchAction, expanded: active } : undefined,
    open: () => { if (current()) { setOpened(transport); tour?.("search"); } },
    dialog: ready && <SearchDialog open={active} account={context} transport={transport} trigger={trigger} theme={theme}
      dismiss={() => { setOpened(null); tour?.("searchClose"); }} choose={path => {
        if (!current()) return;
        const target = searchDestination(path, context, sitemap);
        if (target) { setOpened(null); visit(target); }
      }} />,
  };
}

const styles = StyleSheet.create({
  heading: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 20, marginTop: 12, marginBottom: 4 },
});
