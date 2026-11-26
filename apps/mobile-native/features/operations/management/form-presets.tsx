import { useState } from "react";
import { View } from "react-native";
import { ManagementFailure, formCategories, newQuestion, type FormFields, type FormPreset } from "../../../../../packages/native-parity/operations/management-contract";
import { Action, Choices, Confirm, Copy, Feedback, Field, Item, LoadState, Section, styles, useAction, useRead, type Confirmation } from "./ui";

const categories = Object.entries(formCategories) as [FormFields["category"], string][];
type PresetEditor = { preset?: FormPreset; name: string; description: string; category: FormFields["category"]; includeSettings: "yes" | "no" };

export function FormPresets({ fields, settingsOnly = false, questionsLocked = false, onApply, disabled }: {
  fields: FormFields; settingsOnly?: boolean; questionsLocked?: boolean; onApply: (fields: FormFields) => void; disabled?: boolean;
}) {
  const [showList, setShowList] = useState(false);
  const [editor, setEditor] = useState<PresetEditor | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const action = useAction();
  const read = useRead("presets", undefined, showList);
  const displayed = read.data?.filter(preset => !settingsOnly || Boolean(preset.invalidSettings || (preset.settings && Object.keys(preset.settings).length)));
  const edit = <K extends keyof PresetEditor>(key: K, value: PresetEditor[K]) => { if (editor) setEditor({ ...editor, [key]: value }); };

  function submit() {
    if (!editor) return;
    const name = editor.name.trim();
    const description = editor.description.trim();
    if (!name) return action.setError(new ManagementFailure("invalid", "Nama preset wajib diisi."));
    const operation = editor.preset
      ? { type: "form.preset.update", id: editor.preset.id, revision: editor.preset.revision, name, description } as const
      : { type: "form.preset.create", fields: { name, description, category: editor.category, questions: fields.questions, ...(editor.includeSettings === "yes" ? { settings: fields.settings } : {}) } } as const;
    void action.run(operation, () => { setEditor(null); setShowList(true); read.reload(); }, "Preset disimpan.");
  }

  function apply(preset: FormPreset) {
    const useQuestions = !settingsOnly && !questionsLocked;
    setConfirmation({
      title: useQuestions ? "Ganti susunan pertanyaan?" : "Muat pengaturan preset?",
      description: useQuestions ? `Preset ${preset.name} akan mengganti susunan pertanyaan pada draf.` : `Pengaturan dari ${preset.name} akan diterapkan pada draf.`,
      label: useQuestions ? "Muat preset" : "Muat pengaturan",
      run: () => {
        onApply({ ...fields, ...(useQuestions ? { questions: preset.questions.length ? preset.questions : [newQuestion()] } : {}), settings: { ...fields.settings, ...preset.settings } });
        setShowList(false);
      },
    });
  }

  return <>
    <View style={styles.row}>
      {!settingsOnly && <Action disabled={disabled || action.busy} onPress={() => { action.setError(undefined); setEditor({ name: "", description: "", category: fields.category, includeSettings: "yes" }); }}>Simpan sebagai preset</Action>}
      {(!questionsLocked || settingsOnly) && <Action disabled={disabled || action.busy} onPress={() => { setShowList(!showList); action.setError(undefined); }}>{showList ? "Tutup daftar preset" : settingsOnly ? "Muat pengaturan dari preset" : "Muat preset"}</Action>}
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
        <Action disabled={action.busy} onPress={() => setEditor(null)}>Batal</Action>
        <Action variant="default" busy={action.busy} onPress={submit}>Simpan preset</Action>
      </View>
    </Section>}
    {showList && <Section title={settingsOnly ? "Preset pengaturan" : "Preset tersimpan"}>
      <LoadState {...read} retry={read.reload} />
      {!read.loading && displayed?.length === 0 && <Copy muted>{settingsOnly ? "Belum ada preset dengan pengaturan." : "Belum ada preset tersimpan."}</Copy>}
      {displayed?.map(preset => <Item key={preset.id} title={preset.name}
        meta={`${formCategories[preset.category]} · ${preset.questions.filter(question => question.type !== "SECTION" && question.type !== "STATEMENT").length} pertanyaan${preset.settings && Object.keys(preset.settings).length ? " · dengan pengaturan" : ""}${preset.description ? ` · ${preset.description}` : ""}`}
        actions={<>
          {preset.invalidSettings && <Copy muted>Pengaturan preset tidak dapat dimuat.</Copy>}
          {!settingsOnly && preset.canApplyQuestions === false && <Copy muted>Pertanyaan preset tidak dapat dimuat.</Copy>}
          <Action disabled={disabled || action.busy || (settingsOnly ? preset.invalidSettings : preset.canApplyQuestions === false)} onPress={() => apply(preset)}>{settingsOnly ? "Muat pengaturan" : "Muat"}</Action>
          {!settingsOnly && <>
            <Action disabled={action.busy} onPress={() => { action.setError(undefined); setEditor({ preset, name: preset.name, description: preset.description, category: preset.category, includeSettings: preset.settings ? "yes" : "no" }); }}>Sunting preset</Action>
            <Action variant="destructive" disabled={action.busy} onPress={() => setConfirmation({
              title: "Hapus preset?", description: `Preset ${preset.name} akan dihapus dari daftar.`, label: "Hapus preset", danger: true,
              run: () => void action.run({ type: "form.preset.delete", id: preset.id, revision: preset.revision }, () => { if (editor?.preset?.id === preset.id) setEditor(null); read.reload(); }, "Preset dihapus."),
            })}>Hapus preset</Action>
          </>}
        </>} />)}
      {action.error instanceof ManagementFailure && action.error.code === "conflict" && <Action onPress={() => { setEditor(null); action.setError(undefined); read.reload(); }}>Muat ulang preset</Action>}
    </Section>}
    <Confirm value={confirmation} onClose={() => setConfirmation(null)} />
  </>;
}
