import { StyleSheet, Text, View } from "react-native";
import { nativeColors, nativeLinkInks, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { coursePath, dashboardPreviewPath, type CourseCard, type DashboardPreview } from "../../../../../packages/native-parity/student/courses/contract";
import studentEn from "../../../../../messages/en/student.json";
import studentId from "../../../../../messages/id/student.json";
import { Button } from "../../../components/Button";
import { nativeTypography } from "../../../typography";
import { NavigationIcon, type NavigationIconName } from "../../shared-ui/navigation-icons";
import type { StudentScreenProps } from "../contracts";
import { DashboardLink } from "./dashboard-link";

type Theme = keyof typeof nativeColors;
type DashboardPane = Pick<StudentScreenProps, "navigate" | "openExternal"> & { locale: string; theme: Theme };
type DashboardMessages = typeof studentId.dashboard;

export function dashboardMessages(locale: string): DashboardMessages {
  return locale.startsWith("en") ? studentEn.dashboard : studentId.dashboard;
}

function countLabel(pattern: string, count: number, locale: string) {
  const parts = pattern.match(/one \{([^}]+)\} other \{([^}]+)\}/u);
  if (!parts) return String(count);
  // Student supports English and Indonesian. Indonesian uses the same form for every count.
  const singular = locale.startsWith("en") && count === 1;
  return parts[singular ? 1 : 2].replace("#", new Intl.NumberFormat(locale).format(count));
}

function Heading({ title, icon, theme, tone = "muted" }: { title: string; icon: NavigationIconName; theme: Theme; tone?: "muted" | "primary" }) {
  const colors = nativeColors[theme];
  return <View style={styles.inline}>
    <NavigationIcon name={icon} color={tone === "primary" ? colors.primary : colors.mutedForeground} size={17} />
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>{title}</Text>
  </View>;
}

function dashboardProgress(done: number, total: number, message: string) {
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(done / total * 100))) : 0;
  const label = message.replace("{done}", String(done)).replace("{complete}", String(done)).replace("{total}", String(total));
  return { percent, label };
}

function Progress({ percent, label, title, theme }: ReturnType<typeof dashboardProgress> & { title: string; theme: Theme }) {
  const colors = nativeColors[theme];
  return <View style={styles.progress}>
    <View accessibilityRole="progressbar" accessibilityLabel={title} accessibilityValue={{ min: 0, now: percent, max: 100 }}
      style={[styles.track, { backgroundColor: colors.muted }]}>
      <View style={[styles.trackFill, { width: `${percent}%`, backgroundColor: percent === 100 ? nativeLinkInks.success : colors.primary }]} />
    </View>
    <Text style={[styles.progressNumber, { color: colors.foreground }]}>{percent}%</Text>
    <Text style={[styles.meta, { color: colors.mutedForeground }]}>{label}</Text>
  </View>;
}

export function ActiveDashboardCourses({ courses, completed, locale, theme, navigate, activate, activationOpen }: DashboardPane & {
  courses: CourseCard[]; completed: Record<string, number>; activate(): void; activationOpen: boolean;
}) {
  const t = dashboardMessages(locale);
  const colors = nativeColors[theme];
  return <View testID="student-dashboard-active">
    <Heading title={t.classesActive} icon="classes" theme={theme} />
    <View style={styles.activeActions}>
      <Button theme={theme} variant="outline" size="sm" accessibilityState={{ expanded: activationOpen }} onPress={activate}>{t.activateClass}</Button>
      <Button theme={theme} variant="ghost" size="sm" onPress={() => navigate("/courses")}>{t.viewAll}</Button>
    </View>
    {courses.map(course => {
      const progress = dashboardProgress(completed[course.id] ?? 0, course.materialsCount ?? 0, t.materialProgressShort);
      return <DashboardLink key={course.id} testID={`student-course-${course.id}`} theme={theme} style={styles.activeCourse}
        label={[course.title, course.category, `${progress.percent}%`, progress.label].filter(Boolean).join(", ")}
        onPress={() => navigate(coursePath(course.id))}>
        <View style={styles.inline}>
          <Text style={[styles.heading, { color: colors.foreground }]}>{course.title}</Text>
          <Text style={[styles.meta, styles.category, { color: colors.mutedForeground }]}>{course.category}</Text>
        </View>
        <Progress {...progress} title={course.title} theme={theme} />
      </DashboardLink>;
    })}
  </View>;
}

const features = [
  { icon: "book", title: "pdfFeature", description: "pdfFeatureDescription" },
  { icon: "schedule", title: "interactiveFeature", description: "interactiveFeatureDescription" },
  { icon: "check", title: "savedProgressFeature", description: "savedProgressDescription" },
] as const;

