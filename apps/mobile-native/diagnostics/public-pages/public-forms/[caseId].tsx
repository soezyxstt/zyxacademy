import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { isPublicFormCaseId, publicFormCases, publicFormFixtureEnvelope, publicFormFrame, publicFormPageCases } from "../../../../../packages/forms/parity-cases";
import { MarkedPageFrame } from "../../../features/parity/MarkedPageFrame";
import { parsePublicForm, type PublicFormLoad } from "../../../features/public-forms/model";
import { PublicFormResponse } from "../../../features/public-forms/response";
import { PublicFormScreen } from "../../../features/public-forms/screen";

const questionFlow = {
  success: true,
  form: {
    id: "native-question-flow", slug: "native-question-flow", title: "Formulir bertahap",
    settings: { displayMode: "question", collectEmail: "input" },
    questions: [
      { type: "SECTION", title: "Bagian peserta", description: Array.from({ length: 30 }, (_, index) =>
        `${index + 1}. Baca petunjuk pendaftaran sesi. Lengkapi identitas peserta sesuai data yang digunakan untuk tutorial.`).join("\n\n") },
      { type: "STATEMENT", title: "Informasi tutorial", description: "Waktu tutorial akan dikirim melalui email." },
      { type: "TEXT", title: "Nama peserta", required: true },
      { type: "STATEMENT", title: "Tinjau tanggapan", description: "Periksa kembali jawaban sebelum mengirim." },
    ],
  },
};

export default function InternalPublicFormFixture() {
  const { caseId, frame } = useLocalSearchParams<{ caseId: string; frame?: string }>();
  const router = useRouter();
  const visualCase = isPublicFormCaseId(caseId) ? caseId : null;
  if (!visualCase && caseId !== "question-flow") return <Redirect href="/" />;
  const sample = visualCase ? publicFormCases[visualCase] : null;
  const state: PublicFormLoad = sample?.status === "missing" ? { status: "missing" }
    : visualCase && sample ? parsePublicForm(publicFormFixtureEnvelope(visualCase), sample.entry) : parsePublicForm(questionFlow, "full");
  const back = () => router.replace("/");
  const noOp = () => {};
  const screen = <PublicFormScreen key={caseId} state={state} locale="id" access="anonymous" onBack={back} onHome={back} insideSafeArea={frame === "1"}
    onRetry={noOp} onLogin={noOp} onWeb={noOp} onMeet={noOp}>
    {state.status === "ready" && <PublicFormResponse form={state.form} locale="id" signedIn={false}
      onSubmit={async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 1_000));
        return { status: "sent" };
      }} onUpload={async () => ({ status: "cancelled" })}
      onLogin={noOp} onWeb={noOp} onCheck={noOp} onDone={back} />}
  </PublicFormScreen>;
  if (frame !== "1" || !visualCase) return screen;
  const page = publicFormPageCases[publicFormCases[visualCase].entry === "short" ? "short-forms" : "forms"];
  const index = page.cases.findIndex(item => item === visualCase);
  return <MarkedPageFrame frame={publicFormFrame} index={index}>{screen}</MarkedPageFrame>;
}
