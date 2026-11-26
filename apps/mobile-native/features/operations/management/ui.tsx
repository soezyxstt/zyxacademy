import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, type TextInputProps } from "react-native";

import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { ManagementFailure, type ManagementAction, type ManagementClient, type ManagementReads, type ManagementReceipt } from "../../../../../packages/native-parity/operations/management-contract";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { nativeTypography } from "../../../typography";
import type { PickBlogThumbnail } from "./blog-upload";

export type ManagementTheme = keyof typeof nativeColors;
type Draft<T> = { value: T; baseline: T; revision?: string; changed: boolean };
export type ManagementDraftStore = Map<string, Draft<unknown>>;
export type ManagementRuntime = {
  client: ManagementClient;
  theme: ManagementTheme;
  locale: "id" | "en";
  navigate: (path: string) => void;
  openExternal?: (url: string) => void | Promise<void>;
  share?: (url: string, title?: string) => void | Promise<void>;
  pickBlogThumbnail?: PickBlogThumbnail;
  drafts: ManagementDraftStore;
  retries: Map<string, string>;
  renderMarkdown?: (markdown: string) => ReactNode;
};

export const ManagementContext = createContext<ManagementRuntime | null>(null);
export function useManagement() {
  const runtime = useContext(ManagementContext);
  if (!runtime) throw new Error("ManagementRuntime is required");
  return { ...runtime, colors: nativeColors[runtime.theme] };
}

export function managementErrorMessage(error: unknown): string {
  if (!(error instanceof ManagementFailure)) return "Operasi belum berhasil. Periksa koneksi dan coba lagi.";
  const messages = {
    forbidden: "Akses admin diperlukan.",
    "not-found": "Data tidak ditemukan.",
    conflict: "Data telah berubah. Tinjau revisi terbaru sebelum menyimpan lagi.",
    invalid: "Periksa kembali isian.",
    unavailable: "Data belum dapat dimuat. Coba lagi.",
    unsupported: "Operasi belum tersedia di aplikasi ini.",
    pending: "Operasi masih diproses. Coba periksa statusnya lagi.",
    uncertain: "Hasil operasi belum dapat dipastikan. Periksa statusnya di web Admin.",
    "payload-too-large": "Ukuran perubahan melebihi batas.",
  };
  return error.code === "invalid" && error.message !== "invalid" ? error.message : messages[error.code];
}

type LoadState<T> = { client?: ManagementClient; key: string; data?: T; error?: unknown };
export function useRead<K extends keyof ManagementReads>(view: K, input: ManagementReads[K][0], enabled = true) {
  const { client } = useManagement();
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([view, input, attempt]);
  const [state, setState] = useState<LoadState<ManagementReads[K][1]>>({ key: "" });
  const currentInput = useRef(input);
  currentInput.current = input;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    client.read(view, currentInput.current, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ client, key, data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ client, key, error });
    });
    return () => controller.abort();
  }, [client, view, key, enabled]);
  const current = state.client === client && state.key === key;
  return { ...(current ? state : {}), loading: enabled && !current, reload: () => setAttempt(value => value + 1) };
}

let operationSerial = 0;
function requestKey() {
  operationSerial += 1;
  return globalThis.crypto?.randomUUID?.() ?? `operations-${Date.now().toString(36)}-${operationSerial.toString(36)}`;
}

export function useAction() {
  const { client, retries } = useManagement();
  const lifetime = useRef<object | null>(null);
  useEffect(() => {
    lifetime.current = {};
    return () => { lifetime.current = null; };
  }, [client]);
  const pending = useRef<object | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [status, setStatus] = useState("");
  const run = async (action: ManagementAction, succeeded?: (result: ManagementReceipt) => void, success: string | ((receipt: ManagementReceipt) => string) = "Perubahan tersimpan.") => {
    const current = lifetime.current;
    if (!current || pending.current === current) return;
    pending.current = current;
    const payload = JSON.stringify(action);
    const key = retries.get(payload) ?? requestKey();
    retries.set(payload, key);
    setBusy(true);
    setError(undefined);
    setStatus("");
    try {
      const result = await client.mutate(action, key);
      retries.delete(payload);
      if (lifetime.current !== current) return;
      setStatus(typeof success === "function" ? success(result) : success);
      succeeded?.(result);
    } catch (failure) {
      if (failure instanceof ManagementFailure && !["unavailable", "pending", "uncertain"].includes(failure.code)) retries.delete(payload);
      if (lifetime.current === current) setError(failure);
    } finally {
      if (pending.current === current) pending.current = null;
      if (lifetime.current === current) setBusy(false);
    }
  };
  return { busy, error, status, setError, run };
}

