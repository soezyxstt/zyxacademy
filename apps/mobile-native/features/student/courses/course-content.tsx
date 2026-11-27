import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { createMaterialCoverSvg } from "../../../../../lib/material-cover";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { coursePath, materialPath, materialRowPath, materialTabs, type CourseData, type MaterialListData, type MaterialRow, type MaterialTab } from "../../../../../packages/native-parity/student/courses/contract";
import learningId from "../../../../../messages/id/learning.json";
import learningEn from "../../../../../messages/en/learning.json";
import studentCourseId from "../../../../../messages/id/studentCourse.json";
import studentCourseEn from "../../../../../messages/en/studentCourse.json";
import { Button } from "../../../components/Button";
import { nativeTypography } from "../../../typography";
import { NavigationTabs } from "../../shared-ui/navigation";
import { NavigationIcon, type NavigationIconName } from "../../shared-ui/navigation-icons";
import type { StudentScreenProps } from "../contracts";
import { matchStudentRoute } from "../routes";
import type { CourseCopy } from "./copy";
import { documentGroups, expandedDocumentGroup, shortDocumentTitle } from "./course-content-model";

type Theme = keyof typeof nativeColors;
type Shared = { theme: Theme; copy: CourseCopy; locale: string; navigate(path: string): void };
const shortcuts = [
  ["video", "video", "video"], ["flashcard", "flashcard", "layers"], ["tryout", "tryout", "clipboard"],
  ["path", "studyPath", "compass"], ["mastery", "mastery", "target"], ["progress", "progress", "trending-up"],
  ["leaderboard", "ranking", "trophy"], ["my-results", "results", "award"], ["playground", "playground", "terminal"],
  ["discussions", "discussions", "discuss"],
] as const;

