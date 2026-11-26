import { createContext, useContext, useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme, type TextStyle } from "react-native";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import {
  canShowOfflineCourse, coursePath, coursesEndpoint, learningEndpoint, materialPath, materialRowPath, materialTabs, normalizeMaterialTab,
  type CourseCard, type CourseData, type DashboardData, type CatalogData, type EnrollmentFailureCode, type EnrollmentResponse,
  type LearningData, type LearningQuery, type MaterialDetailData, type MaterialListData, type MaterialRow,
} from "../../../../../packages/native-parity/student/courses/contract";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { Skeleton } from "../../../components/Skeleton";
import { nativeTypography } from "../../../typography";
import type { StudentScreenProps } from "../contracts";
import { StudentListRow } from "../ListRow";
import { matchStudentRoute } from "../routes";
import { canonicalStudentArticleHref, offlineMaterialRecovery, type OfflineCourseMetadata, type OfflineCourseTarget } from "../offline-courses";
import { DashboardBottom, DashboardTop, useDashboardExtras } from "./dashboard-extra";
import { courseCopy, type CourseCopy } from "./copy";

type Theme = keyof typeof nativeColors;
type Reader = StudentScreenProps["renderMaterial"];
type Navigate = StudentScreenProps["navigate"];
type ListQueryState = { [key: string]: string | undefined };

function updateListQuery(route: StudentScreenProps["route"], replace: Navigate, updates: ListQueryState) {
  const next = new URLSearchParams({ ...route.query });
  for (const [key, value] of Object.entries(updates)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  const query = next.toString();
  replace(`${route.path.split("?")[0]}${query ? `?${query}` : ""}`);
}
type Request = StudentScreenProps["request"];
type ResourceState =
  | { kind: "loading" }
  | { kind: "ready"; data: LearningData }
  | { kind: "error"; status: number };

const ThemeContext = createContext<Theme>("light");
const CopyContext = createContext<CourseCopy>(courseCopy("id"));
const loading: ResourceState = { kind: "loading" };

function queryForRoute(route: StudentScreenProps["route"]): LearningQuery {
  switch (route.pattern) {
    case "/dashboard": return { view: "dashboard" };
    case "/courses": return { view: "catalog" };
    case "/courses/[id]": return { view: "course", courseId: route.params.id };
    case "/courses/[id]/material": return { view: "material-list", courseId: route.params.id };
    default: return { view: "material-detail", courseId: route.params.id, materialId: route.params.materialId };
  }
}

function validResponse(data: unknown, expectedView: LearningQuery["view"]): data is LearningData {
  if (!data || typeof data !== "object" || !("view" in data) || data.view !== expectedView) return false;
  switch (data.view) {
    case "dashboard": return "enrolled" in data && Array.isArray(data.enrolled) && "recommended" in data && Array.isArray(data.recommended) && "continueReading" in data && Array.isArray(data.continueReading);
    case "catalog": return "courses" in data && Array.isArray(data.courses);
    case "course": return "course" in data && Boolean(data.course) && "chapters" in data && Array.isArray(data.chapters) && "actions" in data && Array.isArray(data.actions);
    case "material-list": return "course" in data && Boolean(data.course) && "materials" in data && Array.isArray(data.materials) && "chapters" in data && Array.isArray(data.chapters);
    case "material-detail": {
      if (!("course" in data) || !data.course || !("material" in data) || !data.material || typeof data.material !== "object") return false;
      const material = data.material;
      return "id" in material && typeof material.id === "string" && "title" in material && typeof material.title === "string"
        && "locked" in material && typeof material.locked === "boolean" && "completed" in material && typeof material.completed === "boolean"
        && "kind" in material && (material.kind === "article" || material.kind === "pdf");
    }
    default: return false;
  }
}

function useLearningData(request: Request, url: string, view: LearningQuery["view"], enabled: boolean) {
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<ResourceState>(loading);

  useEffect(() => {
    setResource(loading);
    if (!enabled) return;
    let current = true;
    const controller = new AbortController();
    async function load() {
      try {
        const reply = await request(url, { signal: controller.signal });
        try {
          if (!current) return;
          if (!reply.ok) {
            setResource({ kind: "error", status: reply.status });
            return;
          }
          const body: unknown = await reply.json();
          if (current) setResource(validResponse(body, view) ? { kind: "ready", data: body } : { kind: "error", status: 500 });
        } finally {
          reply.dispose?.();
        }
      } catch {
        if (current) setResource({ kind: "error", status: 0 });
      }
    }
    void load();
    return () => {
      current = false;
      controller.abort();
    };
  }, [request, url, view, enabled, revision]);

  return { resource, reload: () => setRevision((revision) => revision + 1) };
}

function LearningText({ children, role = "body", style }: { children: ReactNode; role?: "title" | "heading" | "body" | "meta"; style?: TextStyle }) {
  const colors = nativeColors[useContext(ThemeContext)];
  const isHeading = role === "title" || role === "heading";
  return (
    <Text
      accessibilityRole={isHeading ? "header" : undefined}
      style={[isHeading ? nativeTypography.headingBold : nativeTypography.bodyRegular, styles[role], { color: role === "meta" ? colors.mutedForeground : colors.foreground }, style]}
    >
      {children}
    </Text>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <LearningText role="heading">{title}</LearningText> : null}
      {children}
    </View>
  );
}

