import { useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  commaList, difficulties, questionTypes, quizCategories, quizValidationError,
  type BankQuestion, type QuizInput, type QuizSelection, type QuizStatus,
} from "../../../../../packages/native-parity/academic/assessment";
import { addVisibleQuizQuestions, emptyQuizQuestionFilters, filterQuizQuestions, removeVisibleQuizQuestions, unchangedOrEligibleSelection,
  type PickerQuestion, type QuizQuestionFilters,
} from "../../../../../packages/native-parity/academic/assessment/quiz-picker";
import { Action, CourseDialog, Field, Ink, Picker, SearchBox, Tabs, layout } from "../courses/ui";
import { AssessmentNotice, ChoiceCheck, ConfirmAction, FlagField, Pagination, SectionRow, SelectField } from "./ui";

const tabs = [
  { id: "configuration", label: "Pengaturan" },
  { id: "questions", label: "Soal" },
] as const;

type Settings = QuizInput["settings"];
const flags = {
  canGoBack: "Izinkan kembali ke soal sebelumnya",
  requireAllAnswered: "Wajib menjawab semua soal",
  shuffleQuestions: "Acak urutan soal",
  shuffleOptions: "Acak opsi jawaban",
  showScoreImmediate: "Tampilkan nilai setelah dikumpulkan",
} as const satisfies Partial<Record<keyof Settings, string>>;

export interface QuizEditorProps {
  initialValue: QuizInput;
  role: "tutor" | "admin";
  bank: readonly BankQuestion[];
  courseControl?: ReactNode;
  isSaving?: boolean;
  feedback?: ReactNode;
  onSave(input: QuizInput): void;
  onCancel(): void;
}

