import { usePageTitle } from "../../../routing/visible-navbar-title";
import { StudentListRow } from "../ListRow";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator, AppState, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme,
  type TextInputProps,
} from "react-native";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { Switch } from "../../../components/Switch";
import { nativeTypography } from "../../../typography";
import type { StudentScreenProps, StudentRequest } from "../contracts";

import { useNativeAppearance, readingDensityScales, readingFontScales } from "../../../device/appearance";
import { NativePageOrnaments } from "../../shared-ui/page-ornaments";
import { DiscussionViewportContext, useDiscussionViewport } from "../../discussions/read-viewport";
import { useStudentAlert } from "./alerts";

export type Translation = (id: string, en: string) => string;

const Context = createContext<StudentScreenProps | null>(null);
export function CommunityProvider({ props, children }: { props: StudentScreenProps; children: ReactNode }) {
  return <Context.Provider value={props}>{children}</Context.Provider>;
}
export function useCommunity() {
  const props = useContext(Context);
  if (!props) throw new Error("Missing Student community context");
  const system = useColorScheme();
  const preference = props.devicePreferences?.theme;
  const theme = preference && preference !== "system" ? preference : system ?? "light";
  const tr: Translation = (id, en) => props.session.locale === "en" ? en : id;
  return { ...props, tr, colors: nativeColors[theme], theme };
}

class CommunityError extends Error {
  constructor(readonly status: number, readonly code?: string) { super(code ?? "unavailable"); }
}
class OperationError extends Error {}

export async function readJson<T>(request: StudentRequest, path: string, init?: RequestInit): Promise<T> {
  const res = await request(path, init);
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { code?: string; error?: string } | null;
    throw new CommunityError(res.status, data?.code ?? data?.error);
  }
  return await res.json() as T;
}
export function communityPath(operation: string, query: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  const search = params.toString();
  return `/api/native/student/community/${operation}${search ? `?${search}` : ""}`;
}
export function post<T>(request: StudentRequest, operation: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return readJson<T>(request, communityPath(operation), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
}
export function operationResult(result: { success?: boolean; ok?: boolean; message?: string; error?: string; errorCode?: string }) {
  if (!(result.success ?? result.ok)) throw new OperationError(result.errorCode ?? result.error ?? result.message);
}

export function useRemote<T>(path: string | null, init?: RequestInit, pollAfter?: (data: T) => number) {
  const { request, session, focused = true } = useCommunity();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: T; error?: unknown }>();
  const method = init?.method;
  const sessionId = session.sessionId;
  const key = JSON.stringify([session.userId, sessionId, session.origin, session.locale, path, method]);
  const enabled = !pollAfter || focused;
  useEffect(() => {
    if (!path || !enabled) return;
    const target = path;
    const headers = sessionId && path.startsWith("/api/discussions/workspace?")
      ? { "x-discussion-session-id": sessionId } : undefined;
    let disposed = false;
    let inFlight: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function stop() {
      clearTimeout(timer);
      inFlight?.abort();
      inFlight = undefined;
    }
    async function read() {
      if (disposed || inFlight || (pollAfter && AppState.currentState && AppState.currentState !== "active")) return;
      const attempt = new AbortController();
      inFlight = attempt;
      let delay: number | undefined;
      try {
        const data = await readJson<T>(request, target, { method, headers, signal: attempt.signal });
        if (attempt.signal.aborted) return;
        setResult({ key, data });
        delay = pollAfter?.(data);
      } catch (error) {
        if (attempt.signal.aborted) return;
        const transient = !(error instanceof CommunityError) || error.status >= 500 || error.status === 429;
        setResult(previous => ({ key, error, data: pollAfter && transient && previous?.key === key ? previous.data : undefined }));
        if (pollAfter && transient) delay = 60_000;
      } finally {
        if (inFlight === attempt) inFlight = undefined;
        if (!disposed && !attempt.signal.aborted && delay !== undefined) timer = setTimeout(() => void read(), delay);
      }
    }
    const subscription = pollAfter ? AppState.addEventListener("change", state => {
      stop();
      if (state === "active") void read();
    }) : undefined;
    void read();
    return () => { disposed = true; stop(); subscription?.remove(); };
  }, [enabled, key, method, path, pollAfter, request, revision, sessionId]);
  const reload = useCallback(() => {
    if (!pollAfter) setResult(undefined);
    setRevision(value => value + 1);
  }, [pollAfter]);
  return { data: result?.key === key ? result?.data : undefined, error: result?.key === key ? result?.error : undefined, reload };
}

