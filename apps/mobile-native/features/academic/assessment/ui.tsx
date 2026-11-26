import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Checkbox } from "../../../components/Checkbox";
import { Skeleton } from "../../../components/Skeleton";
import { Switch } from "../../../components/Switch";
import { Action, CourseDialog, CourseTheme, Ink, Picker, layout, useCourseColors } from "../courses/ui";
import type { AssessmentCommand, AssessmentContext, AssessmentGateway, AssessmentResult, MutationEffect } from "../../../../../packages/native-parity/academic/assessment";

export function AssessmentPage({ title, subtitle, back, backLabel = "Kembali", children }: {
  title: string;
  subtitle?: string;
  back(): void;
  backLabel?: string;
  children: ReactNode;
}) {
  const colors = useCourseColors();
  return (
    <ScrollView testID="academic-assessment" keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={layout.page}>
      <View style={[layout.group, styles.header, { borderColor: colors.border }]}>
        <View style={layout.row}><Action label={backLabel} onPress={back} variation="ghost" testID="academic-assessment-back" /></View>
        <View style={layout.compact}>
          <Ink kind="title">{title}</Ink>
          {subtitle ? <Ink kind="meta" tone="muted">{subtitle}</Ink> : null}
        </View>
      </View>
      {children}
    </ScrollView>
  );
}

export function AssessmentNotice({ message, error = false, action }: { message: string; error?: boolean; action?: ReactNode }) {
  return (
    <View accessibilityLiveRegion={error ? "assertive" : "polite"} style={[layout.group, { alignItems: "flex-start" }]}>
      <Ink tone={error ? "error" : "muted"}>{message}</Ink>
      {action}
    </View>
  );
}

export function ReadState<T>({ result, retry, children }: { result: AssessmentResult<T> | null; retry(): void; children(value: T): ReactNode }) {
  const theme = useContext(CourseTheme);
  if (result?.ok) return children(result.value);
  if (result) {
    return <AssessmentNotice error message={result.message} action={result.code === "unavailable"
      ? <Action label="Coba lagi" onPress={retry} testID="academic-assessment-retry" />
      : undefined} />;
  }
  return <View accessible accessibilityLabel="Memuat data penilaian" accessibilityState={{ busy: true }} style={layout.group}>
    <Skeleton theme={theme} style={{ width: "44%", height: 20 }} />
    <Skeleton theme={theme} style={{ width: "100%", height: 56 }} />
    <Skeleton theme={theme} style={{ width: "100%", height: 56 }} />
  </View>;
}

export function SectionRow({ testID, children }: { testID?: string; children: ReactNode }) {
  const colors = useCourseColors();
  return <View testID={testID} style={[styles.row, { borderColor: colors.border }]}>{children}</View>;
}

export function SelectField<T extends string>({ label, options, value, change, testID }: {
  label: string;
  options: Partial<Record<T, string>>;
  value: T;
  change(value: T): void;
  testID?: string;
}) {
  const values = Object.keys(options) as T[];
  return (
    <View style={layout.compact}>
      <Ink kind="strong">{label}</Ink>
      <Picker label={label} options={values.map((id) => ({ id, label: options[id] ?? id }))}
        selected={value} onSelect={(key) => { if (values.includes(key as T)) change(key as T); }} testID={testID} />
    </View>
  );
}

export function FlagField({ label, value, change }: { label: string; value: boolean; change(value: boolean): void }) {
  const theme = useContext(CourseTheme);
  return <View style={styles.switchRow}><Ink>{label}</Ink><Switch theme={theme} checked={value} onCheckedChange={change} accessibilityLabel={label} hitSlop={10} /></View>;
}

export function ChoiceCheck({ label, checked, change, testID }: { label: string; checked: boolean; change(): void; testID?: string }) {
  const theme = useContext(CourseTheme);
  return <View style={styles.checkRow}>
    <Checkbox theme={theme} checked={checked} onCheckedChange={change} accessibilityLabel={label} hitSlop={12} testID={testID} />
    <View style={layout.flex}><Ink>{label}</Ink></View>
  </View>;
}

