import Storage from "expo-sqlite/kv-store";
import { useNavigation, useSitemap } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
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
import { nativeTypography } from "../../typography";
import { NativeListRow, NativeStatusPanel } from "../shared-ui/layout";
import { SharedDialog } from "../shared-ui/overlays";
import { canSearchStudents, localSearchHits, readSearchHits, readSearchPeople, searchShortcuts, searchCategories, searchDestination, studentPeopleQuery, type SearchHit, type SearchPerson } from "./results";

import { allowSavedLink, readSavedLinks, searchStorageKey, updateSavedLinks, type SearchLink } from "./saved-links";
import { useTourEvent } from "../onboarding/tour-events";

type Theme = keyof typeof nativeColors;
type SearchState = { query: string; hits: SearchHit[] } | { query: string; error: true };
const labels = { id: searchId, en: searchEn };

function SearchDialog({ open, account, transport, trigger, theme, dismiss, choose }: {
  open: boolean; account: NativeAccountContext; transport: NativeSessionTransport; theme: Theme;
  trigger: RefObject<ComponentRef<typeof Pressable> | null>; dismiss(): void; choose(path: string): void;
}) {
  const sitemap = useSitemap();
  const storageKey = searchStorageKey(transport.scope.origin, account);
  const [saved, setSaved] = useState<ReturnType<typeof readSavedLinks>>({ recent: [], favorites: [] });
  useEffect(() => {
    if (!open) return;
    let raw: string | null = null;
    try { raw = Storage.getItemSync(storageKey); } catch { /* Allow search with device storage unavailable. */ }
    setSaved(readSavedLinks(raw, href => allowSavedLink(href, account, sitemap)));
  }, [open, storageKey, account, sitemap]);
  function remember(action: "visit" | "forget" | "favorite", link: SearchLink) {
    if (!transport.isCurrent() || !allowSavedLink(link.href, account, sitemap)) return;
    const next = updateSavedLinks(saved, action, link);
    setSaved(next);
    try { Storage.setItemSync(storageKey, JSON.stringify(next)); } catch { /* Keep the current selection in memory. */ }
  }
  const [text, setText] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<SearchState>();
  const [people, setPeople] = useState<{ query: string; hits: SearchPerson[] }>();
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const query = text.trim();
  const copy = labels[account.locale];
  const help = query === "?";
  useEffect(() => {
    if (!open) { setText(""); setResult(undefined); setPeople(undefined); return; }
    if (!query || help) return;
    const request = new AbortController();
    const timer = setTimeout(() => {
      void readSearchHits(transport, query, account, sitemap, request.signal)
        .then(hits => { if (!request.signal.aborted && transport.isCurrent()) setResult({ query, hits }); })
        .catch(() => { if (!request.signal.aborted && transport.isCurrent()) setResult({ query, error: true }); });
    }, 250);
    return () => { clearTimeout(timer); request.abort(); };
  }, [account, attempt, help, open, query, sitemap, transport]);
  const eligiblePeople = studentPeopleQuery(query, account);
  useEffect(() => {
    if (!open || !eligiblePeople) return;
    const request = new AbortController();
    const timer = setTimeout(() => {
      void readSearchPeople(transport, query, account, sitemap, request.signal).then(hits => {
        if (!request.signal.aborted && transport.isCurrent()) setPeople({ query, hits });
      }).catch(() => {
        if (!request.signal.aborted && transport.isCurrent()) setPeople({ query, hits: [] });
      });
    }, 250);
    return () => { clearTimeout(timer); request.abort(); };
  }, [account, eligiblePeople, open, query, sitemap, transport]);
  const matches = eligiblePeople && people?.query === query ? people.hits : [];
  const searchingPeople = !!eligiblePeople && people?.query !== query;
  const current = result?.query === query ? result : undefined;
  const local = useMemo(() => open ? localSearchHits(query, account, sitemap) : [], [account, open, query, sitemap]);
  const remote = current && "hits" in current ? current.hits : [];
  const remotePaths = new Set(remote.map(hit => hit.href));
  const hits = [...remote, ...local.filter(item => !remotePaths.has(item.href))];
  const titleStyle = [styles.heading, { color: nativeColors[theme].foreground }];
  const setQuery = (next: string) => { setResult(undefined); setPeople(undefined); setText(next); };
  function resultRow(link: SearchLink, subtitle?: string, recent = false) {
    const canSave = allowSavedLink(link.href, account, sitemap);
    const starred = saved.favorites.some(item => item.href === link.href);
    const actions = canSave ? [{ id: "favorite" as const, label: starred ? copy.removeFavorite : copy.addFavorite }] : [];
    return <NativeListRow key={link.href} theme={theme} layout="compact" title={link.title} subtitle={subtitle}
      actions={recent ? [...actions, { id: "forget", label: copy.removeRecent }] : actions}
      onAction={id => { if (id === "favorite" || id === "forget") remember(id, link); }}
      primary={{ role: "link", onPress: () => { remember("visit", link); choose(link.href); } }} />;
  }
  return <SharedDialog open={open} title={copy.dialogLabel} closeLabel={copy.closeSearch} theme={theme}
    onDismiss={dismiss} initialFocusRef={field} returnFocusRef={trigger} testID="role-site-search">
    <Input ref={field} theme={theme} accessibilityLabel={copy.dialogLabel} value={text} onChangeText={setQuery}
      placeholder={copy.placeholder} autoCapitalize="none" returnKeyType="search" maxLength={512} testID="role-site-search-query" />
    {!query && <>
      {saved.recent.length > 0 && <View><Text style={titleStyle}>{copy.recent}</Text>{saved.recent.map(link => resultRow(link, undefined, true))}</View>}
      {saved.favorites.length > 0 && <View><Text style={titleStyle}>{copy.favorite}</Text>{saved.favorites.map(link => resultRow(link))}</View>}
      {!saved.recent.length && !saved.favorites.length && <View><Text style={titleStyle}>{copy.quickAccess}</Text>
        {searchShortcuts(account, sitemap).map(item => resultRow(item, item.subtitle))}</View>}
    </>}
    {help && <><Text style={titleStyle}>{copy.helpAuthenticated}</Text>
      {SEARCH_PREFIX_DEFINITIONS.filter(item => account.roles.includes("admin") || (item.type === "user" && canSearchStudents(account)) || !["token", "user"].includes(item.type))
        .map(item => <NativeListRow key={item.type} theme={theme} layout="compact" title={copy.prefixLabels[item.type]} subtitle={item.example}
          primary={{ onPress: () => { setQuery(item.type + ": "); field.current?.focus(); } }} />)}</>}
    {matches.length > 0 && <View><Text accessibilityRole="header" style={titleStyle}>{account.locale === "id" ? "Orang" : "People"}</Text>
      {matches.map(hit => <NativeListRow key={hit.href} theme={theme} layout="compact" title={hit.title}
        primary={{ role: "link", onPress: () => choose(hit.href) }} />)}</View>}
    {!!query && !help && <>
      {(!current || searchingPeople) && <ActivityIndicator accessibilityLabel={copy.loading} color={nativeColors[theme].primary} />}
      {current && "error" in current && <NativeStatusPanel theme={theme} tone="error"
        title={account.locale === "id" ? "Hasil pencarian belum bisa dimuat." : "Search results could not be loaded."}
        action={{ id: "retry", label: account.locale === "id" ? "Coba lagi" : "Try again" }}
        onAction={() => { setResult(undefined); setAttempt(value => value + 1); }} />}
      {current && "hits" in current && !hits.length && !matches.length && !searchingPeople && <NativeStatusPanel theme={theme} title={copy.noResults.replace("{query}", query)} />}
      {searchCategories.map(([category, key]) => {
        const group = hits.filter(hit => hit.category === category);
        return group.length ? <View key={category}><Text accessibilityRole="header" style={titleStyle}>{copy.categories[key]}</Text>
          {group.map(hit => resultRow(hit, hit.subtitle))}</View> : null;
      })}
    </>}
  </SharedDialog>;
}

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
    dialog: ready && <SearchDialog key={JSON.stringify([context.sessionId, context.roles])} open={active} account={context} transport={transport} trigger={trigger} theme={theme}
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
