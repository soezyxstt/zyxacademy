import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { nativeColors, nativeLinkInks, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { coursePath, type CatalogData, type CourseCard } from "../../../../../packages/native-parity/student/courses/contract";
import { Button } from "../../../components/Button";
import { nativeTypography } from "../../../typography";
import { NavigationTabs } from "../../shared-ui/navigation";
import { NavigationIcon } from "../../shared-ui/navigation-icons";
import type { StudentScreenProps } from "../contracts";
import { catalogCopy, getCatalogGroups, getCatalogOffer, getCatalogOfferWindow, getCatalogRow, nextCatalogOfferChange } from "./catalog-model";
import { courseCopy } from "./copy";

type Theme = keyof typeof nativeColors;
type Copy = ReturnType<typeof catalogCopy>;

// sRGB equivalents of the Tailwind badge colors used by the web catalog.
const badgeColors = {
  math: { accent: "#2b7fff", light: "#155dfb", dark: "#51a2ff" },
  physics: { accent: "#00bc7d", light: "#009966", dark: "#00d492" },
  chemistry: { accent: "#fe9a00", light: "#bb4d00", dark: "#ffb900" },
  computing: { accent: "#00b8db", light: "#0092b8", dark: "#00d3f2" },
  pka: { accent: "#ad46ff", light: "#9810fa", dark: "#c27aff" },
};

function useCatalogTime(data: CatalogData) {
  const fixed = data.asOf ? Date.parse(data.asOf) : NaN;
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    if (Number.isFinite(fixed)) return;
    const current = Date.now();
    const next = nextCatalogOfferChange(data, current);
    if (next === null) return;
    const timeout = setTimeout(() => setClock(Date.now()), Math.min(next - current, 2_147_483_647));
    return () => clearTimeout(timeout);
  }, [clock, data, fixed]);
  return new Date(Number.isFinite(fixed) ? fixed : clock);
}

function CatalogRow({ course, copy, locale, now, theme, navigate }: {
  course: CourseCard; copy: Copy; locale: string; now: Date; theme: Theme; navigate: StudentScreenProps["navigate"];
}) {
  const colors = nativeColors[theme];
  const { badge, hasContent, summary, lockedLabel } = getCatalogRow(course, copy);
  const badgeColor = badge.tone === "default" ? colors.brandPrimary : badgeColors[badge.tone][theme];
  const badgeAccent = badge.tone === "default" ? colors.brandPrimary : badgeColors[badge.tone].accent;
  const window = getCatalogOfferWindow(course);
  const offer = window && getCatalogOffer(window, locale, now);
  const offerText = offer && `${copy.row[offer.state]} · ${offer.schedule}`;
  const muted = { color: colors.mutedForeground };
  const [focused, setFocused] = useState(false);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={[course.title, summary, offerText, lockedLabel].filter(Boolean).join(", ")}
      testID={`student-course-${course.id}`} onPress={() => navigate(coursePath(course.id))}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [
        styles.row, pressed && { backgroundColor: `${colors.muted}66` },
        focused && { outlineColor: colors.accent, outlineWidth: 2, outlineOffset: -2 },
      ]}>
      <View aria-hidden style={[styles.badge, { opacity: hasContent ? 1 : 0.75, borderColor: `${badgeAccent}40`, backgroundColor: `${badgeAccent}1a` }]}>
        <Text maxFontSizeMultiplier={1.5} style={[styles.badgeText, { color: badgeColor }]}>{badge.initials}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: hasContent ? colors.foreground : colors.mutedForeground }]}>{course.title}</Text>
        <Text style={[styles.meta, muted]} textBreakStrategy="simple">{summary}</Text>
        {offer && <Text style={[styles.meta, muted]}>
          <Text style={[nativeTypography.bodyMedium, { color: offer.state === "offerEnded" ? colors.mutedForeground : theme === "dark" ? nativeLinkInks.success : colors.foreground }]}>
            {copy.row[offer.state]}
          </Text>{` · ${offer.schedule}`}
        </Text>}
      </View>
      {lockedLabel && <View aria-hidden style={styles.lock}><NavigationIcon name="lock" size={16} color={colors.mutedForeground} /></View>}
    </Pressable>
  );
}

