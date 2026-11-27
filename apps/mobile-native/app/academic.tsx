import { useLocalSearchParams, useRouter } from "expo-router";
import { useColorScheme } from "react-native";
import { AcademicFixtureEntry } from "../features/academic/FixtureEntry";

export default function AcademicFixtureRoute() {
  const params = useLocalSearchParams<{ path?: string; role?: string; scenario?: string; theme?: string; evidence?: string; evidenceNonce?: string }>();
  const router = useRouter();
  const systemTheme = useColorScheme();
  const role = params.role === "admin" || params.role === "student" ? params.role : "tutor";
  const theme = params.theme === "light" || params.theme === "dark" ? params.theme : systemTheme ?? "light";
  return <AcademicFixtureEntry
    evidence={params.evidence ? Number(params.evidence) : undefined} evidenceNonce={params.evidenceNonce}
    initialPath={typeof params.path === "string" ? params.path : role === "admin" ? "/admin/courses" : "/tutor"}
    actor={{ role, id: `academic-${role}` }} theme={theme === "dark" ? "dark" : "light"}
    scenario={params.scenario === "empty" || params.scenario === "error" ? params.scenario : "populated"}
    onExit={() => router.canGoBack() ? router.back() : router.replace("/")}
  />;
}
