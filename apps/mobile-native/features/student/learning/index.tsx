import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { courseHref, learningRequestPath, learningRouteViews, liveHostPattern, type LearningData, type LearningView } from "../../../../../packages/native-parity/student/learning/contracts";
import type { StudentScreenProps } from "../contracts";
import { CourseScreen } from "../courses";
import { FlashcardsContent } from "./flashcards";
import { ConceptContent, MasteryContent, ProgressContent, StudyPathContent } from "./knowledge";
import { LiveContent, PlaygroundContent, VideoContent } from "./media";
import { PkaHomeContent, PkaReportContent, PkaScheduleContent, PkaSimulationContent, PkaStageContent, pkaStageTitle } from "./pka";
import { Copy, LearningPage, Message, Section, english, launchWeb, readJson, RequestError, translator, type Translate } from "./ui";

export { learningRouteViews, liveHostPattern } from "../../../../../packages/native-parity/student/learning/contracts";

const titleKeys: Partial<Record<LearningView, string>> = {
  concept: "learning.conceptPage.title", flashcard: "learning.flashcards.pageTitle", mastery: "learning.mastery.title",
  path: "learning.path.title", progress: "learning.progress.title", video: "learning.videoPage.title", live: "live.courseLiveTitle",
  "pka-home": "pka.homeTitle", "pka-registration": "pka.joinTitle", "pka-schedule": "pka.schedulePageTitle",
  "pka-report": "pka.reportPageTitle", "pka-simulation": "pka.simulationPageTitle",
};
const lockedCopy: Partial<Record<LearningView, string>> = {
  concept: "learning.conceptPage.activateToExplore", flashcard: "learning.flashcards.lockedDescription", mastery: "learning.mastery.activateToView",
  path: "learning.path.lockedDescription", progress: "learning.progress.enterToken",
};

function ReadyContent({ data, props, reload, t }: { data: Extract<LearningData, { state: "ready" }>; props: StudentScreenProps; reload: () => void; t: Translate }) {
  switch (data.view) {
    case "concept": return <ConceptContent data={data} props={props} t={t} />;
    case "flashcard": return <FlashcardsContent cards={data.cards} props={props} reload={reload} t={t} />;
    case "mastery": return <MasteryContent data={data} props={props} t={t} />;
    case "path": return <StudyPathContent props={props} t={t} />;
    case "playground": return <PlaygroundContent props={props} />;
    case "progress": return <ProgressContent data={data} props={props} t={t} />;
    case "video": return <VideoContent data={data} props={props} t={t} />;
    case "live": return <LiveContent data={data} props={props} t={t} />;
    case "pka-home": return <PkaHomeContent data={data} props={props} t={t} />;
    case "pka-registration": return <Message>{t("pka.registrationClosed")}</Message>;
    case "pka-schedule": return <PkaScheduleContent data={data} props={props} t={t} />;
    case "pka-report": return <PkaReportContent data={data} t={t} />;
    case "pka-simulation": return <PkaSimulationContent data={data} props={props} t={t} />;
    case "pka-stage": return <PkaStageContent data={data} props={props} t={t} />;
    case "pka-material": return null;
  }
}

function LiveHostAlias(props: StudentScreenProps) {
  const t = translator(props.session.locale);
  const target = `/tutor/${encodeURIComponent(props.route.params.id)}/live`;
  const [failed, setFailed] = useState(false);
  const isEnglish = english(props.session.locale);
  return <LearningPage props={props} title={t("live.hostTitle")}>
    <Message action={isEnglish ? "Open tutor page" : "Buka halaman tutor"} onAction={() => setFailed(!launchWeb(props, target))}>{t("live.hostUnavailable")}</Message>
    {failed ? <Message>{isEnglish ? "Could not open the tutor page." : "Halaman tutor tidak dapat dibuka."}</Message> : null}
  </LearningPage>;
}

type ReadState = { key: string; data?: LearningData; status?: number };

