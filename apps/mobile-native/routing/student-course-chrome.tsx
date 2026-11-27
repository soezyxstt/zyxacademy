import { useEffect, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import type { StudentCourseSummary } from "../../../components/navigation/student/student-nav-model";
import studentEn from "../../../messages/en/student.json";
import studentId from "../../../messages/id/student.json";
import uiEn from "../../../messages/en/ui.json";
import uiId from "../../../messages/id/ui.json";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { NativeListRow, NativeStatusPanel } from "../features/shared-ui/layout";
import { NavigationTabs } from "../features/shared-ui/navigation";
import { NavigationIcon, type NavigationIconName } from "../features/shared-ui/navigation-icons";
import { SharedSheet } from "../features/shared-ui/overlays";
import type { StudentRequest } from "../features/student/contracts";
import { readStudentCourseChoices, readStudentCourseTitle } from "./student-course-navigation-data";
import { studentCourseChoices, studentCourseId, studentCourseSwitchTarget, studentCourseTabs } from "./student-navigation";

const messages = { en: studentEn, id: studentId };
const controls = { en: uiEn, id: uiId };
const tabIcons: Readonly<Record<string, NavigationIconName>> = {
  summary: "dashboard", documents: "file", video: "video", quiz: "list-checks", flashcard: "layers",
  tryout: "clipboard", schedule: "schedule", playground: "terminal", studyPath: "compass", mastery: "target",
  progress: "trending-up", leaderboard: "trophy", examResults: "award", live: "radio",
};

type CourseMetadata = Awaited<ReturnType<typeof readStudentCourseTitle>>;
type CourseChoices = { state: "loading" | "error" } | { state: "ready"; courses: readonly StudentCourseSummary[] };

export function useStudentCourseChrome({ href, locale, theme, request, focused, topVisible, tabsVisible, visit }: {
  href: string;
  locale: "en" | "id";
  theme: keyof typeof nativeColors;
  request?: StudentRequest;
  focused: boolean;
  topVisible: boolean;
  tabsVisible: boolean;
  visit(href: string): void;
}) {
  const courseId = request ? studentCourseId(href) : undefined;
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const targetAfterDismiss = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [choices, setChoices] = useState<CourseChoices>({ state: "loading" });
  const [metadata, setMetadata] = useState<{ courseId: string; request: StudentRequest; value: CourseMetadata }>();
  const current = metadata?.courseId === courseId && metadata?.request === request ? metadata?.value : undefined;
  const showing = Boolean(courseId && topVisible && request);
  const openAndFocused = showing && focused && open;
  const { navigation, mobile, routeTitles } = messages[locale];
  const { close, moreTabs } = controls[locale];
  const colors = nativeColors[theme];

  useEffect(() => {
    if (!focused || !showing || !request || !courseId) return;
    const controller = new AbortController();
    void readStudentCourseTitle(request, courseId, controller.signal).then(value => {
      if (!controller.signal.aborted) setMetadata({ courseId, request, value });
    }).catch(() => {
      if (!controller.signal.aborted) setMetadata({ courseId, request, value: { course: null, showLive: false } });
    });
    return () => controller.abort();
  }, [courseId, focused, request, showing]);

  useEffect(() => {
    targetAfterDismiss.current = null;
    setOpen(false);
  }, [href, focused, request, showing]);

  useEffect(() => {
    if (!openAndFocused || !request) return;
    const controller = new AbortController();
    void readStudentCourseChoices(request, controller.signal).then(courses => {
      if (!controller.signal.aborted) setChoices({ state: "ready", courses });
    }).catch(() => {
      if (!controller.signal.aborted) setChoices({ state: "error" });
    });
    return () => controller.abort();
  }, [openAndFocused, request, retry]);

  function select(href: string | null) {
    targetAfterDismiss.current = href;
    setOpen(false);
  }

  if (!showing || !courseId) return null;
  const enrolled = choices.state === "ready" && openAndFocused ? choices.courses : [];
  const knownCourse = current?.course ?? enrolled.find(course => course.id === courseId);
  const title = knownCourse?.title ?? (current ? routeTitles.course : navigation.loadingCourse);
  const active = knownCourse ?? { id: courseId, title: routeTitles.course };
  const { tabs, activeId } = studentCourseTabs(href, courseId, locale, current?.showLive ?? false);
  const parentTab = tabs.some(tab => tab.id === activeId && tab.href !== href.split(/[?#]/, 1)[0]);
  const courseChoices = studentCourseChoices(active, enrolled);

  return {
    trigger,
    descriptor: { title, label: navigation.switchCourse, expanded: openAndFocused },
    open: () => {
      if (!focused) return;
      setChoices({ state: "loading" });
      setOpen(true);
    },
    tabs: tabsVisible ? <NavigationTabs tabs={tabs.map(tab => ({
      ...tab, renderIcon: (color: string) => <NavigationIcon name={tabIcons[tab.id]} color={color} size={14} />,
    }))} activeId={activeId} onTabPress={id => {
      const target = tabs.find(tab => tab.id === id);
      if (target) visit(target.href);
    }} theme={theme} accessibilityLabel={mobile.courseTabsLabel} moreLabel={moreTabs} closeLabel={close}
      activeIndicatorColor={colors.foreground} activateCurrent={parentTab} testID="student-course-tabs" /> : null,
    sheet: <SharedSheet open={openAndFocused} title={navigation.switchCourse} closeLabel={close} theme={theme}
      onDismiss={() => select(null)} returnFocusRef={trigger} onAfterDismiss={() => {
        const target = targetAfterDismiss.current;
        targetAfterDismiss.current = null;
        if (target && focused) visit(target);
      }} testID="student-course-picker">
      <View testID={choices.state === "ready" ? "student-course-picker-options" : undefined}>{courseChoices.map(item => {
        const selected = item.id === active.id;
        return <NativeListRow key={item.id} title={item.title} theme={theme} layout="compact"
          leading={<NavigationIcon name={selected ? "check" : "book"} color={selected ? colors.primary : colors.mutedForeground} size={16} />}
          primary={{ role: "link", label: selected ? `${item.title}. ${locale === "en" ? "Current course" : "Kelas saat ini"}` : item.title,
            testID: `student-course-picker-${item.id}`, onPress: () => select(selected ? null : studentCourseSwitchTarget(href, courseId, item.id)) }} />;
      })}</View>
      {choices.state === "loading" && <ActivityIndicator accessibilityLabel={navigation.loadingCourse} color={colors.primary} />}
      {choices.state === "error" && <NativeStatusPanel theme={theme} tone="error"
        title={locale === "en" ? "Could not load your courses." : "Daftar kelas belum dapat dimuat."}
        action={{ id: "retry", label: locale === "en" ? "Try again" : "Coba lagi" }} onAction={() => {
          setChoices({ state: "loading" });
          setRetry(value => value + 1);
        }} />}
      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
        <NativeListRow title={navigation.exploreCourses} theme={theme} layout="compact"
          leading={<NavigationIcon name="search" color={colors.mutedForeground} size={16} />}
          primary={{ role: "link", testID: "student-course-picker-catalog", onPress: () => select("/courses") }} />
      </View>
    </SharedSheet>,
  };
}
