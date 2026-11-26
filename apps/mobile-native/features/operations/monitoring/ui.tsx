import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import {
  MonitoringError, monitoringRanges,
  type MonitoringData, type MonitoringLocale, type MonitoringRange, type MonitoringReader, type MonitoringRequest,
} from "../../../../../packages/native-parity/operations/monitoring-contract";
import { Button } from "../../../components/Button";
import { Skeleton } from "../../../components/Skeleton";
import { nativeTypography } from "../../../typography";

export type Theme = keyof typeof nativeColors;

export const MonitoringContext = createContext<{ locale: MonitoringLocale; theme: Theme }>({
  locale: "id", theme: "light",
});

export function useMonitoringUi() {
  const { locale, theme } = useContext(MonitoringContext);
  const language = locale === "id" ? "id-ID" : "en-US";
  return {
    theme,
    colors: nativeColors[theme],
    t: (id: string, en: string) => locale === "id" ? id : en,
    n: (value: number) => new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value),
    date: (value: string | number, short = false) => {
      const timestamp = new Date(value);
      if (!Number.isFinite(timestamp.valueOf())) return String(value);
      return new Intl.DateTimeFormat(language, short
        ? { month: "short", day: "numeric", timeZone: "UTC" }
        : { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(timestamp);
    },
  };
}

export function useMonitoringRead<K extends keyof MonitoringData>(reader: MonitoringReader, input: MonitoringRequest<K>, interval?: number) {
  const query = JSON.stringify(input);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ reader: MonitoringReader; query: string; data?: MonitoringData[K]; error?: unknown }>();
  const [refreshing, setRefreshing] = useState(true);

  useEffect(() => {
    if (!interval) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = (active: boolean) => {
      if (timer) clearTimeout(timer);
      if (active) timer = setTimeout(() => setAttempt(value => value + 1), interval);
    };
    const subscription = AppState.addEventListener("change", state => update(state === "active"));
    if (!refreshing) update(AppState.currentState === "active");
    return () => {
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [interval, refreshing, attempt]);

  useEffect(() => {
    const abort = new AbortController();
    setRefreshing(true);
    void Promise.resolve()
      .then(() => abort.signal.aborted ? undefined : reader.read(JSON.parse(query) as MonitoringRequest<K>, abort.signal))
      .then(data => {
        if (!abort.signal.aborted) setResult({ reader, query, data });
      })
      .catch(error => {
        if (!abort.signal.aborted) setResult({ reader, query, error });
      })
      .finally(() => {
        if (!abort.signal.aborted) setRefreshing(false);
      });
    return () => abort.abort();
  }, [reader, query, attempt]);

  const current = result?.reader === reader && result.query === query ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: !current,
    refreshing,
    reload: () => setAttempt(value => value + 1),
  };
}

export function Body({ children, muted, strong, error, small }: {
  children: ReactNode; muted?: boolean; strong?: boolean; error?: boolean; small?: boolean;
}) {
  const { colors } = useMonitoringUi();
  return (
    <Text style={[
      styles.body, strong ? nativeTypography.bodySemibold : nativeTypography.bodyRegular,
      small && styles.caption, { color: error ? colors.destructive : muted ? colors.mutedForeground : colors.foreground },
    ]}>{children}</Text>
  );
}

export function Heading({ children, section = false }: { children: ReactNode; section?: boolean }) {
  const { colors } = useMonitoringUi();
  return (
    <Text accessibilityRole="header" style={[
      nativeTypography.headingBold, section ? styles.sectionTitle : styles.title, { color: colors.foreground },
    ]}>{children}</Text>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return <View style={styles.section}>{title ? <Heading section>{title}</Heading> : null}{children}</View>;
}

export function Control({ label, onPress, selected, disabled, busy, primary, link, testID }: {
  label: string; onPress: () => void; selected?: boolean; disabled?: boolean; busy?: boolean;
  primary?: boolean; link?: boolean; testID?: string;
}) {
  const { theme } = useMonitoringUi();
  return (
    <Button
      theme={theme}
      size="lg"
      variant={primary || selected ? "default" : link ? "link" : "outline"}
      accessibilityRole={link ? "link" : "button"}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={styles.button}
      disabled={disabled}
      isLoading={busy}
      testID={testID}
      onPress={onPress}
    >{label}</Button>
  );
}

export function Options<T extends string | number>({ label, items, value, onSelect, placeholder }: {
  label: string; items: { value: T; label: string }[]; value?: T; onSelect: (value: T) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find(item => item.value === value);
  return (
    <View style={styles.section}>
      <ActionRow label={`${label}: ${selected?.label ?? placeholder ?? label}`} onPress={() => setOpen(true)} />
      <Dialog title={label} visible={open} onClose={() => setOpen(false)}>
        <List>
          {items.map(item => (
            <ActionRow key={item.value} label={item.label} value={item.value === value ? "✓" : undefined}
              selected={item.value === value} onPress={() => { onSelect(item.value); setOpen(false); }} />
          ))}
        </List>
      </Dialog>
    </View>
  );
}

export function RangeSelect({ value, onChange }: { value: MonitoringRange; onChange: (range: MonitoringRange) => void }) {
  const { t } = useMonitoringUi();
  return <Options
    label={t("Rentang waktu", "Date range")}
    value={value}
    items={monitoringRanges.map(range => ({ value: range, label: t(`${range} hari terakhir`, `Last ${range} days`) }))}
    onSelect={onChange}
  />;
}

export function Dialog({ title, visible, onClose, children }: {
  title: string; visible: boolean; onClose: () => void; children: ReactNode;
}) {
  const { colors, t } = useMonitoringUi();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Heading section>{title}</Heading>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialogBody}>{children}</ScrollView>
          <View style={styles.actions}><Control label={t("Tutup", "Close")} onPress={onClose} /></View>
        </View>
      </View>
    </Modal>
  );
}

export function List({ children }: { children: ReactNode }) {
  const { colors } = useMonitoringUi();
  return <View style={[styles.list, { borderColor: colors.border }]}>{children}</View>;
}

export function ActionRow({ label, detail, value, icon, selected, onPress }: {
  label: string; detail?: string | null; value?: string | number; icon?: string;
  selected?: boolean; onPress?: () => void;
}) {
  const { colors } = useMonitoringUi();
  const content = <>
    {icon ? (
      <View style={[styles.iconTile, { backgroundColor: colors.muted + "aa" }]}>
        <MonitoringIcon icon={icon} color={colors.primary} />
      </View>
    ) : null}
    <View style={styles.rowLabel}>
      <Body strong>{label}</Body>
      {detail ? <Body small muted>{detail}</Body> : null}
    </View>
    {value !== undefined ? <Body small>{value}</Body> : null}
    {onPress && !icon && value === undefined ? <Body muted>›</Body> : null}
  </>;
  if (!onPress) return <View style={[styles.row, { borderColor: colors.border }]}>{content}</View>;
  return (
    <Pressable accessibilityRole={icon ? "link" : "button"}
      accessibilityLabel={[label, detail].filter(Boolean).join(". ")}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderColor: colors.border, backgroundColor: pressed ? colors.muted : "transparent" }]}
    >{content}</Pressable>
  );
}