export function CourseContent({ data, theme, copy, locale, navigate, pricing, activation }: Shared & {
  data: CourseData; pricing?: string; activation?: ReactNode;
}) {
  const colors = nativeColors[theme];
  const { course, chapters, attention } = data;
  const en = locale.startsWith("en");
  const lessons = (en ? studentCourseEn : studentCourseId).course.chapterOutline;
  const complete = chapters.filter(chapter => chapter.completed).length;
  const links = [...shortcuts,
    ...(data.actions.some(action => action.key === "quiz") ? [] : [["quiz", "quiz", "list-checks"] as const]),
    ...(data.liveEnabled ? [["live", "live", "radio"] as const] : []),
  ];
  const actionLabel = { reading: copy.materi, quiz: en ? "Practice" : "Latihan", schedule: "Tutorial" };
  const actionIcon = { reading: "book", quiz: "clipboard", schedule: "schedule" } as const;
  return <>
    {pricing ? <Text style={[styles.badge, styles.pricing, { color: colors.foreground, backgroundColor: colors.muted }]}>{pricing}</Text> : null}
    {activation}
    {course.hasFullContentAccess && data.actions.length > 0 ? <View style={styles.actions}>
      {data.actions.map(({ key, title, meta, path }) => {
        const canOpen = Boolean(matchStudentRoute(path));
        return <Pressable key={key} testID={key === "reading" ? "student-course-material-shortcut" : undefined}
          accessibilityRole="link" accessibilityLabel={[actionLabel[key], title, meta].filter(Boolean).join(", ")}
          disabled={!canOpen} onPress={() => navigate(path)}
          style={({ pressed }) => [styles.action, { borderColor: colors.border, backgroundColor: pressed ? colors.muted : colors.card }]}>
          <View style={[styles.actionIcon, { backgroundColor: colors.muted }]}>
            <NavigationIcon name={actionIcon[key]} size={16} color={colors.foreground} />
          </View>
          <View style={styles.textColumn}>
            <Text style={[styles.title, nativeTypography.headingBold, { color: colors.foreground }]}>{actionLabel[key]}</Text>
            {meta ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>{meta}</Text> : null}
          </View>
          {canOpen ? <NavigationIcon name="chevron-right" color={colors.mutedForeground} size={14} /> : null}
        </Pressable>;
      })}
    </View> : null}
    {course.hasFullContentAccess && attention?.length ? <View style={styles.actions}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{copy.attention}</Text>
      {attention.map(({ kind, title, path, count, masteryScore }) => <Pressable key={kind} accessibilityRole="link"
        disabled={!matchStudentRoute(path)} onPress={() => navigate(path)} style={[styles.chapterRow, { borderColor: colors.border }]}>
        <Text style={[styles.title, styles.textColumn, { color: colors.foreground }]}>
          {kind === "flashcard" && count !== undefined ? `${count} ${copy.reviewDue}` : title}
        </Text>
        {masteryScore !== undefined ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>{masteryScore}%</Text> : null}
      </Pressable>)}
    </View> : null}
    <View style={styles.syllabus}>
      <View style={[styles.sectionHeading, { borderBottomColor: colors.border }]}>
        <Text accessibilityRole="header" style={[styles.eyebrow, { color: colors.mutedForeground }]}>{lessons.title}</Text>
        {chapters.length > 0 ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {lessons.chapterCount.replace("{completed}", String(complete)).replace("{total}", String(chapters.length))}
        </Text> : null}
      </View>
      {chapters.length === 0 ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>{lessons.empty}</Text> : null}
      {chapters.map((chapter, index) => {
        const materialId = chapter.materialId;
        const percentage = Math.min(100, Math.max(0, chapter.completionPercent));
        const status = !materialId ? lessons.unavailable : chapter.completed ? lessons.completed :
          percentage > 0 ? lessons.percentRead.replace("{percent}", String(percentage)) : lessons.unread;
        const row = <>
          <View style={[styles.chapterNumber, { backgroundColor: colors.muted }]}>
            {chapter.completed ? <NavigationIcon name="circle-check" color={colors.primary} size={15} /> :
              materialId ? <Text style={[styles.badge, { color: colors.foreground }]}>{chapter.orderIndex ?? index + 1}</Text>
                : <NavigationIcon name="lock" color={colors.mutedForeground} size={14} />}
          </View>
          <View style={styles.textColumn}>
            <Text style={[styles.title, { color: materialId ? colors.foreground : colors.mutedForeground }]}>{chapter.title}</Text>
            <View style={styles.status}>
              <Text style={[styles.meta, { color: chapter.completed ? colors.primary : colors.mutedForeground }]}>{status}</Text>
              {!chapter.completed && materialId && percentage > 0 ? <View accessible={false} style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                <View style={{ width: `${percentage}%`, height: "100%", backgroundColor: colors.primary }} />
              </View> : null}
            </View>
          </View>
          {materialId ? <NavigationIcon name="chevron-right" color={colors.mutedForeground} size={14} /> : null}
        </>;
        const style = [styles.chapterRow, { borderColor: colors.border, borderBottomWidth: index === chapters.length - 1 ? 0 : StyleSheet.hairlineWidth }];
        return materialId ? <Pressable key={chapter.id} accessibilityRole="link" onPress={() => navigate(materialPath(course.id, materialId))}
          style={({ pressed }) => [...style, pressed && { backgroundColor: colors.muted }]}>{row}</Pressable>
          : <View key={chapter.id} style={style}>{row}</View>;
      })}
    </View>
    {course.hasFullContentAccess ? <View style={[styles.shortcutGrid, { borderTopColor: colors.border }]}>
      {links.map(([segment, label, icon]) =>
        <Pressable key={segment} accessibilityRole="link" onPress={() => navigate(`${coursePath(course.id)}/${segment}`)}
          style={({ pressed }) => [styles.shortcut, { borderColor: colors.border, backgroundColor: pressed ? colors.muted : colors.card }]}>
          <View style={[styles.shortcutIcon, { backgroundColor: colors.muted }]}><NavigationIcon name={icon} color={colors.mutedForeground} size={14} /></View>
          <Text style={[styles.shortcutLabel, { color: colors.foreground }]}>{copy[label]}</Text>
        </Pressable>)}
    </View> : null}
  </>;
}

export type DocumentDisclosures = Partial<Record<MaterialTab, string | null>>;

