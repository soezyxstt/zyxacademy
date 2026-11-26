import { usePageTitle } from "../../../routing/visible-navbar-title";
import { useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { type CourseFixture, courseFixtures } from "../../../../../packages/native-parity/academic/courses/fixtures";
import {
  adminCoursePath, completedCourseAttempts, resolveAdminCourseAlias, type AdminCourse, type AdminCourseLiveRead, type LiveCourseRead,
} from "../../../../../packages/native-parity/academic/courses/model";
import { useAdministrationSnapshot } from "../administration/provider";
import type { AcademicScreenProps } from "../contracts";
import { NativeCompactShell } from "../../shared-ui";
import { CourseAnalytics, QuizAnalyticsDetail } from "./analytics";
import { CourseLeaderboard } from "./leaderboard";
import { CourseDocumentDetail, CourseDocuments, CourseQuestions } from "./content";
import { CourseFlashcards, CourseVideos } from "./media";
import { LiveCourseSection } from "./live-sections";
import { isAdminCourseLiveSection } from "../../../../../packages/native-parity/academic/courses/sections";
import { CourseList, CourseOverview, CourseSettings } from "./overview";
import { AdminCourseFixtureContext } from "./scope";
import { Action, CourseStatus, DataRow, Ink, Metrics, PendingCourses, Tabs, CourseTheme, layout } from "./ui";

export { AdminCourseFixtureProvider } from "./scope";
export type { AdminCourse, AdminChapter, AdminCourseOverview, AdminCourseLiveRead, LiveCourseRead } from "../../../../../packages/native-parity/academic/courses/model";
export type CourseScreenProps = AcademicScreenProps & { live?: AdminCourseLiveRead };

const sections = [
  { id: "documents", label: "Dokumen" },
  { id: "videos", label: "Video" },
  { id: "questions", label: "Bank soal" },
  { id: "flashcards", label: "Kartu belajar" },
  { id: "quizzes", label: "Kuis" },
  { id: "tryouts", label: "Tryout" },
  { id: "results", label: "Hasil kuis" },
  { id: "analytics", label: "Analitik kuis" },
  { id: "leaderboard", label: "Peringkat" },
  { id: "review", label: "Tinjau materi" },
  { id: "settings", label: "Pengaturan" },
] as const;
const fixtureCourseIds = new Set(courseFixtures.map(({ course }) => course.id));

export function CourseScreen(props: CourseScreenProps) {
  return (
    <CourseTheme.Provider value={props.theme}>
      {props.actor.role !== "admin" ? (
        <CoursePage title="Mata kuliah" back={props.back}><CourseStatus label="Akses ditolak." error /></CoursePage>
      ) : <CourseRoute {...props} />}
    </CourseTheme.Provider>
  );
}

function CourseRoute(props: CourseScreenProps) {
  const { path, params, query, replace } = props;
  const segments = path.split(/[?#]/, 1)[0].split("/").filter(Boolean);
  const section = segments[3];
  const isList = segments.length === 2;
  const slug = params.slug;
  const alias = !isList && !section && slug ? resolveAdminCourseAlias(slug, query.tab) : null;
  useEffect(() => {
    if (alias) replace(alias);
  }, [alias, replace]);
  if (alias) return <CoursePage title="Mata kuliah" back={props.back}><PendingCourses /></CoursePage>;
  if (props.live) return <LiveCourseRoute {...props} live={props.live} isList={isList} section={section} />;
  return <FixtureCourseRoute {...props} isList={isList} section={section} />;
}

function CoursePage({ title, subtitle, back, children, scroll = true }: {
  title: string; subtitle?: string; back(): void; children: ReactNode; scroll?: boolean;
}) {
  const pageTitle = usePageTitle(title);
  const theme = useContext(CourseTheme);
  const content = (
    <>
      {subtitle ? <Ink kind="meta" tone="muted">{subtitle}</Ink> : null}
      {children}
    </>
  );
  return (
    <NativeCompactShell
      theme={theme}
      edges={[]}
      navigationTitle={pageTitle}
      back={{ label: "Kembali", onPress: back }}
    >
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={layout.scrollBody}>
          {content}
        </ScrollView>
      ) : <View style={layout.listBody}>{content}</View>}
    </NativeCompactShell>
  );
}

function LiveStatus<T>({ read, retry, children }: {
  read: LiveCourseRead<T> | undefined; retry(): void; children(data: T): ReactNode;
}) {
  if (read?.status === "ready") return children(read.data);
  if (!read || read.status === "loading") return <PendingCourses />;
  if (read.status === "missing") return <CourseStatus label="Mata kuliah tidak ditemukan." error />;
  if (read.status === "denied") return <CourseStatus label="Akses ditolak." error />;
  return <CourseStatus label="Data mata kuliah gagal dimuat." retry={retry} error />;
}

function LiveCourseRoute({ live, isList, section, actor, navigate, replace, query, back }: CourseScreenProps & {
  live: AdminCourseLiveRead; isList: boolean; section?: string;
}) {
  if (section) {
    const data = live.section?.status === "ready" ? live.section.data : null;
    return (
      <CoursePage title={data?.course.title ?? "Mata kuliah"} back={back}
        subtitle={data ? `${data.course.category} · ${data.course.id}` : undefined}>
        <LiveStatus read={live.section} retry={live.retry}>
          {(payload) => (
            <>
              <Ink kind="heading">{sections.find((item) => item.id === section)?.label}</Ink>
              <LiveCourseSection data={payload} query={query} navigate={navigate} updateSettings={live.updateSettings} updateMaterial={live.updateMaterial}
                removeVideo={live.removeVideo} removeQuestion={live.removeQuestion} flashcardEditor={live.flashcardEditor} videoPlayer={live.videoPlayer} archiveCourse={live.archiveCourse} onArchived={() => replace("/admin/courses")} refresh={live.retry} />
            </>
          )}
        </LiveStatus>
      </CoursePage>
    );
  }
  if (isList) {
    const status = live.list?.status ?? "loading";
    return (
      <CoursePage title="Mata kuliah" back={back} scroll={false}>
        {status === "denied" || status === "missing" ? <CourseStatus error
          label={status === "denied" ? "Akses ditolak." : "Mata kuliah tidak ditemukan."} /> : (
          <CourseList courses={live.list?.status === "ready" ? live.list.data : []} actor={actor}
            navigate={navigate} allowCreate={status === "ready" && !!live.createCourse} createCourse={live.createCourse}
            initialSearch={query.search ?? ""} initialCategory={query.category ?? ""}
            pending={status === "loading"} readError={status === "error"} retry={live.retry} />
        )}
      </CoursePage>
    );
  }
  const detail = live.detail?.status === "ready" ? live.detail.data : null;
  return (
    <CoursePage title={detail?.course.title ?? "Mata kuliah"} back={back}>
      <LiveStatus read={live.detail} retry={live.retry}>
        {(data) => <CourseOverview data={data} actor={actor} navigate={navigate}
          liveChapterEditor={live.saveChapter ? { save: live.saveChapter, archive: live.archiveChapter,
            reorder: live.reorderChapters, refresh: live.retry } : undefined} />}
      </LiveStatus>
      {detail ? <CourseMenu course={detail.course} navigate={navigate} live /> : null}
    </CoursePage>
  );
}

const emptySnapshot: readonly CourseFixture[] = [];
const getEmptySnapshot = () => emptySnapshot;
const ignoreSubscription = () => () => undefined;

function FixtureCourseRoute({ isList, section, ...props }: AcademicScreenProps & { isList: boolean; section?: string }) {
  const { actor, scenario, params, query, navigate, back } = props;
  const store = useContext(AdminCourseFixtureContext);
  const snapshot = useSyncExternalStore(store?.subscribe ?? ignoreSubscription, store?.getSnapshot ?? getEmptySnapshot, store?.getSnapshot ?? getEmptySnapshot);
  const [failed, setFailed] = useState(scenario === "error");
  if (!store) return <CoursePage title="Mata kuliah" back={back}><CourseStatus label="Sesi data lokal belum tersedia." error /></CoursePage>;
  if (failed) return (
    <CoursePage title="Mata kuliah" back={back}>
      <CourseStatus label="Data mata kuliah gagal dimuat." retry={() => setFailed(false)} error />
    </CoursePage>
  );
  if (isList) {
    const courses = snapshot.filter(({ course }) => scenario !== "empty" || !fixtureCourseIds.has(course.id))
      .map(({ course, pricing }) => ({ ...course, pricing: pricing.category }));
    return (
      <CoursePage title="Mata kuliah" back={back} scroll={false}>
        <CourseList courses={courses} actor={actor} navigate={navigate} allowCreate
          initialSearch={query.search ?? ""} initialCategory={query.category ?? ""} />
      </CoursePage>
    );
  }
  const data = snapshot.find((entry) => entry.course.slug === params.slug);
  if (!data) return <CoursePage title="Mata kuliah" back={back}><CourseStatus label="Mata kuliah tidak ditemukan." error /></CoursePage>;

  const routeTitle = sections.find((item) => item.id === section)?.label;
  const view = (() => {
    if (!section) return <CourseOverview data={data} fixture={data} actor={actor} navigate={navigate} />;
    switch (section) {
      case "documents": {
        if (!params.materialId) return <CourseDocuments data={data} actor={actor} initialTab={query.tab} initialChapter={query.chapter} navigate={navigate} />;
        const document = data.documents.find((item) => item.id === params.materialId);
        return document ? <CourseDocumentDetail actor={actor} data={data} document={document} initialMode={query.mode} />
          : <CourseStatus label="Dokumen tidak ditemukan." error />;
      }
      case "videos": return <CourseVideos data={data} actor={actor} />;
      case "questions": return <CourseQuestions data={data} actor={actor} initialChapter={query.chapter} />;
      case "flashcards": return <CourseFlashcards data={data} actor={actor} />;
      case "results": return <CourseAnalytics data={data} navigate={navigate} results />;
      case "analytics": {
        if (!params.quizId) return <CourseAnalytics data={data} navigate={navigate} />;
        const quiz = data.quizzes.find((item) => item.id === params.quizId);
        return quiz ? <QuizAnalyticsDetail data={data} actor={actor} quiz={quiz} initialTab={query.tab} />
          : <CourseStatus label="Kuis tidak ditemukan pada mata kuliah ini." error />;
      }
      case "leaderboard": return <CourseLeaderboard attempts={completedCourseAttempts(data.attempts).map((item) => {
        const quiz = data.quizzes.find((entry) => entry.id === item.quizId);
        return { ...item, title: quiz?.title ?? "Kuis", category: quiz?.category === "Simulasi" ? "simulation" : "quiz", submittedAt: item.date };
      })} />;
      case "review": return <CourseReview data={data} initialTab={query.tab ?? query.section} navigate={navigate} />;
      case "settings": return <CourseSettings data={data} actor={actor} back={back} navigate={navigate} />;
      default: return <CourseStatus label="Bagian mata kuliah tidak ditemukan." error />;
    }
  })();

  return (
    <CoursePage title={data.course.title} subtitle={section ? `${data.course.category} · ${data.course.id}` : undefined} back={back}>
      {routeTitle ? <Ink kind="heading">{routeTitle}</Ink> : null}
      {view}
      {!section ? <CourseMenu course={data.course} navigate={navigate} /> : null}
    </CoursePage>
  );
}

function CourseMenu({ course, navigate, live }: { course: AdminCourse; navigate(path: string): void; live?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <DataRow title="Kelola mata kuliah" testID="course-menu" expanded={open} detail={open ? "⌃" : "⌄"} onPress={() => setOpen(!open)} />
    {open ? <View style={layout.group}>
      {sections.filter((section) => !live || isAdminCourseLiveSection(section.id)).map((section) => (
        <DataRow key={section.id} title={section.label} testID={`course-link-${section.id}`} onPress={() => {
          setOpen(false);
          navigate(adminCoursePath(course.slug, section.id));
        }} />
      ))}
      {course.description ? <Ink>{course.description}</Ink> : null}
      <Metrics values={[
        { label: "Bab", value: course.chapterCount }, { label: "Dokumen", value: course.materialCount }, { label: "Kuis", value: course.quizCount },
      ]} />
    </View> : null}
  </>;
}

const reviewStatuses = {
  validated: "Menunggu tinjauan",
  approved: "Disetujui",
  rejected: "Ditolak",
  changes_requested: "Perlu revisi",
  published: "Terbit",
  withdrawn: "Publikasi ditarik",
};

function CourseReview({ data, initialTab, navigate }: {
  data: CourseFixture; initialTab?: string; navigate(path: string): void;
}) {
  const snapshot = useAdministrationSnapshot();
  const [tab, setTab] = useState<"idea" | "product">(initialTab === "product" ? "product" : "idea");
  const records = snapshot.records.bundles.filter((bundle) => bundle.courseId === data.course.id && bundle.kind === tab);
  return (
    <>
      <Tabs<"idea" | "product"> options={[{ id: "idea", label: "Idea Bundle" }, { id: "product", label: "Product Bundle" }]} selected={tab} onSelect={setTab} />
      {records.length ? records.map((bundle) => (
        <DataRow key={bundle.id} title={bundle.title} description={bundle.source} detail={reviewStatuses[bundle.status]}
          testID={`course-review-${bundle.id}`} onPress={() => navigate(adminCoursePath(data.course.slug, `review/${tab}`, bundle.id))} />
      )) : <CourseStatus label="Belum ada bundle untuk ditinjau." />}
    </>
  );
}