export function DashboardPreviewCourses({ preview, locale, theme, navigate, openExternal, offerLabel }: DashboardPane & {
  preview: DashboardPreview;
  offerLabel(course: DashboardPreview["courses"][number]): string | undefined;
}) {
  const t = dashboardMessages(locale);
  const colors = nativeColors[theme];
  return <View style={styles.preview} testID="student-dashboard-preview">
    <View style={styles.sectionIntro}>
      <View style={styles.spread}>
        <Heading title={t.coursesForYou} icon="book" theme={theme} tone="primary" />
        <Text style={[styles.pill, { color: colors.primary, backgroundColor: `${colors.primary}1a` }]}>{t.freePackage}</Text>
      </View>
      {preview.targetCategory && <Text style={[styles.meta, { color: colors.primary }]}>
        {preview.targetCategory === "TPB" ? t.recommendedTpb : t.recommendedFor.replace("{category}", preview.targetCategory)}
      </Text>}
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{t.firstChapterFree}</Text>
    </View>
    {preview.courses.map(course => {
      const next = course.completedFreeMaterialCount > 0 && course.completedFreeMaterialCount < course.freeMaterialCount
        ? t.continueLearning : t.startChapterOne;
      const offer = offerLabel(course);
      const availableCounts = [
        [t.freeChapters, course.freeChapters.length],
        [t.materialsCount, course.freeMaterialCount],
        [t.quizzesCount, course.freeQuizCount],
      ] as const;
      return <View key={course.id} style={[styles.previewCourse, { borderTopColor: colors.border }]}>
        <View style={styles.spread}>
          <View style={styles.inline}>
            <Text style={[styles.pill, styles.category, { color: colors.primary, backgroundColor: `${colors.primary}1a` }]}>{course.category}</Text>
            <Text style={[styles.courseTitle, { color: colors.foreground }]}>{course.title}</Text>
          </View>
          <Button theme={theme} size="sm" accessibilityRole="link" testID={`student-dashboard-first-chapter-${course.id}`}
            onPress={() => navigate(dashboardPreviewPath(course))}>{next}</Button>
        </View>
        {offer ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>{offer}</Text> :
          <Text style={[styles.pill, styles.pricing, { color: colors.foreground, backgroundColor: colors.muted }]}>
            {course.pricing?.category === "free" ? "Free" : "Premium"}
          </Text>}
        <View style={styles.inline}>
          {availableCounts.map(([message, count]) =>
            <Text key={message} style={[styles.meta, { color: colors.mutedForeground }]}>
              {countLabel(message, count, locale)}
            </Text>)}
        </View>
        <Progress {...dashboardProgress(course.completedFreeMaterialCount, course.freeMaterialCount, t.onboardingMaterialProgress)}
          title={course.title} theme={theme} />
        {course.freeChapters.length > 0 ? course.freeChapters.map((chapter, index) => <View key={chapter.id} style={styles.spread}>
          <View style={styles.inline}>
            {chapter.completed ? <NavigationIcon name="check" color={nativeLinkInks.success} size={16} /> :
              <Text style={[styles.ordinal, { color: colors.primary, borderColor: `${colors.primary}66` }]}>{index + 1}</Text>}
            <Text style={[styles.meta, { color: colors.foreground }]}>{chapter.title}</Text>
          </View>
          <Text style={[styles.pill, { color: theme === "light" ? "#0c773b" : nativeLinkInks.success, backgroundColor: `${nativeLinkInks.success}1a` }]}>{t.free}</Text>
        </View>) : <Text style={[styles.meta, { color: colors.mutedForeground }]}>{t.preparingFreeMaterials}</Text>}
      </View>;
    })}
    {!preview.courses.length && <View style={styles.previewCourse}>
      <Text style={[styles.courseTitle, { color: colors.foreground }]}>{preview.targetCategory
        ? t.noCoursesForCategory.replace("{category}", preview.targetCategory) : t.noCoursesAvailable}</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{preview.targetCategory ? t.exploreOtherCourses : t.returnAfterPublish}</Text>
      <Button theme={theme} variant="outline" size="sm" onPress={() => navigate("/courses")}>{t.courseCatalog}</Button>
    </View>}
    <View style={styles.featureSection}>
      <Heading title={t.availableInFree} icon="book" theme={theme} tone="primary" />
      {features.map(({ icon, title, description }) => <View style={styles.feature} key={title}>
        <View style={[styles.featureIcon, { backgroundColor: `${colors.primary}1a` }]}><NavigationIcon name={icon} color={colors.primary} size={16} /></View>
        <Text style={[styles.featureTitle, { color: colors.foreground }]}>{t[title]}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>{t[description]}</Text>
      </View>)}
    </View>
    {openExternal && <View style={[styles.plans, { borderTopColor: colors.border }]}>
      <Heading title={t.semesterPlans} icon="classes" theme={theme} tone="primary" />
      <Button theme={theme} variant="outline" size="sm" onPress={() => openExternal("/plans")} style={styles.pricing}>{t.comparePlans}</Button>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  heading: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 24, includeFontPadding: false, flexShrink: 1 },
  courseTitle: { ...nativeTypography.headingBold, fontSize: 14, lineHeight: 20, includeFontPadding: false, flexShrink: 1 },
  featureTitle: { ...nativeTypography.headingBold, fontSize: 12, lineHeight: 18, includeFontPadding: false },
  meta: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 18, includeFontPadding: false, flexShrink: 1 },
  inline: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", flexShrink: 1, gap: 8 },
  spread: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  pill: { ...nativeTypography.bodySemibold, fontSize: 11, lineHeight: 15, includeFontPadding: false, borderRadius: nativeRadii.sm, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 2 },
  category: { textTransform: "uppercase", letterSpacing: 0.45 },
  progress: { flexDirection: "row", alignItems: "center", gap: 12 },
  progressNumber: { ...nativeTypography.bodySemibold, fontSize: 12, lineHeight: 18, includeFontPadding: false },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: 3 },
  activeActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 6 },
  activeCourse: { paddingVertical: 16, marginTop: 10, gap: 8 },
  preview: { gap: 16 },
  sectionIntro: { gap: 4 },
  previewCourse: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  pricing: { alignSelf: "flex-start" },
  ordinal: { ...nativeTypography.bodySemibold, fontSize: 9, lineHeight: 14, minWidth: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, includeFontPadding: false, textAlign: "center" },
  featureSection: { marginTop: 12, gap: 24 },
  feature: { gap: 4 },
  featureIcon: { width: 28, height: 28, borderRadius: nativeRadii.md, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  plans: { borderTopWidth: StyleSheet.hairlineWidth, gap: 8, marginTop: 16, paddingTop: 20 },
});
