import { useState } from "react";
import { View } from "react-native";
import {
  featureKeys, filterAiRequests,
  type FeatureKey, type MonitoringActions, type MonitoringRange, type MonitoringReader,
} from "../../../../../packages/native-parity/operations/monitoring-contract";
import { ActionRow, Body, Control, Heading, List, RangeSelect, ReadState, Section, Stats, TrendChart, styles, useMonitoringRead, useMonitoringUi, isMonitoringAccessError } from "./ui";
import { useMonitoringAction } from "./mutation";

export function HomeDashboardScreen({ reader, actions, navigate }: {
  reader: MonitoringReader; actions?: MonitoringActions; navigate: (href: string) => void;
}) {
  const view = useMonitoringRead(reader, { view: "home" });
  const sync = useMonitoringAction();
  const { t } = useMonitoringUi();
  if (!view.data) return <ReadState {...view} retry={view.reload} />;
  return <>
    {actions?.syncAnalytics && <View style={styles.actions}>
      <Control label={t("Segarkan analitik", "Refresh analytics")} busy={sync.busy}
        onPress={() => { void sync.run(actions.syncAnalytics!, view.reload); }} />
    </View>}
    <ReadState error={sync.error} />
    {view.data.failedJobs > 0 && <View accessibilityRole="alert" style={styles.section}>
      <Body strong error>{t(`${view.data.failedJobs} generasi soal gagal`, `${view.data.failedJobs} question generations failed`)}</Body>
      <View style={styles.actions}><Control label={t("Tinjau generasi", "Review generations")} link onPress={() => navigate("/admin/jobs")} /></View>
    </View>}
    {view.data.categories.map(category => <Section key={category.name} title={category.name}>
      <List>
        {category.items.map(item => <ActionRow key={item.href} icon={item.iconKey} label={item.title} detail={item.stat}
          testID={item.href === "/admin/ops/web-analytics" ? "operations-admin-home-web-analytics" : undefined}
          onPress={() => navigate(item.href)} />)}
      </List>
    </Section>)}
  </>;
}

export function WebAnalyticsScreen({ reader, actions, navigate }: {
  reader: MonitoringReader; actions?: MonitoringActions; navigate: (href: string) => void;
}) {
  const view = useMonitoringRead(reader, { view: "web" });
  const sync = useMonitoringAction();
  const { t, date, n } = useMonitoringUi();
  const views = t("Tampilan halaman", "Page views");
  const metrics = view.data;
  if (isMonitoringAccessError(view.error)) return <ReadState error={view.error} />;
  return <>
    <View style={styles.actions}>
      <Control label={t("Data offline", "Offline data")} link onPress={() => navigate("/admin/ops/offline")} />
      <Control label={t("Muat ulang", "Reload")} busy={view.refreshing || sync.busy} onPress={() => {
        if (actions?.syncAnalytics) void sync.run(actions.syncAnalytics, view.reload);
        else view.reload();
      }} testID="operations-web-analytics-refresh" />
    </View>
    <ReadState error={sync.error} />
    {view.error || view.loading ? <ReadState {...view} retry={view.reload} /> : metrics === null
      ? <Section title={t("Data tidak tersedia", "Data unavailable")}>
          <Body muted>{t("Gagal mengambil data dari Google Analytics 4. Periksa kredensial service account dan GA_PROPERTY_ID.", "Could not load Google Analytics 4 data. Check the service account credentials and GA_PROPERTY_ID.")}</Body>
        </Section>
      : metrics && <>
          <Stats items={[
            { label: views, value: metrics.summary.views },
            { label: t("Pengguna aktif", "Active users"), value: metrics.summary.activeUsers },
            { label: t("Total sesi", "Total sessions"), value: metrics.summary.sessions },
          ]} />
          <Section title={t("Tren pengunjung", "Visitor trends")}>
            <TrendChart points={metrics.dailyData.map(point => ({ label: date(point.date, true), values: [point.views, point.sessions] }))}
              series={[views, t("Sesi", "Sessions")]} empty={t("Belum ada lalu lintas harian", "No daily traffic yet")} webAnalytics />
          </Section>
          <Section>
            <View style={styles.header}>
              <Heading section>{t("Halaman terpopuler", "Top pages")}</Heading>
              {metrics.topPages.length ? <Body small muted>{views}</Body> : null}
            </View>
            {metrics.topPages.length ? <List>{metrics.topPages.map((page, index) =>
              <ActionRow key={`${page.path}:${page.title}:${index}`} rank={index + 1} label={page.title || page.path}
                detail={page.title && page.title !== page.path ? page.path : undefined} value={n(page.views)} />)}</List> :
              <Body muted>{t("Belum ada halaman terpopuler", "No top pages yet")}</Body>}
          </Section>
        </>}
  </>;
}

