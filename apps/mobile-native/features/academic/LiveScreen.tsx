import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Button } from "../../components/Button";
import { nativeTypography } from "../../typography";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { matchAcademicRoute } from "../../../../packages/native-parity/academic/match";
import type { AdminCourse, AdminCourseOverview, LiveCourseRead } from "../../../../packages/native-parity/academic/courses/model";
import { TutorDataError } from "../../../../packages/native-parity/academic/tutor/model";
import { createAcademicClient, type AcademicTransport } from "./client";
import { CourseScreen } from "./courses";
import { TutorScreen } from "./tutor";
import type { AcademicScreenProps } from "./contracts";

export function AcademicMessage({ theme, back, children }: Pick<AcademicScreenProps, "theme" | "back"> & { children: string }) {
  const colors = nativeColors[theme];
  return <View style={{ flex: 1, gap: 12, padding: 16, backgroundColor: colors.background }}>
    <Text accessibilityRole="alert" style={[nativeTypography.bodyMedium, { color: colors.foreground }]}>{children}</Text>
    <Button theme={theme} variant="outline" onPress={back}>Kembali</Button>
  </View>;
}

type LiveProps = Pick<AcademicScreenProps, "actor" | "theme" | "navigate" | "replace" | "back"> & {
  href: string;
  transport: AcademicTransport;
};

function useCourseRead<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<LiveCourseRead<T>>({ status: "loading" });
  const [attempt, changeAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    load(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ status: "ready", data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const code = error instanceof TutorDataError ? error.status : 0;
      setState({ status: code === 401 || code === 403 ? "denied" : code === 404 ? "missing" : "error" });
    });
    return () => controller.abort();
  }, [load, attempt]);
  return [state, () => changeAttempt(i => i + 1)] as const;
}

function LiveCourseList(props: AcademicScreenProps & { read: (signal: AbortSignal) => Promise<AdminCourse[]> }) {
  const [list, retry] = useCourseRead(props.read);
  return <CourseScreen {...props} live={{ list, retry }} />;
}

function LiveCourseDetail(props: AcademicScreenProps & { read: (slug: string, signal: AbortSignal) => Promise<AdminCourseOverview> }) {
  const { read, params: { slug } } = props;
  const load = useCallback((signal: AbortSignal) => read(slug, signal), [read, slug]);
  const [detail, retry] = useCourseRead(load);
  return <CourseScreen {...props} live={{ detail, retry }} />;
}

/** Product entry. Transport and actor must come from the same authenticated host session. */
export function AcademicLiveScreen({ href, transport, ...host }: LiveProps) {
  const match = matchAcademicRoute(href);
  const client = useMemo(() => createAcademicClient(transport), [transport]);
  if (!match || transport.accountId !== host.actor.id ||
      host.actor.role !== (match.path.startsWith("/admin/") ? "admin" : "tutor")) {
    return <AcademicMessage {...host}>Akses ditolak.</AcademicMessage>;
  }
  const props: AcademicScreenProps = { ...host, ...match, scenario: "populated" };
  const key = JSON.stringify([host.actor.id, host.actor.role, transport.origin, transport.locale, href]);
  if (match.feature === "tutor") return <TutorScreen key={key} {...props} dataSource={client.tutor} />;
  if (match.pattern === "/admin/courses") return <LiveCourseList key={key} {...props} read={client.courses} />;
  if (match.pattern === "/admin/courses/[slug]") return <LiveCourseDetail key={key} {...props} read={client.course} />;
  return <AcademicMessage {...host}>Sumber data halaman ini belum terhubung.</AcademicMessage>;
}
