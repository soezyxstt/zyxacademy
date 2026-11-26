import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openDatabaseAsync } from "expo-sqlite";
import { createAssessmentDraftRepository } from "./assessment-draft-store";
import { useLocalSearchParams } from "expo-router";
import { Alert, Appearance, BackHandler, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { createStudentFixtureRequest } from "../../../../packages/native-parity/student/fixture-request";
import { resultsEvidence, resultsRefocusScenario, resultsScenario } from "../../../../packages/native-parity/student/assessment/fixtures";
import { dashboardFixtureState } from "../../../../packages/native-parity/student/dashboard/fixtures";
import studentEn from "../../../../messages/en/student.json";
import studentId from "../../../../messages/id/student.json";
import { Button } from "../../components/Button";
import { StudentNavigationFrame } from "../../routing/student-chrome";
import { studentCourseId } from "../../routing/student-navigation";
import { MobileNavbar, RoleBottomNavigation } from "../shared-ui/navigation";
import { StudentEntry } from "./StudentEntry";
import type { StudentSession } from "./contracts";
import { studentFixturePath } from "./fixture-location";
import { matchStudentRoute } from "./routes";
import { bindStudentRequest } from "./transport";

// Keep device evidence separate from product drafts, including garbage collection.
const fixtureRepository = createAssessmentDraftRepository(() => openDatabaseAsync("student-fixture-answers.db"));

const baseSession: StudentSession = { userId: "student-fixture", role: "student", locale: "id", origin: "https://student.invalid" };
const fixtureDestinations = { home: "/dashboard", courses: "/courses", schedule: "/dashboard/schedule", discuss: "/dashboard/discussions", me: "/profile" } as const;

function Fixture({ scenario, initialPath, theme, locale, persistent }: { persistent: boolean; scenario: string; initialPath: string; theme?: "light" | "dark"; locale: "en" | "id" }) {
  const request = useMemo(() => createStudentFixtureRequest(scenario), [scenario]);
  const dashboardState = dashboardFixtureState(scenario);
  const refocusResults = scenario === resultsRefocusScenario;
  const session = useMemo(() => ({ ...baseSession, locale,
    userId: dashboardState ? `student-evidence-${dashboardState}` : baseSession.userId,
    sessionId: refocusResults ? "student-results-fixture-session" : baseSession.sessionId,
  }), [locale, dashboardState, refocusResults]);
  const courseRequest = useMemo(() => bindStudentRequest(session, request), [request, session]);
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
  const [stack, setStack] = useState([{ id: 0, path: initialPath, initialScrollY: 0 }]);
  const active = stack[stack.length - 1];
  const route = matchStudentRoute(active.path);
  const courseBack = route?.area === "courses" && Boolean(route.params.id);
  const back = useCallback(() => {
    const savedOffsets = new Map(offsets.current);
    setStack(current => {
      if (current.length < 2) return current;
      const previous = current[current.length - 2];
      return [...current.slice(0, -2), { ...previous, initialScrollY: savedOffsets.get(previous.id) ?? 0 }];
    });
  }, []);
  const navigate = useCallback((path: string) => {
    const id = ++nextId.current;
    setStack(current => [...current, { id, path, initialScrollY: 0 }]);
  }, []);
  const visit = (path: string) => {
    if (path === active.path) return;
    if (stack.at(-2)?.path === path) back();
    else navigate(path);
  };
  useEffect(() => {
    if (stack.length < 2) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => { back(); return true; });
    return () => listener.remove();
  }, [back, stack.length]);
  const observedTheme = useColorScheme() ?? "light";
  const colors = nativeColors[observedTheme];
  const fixtureId = dashboardState ? `student-dashboard-case-${dashboardState}`
    : `student-fixture-${session.locale}-${observedTheme}`;
  const isCatalogFixture = scenario === "catalog-parity";
  const messages = locale === "en" ? studentEn : studentId;
  const mobile = messages.mobile;
  const activeDestination = (Object.keys(fixtureDestinations) as (keyof typeof fixtureDestinations)[])
    .find(id => fixtureDestinations[id] === active.path.split("?")[0]);

  const resultsTimeZone = refocusResults || resultsEvidence.states.some(state => resultsScenario(state) === scenario)
    ? resultsEvidence.timeZone : undefined;
  const renderEntry = (entry: (typeof stack)[number], focused?: boolean) => (
    <StudentEntry path={entry.path} entryKey={String(entry.id)} focused={focused} resultsTimeZone={resultsTimeZone}
      session={session} request={request} drafts={drafts}
      initialScrollY={entry.initialScrollY}
      onScrollY={value => offsets.current.set(entry.id, value)}
      back={back} navigate={navigate}
      openExternal={isCatalogFixture || dashboardState ? path => Alert.alert(mobile.courses, new URL(path, session.origin).href) : undefined}
      replace={path => {
        const initialScrollY = offsets.current.get(entry.id) ?? 0;
        setStack(current => [...current.slice(0, -1), { ...current[current.length - 1], path, initialScrollY }]);
      }}
    />
  );

  // Keep assessment player and refocus fixtures on their dedicated stack harness.
  if (route && studentCourseId(active.path) && (route.area === "courses" ||
    scenario.startsWith("quiz-gateway-") || route.pattern === "/courses/[id]/leaderboard")) {
    return <StudentNavigationFrame href={active.path} pattern={route.pattern} theme={observedTheme} locale={locale}
      enabled focused courseRequest={courseRequest} visit={visit} back={back} testID={fixtureId}>
      {stack.filter(entry => entry.id === active.id || matchStudentRoute(entry.path)?.pattern === "/courses/[id]/material")
        .map(entry => <View key={entry.id} style={{ flex: 1, display: entry.id === active.id ? "flex" : "none" }}>
          {renderEntry(entry, entry.id === active.id)}
        </View>)}
    </StudentNavigationFrame>;
  }

  return <SafeAreaView testID={fixtureId}
    style={{ flex: 1, backgroundColor: colors.background }}>
    {dashboardState && active.path === "/dashboard" && <MobileNavbar role="student" title={messages.routeTitles.dashboard}
      home={{ label: mobile.home }} includeSafeArea={false} onAction={() => {}} />}
    {stack.length > 1 && !courseBack && <View style={{ alignItems: "flex-start", paddingHorizontal: 12 }}>
      <Button variant="ghost" accessibilityLabel="Kembali" testID="student.back" onPress={back}>Kembali</Button>
    </View>}
    {refocusResults
      ? stack.map(entry => <View key={entry.id} style={{ flex: 1, display: entry.id === active.id ? "flex" : "none" }}>
        {renderEntry(entry, entry.id === active.id)}
      </View>)
      : renderEntry(active)}
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