function featureLabel(key: string, fallback: string, t: (id: string, en: string) => string) {
  const labels: Record<string, [string, string]> = {
    materi: ["Materi", "Materials"], flashcard: ["Flashcard", "Flashcards"], kuis: ["Kuis mandiri", "Self-paced quizzes"],
    tryout: ["Tryout", "Tryouts"], kuisLive: ["Kuis live", "Live quizzes"], zyra: ["Zyra Chat", "Zyra Chat"],
    diskusi: ["Diskusi", "Discussions"], tutorial: ["Sesi tutorial", "Tutorial sessions"],
  };
  return labels[key] ? t(...labels[key]) : fallback;
}

function featureDetail(key: string, count: number, t: (id: string, en: string) => string) {
  const values: Record<string, [string, string]> = {
    materi: [`${count} bagian selesai`, `${count} sections completed`],
    flashcard: ["Ulasan kartu belajar (kanonik & legacy)", "Flashcard reviews (canonical and legacy)"],
    kuis: [`${count} percobaan selesai`, `${count} attempts completed`],
    tryout: [`${count} dinilai atau selesai`, `${count} graded or completed`],
    kuisLive: ["Hasil kuis live yang selesai", "Finished live quiz results"],
    zyra: [`${count} sesi baru`, `${count} new sessions`],
    diskusi: [`${count} pertanyaan baru`, `${count} new questions`],
    tutorial: [`${count} sesi selesai`, `${count} sessions completed`],
  };
  return values[key] ? t(...values[key]) : "";
}

export function FeatureUsageScreen({ reader, navigate, initialRange = 30 }: {
  reader: MonitoringReader; navigate: (href: string) => void; initialRange?: MonitoringRange;
}) {
  const [range, setRange] = useState(initialRange);
  const view = useMonitoringRead(reader, { view: "features", range });
  const { t, date, n, colors, theme } = useMonitoringUi();
  const empty = t("Belum ada aktivitas pada rentang waktu ini.", "No activity in this time range yet.");
  const metrics = view.data;
  const labels = (key: string) => featureLabel(key, key, t);
  const chartKeys = featureKeys.filter(key => metrics?.daily.some(point => point[key] > 0));
  const chartColors: Record<FeatureKey, string> = {
    materi: colors.primary, flashcard: "#33c1a5", kuis: "#c34c22", tryout: "#2f80ed",
    kuisLive: "#e2b93b", zyra: "#27ae60", diskusi: theme === "dark" ? "#c34c22" : "#68bbf3",
    tutorial: theme === "dark" ? "#bdbdbd" : "#ffc15e",
  };
  const trend = (value: number | null) => value === null ? "-" : `${value > 0 ? "+" : ""}${n(value)}%`;
  return <>
    <RangeSelect value={range} onChange={setRange} />
    {view.error || view.loading ? <ReadState {...view} retry={view.reload} /> : metrics && <>
      <Stats items={[
        { label: t("Total aktivitas", "Total activity"), value: metrics.totals.events },
        { label: t("Murid aktif unik", "Unique active learners"), value: metrics.totals.activeUsers },
        { label: t("Rata-rata per murid", "Average per learner"), value: metrics.totals.activeUsers ? metrics.totals.events / metrics.totals.activeUsers : 0 },
        { label: t("Fitur teratas", "Top feature"), value: metrics.totals.topFeatureKey ? labels(metrics.totals.topFeatureKey) : "-" },
      ]} />
      <Section title={t("Aktivitas harian", "Daily activity")}>
        <TrendChart key={range} points={metrics.daily.map(point => ({ label: date(point.date, true), values: chartKeys.map(key => point[key]) }))}
          series={chartKeys.map(labels)} seriesColors={chartKeys.map(key => chartColors[key])} empty={empty} stacked />
      </Section>
      {(metrics.insights.fastestGrowing || metrics.insights.highestAdoption || metrics.insights.needsAttention) && (
        <Section title={t("Sorotan penggunaan", "Usage highlights")}>
          <List>
            {metrics.insights.fastestGrowing && <ActionRow label={labels(metrics.insights.fastestGrowing.key)}
              detail={t("Pertumbuhan tercepat", "Fastest growth")} value={trend(metrics.insights.fastestGrowing.trendPercent)} />}
            {metrics.insights.highestAdoption && <ActionRow label={labels(metrics.insights.highestAdoption.key)}
              detail={t("Adopsi tertinggi", "Highest adoption")} value={`${metrics.insights.highestAdoption.adoptionPercent}%`} />}
            {metrics.insights.needsAttention && <ActionRow label={labels(metrics.insights.needsAttention.key)}
              detail={t("Adopsi terendah", "Lowest adoption")} value={`${metrics.insights.needsAttention.adoptionPercent}%`} />}
          </List>
        </Section>
      )}
      <Section title={t("Rincian fitur", "Feature details")}>
        <List>
          {metrics.rows.map(row => <ActionRow key={row.key} label={featureLabel(row.key, row.label, t)}
            detail={[
              featureDetail(row.key, row.detailCount ?? 0, t),
              t(`${n(row.users)} murid · ${row.adoptionPercent}% adopsi · ${n(row.eventsPerUser)} per murid`, `${n(row.users)} learners · ${row.adoptionPercent}% adoption · ${n(row.eventsPerUser)} per learner`),
              row.lastUsedAt ? date(row.lastUsedAt, true) : null,
            ].filter(Boolean).join("\n")}
            value={`${n(row.events)} · ${trend(row.trendPercent)}`} />)}
        </List>
      </Section>
      <View style={styles.actions}>
        <Control link label={t("Analitik web", "Web Analytics")} onPress={() => navigate("/admin/ops/web-analytics")} />
        <Control link label={t("Analitik Zyra", "Zyra analytics")} onPress={() => navigate("/admin/ops/analytics")} />
      </View>
    </>}
  </>;
}

