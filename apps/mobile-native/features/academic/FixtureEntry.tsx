import { useCallback, useEffect, useState } from "react";
import { BackHandler, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { createTutorFixtureData } from "../../../../packages/native-parity/academic/tutor/fixtures";
import { createAssessmentFixtureGateway } from "../../../../packages/native-parity/academic/assessment";
import { matchAcademicRoute } from "../../../../packages/native-parity/academic/match";
import { AcademicMessage } from "./LiveScreen";
import { AdministrationProvider, AdministrationScreen } from "./administration";
import { AssessmentScreen } from "./assessment";
import { AdminCourseFixtureProvider, CourseScreen } from "./courses";
import { TutorScreen } from "./tutor";
import type { AcademicActor, AcademicScenario, AcademicScreenProps } from "./contracts";

type FixtureProps = {
  initialPath: string;
  actor: AcademicActor;
  scenario: AcademicScenario;
  theme: AcademicScreenProps["theme"];
  onExit(): void;
};

/** Synthetic session. No network or host credentials are accepted by this entry. */
export function AcademicFixtureEntry(props: FixtureProps) {
  return <FixtureSession key={JSON.stringify([props.actor.id, props.actor.role, props.scenario, props.initialPath])} {...props} />;
}

function FixtureSession({ initialPath, actor, scenario, theme, onExit }: FixtureProps) {
  const [stack, setStack] = useState([initialPath]);
  const [assessment] = useState(createAssessmentFixtureGateway);
  const [tutor] = useState(() => createTutorFixtureData(actor, scenario));
  const navigate = useCallback((href: string) => setStack(current =>
    current[current.length - 1] === href ? current : [...current, href]), []);
  const replace = useCallback((href: string) => setStack(current =>
    {
      if (current[current.length - 1] === href) return current;
      const previous = current.at(-2);
      if (previous && previous.split("?")[0] === href.split("?")[0]) return [...current.slice(0, -2), href];
      return [...current.slice(0, -1), href];
    }), []);
  const back = useCallback(() => {
    if (stack.length > 1) setStack(current => current.slice(0, -1));
    else onExit();
  }, [onExit, stack.length]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stack.length <= 1) return false;
      back();
      return true;
    });
    return () => sub.remove();
  }, [back, stack.length]);

  return <SafeAreaView style={{ flex: 1, backgroundColor: nativeColors[theme].background }}>
    <AdministrationProvider actor={actor} scenario={scenario}>
      <AdminCourseFixtureProvider scenario={scenario}>
        {stack.map((href, index) => {
          const match = matchAcademicRoute(href);
          const active = index === stack.length - 1;
          const props = { actor, scenario, theme, navigate, replace, back };
          const allowed = match && actor.role === (match.path.startsWith("/admin/") ? "admin" : "tutor");
          function screen() {
            if (!match) return <AcademicMessage {...props}>Halaman ini berada di luar modul akademik.</AcademicMessage>;
            if (!allowed) return <AcademicMessage {...props}>Akses ditolak.</AcademicMessage>;
            const input = { ...props, ...match };
            switch (match.feature) {
              case "tutor": return <TutorScreen {...input} dataSource={tutor} />;
              case "courses": return <CourseScreen {...input} />;
              case "assessment": return <AssessmentScreen {...input} gateway={assessment} />;
              case "administration": return <AdministrationScreen {...input} />;
            }
          }
          return <View key={JSON.stringify([index, href])} style={{ flex: 1, display: active ? "flex" : "none" }}
            importantForAccessibility={active ? "auto" : "no-hide-descendants"} accessibilityElementsHidden={!active}>
            {screen()}
          </View>;
        })}
      </AdminCourseFixtureProvider>
    </AdministrationProvider>
  </SafeAreaView>;
}