const iconPaths: Record<string, string> = {
  "web-analytics": "M2 12h20M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 0c-5 5-5 15 0 20m0-20c5 5 5 15 0 20",
  "ops-monitor": "M3 15a9 9 0 1 1 18 0m-9 1 4-4m-4 4h.01",
  "ai-analytics": "M3 3v18h18M7 15l4-4 3 3 5-6",
  "feature-usage": "m4 4 16 7-8 2-2 8-6-17Zm9 10 5 5",
  "tutor-activity": "M2 12h5l2-6 5 12 2-6h6",
  "ai-models": "M7 7h10v10H7zM3 9h4m10 0h4M3 15h4m10 0h4M9 3v4m0 10v4m6-18v4m0 10v4",
  "api-keys": "M20 4a5 5 0 1 1-7 7L4 20H2v-4l7-7a5 5 0 0 1 11-5Z",
  courses: "m2 10 10-5 10 5-10 5-10-5Zm5 3v5q5 2 10 0v-5m5-3v6",
  blog: "M4 4h13v16H4zm13 4h3v10a2 2 0 0 1-2 2M7 8h7M7 12h7M7 16h4",
  schedules: "M3 5h18v16H3zM3 10h18M7 3v4m10-4v4",
  meet: "M3 6h12v12H3zm12 4 6-4v12l-6-4",
  docs: "M6 3h10l4 4v14H6zm9 0v5h5M9 13h8m-8 4h8",
};

