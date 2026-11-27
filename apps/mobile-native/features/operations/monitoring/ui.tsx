import { createContext, useContext, useEffect, useRef, useState, type ComponentRef, type ReactNode, type Ref, type RefObject } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { nativeColors, nativeLinkInks, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import {
  MonitoringError, monitoringRanges, monitoringResultMatches,
  type MonitoringData, type MonitoringLocale, type MonitoringRange, type MonitoringReader, type MonitoringRequest,
} from "../../../../../packages/native-parity/operations/monitoring-contract";
import { Button } from "../../../components/Button";
import { Skeleton } from "../../../components/Skeleton";
import { nativeTypography } from "../../../typography";
import { NativeListRow } from "../../shared-ui/layout";
import { NavigationIcon } from "../../shared-ui/navigation-icons";
import { SharedDialog } from "../../shared-ui/overlays";
import { monotonePath, webAnalyticsDateTicks, webAnalyticsTicks } from "./web-chart";

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

  const current = monitoringResultMatches(result, reader, query) ? result : undefined;
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

type DialogControl = ComponentRef<typeof Pressable>;

export function Control({ label, onPress, selected, disabled, busy, primary, link, testID, focusRef }: {
  label: string; onPress: () => void; selected?: boolean; disabled?: boolean; busy?: boolean;
  primary?: boolean; link?: boolean; testID?: string; focusRef?: Ref<DialogControl>;
}) {
  const { theme } = useMonitoringUi();
  return (
    <Button
      ref={focusRef}
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

export function Options<T extends string | number>({ label, items, value, onSelect, placeholder, testID }: {
  label: string; items: { value: T; label: string }[]; value?: T; onSelect: (value: T) => void; placeholder?: string; testID?: string;
}) {
  const picker = useMonitoringDialog<void>();
  const selected = items.find(item => item.value === value);
  return (
    <View style={styles.section}>
      <ActionRow label={`${label}: ${selected?.label ?? placeholder ?? label}`} onPress={() => picker.open(undefined, "options")}
        focusRef={picker.trigger("options")} testID={testID ? `${testID}-trigger` : undefined} />
      <Dialog title={label} visible={picker.selection?.visible ?? false} onClose={picker.close} onAfterClose={picker.clear}
        returnFocusRef={picker.returnFocusRef} testID={testID}>
        <List>
          {items.map(item => (
            <ActionRow key={item.value} label={item.label}
              selected={item.value === value} onPress={() => { if (picker.close()) onSelect(item.value); }} />
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

export function Dialog({ title, visible, onClose, onAfterClose, returnFocusRef, dismissDisabled, footer, children, testID }: {
  title: string; visible: boolean; onClose: () => void; children: ReactNode;
  onAfterClose?(): void; returnFocusRef?: RefObject<DialogControl | null>; dismissDisabled?: boolean; footer?: ReactNode; testID?: string;
}) {
  const { theme, t } = useMonitoringUi();
  return <SharedDialog open={visible} onDismiss={onClose} onAfterDismiss={onAfterClose} returnFocusRef={returnFocusRef}
    title={title} closeLabel={t("Tutup", "Close")} theme={theme} dismissDisabled={dismissDisabled} footer={footer} testID={testID}>
    {children}
  </SharedDialog>;
}

/** Retain the selected row until dismissal has restored the trigger's focus. */
export function useMonitoringDialog<T>() {
  const [selection, setSelection] = useState<{ value: T; visible: boolean }>();
  const triggers = useRef(new Map<string, DialogControl>());
  const active = useRef<{ key: string; closing: boolean } | null>(null);
  const returnFocusRef = useRef<DialogControl>(null);
  return {
    selection, returnFocusRef,
    trigger: (key: string): Ref<DialogControl> => node => {
      if (node) triggers.current.set(key, node);
      else triggers.current.delete(key);
      if (active.current?.key === key) returnFocusRef.current = node;
    },
    open(value: T, key: string) {
      if (active.current) return false;
      active.current = { key, closing: false };
      returnFocusRef.current = triggers.current.get(key) ?? null;
      setSelection({ value, visible: true });
      return true;
    },
    close() {
      if (!active.current || active.current.closing) return false;
      active.current.closing = true;
      setSelection(current => current && { ...current, visible: false });
      return true;
    },
    clear() {
      if (!active.current?.closing) return;
      active.current = null;
      returnFocusRef.current = null;
      setSelection(undefined);
    },
  };
}

export function List({ children }: { children: ReactNode }) {
  const { colors } = useMonitoringUi();
  return <View style={[styles.list, { borderColor: colors.border }]}>{children}</View>;
}

export function ActionRow({ label, detail, value, icon, rank, selected, onPress, testID, focusRef }: {
  label: string; detail?: string | null; value?: string | number; icon?: string;
  rank?: number; selected?: boolean; onPress?: () => void; testID?: string; focusRef?: Ref<DialogControl>;
}) {
  const { colors, theme, t } = useMonitoringUi();
  const rankLabel = rank !== undefined ? t(`Peringkat ${rank}`, `Rank ${rank}`) : undefined;
  const leading = icon ? (
    <View style={[styles.iconTile, { backgroundColor: colors.muted + "aa" }]}>
      <MonitoringIcon icon={icon} color={colors.primary} />
    </View>
  ) : rank !== undefined ? <Body small muted>{rank}</Body> : undefined;
  const trailing = value !== undefined ? <Text style={[styles.rowValue, { color: colors.foreground }]}>{value}</Text>
      : selected ? <NavigationIcon name="check" size={16} color={colors.primary} />
    : onPress && !icon ? <NavigationIcon name="chevron-right" size={16} color={colors.mutedForeground} /> : undefined;
  return (
    <View style={[styles.rowDivider, { borderColor: colors.border }]}>
      <NativeListRow layout="compact" density="dense" theme={theme} title={label} subtitle={detail ?? undefined}
        leading={leading} leadingAccessibilityLabel={onPress ? undefined : rankLabel} trailing={trailing} testID={testID} primaryRef={focusRef}
        primary={onPress && { onPress, role: icon ? "link" : "button", selected,
          label: [rankLabel, label, detail, value].filter(item => item !== undefined && item !== null && item !== "").join(". ") }} />
    </View>
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

export function isMonitoringAccessError(error: unknown): boolean {
  return error instanceof MonitoringError && (error.status === 401 || error.status === 403);
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
  if (loading) return <View testID="operations-loading" accessibilityRole="progressbar" accessibilityLabel={t("Memuat", "Loading")} style={styles.section}>
    <Skeleton theme={theme} style={{ width: "45%", height: 18 }} />
    <Skeleton theme={theme} style={{ width: "100%", height: 54 }} />
    <Skeleton theme={theme} style={{ width: "100%", height: 54 }} />
  </View>;
  const failure = status === 409 ? t("Data telah berubah. Tinjau revisi terbaru.", "Data changed. Review the latest revision.")
    : status === 429 ? t("Pengukuran latensi dibatasi sekali setiap 3 jam.", "Latency can be measured once every 3 hours.")
    : status === 422 ? t("Periksa pilihan dan urutan model.", "Check the selected models and their order.")
    : t("Gagal memuat data.", "Unable to load data.");
  if (error) return <View accessibilityRole="alert" style={styles.section}>
    <Body error>{message ?? failure}</Body>
    {retry && <View style={styles.actions}><Control label={t("Coba lagi", "Retry")} onPress={retry} /></View>}
  </View>;
  return null;
}

type ChartPoint = { label: string; values: number[] };
export function TrendChart({ points, series, empty, stacked, secondary, seriesColors, webAnalytics }: {
  points: ChartPoint[]; series: string[]; empty: string; stacked?: boolean; secondary?: boolean;
  seriesColors?: string[]; webAnalytics?: boolean;
}) {
  const { colors, n, t } = useMonitoringUi();
  const [selected, setSelected] = useState<number>();
  const [measuredWidth, setMeasuredWidth] = useState(340);
  const palette = seriesColors ?? (webAnalytics
    ? [colors.brandPrimary, nativeLinkInks["tertiary-1"]]
    : [colors.primary, "#33c1a5", colors.secondary]);
  if (!points.length || (stacked && points.every(point => point.values.every(value => !value)))) return <Body muted>{empty}</Body>;
  const active = selected === undefined ? undefined : points[selected];
  const width = webAnalytics ? measuredWidth : 340;
  const height = webAnalytics ? 200 : 196;
  const left = webAnalytics ? 40 : 36;
  const right = width - (secondary ? 32 : webAnalytics ? 10 : 12);
  const top = webAnalytics ? 10 : 16;
  const baseline = webAnalytics ? 169 : 165;
  const secondaryIndex = secondary ? series.length - 1 : -1;
  const primaryTotal = (point: ChartPoint) => stacked
    ? point.values.reduce((sum, value, index) => index === secondaryIndex ? sum : sum + value, 0)
    : Math.max(...point.values);
  const axisMax = (values: number[]) => {
    const peak = Math.max(1, ...values);
    const magnitude = Math.pow(10, Math.floor(Math.log10(peak)));
    return Math.ceil(peak / magnitude) * magnitude;
  };
  const totals = points.map(primaryTotal);
  const webTicks = webAnalytics ? webAnalyticsTicks(Math.max(...totals)) : undefined;
  const max = webTicks?.at(-1) ?? axisMax(totals);
  const secondMax = secondary ? axisMax(points.map(point => point.values[secondaryIndex])) : 0;
  const chartWidth = right - left;
  const barWidth = Math.min(secondary ? 22 : 24, chartWidth / points.length / (secondary ? 2.3 : 1.3));
  const x = (index: number) => stacked ? left + chartWidth * (index + 0.5) / points.length
    : points.length === 1 ? (left + right) / 2 : left + chartWidth * index / (points.length - 1);
  const y = (value: number, scale = max) => baseline - (baseline - top) * value / scale;
  const numericTicks = webTicks ?? [0, 1, 2, 3].map(index => max * index / 3);
  const dateTicks = webAnalytics
    ? webAnalyticsDateTicks(points.map(point => point.label), left, right)
    : [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].map(index => ({ index, x: x(index) }));
  return <View style={styles.section}>
    <View accessible accessibilityLabel={`${series.join(", ")}. ${active?.label ?? `${points[0].label} ${t("sampai", "to")} ${points.at(-1)?.label}`}`}
      onLayout={webAnalytics ? event => setMeasuredWidth(event.nativeEvent.layout.width) : undefined}
      accessibilityRole="adjustable" accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      accessibilityValue={active ? { text: active.values.map((value, index) => `${series[index]} ${n(value)}`).join(", ") } : undefined}
      onAccessibilityAction={event => {
        setSelected(previous => event.nativeEvent.actionName === "increment"
          ? Math.min(points.length - 1, (previous ?? -1) + 1)
          : Math.max(0, (previous ?? 1) - 1));
      }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {numericTicks.map(value => <Line key={value} x1={left} y1={y(value)} x2={right} y2={y(value)}
          stroke={colors.border} opacity={webAnalytics ? 0.5 : 1} strokeDasharray="3 3" />)}
        {numericTicks.map(value => <SvgText key={value} x={left - 5} y={y(value) + 4} textAnchor="end"
          fill={colors.mutedForeground} fontSize={webAnalytics ? 12 : 10}>
          {value >= 1000 ? `${webAnalytics ? (value / 1000).toFixed(1) : n(value / 1000)}k` : webAnalytics ? value : n(value)}
        </SvgText>)}
        {dateTicks.map(({ index, x }) => <SvgText key={index} x={x} y={webAnalytics ? 194 : 188}
          textAnchor={webAnalytics || points.length === 1 ? "middle" : index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
          fill={colors.mutedForeground} fontSize={webAnalytics ? 12 : 11}>{points[index].label}</SvgText>)}
        {secondary && [0, 1, 2, 3].map(index => {
          const value = Math.round(secondMax * index / 3);
          return <SvgText key={index} x={right + 5} y={y(value, secondMax) + 4} fill={colors.mutedForeground} fontSize="10">
            {n(value)}
          </SvgText>;
        })}
        {stacked ? points.flatMap((point, pointIndex) => {
          let bottom = 0;
          return point.values.map((value, index) => {
            const secondAxis = index === secondaryIndex;
            const upper = y(secondAxis ? value : bottom + value, secondAxis ? secondMax : max);
            const lower = secondAxis ? baseline : y(bottom);
            if (!secondAxis) bottom += value;
            const center = x(pointIndex) + (secondary ? (secondAxis ? barWidth / 2 + 1 : -barWidth / 2 - 1) : 0);
            return <Rect key={`${pointIndex}:${index}`} x={center - barWidth / 2} y={upper} width={barWidth}
              height={Math.max(0, lower - upper)} fill={palette[index]} />;
          });
        }) : series.map((name, index) => {
          const coordinates = points.map((point, pointIndex) => ({ x: x(pointIndex), y: y(point.values[index]) }));
          const path = webAnalytics ? monotonePath(coordinates)
            : coordinates.map((point, pointIndex) => `${pointIndex ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
          return <Path key={name} d={path} stroke={palette[index]} strokeWidth={webAnalytics ? 3 : 2.5}
            strokeDasharray={index === 1 ? "4 4" : undefined} fill="none" />;
        })}
        {selected !== undefined && active ? <Line x1={x(selected)} x2={x(selected)} y1={top} y2={baseline} stroke={colors.mutedForeground} strokeDasharray="4 4" /> : null}
        {!stacked && (active && selected !== undefined ? active : points.length === 1 ? points[0] : undefined)?.values.map((_, index) => {
          const pointIndex = selected ?? 0;
          return <Circle key={series[index]} cx={x(pointIndex)} cy={y(points[pointIndex].values[index])}
            r={4} fill={palette[index]} stroke={colors.background} strokeWidth={1.5} />;
        })}
      </Svg>
      <View style={styles.chartTouch}>
        {[...points.keys()].map(index => <Pressable key={index} accessible={false} onPress={() => setSelected(index)} style={styles.chartTarget} />)}
      </View>
    </View>
    <View style={styles.legend}>
      {(webAnalytics ? [1, 0] : [...series.keys()]).map(index => <View key={series[index]} style={styles.legendItem}>
        {webAnalytics ? <Svg width={16} height={8}>
          <Line x1={0} y1={4} x2={16} y2={4} stroke={palette[index]} strokeWidth={2} strokeDasharray={index === 1 ? "4 4" : undefined} />
        </Svg> : <View style={[styles.swatch, { backgroundColor: palette[index % palette.length] }]} />}
        <Body small>{series[index]}</Body>
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
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
  rowValue: { ...nativeTypography.bodyMedium, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"], maxWidth: "45%", textAlign: "right" },
  iconTile: { width: 32, height: 32, borderRadius: nativeRadii.md, alignItems: "center", justifyContent: "center" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 12 },
  stat: { flexGrow: 1, flexBasis: 100, gap: 3, paddingVertical: 5 },
  statValue: { fontSize: 20, lineHeight: 27, fontVariant: ["tabular-nums"], includeFontPadding: false },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  chartTouch: { position: "absolute", inset: 0, flexDirection: "row", marginLeft: 34, marginRight: 10 },
  chartTarget: { flex: 1 },
});