export function DocumentContent({ data, tab, disclosures, onTab, activation, recover, saved, theme, copy, locale, navigate, request }: Shared & {
  data: MaterialListData; tab: MaterialTab; disclosures: DocumentDisclosures; onTab(tab: MaterialTab): void;
  activation?: ReactNode; recover?(): void; saved?: ReactNode; request: StudentScreenProps["request"];
}) {
  const [, renderDisclosure] = useState(0);
  const { course, materials } = data;
  const colors = nativeColors[theme];
  const en = locale.startsWith("en");
  const { documents } = en ? learningEn : learningId;
  const groups = documentGroups(data, tab);
  const open = expandedDocumentGroup(disclosures[tab], groups.chapters, groups.ungrouped.length > 0);
  const icons: Record<MaterialTab, NavigationIconName> = { all: "file", materi: "file", diktat: "book", bank_soal: "clipboard", pdf: "file" };
  const labels = { all: "all", materi: "material", diktat: "handbook", bank_soal: "questions", pdf: "pdfMaterial" } as const;

  function section(id: string, title: string, rows: MaterialRow[], chapter?: number) {
    const count = en ? `${rows.length} ${rows.length === 1 ? "document" : "documents"}` : `${rows.length} dokumen`;
    return <View key={id} style={[styles.disclosureSection, { borderBottomColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${count}`} accessibilityState={{ expanded: open === id }}
        testID={`student-documents-chapter-${id}`}
        onPress={() => { disclosures[tab] = open === id ? null : id; renderDisclosure(value => value + 1); }}
        style={({ pressed }) => [styles.disclosure, pressed && { backgroundColor: colors.muted }]}>
        {chapter !== undefined ? <Text style={[styles.badge, styles.chapterBadge, { backgroundColor: colors.muted, color: colors.mutedForeground }]}>
          {en ? "Ch." : "Bab"} {chapter}
        </Text> : null}
        <Text style={[styles.title, styles.textColumn, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>{count}</Text>
        <View style={open === id && styles.expanded}><NavigationIcon name="chevron" color={colors.mutedForeground} size={14} /></View>
      </Pressable>
      {open === id ? rows.map(row => <DocumentRow key={`${row.kind}/${row.id}`} row={row} course={course}
        chapter={title} theme={theme} copy={copy} locale={locale} navigate={navigate} request={request} />) : null}
    </View>;
  }

  return <>
    {activation}
    {tab === "all" && !course.hasFullContentAccess && materials.some(row => row.locked) ? <View style={[styles.accessNotice, { borderColor: colors.border, backgroundColor: `${colors.muted}55` }]}>
      <Text style={[styles.meta, styles.accessNoticeCopy, { color: colors.mutedForeground }]}>{documents.lockedArticleNotice}</Text>
      {recover ? <Button theme={theme} size="sm" variant="outline" style={{ alignSelf: "flex-start" }} onPress={recover}>{documents.activateAccess}</Button> : null}
    </View> : null}
    <View style={styles.categoryTabs}>
      <NavigationTabs tabs={materialTabs.map(id => ({ id, label: documents.categories[labels[id]],
        renderIcon: color => <NavigationIcon name={icons[id]} size={14} color={color} /> }))}
        activeId={tab} onTabPress={onTab} accessibilityLabel={documents.courseCategoryLabel}
        activeIndicatorColor={colors.foreground} moreLabel={en ? "More" : "Lebih"} closeLabel={en ? "Close" : "Tutup"} testID="student-documents-tabs" theme={theme} />
    </View>
    {groups.chapters.length === 0 && groups.ungrouped.length === 0
      ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>{copy.noDocuments}</Text> : null}
    <View>
      {groups.chapters.map(({ id, title, rows, number }) => section(id, title, rows, number))}
      {groups.ungrouped.length > 0 ? section("__other__", copy.otherDocuments, groups.ungrouped) : null}
    </View>
    {saved}
  </>;
}

function DocumentRow({ row, course, chapter, theme, copy, locale, navigate, request }: Shared & {
  row: MaterialRow; course: MaterialListData["course"]; chapter: string; request: StudentScreenProps["request"];
}) {
  const colors = nativeColors[theme];
  const [sourceCover, setSourceCover] = useState<string>();
  const coverKind = row.group === "diktat" ? "diktat" : "article";
  const initialCover = row.kind === "article" ? createMaterialCoverSvg({
    kind: coverKind, title: row.title, courseTitle: course.title, chapterTitle: chapter,
  }) : undefined;
  useEffect(() => {
    if (row.preview !== "cover" || row.locked) return;
    const controller = new AbortController();
    const path = `/api/courses/${encodeURIComponent(course.id)}/material/${encodeURIComponent(row.id)}/cover.svg`;
    void request(path, { signal: controller.signal }).then(async response => {
      try {
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/svg+xml") ||
          Number(response.headers.get("content-length")) > 32_000) return;
        const cover = await response.text();
        if (!controller.signal.aborted && cover.length <= 32_000 && !/<(?:script|foreignObject|image|a)\b/i.test(cover) && !/\b(?:href|src)\s*=/i.test(cover)) setSourceCover(cover);
      } finally { response.dispose?.(); }
    }).catch(() => {});
    return () => controller.abort();
  }, [course.id, request, row.id, row.locked, row.preview]);
  const type = row.group === "diktat" ? copy.diktat : row.kind === "article" ? locale.startsWith("en") ? "Article" : "Artikel"
    : row.kind === "pdf" ? "PDF" : copy[row.group];
  const meta = [type, row.meta, row.locked ? copy.locked : row.completed ? copy.completed : null].filter(Boolean).join(" · ");
  return <Pressable accessibilityRole="link" testID={`student-material-${row.id}`} onPress={() => navigate(materialRowPath(course.id, row))}
    style={({ pressed }) => [styles.documentRow, { borderTopColor: colors.border, backgroundColor: pressed ? colors.muted : undefined }]}>
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.preview, { backgroundColor: `${colors.muted}70`, borderColor: colors.border }]}>
      {initialCover ? <SvgXml xml={sourceCover ?? initialCover} width={80} height={60}
        fallback={<SvgXml xml={initialCover} width={80} height={60} />} />
        : <NavigationIcon name={row.kind === "quiz" || row.kind === "tryout" ? "clipboard" : "file"} color={colors.primary} size={20} />}
    </View>
    <View style={styles.textColumn}>
      <Text style={[styles.title, { color: colors.foreground }]}>{shortDocumentTitle(row.title, course.title)}</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{meta}</Text>
    </View>
    <NavigationIcon name={row.locked ? "lock" : "chevron-right"} color={colors.mutedForeground} size={14} />
  </Pressable>;
}

const styles = StyleSheet.create({
  actions: { gap: 10, marginBottom: 4 },
  action: { minHeight: 66, borderWidth: StyleSheet.hairlineWidth, borderRadius: nativeRadii.xl, flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  actionIcon: { width: 36, height: 36, borderRadius: nativeRadii.lg, alignItems: "center", justifyContent: "center" },
  badge: { ...nativeTypography.bodySemibold, fontSize: 12, lineHeight: 16, fontVariant: ["tabular-nums"], flexShrink: 0 },
  pricing: { ...nativeTypography.bodyMedium, alignSelf: "flex-start", borderRadius: nativeRadii.md, paddingHorizontal: 10, paddingVertical: 4 },
  syllabus: { marginTop: 14 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  eyebrow: { ...nativeTypography.headingSemibold, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.7, flex: 1 },
  title: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 18 },
  meta: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 16, fontVariant: ["tabular-nums"] },
  empty: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20, paddingVertical: 12 },
  textColumn: { flex: 1, minWidth: 0, gap: 2 },
  chapterRow: { flexDirection: "row", minHeight: 62, alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  chapterNumber: { width: 28, height: 28, borderRadius: nativeRadii.lg, alignItems: "center", justifyContent: "center" },
  status: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  progressTrack: { width: 56, height: 4, borderRadius: nativeRadii.sm, overflow: "hidden" },
  shortcutGrid: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 20, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  shortcut: { flexBasis: "47%", flexGrow: 1, maxWidth: "50%", borderWidth: StyleSheet.hairlineWidth, borderRadius: nativeRadii.xl, minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  shortcutIcon: { width: 28, height: 28, borderRadius: nativeRadii.md, alignItems: "center", justifyContent: "center" },
  shortcutLabel: { ...nativeTypography.bodyMedium, fontSize: 14, lineHeight: 18, flex: 1 },
  accessNoticeCopy: { flex: 1, minWidth: 130 },
  accessNotice: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", borderWidth: StyleSheet.hairlineWidth, borderRadius: nativeRadii.lg, padding: 12, gap: 12 },
  categoryTabs: { marginHorizontal: -16 },
  disclosureSection: { borderBottomWidth: StyleSheet.hairlineWidth },
  disclosure: { minHeight: 47, paddingHorizontal: 10, paddingVertical: 8, gap: 10, borderRadius: nativeRadii.lg, flexDirection: "row", alignItems: "center" },
  chapterBadge: { borderRadius: nativeRadii.md, paddingVertical: 3, paddingHorizontal: 8 },
  expanded: { transform: [{ rotate: "180deg" }] },
  documentRow: { flexDirection: "row", alignItems: "center", minHeight: 72, paddingVertical: 10, paddingHorizontal: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  preview: { width: 80, height: 50, borderRadius: nativeRadii.lg, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
});
