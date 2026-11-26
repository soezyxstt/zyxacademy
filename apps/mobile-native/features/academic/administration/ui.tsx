import { useContext, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Checkbox } from "../../../components/Checkbox";
import { CourseTheme, Action, CourseDialog, CourseStatus, DataRow, Field, Ink, layout, useCourseColors } from "../courses/ui";
import { administrationCourses, type RecordIdentity } from "../../../../../packages/native-parity/academic/administration/fixtures";
import { type AdministrationCommand, type AdministrationStore } from "../../../../../packages/native-parity/academic/administration/store";
import type { ReactNode } from "react";

export { Action, CourseDialog, CourseStatus, DataRow, Field, Ink, layout, Metrics, Panel, Picker, SearchBox, Tabs } from "../courses/ui";

export const courseOptions = administrationCourses.map((course) => ({ id: course.id, label: course.title }));
export const courseName = (id: string) => administrationCourses.find((course) => course.id === id)?.title ?? "Semua mata kuliah";
export const courseNames = (ids: string[]) => ids.length ? ids.map(courseName).join(", ") : "Belum ada mata kuliah";
export const numberValue = (value: string) => value.trim() ? Number(value) : NaN;
export const normalSearch = (value: string) => value.toLocaleLowerCase("id-ID").trim();
export const matchWords = (query: string, words: (string | undefined)[]) => !query || words.some((word) => word && normalSearch(word).includes(query));
export const idAndRevision = (record?: RecordIdentity) => record ? { id: record.id, revision: record.revision } : {};
export const changeSelection = <T extends string>(options: readonly T[], value: T) => options.includes(value) ? options.filter((entry) => entry !== value) : [...options, value];
const jakartaDate = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });
const jakartaDateTime = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const dateLabel = (value: string) => value ? jakartaDate.format(new Date(value)) : "Tanggal belum tersedia";
export const dateTimeLabel = (value: string) => value ? `${jakartaDateTime.format(new Date(value))} WIB` : "Waktu belum tersedia";

export function splitDateTime(value: string) {
  if (!value) return { date: "", time: "" };
  const jakarta = new Date(Date.parse(value) + 7 * 60 * 60 * 1000).toISOString();
  return { date: jakarta.slice(0, 10), time: jakarta.slice(11, 16) };
}

export function combineDateTime(date: string, time: string) {
  if (!date && !time) return "";
  return `${date.trim()}T${time.trim()}:00+07:00`;
}

export function TimeFields({ label, date, time, setDate, setTime }: {
  label: string; date: string; time: string; setDate(value: string): void; setTime(value: string): void;
}) {
  return (
    <View style={[layout.row, { alignItems: "flex-start" }]}>
      <View style={{ flex: 1, minWidth: 120 }}><Field label={`Tanggal ${label}`} placeholder="2026-11-26" value={date} onChangeText={setDate} autoCorrect={false} maxLength={10} /></View>
      <View style={{ flex: 1, minWidth: 120 }}><Field label={`Jam ${label} (WIB)`} placeholder="13:30" value={time} onChangeText={setTime} autoCorrect={false} maxLength={5} /></View>
    </View>
  );
}

export function AdministrationPage({ title, back, backLabel = "Kembali", children }: {
  title: string; back(): void; backLabel?: string; children: ReactNode;
}) {
  const palette = useCourseColors();
  return <ScrollView style={{ flex: 1, backgroundColor: palette.background }} contentContainerStyle={layout.page} keyboardShouldPersistTaps="handled">
    <View style={layout.group}>
      <View style={{ alignSelf: "flex-start" }}><Action label={backLabel} onPress={back} variation="ghost" testID="academic-administration-back" /></View>
      <Ink kind="title">{title}</Ink>
    </View>
    {children}
  </ScrollView>;
}

export function MultiChoice<T extends string>({ label, options, chosen, change, disabled }: {
  label: string; options: readonly { id: T; label: string }[]; chosen: readonly T[]; change(next: T[]): void; disabled?: boolean;
}) {
  const theme = useContext(CourseTheme);
  return <View style={layout.compact}>
    <Ink kind="strong">{label}</Ink>
    {options.map((option) => <Pressable key={option.id} style={[layout.row, { minHeight: 44 }]} aria-label={option.label}
      accessibilityRole="checkbox" accessibilityState={{ checked: chosen.includes(option.id), disabled }}
      disabled={disabled} onPress={() => change(changeSelection(chosen, option.id))}>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Checkbox checked={chosen.includes(option.id)} theme={theme} disabled={disabled} />
      </View>
      <Ink kind="strong">{option.label}</Ink>
    </Pressable>)}
  </View>;
}

export function RecordsEmpty({ filtered = false, label }: { filtered?: boolean; label: string }) {
  return <CourseStatus label={filtered ? "Tidak ada hasil yang cocok." : label} />;
}

export function PagedRows<T extends { id: string }>({ rows, empty, filtered, render }: {
  rows: readonly T[]; empty: string; filtered?: boolean; render(row: T): ReactNode;
}) {
  const [page, setPage] = useState(0);
  if (!rows.length) return <RecordsEmpty filtered={filtered} label={empty} />;
  const lastPage = Math.ceil(rows.length / 10) - 1;
  const current = Math.min(lastPage, page);
  return <View>
    {rows.slice(current * 10, current * 10 + 10).map(render)}
    {lastPage > 0 ? <View style={layout.row}>
      <Action label="Sebelumnya" onPress={() => setPage(current - 1)} disabled={current === 0} />
      <Ink kind="meta">{`Halaman ${current + 1} dari ${lastPage + 1}`}</Ink>
      <Action label="Berikutnya" onPress={() => setPage(current + 1)} disabled={current === lastPage} />
    </View> : null}
  </View>;
}