export function useDraft<T>(key: string, initialValue: T, initialRevision?: string) {
  const { drafts } = useManagement();
  const [state, setState] = useState<Draft<T>>(() => drafts.get(key) as Draft<T> | undefined ?? {
    value: initialValue, baseline: initialValue, revision: initialRevision, changed: false,
  });
  const current = useRef(state);
  function write(next: Draft<T>) {
    current.current = next;
    setState(next);
    if (next.changed) drafts.set(key, next);
    else drafts.delete(key);
  }
  return {
    ...state,
    change: (value: T) => write({ ...current.current, value, changed: true }),
    update: (derive: (value: T) => T) => write({ ...current.current, value: derive(current.current.value), changed: true }),
    resolve: (value: T, baseline: T, revision: string) => write({ value, baseline, revision, changed: true }),
    saved: (baseline: T, revision?: string) => write({
      ...current.current, baseline, revision: revision ?? current.current.revision, changed: current.current.value !== baseline,
    }),
    clear: () => write({ ...current.current, changed: false }),
  };
}

export function Screen({ title, description, back, actions, children }: { title: string; description?: string; back?: { label: string; run: () => void }; actions?: ReactNode; children: ReactNode }) {
  const { colors } = useManagement();
  return <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
    <View style={styles.header}>
      {back && <Action variant="ghost" onPress={back.run}>{back.label}</Action>}
      <View style={styles.row}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {actions}
      </View>
      {description && <Copy muted>{description}</Copy>}
    </View>
    {children}
  </ScrollView>;
}

export function Action({ children, variant = "outline", onPress, disabled, busy, selected, testID }: {
  children: string; variant?: "default" | "outline" | "ghost" | "destructive"; onPress: () => void; disabled?: boolean; busy?: boolean; selected?: boolean; testID?: string;
}) {
  const { theme } = useManagement();
  return <Button testID={testID} size="lg" theme={theme} variant={variant} onPress={onPress} disabled={disabled} isLoading={busy} accessibilityState={selected === undefined ? undefined : { selected }}>{children}</Button>;
}

export function Copy({ children, muted, strong, status }: { children: ReactNode; muted?: boolean; strong?: boolean; status?: "error" | "success" }) {
  const { colors } = useManagement();
  const color = status === "error" ? colors.destructive : muted ? colors.mutedForeground : colors.foreground;
  return <Text selectable accessibilityRole={status === "error" ? "alert" : undefined} accessibilityLiveRegion={status ? "polite" : undefined} style={[strong ? styles.strong : styles.copy, { color }]}>{children}</Text>;
}

export function Heading({ children }: { children: string }) {
  const { colors } = useManagement();
  return <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>{children}</Text>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { theme } = useManagement();
  return <View style={styles.field}>
    <Copy strong>{label}</Copy>
    <Input {...props} accessibilityLabel={label} theme={theme} />
  </View>;
}

