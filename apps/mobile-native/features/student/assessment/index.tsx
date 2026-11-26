import { useCallback, useEffect, useState } from "react";
import type { StudentScreenProps } from "../contracts";
import { assessmentPatterns, type AssessmentPage } from "../../../../../packages/native-parity/student/assessment/contract";
import { assessmentRequest, AssessmentRequestError, assessmentRoutePath } from "./client";
import { AssessmentList, QuizDetail, ResultsPage, ReviewPage, SummaryPage, TryoutDetail } from "./pages";
import { SolutionReader } from "./solutions";
import { AssessmentContext, Busy, Frame, Message, useAssessment, useAssessmentCopy } from "./ui";

export { assessmentPatterns };

type ReadState = { path: string; revision: number; page?: AssessmentPage; error?: unknown };

function expectedPage(pattern: string): AssessmentPage["kind"] | undefined {
  switch (pattern) {
    case "/courses/[id]/quiz": return "quiz-list";
    case "/courses/[id]/quiz/[quizId]": return "quiz-detail";
    case "/courses/[id]/tryout": return "tryout-list";
    case "/courses/[id]/tryout/[tryoutId]": return "tryout-detail";
    case "/courses/[id]/my-results": return "results";
    case "/courses/[id]/my-results/[submissionId]": return "review";
    case "/courses/[id]/my-results/[submissionId]/summary": case "/courses/[id]/quiz/[quizId]/summary/[attemptId]": return "summary";
    case "/courses/[id]/solutions/[collectionId]": return "solutions";
  }
}

function AssessmentContent() {
  const props = useAssessment();
  const { route, request } = props;
  const { tx, messages } = useAssessmentCopy();
  const path = assessmentRoutePath(route);
  const expected = expectedPage(route.pattern);
  const version = route.query.submitted ?? "";
  const [revision, setRevision] = useState(0);
  const [read, setRead] = useState<ReadState | null>(null);
  const reload = useCallback(() => setRevision((index) => index + 1), []);
  const identity = `${path}|${version}`;
  useEffect(() => {
    const controller = new AbortController();
    void assessmentRequest<AssessmentPage>(request, path, { signal: controller.signal }).then((page) => {
      if (page.kind !== expected || typeof page.courseTitle !== "string") throw new Error("Unexpected assessment page");
      if (!controller.signal.aborted) setRead({ path: identity, revision, page });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setRead({ path: identity, revision, error });
    });
    return () => controller.abort();
  }, [expected, identity, path, request, revision]);
  const data = read?.path === identity ? read.page : undefined;
  const error = read?.path === identity && read.revision === revision ? read.error : undefined;
  const loadingTitle = expected === "solutions" ? messages.solutionCollection.solution : tx("Asesmen", "Assessment");
  if (error) {
    const status = error instanceof AssessmentRequestError ? error.status : null;
    const forbidden = status === 401 || status === 403 || status === 404 || status === 409;
    return <Frame title={loadingTitle}><Message title={forbidden ? tx("Asesmen tidak tersedia", "Assessment unavailable") : tx("Asesmen belum dapat dimuat", "Could not load the assessment")}
      detail={status === 401 ? tx("Masuk kembali untuk melanjutkan.", "Sign in again to continue.") : undefined}
      error action={tx("Coba lagi", "Try again")} onPress={reload} /></Frame>;
  }
  if (!data) return <Frame title={loadingTitle}><Busy /></Frame>;
  switch (data.kind) {
    case "quiz-list": case "tryout-list": return <AssessmentList data={data} />;
    case "quiz-detail": return <QuizDetail key={path} data={data} />;
    case "tryout-detail": return <TryoutDetail key={path} data={data} />;
    case "results": return <ResultsPage data={data} />;
    case "review": return <ReviewPage key={path} review={data.review} />;
    case "summary": return <SummaryPage key={path} data={data} reload={reload} />;
    case "solutions": return <SolutionReader key={`${data.id}:${data.version}`} data={data} reload={reload} />;
  }
}

export function AssessmentScreen(props: StudentScreenProps) {
  return <AssessmentContext.Provider value={props}><AssessmentContent /></AssessmentContext.Provider>;
}