function Row({ title, meta, onPress, testID }: { title: string; meta?: string; onPress?: () => void; testID?: string }) {
  const theme = useContext(ThemeContext);
  return (
    <StudentListRow title={title} subtitle={meta} testID={testID} theme={theme}
      primary={onPress ? { onPress, role: "link" } : undefined} />
  );
}

function Notice({ title, detail, testID, children }: { title: string; detail?: string; testID?: string; children?: ReactNode }) {
  const colors = nativeColors[useContext(ThemeContext)];
  return (
    <View testID={testID} style={[styles.notice, { borderStartColor: colors.accent }]}>
      <View accessibilityLiveRegion="polite" style={styles.rowText}>
        <LearningText role="heading">{title}</LearningText>
        {detail ? <LearningText>{detail}</LearningText> : null}
      </View>
      {children}
    </View>
  );
}

function Enrollment({ request, reload }: { request: Request; reload: () => void }) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  const submitting = useRef(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const errors: Record<EnrollmentFailureCode, string> = {
    empty: copy.empty, invalid: copy.invalid, expired: copy.tokenExpired, noCourses: copy.noTokenCourses,
    alreadyMember: copy.alreadyMember, capacityReached: copy.capacityReached, alreadyEnrolled: copy.alreadyEnrolled, internal: copy.activationError,
  };

  async function submit() {
    if (submitting.current) return;
    const cleanToken = token.trim();
    if (!cleanToken) {
      setMessage(copy.empty);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const response = await request(coursesEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cleanToken }),
      });
      try {
        if (response.status === 401 || response.status === 409) {
          setMessage(copy.expiredHint);
          return;
        }
        const result = await response.json() as EnrollmentResponse;
        if (response.ok && result.success) {
          setToken("");
          setMessage(copy.activated);
          reload();
        } else if (!result.success && ["alreadyMember", "alreadyEnrolled"].includes(result.errorCode)) {
          // A retry may follow a successful activation whose response was lost.
          reload();
        } else {
          setMessage(!result.success ? errors[result.errorCode] ?? copy.activationError : copy.activationError);
        }
      } finally {
        response.dispose?.();
      }
    } catch {
      setMessage(copy.activationError);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Notice title={copy.activation} detail={copy.activationHint}>
      <Input
        theme={theme}
        accessibilityLabel={copy.token}
        placeholder={copy.token}
        autoCapitalize="none"
        autoCorrect={false}
        value={token}
        disabled={busy}
        maxLength={256}
        onChangeText={setToken}
        onSubmitEditing={() => void submit()}
      />
      <Button theme={theme} size="lg" onPress={() => void submit()} isLoading={busy}>{copy.activation}</Button>
      {message ? <Text accessibilityLiveRegion="polite" style={[styles.meta, { color: nativeColors[theme].foreground }]}>{message}</Text> : null}
    </Notice>
  );
}