export function ConfirmAction({ title, message, confirmLabel, confirmTestID, destructive, busy, cancel, confirm, children }: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmTestID?: string;
  destructive?: boolean;
  busy?: boolean;
  cancel(): void;
  confirm(): void;
  children?: ReactNode;
}) {
  return (
    <CourseDialog title={title} onClose={() => { if (!busy) cancel(); }}>
      <Ink>{message}</Ink>
      {children}
      <View style={layout.row}>
        <Action label={confirmLabel} onPress={confirm} disabled={busy} variation={destructive ? "destructive" : "default"} testID={confirmTestID} />
        <Action label="Batal" onPress={cancel} disabled={busy} variation="ghost" />
      </View>
    </CourseDialog>
  );
}

export function Pagination({ page, count, size, change }: { page: number; count: number; size: number; change(page: number): void }) {
  const pageCount = Math.max(1, Math.ceil(count / size));
  if (pageCount < 2) return null;
  return <View style={layout.split}>
    <Action label="Sebelumnya" onPress={() => change(page - 1)} disabled={page === 0} />
    <Ink kind="meta">Halaman {page + 1} dari {pageCount}</Ink>
    <Action label="Berikutnya" onPress={() => change(page + 1)} disabled={page + 1 >= pageCount} />
  </View>;
}

export function useRead<T>(load: (signal: AbortSignal) => Promise<AssessmentResult<T>>) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<AssessmentResult<T> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    void load(controller.signal).then(
      (next) => { if (!controller.signal.aborted) setResult(next); },
      () => { if (!controller.signal.aborted) setResult({ ok: false, code: "unavailable", message: "Data penilaian gagal dimuat." }); },
    );
    return () => controller.abort();
  }, [load, version]);
  return { result, retry: () => { setResult(null); setVersion((value) => value + 1); } };
}

let requestSequence = 0;

export function useMutation(gateway: AssessmentGateway, context: AssessmentContext) {
  const next = useRef<{ id: string; command: AssessmentCommand; finish(effect: MutationEffect): void } | null>(null);
  const busy = useRef(false);
  const live = useRef(true);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Exclude<AssessmentResult<MutationEffect>, { ok: true }> | null>(null);

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  async function run() {
    const request = next.current;
    if (!request || busy.current) return;
    busy.current = true;
    setPending(true);
    setProblem(null);
    let outcome: AssessmentResult<MutationEffect>;
    try {
      outcome = await gateway.mutate(context, request.id, request.command);
    } catch {
      outcome = { ok: false, code: "unavailable", message: "Hasil penyimpanan belum diketahui. Coba lagi." };
    } finally {
      busy.current = false;
    }
    if (!live.current) return;
    setPending(false);
    if (outcome.ok) {
      next.current = null;
      request.finish(outcome.value);
    } else {
      setProblem(outcome);
    }
  }

  return {
    pending,
    problem,
    reset() {
      if (busy.current) return;
      next.current = null;
      setProblem(null);
    },
    send(command: AssessmentCommand, finish: (effect: MutationEffect) => void) {
      if (busy.current) return;
      // A repeated press after a transport failure must reuse the same request.
      if (problem?.code === "unavailable" && next.current && JSON.stringify(next.current.command) === JSON.stringify(command)) {
        void run();
        return;
      }
      next.current = { id: `academic-assessment-${Date.now()}-${++requestSequence}`, command, finish };
      void run();
    },
    retry: run,
  };
}

export function MutationProblem({ mutation, reload }: { mutation: ReturnType<typeof useMutation>; reload?(): void }) {
  if (!mutation.problem) return null;
  const action = mutation.problem.code === "unavailable"
    ? <Action label="Coba lagi" onPress={() => void mutation.retry()} testID="academic-mutation-retry" />
    : mutation.problem.code === "conflict" && reload
      ? <Action label="Muat versi terbaru" onPress={reload} testID="academic-mutation-reload" />
      : undefined;
  return <AssessmentNotice error message={mutation.problem.message} action={action} />;
}

export function dateLabel(iso: string | null): string {
  if (!iso) return "Belum dikumpulkan";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso)) + " WIB";
}

const styles = StyleSheet.create({
  header: { paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 7 },
  switchRow: { minHeight: 44, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  checkRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4 },
});
