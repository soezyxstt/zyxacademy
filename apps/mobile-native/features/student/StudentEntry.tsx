import { useMemo } from "react";
import { Text } from "react-native";
import type { StudentScreenProps, StudentServices } from "./contracts";
import { CourseScreen } from "./courses";
import { LearningScreen } from "./learning";
import { CommunityScreen } from "./community";
import { AssessmentScreen } from "./assessment";
import { matchStudentRoute } from "./routes";
import { bindStudentRequest } from "./transport";

export type StudentEntryProps = Omit<StudentScreenProps, "route"> & {
  path: string;
  /** Unique for each navigation stack entry, stable for query-only replacements. */
  entryKey: string;
};

const screens = { courses: CourseScreen, learning: LearningScreen, community: CommunityScreen, assessment: AssessmentScreen };

function SessionScreen({ path, entryKey, ...props }: StudentEntryProps) {
  const route = useMemo(() => matchStudentRoute(path), [path]);
  const { session, request: transport } = props;
  const request = useMemo(() => bindStudentRequest(session, transport),
    [session.userId, session.origin, session.locale, transport]);
  if (!route) return <Text accessibilityRole="alert">Halaman tidak ditemukan.</Text>;
  const Screen = screens[route.area];
  return <Screen key={entryKey} {...props} route={route} request={request} />;
}

export function studentSessionKey(session: StudentServices["session"]): string {
  return JSON.stringify([session.origin, session.userId, session.sessionId, session.locale]);
}

export function StudentEntry(props: StudentEntryProps) {
  if (props.session?.role !== "student" || !props.session.userId) {
    return <Text accessibilityRole="alert">Masuk dengan akun peserta.</Text>;
  }
  return <SessionScreen key={studentSessionKey(props.session)} {...props} />;
}
