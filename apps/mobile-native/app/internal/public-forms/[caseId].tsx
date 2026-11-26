import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { isPublicFormCaseId, publicFormCases, publicFormFixtureEnvelope } from "../../../../../packages/forms/parity-cases";
import { parsePublicForm, type PublicFormLoad } from "../../../features/public-forms/model";
import { PublicFormResponse } from "../../../features/public-forms/response";
import { PublicFormScreen } from "../../../features/public-forms/screen";

export default function InternalPublicFormFixture() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const router = useRouter();
  if (!isPublicFormCaseId(caseId)) return <Redirect href="/" />;
  const { entry, status } = publicFormCases[caseId];
  const state: PublicFormLoad = status === "missing" ? { status } : parsePublicForm(publicFormFixtureEnvelope(caseId), entry);
  const back = () => router.replace("/");
  const noOp = () => {};
  return <PublicFormScreen key={caseId} state={state} locale="id" access="anonymous" onBack={back}
    onRetry={noOp} onLogin={noOp} onWeb={noOp} onMeet={noOp}>
    {state.status === "ready" && <PublicFormResponse form={state.form} locale="id" signedIn={false}
      onSubmit={async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 1_000));
        return { status: "sent" };
      }} onUpload={async () => ({ status: "cancelled" })}
      onLogin={noOp} onWeb={noOp} onCheck={noOp} onDone={back} />}
  </PublicFormScreen>;
}