export function describeError(error: unknown, tr: Translation) {
  if (error instanceof OperationError) {
    const validation = {
      facultyRequired: tr("Pilih fakultas.", "Select a faculty."),
      majorRequired: tr("Pilih program studi.", "Select a major."),
      entryYearInvalid: tr("Periksa tahun masuk.", "Check your entry year."),
      sessionExpired: tr("Sesi berakhir. Masuk kembali.", "Your session expired. Sign in again."),
      saveFailed: tr("Perubahan belum tersimpan. Coba lagi.", "Changes could not be saved. Try again."),
    };
    return error.message && Object.hasOwn(validation, error.message)
      ? validation[error.message as keyof typeof validation] : error.message || tr("Tindakan belum berhasil. Coba lagi.", "The action failed. Try again.");
  }
  if (error instanceof CommunityError) {
    if (error.status === 401) return tr("Sesi berakhir. Masuk kembali.", "Your session expired. Sign in again.");
    if (error.status === 403 || error.status === 404) return tr("Konten tidak tersedia atau akses berubah.", "Content is unavailable or access has changed.");
    if (error.status === 409) return tr("Data berubah. Muat ulang sebelum melanjutkan.", "The data changed. Reload before continuing.");
    if (error.status === 400) return tr("Periksa kembali isian dan pilihan.", "Check your entries and selections.");
    if (error.status === 429) return tr("Terlalu banyak percobaan. Coba lagi nanti.", "Too many attempts. Try again later.");
  }
  return tr("Koneksi bermasalah. Coba lagi.", "Connection interrupted. Try again.");
}

export function useOperation() {
  const { tr } = useCommunity();
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ message: string; failed: boolean } | null>(null);
  async function run(work: () => Promise<void>, success?: string, networkFailure?: string) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setNotice(null);
    try {
      await work();
      if (success) setNotice({ message: success, failed: false });
    } catch (error) {
      const uncertain = error instanceof CommunityError ? error.status >= 500 : !(error instanceof OperationError);
      setNotice({ message: networkFailure && uncertain ? networkFailure : describeError(error, tr), failed: true });
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return { pending, notice, run };
}

export function Page({ title, headerAction, compactTitle, children, observeDiscussion = false }: {
  title: string; headerAction?: ReactNode; compactTitle?: boolean; children: ReactNode; observeDiscussion?: boolean;
}) {
  const { colors, theme, initialScrollY, onScrollY } = useCommunity();
  const { density } = useNativeAppearance();
  const pageTitle = usePageTitle(title);
  const { scroller, scrollProps } = useDiscussionViewport();
  const start = useRef(initialScrollY);
  const restored = useRef(false);
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <NativePageOrnaments variant="plans" theme={theme} opacityScale={0.3} />
    <DiscussionViewportContext.Provider value={scroller}><ScrollView ref={scroller.ref} style={{ flex: 1 }} contentContainerStyle={[styles.page, { gap: 18 * readingDensityScales[density] }]}
    keyboardShouldPersistTaps="handled"
    keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
    onContentSizeChange={(_, height) => {
      if (!restored.current && start.current > 0 && height > start.current) {
        scroller.ref.current?.scrollTo({ y: start.current, animated: false });
        restored.current = true;
      }
      if (observeDiscussion) scrollProps.onContentSizeChange();
    }}
    onLayout={observeDiscussion ? scrollProps.onLayout : undefined}
    onScroll={event => {
      onScrollY(event.nativeEvent.contentOffset.y);
      if (observeDiscussion) scrollProps.onScroll();
    }}
    scrollEventThrottle={16}
  >
    {headerAction ? <View style={styles.compactHeader}>
      {pageTitle && <Text accessibilityRole="header" style={[styles.compactTitle, { color: colors.foreground }]}>{pageTitle}</Text>}
      {headerAction}
    </View> : pageTitle && <Text accessibilityRole="header" style={[compactTitle ? styles.compactPageTitle : styles.title, { color: colors.foreground }]}>{pageTitle}</Text>}
    {children}
  </ScrollView></DiscussionViewportContext.Provider></View>;
}

export function Copy({ children, kind = "body" }: { children: ReactNode; kind?: "body" | "muted" | "strong" | "heading" | "error" }) {
  const { colors } = useCommunity();
  const size = readingFontScales[useNativeAppearance().fontSize];
  return <Text accessibilityRole={kind === "heading" ? "header" : undefined}
    style={[styles.body, kind === "heading" && styles.heading, kind === "strong" && nativeTypography.bodySemibold,
      { fontSize: (kind === "heading" ? 17 : 14) * size, lineHeight: (kind === "heading" ? 23 : 21) * size, color: kind === "muted" ? colors.mutedForeground : kind === "error" ? colors.destructive : colors.foreground }]}>{children}</Text>;
}

export function Notice({ notice }: { notice: { message: string; failed: boolean } | null }) {
  const announce = useStudentAlert();
  useEffect(() => { if (notice && !notice.failed) announce?.(notice.message); }, [announce, notice]);
  if (!notice || (!notice.failed && announce)) return null;
  return <View accessibilityRole={notice.failed ? "alert" : undefined} accessibilityLiveRegion="polite"><Copy kind={notice.failed ? "error" : "body"}>{notice.message}</Copy></View>;
}