export function Subheading({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  return <View style={layout.group}>
    <View style={layout.split}><Ink kind="heading">{title}</Ink>{action}</View>
    {children}
  </View>;
}

export function SaveButtons({ onSave, onCancel, saveLabel = "Simpan", busy }: {
  onSave(): void; onCancel(): void; saveLabel?: string; busy?: boolean;
}) {
  return <View style={layout.row}>
    <Action label={saveLabel} onPress={onSave} variation="default" testID="academic-admin-save" disabled={busy} />
    <Action label="Batal" onPress={onCancel} disabled={busy} />
  </View>;
}

type MutationDetails = {
  title?: string; description?: string; confirmLabel?: string; destructive?: boolean;
  success: string; after?(): void; review?: () => ReactNode;
};
type Pending = { command: AdministrationCommand; details: MutationDetails; requestId: string };
type Issue = { kind: "error" | "conflict" | "uncertain"; pending: Pending; message: string; revision?: number; reviewed?: boolean };

export function useAdministrationMutation(store: AdministrationStore) {
  const [confirmation, setConfirmation] = useState<Pending>();
  const [issue, setIssue] = useState<Issue>();
  const [success, setSuccess] = useState("");
  const unresolvedDelivery = store.getSnapshot().pendingDelivery;
  function complete(pending: Pending) {
    setIssue(undefined);
    setConfirmation(undefined);
    setSuccess(pending.details.success);
    pending.details.after?.();
  }
  function apply(pending: Pending) {
    setConfirmation(undefined);
    const result = store.commit(pending.requestId, pending.command);
    if (result.status === "saved") return complete(pending);
    if (result.status === "conflict") setIssue({ kind: "conflict", pending, message: result.message, revision: result.revision });
    else if (result.status === "uncertain") setIssue({ kind: "uncertain", pending, message: result.message });
    else setIssue({ kind: "error", pending, message: result.message });
  }
  return {
    run(command: AdministrationCommand, details: MutationDetails) {
      if (issue?.kind === "uncertain") return;
      setIssue(undefined);
      setSuccess("");
      const pending = { command, details, requestId: store.requestId() };
      if (details.title) setConfirmation(pending);
      else apply(pending);
    },
    blocked: Boolean(unresolvedDelivery),
    feedback: <>
      {success ? <View accessibilityLiveRegion="polite" testID="academic-admin-saved"><Ink>{success}</Ink></View> : null}
      {issue?.kind === "error" ? <View accessibilityLiveRegion="assertive" testID="academic-admin-validation"><Ink tone="error">{issue.message}</Ink></View> : null}
      {confirmation ? <CourseDialog title={confirmation.details.title!} onClose={() => setConfirmation(undefined)}>
        {confirmation.details.description ? <Ink>{confirmation.details.description}</Ink> : null}
        <View style={layout.row}>
          <Action label={confirmation.details.confirmLabel ?? "Lanjutkan"} variation={confirmation.details.destructive ? "destructive" : "default"}
            onPress={() => apply(confirmation)} testID="academic-admin-confirm" />
          <Action label="Batal" onPress={() => setConfirmation(undefined)} />
        </View>
      </CourseDialog> : null}
      {issue?.kind === "conflict" ? <CourseDialog title="Konflik revisi" onClose={() => setIssue(undefined)}>
        <Ink tone="error">{issue.message}</Ink>
        {issue.reviewed ? <>
          <Ink kind="strong">{`Revisi saat ini ${issue.revision}`}</Ink>
          {issue.pending.details.review?.()}
          <View style={layout.row}>
            <Action label="Coba simpan lagi" variation="default" testID="academic-admin-conflict-retry" onPress={() => {
              const command = { ...issue.pending.command, revision: issue.revision } as AdministrationCommand;
              apply({ ...issue.pending, command });
            }} />
            <Action label="Batal" onPress={() => setIssue(undefined)} />
          </View>
        </> : <Action label="Lihat revisi terbaru" onPress={() => setIssue({ ...issue, reviewed: true })} testID="academic-admin-conflict-refresh" />}
      </CourseDialog> : null}
      {issue?.kind === "uncertain" ? <View style={layout.group} accessibilityLiveRegion="assertive">
        <Ink tone="error">{issue.message}</Ink>
        <Action label="Periksa hasil pengiriman" testID="academic-admin-delivery-status" onPress={() => {
          if (store.confirmDelivery(issue.pending.requestId)) complete(issue.pending);
          else apply(issue.pending);
        }} />
      </View> : null}
      {unresolvedDelivery && issue?.kind !== "uncertain" ? <View style={layout.group} accessibilityLiveRegion="assertive">
        <Ink tone="error">Ada pengiriman yang belum dikonfirmasi.</Ink>
        <Action label="Periksa hasil pengiriman" onPress={() => {
          if (store.confirmDelivery(unresolvedDelivery)) setSuccess("Pengiriman tercatat di riwayat.");
        }} />
      </View> : null}
    </>,
  };
}

export function RecordChoices({ rows, selected, onSelect, empty }: {
  rows: readonly { id: string; title: string; description?: string }[];
  selected: string; onSelect(id: string): void; empty: string;
}) {
  return <PagedRows rows={rows} empty={empty} render={(row) =>
    <DataRow key={row.id} title={row.title} description={row.description} detail={selected === row.id ? "Dipilih" : undefined}
      onPress={() => onSelect(row.id)} />
  } />;
}