function getOffer(course: CourseCard, asOf: string | undefined, locale: string, copy: CourseCopy): string | undefined {
  const pricing = course.pricing;
  if (!pricing || pricing.category !== "limited_time_free" || !pricing.startsAt || !pricing.endsAt) return undefined;
  const start = new Date(pricing.startsAt);
  const end = new Date(pricing.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) return undefined;
  const current = asOf ? new Date(asOf) : new Date();
  const label = current < start ? copy.offerUpcoming : current >= end ? copy.offerEnded : copy.offerActive;
  const format = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
  return `${label} · ${format.format(start)} - ${format.format(end)} WIB`;
}

function CourseRows({ courses, navigate, catalog = false, asOf, locale = "id-ID" }: { courses: CourseCard[]; navigate: Navigate; catalog?: boolean; asOf?: string; locale?: string }) {
  const copy = useContext(CopyContext);
  return courses.map((course) => {
    const counts = [
      [course.materialsCount, copy.materials],
      [course.quizzesCount, copy.quiz],
      [course.tryoutsCount, copy.tryout],
    ].flatMap(([count, label]) => typeof count === "number" && count > 0 ? [`${count} ${String(label).toLocaleLowerCase()}`] : []);
    const countsOrEmpty = counts.length > 0 ? counts : [copy.noCourseContents];
    const details = catalog ? countsOrEmpty : [course.description, ...counts];
    const offer = catalog ? getOffer(course, asOf, locale, copy) : undefined;
    const meta = [...details, offer ?? (course.hasFullContentAccess ? "" : copy.limitedAccess)].filter(Boolean).join(" · ");
    return (
      <Row key={course.id} title={course.title} meta={meta} testID={`student-course-${course.id}`} onPress={() => navigate(coursePath(course.id))} />
    );
  });
}

function Dashboard({ data, navigate, request, reload, locale }: { data: DashboardData; locale: string } & Pick<StudentScreenProps, "navigate" | "request"> & { reload: () => void }) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  const extra = useDashboardExtras(request, data.enrolled.length > 0);
  return (
    <>
      {data.firstName ? <LearningText role="title">{`${copy.greeting}, ${data.firstName}`}</LearningText> : null}
      <DashboardTop data={extra.data} request={request} navigate={navigate} copy={copy} theme={theme} locale={locale} />
      {data.continueReading.length > 0 && (
        <Section title={copy.continue}>
          {data.continueReading.map((item) => (
            <Row key={`${item.courseId}/${item.materialId}`} title={item.title} meta={`${item.courseTitle} · ${item.completionPercent}%`} onPress={() => navigate(materialPath(item.courseId, item.materialId, item.section))} />
          ))}
        </Section>
      )}
      {data.enrolled.length > 0 ? (
        <Section title={copy.enrolled}><CourseRows courses={data.enrolled} navigate={navigate} /></Section>
      ) : (
        <>
          <LearningText role="heading">{copy.noEnrollment}</LearningText>
          <Enrollment request={request} reload={reload} />
        </>
      )}
      {data.recommended.length > 0 ? <Section title={copy.recommended}><CourseRows courses={data.recommended} navigate={navigate} /></Section> : null}
      <DashboardBottom state={extra} navigate={navigate} copy={copy} theme={theme} locale={locale} />
      <Button theme={theme} variant="outline" size="lg" onPress={() => navigate("/courses")}>{copy.browse}</Button>
    </>
  );
}