function MonitoringIcon({ icon, color }: { icon: string; color: string }) {
  return <Svg accessibilityElementsHidden width={16} height={16} viewBox="0 0 24 24">
    <Path d={iconPaths[icon] ?? iconPaths.docs} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>;
}

export function Stats({ items }: { items: { label: string; value: number | string; detail?: string }[] }) {
  const { colors, n } = useMonitoringUi();
  return <View style={[styles.stats, { borderColor: colors.border }]}>
    {items.map(item => <View key={item.label} style={styles.stat}>
      <Body small muted>{item.label}</Body>
      <Text style={[styles.statValue, nativeTypography.headingBold, { color: colors.foreground }]}>
        {typeof item.value === "number" ? n(item.value) : item.value}
      </Text>
      {item.detail ? <Body small muted>{item.detail}</Body> : null}
    </View>)}
  </View>;
}

export function ReadState({ loading, error, retry, message }: {
  loading?: boolean; error?: unknown; retry?: () => void; message?: string;
}) {
  const { t, theme } = useMonitoringUi();
  const status = error instanceof MonitoringError ? error.status : undefined;
  if (status === 401) return <View accessibilityRole="alert">
    <Body strong>{t("Sesi berakhir", "Session expired")}</Body>
    <Body muted>{t("Masuk kembali untuk melanjutkan.", "Sign in again to continue.")}</Body>
  </View>;
  if (status === 403) return <View accessibilityRole="alert">
    <Body strong>{t("Akses ditolak", "Access denied")}</Body>
    <Body muted>{t("Halaman ini memerlukan akses admin.", "This page requires admin access.")}</Body>
  </View>;
  if (loading) return <View accessibilityRole="progressbar" accessibilityLabel={t("Memuat", "Loading")} style={styles.section}>
    <Skeleton theme={theme} style={{ width: "45%", height: 18 }} />
    <Skeleton theme={theme} style={{ width: "100%", height: 54 }} />
    <Skeleton theme={theme} style={{ width: "100%", height: 54 }} />
  </View>;
  if (error) return <View accessibilityRole="alert" style={styles.section}>
    <Body error>{message ?? t("Gagal memuat data.", "Unable to load data.")}</Body>
    {retry && <View style={styles.actions}><Control label={t("Coba lagi", "Retry")} onPress={retry} /></View>}
  </View>;
  return null;
}

