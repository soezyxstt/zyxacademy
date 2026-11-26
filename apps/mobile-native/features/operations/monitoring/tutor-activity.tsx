import { useState } from "react";
import { View } from "react-native";
import { Input } from "../../../components/Input";
import {
  activityOutcomes,
  type ActivityCursor, type ActivityFilters, type ActivityOutcome, type MonitoringReader,
} from "../../../../../packages/native-parity/operations/monitoring-contract";
import { ActionRow, Body, Control, Dialog, List, Options, ReadState, Section, Stats, styles, useMonitoringRead, useMonitoringUi } from "./ui";
import { Pagination } from "./analytics";

function useOutcomeLabels(): Record<ActivityOutcome, string> {
  const { t } = useMonitoringUi();
  return {
    all: t("Semua status", "All statuses"), success: t("Sukses", "Success"),
    rejected: t("Ditolak", "Rejected"), failed: t("Gagal", "Failed"), unclassified: t("Tercatat", "Recorded"),
  };
}

const defaultFilters: ActivityFilters = { limit: 25 };

export function TutorActivityScreen({ reader }: { reader: MonitoringReader }) {
  const [filters, setFilters] = useState<ActivityFilters>(defaultFilters);
  const [draft, setDraft] = useState<ActivityFilters>(defaultFilters);
  const [cursorHistory, setCursorHistory] = useState<ActivityCursor[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const view = useMonitoringRead(reader, { view: "tutor", filters, cursor: cursorHistory.at(-1) ?? null });
  const { t, date, n, theme } = useMonitoringUi();
  const outcomes = useOutcomeLabels();
  const value = view.data;
  const options = value?.options;
  const activeFilterCount = Object.entries(filters).filter(([key, value]) =>
    key === "limit" ? value !== 25 : value && value !== "all").length;
  const draftDates = [draft.startDate, draft.endDate].filter(Boolean) as string[];
  const invalidDates = draftDates.some(value => !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    || Boolean(draft.startDate && draft.endDate && draft.startDate > draft.endDate);
  const updating = <K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) =>
    setDraft(previous => ({ ...previous, [key]: value }));
  const apply = (next: ActivityFilters) => {
    setCursorHistory([]);
    setFilters(next);
    setDraft(next);
    setFilterOpen(false);
  };

  return <>
    <View style={styles.actions}>
      <Control label={activeFilterCount ? t(`Filter, ${activeFilterCount} aktif`, `Filter, ${activeFilterCount} active`) : t("Filter", "Filter")}
        disabled={!options} onPress={() => { setDraft(filters); setFilterOpen(true); }} testID="operations-tutor-filters" />
      {activeFilterCount > 0 && <Control label={t("Reset", "Reset")} onPress={() => apply(defaultFilters)} />}
    </View>
    {view.loading || view.error ? <ReadState {...view} retry={view.reload} /> : value && <>
      <Stats items={[
        { label: t("Total aktivitas", "Total activity"), value: value.stats.total },
        { label: outcomes.success, value: value.stats.success },
        { label: outcomes.rejected, value: value.stats.rejected },
        { label: outcomes.failed, value: value.stats.failed },
      ]} />
      {value.page.items.length ? <>
        <List>
          {value.page.items.map(item => <ActionRow key={item.id} label={item.actorName ?? item.actorEmail ?? t("Sistem / Anonim", "System / Anonymous")}
            detail={`${item.courseTitle ?? t("Lintas kursus", "Cross-course")} · ${item.entityType} · ${item.action} · ${date(item.createdAt)}`}
            value={outcomes[item.outcome]} onPress={() => setDetailId(item.id)} />)}
        </List>
        <Body small muted>{t(`Menampilkan ${n(value.page.items.length)} aktivitas`, `Showing ${n(value.page.items.length)} activities`)}</Body>
      </> : <Section title={t("Tidak ada log aktivitas", "No activity logs")}>
        <Body muted>{t("Belum ada catatan aktivitas tutor yang sesuai dengan filter pencarian.", "No tutor activity matches the filters.")}</Body>
      </Section>}
      <Pagination busy={view.loading}
        previous={cursorHistory.length ? () => setCursorHistory(history => history.slice(0, -1)) : undefined}
        next={value.page.nextCursor ? () => { const next = value.page.nextCursor!; setCursorHistory(history => [...history, next]); } : undefined} />
    </>}
    {options && <Dialog title={t("Filter aktivitas tutor", "Filter tutor activity")} visible={filterOpen} onClose={() => setFilterOpen(false)}>
      <Options label={t("Tutor", "Tutor")} value={draft.actorId ?? ""}
        items={[{ value: "", label: t("Semua tutor", "All tutors") }, ...options.tutors.map(item => ({ value: item.id, label: item.name || item.email }))]}
        onSelect={value => updating("actorId", value || undefined)} />
      <Options label={t("Mata kuliah", "Course")} value={draft.courseId ?? ""}
        items={[{ value: "", label: t("Semua kelas", "All courses") }, ...options.courses.map(item => ({ value: item.id, label: item.title }))]}
        onSelect={value => updating("courseId", value || undefined)} />
      <Options label={t("Entitas", "Entity")} value={draft.entityType ?? ""}
        items={[{ value: "", label: t("Semua entitas", "All entities") }, ...options.entityTypes.map(value => ({ value, label: value }))]}
        onSelect={value => updating("entityType", value || undefined)} />
      <Options label={t("Aksi", "Action")} value={draft.action ?? ""}
        items={[{ value: "", label: t("Semua aksi", "All actions") }, ...options.actions.map(value => ({ value, label: value }))]}
        onSelect={value => updating("action", value || undefined)} />
      <Options label={t("Status", "Status")} value={draft.outcome ?? "all"}
        items={activityOutcomes.map(value => ({ value, label: outcomes[value] }))}
        onSelect={value => updating("outcome", value === "all" ? undefined : value)} />
      <Options label={t("Per halaman", "Per page")} value={draft.limit ?? 25}
        items={[10, 25, 50, 100].map(value => ({ value, label: String(value) }))}
        onSelect={value => updating("limit", value)} />
      <Body>{t("ID korelasi", "Correlation ID")}</Body>
      <Input accessibilityLabel={t("ID korelasi", "Correlation ID")} value={draft.correlationId ?? ""} autoCapitalize="none" maxLength={256}
        onChangeText={value => updating("correlationId", value)} theme={theme} />
      <Body>{t("Tanggal mulai", "Start date")}</Body>
      <Input accessibilityLabel={t("Tanggal mulai", "Start date")} value={draft.startDate ?? ""} placeholder="YYYY-MM-DD" maxLength={10}
        onChangeText={value => updating("startDate", value || undefined)} theme={theme} />
      <Body>{t("Tanggal selesai", "End date")}</Body>
      <Input accessibilityLabel={t("Tanggal selesai", "End date")} value={draft.endDate ?? ""} placeholder="YYYY-MM-DD" maxLength={10}
        onChangeText={value => updating("endDate", value || undefined)} theme={theme} />
      {invalidDates && <Body error>{t("Gunakan tanggal YYYY-MM-DD dengan rentang yang valid.", "Enter a valid date range in YYYY-MM-DD format.")}</Body>}
      <View style={styles.actions}>
        <Control label={t("Terapkan filter", "Apply filters")} primary disabled={invalidDates}
          onPress={() => apply({ ...draft, correlationId: draft.correlationId?.trim() || undefined })} />
        <Control label={t("Reset", "Reset")} onPress={() => apply(defaultFilters)} />
      </View>
    </Dialog>}
    {detailId && <ActivityDetail key={detailId} id={detailId} reader={reader} onClose={() => setDetailId(undefined)} />}
  </>;
}

function ActivityDetail({ id, reader, onClose }: { id: string; reader: MonitoringReader; onClose: () => void }) {
  const view = useMonitoringRead(reader, { view: "tutorDetail", id });
  const item = view.data;
  const { t, date } = useMonitoringUi();
  const outcome = useOutcomeLabels();
  return <Dialog title={t("Detail log mutasi", "Activity log details")} visible onClose={onClose}>
    {view.loading || view.error ? <ReadState {...view} retry={view.reload} /> : item ? <>
      <List>
        <ActionRow label={t("Waktu kejadian", "Event time")} detail={date(item.createdAt)} />
        <ActionRow label={t("ID log", "Log ID")} detail={item.id} />
        <ActionRow label={t("Aktor", "Actor")} detail={[item.actorName, item.actorEmail, item.actorId].filter(Boolean).join(" · ")} />
        <ActionRow label={t("Entitas", "Entity")} detail={`${item.entityType} · ${item.entityId}`} />
        <ActionRow label={t("Aksi", "Action")} detail={item.action} value={outcome[item.outcome]} />
        {item.correlationId && <ActionRow label={t("ID korelasi", "Correlation ID")} detail={item.correlationId} />}
        {item.reason && <ActionRow label={t("Alasan", "Reason")} detail={item.reason} />}
      </List>
      <Section title={t("Snapshot perubahan", "Change snapshots")}>
        {([["beforeSnapshot", t("Sebelumnya", "Before")], ["afterSnapshot", t("Sesudahnya", "After")]] as const).map(([key, label]) =>
          <Section key={key} title={label}>
            <Body small muted>{item[key] ? JSON.stringify(item[key], null, 2) : t("Tidak ada snapshot", "No snapshot")}</Body>
          </Section>)}
      </Section>
    </> : <Body muted>{t("Catatan aktivitas sudah tidak tersedia.", "This activity record is unavailable.")}</Body>}
  </Dialog>;
}
