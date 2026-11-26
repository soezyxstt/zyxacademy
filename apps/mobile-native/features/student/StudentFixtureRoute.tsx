import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openDatabaseAsync } from "expo-sqlite";
import { createAssessmentDraftRepository } from "./assessment-draft-store";
import { useLocalSearchParams } from "expo-router";
import { Alert, Appearance, BackHandler, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { createStudentFixtureRequest } from "../../../../packages/native-parity/student/fixture-request";
import { dashboardFixtureState } from "../../../../packages/native-parity/student/dashboard/fixtures";
import studentEn from "../../../../messages/en/student.json";
import studentId from "../../../../messages/id/student.json";
import { Button } from "../../components/Button";
import { MobileNavbar, RoleBottomNavigation } from "../shared-ui/navigation";
import { StudentEntry } from "./StudentEntry";
import type { StudentSession } from "./contracts";
import { studentFixturePath } from "./fixture-location";

// Keep device evidence separate from product drafts, including garbage collection.
const fixtureRepository = createAssessmentDraftRepository(() => openDatabaseAsync("student-fixture-answers.db"));

const baseSession: StudentSession = { userId: "student-fixture", role: "student", locale: "id", origin: "https://student.invalid" };
const fixtureDestinations = { home: "/dashboard", courses: "/courses", schedule: "/dashboard/schedule", discuss: "/dashboard/discussions", me: "/profile" } as const;

function Fixture({ scenario, initialPath, theme, locale, persistent }: { persistent: boolean; scenario: string; initialPath: string; theme?: "light" | "dark"; locale: "en" | "id" }) {
  const request = useMemo(() => createStudentFixtureRequest(scenario), [scenario]);
  const dashboardState = dashboardFixtureState(scenario);
  const session = useMemo(() => ({ ...baseSession, locale,
    userId: dashboardState ? `student-evidence-${dashboardState}` : baseSession.userId,
  }), [locale, dashboardState]);
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
  const navigate = useCallback((path: string) => {
    const id = ++nextId.current;
    setStack(current => [...current, { id, path }]);
  }, []);
  useEffect(() => {
    if (stack.length < 2) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => { back(); return true; });
    return () => listener.remove();
  }, [back, stack.length]);
  const colors = nativeColors[useColorScheme() ?? "light"];
  const isCatalogFixture = scenario === "catalog-parity";
  const messages = locale === "en" ? studentEn : studentId;
  const mobile = messages.mobile;
  const activeDestination = (Object.keys(fixtureDestinations) as (keyof typeof fixtureDestinations)[])
    .find(id => fixtureDestinations[id] === active.path.split("?")[0]);

  return <SafeAreaView testID={dashboardState ? `student-dashboard-case-${dashboardState}` : undefined}
    style={{ flex: 1, backgroundColor: colors.background }}>
    {dashboardState && active.path === "/dashboard" && <MobileNavbar role="student" title={messages.routeTitles.dashboard}
      home={{ label: mobile.home }} includeSafeArea={false} onAction={() => {}} />}
    {stack.length > 1 && <View style={{ alignItems: "flex-start", paddingHorizontal: 12 }}>
      <Button variant="ghost" accessibilityLabel="Kembali" testID="student.back" onPress={back}>Kembali</Button>
    </View>}
    <StudentEntry path={active.path} entryKey={String(active.id)} session={session} request={request} drafts={drafts}
      initialScrollY={offsets.current.get(active.id) ?? 0}
      onScrollY={value => offsets.current.set(active.id, value)}
      back={back} navigate={navigate}
      openExternal={isCatalogFixture || dashboardState ? path => Alert.alert(mobile.courses, new URL(path, session.origin).href) : undefined}
      replace={path => setStack(current => [...current.slice(0, -1), { ...current[current.length - 1], path }])}
    />
    {(isCatalogFixture || dashboardState) && activeDestination && <RoleBottomNavigation role="student" labels={mobile} activeId={activeDestination}
      accessibilityLabel={mobile.bottomNavLabel} includeSafeArea={false} onDestinationPress={id => {
        if (id !== activeDestination) navigate(fixtureDestinations[id]);
      }} />}
  </SafeAreaView>;
}

/** Mounted in a local checkout or Student CI only. This entry never uses a network transport. */
export default function StudentFixtureRoute() {
  const params = useLocalSearchParams();
  const scenario = typeof params.scenario === "string" ? params.scenario : "enrolled";
  const path = studentFixturePath(params, scenario);
  const theme = params.theme === "light" || params.theme === "dark" ? params.theme
    : scenario === "catalog-parity" ? "dark" : dashboardFixtureState(scenario) ? "light" : undefined;
  const locale = params.locale === "en" || scenario === "catalog-parity" ? "en" : "id";
  return <Fixture key={JSON.stringify([scenario, path, theme, locale])} initialPath={path} scenario={scenario} theme={theme} locale={locale} persistent={params.store === "disk"} />;
}