export function Catalog({ data, navigate, query, onSelectGroup, onClearSearch, openExternal, locale, theme }: {
  data: CatalogData; locale: string; theme: Theme; query: StudentScreenProps["route"]["query"];
  onSelectGroup: (id: string) => void; onClearSearch: () => void;
} & Pick<StudentScreenProps, "navigate" | "openExternal">) {
  const copy = catalogCopy(locale);
  const colors = nativeColors[theme];
  const now = useCatalogTime(data);
  const { groups, active, visible, hasSearch } = getCatalogGroups(data.courses, query);
  const { supportUrl } = data;
  const muted = { color: colors.mutedForeground };
  return (
    <View style={styles.catalog}>
      {groups.length > 1 && <View style={styles.tabs}>
        <NavigationTabs tabs={[{ id: "all", label: copy.all(data.courses.length) }, ...groups.map(group => ({ id: group.id, label: group.name }))]}
          activeId={active} onTabPress={onSelectGroup} accessibilityLabel={copy.row.filterLabel} theme={theme}
          activeIndicatorColor={colors.foreground} moreLabel={locale.startsWith("en") ? "More" : "Lainnya"}
          closeLabel={locale.startsWith("en") ? "Close" : "Tutup"} testID="student-catalog-tab" />
      </View>}
      {hasSearch && <Button variant="outline" theme={theme} testID="student-catalog-clear-search"
        style={styles.clearSearch} onPress={onClearSearch}>{copy.catalog.clearSearch}</Button>}
      <View style={styles.sections}>
        {visible.map(group => <View key={group.id} style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitle}>
              <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>{group.name}</Text>
              {group.isMajor && <Text style={[styles.meta, muted]}>{copy.row.yourMajor}</Text>}
            </View>
            <Text style={[styles.meta, muted]}>{copy.count(group.courses.length, "course")}</Text>
          </View>
          <View>{group.courses.map(course => <CatalogRow key={course.id} course={course} copy={copy} locale={locale} now={now} theme={theme} navigate={navigate} />)}</View>
        </View>)}
        {visible.length === 0 && <View style={styles.empty}>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
            {hasSearch ? courseCopy(locale).noCourses : copy.catalog.emptyTitle}
          </Text>
          {!hasSearch && <Text style={[styles.meta, muted]}>{copy.catalog.emptyDescription}</Text>}
        </View>}
      </View>
      {openExternal && <Text style={[styles.meta, styles.help, muted]} textBreakStrategy="simple">
        {copy.catalog.needMoreAccess}{" "}
        <Text accessibilityRole="link" style={styles.helpLink} onPress={() => openExternal("/plans")}>
          {copy.catalog.viewPlans}
        </Text>
        {supportUrl && <>
          {` ${copy.catalog.or} `}
          <Text accessibilityRole="link" style={styles.helpLink} onPress={() => openExternal(supportUrl)}>
            {copy.catalog.contactWhatsApp}
          </Text>
        </>}
        {"."}
      </Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  catalog: { gap: 16 },
  tabs: { marginHorizontal: -16 },
  clearSearch: { alignSelf: "flex-start", minHeight: 44 },
  sections: { gap: 24 },
  section: { gap: 4 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingBottom: 4 },
  sectionTitle: { flexDirection: "row", flexWrap: "wrap", flexShrink: 1, alignItems: "center", gap: 8 },
  heading: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 24, includeFontPadding: false },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, borderRadius: nativeRadii.md },
  badge: { width: 36, height: 36, marginTop: 2, borderRadius: nativeRadii.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badgeText: { ...nativeTypography.bodySemibold, fontSize: 12, lineHeight: 18, letterSpacing: -0.3, includeFontPadding: false },
  rowText: { minWidth: 0, flex: 1, gap: 2 },
  rowTitle: { ...nativeTypography.headingSemibold, fontSize: 14, lineHeight: 20, includeFontPadding: false },
  // Keep catalog metadata wrapping close to the web Inter metrics.
  meta: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 18, letterSpacing: 0.18, includeFontPadding: false },
  lock: { alignSelf: "center" },
  empty: { alignItems: "center", gap: 4, paddingVertical: 48 },
  help: { marginTop: 24 },
  helpLink: { textDecorationLine: "underline" },
});
