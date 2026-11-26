import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openDatabaseAsync } from "expo-sqlite";
import { createAssessmentDraftRepository } from "./assessment-draft-store";
import { useLocalSearchParams } from "expo-router";
import { Appearance, BackHandler, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { createStudentFixtureRequest } from "../../../../packages/native-parity/student/fixture-request";
import { Button } from "../../components/Button";
import { StudentEntry } from "./StudentEntry";
import type { StudentSession } from "./contracts";
import { matchStudentRoute } from "./routes";

// Keep device evidence separate from product drafts, including garbage collection.
const fixtureRepository = createAssessmentDraftRepository(() => openDatabaseAsync("student-fixture-answers.db"));

const baseSession: StudentSession = { userId: "student-fixture", role: "student", locale: "id", origin: "https://student.invalid" };

function Fixture({ scenario, initialPath, theme, locale, persistent }: { persistent: boolean; scenario: string; initialPath: string; theme?: "light" | "dark"; locale: "en" | "id" }) {
  const request = useMemo(() => createStudentFixtureRequest(scenario), [scenario]);
  const session = useMemo(() => ({ ...baseSession, locale }), [locale]);
  const drafts = useMemo(() => {
    if (persistent) return fixtureRepository.bind({
      origin: session.origin, accountId: session.userId, sessionId: "student-device-evidence", locale,
    }, () => {}).drafts;
    const data = new Map<string, string>();
    return {
      get: async (key: string) => data.get(key) ?? null,
      set: async (key: string, value: string) => { data.set(key, value); },
      remove: async (key: string) => { data.delete(key); },
    };
  }, [persistent, session, locale]);
  useEffect(() => {
    if (!theme) return;
    Appearance.setColorScheme(theme);
    return () => Appearance.setColorScheme("unspecified");
  }, [theme]);
  const nextId = useRef(0);
  const offsets = useRef(new Map<number, number>());
  const [stack, setStack] = useState([{ id: 0, path: initialPath }]);
  const active = stack[stack.length - 1];
  const back = useCallback(() => setStack(current => current.length > 1 ? current.slice(0, -1) : current), []);
  useEffect(() => {
    if (stack.length < 2) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => { back(); return true; });
    return () => listener.remove();
  }, [back, stack.length]);
  const colors = nativeColors[useColorScheme() ?? "light"];

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    {stack.length > 1 && <View style={{ alignItems: "flex-start", paddingHorizontal: 12 }}>
      <Button variant="ghost" accessibilityLabel="Kembali" testID="student.back" onPress={back}>Kembali</Button>
    </View>}
    <StudentEntry path={active.path} entryKey={String(active.id)} session={session} request={request} drafts={drafts}
      initialScrollY={offsets.current.get(active.id) ?? 0}
      onScrollY={value => offsets.current.set(active.id, value)}
      back={back} navigate={path => {
        const id = ++nextId.current;
        setStack(current => [...current, { id, path }]);
      }}
      replace={path => setStack(current => [...current.slice(0, -1), { ...current[current.length - 1], path }])}
    />
  </SafeAreaView>;
}

/** Mounted in a local checkout or Student CI only. This entry never uses a network transport. */
export default function StudentFixtureRoute() {
  const params = useLocalSearchParams<{ scenario?: string; path?: string; theme?: string; locale?: string; store?: string }>();
  const scenario = typeof params.scenario === "string" ? params.scenario : "enrolled";
  const path = typeof params.path === "string" && matchStudentRoute(params.path) ? params.path : scenario === "catalog-parity" ? "/courses" : "/dashboard";
  const theme = params.theme === "light" || params.theme === "dark" ? params.theme : scenario === "catalog-parity" ? "dark" : undefined;
  const locale = params.locale === "en" || scenario === "catalog-parity" ? "en" : "id";
  return <Fixture key={JSON.stringify([scenario, path, theme, locale])} initialPath={path} scenario={scenario} theme={theme} locale={locale} persistent={params.store === "disk"} />;
}
