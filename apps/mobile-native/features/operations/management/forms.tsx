import { useState } from "react";
import { View } from "react-native";
import { createStandardFormQuestions } from "../../../../../lib/forms/standard-template";
import { buildFormSteps, formFileSizeLimitMb, isEmptyFormAnswer } from "../../../../../lib/forms/presentation";
import { summarizeFormResponses } from "../../../../../lib/forms/validation";
import { ManagementFailure, formCategories, newForm, newQuestion, questionTypes, validateForm, validateFormSettings, type FormDefinition, type FormDetails, type FormFields, type FormQuestion, type FormSettings } from "../../../../../packages/native-parity/operations/management-contract";
import { formAcceptanceChanged, sameDraftValue } from "../../../../../packages/native-parity/operations/management-revisions";
import { FormPresets } from "./form-presets";
import { respondentLink } from "./links";
import { RevisionReview } from "./revisions";
import { Action, Choices, Confirm, Copy, Feedback, Field, Heading, Item, LoadState, Screen, Section, Sections, formatTimestamp, styles, useAction, useDraft, useManagement, useRead, type Confirmation } from "./ui";

const builderTabs = [["builder", "Editor pertanyaan"], ["preview", "Pratinjau"], ["settings", "Pengaturan"], ["forms", "Daftar terbit"]] as const;
const detailTabs = [["summary", "Ringkasan"], ["question", "Pertanyaan"], ["individual", "Individu"], ["settings", "Setelan"]] as const;
const categories = Object.entries(formCategories) as [FormFields["category"], string][];
const types = Object.entries(questionTypes) as [FormQuestion["type"], string][];
const optionTypes: ReadonlySet<FormQuestion["type"]> = new Set(["RADIO", "CHECKBOX", "DROP_DOWN"]);
const nonAnswers = (q: FormQuestion) => q.type === "SECTION" || q.type === "STATEMENT";
const fileSizeOptions = [5, 10, 25, 50];
const otherChoice = "\uE000__other__";

function formFields(form: FormDefinition): FormFields {
  return { title: form.title, description: form.description, slug: form.slug, category: form.category, questions: form.questions, settings: form.settings };
}

export function FormBuilderRoute({ id, tab }: { id?: string; tab?: string }) {
  const { navigate } = useManagement();
  // The native builder also keeps publication separate from preview and draft edits.
  const read = useRead("form", id ?? "", Boolean(id));
  if (!id || read.data) return <FormBuilder form={read.data?.form} initialTab={tab} />;
  return <Screen title="Formulir" back={{ label: "Formulir", run: () => navigate("/admin/forms?tab=forms") }}><LoadState {...read} retry={read.reload} /></Screen>;
}

