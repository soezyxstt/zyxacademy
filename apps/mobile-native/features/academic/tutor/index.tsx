import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { parseTutorWeek } from "../../../../../packages/academic/tutor-support";
import { createTutorFixtureData, tutorFixtureCourses } from "../../../../../packages/native-parity/academic/tutor/fixtures";
import { matchesCourse, TutorDataError, type TutorDataSource } from "../../../../../packages/native-parity/academic/tutor/model";
import { Button } from "../../../components/Button";
import type { AcademicScreenProps } from "../contracts";
import { ConnectedDiscussions, ConnectedLive, ConnectedMaterials, ConnectedSchedule, ConnectedVideos } from "./connected";
import { TutorLive, TutorMaterials, TutorVideos } from "./content";
import { TutorCourseOverview, TutorDashboard, TutorGrading } from "./core";
import { TutorParticipants } from "./participants";
import { TutorDiscussions, TutorDocs, TutorSchedule } from "./support";
import { Empty, TutorPage, tutorLayout } from "./ui";

export type { TutorDataSource } from "../../../../../packages/native-parity/academic/tutor/model";

type TutorScreenProps = AcademicScreenProps & { dataSource?: TutorDataSource };

export function TutorScreen({ dataSource, ...props }: TutorScreenProps) {
  const { actor, scenario, path, params, theme, back } = props;
  const segments = path.split(/[?#]/, 1)[0].split("/").filter(Boolean);
  const route = segments[1];
  const nested = segments[2];
  const topLevel = !route || route === "docs" || route === "schedule" || route === "discussions";
  const courseId = topLevel ? undefined : params.courseId ?? route;

  const fixture = useMemo(() => createTutorFixtureData(actor, scenario), [actor.id, actor.role, scenario]);
  const source = dataSource ?? fixture;
  const fixturesEnabled = source.fixture === true;
  const fixtureIdentity = actor.id === "academic-tutor";
  const key = JSON.stringify([actor.id, actor.role, scenario, path, props.query]);

  if (actor.role !== "tutor" || (fixturesEnabled && !fixtureIdentity)) {
    return <Denied theme={theme} back={back} title="Pengajaran" />;
  }

  if (!route) return <DataView key={key} theme={theme} back={back} title="Dashboard pengajar" load={source.dashboard}>
    {(data) => <TutorDashboard {...props} data={data} />}
  </DataView>;

  if (route === "docs") return <TutorDocs key={key} {...props} slug={nested ? params.slug ?? nested : undefined} />;

  if (source.support && route === "schedule") {
    const service = source.support;
    const week = parseTutorWeek(props.query.week);
    return <DataView key={key} theme={theme} back={back} title="Jadwal mengajar" load={(signal) => service.schedule(week, signal)}>
      {(data) => <ConnectedSchedule {...props} week={week} data={data} editor={service.slotEditor} ticketEditor={service.ticketEditor} reload={(signal) => service.schedule(week, signal)} />}
    </DataView>;
  }
  if (source.support && route === "discussions") {
    return <ConnectedDiscussions key={key} {...props} service={source.support} />;
  }

  if (!courseId) return <DataView key={key} theme={theme} back={back} title={route === "schedule" ? "Jadwal mengajar" : "Diskusi"} load={source.dashboard}>
    {(data) => fixturesEnabled ? route === "schedule"
      ? <TutorSchedule {...props} populated={data.upcomingSessions.length > 0} repository={source.repository} />
      : <TutorDiscussions {...props} populated={data.courses.some((course) => course.groupCount > 0)} repository={source.repository} />
      : <UnconnectedRoute {...props} title={route === "schedule" ? "Jadwal mengajar" : "Diskusi"} />}
  </DataView>;

  if (nested === "participants") return <DataView key={key} theme={theme} back={back} title="Peserta dan kelompok" load={(signal) => source.participants(courseId, signal)}>
    {(data) => <TutorParticipants {...props} data={data} />}
  </DataView>;

  if (nested === "grading") return <DataView key={key} theme={theme} back={back} title="Penilaian tryout" load={(signal) => source.grading(courseId, signal)}>
    {(data) => <TutorGrading {...props} data={data} editor={source.support?.tryoutGrade}
      reload={(signal) => source.grading(courseId, signal)} onSave={source.saveGrade ? (id, grade) => source.saveGrade!(courseId, id, grade) : undefined} />}
  </DataView>;

  if (source.support) {
    const service = source.support;
    if (nested === "discussions") return <ConnectedDiscussions key={key} {...props} courseId={courseId} service={service} />;
    if (nested === "materials") return <DataView key={key} theme={theme} back={back} title="Dokumen" load={(signal) => service.materials(courseId, signal)}>
      {(data) => <ConnectedMaterials {...props} data={data} />}
    </DataView>;
    if (nested === "videos") return <DataView key={key} theme={theme} back={back} title="Video" load={(signal) => service.videos(courseId, signal)}>
      {(data) => <ConnectedVideos {...props} data={data} playback={service.playback} videoPlayer={service.videoPlayer} />}
    </DataView>;
    if (nested === "live") return <DataView key={key} theme={theme} back={back} title="Kuis langsung" load={(signal) => service.live(courseId, signal)}>
      {(data, refresh) => <ConnectedLive {...props} data={data} courseId={courseId} host={service.liveHost} refresh={refresh} />}
    </DataView>;
  }

  const titles: Record<string, string> = { discussions: "Diskusi", materials: "Dokumen", videos: "Video", live: "Kuis langsung" };
  const title = titles[nested] ?? "Ringkasan";
  return <DataView key={key} theme={theme} back={back} title={title} load={async (signal) => {
    const dashboard = await source.dashboard(signal);
    const courses = fixturesEnabled && scenario === "empty" ? tutorFixtureCourses : dashboard.courses;
    const course = courses.find((entry) => matchesCourse(entry, courseId));
    if (!course) throw new TutorDataError(403);
    return fixturesEnabled && scenario === "empty" ? { ...course, groupCount: 0 } : course;
  }}>
    {(course) => {
      if (!nested) return <TutorCourseOverview {...props} course={course} source={source} />;
      if (!fixturesEnabled) return <UnconnectedRoute {...props} title={title} subtitle={course.title} />;
      const populated = course.courseId === tutorFixtureCourses[0].courseId && scenario !== "empty";
      const courseProps = { ...props, courseTitle: course.title, populated, repository: source.repository };
      switch (nested) {
        case "discussions": return <TutorDiscussions {...courseProps} courseId={courseId} />;
        case "materials": return <TutorMaterials {...courseProps} />;
        case "videos": return <TutorVideos {...courseProps} />;
        case "live": return <TutorLive {...courseProps} courseId={courseId} />;
        default: return <TutorPage theme={theme} title={course.title} onBack={back}><Empty theme={theme} title="Halaman tidak ditemukan" /></TutorPage>;
      }
    }}
  </DataView>;
}

type LoadState<T> = { state: "loading" } | { state: "error"; denied: boolean } | { state: "ready"; data: T };

function DataView<T>({ theme, back, title, load, children }: Pick<AcademicScreenProps, "theme" | "back"> & {
  title: string;
  load(signal: AbortSignal): Promise<T>;
  children(data: T, refresh: () => void): ReactNode;
}) {
  const [result, setResult] = useState<LoadState<T>>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setResult({ state: "ready", data }); },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          const denied = error instanceof TutorDataError && (error.status === 401 || error.status === 403 || error.status === 404);
          setResult({ state: "error", denied });
        }
      },
    );
    return () => controller.abort();
  }, [attempt, load]);

  function retry() {
    setResult({ state: "loading" });
    setAttempt((previous) => previous + 1);
  }

  if (result.state === "ready") return children(result.data, retry);
  if (result.state === "error" && result.denied) return <Denied theme={theme} back={back} title={title} />;

  return <TutorPage theme={theme} title={title} onBack={back}>
    {result.state === "loading" ? <ActivityIndicator accessibilityLabel="Memuat data" /> : (
      <View style={tutorLayout.group}>
        <Empty theme={theme} title="Data gagal dimuat" />
        <Button theme={theme} variant="outline" style={tutorLayout.action} onPress={retry}>Coba lagi</Button>
      </View>
    )}
  </TutorPage>;
}

function Denied({ theme, back, title }: Pick<AcademicScreenProps, "theme" | "back"> & { title: string }) {
  return <TutorPage theme={theme} title={title} onBack={back}>
    <Empty theme={theme} title="Akses ditolak" description="Halaman ini memerlukan penugasan tutor yang aktif." />
  </TutorPage>;
}

function UnconnectedRoute({ theme, back, title, subtitle }: Pick<AcademicScreenProps, "theme" | "back"> & { title: string; subtitle?: string }) {
  return <TutorPage theme={theme} title={title} subtitle={subtitle} onBack={back}>
    <Empty theme={theme} title="Fitur ini tersedia di Zyx web" />
  </TutorPage>;
}