export function QuizEditor({ initialValue, role, bank, courseControl, isSaving, feedback, onSave, onCancel }: QuizEditorProps) {
  const [input, setInput] = useState(initialValue);
  const [activeTab, setTab] = useState<(typeof tabs)[number]["id"]>("configuration");
  const [validation, setValidation] = useState("");
  const [discard, setDiscard] = useState(false);
  const [duration, setDuration] = useState(initialValue.timeLimitSeconds === null ? "" : String(initialValue.timeLimitSeconds / 60));
  const [attempts, setAttempts] = useState(initialValue.maxAttempts === null ? "" : String(initialValue.maxAttempts));
  const [passingScore, setPassingScore] = useState(initialValue.settings.passingScore === null ? "" : String(initialValue.settings.passingScore));
  const initialTags = initialValue.selection.mode === "distribution" ? initialValue.selection.tags.join(", ") : "";
  const [tags, setTags] = useState(initialTags);

  function update<K extends keyof QuizInput>(key: K, value: QuizInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function setting<K extends keyof Settings>(key: K, value: Settings[K]) {
    setInput((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
  }

  function serialise(status: QuizStatus): QuizInput {
    return {
      ...input,
      title: input.title.trim(),
      status,
      openAt: input.manualStatus === "scheduled" ? input.openAt?.trim() || null : null,
      closeAt: input.manualStatus === "scheduled" ? input.closeAt?.trim() || null : null,
      timeLimitSeconds: duration.trim() ? Number(duration) * 60 : null,
      maxAttempts: attempts.trim() ? Number(attempts) : null,
      selection: input.selection.mode === "specific" ? input.selection : { ...input.selection, tags: commaList(tags) },
      settings: { ...input.settings, passingScore: passingScore.trim() ? Number(passingScore) : null },
    };
  }

  function submit(status: QuizStatus) {
    const next = serialise(status);
    const eligible = next.selection.mode !== "specific" || unchangedOrEligibleSelection(next.selection.questionIds, existingIds, bank);
    const issue = quizValidationError(next, bank) ?? (eligible ? undefined : "Lepas soal yang sudah tidak dapat dipilih sebelum mengubah susunan kuis.");
    setValidation(issue ?? "");
    if (!issue) onSave(next);
  }

  function cancel() {
    if (JSON.stringify(serialise(initialValue.status)) !== JSON.stringify(initialValue)) setDiscard(true);
    else onCancel();
  }

  const existingIds = initialValue.selection.mode === "specific" ? initialValue.selection.questionIds : [];
  const disabledIds = bank.flatMap((question) => question.quizSelectable === false && !existingIds.includes(question.id) ? [question.id] : []);

  return (
    <View style={layout.group}>
      <Tabs<(typeof tabs)[number]["id"]> options={tabs} selected={activeTab} onSelect={setTab} testID="academic-quiz-editor-tab" />
      {activeTab === "configuration" ? (
        <View style={layout.group}>
          {courseControl}
          <Field label="Judul kuis" value={input.title} onChangeText={(value) => update("title", value)} testID="academic-quiz-title" />
          <SelectField label="Kategori" options={role === "admin" ? quizCategories : tutorCategories}
            value={input.category} change={(value) => update("category", value)} />
          <SelectField label="Akses" options={{ free: "Gratis", paid: "Berbayar" }}
            value={input.visibility} change={(value) => update("visibility", value)} />
          <SelectField label="Ketersediaan" options={{ open: "Terbuka", closed: "Tertutup", scheduled: "Terjadwal" }}
            value={input.manualStatus} change={(value) => update("manualStatus", value)} />
          {input.manualStatus === "scheduled" ? <ScheduleFields openAt={input.openAt} closeAt={input.closeAt}
            setOpen={(value) => update("openAt", value)} setClose={(value) => update("closeAt", value)} /> : null}
          <Field label="Durasi dalam menit" value={duration} onChangeText={setDuration} keyboardType="decimal-pad" placeholder="Tanpa batas" />
          <Field label="Batas percobaan" value={attempts} onChangeText={setAttempts} keyboardType="number-pad" placeholder="Tanpa batas" />
          <SelectField label="Tampilkan pembahasan" options={{ immediate: "Setelah dikumpulkan", after_close: "Setelah kuis ditutup", never: "Jangan tampilkan" }}
            value={input.settings.explanationRelease} change={(value) => setting("explanationRelease", value)} />
          <Field label="Nilai lulus" value={passingScore} onChangeText={setPassingScore} keyboardType="decimal-pad" placeholder="Tanpa nilai lulus" />
          {(Object.keys(flags) as Array<keyof typeof flags>).map((key) => (
            <FlagField key={key} label={flags[key]} value={input.settings[key]} change={(value) => setting(key, value)} />
          ))}
          {role === "admin" ? <>
            <FlagField label="Timer per soal" value={input.settings.perQuestionTimerEnabled} change={(value) => setting("perQuestionTimerEnabled", value)} />
            {input.settings.perQuestionTimerEnabled ? (
              <Field label="Timer bawaan dalam detik" keyboardType="number-pad"
                value={String(input.settings.defaultQuestionTimerSeconds || "")}
                onChangeText={(value) => setting("defaultQuestionTimerSeconds", Number(value))} />
            ) : null}
          </> : null}
        </View>
      ) : (
        <View style={layout.group}>
          {role === "admin" ? (
            <SelectField label="Pemilihan soal" value={input.selection.mode}
              options={{ specific: "Pilih soal", distribution: "Atur distribusi" }}
              change={(value) => update("selection", value === "specific"
                ? { mode: "specific", questionIds: [] }
                : { mode: "distribution", count: 10, difficulty: { easy: 3, medium: 5, hard: 2 }, tags: commaList(tags) })}
            />
          ) : null}
          {input.selection.mode === "specific" ? (
            <QuestionPicker
              bank={bank} ids={input.selection.questionIds} disabledIds={disabledIds} quizAuthoring={role === "admin"} disabled={isSaving}
              change={(questionIds) => update("selection", { mode: "specific", questionIds })}
              timers={role === "admin" && input.settings.perQuestionTimerEnabled ? input.settings.perQuestionTimers : undefined}
              setTimer={(id, seconds) => {
                const timers = { ...input.settings.perQuestionTimers };
                if (seconds === "") delete timers[id];
                else timers[id] = Number(seconds);
                setting("perQuestionTimers", timers);
              }}
            />
          ) : (
            <DistributionEditor selection={input.selection} change={(value) => update("selection", value)} tags={tags} setTags={setTags} />
          )}
        </View>
      )}
      {validation ? <AssessmentNotice message={validation} error /> : null}
      {feedback}
      <View style={layout.row}>
        <Action label={initialValue.status === "draft" ? "Simpan draf" : "Simpan perubahan"} variation="default"
          onPress={() => submit(initialValue.status)} disabled={isSaving} testID="academic-quiz-save" />
        {initialValue.status === "draft" ? <Action label="Terbitkan" onPress={() => submit("published")} disabled={isSaving} testID="academic-quiz-publish" /> : null}
        <Action label="Batal" onPress={cancel} disabled={isSaving} variation="ghost" testID="academic-quiz-cancel" />
      </View>
      {discard ? <ConfirmAction title="Batalkan perubahan" message="Perubahan yang belum disimpan akan hilang."
        confirmLabel="Buang perubahan" confirmTestID="academic-quiz-confirm-cancel"
        cancel={() => setDiscard(false)} confirm={onCancel} /> : null}
    </View>
  );
}

const tutorCategories: Partial<typeof quizCategories> = {
  daily: quizCategories.daily, weekly: quizCategories.weekly, chapter: quizCategories.chapter, premium: quizCategories.premium,
};

export function ScheduleFields({ openAt, closeAt, setOpen, setClose, disabled }: {
  openAt: string | null; closeAt: string | null; setOpen(value: string): void; setClose(value: string): void; disabled?: boolean;
}) {
  const placeholder = "2026-11-30T09:00+07:00";
  return <View style={layout.group}>
    <Field label="Waktu buka dan zona waktu" autoCapitalize="none" autoCorrect={false} placeholder={placeholder} value={openAt ?? ""} editable={!disabled} onChangeText={setOpen} />
    <Field label="Waktu tutup dan zona waktu" autoCapitalize="none" autoCorrect={false} placeholder={placeholder} value={closeAt ?? ""} editable={!disabled} onChangeText={setClose} />
  </View>;
}

function DistributionEditor({ selection, change, tags, setTags }: {
  selection: Extract<QuizSelection, { mode: "distribution" }>;
  change(selection: QuizSelection): void;
  tags: string;
  setTags(value: string): void;
}) {
  return <View style={layout.group}>
    <Field label="Jumlah soal" keyboardType="number-pad" value={String(selection.count || "")}
      onChangeText={(value) => change({ ...selection, count: Number(value) })} />
    {(Object.keys(difficulties) as Array<keyof typeof difficulties>).map((key) => (
      <Field key={key} label={difficulties[key]} keyboardType="number-pad" value={String(selection.difficulty[key])}
        onChangeText={(value) => change({ ...selection, difficulty: { ...selection.difficulty, [key]: Number(value) } })} />
    ))}
    <Field label="Tag soal, pisahkan dengan koma" value={tags} onChangeText={setTags} />
  </View>;
}

export function QuestionPicker({ bank, ids, change, timers, setTimer, disabledIds = [], quizAuthoring = false, disabled = false }: {
  bank: readonly PickerQuestion[];
  ids: readonly string[];
  change(ids: string[]): void;
  timers?: Readonly<Record<string, number>>;
  setTimer?(id: string, seconds: string): void;
  disabledIds?: readonly string[];
  quizAuthoring?: boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [orderPage, setOrderPage] = useState(0);
  const [filters, setFilters] = useState(emptyQuizQuestionFilters);
  const [menu, setMenu] = useState<"filters" | "bulk" | null>(null);
  const filterCount = Object.values(filters).filter(Boolean).length;
  const results = filterQuizQuestions({ bank, ids, disabledIds, search: query, filters });
  const size = 10;
  const shown = Math.min(page, Math.max(0, Math.ceil(results.length / size) - 1));
  const shownOrder = Math.min(orderPage, Math.max(0, Math.ceil(ids.length / size) - 1));
  const byId = new Map(bank.map(question => [question.id, question]));
  const selected = new Set(ids);

  function move(index: number, target: number) {
    const updated = [...ids];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    change(updated);
    setOrderPage(Math.floor(target / size));
  }

  function applyFilters(next: QuizQuestionFilters) {
    setFilters(next);
    setPage(0);
  }

  function bulk(next: string[]) {
    change(next);
    setMenu(null);
  }

  return (
    <View style={layout.group}>
      <SearchBox label="Cari soal" value={query} onChange={(value) => { setQuery(value); setPage(0); }} />
      {quizAuthoring ? <View style={layout.row}>
        <Action label={filterCount ? `Filter soal (${filterCount})` : "Filter soal"} onPress={() => setMenu("filters")}
          disabled={disabled} testID="academic-quiz-picker-filter" />
        <Action label="Pilihan massal" onPress={() => setMenu("bulk")} disabled={disabled} testID="academic-quiz-picker-bulk" />
      </View> : null}
      <Ink kind="meta" tone="muted">{ids.length} soal dipilih</Ink>
      {results.slice(shown * size, (shown + 1) * size).map((question) => {
        const checked = selected.has(question.id);
        return <SectionRow key={question.id}>
          <ChoiceCheck label={question.prompt} checked={checked} disabled={disabled || (quizAuthoring && question.quizSelectable === false && !checked)}
            testID={`academic-picker-${question.id}`}
            change={() => change(checked ? ids.filter((id) => id !== question.id) : [...ids, question.id])} />
          <Ink kind="meta" tone="muted">{questionTypes[question.type]} · {difficulties[question.difficulty]}</Ink>
        </SectionRow>;
      })}
      {!results.length ? <AssessmentNotice message={query || filterCount ? "Soal yang cocok tidak ditemukan." : "Tidak ada soal yang dapat dipilih."} /> : null}
      <Pagination page={shown} count={results.length} size={size} change={setPage} />
      {ids.length ? <Ink kind="heading">Urutan soal</Ink> : null}
      {ids.slice(shownOrder * size, (shownOrder + 1) * size).map((id, offset) => {
        const index = shownOrder * size + offset;
        return <SectionRow key={id}>
          <Ink>{index + 1}. {byId.get(id)?.prompt ?? "Soal tidak tersedia"}</Ink>
          <View style={layout.row}>
            <Action label="Naik" onPress={() => move(index, index - 1)} disabled={disabled || index === 0} />
            <Action label="Turun" onPress={() => move(index, index + 1)} disabled={disabled || index + 1 === ids.length} />
            {!byId.has(id) ? <Action label="Lepas soal" disabled={disabled} onPress={() => change(ids.filter(value => value !== id))} /> : null}
          </View>
          {timers && setTimer ? <Field label={`Timer soal ${index + 1} dalam detik`} value={timers[id]?.toString() ?? ""} disabled={disabled}
            placeholder="Pakai timer bawaan" keyboardType="number-pad" onChangeText={(value) => setTimer(id, value)} /> : null}
        </SectionRow>;
      })}
      <Pagination page={shownOrder} count={ids.length} size={size} change={setOrderPage} />
      {menu === "filters" ? <QuizPickerFilters filters={filters} bank={bank} close={() => setMenu(null)} change={applyFilters} /> : null}
      {menu === "bulk" ? <CourseDialog title="Pilihan massal" onClose={() => setMenu(null)}>
        <Action label="Pilih semua hasil filter" variation="default" testID="academic-quiz-picker-select-all"
          disabled={!results.some(question => question.quizSelectable !== false && !selected.has(question.id))}
          onPress={() => bulk(addVisibleQuizQuestions(ids, results))} />
        <Action label="Lepas pilihan hasil filter" disabled={!results.some(question => selected.has(question.id))}
          onPress={() => bulk(removeVisibleQuizQuestions(ids, results))} />
        <Action label="Kosongkan semua pilihan" disabled={!ids.length} onPress={() => bulk([])} />
      </CourseDialog> : null}
    </View>
  );
}

function QuizPickerFilters({ filters, bank, change, close }: {
  filters: QuizQuestionFilters; bank: readonly PickerQuestion[]; change(next: QuizQuestionFilters): void; close(): void;
}) {
  const [draft, setDraft] = useState(filters);
  const tags = [...new Set(bank.flatMap(question => question.tags).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
  return <CourseDialog title="Filter soal" onClose={close}>
    <SelectField label="Kesulitan" options={{ "": "Semua tingkat", ...difficulties }}
      value={draft.difficulty} change={difficulty => setDraft({ ...draft, difficulty })} />
    <SelectField label="Jenis soal" options={{ "": "Semua jenis", ...questionTypes }}
      value={draft.type} change={type => setDraft({ ...draft, type })} />
    <SelectField label="Asal soal" options={{ "": "Semua asal", zyx_original: "Zyx asli", itb_example: "Contoh ITB", historical_reference: "Referensi historis" }}
      value={draft.origin} change={origin => setDraft({ ...draft, origin })} />
    <Picker label="Topik soal" selected={draft.tag} options={[{ id: "", label: "Semua topik" }, ...tags.map(tag => ({ id: tag, label: tag }))]}
      onSelect={tag => setDraft({ ...draft, tag })} />
    <SelectField label="Status soal" options={{ "": "Semua status", published: "Terbit", generated: "Draf", flagged: "Ditandai" }}
      value={draft.status} change={status => setDraft({ ...draft, status })} />
    <ChoiceCheck label="Hanya soal yang dipilih" checked={draft.selectedOnly} change={() => setDraft({ ...draft, selectedOnly: !draft.selectedOnly })} />
    <View style={layout.row}>
      <Action label="Atur ulang" variation="ghost" onPress={() => setDraft(emptyQuizQuestionFilters)} />
      <Action label="Terapkan" variation="default" onPress={() => { change(draft); close(); }} />
    </View>
  </CourseDialog>;
}
