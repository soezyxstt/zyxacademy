import { useEffect, useMemo, useRef, useState } from "react";
import {
  createAssessmentFixtureGateway, type AssessmentContext, type AssessmentGateway,
} from "../../../../../packages/native-parity/academic/assessment";
import type { AcademicScreenProps } from "../contracts";
import { CourseTheme } from "../courses/ui";
import { QuizAttempts, QuizGrading } from "./grading";
import { Quizzes } from "./quizzes";
import { Tryouts } from "./tryouts";
import { AssessmentNotice, AssessmentPage } from "./ui";

export { QuizEditor, type QuizEditorProps } from "./editor";

export type AssessmentScreenProps = AcademicScreenProps & { gateway?: AssessmentGateway };

export function AssessmentScreen(props: AssessmentScreenProps) {
  const { path, params, actor, scenario, theme } = props;
  const [fallback] = useState(createAssessmentFixtureGateway);
  const gateway = props.gateway ?? fallback;
  const admin = path.startsWith("/admin/");
  const courseId = params.courseId;
  const slug = params.slug;
  const context: AssessmentContext = useMemo(() => ({
    actor: { id: actor.id, role: actor.role },
    scenario,
    scope: admin ? { kind: "admin", slug } : { kind: "tutor", courseId },
  }), [actor.id, actor.role, admin, courseId, slug, scenario]);

  const base = admin ? `/admin/courses/${encodeURIComponent(slug)}` : `/tutor/${encodeURIComponent(courseId)}`;
  const shared = { ...props, gateway, context, base };
  const parts = path.split("?")[0].split("/").filter(Boolean);
  const route = parts[admin ? 3 : 2];
  const leaf = parts[parts.length - 1];

  let screen;
  if (route === "tryouts") {
    screen = admin ? <Tryouts {...shared} /> : <TutorTryoutsAlias {...shared} />;
  } else if (route === "quizzes") {
    if (leaf === "attempts" && !admin) screen = <QuizAttempts {...shared} />;
    else if (leaf === "grading" && !admin) screen = <QuizGrading {...shared} />;
    else if (leaf === "quizzes" || leaf === "new" || leaf === "edit") {
      const mode = leaf === "quizzes" ? "list" : leaf;
      screen = gateway.canMutate || mode === "list" ? <Quizzes {...shared} mode={mode} />
        : <AssessmentPage title="Penyuntingan kuis" back={() => props.replace(`${base}/quizzes`)} backLabel="Kembali ke kuis">
          <AssessmentNotice message="Penyuntingan kuis tersedia di web." />
        </AssessmentPage>;
    }
  }
  return (
    <CourseTheme.Provider value={theme}>
      {screen ?? <AssessmentPage title="Penilaian" back={props.back}><AssessmentNotice error message="Halaman penilaian tidak ditemukan." /></AssessmentPage>}
    </CourseTheme.Provider>
  );
}

function TutorTryoutsAlias({ actor, base, replace, back }: AcademicScreenProps & { base: string }) {
  const redirected = useRef(false);
  useEffect(() => {
    if (actor.role === "tutor" && !redirected.current) {
      redirected.current = true;
      replace(base);
    }
  }, [actor.role, replace, base]);
  return <AssessmentPage title="Tryout" back={back}>
    {actor.role !== "tutor" ? <AssessmentNotice error message="Akun ini tidak memiliki akses ke halaman Tutor." /> : null}
  </AssessmentPage>;
}