function FormBuilder({ form, initialTab }: { form?: FormDefinition; initialTab?: string }) {
  const { navigate, client } = useManagement();
  const [tab, setTab] = useState<typeof builderTabs[number][0]>(builderTabs.find(([key]) => key === initialTab)?.[0] ?? "builder");
  const [search, setSearch] = useState("");
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [reading, setReading] = useState(false);
  const read = useRead("forms", undefined, tab === "forms");
  const action = useAction();
  const draft = useDraft<FormFields>(`forms:${form?.id ?? "new"}`, form ? formFields(form) : newForm(), form?.revision);
  const [responseCount, setResponseCount] = useState(form?.totalResponses ?? 0);
  const [needsReview, setNeedsReview] = useState(Boolean(form && form.revision !== draft.revision));
  const [latest, setLatest] = useState<FormDefinition | null>(() => needsReview ? form ?? null : null);
  const mustReview = needsReview || (action.error instanceof ManagementFailure && action.error.code === "conflict");
  const lockedQuestionsChanged = responseCount > 0 && !sameDraftValue(draft.value.questions, draft.baseline.questions);
  const value = draft.value;
  const edit = <K extends keyof FormFields>(key: K, next: FormFields[K]) => { if (!action.busy) draft.change({ ...value, [key]: next }); };
  const questionEdit = (index: number, changes: Partial<FormQuestion>) => {
    setActiveQuestion(index);
    edit("questions", value.questions.map((question, order) => order === index ? { ...question, ...changes } : question));
  };
  const insertAfter = (index: number, question: FormQuestion) => {
    const at = Math.min(index + 1, value.questions.length);
    edit("questions", [...value.questions.slice(0, at), question, ...value.questions.slice(at)]);
    setActiveQuestion(at);
  };
  const move = (index: number, amount: number) => {
    const items = [...value.questions];
    [items[index], items[index + amount]] = [items[index + amount], items[index]];
    edit("questions", items);
    setActiveQuestion(index + amount);
  };

  function applyStandardPreset() {
    const apply = () => { edit("questions", createStandardFormQuestions()); setActiveQuestion(0); };
    const edited = value.questions.length !== 1 || Boolean(value.questions[0].title.trim() || value.questions[0].description?.trim());
    if (edited) setConfirmation({ title: "Ganti daftar pertanyaan?", description: "Preset 12 jenis soal akan mengganti pertanyaan yang ada di draf.", label: "Muat preset", run: apply });
    else apply();
  }

  function submit() {
    if (mustReview || lockedQuestionsChanged) return;
    const error = validateForm(value);
    if (error) { setTab("builder"); return action.setError(new ManagementFailure("invalid", error)); }
    const doSave = () => action.run({ type: "form.save", id: form?.id, revision: draft.revision, fields: value }, result => {
      draft.saved(value, result.revision);
      if (!form) {
        // Following creation, the web switches to the form list.
        navigate("/admin/forms?tab=forms");
      }
      read.reload();
    });
    if (form && formAcceptanceChanged(draft.baseline.settings, value.settings)) {
      setConfirmation({ title: "Ubah penerimaan respons?", description: "Perubahan berlaku pada halaman formulir.", label: "Simpan perubahan", run: doSave });
    } else if (form) void doSave();
    else setConfirmation({ title: "Publikasikan formulir?", description: `${value.title} akan dapat diakses melalui tautan formulir.`, label: "Publikasikan", run: doSave });
  }

  function deleteForm(item: FormDefinition) {
    setConfirmation({ title: "Hapus formulir?", description: `Formulir ${item.title} akan dihapus dari daftar.`, label: "Hapus formulir", danger: true,
      run: () => void action.run({ type: "form.delete", id: item.id, revision: item.revision }, read.reload, "Formulir dihapus."),
    });
  }

  async function inspectLatest() {
    if (!form || reading) return;
    setNeedsReview(true);
    setReading(true);
    try {
      const { form: saved } = await client.read("form", form.id);
      setResponseCount(saved.totalResponses);
      setLatest(saved);
    }
    catch (error) { action.setError(error); }
    finally { setReading(false); }
  }

  const listedForms = read.data?.filter(item => `${item.title} ${item.slug} ${item.description}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  return <Screen title="Formulir">
    <Sections values={builderTabs} current={tab} onChange={setTab} />
    {tab !== "forms" && <View style={styles.row}><Action variant="default" onPress={submit} busy={action.busy} disabled={mustReview || lockedQuestionsChanged}>{form ? "Simpan perubahan" : "Publikasikan formulir"}</Action>
      {form && <Action onPress={() => navigate("/admin/forms?tab=forms")}>Batal</Action>}
    </View>}
    <Feedback {...action} />
    {mustReview && !latest && form && <Action onPress={inspectLatest} busy={reading}>Muat revisi terbaru</Action>}
    {latest && <RevisionReview key={latest.revision} baseline={draft.baseline} local={value} saved={formFields(latest)}
      onClose={() => setLatest(null)} onResolve={fields => {
        draft.resolve(fields, formFields(latest), latest.revision);
        setNeedsReview(false);
        setLatest(null);
        action.setError(undefined);
      }} />}
    {lockedQuestionsChanged && !mustReview && <Section>
      <Copy status="error">Formulir sudah menerima respons. Simpan perubahan lain dengan susunan pertanyaan tersimpan.</Copy>
      <Action onPress={() => setConfirmation({ title: "Gunakan pertanyaan tersimpan?", description: "Susunan pertanyaan pada draf akan dikembalikan ke revisi tersimpan.", label: "Gunakan pertanyaan tersimpan", run: () => edit("questions", draft.baseline.questions) })}>Gunakan pertanyaan tersimpan</Action>
    </Section>}
    {tab === "builder" && <>
      <Field label="Judul formulir" value={value.title} onChangeText={next => edit("title", next)} />
      <Field label="Deskripsi" multiline value={value.description} onChangeText={next => edit("description", next)} />
      <Field label="Slug tautan" value={value.slug} onChangeText={next => edit("slug", next)} autoCapitalize="none" />
      <Copy strong>Kategori</Copy><Choices values={categories} current={value.category} onChange={next => edit("category", next)} />
      <FormPresets fields={value} questionsLocked={responseCount > 0} disabled={action.busy || mustReview}
        onApply={fields => { draft.change(fields); setActiveQuestion(0); }} />
      {!responseCount && <View style={styles.row}><Action disabled={action.busy || mustReview} onPress={applyStandardPreset}>Preset 12 jenis soal</Action></View>}
      {responseCount > 0 && <Copy muted>Pertanyaan dengan respons tersimpan dipertahankan.</Copy>}
      {value.questions.map((question, index) => <Section key={index} title={`${index + 1}. ${questionTypes[question.type]}`}>
        {responseCount > 0 ? <Copy>{question.title}</Copy> : <>
        <Field label={nonAnswers(question) ? "Judul" : "Teks pertanyaan"} value={question.title} onFocus={() => setActiveQuestion(index)} onChangeText={next => questionEdit(index, { title: next })} />
        {!nonAnswers(question) && <>
          <Choices current={question.type} values={types.filter(([type]) => type !== "SECTION" && type !== "STATEMENT")} onChange={type => questionEdit(index, { type })} />
          <Toggle label="Wajib diisi" value={question.required ?? false} onChange={next => questionEdit(index, { required: next })} />
        </>}
        <QuestionOptions question={question} edit={next => questionEdit(index, next)} />
        <View style={styles.row}>
          <Action disabled={index === 0} onPress={() => move(index, -1)}>Naik</Action>
          <Action disabled={index === value.questions.length - 1} onPress={() => move(index, 1)}>Turun</Action>
          <Action onPress={() => insertAfter(index, { ...question })}>Duplikat</Action>
          <Action disabled={value.questions.length === 1} onPress={() => { edit("questions", value.questions.filter((_, order) => order !== index)); setActiveQuestion(Math.max(0, index - 1)); }}>Hapus</Action>
        </View>
        </>}
      </Section>)}
      {!responseCount && <View style={styles.row}>
        <Action onPress={() => insertAfter(activeQuestion, newQuestion())}>Tambah pertanyaan</Action>
        <Action onPress={() => insertAfter(activeQuestion, { title: "", type: "STATEMENT" })}>Tambah pernyataan</Action>
        <Action onPress={() => insertAfter(activeQuestion, { title: "Bagian baru", type: "SECTION" })}>Tambah bagian</Action>
      </View>}
    </>}
    {tab === "preview" && <FormPreview fields={value} />}
    {tab === "settings" && <>
      <FormPresets fields={value} settingsOnly disabled={action.busy || mustReview} onApply={fields => edit("settings", fields.settings)} />
      <Settings settings={value.settings} update={next => edit("settings", next)} />
    </>}
    {tab === "forms" && <>
      <Field label="Cari formulir" value={search} onChangeText={setSearch} />
      <LoadState {...read} retry={read.reload} />
      {listedForms && <Section>
        {!listedForms.length && <Copy muted>Belum ada formulir yang sesuai.</Copy>}
        {listedForms.map(item => <Item key={item.id} title={item.title} meta={`${formCategories[item.category]} · ${item.totalResponses} respons`}
          onPress={() => navigate(`/admin/forms/${encodeURIComponent(item.id)}`)} actions={<>
            <Action onPress={() => navigate(`/admin/forms?edit=${encodeURIComponent(item.id)}`)}>Sunting</Action>
            <Action onPress={() => deleteForm(item)} disabled={action.busy} variant="destructive">Hapus</Action>
          </>} />)}
      </Section>}
    </>}
    <Confirm value={confirmation} onClose={() => setConfirmation(null)} />
  </Screen>;
}

function LineField({ label, value, onChange }: { label: string; value?: string[]; onChange: (value: string[]) => void }) {
  return <Field label={label} value={value?.join("\n") ?? ""} onChangeText={next => onChange(next.split("\n"))} multiline placeholder="Satu pilihan per baris" />;
}

function QuestionOptions({ question, edit }: { question: FormQuestion; edit: (changes: Partial<FormQuestion>) => void }) {
  const showDescription = nonAnswers(question) || (question.showDescription ?? Boolean(question.description?.trim()));
  const canAddOther = question.type === "RADIO" || question.type === "CHECKBOX";
  const fileSize = formFileSizeLimitMb(question.maxFileSizeMb);
  const availableFileSizes = fileSizeOptions.includes(fileSize) ? fileSizeOptions : [fileSize, ...fileSizeOptions];
  return <>
    {showDescription && <Field label="Deskripsi" value={question.description ?? ""} onChangeText={description => edit({ description })} multiline />}
    {!nonAnswers(question) && <View style={styles.row}>
      <Action onPress={() => edit({ showDescription: !showDescription })}>{showDescription ? "Sembunyikan deskripsi" : "Tampilkan deskripsi"}</Action>
      {optionTypes.has(question.type) && <Action onPress={() => edit({ shuffleOptions: !question.shuffleOptions })}>
        {question.shuffleOptions ? "Nonaktifkan pengacakan pilihan" : "Acak pilihan jawaban"}
      </Action>}
    </View>}
    {optionTypes.has(question.type) && <>
      <LineField label="Pilihan jawaban" value={question.options} onChange={options => edit({ options })} />
      {(canAddOther || question.otherOption?.enabled) && <Action onPress={() => edit({ otherOption: {
        enabled: !question.otherOption?.enabled, label: question.otherOption?.label || "Lainnya",
      } })}>{question.otherOption?.enabled ? `Hapus pilihan ${question.otherOption.label}` : "Tambah pilihan Lainnya"}</Action>}
    </>}
    {question.type === "SCALE" && <>
      <Field label={`Label skala ${question.scaleLow ?? 1}`} value={question.scaleLowLabel ?? ""} onChangeText={scaleLowLabel => edit({ scaleLowLabel })} />
      <Field label={`Label skala ${question.scaleHigh ?? 5}`} value={question.scaleHighLabel ?? ""} onChangeText={scaleHighLabel => edit({ scaleHighLabel })} />
    </>}
    {question.type === "FILE_UPLOAD" && <View style={styles.field}>
      <Copy strong>Maksimal ukuran berkas</Copy>
      <Choices current={String(fileSize)} values={availableFileSizes.map(size => [String(size), `${size} MB`] as const)} onChange={size => edit({ maxFileSizeMb: Number(size) })} />
    </View>}
    {question.type.startsWith("GRID_") && <>
      <LineField label="Baris kisi" value={question.gridRows} onChange={gridRows => edit({ gridRows })} />
      <LineField label="Kolom kisi" value={question.gridColumns} onChange={gridColumns => edit({ gridColumns })} />
    </>}
  </>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.field}><Copy strong>{label}</Copy><Choices current={value ? "on" : "off"} values={[["on", "Ya"], ["off", "Tidak"]]} onChange={next => onChange(next === "on")} /></View>;
}

function Settings({ settings, update }: { settings: FormSettings; update: (settings: FormSettings) => void }) {
  const edit = <K extends keyof FormSettings>(key: K, value: FormSettings[K]) => update({ ...settings, [key]: value });
  return <>
    <Section title="Status dan jadwal">
      <Toggle label="Terima respons" value={settings.acceptingResponses ?? true} onChange={next => edit("acceptingResponses", next)} />
      <Field label="Jadwal buka" value={settings.openAt ?? ""} placeholder="2026-12-01T09:00:00+07:00" autoCapitalize="none" onChangeText={next => edit("openAt", next)} />
      <Field label="Jadwal tutup" value={settings.closeAt ?? ""} placeholder="2026-12-01T16:00:00+07:00" autoCapitalize="none" onChangeText={next => edit("closeAt", next)} />
      <Field label="Pesan saat ditutup" value={settings.closedMessage ?? ""} onChangeText={next => edit("closedMessage", next)} />
    </Section>
    <Section title="Email dan autentikasi">
      <Copy strong>Kumpulkan alamat email</Copy><Choices values={[["none", "Tidak"], ["input", "Masukan manual"], ["verified", "Terverifikasi"]]} current={settings.collectEmail ?? "none"} onChange={next => edit("collectEmail", next)} />
      <Toggle label="Izinkan pengeditan respons" value={settings.allowResponseEditing ?? false} onChange={next => edit("allowResponseEditing", next)} />
      <Toggle label="Batasi ke satu respons" value={settings.limitToOneResponse ?? false} onChange={next => edit("limitToOneResponse", next)} />
      <Copy strong>Kirim salinan respons</Copy><Choices values={[["off", "Tidak"], ["requested", "Jika diminta"], ["always", "Selalu"]]} current={settings.sendResponseCopy ?? "off"} onChange={next => edit("sendResponseCopy", next)} />
    </Section>
    <Section title="Tampilan formulir">
      <Choices values={[["question", "Per pertanyaan"], ["section", "Per bagian"]]} current={settings.displayMode ?? "question"} onChange={next => edit("displayMode", next)} />
      <Field label="Pesan konfirmasi" value={settings.customSuccessMessage ?? ""} onChangeText={next => edit("customSuccessMessage", next)} />
    </Section>
  </>;
}

function FormPreview({ fields }: { fields: FormFields }) {
  const steps = buildFormSteps(fields.questions, fields.settings.displayMode, fields.settings.collectEmail === "input");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const step = steps[Math.min(index, steps.length - 1)];
  const cover = step.kind === "cover" || (step.kind === "page" && step.includeCover);
  const email = step.kind === "email" || (step.kind === "page" && step.includeEmail);
  const shownQuestions = step.kind === "page" ? step.questionIndices : "questionIndex" in step ? [step.questionIndex] : [];
  const answer = (key: string, value: string) => {
    setError("");
    setAnswers(previous => ({ ...previous, [key]: value }));
  };
  function toggleAnswer(key: string, option: string, multiple: boolean) {
    const selected = (answers[key] ?? "").split("\n").filter(Boolean);
    answer(key, multiple ? (selected.includes(option) ? selected.filter(value => value !== option) : [...selected, option]).join("\n") : option);
  }
  function next() {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((answers.email ?? "").trim())) return setError("Masukkan alamat email yang valid.");
    for (const questionIndex of shownQuestions) {
      const question = fields.questions[questionIndex];
      if (nonAnswers(question)) continue;
      const key = String(questionIndex);
      let value: unknown = answers[key];
      if (optionTypes.has(question.type) && question.otherOption?.enabled &&
        (answers[key] ?? "").split("\n").includes(otherChoice) && !answers[`other-${key}`]?.trim()) {
        return setError(`Isi pilihan ${question.otherOption.label} untuk pertanyaan ${question.title || questionTypes[question.type]}.`);
      }
      if (question.type.startsWith("GRID_")) {
        value = Object.fromEntries((question.gridRows ?? []).map((row, order) => [row, answers[`${key}-${order}`]]));
      }
      if (question.required && isEmptyFormAnswer(question, value)) return setError(`Isi pertanyaan ${question.title || questionTypes[question.type]}.`);
    }
    setError("");
    if (index + 1 < steps.length) setIndex(index + 1);
    else setDone(true);
  }
  if (done) return <Section title="Pratinjau selesai"><Copy>{fields.settings.customSuccessMessage || "Terima kasih."}</Copy><Action onPress={() => { setDone(false); setIndex(0); setAnswers({}); }}>Ulangi</Action></Section>;
  return <Section>
    {error && <Copy status="error">{error}</Copy>}
    {cover && <><Heading>{fields.title || "Formulir tanpa judul"}</Heading>{fields.description && <Copy muted>{fields.description}</Copy>}</>}
    {email && <Field label="Alamat email" value={answers.email ?? ""} onChangeText={next => answer("email", next)} keyboardType="email-address" autoCapitalize="none" />}
    {shownQuestions.map(questionIndex => {
      const question = fields.questions[questionIndex];
      const key = String(questionIndex);
      if (nonAnswers(question)) return <View key={key} style={styles.field}>{question.title && <Heading>{question.title}</Heading>}{question.description && <Copy>{question.description}</Copy>}</View>;
      const description = question.description ? <Copy muted>{question.description}</Copy> : null;
      if (question.type === "FILE_UPLOAD") return <View key={key} style={styles.field}>
        <Heading>{question.title || questionTypes[question.type]}</Heading>{description}
        <Copy muted>{`Maksimal ${formFileSizeLimitMb(question.maxFileSizeMb)} MB per berkas`}</Copy>
        <Action onPress={() => answer(key, "berkas-ujicoba.pdf")}>{answers[key] || "Pilih berkas uji"}</Action>
      </View>;
      if (optionTypes.has(question.type)) {
        const entries = (answers[key] ?? "").split("\n").filter(Boolean);
        const options = (question.options ?? []).filter(Boolean).map(option => ({ value: option, label: option }));
        if (question.otherOption?.enabled) options.push({ value: otherChoice, label: question.otherOption.label });
        return <View key={key} style={styles.field}><Heading>{question.title || questionTypes[question.type]}</Heading>{description}
          <View style={styles.row}>{options.map(({ value, label }, order) => {
            const selected = entries.includes(value);
            return <Action key={order} selected={selected} variant={selected ? "default" : "outline"} onPress={() => toggleAnswer(key, value, question.type === "CHECKBOX")}>{label}</Action>;
          })}</View>
          {entries.includes(otherChoice) && question.otherOption?.enabled && <Field label={question.otherOption.label} value={answers[`other-${key}`] ?? ""} onChangeText={next => answer(`other-${key}`, next)} />}
        </View>;
      }
      if (question.type.startsWith("GRID_")) return <View key={key} style={styles.field}>
        <Heading>{question.title || questionTypes[question.type]}</Heading>{description}
        {question.gridRows?.filter(Boolean).map((row, order) => {
          const rowKey = `${key}-${order}`;
          const selected = (answers[rowKey] ?? "").split("\n");
          return <View key={order} style={styles.field}><Copy strong>{row}</Copy><View style={styles.row}>
            {(question.gridColumns ?? []).filter(Boolean).map((column, index) => <Action key={index} variant={selected.includes(column) ? "default" : "outline"} selected={selected.includes(column)} onPress={() => toggleAnswer(rowKey, column, question.type === "GRID_CHECKBOX")}>{column}</Action>)}
          </View></View>;
        })}
      </View>;
      if (question.type === "SCALE" || question.type === "RATING") return <View key={key} style={styles.field}>
        <Heading>{question.title || questionTypes[question.type]}</Heading>{description}
        {question.type === "SCALE" && question.scaleLowLabel && <Copy muted>{`${question.scaleLow ?? 1} · ${question.scaleLowLabel}`}</Copy>}
        <Choices current={answers[key] ?? ""} values={Array.from({ length: Math.max(0, (question.scaleHigh ?? 5) - (question.scaleLow ?? 1) + 1) }, (_, offset) => String(offset + (question.scaleLow ?? 1))).map(value => [value, value] as const)} onChange={next => answer(key, next)} />
        {question.type === "SCALE" && question.scaleHighLabel && <Copy muted>{`${question.scaleHigh ?? 5} · ${question.scaleHighLabel}`}</Copy>}
      </View>;
      return <View key={key} style={styles.field}>
        {description}
        <Field label={question.title || questionTypes[question.type]} value={answers[key] ?? ""} onChangeText={next => answer(key, next)} multiline={question.type === "PARAGRAPH"} />
      </View>;
    })}
    <View style={styles.row}>
      {index > 0 && <Action onPress={() => setIndex(index - 1)}>Kembali</Action>}
      <Action variant="default" onPress={next}>{index + 1 < steps.length ? "Berikutnya" : "Selesaikan pratinjau"}</Action>
    </View>
  </Section>;
}

export function FormDetailRoute({ id, tab }: { id: string; tab?: string }) {
  const { navigate } = useManagement();
  const read = useRead("form", id);
  return <Screen title={read.data?.form.title ?? "Formulir"} back={{ label: "Daftar formulir", run: () => navigate("/admin/forms?tab=forms") }} actions={<Action onPress={read.reload}>Muat ulang</Action>}>
    <LoadState {...read} retry={read.reload} />
    {read.data && <FormDetail details={read.data} initialTab={tab} />}
  </Screen>;
}

function formatAnswer(value: unknown): string {
  if (value == null || value === "") return "Belum dijawab";
  if (Array.isArray(value)) return value.map(formatAnswer).join(", ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${formatAnswer(item)}`).join(" · ");
  return String(value);
}