export function Choices<T extends string>({ current, values, onChange }: { current: T; values: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return <View style={styles.row}>{values.map(([value, label]) => <Action key={value} selected={current === value} variant={current === value ? "default" : "outline"} onPress={() => onChange(value)}>{label}</Action>)}</View>;
}

export function Sections<T extends string>({ current, values, onChange }: { current: T; values: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  const { colors } = useManagement();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" style={{ borderBottomColor: colors.border, borderBottomWidth: 1 }} contentContainerStyle={styles.tabs}>
    {values.map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: current === value }} onPress={() => onChange(value)} style={[styles.tab, { borderBottomColor: current === value ? colors.primary : "transparent" }]}>
      <Text style={[styles.strong, { color: current === value ? colors.primary : colors.mutedForeground }]}>{label}</Text>
    </Pressable>)}
  </ScrollView>;
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  const { colors } = useManagement();
  return <View style={[styles.section, { borderTopColor: colors.border }]}>{title && <Heading>{title}</Heading>}{children}</View>;
}

export function Item({ title, meta, actions, onPress }: { title: string; meta?: string; actions?: ReactNode; onPress?: () => void }) {
  const { colors } = useManagement();
  const summary = <View style={styles.field}><Copy strong>{title}</Copy>{meta && <Copy muted>{meta}</Copy>}</View>;
  return <View style={[styles.item, { borderBottomColor: colors.border }]}>
    {onPress ? <Pressable accessibilityRole="link" accessibilityLabel={title} onPress={onPress} style={styles.itemTitle}>{summary}</Pressable> : summary}
    {actions && <View style={styles.row}>{actions}</View>}
  </View>;
}

export function LoadState({ loading, error, retry }: { loading: boolean; error?: unknown; retry: () => void }) {
  const { colors } = useManagement();
  if (loading) return <ActivityIndicator testID="operations-loading" accessibilityLabel="Memuat" style={styles.loader} color={colors.primary} />;
  if (!error) return null;
  return <Section><Copy status="error">{managementErrorMessage(error)}</Copy>
    {(!(error instanceof ManagementFailure) || !["forbidden", "not-found", "unsupported"].includes(error.code)) && <View style={styles.row}><Action onPress={retry}>Coba lagi</Action></View>}
  </Section>;
}

export function Feedback({ error, status }: { error?: unknown; status?: string }) {
  if (error) return <Copy status="error">{managementErrorMessage(error)}</Copy>;
  return status ? <Copy status="success">{status}</Copy> : null;
}

export type Confirmation = { title: string; description: string; label: string; danger?: boolean; run: () => void };
export function Confirm({ value, onClose }: { value: Confirmation | null; onClose: () => void }) {
  const { colors } = useManagement();
  if (!value) return null;
  return <Modal animationType="fade" transparent onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal style={[styles.modal, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Heading>{value.title}</Heading>
        <Copy>{value.description}</Copy>
        <View style={styles.row}>
          <Action onPress={onClose}>Batal</Action>
          <Action onPress={() => { onClose(); value.run(); }} variant={value.danger ? "destructive" : "default"}>{value.label}</Action>
        </View>
      </View>
    </View>
  </Modal>;
}

export function formatTimestamp(value?: string, locale: "id" | "en" = "id") {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString(locale === "id" ? "id-ID" : "en-US", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }) : "Belum tersedia";
}

export const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 16, width: "100%", maxWidth: 920, alignSelf: "center" },
  header: { gap: 8, alignItems: "flex-start" },
  title: { ...nativeTypography.headingBold, fontSize: 24, lineHeight: 30, includeFontPadding: false, flexShrink: 1 },
  heading: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 22, includeFontPadding: false },
  copy: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 21, includeFontPadding: false },
  strong: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 20, includeFontPadding: false },
  section: { borderTopWidth: 1, paddingTop: 12, gap: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  field: { gap: 5 },
  tabs: { gap: 8 },
  tab: { borderBottomWidth: 2, paddingHorizontal: 8, minHeight: 44, justifyContent: "center" },
  item: { gap: 8, paddingVertical: 10, borderBottomWidth: 1 },
  itemTitle: { minHeight: 44, justifyContent: "center" },
  loader: { alignSelf: "flex-start", padding: 12 },
  backdrop: { flex: 1, padding: 20, justifyContent: "center", alignItems: "center", backgroundColor: "#00000070" },
  modal: { width: "100%", maxWidth: 420, borderWidth: 1, borderRadius: nativeRadii.lg, padding: 20, gap: 14 },
});
