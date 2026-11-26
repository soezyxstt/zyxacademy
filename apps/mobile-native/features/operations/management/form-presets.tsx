import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ManagementFailure, formCategories, newQuestion, type FormFields, type FormPreset } from "../../../../../packages/native-parity/operations/management-contract";
import { Action, Choices, Confirm, Copy, Feedback, Field, Item, LoadState, Section, styles, useAction, useManagement, useRead, type Confirmation } from "./ui";

const categories = Object.entries(formCategories) as [FormFields["category"], string][];
type PresetEditor = { preset?: FormPreset; name: string; description: string; category: FormFields["category"]; includeSettings: "yes" | "no" };

export function FormPresets({ fields, settingsOnly = false, questionsLocked = false, onApply, disabled }: {
  fields: FormFields; settingsOnly?: boolean; questionsLocked?: boolean; onApply: (fields: FormFields) => void; disabled?: boolean;
}) {
  const [showList, setShowList] = useState(false);
  const [editor, setEditor] = useState<PresetEditor | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [cursors, setCursors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const detailRequest = useRef<AbortController | null>(null);
  const draft = useRef({ fields, disabled });
  draft.current = { fields, disabled };
  const { client } = useManagement();
  const action = useAction();
  const read = useRead("presets", { cursor: cursors.at(-1), settingsOnly }, showList);
  const nextCursor = read.data?.nextCursor;
  const busy = action.busy || reading;
  useEffect(() => () => detailRequest.current?.abort(), [client]);
  const edit = <K extends keyof PresetEditor>(key: K, value: PresetEditor[K]) => { if (editor) setEditor({ ...editor, [key]: value }); };

  function submit() {
    if (!editor) return;
    const name = editor.name.trim();
    const description = editor.description.trim();
    if (!name) return action.setError(new ManagementFailure("invalid", "Nama preset wajib diisi."));
    const operation = editor.preset
      ? { type: "form.preset.update", id: editor.preset.id, revision: editor.preset.revision, name, description } as const
      : { type: "form.preset.create", fields: { name, description, category: editor.category, questions: fields.questions, ...(editor.includeSettings === "yes" ? { settings: fields.settings } : {}) } } as const;
    void action.run(operation, () => { setEditor(null); setCursors([]); setShowList(true); read.reload(); }, "Preset disimpan.");
  }

  async function loadPreset(id: string, onLoad: (preset: FormPreset) => void) {
    if (detailRequest.current || action.busy || disabled) return;
    const controller = new AbortController();
    detailRequest.current = controller;
    setReading(true);
    action.setError(undefined);
    try {
      const preset = await client.read("preset", id, controller.signal);
      if (!controller.signal.aborted && !draft.current.disabled) onLoad(preset);
    } catch (error) {
      if (!controller.signal.aborted) action.setError(error);
    } finally {
      if (detailRequest.current === controller) {
        detailRequest.current = null;
        setReading(false);
      }
    }
  }

  function apply(preset: FormPreset) {
    const useQuestions = !settingsOnly && !questionsLocked;
    if (useQuestions && preset.canApplyQuestions === false) {
      return action.setError(new ManagementFailure("invalid", "Pertanyaan preset tidak dapat dimuat."));
    }
    if (settingsOnly && (preset.invalidSettings || !preset.settings || !Object.keys(preset.settings).length)) {
      return action.setError(new ManagementFailure("invalid", "Pengaturan preset tidak dapat dimuat."));
    }
    const description = useQuestions ? `Preset ${preset.name} akan mengganti susunan pertanyaan pada draf.` : `Pengaturan dari ${preset.name} akan diterapkan pada draf.`;
    setConfirmation({
      title: useQuestions ? "Ganti susunan pertanyaan?" : "Muat pengaturan preset?",
      description: preset.invalidSettings ? `${description} Pengaturan preset tidak dapat dimuat.` : description,
      label: useQuestions ? "Muat preset" : "Muat pengaturan",
      run: () => {
        if (draft.current.disabled) return;
        const current = draft.current.fields;
        onApply({ ...current, ...(useQuestions ? { questions: preset.questions.length ? preset.questions : [newQuestion()] } : {}), settings: { ...current.settings, ...preset.settings } });
        setShowList(false);
      },
    });
  }

  return <>
    <View style={styles.row}>
      {!settingsOnly && <Action disabled={disabled || busy} onPress={() => { action.setError(undefined); setEditor({ name: "", description: "", category: fields.category, includeSettings: "yes" }); }}>Simpan sebagai preset</Action>}
      {(!questionsLocked || settingsOnly) && <Action disabled={disabled || busy} onPress={() => { setCursors([]); setShowList(!showList); action.setError(undefined); }}>{showList ? "Tutup daftar preset" : settingsOnly ? "Muat pengaturan dari preset" : "Muat preset"}</Action>}
    </View>
    <Feedback {...action} />
    {editor && <Section title={editor.preset ? "Sunting preset" : "Simpan sebagai preset"}>
      <Field label="Nama preset" value={editor.name} onChangeText={value => edit("name", value)} />
      <Field label="Deskripsi preset" value={editor.description} multiline onChangeText={value => edit("description", value)} />
      {!editor.preset && <>
        <Copy strong>Kategori preset</Copy>
        <Choices current={editor.category} values={categories} onChange={value => edit("category", value)} />
        <Copy strong>Sertakan pengaturan</Copy>
        <Choices current={editor.includeSettings} values={[["yes", "Ya"], ["no", "Tidak"]]} onChange={value => edit("includeSettings", value)} />
      </>}
      <View style={styles.row}>
        <Action disabled={busy} onPress={() => setEditor(null)}>Batal</Action>
        <Action variant="default" disabled={reading || disabled} busy={action.busy} onPress={submit}>Simpan preset</Action>
      </View>
    </Section>}
    {showList && <Section title={settingsOnly ? "Preset pengaturan" : "Preset tersimpan"}>
      <LoadState {...read} retry={read.reload} />
      {reading && <Copy muted>Memuat preset…</Copy>}
      {read.data?.items.length === 0 && <Copy muted>{settingsOnly ? "Belum ada preset dengan pengaturan." : "Belum ada preset tersimpan."}</Copy>}
      {read.data?.items.map(preset => <Item key={preset.id} title={preset.name}
        meta={`${formCategories[preset.category]}${preset.hasSettings ? " · dengan pengaturan" : ""}`}
        actions={<>
          <Action disabled={disabled || busy} onPress={() => void loadPreset(preset.id, apply)}>{settingsOnly ? "Muat pengaturan" : "Muat"}</Action>
          {!settingsOnly && <>
            <Action disabled={disabled || busy} onPress={() => void loadPreset(preset.id, detail => setEditor({ preset: detail, name: detail.name, description: detail.description, category: detail.category, includeSettings: detail.settings ? "yes" : "no" }))}>Sunting preset</Action>
            <Action variant="destructive" disabled={disabled || busy} onPress={() => void loadPreset(preset.id, detail => setConfirmation({
              title: "Hapus preset?", description: `Preset ${detail.name} akan dihapus dari daftar.`, label: "Hapus preset", danger: true,
              run: () => void action.run({ type: "form.preset.delete", id: detail.id, revision: detail.revision }, () => { if (editor?.preset?.id === detail.id) setEditor(null); read.reload(); }, "Preset dihapus."),
            }))}>Hapus preset</Action>
          </>}
        </>} />)}
      {(cursors.length > 0 || nextCursor) && <View style={styles.row}>
        {cursors.length > 0 && <Action disabled={busy || read.loading} onPress={() => setCursors(value => value.slice(0, -1))}>Sebelumnya</Action>}
        {nextCursor && <Action disabled={busy} onPress={() => setCursors(value => [...value, nextCursor])}>Berikutnya</Action>}
      </View>}
      {action.error instanceof ManagementFailure && action.error.code === "conflict" && <Action onPress={() => { setEditor(null); action.setError(undefined); read.reload(); }}>Muat ulang preset</Action>}
    </Section>}
    <Confirm value={confirmation} onClose={() => setConfirmation(null)} />
  </>;
}
