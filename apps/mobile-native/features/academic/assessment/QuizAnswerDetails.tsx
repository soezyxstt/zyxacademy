import { useContext, useState } from "react";
import { View } from "react-native";
import type { QuizAnswerDetail } from "../../../../../packages/academic/quiz-attempt-sheet";
import { StaffQuestionContent } from "../StaffQuestionContent";
import { CourseTheme, Ink, layout } from "../courses/ui";
import { Pagination, SectionRow } from "./ui";

const verdictLabels = { correct: "Benar", incorrect: "Salah", unanswered: "Tidak dijawab" };
const pageSize = 5;

export function QuizAnswerDetails({ questions, role }: { questions: QuizAnswerDetail[]; role: "admin" | "tutor" }) {
  const theme = useContext(CourseTheme);
  const [page, setPage] = useState(0);
  const current = Math.min(page, Math.max(0, Math.ceil(questions.length / pageSize) - 1));
  const offset = current * pageSize;
  const markdown = (source: string) => <StaffQuestionContent theme={theme} source={source} role={role} locale="id" />;
  return <>
    {questions.slice(offset, offset + pageSize).map((question, index) => <SectionRow key={question.id}>
      <Ink kind="meta" tone="muted">Soal {offset + index + 1}{question.verdict ? " · " + verdictLabels[question.verdict] : ""}</Ink>
      {question.prompt ? markdown(question.prompt) : null}
      {question.options?.map((option, position) => <View key={position} style={layout.row}>
        <Ink kind="meta">{String.fromCharCode(65 + position)}.</Ink>
        <View style={layout.flex}>
          {markdown(option)}
          {question.selected?.includes(position) ? <Ink kind="meta">Dipilih peserta</Ink> : null}
          {question.correct?.includes(position) ? <Ink kind="meta" tone="accent">Kunci jawaban</Ink> : null}
        </View>
      </View>)}
      {!question.selected?.length && question.verdict !== "unanswered" && <>
        <Ink kind="strong">Jawaban peserta</Ink>
        {markdown(question.answer || "Kosong")}
      </>}
      {!question.correct?.length && question.answerKey ? <>
        <Ink kind="strong">Kunci jawaban</Ink>
        {markdown(question.answerKey)}
      </> : null}
    </SectionRow>)}
    <Pagination page={current} count={questions.length} size={pageSize} change={setPage} />
  </>;
}