type ChartPoint = { label: string; values: number[] };
export function TrendChart({ points, series, empty, stacked }: {
  points: ChartPoint[]; series: string[]; empty: string; stacked?: boolean;
}) {
  const { colors, n, t } = useMonitoringUi();
  const [selected, setSelected] = useState<number>();
  const palette = [colors.primary, colors.accent, colors.secondary, colors.ring, colors.destructive, colors.marketingNavy, colors.mutedForeground, colors.primaryHover];
  if (!points.length || (stacked && points.every(point => point.values.every(value => !value)))) return <Body muted>{empty}</Body>;
  const active = selected === undefined ? undefined : points[selected];
  const width = 340, left = 36, right = 328, top = 16, baseline = 165;
  const peak = Math.max(1, ...points.map(point => stacked ? point.values.reduce((total, value) => total + value, 0) : Math.max(...point.values)));
  const magnitude = Math.pow(10, Math.floor(Math.log10(peak)));
  const max = Math.ceil(peak / magnitude) * magnitude;
  const x = (index: number) => points.length === 1 ? (left + right) / 2 : left + (right - left) * index / (points.length - 1);
  const y = (value: number) => baseline - (baseline - top) * value / max;
  const seriesValue = (point: ChartPoint, index: number) =>
    stacked ? point.values.slice(0, index + 1).reduce((sum, value) => sum + value, 0) : point.values[index];
  const tickIndices = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return <View style={styles.section}>
    <View accessible accessibilityLabel={`${series.join(", ")}. ${active?.label ?? `${points[0].label} ${t("sampai", "to")} ${points.at(-1)?.label}`}`}
      accessibilityRole="adjustable" accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      accessibilityValue={active ? { text: active.values.map((value, index) => `${series[index]} ${n(value)}`).join(", ") } : undefined}
      onAccessibilityAction={event => {
        setSelected(previous => event.nativeEvent.actionName === "increment"
          ? Math.min(points.length - 1, (previous ?? -1) + 1)
          : Math.max(0, (previous ?? 1) - 1));
      }}>
      <Svg width="100%" height={196} viewBox={`0 0 ${width} 196`}>
        {[0, 1, 2, 3].map(index => {
          const ratio = index / 3;
          const value = max * ratio;
          return <Line key={index} x1={left} y1={y(value)} x2={right} y2={y(value)} stroke={colors.border} strokeDasharray="3 3" />;
        })}
        {[0, 1, 2, 3].map(index => {
          const value = max * index / 3;
          return <SvgText key={index} x={left - 5} y={y(value) + 4} textAnchor="end" fill={colors.mutedForeground} fontSize="10">
            {value >= 1000 ? `${n(value / 1000)}k` : n(value)}
          </SvgText>;
        })}
        {tickIndices.map(index => <SvgText key={index} x={x(index)} y={188} textAnchor={points.length === 1 ? "middle" : index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
          fill={colors.mutedForeground} fontSize="11">{points[index].label}</SvgText>)}
        {[...series].reverse().map((name, reversedIndex) => {
          const index = series.length - 1 - reversedIndex;
          const path = points.map((point, pointIndex) => `${pointIndex ? "L" : "M"} ${x(pointIndex)} ${y(seriesValue(point, index))}`).join(" ");
          const d = stacked ? `${path} L ${x(points.length - 1)} ${baseline} L ${x(0)} ${baseline} Z` : path;
          return <Path key={name} d={d} stroke={palette[index]} strokeWidth={2.5} strokeDasharray={!stacked && index === 1 ? "4 4" : undefined}
            fill={stacked ? palette[index] : "none"} />;
        })}
        {selected !== undefined && active ? <Line x1={x(selected)} x2={x(selected)} y1={top} y2={baseline} stroke={colors.mutedForeground} strokeDasharray="4 4" /> : null}
        {(active && selected !== undefined ? active : points.length === 1 ? points[0] : undefined)?.values.map((_, index) => {
          const pointIndex = selected ?? 0;
          return <Circle key={series[index]} cx={x(pointIndex)} cy={y(seriesValue(points[pointIndex], index))}
            r={4} fill={palette[index]} stroke={colors.background} strokeWidth={1.5} />;
        })}
      </Svg>
      <View style={styles.chartTouch}>
        {[...points.keys()].map(index => <Pressable key={index} accessible={false} onPress={() => setSelected(index)} style={styles.chartTarget} />)}
      </View>
    </View>
    <View style={styles.legend}>
      {series.map((name, index) => <View key={name} style={styles.legendItem}>
        <View style={[styles.swatch, { backgroundColor: palette[index % palette.length] }]} />
        <Body small>{name}</Body>
      </View>)}
    </View>
    {active ? <Body small>{`${active.label}: ${active.values.map((value, index) => `${series[index]} ${n(value)}`).join(" · ")}`}</Body> : null}
    {active ? <Control label={t("Tutup rincian", "Hide details")} link onPress={() => setSelected(undefined)} /> : null}
  </View>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { paddingHorizontal: 16, paddingVertical: 20, paddingBottom: 40, gap: 24 },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { fontSize: 22, lineHeight: 29, flexShrink: 1, includeFontPadding: false },
  sectionTitle: { fontSize: 16, lineHeight: 23, includeFontPadding: false },
  body: { fontSize: 14, lineHeight: 20, includeFontPadding: false },
  caption: { fontSize: 12, lineHeight: 17 },
  section: { gap: 8 },
  group: { gap: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  button: { minHeight: 44, flexShrink: 1 },
  list: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { paddingVertical: 10, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { flex: 1, minWidth: 0, gap: 2 },
  iconTile: { width: 32, height: 32, borderRadius: nativeRadii.md, alignItems: "center", justifyContent: "center" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 12 },
  stat: { flexGrow: 1, flexBasis: 100, gap: 3, paddingVertical: 5 },
  statValue: { fontSize: 20, lineHeight: 27, fontVariant: ["tabular-nums"], includeFontPadding: false },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.58)", justifyContent: "center", padding: 16 },
  dialog: { maxHeight: "85%", borderRadius: nativeRadii.lg, borderWidth: 1, padding: 16, gap: 12 },
  dialogBody: { gap: 12 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  chartTouch: { position: "absolute", inset: 0, flexDirection: "row", marginLeft: 34, marginRight: 10 },
  chartTarget: { flex: 1 },
});