const pageSize = 15;

export function AiAnalyticsScreen({ reader }: { reader: MonitoringReader }) {
  const view = useMonitoringRead(reader, { view: "ai" }, 30_000);
  const [filter, setFilter] = useState<"all" | "failed" | "gateway">("all");
  const [page, setPage] = useState(0);
  const { t, n, date } = useMonitoringUi();
  const stats = view.data;
  const rows = stats ? filterAiRequests(stats.recentLogs, filter) : [];
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visiblePage = Math.min(page, pageCount - 1);
  const success = t("Berhasil", "Successful");
  const failure = t("Gagal", "Failed");
  const gateway = "Gateway";
  const direct = t("Langsung", "Direct");
  const latency = (milliseconds: number) => milliseconds >= 1000 ? `${n(milliseconds / 1000)} s` : `${n(milliseconds)} ms`;
  const modelCounts = new Map<string, { count: number; successes: number }>();
  for (const row of stats?.recentLogs ?? []) {
    const name = row.model || t("Tidak diketahui", "Unknown");
    const item = modelCounts.get(name) ?? { count: 0, successes: 0 };
    item.count += 1;
    item.successes += Number(row.success);
    modelCounts.set(name, item);
  }

  if (isMonitoringAccessError(view.error)) return <ReadState error={view.error} />;
  return <>
    <View style={styles.actions}><Control label={t("Muat ulang", "Reload")} busy={view.refreshing}
      onPress={view.reload} /></View>
    {view.loading || view.error ? <ReadState {...view} retry={view.reload} /> : stats?.totalRequests ? <>
      <Body small muted>{t("Sampel hingga 500 panggilan terakhir pada proses server ini.", "Sample of up to the last 500 calls in this server process.")}</Body>
      <Stats items={[
        { label: t("Total permintaan", "Total requests"), value: stats.totalRequests },
        { label: success, value: stats.successfulRequests },
        { label: failure, value: stats.failedRequests },
        { label: t("Latensi rata-rata", "Average latency"), value: latency(stats.averageLatencyMs) },
      ]} />
      <Section title={t("Mode perutean", "Routing mode")}>
        <List>
          <ActionRow label={gateway} value={n(stats.gatewayRequests)} detail={`${stats.gatewaySuccessRate}% ${success.toLowerCase()}`} />
          <ActionRow label={direct} value={n(stats.directRequests)} detail={`${stats.directSuccessRate}% ${success.toLowerCase()}`} />
        </List>
      </Section>
      <Section title={t("Model aktif", "Active models")}>
        <List>{[...modelCounts].sort(([, first], [, second]) => second.count - first.count).map(([name, model]) =>
          <ActionRow key={name} label={name} detail={`${n(model.count)} ${t("permintaan", "requests")}`} value={`${Math.round(model.successes / model.count * 100)}%`} />
        )}</List>
      </Section>
      <Section title={t("Permintaan terbaru", "Recent requests")}>
        <View style={styles.actions}>
          {([{ key: "all", label: t("Semua", "All") }, { key: "failed", label: failure }, { key: "gateway", label: gateway }] as const).map(item =>
            <Control key={item.key} label={item.label} selected={filter === item.key} onPress={() => { setFilter(item.key); setPage(0); }} />)}
        </View>
        {rows.length ? <>
          <List>{rows.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map((row, index) =>
            <ActionRow key={`${row.timestamp}:${index}`} label={row.model} value={row.success ? success : failure}
              detail={`${date(row.timestamp)} · ${row.operation} · ${row.viaGateway ? gateway : direct} · ${latency(row.latencyMs)}`} />
          )}</List>
          <Pagination previous={visiblePage > 0 ? () => setPage(visiblePage - 1) : undefined}
            next={visiblePage + 1 < pageCount ? () => setPage(visiblePage + 1) : undefined} />
        </> : <Body muted>{t("Belum ada permintaan pada filter ini", "No matching requests")}</Body>}
      </Section>
    </> : <Section title={t("Belum ada permintaan model yang tercatat", "No recorded model requests yet")}>
      <Body muted>{t("Statistik terkumpul selama proses server berjalan.", "Statistics accumulate while this server process is running.")}</Body>
    </Section>}
    <AiUsageSection reader={reader} />
  </>;
}

