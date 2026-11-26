import { createContext, useContext, useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme, type TextStyle } from "react-native";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import {
  coursePath, coursesEndpoint, learningEndpoint, materialPath, materialRowPath, materialTabs, normalizeMaterialTab,
  type CourseCard, type CourseData, type DashboardData, type CatalogData, type EnrollmentFailureCode, type EnrollmentResponse,
  type LearningData, type LearningQuery, type MaterialDetailData, type MaterialListData, type MaterialRow,
} from "../../../../../packages/native-parity/student/courses/contract";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { Skeleton } from "../../../components/Skeleton";
import { nativeTypography } from "../../../typography";
import type { StudentScreenProps } from "../contracts";
import { StudentListRow } from "../ListRow";
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

function useLearningData(request: Request, url: string, view: LearningQuery["view"]) {
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<ResourceState>(loading);

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setResource(loading);
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
  }, [request, url, view, revision]);

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

function Dashboard({ data, navigate, request, reload }: { data: DashboardData } & Pick<StudentScreenProps, "navigate" | "request"> & { reload: () => void }) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  return (
    <>
      {data.firstName ? <LearningText role="title">{`${copy.greeting}, ${data.firstName}`}</LearningText> : null}
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

function CourseOverview({ data, navigate, request, reload }: { data: CourseData } & Pick<StudentScreenProps, "navigate" | "request"> & { reload: () => void }) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  const { course, chapters } = data;
  return (
    <>
      <LearningText role="title">{course.title}</LearningText>
      {course.description ? <LearningText>{course.description}</LearningText> : null}
      {!course.hasFullContentAccess ? <Enrollment request={request} reload={reload} /> : null}
      {data.actions.length > 0 ? <Section>{data.actions.map(({ key, title, meta, path }) => <Row key={key} title={title} meta={meta} onPress={() => navigate(path)} />)}</Section> : null}
      <Button theme={theme} size="lg" testID="student-course-open-materials" onPress={() => navigate(materialPath(course.id))}>{copy.openDocuments}</Button>
      <Section title={copy.chapters}>
        {chapters.length > 0 ? chapters.map(({ id, title, completed, completionPercent, materialId }) => (
          <Row key={id} title={title} meta={completed ? copy.completed : completionPercent > 0 ? `${completionPercent}%` : undefined} onPress={materialId ? () => navigate(materialPath(course.id, materialId)) : undefined} />
        )) : <LearningText>{copy.noChapters}</LearningText>}
      </Section>
      {course.hasFullContentAccess && (
        <Section>
          {courseLinks.map(([segment, label]) => <Row key={segment} title={copy[label]} onPress={() => navigate(`${coursePath(course.id)}/${segment}`)} />)}
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

function Documents({ data, route, replace, navigate, request, reload }: { data: MaterialListData } & Pick<StudentScreenProps, "navigate" | "request" | "route" | "replace"> & { reload: () => void }) {
  const copy = useContext(CopyContext);
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
      {matching.length === 0 ? <LearningText>{copy.noDocuments}</LearningText> : null}
      {chapters.map(({ id, title }) => {
        const rows = groups.get(id);
        return rows?.length ? <Section key={id} title={title}><DocumentRows materials={rows} courseId={course.id} navigate={navigate} /></Section> : null;
      })}
      {ungrouped.length > 0 ? <Section title={ungrouped.length < matching.length ? copy.otherDocuments : undefined}><DocumentRows materials={ungrouped} courseId={course.id} navigate={navigate} /></Section> : null}
    </>
  );
}

function Document({ data, request, reload, renderMaterial, route }: { data: MaterialDetailData; request: Request; reload: () => void; renderMaterial?: Reader; route: StudentScreenProps["route"] }) {
  const copy = useContext(CopyContext);
  const { course, material } = data;
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
          {renderMaterial?.({ courseId: course.id, materialId: material.id, section: route.query.section, page }) ?? <LearningText>{copy.rendererPending}</LearningText>}
        </>
      )}
    </>
  );
}

function CourseEntry(props: StudentScreenProps & { query: LearningQuery }) {
  const { route, query, request, navigate, replace, back, initialScrollY, onScrollY, renderMaterial, openExternal, devicePreferences, session } = props;
  const systemTheme = useColorScheme() === "dark" ? "dark" : "light";
  const preference = devicePreferences?.theme;
  const theme = preference && preference !== "system" ? preference : systemTheme;
  const colors = nativeColors[theme];
  const copy = courseCopy(session.locale);
  const { resource, reload: loadAgain } = useLearningData(request, learningEndpoint(query), query.view);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const restoreOffset = useRef(initialScrollY);
  const lastOffset = useRef(initialScrollY);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const isReady = resource.kind === "ready";
  const reload = () => {
    restoreOffset.current = lastOffset.current;
    contentHeight.current = 0;
    loadAgain();
  };

  function restorePosition() {
    if (!isReady || restoreOffset.current <= 0 || viewportHeight.current <= 0 || contentHeight.current <= 0) return;
    const targetY = Math.min(restoreOffset.current, Math.max(0, contentHeight.current - viewportHeight.current));
    restoreOffset.current = 0;
    scroll.current?.scrollTo({ x: 0, y: targetY, animated: false });
  }

  let content: ReactNode;
  if (resource.kind === "loading") {
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
      case "dashboard": content = <Dashboard data={resource.data} navigate={navigate} request={request} reload={reload} />; break;
      case "catalog": content = <Catalog data={resource.data} navigate={navigate} route={route} replace={replace} openExternal={openExternal} locale={session.locale === "en" ? "en-GB" : "id-ID"} />; break;
      case "course": content = <CourseOverview data={resource.data} navigate={navigate} request={request} reload={reload} />; break;
      case "material-list": content = <Documents data={resource.data} route={route} replace={replace} navigate={navigate} request={request} reload={reload} />; break;
      case "material-detail": content = <Document data={resource.data} request={request} reload={reload} renderMaterial={renderMaterial} route={route} />; break;
    }
  }

  return (
    <ThemeContext.Provider value={theme}>
      <CopyContext.Provider value={copy}>
        <ScrollView
          ref={scroll}
          testID={query.view === "catalog" ? "student-courses-list" : query.view === "material-list" ? "student-materials-list" : `student-learning-${query.view}`}
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={resource.kind === "loading" && lastOffset.current > 0} onRefresh={reload} tintColor={colors.primary} colors={[colors.primary]} />}
          scrollEventThrottle={16}
          onLayout={(event) => {
            viewportHeight.current = event.nativeEvent.layout.height;
            restorePosition();
          }}
          onScroll={(event) => {
            if (restoreOffset.current <= 0 && isReady) {
              lastOffset.current = Math.max(0, event.nativeEvent.contentOffset.y);
              onScrollY(lastOffset.current);
            }
          }}
        >
          {query.view === "course" || query.view === "material-list" || query.view === "material-detail" ? (
            <Button theme={theme} variant="ghost" testID="student-learning-back" style={styles.back} onPress={back}>{copy.back}</Button>
          ) : null}
          {isReady ? (
            <View
              style={styles.readyContent}
              onLayout={(event) => {
                const { y, height } = event.nativeEvent.layout;
                contentHeight.current = y + height + styles.content.paddingBottom;
                restorePosition();
              }}
            >
              {content}
            </View>
          ) : content}
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