export function Rows({ children }: { children: ReactNode }) {
  return <View>{children}</View>;
}
export function Row({ title, meta, aside, onPress, children }: { title: string; meta?: string; aside?: string; onPress?: () => void; children?: ReactNode }) {
  const { theme } = useCommunity();
  return (
    <StudentListRow title={title} subtitle={meta} theme={theme}
      trailingValue={aside}
      primary={onPress ? { onPress, role: "button" } : undefined}>
      {children}
    </StudentListRow>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}
export function Action({ label, onPress, busy, disabled, mode = "outline" }: {
  label: string; onPress(): void; busy?: boolean; disabled?: boolean; mode?: "default" | "outline" | "ghost" | "destructive";
}) {
  const { theme } = useCommunity();
  return <Button theme={theme} size="lg" variant={mode} onPress={onPress} isLoading={busy} disabled={disabled}>{label}</Button>;
}
export function Choices<Value extends string>({ options, value, onSelect, disabled }: {
  options: readonly { value: Value; label: string }[]; value: NoInfer<Value> | null; onSelect(value: NoInfer<Value>): void; disabled?: boolean;
}) {
  const { colors } = useCommunity();
  return <Actions>{options.map(option => {
    const selected = value === option.value;
    return <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected, disabled }}
      disabled={disabled} onPress={() => onSelect(option.value)}
      style={({ pressed }) => [styles.choice, {
        backgroundColor: selected ? colors.primary : pressed ? colors.muted : colors.background,
        borderColor: selected ? colors.primary : colors.border,
      }]}>
      <Text style={[styles.body, { color: selected ? colors.primaryForeground : colors.foreground }]}>{option.label}</Text>
    </Pressable>;
  })}</Actions>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { theme } = useCommunity();
  return <View style={styles.field}><Copy kind="strong">{label}</Copy><Input theme={theme} accessibilityLabel={label} {...props} /></View>;
}
export function Toggle({ label, value, onChange, disabled, testID }: { label: string; value: boolean; onChange(value: boolean): void; disabled?: boolean; testID?: string }) {
  const { theme, colors } = useCommunity();
  return <View style={[styles.preference, { borderColor: colors.border }]}>
    <View style={styles.rowBody}><Copy>{label}</Copy></View>
    <Switch testID={testID} theme={theme} checked={value} onCheckedChange={onChange} disabled={disabled} accessibilityLabel={label} />
  </View>;
}
export function Avatar({ name, uri }: { name: string; uri: string | null }) {
  const { colors } = useCommunity();
  const [failed, fail] = useState<string | null>(null);
  return <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
    {uri && uri !== failed ? <Image source={{ uri }} style={styles.avatar} onError={() => fail(uri)} accessible={false} />
      : <Copy kind="strong">{name.split(/\s+/).map(word => Array.from(word)[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}</Copy>}
  </View>;
}

export function Remote<T>({ state, children }: { state: ReturnType<typeof useRemote<T>>; children(data: T): ReactNode }) {
  const { tr, colors } = useCommunity();
  if (state.data !== undefined) return <>
    {state.error ? <View accessibilityLiveRegion="polite"><Copy kind="error">{describeError(state.error, tr)}</Copy>
      <Action label={tr("Coba lagi", "Try again")} onPress={state.reload} /></View> : null}
    {children(state.data)}
  </>;
  if (state.error) return <View style={styles.field} accessibilityLiveRegion="polite">
    <Copy kind="error">{describeError(state.error, tr)}</Copy>
    <Actions><Action label={tr("Coba lagi", "Try again")} onPress={state.reload} /></Actions>
  </View>;
  return <ActivityIndicator color={colors.primary} accessibilityLabel={tr("Memuat", "Loading")} style={styles.loading} />;
}

export function isHttps(url: string) {
  try { return /^https?:$/.test(new URL(url).protocol); }
  catch { return false; }
}

export function dateLabel(value: string, locale: string, includeTime = false) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
    dateStyle: "medium", ...(includeTime ? { timeStyle: "short" } : {}), timeZone: "Asia/Jakarta",
  }).format(date);
}

export const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 18, flexGrow: 1 },
  title: { ...nativeTypography.headingBold, fontSize: 24, lineHeight: 31 },
  compactHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  compactTitle: { ...nativeTypography.headingSemibold, flex: 1, fontSize: 14, lineHeight: 20 },
  compactPageTitle: { ...nativeTypography.headingSemibold, fontSize: 14, lineHeight: 20, includeFontPadding: false },
  body: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 21 },
  heading: { ...nativeTypography.headingBold, fontSize: 17, lineHeight: 23 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  field: { gap: 6 },
  block: { gap: 12 },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  preference: { flexDirection: "row", minHeight: 48, alignItems: "center", gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  choice: { minHeight: 40, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: nativeRadii.md, borderWidth: 1 },
  loading: { alignSelf: "center", padding: 24 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
});