function AiUsageSection({ reader }: { reader: MonitoringReader }) {
  const [range, setRange] = useState<MonitoringRange>(30);
  const [page, setPage] = useState(0);
  const usage = useMonitoringRead(reader, { view: "usage", range });
  const { t, date, n, colors } = useMonitoringUi();
  const view = usage.data;
  const lastPage = Math.max(0, Math.ceil((view?.users.length ?? 0) / pageSize) - 1);
  const visiblePage = Math.min(page, lastPage);
  return <Section title={t("Penggunaan Zyra (Token & Request)", "Zyra usage (tokens and requests)")}>
    <RangeSelect value={range} onChange={value => { setRange(value); setPage(0); }} />
    {usage.loading || usage.error ? <ReadState {...usage} retry={usage.reload} /> : view && <>
      <Section title={t("Tren penggunaan harian", "Daily usage trend")}>
        <TrendChart key={range} points={view.daily.map(point => ({ label: date(point.date, true), values: [point.inputTokens, point.outputTokens, point.requests] }))}
          series={[t("Token masukan", "Input tokens"), t("Token keluaran", "Output tokens"), t("Total permintaan", "Total requests")]}
          seriesColors={[colors.primary, "#c34c22", "#2f80ed"]}
          empty={t("Belum ada data harian.", "No daily data yet.")} stacked secondary />
      </Section>
      <Section title={t("Penggunaan per pengguna", "Usage by user")}>
        {view.users.length ? <>
          <List>{view.users.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map(user =>
            <ActionRow key={user.userId} label={user.name ?? user.email ?? t("Pengguna tidak diketahui", "Unknown user")}
              detail={[user.name ? user.email : null,
                t(`${n(user.requests)} permintaan · ${n(user.inputTokens)} token masukan · ${n(user.outputTokens)} token keluaran`,
                  `${n(user.requests)} requests · ${n(user.inputTokens)} input tokens · ${n(user.outputTokens)} output tokens`)].filter(Boolean).join(" · ")}
              value={`${n(user.totalTokens)} ${t("token", "tokens")}`} />
          )}</List>
          <Pagination previous={visiblePage > 0 ? () => setPage(visiblePage - 1) : undefined}
            next={visiblePage < lastPage ? () => setPage(visiblePage + 1) : undefined} />
        </> : <Body muted>{t("Belum ada penggunaan pada rentang waktu ini.", "No usage in this time range yet.")}</Body>}
      </Section>
    </>}
  </Section>;
}

export function Pagination({ previous, next, busy }: { previous?: () => void; next?: () => void; busy?: boolean }) {
  const { t } = useMonitoringUi();
  if (!previous && !next) return null;
  return <View style={styles.actions}>
    <Control label={t("Sebelumnya", "Previous")} disabled={!previous || busy} onPress={previous ?? (() => {})} />
    <Control label={t("Berikutnya", "Next")} disabled={!next || busy} onPress={next ?? (() => {})} />
  </View>;
}
