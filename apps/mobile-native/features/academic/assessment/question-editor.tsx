import { useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  commaList, difficulties, questionTypes, questionValidationError,
  type BankQuestionInput, type Difficulty, type QuestionInput, type TryoutQuestionInput,
} from "../../../../../packages/native-parity/academic/assessment";
import { Action, Field, Ink, layout } from "../courses/ui";
import { AssessmentNotice, ChoiceCheck, FlagField, SectionRow, SelectField } from "./ui";

type SharedProps = { busy: boolean; cancel(): void; feedback?: ReactNode };
type QuestionEditorProps = SharedProps & (
  | { bank: true; initial?: BankQuestionInput; save(input: BankQuestionInput): void }
  | { bank: false; initial?: TryoutQuestionInput; order: number; save(input: TryoutQuestionInput): void }
);

export function QuestionEditor(props: QuestionEditorProps) {
  const { initial, bank, busy, cancel, feedback } = props;
  const [fields, setFields] = useState<QuestionInput>(initial ?? {
    prompt: "", type: "multiple_choice", options: ["", "", "", ""], correctIndices: [], acceptableAnswers: [],
  });
  const [difficulty, setDifficulty] = useState(props.bank ? props.initial?.difficulty ?? "medium" : "medium");
  const [explanation, setExplanation] = useState(props.bank ? props.initial?.explanation ?? "" : "");
  const [tags, setTags] = useState(props.bank ? props.initial?.tags.join(", ") ?? "" : "");
  const [order, setOrder] = useState(props.bank ? "" : String(props.initial?.order ?? props.order));
  const [acceptsFile, setAcceptsFile] = useState(props.bank ? false : props.initial?.acceptsFile ?? false);
  const [accepted, setAccepted] = useState(initial?.acceptableAnswers.join(", ") ?? "");
  const [validation, setValidation] = useState("");
  const choice = fields.type === "multiple_choice" || fields.type === "multiple_choices";

  function save() {
    const input = {
      ...fields,
      prompt: fields.prompt.trim(),
      options: choice ? fields.options : [],
      correctIndices: choice ? fields.correctIndices : [],
      acceptableAnswers: fields.type === "short_answer" ? commaList(accepted) : [],
    };
    const issue = questionValidationError(input);
    setValidation(issue ?? "");
    if (issue) return;
    if (props.bank) props.save({ ...input, explanation: explanation.trim(), difficulty, tags: commaList(tags) });
    else props.save({ ...input, order: Number(order), acceptsFile: fields.type === "essay" && acceptsFile });
  }

  return (
    <View style={layout.group}>
      <Field label="Pertanyaan" value={fields.prompt} editable={!busy} onChangeText={(prompt) => setFields({ ...fields, prompt })} multiline testID="academic-question-prompt" />
      <SelectField label="Jenis soal" value={fields.type} options={questionTypes} disabled={busy}
        change={(type) => setFields({ ...fields, type, correctIndices: [] })} />
      {choice ? <>
        {(fields.options.length ? fields.options : ["", "", "", ""]).map((option, index) => (
          <SectionRow key={index}>
            <Field label={`Opsi ${index + 1}`} value={option} editable={!busy} onChangeText={(value) => {
              const options = fields.options.length ? [...fields.options] : ["", "", "", ""];
              options[index] = value;
              setFields({ ...fields, options });
            }} />
            <ChoiceCheck label={`Opsi ${index + 1} benar`} checked={fields.correctIndices.includes(index)} disabled={busy} change={() => {
              const marked = fields.correctIndices.includes(index);
              const correctIndices = marked ? fields.correctIndices.filter((item) => item !== index)
                : fields.type === "multiple_choice" ? [index] : [...fields.correctIndices, index];
              setFields({ ...fields, correctIndices });
            }} />
          </SectionRow>
        ))}
        <View style={layout.row}><Action label="Tambah opsi" disabled={busy} onPress={() => setFields({
          ...fields, options: [...(fields.options.length ? fields.options : ["", "", "", ""]), ""],
        })} /></View>
      </> : null}
      {fields.type === "short_answer" ? <Field label="Jawaban yang diterima, pisahkan dengan koma" value={accepted} editable={!busy} onChangeText={setAccepted} /> : null}
      {bank ? <>
        <SelectField<Difficulty> label="Tingkat kesulitan" value={difficulty} options={difficulties} disabled={busy} change={setDifficulty} />
        <Field label="Pembahasan" value={explanation} editable={!busy} onChangeText={setExplanation} multiline />
        <Field label="Tag, pisahkan dengan koma" value={tags} editable={!busy} onChangeText={setTags} />
      </> : <>
        <Field label="Urutan soal" value={order} onChangeText={setOrder} keyboardType="number-pad" />
        {fields.type === "essay" ? <FlagField label="Izinkan lampiran" value={acceptsFile} change={setAcceptsFile} /> : null}
      </>}
      {validation ? <AssessmentNotice error message={validation} /> : null}
      {feedback}
      <View style={layout.row}>
        <Action label="Simpan soal" variation="default" disabled={busy} onPress={save} testID="academic-question-save" />
        <Action label="Batal" variation="ghost" disabled={busy} onPress={cancel} />
      </View>
    </View>
  );
}

export function QuestionContent({ question }: { question: QuestionInput & { explanation?: string; sourceEventName?: string } }) {
  return (
    <View style={layout.compact}>
      <Ink kind="strong">{question.prompt}</Ink>
      <Ink kind="meta" tone="muted">{questionTypes[question.type]}{question.sourceEventName ? ` · ${question.sourceEventName}` : ""}</Ink>
      {question.options.map((option, index) => <Ink key={index}>{option}{question.correctIndices.includes(index) ? " · Benar" : ""}</Ink>)}
      {question.acceptableAnswers.length ? <Ink>Jawaban diterima: {question.acceptableAnswers.join(", ")}</Ink> : null}
      {question.explanation ? <Ink>{question.explanation}</Ink> : null}
    </View>
  );
}