function FormDetail({ details, initialTab }: { details: FormDetails; initialTab?: string }) {
  const { form, responses } = details;
  const { navigate, locale, client } = useManagement();
  const [tab, setTab] = useState<typeof detailTabs[number][0]>(detailTabs.find(([key]) => key === initialTab)?.[0] ?? "summary");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [respondentIndex, setRespondentIndex] = useState(0);
  const draft = useDraft(`forms-settings:${form.id}`, form.settings, form.revision);
  const action = useAction();
  const [needsReview, setNeedsReview] = useState(form.revision !== draft.revision);
  const [latest, setLatest] = useState<FormDefinition | null>(() => needsReview ? form : null);
  const [reading, setReading] = useState(false);
  const mustReview = needsReview || (action.error instanceof ManagementFailure && action.error.code === "conflict");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const summary = summarizeFormResponses(form.questions, responses);
  const publicLink = respondentLink(form.slug);
  const respondent = responses[respondentIndex];
  const question = summary.questions[questionIndex];
  async function inspectSettings() {
    if (reading) return;
    setNeedsReview(true);
    setReading(true);
    try { setLatest((await client.read("form", form.id)).form); }
    catch (error) { action.setError(error); }
    finally { setReading(false); }
  }
  function saveSettings() {
    if (mustReview) return;
    const error = validateFormSettings(draft.value);
    if (error) return action.setError(new ManagementFailure("invalid", error));
    const save = () => action.run({ type: "form.settings", id: form.id, settings: draft.value, revision: draft.revision ?? form.revision }, result => draft.saved(draft.value, result.revision));
    if (formAcceptanceChanged(draft.baseline, draft.value)) setConfirmation({ title: "Ubah penerimaan respons?", description: "Perubahan berlaku pada halaman formulir.", label: "Simpan setelan", run: save });
    else void save();
  }
  return <>
    <View style={styles.row}>
      <Action onPress={() => navigate(`/admin/forms?edit=${encodeURIComponent(form.id)}`)}>Sunting formulir</Action>
      {publicLink && <Action onPress={() => navigate(publicLink)}>{publicLink}</Action>}
    </View>
    <Sections current={tab} values={detailTabs} onChange={setTab} />
    {tab === "summary" && <Section title={`${summary.totalResponses} respons`}>
      {summary.questions.map(item => <Item key={item.index} title={item.title} meta={`${item.answered} / ${item.denominator} respons`} actions={Object.keys(item.counts).length > 0 ? <View style={styles.field}>{Object.entries(item.counts).map(([label, count]) => <Copy key={label}>{`${label} · ${count} (${Math.round(100 * count / item.denominator)}%)`}</Copy>)}</View> : undefined} />)}
    </Section>}
    {tab === "question" && <Section title={question?.title ?? "Belum ada pertanyaan"}>
      {question && <>
        <View style={styles.row}><Action disabled={!questionIndex} onPress={() => setQuestionIndex(questionIndex - 1)}>Sebelumnya</Action><Action disabled={questionIndex >= summary.questions.length - 1} onPress={() => setQuestionIndex(questionIndex + 1)}>Berikutnya</Action></View>
        {responses.filter(response => response.answers[question.index] != null || response.answers[question.title] != null).map(response => <Item key={response.id} title={response.responderEmail ?? "Anonim"} meta={formatAnswer(response.answers[question.index] ?? response.answers[question.title])} />)}
      </>}
    </Section>}
    {tab === "individual" && <Section title={respondent ? `Responden ${respondentIndex + 1} dari ${responses.length}` : "Belum ada respons"}>
      {respondent && <><Copy muted>{`${respondent.responderEmail ?? "Anonim"} · ${formatTimestamp(respondent.submittedAt, locale)}`}</Copy>
        <View style={styles.row}><Action disabled={!respondentIndex} onPress={() => setRespondentIndex(respondentIndex - 1)}>Sebelumnya</Action><Action disabled={respondentIndex >= responses.length - 1} onPress={() => setRespondentIndex(respondentIndex + 1)}>Berikutnya</Action></View>
        {summary.questions.map(item => <Item key={item.index} title={item.title} meta={formatAnswer(respondent.answers[item.index] ?? respondent.answers[item.title])} />)}
      </>}
    </Section>}
    {tab === "settings" && <>
      <Feedback {...action} />
      {mustReview && !latest && <Action onPress={inspectSettings} busy={reading}>Muat revisi terbaru</Action>}
      {latest && <RevisionReview key={latest.revision} baseline={draft.baseline} local={draft.value} saved={latest.settings}
        onClose={() => setLatest(null)} onResolve={settings => {
          draft.resolve(settings, latest.settings, latest.revision);
          setNeedsReview(false);
          setLatest(null);
          action.setError(undefined);
        }} />}
      <Action variant="default" busy={action.busy} disabled={mustReview} onPress={saveSettings}>Simpan setelan</Action>
      <Settings settings={draft.value} update={draft.change} />
    </>}
    <Confirm value={confirmation} onClose={() => setConfirmation(null)} />
  </>;
}