function Toggle({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  const colors = nativeColors[useContext(ThemeContext)];
  return (
    <Pressable
      accessibilityRole="tab"
      testID={testID}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.toggle, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}14` : colors.background }]}
    >
      <LearningText style={selected ? nativeTypography.bodySemibold : undefined}>{label}</LearningText>
    </Pressable>
  );
}

function categorySlug(category: string) {
  return category.toLowerCase().trim().replace(/[^\w\s-]/gu, "").replace(/\s+/gu, "-");
}

function Catalog({ data, navigate, route, replace, openExternal, locale }: { data: CatalogData; locale: string } & Pick<StudentScreenProps, "navigate" | "route" | "replace" | "openExternal">) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  const search = route.query.q ?? "";
  const searchTerm = search.trim().toLocaleLowerCase();
  const categories = [...new Set(data.courses.map((course) => course.category))];
  const legacyCategory = categories.find((category) => categorySlug(category) === route.query.jurusan);
  const category = route.query.category || legacyCategory || null;
  const supportUrl = data.supportUrl;
  const matching = data.courses.filter((course) => (!category || course.category === category)
    && [course.title, course.description, course.category].some((text) => text.toLocaleLowerCase().includes(searchTerm)));

  return (
    <>
      {categories.length > 0 && (
        <>
          <Input theme={theme} accessibilityLabel={copy.search} placeholder={copy.search} value={search} onChangeText={(q) => updateListQuery(route, replace, { q })} />
          {categories.length > 1 && (
            <View style={styles.toggles} accessibilityRole="tablist">
              <Toggle testID="student-catalog-tab-all" label={`${copy.all} (${data.courses.length})`} selected={category === null} onPress={() => updateListQuery(route, replace, { category: undefined, jurusan: undefined })} />
              {categories.map((name) => <Toggle key={name} testID={`student-catalog-tab-${categorySlug(name)}`} label={name} selected={category === name} onPress={() => updateListQuery(route, replace, { category: name, jurusan: undefined })} />)}
            </View>
          )}
        </>
      )}
      {matching.length === 0 ? <LearningText>{copy.noCourses}</LearningText> : categories.filter((name) => matching.some((course) => name === course.category)).map((name) => (
        <Section key={name} title={name}>
          <CourseRows courses={matching.filter((course) => name === course.category)} navigate={navigate} catalog asOf={data.asOf} locale={locale} />
        </Section>
      ))}
      {openExternal ? <Section>
        <Row title={copy.plans} onPress={() => openExternal("/plans")} />
        {supportUrl ? <Row title={copy.contact} onPress={() => openExternal(supportUrl)} /> : null}
      </Section> : null}
    </>
  );
}

const courseLinks = [
  ["video", "video"], ["flashcard", "flashcard"], ["quiz", "quiz"], ["tryout", "tryout"], ["path", "studyPath"],
  ["mastery", "mastery"], ["progress", "progress"], ["leaderboard", "ranking"], ["my-results", "results"],
  ["discussions", "discussions"], ["playground", "playground"],
] as const;

function CourseOverview({ data, navigate, request, reload, locale }: { data: CourseData; locale: string } & Pick<StudentScreenProps, "navigate" | "request"> & { reload: () => void }) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  const { course, chapters, attention } = data;
  const pricing = course.pricing ? getOffer(course, undefined, locale, copy) ?? (course.pricing.category === "free" ? copy.free : copy.premium) : undefined;
  return (
    <>
      <LearningText role="title">{course.title}</LearningText>
      {course.description ? <LearningText>{course.description}</LearningText> : null}
      {pricing ? <LearningText role="meta">{pricing}</LearningText> : null}
      {!course.hasFullContentAccess ? <Enrollment request={request} reload={reload} /> : null}
      {data.actions.length > 0 ? <Section>{data.actions.map(({ key, title, meta, path }) => <Row key={key} title={title} meta={meta} onPress={matchStudentRoute(path) ? () => navigate(path) : undefined} />)}</Section> : null}
      {attention?.length ? <Section title={copy.attention}>
        {attention.map(({ kind, title, path, count, masteryScore }) => <Row key={kind}
          title={kind === "flashcard" && count !== undefined ? `${count} ${copy.reviewDue}` : title}
          meta={masteryScore !== undefined ? `${masteryScore}%` : undefined}
          onPress={matchStudentRoute(path) ? () => navigate(path) : undefined} />)}
      </Section> : null}
      <Button theme={theme} size="lg" testID="student-course-open-materials" onPress={() => navigate(materialPath(course.id))}>{copy.openDocuments}</Button>
      <Section title={copy.chapters}>
        {chapters.length > 0 ? chapters.map(({ id, title, completed, completionPercent, materialId }) => (
          <Row key={id} title={title} meta={completed ? copy.completed : completionPercent > 0 ? `${completionPercent}%` : undefined} onPress={materialId ? () => navigate(materialPath(course.id, materialId)) : undefined} />
        )) : <LearningText>{copy.noChapters}</LearningText>}
      </Section>
      {course.hasFullContentAccess && (
        <Section>
          {courseLinks.map(([segment, label]) => <Row key={segment} title={copy[label]} onPress={() => navigate(`${coursePath(course.id)}/${segment}`)} />)}
          {data.liveEnabled ? <Row title={copy.live} onPress={() => navigate(`${coursePath(course.id)}/live`)} /> : null}
        </Section>
      )}
    </>
  );
}

function DocumentRows({ materials, courseId, navigate }: { materials: MaterialRow[]; courseId: string; navigate: Navigate }) {
  const copy = useContext(CopyContext);
  return materials.map((row) => {
    const path = materialRowPath(courseId, row);
    return (
      <Row
        key={`${row.kind}/${row.id}`}
        title={row.title}
        meta={[row.meta, row.locked ? copy.locked : row.completed ? copy.completed : null].filter(Boolean).join(" · ")}
        testID={`student-material-${row.id}`}
        onPress={() => navigate(path)}
      />
    );
  });
}

function Documents({ data, route, replace, navigate, request, reload, openOfflineLibrary }: { data: MaterialListData } & Pick<StudentScreenProps, "navigate" | "request" | "route" | "replace" | "openOfflineLibrary"> & { reload: () => void }) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  const tab = normalizeMaterialTab(route.query.tab);
  const { course, chapters, materials } = data;
  const matching = tab === "all" ? materials : materials.filter((row) => row.group === tab);
  const groups = new Map(chapters.map((chapter) => [chapter.id, [] as MaterialRow[]]));
  const chapterByAlias = new Map(chapters.flatMap((chapter) => chapter.aliases.map((alias) => [alias, chapter.id] as const)));
  const ungrouped: MaterialRow[] = [];
  for (const row of matching) {
    const chapterId = row.chapterIds.map((alias) => chapterByAlias.get(alias)).find(Boolean);
    const entries = chapterId ? groups.get(chapterId) : undefined;
    (entries ?? ungrouped).push(row);
  }
  return (
    <>
      <LearningText role="title">{course.title}</LearningText>
      <View style={styles.toggles} accessibilityRole="tablist">
        {materialTabs.map((key) => <Toggle key={key} label={copy[key]} selected={key === tab} onPress={() => updateListQuery(route, replace, { tab: key === "all" ? undefined : key })} />)}
      </View>
      {!course.hasFullContentAccess ? <Enrollment request={request} reload={reload} /> : null}
      {openOfflineLibrary ? <Button theme={theme} variant="outline" onPress={() => openOfflineLibrary({ courseId: course.id })}>{copy.savedCourses}</Button> : null}
      {matching.length === 0 ? <LearningText>{copy.noDocuments}</LearningText> : null}
      {chapters.map(({ id, title }) => {
        const rows = groups.get(id);
        return rows?.length ? <Section key={id} title={title}><DocumentRows materials={rows} courseId={course.id} navigate={navigate} /></Section> : null;
      })}
      {ungrouped.length > 0 ? <Section title={ungrouped.length < matching.length ? copy.otherDocuments : undefined}><DocumentRows materials={ungrouped} courseId={course.id} navigate={navigate} /></Section> : null}
    </>
  );
}

function Document({ data, request, reload, renderMaterial, route, replace, openOfflineLibrary }: { data: MaterialDetailData; request: Request; reload: () => void; renderMaterial?: Reader } & Pick<StudentScreenProps, "route" | "replace" | "openOfflineLibrary">) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  const { course, material } = data;
  const canonicalHref = canonicalStudentArticleHref(route, data);
  useEffect(() => { if (canonicalHref) replace(canonicalHref); }, [canonicalHref, replace]);
  const requestedPage = Number(route.query.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : undefined;
  return (
    <>
      <LearningText role="meta">{course.title}</LearningText>
      <LearningText role="title">{material.title}</LearningText>
      {material.locked ? (
        <>
          <Notice title={copy.locked} detail={copy.lockedHint} testID="student-material-locked" />
          <Enrollment request={request} reload={reload} />
        </>
      ) : (
        <>
          {material.completed ? <LearningText role="meta">{copy.completed}</LearningText> : null}
          {openOfflineLibrary && material.kind === "article" ? <Button theme={theme} variant="outline"
            onPress={() => openOfflineLibrary({ courseId: course.id, materialId: material.id })}>{copy.savedCourses}</Button> : null}
          {renderMaterial?.({ courseId: course.id, materialId: material.id, section: route.query.section, page }) ?? <LearningText>{copy.rendererPending}</LearningText>}
        </>
      )}
    </>
  );
}

function OfflineDocuments({ data, query, route, replace, navigate, retry, openOfflineMaterial, openOfflineLibrary }: {
  data: NonNullable<NonNullable<StudentScreenProps["offlineCourse"]>["course"]>;
  query: LearningQuery;
  retry(): void;
} & Pick<StudentScreenProps, "navigate" | "replace" | "route" | "openOfflineMaterial" | "openOfflineLibrary">) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  const recovery = query.view === "material-detail" ? offlineMaterialRecovery(data, query.materialId) : undefined;
  const selected = recovery?.material;
  const tab = normalizeMaterialTab(route.query.tab);
  const records = tab === "all" ? data.materials : data.materials.filter(row => row.kind === (tab === "materi" ? "article" : tab));
  return <>
    <LearningText role="title">{data.title}</LearningText>
    <Notice title={copy.offline} detail={copy.offlineMetadata}>
      <Button theme={theme} variant="outline" testID="student-learning-retry" onPress={retry}>{copy.retry}</Button>
    </Notice>
    {recovery ? selected ? (
      <Section title={selected.title}>
        {openOfflineMaterial
          ? <Button theme={theme} onPress={() => openOfflineMaterial(data.id, selected.id)}>{copy.readMaterials}</Button>
          : null}
        {openOfflineLibrary
          ? <Button theme={theme} variant="outline" onPress={() => openOfflineLibrary(recovery.libraryTarget)}>{copy.savedCourses}</Button>
          : !openOfflineMaterial ? <LearningText role="meta">{copy.offlineReaderPending}</LearningText> : null}
      </Section>
    ) : <>
      <LearningText>{copy.offlineMaterialUnavailable}</LearningText>
      {openOfflineLibrary ? <Button theme={theme} variant="outline" testID="student-offline-course-library"
        onPress={() => openOfflineLibrary(recovery.libraryTarget)}>{copy.savedCourses}</Button> : null}
    </> : <>
      <View style={styles.toggles} accessibilityRole="tablist">
        {materialTabs.map(key => <Toggle key={key} label={copy[key]} selected={key === tab}
          onPress={() => updateListQuery(route, replace, { tab: key === "all" ? undefined : key })} />)}
      </View>
      {openOfflineLibrary ? <Button theme={theme} variant="outline" onPress={() => openOfflineLibrary({ courseId: data.id })}>{copy.savedCourses}</Button> : null}
      {records.length === 0 ? <LearningText>{copy.noDocuments}</LearningText> : <Section>
        {records.map(item => <Row key={`${item.kind}/${item.id}`} title={item.title} testID={`student-material-${item.id}`}
          onPress={() => navigate(materialPath(data.id, item.id))} />)}
      </Section>}
    </>}
  </>;
}

export function OfflineCourseScreen({
  path, target, courses, status, locale, retry, navigate, replace, back, devicePreferences,
  initialScrollY, onScrollY, openOfflineMaterial, openOfflineLibrary,
}: {
  path: string;
  target: Exclude<OfflineCourseTarget, { kind: "library" }>;
  courses: OfflineCourseMetadata[];
  status: string;
  locale: string;
  retry(): void;
} & Pick<StudentScreenProps, "navigate" | "replace" | "back" | "devicePreferences" | "initialScrollY" | "onScrollY" | "openOfflineMaterial" | "openOfflineLibrary">) {
  const systemTheme = useColorScheme() === "dark" ? "dark" : "light";
  const preference = devicePreferences?.theme;
  const theme = preference && preference !== "system" ? preference : systemTheme;
  const copy = courseCopy(locale);
  const colors = nativeColors[theme];
  const route = matchStudentRoute(path);
  const course = "courseId" in target ? courses.find(({ id }) => id === target.courseId) : undefined;
  const ready = status === "offline" || status === "error";
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const restore = useRef(initialScrollY);
  const viewport = useRef(0);
  const content = useRef(0);
  const restorePosition = () => {
    if (!ready || restore.current <= 0 || viewport.current <= 0 || content.current <= 0) return;
    const y = Math.min(restore.current, Math.max(0, content.current - viewport.current));
    restore.current = 0;
    scroll.current?.scrollTo({ y, animated: false });
  };

  return <ThemeContext.Provider value={theme}>
    <CopyContext.Provider value={copy}>
      <ScrollView ref={scroll} style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}
        testID={target.kind === "course" ? "student-materials-list" : "student-offline-courses"}
        scrollEventThrottle={16}
        onLayout={event => { viewport.current = event.nativeEvent.layout.height; restorePosition(); }}
        onContentSizeChange={(_width, height) => { if (ready) { content.current = height; restorePosition(); } }}
        onScroll={event => { if (ready && restore.current <= 0) onScrollY(Math.max(0, event.nativeEvent.contentOffset.y)); }}>
        <Button theme={theme} variant="ghost" testID="student-learning-back" style={styles.back} onPress={back}>{copy.back}</Button>
        {ready && course && route && "courseId" in target ? <OfflineDocuments
          data={course}
          query={target.kind === "course"
            ? { view: "material-list", courseId: target.courseId }
            : { view: "material-detail", courseId: target.courseId, materialId: target.materialId }}
          route={route} navigate={navigate} replace={replace} retry={retry} openOfflineMaterial={openOfflineMaterial} openOfflineLibrary={openOfflineLibrary} />
          : <>
            <Notice title={copy.offline} detail={!ready ? copy.loading : copy.offlineUnavailable}>
              <Button theme={theme} variant="outline" testID="student-learning-retry" onPress={retry}>{copy.retry}</Button>
            </Notice>
            {ready && openOfflineLibrary ? <Button theme={theme} variant="outline" onPress={() => openOfflineLibrary()}>{copy.savedCourses}</Button> : null}
          </>}
      </ScrollView>
    </CopyContext.Provider>
  </ThemeContext.Provider>;
}

function CourseEntry(props: StudentScreenProps & { query: LearningQuery }) {
  const { route, query, request, navigate, replace, back, initialScrollY, onScrollY, renderMaterial, openExternal, devicePreferences, session } = props;
  const systemTheme = useColorScheme() === "dark" ? "dark" : "light";
  const preference = devicePreferences?.theme;
  const theme = preference && preference !== "system" ? preference : systemTheme;
  const colors = nativeColors[theme];
  const copy = courseCopy(session.locale);
  const locale = session.locale.startsWith("en") ? "en-GB" : "id-ID";
  const offline = props.offlineCourse;
  const isCourseRoute = "courseId" in query;
  const revoked = isCourseRoute && offline?.status === "revoked";
  const { resource, reload: loadAgain } = useLearningData(request, learningEndpoint(query), query.view, !revoked);
  const cached = offline?.course;
  const useOfflineMetadata = canShowOfflineCourse(query.view, "courseId" in query ? query.courseId : undefined, cached?.id, offline?.status, resource);
  const restoreOffset = useRef({ x: 0, y: initialScrollY });
  const lastOffset = useRef(initialScrollY);
  const isReady = !revoked && (resource.kind === "ready" || Boolean(useOfflineMetadata));
  const reload = () => {
    restoreOffset.current = { x: 0, y: lastOffset.current };
    loadAgain();
  };

  let content: ReactNode;
  if (revoked) {
    content = <Notice title={copy.noAccess} detail={copy.noAccessHint} testID="student-course-revoked">
      <Button theme={theme} variant="outline" onPress={() => navigate("/courses")}>{copy.catalog}</Button>
    </Notice>;
  } else if (useOfflineMetadata && cached && offline) {
    content = <OfflineDocuments data={cached} query={query} route={route} replace={replace} navigate={navigate} openOfflineMaterial={props.openOfflineMaterial} openOfflineLibrary={props.openOfflineLibrary}
      retry={() => { offline.retry(); reload(); }} />;
  } else if (resource.kind === "loading") {
    content = (
      <View accessible accessibilityLabel={copy.loading} accessibilityState={{ busy: true }} style={styles.section}>
        <Skeleton theme={theme} style={styles.skeletonTitle} />
        {[0, 1, 2].map((index) => <Skeleton key={index} theme={theme} style={styles.skeletonRow} />)}
      </View>
    );
  } else if (resource.kind === "error") {
    const status = resource.status;
    const message = status === 401 || status === 409 ? [copy.expired, copy.expiredHint]
      : status === 403 ? [copy.noAccess, copy.noAccessHint]
      : status === 404 ? [copy.unavailable] : [copy.connection, copy.connectionHint];
    content = (
      <Notice title={message[0]} detail={message[1]}>
        {(status === 0 || status >= 500) ? <Button theme={theme} size="lg" variant="outline" testID="student-learning-retry" onPress={reload}>{copy.retry}</Button> : null}
        {status === 403 ? <Button theme={theme} size="lg" variant="outline" onPress={() => navigate("/courses")}>{copy.catalog}</Button> : null}
      </Notice>
    );
  } else {
    switch (resource.data.view) {
      case "dashboard": content = <Dashboard data={resource.data} navigate={navigate} request={request} reload={reload} locale={locale} />; break;
      case "dashboard-extras": content = null; break;
      case "catalog": content = <Catalog data={resource.data} navigate={navigate} route={route} replace={replace} openExternal={openExternal} locale={locale} />; break;
      case "course": content = <CourseOverview data={resource.data} navigate={navigate} request={request} reload={reload} locale={locale} />; break;
      case "material-list": content = <Documents data={resource.data} route={route} replace={replace} navigate={navigate} request={request} reload={reload} openOfflineLibrary={props.openOfflineLibrary} />; break;
      case "material-detail": content = <Document data={resource.data} request={request} reload={reload} renderMaterial={renderMaterial} route={route} replace={replace} openOfflineLibrary={props.openOfflineLibrary} />; break;
    }
  }

  // Mount ready content with its initial offset so native layout does not clamp it to the loading skeleton.
  return (
    <ThemeContext.Provider value={theme}>
      <CopyContext.Provider value={copy}>
        <ScrollView
          key={isReady ? "loaded" : "pending"}
          contentOffset={isReady ? restoreOffset.current : undefined}
          testID={query.view === "catalog" ? "student-courses-list" : query.view === "material-list" ? "student-materials-list" : `student-learning-${query.view}`}
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={resource.kind === "loading" && lastOffset.current > 0} onRefresh={reload} tintColor={colors.primary} colors={[colors.primary]} />}
          scrollEventThrottle={16}
          onScroll={(event) => {
            if (isReady) {
              lastOffset.current = Math.max(0, event.nativeEvent.contentOffset.y);
              onScrollY(lastOffset.current);
            }
          }}
        >
          {query.view === "course" || query.view === "material-list" || query.view === "material-detail" ? (
            <Button theme={theme} variant="ghost" testID="student-learning-back" style={styles.back} onPress={back}>{copy.back}</Button>
          ) : null}
          {isReady ? <View style={styles.readyContent}>{content}</View> : content}
        </ScrollView>
      </CopyContext.Provider>
    </ThemeContext.Provider>
  );
}

export function CourseScreen(props: StudentScreenProps) {
  const query = queryForRoute(props.route);
  const { origin, userId, locale } = props.session;
  const key = JSON.stringify([origin, userId, locale, query]);
  return <CourseEntry key={key} {...props} query={query} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 36, gap: 14 },
  readyContent: { gap: 14 },
  title: { fontSize: 24, lineHeight: 32 },
  heading: { fontSize: 16, lineHeight: 24 },
  body: { fontSize: 14, lineHeight: 21 },
  meta: { fontSize: 12, lineHeight: 18 },
  section: { gap: 3 },
  rowText: { flexShrink: 1, gap: 2 },
  toggles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggle: { borderWidth: 1, borderRadius: nativeRadii.md, minHeight: 44, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 5 },
  notice: { borderStartWidth: 2, paddingStart: 12, gap: 8, paddingVertical: 3 },
  skeletonTitle: { width: "55%", height: 22, marginBottom: 10 },
  skeletonRow: { height: 40, marginBottom: 7 },
  back: { alignSelf: "flex-start" },
});