function LearningRoute({ props, view }: { props: StudentScreenProps; view: LearningView }) {
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<ReadState>();
  const { request, replace, route, session } = props;
  const queryPath = `${learningRequestPath(view, route.params, route.query)}&locale=${encodeURIComponent(session.locale)}`;
  const key = JSON.stringify([session.userId, session.origin, queryPath, generation]);
  const current = state?.key === key ? state : undefined;
  const data = current?.data;
  const t = translator(session.locale);
  const isEnglish = english(session.locale);
  const courseTitle = data && "courseTitle" in data ? data.courseTitle : "";
  const reload = () => setGeneration((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    readJson<LearningData>(request, queryPath, { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      if (data.view !== view) throw new Error("Unexpected learning view");
      setState({ key, data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ key, status: error instanceof RequestError ? error.status : 0 });
    });
    return () => controller.abort();
  }, [key, queryPath, request, view]);

  const redirectTo = data?.state === "redirect" ? data.path : null;
  useEffect(() => {
    if (redirectTo === "/courses/tutorial-pka" || redirectTo === "/courses/tutorial-pka/daftar") replace(redirectTo);
  }, [redirectTo, replace]);

  if (data?.state === "ready" && data.view === "pka-material") {
    return <CourseScreen {...props} route={{ ...route, pattern: route.params.materialId ? "/courses/[id]/material/[materialId]" : "/courses/[id]/material",
      params: { ...route.params, id: "tutorial-pka" } }} />;
  }
  const title = data?.state === "ready" && data.view === "concept" ? data.concept.conceptName
    : data?.state === "ready" && data.view === "pka-stage" ? pkaStageTitle(route.params.subject, data.stage.stage, t)
    : titleKeys[view] && (courseTitle || view.startsWith("pka-")) ? t(titleKeys[view]!, { course: courseTitle })
    : view === "playground" ? "Playground Python" : isEnglish ? "Learning" : "Pembelajaran";
  let content;
  if (data?.state === "ready") content = <ReadyContent data={data} props={props} t={t} reload={reload} />;
  else if (data?.state === "locked" || current?.status === 403) content = <Section title={t("learning.courseAccess.limited")}>
    <Copy muted>{lockedCopy[view] ? t(lockedCopy[view]!) : isEnglish ? "Access to this course is limited." : "Akses kelas ini terbatas."}</Copy>
    {route.params.id ? <Message action={isEnglish ? "Activate course" : "Aktifkan kelas"} onAction={() => props.navigate(courseHref(route.params.id))}>
      {t("learning.courseAccess.needToken")}
    </Message> : null}
  </Section>;
  else if (current?.status === 404 || current?.status === 400) content = <Message action={isEnglish ? "Back" : "Kembali"} onAction={props.back}>
    {isEnglish ? "This page is unavailable." : "Halaman ini tidak tersedia."}
  </Message>;
  else if (current?.status !== undefined) content = <Message action={isEnglish ? "Retry" : "Coba lagi"} onAction={reload}>
    {current.status === 401 || current.status === 409
      ? isEnglish ? "Your session changed. Sign in again to continue." : "Sesi Anda berubah. Masuk lagi untuk melanjutkan."
      : isEnglish ? "Could not load learning data. Check your connection and try again." : "Data belajar gagal dimuat. Periksa koneksi dan coba lagi."}
  </Message>;
  else content = <ActivityIndicator accessibilityLabel={isEnglish ? "Loading" : "Memuat"} />;
  return <LearningPage props={props} title={title} ready={Boolean(current)}>{content}</LearningPage>;
}

export function LearningScreen(props: StudentScreenProps) {
  if (props.route.pattern === liveHostPattern) return <LiveHostAlias {...props} />;
  const view = learningRouteViews[props.route.pattern as keyof typeof learningRouteViews];
  if (!view) return <LearningPage props={props} title={english(props.session.locale) ? "Learning" : "Pembelajaran"}>
    <Message>{english(props.session.locale) ? "This page is unavailable." : "Halaman ini tidak tersedia."}</Message>
  </LearningPage>;
  return <LearningRoute key={JSON.stringify([props.session.userId, props.session.origin, props.session.locale, props.route.path, props.route.query])} props={props} view={view} />;
}
