import { useHasStudentCourseNavbar, useStudentChromeVisibility } from "../../../routing/student-course-chrome-context";
import { createContext, useContext, useEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from "react";
import { Dimensions, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme, type TextStyle } from "react-native";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import {
  canShowOfflineCourse, coursePath, coursesEndpoint, learningEndpoint, materialPath, materialTabs, normalizeMaterialTab,
  type CourseCard, type CourseData, type DashboardData, type EnrollmentFailureCode, type EnrollmentResponse,
  type LearningData, type LearningQuery, type MaterialDetailData, type MaterialListData,
} from "../../../../../packages/native-parity/student/courses/contract";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { Skeleton } from "../../../components/Skeleton";
import { nativeTypography } from "../../../typography";
import type { StudentScreenProps } from "../contracts";
import { StudentListRow } from "../ListRow";
import { matchStudentRoute, studentMaterialReaderTarget, studentPathWithQuery } from "../routes";
import { canonicalStudentArticleHref, offlineMaterialRecovery, type OfflineCourseMetadata, type OfflineCourseTarget } from "../offline-courses";
import { DashboardBottom, DashboardTop, useDashboardExtras } from "./dashboard-extra";
import { ActiveDashboardCourses, DashboardPreviewCourses, dashboardMessages } from "./dashboard-overview";
import { Catalog } from "./catalog";
import { courseCopy, type CourseCopy } from "./copy";
import { MaterialPdf } from "./MaterialPdf";
import { OnlineReading } from "./OnlineReading";
import { CourseContent, DocumentContent, type DocumentDisclosures } from "./course-content";
import learningEn from "../../../../../messages/en/learning.json";
import learningId from "../../../../../messages/id/learning.json";
import { courseScrollOffsetForMount } from "./scroll-offset";

type Theme = keyof typeof nativeColors;
type Reader = StudentScreenProps["renderMaterial"];
type Navigate = StudentScreenProps["navigate"];
type ListQueryState = { [key: string]: string | undefined };

function updateListQuery(route: StudentScreenProps["route"], replace: Navigate, updates: ListQueryState) {
  replace(studentPathWithQuery(route.path, updates));
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

function Notice({ title, detail, testID, children, activation }: { title: string; detail?: string; testID?: string; children?: ReactNode; activation?: "card" | "stripe" }) {
  const colors = nativeColors[useContext(ThemeContext)];
  return (
    <View testID={testID} style={[styles.notice, { borderStartColor: colors.accent },
      activation === "card" && [styles.activationCard, { borderColor: `${colors.secondary}55`, backgroundColor: `${colors.secondary}0a` }]]}>
      <View accessibilityLiveRegion="polite" style={styles.rowText}>
        <LearningText role="heading" style={activation ? { color: colors.secondary } : undefined}>{title}</LearningText>
        {detail ? <LearningText style={activation ? { color: colors.mutedForeground } : undefined}>{detail}</LearningText> : null}
      </View>
      {children}
    </View>
  );
}

function Enrollment({ request, reload, title, detail, inputRef, activation }: {
  request: Request; reload: () => void; title?: string; detail?: string;
  inputRef?: RefObject<ComponentRef<typeof Input> | null>; activation?: "card" | "stripe";
}) {
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
    <Notice title={title ?? copy.activation} detail={detail ?? copy.activationHint} activation={activation}>
      <Input
        theme={theme}
        ref={inputRef}
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

function getOffer(course: Pick<CourseCard, "pricing">, locale: string, copy: CourseCopy): string | undefined {
  const pricing = course.pricing;
  if (!pricing || pricing.category !== "limited_time_free" || !pricing.startsAt || !pricing.endsAt) return undefined;
  const start = new Date(pricing.startsAt);
  const end = new Date(pricing.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) return undefined;
  const current = new Date();
  const label = current < start ? copy.offerUpcoming : current >= end ? copy.offerEnded : copy.offerActive;
  const format = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
  return `${label} · ${format.format(start)} - ${format.format(end)} WIB`;
}

function CourseRows({ courses, navigate }: { courses: CourseCard[]; navigate: Navigate }) {
  const copy = useContext(CopyContext);
  return courses.map((course) => {
    const counts = [
      [course.materialsCount, copy.materials],
      [course.quizzesCount, copy.quiz],
      [course.tryoutsCount, copy.tryout],
    ].flatMap(([count, label]) => typeof count === "number" && count > 0 ? [`${count} ${String(label).toLocaleLowerCase()}`] : []);
    const meta = [course.description, ...counts, course.hasFullContentAccess ? "" : copy.limitedAccess].filter(Boolean).join(" · ");
    return (
      <Row key={course.id} title={course.title} meta={meta} testID={`student-course-${course.id}`} onPress={() => navigate(coursePath(course.id))} />
    );
  });
}

function Dashboard({ data, navigate, request, reload, locale, openExternal }: { data: DashboardData; locale: string } & Pick<StudentScreenProps, "navigate" | "request" | "openExternal"> & { reload: () => void }) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  const extra = useDashboardExtras(request, data.enrolled.length > 0);
  const [showActivation, setShowActivation] = useState(false);
  const messages = dashboardMessages(locale);
  if (data.preview && !data.enrolled.length) {
    return <>
      <DashboardPreviewCourses preview={data.preview} navigate={navigate} openExternal={openExternal} theme={theme} locale={locale}
        offerLabel={course => getOffer(course, locale, copy)} />
      <Enrollment request={request} reload={reload} title={messages.hasClassToken} />
      <Button theme={theme} variant="outline" size="lg" onPress={() => navigate("/courses")}>{copy.browse}</Button>
    </>;
  }
  return (
    <>
      {data.firstName && !data.completedMaterialsByCourse ? <LearningText role="title">{`${copy.greeting}, ${data.firstName}`}</LearningText> : null}
      <DashboardTop data={extra.data} request={request} navigate={navigate} copy={copy} theme={theme} locale={locale} />
      {data.completedMaterialsByCourse && data.enrolled.length > 0 ? <>
        <ActiveDashboardCourses courses={data.enrolled} completed={data.completedMaterialsByCourse}
          activate={() => setShowActivation(previous => !previous)} activationOpen={showActivation} navigate={navigate} locale={locale} theme={theme} />
        {showActivation && <Enrollment request={request} reload={reload} title={messages.activateClassTitle} />}
      </> : null}
      {data.continueReading.length > 0 && (
        <Section title={data.completedMaterialsByCourse ? messages.openMaterials : copy.continue}>
          {data.continueReading.map((item) => (
            <Row key={`${item.courseId}/${item.materialId}`} title={item.title} meta={`${item.courseTitle} · ${item.completionPercent}%`} onPress={() => navigate(materialPath(item.courseId, item.materialId, item.section))} />
          ))}
        </Section>
      )}
      {data.enrolled.length > 0 ? (
        !data.completedMaterialsByCourse && <Section title={copy.enrolled}><CourseRows courses={data.enrolled} navigate={navigate} /></Section>
      ) : (
        <>
          <LearningText role="heading">{copy.noEnrollment}</LearningText>
          <Enrollment request={request} reload={reload} />
        </>
      )}
      <DashboardBottom state={extra} navigate={navigate} copy={copy} theme={theme} locale={locale} />
      {data.recommended.length > 0 ? <Section title={data.completedMaterialsByCourse ? messages.recommendedCourses : copy.recommended}><CourseRows courses={data.recommended} navigate={navigate} /></Section> : null}
      {!data.completedMaterialsByCourse && <Button theme={theme} variant="outline" size="lg" onPress={() => navigate("/courses")}>{copy.browse}</Button>}
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

function activationContent(locale: string, hasFreeChapter: boolean, copy: CourseCopy) {
  const { quizPage, courseOverview } = locale.startsWith("en") ? learningEn : learningId;
  return { title: quizPage.activationTitle, detail: hasFreeChapter ? courseOverview.activationDescription : copy.activationHint };
}

function CourseOverview({ data, navigate, request, reload, locale }: { data: CourseData; locale: string } & Pick<StudentScreenProps, "navigate" | "request"> & { reload: () => void }) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  const hasNavbar = useHasStudentCourseNavbar();
  const { course, chapters } = data;
  const pricing = course.pricing ? getOffer(course, locale, copy) ?? (course.pricing.category === "free" ? copy.free : copy.premium) : undefined;
  return <>
    {!hasNavbar ? <>
      <LearningText role="title">{course.title}</LearningText>
      <Button theme={theme} size="lg" testID="student-course-open-materials" onPress={() => navigate(materialPath(course.id))}>{copy.openDocuments}</Button>
    </> : null}
    <CourseContent data={data} navigate={navigate} theme={theme} copy={copy} locale={locale} pricing={pricing}
      activation={!course.hasFullContentAccess ? <Enrollment request={request} reload={reload} activation="card"
        {...activationContent(locale, course.hasFreeChapter ?? (chapters.length > 0), copy)} /> : undefined} />
  </>;
}

function Documents({ data, route, replace, navigate, request, reload, openOfflineLibrary, locale, disclosures, openExternal }: {
  data: MaterialListData; locale: string; disclosures: DocumentDisclosures; reload: () => void;
} & Pick<StudentScreenProps, "navigate" | "request" | "route" | "replace" | "openOfflineLibrary" | "openExternal">) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  const hasNavbar = useHasStudentCourseNavbar();
  const tokenInput = useRef<ComponentRef<typeof Input>>(null);
  const { course, materials } = data;
  return <>
    {!hasNavbar ? <LearningText role="title">{course.title}</LearningText> : null}
    <DocumentContent data={data} tab={normalizeMaterialTab(route.query.tab)} disclosures={disclosures}
      onTab={key => updateListQuery(route, replace, { tab: key === "all" ? undefined : key })}
      activation={!course.hasFullContentAccess ? <Enrollment request={request} reload={reload} inputRef={tokenInput} activation="stripe"
        {...activationContent(locale, course.hasFreeChapter ?? materials.some(row => !row.locked), copy)} /> : undefined}
      recover={() => openExternal ? openExternal("/plans") : tokenInput.current?.focus()}
      saved={openOfflineLibrary ? <Button theme={theme} variant="outline"
        onPress={() => openOfflineLibrary({ courseId: course.id })}>{copy.savedCourses}</Button> : undefined}
      theme={theme} copy={copy} locale={locale} navigate={navigate} request={request} />
  </>;
}

type PdfNotice = "diktatPdfDenied" | "diktatPdfMissing" | "diktatPdfTooLarge" | "diktatPdfUnavailable" | "diktatPdfFailed";

function PdfDownload({ save, reload, testID }: {
  save(signal: AbortSignal): ReturnType<NonNullable<StudentScreenProps["saveDiktatPdf"]>>; reload(): void; testID: string;
}) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  const active = useRef<AbortController | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<PdfNotice>();
  useEffect(() => () => active.current?.abort(), []);

  async function download() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setNotice(undefined);
    try {
      const result = await save(controller.signal);
      if (controller.signal.aborted || result.status === "finished" || result.status === "cancelled" || result.status === "stale") return;
      const issue = result.status === "error" ? result.issue : undefined;
      setNotice(issue === "unauthorized" ? "diktatPdfDenied" : issue === "not-found" ? "diktatPdfMissing"
        : issue === "size" ? "diktatPdfTooLarge" : result.status === "unavailable" ? "diktatPdfUnavailable" : "diktatPdfFailed");
    } catch {
      if (!controller.signal.aborted) setNotice("diktatPdfFailed");
    } finally {
      active.current = undefined;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const shouldReload = notice === "diktatPdfDenied" || notice === "diktatPdfMissing";
  return <>
    {notice && <Text accessibilityRole="alert" style={[styles.meta, { color: nativeColors[theme].destructive }]}>{copy[notice]}</Text>}
    <Button theme={theme} variant="outline" testID={testID} isLoading={busy}
      disabled={notice === "diktatPdfTooLarge" || notice === "diktatPdfUnavailable"}
      onPress={shouldReload ? reload : () => void download()}>
      {shouldReload ? copy.retry : copy.saveDiktatPdf}
    </Button>
  </>;
}

function MaterialShareLink({ target, title, share, locale }: {
  target: Parameters<NonNullable<StudentScreenProps["shareMaterialLink"]>>[0];
  title: string; share: NonNullable<StudentScreenProps["shareMaterialLink"]>; locale: string;
}) {
  const theme = useContext(ThemeContext);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const en = locale === "en";
  async function open() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await share(target, title);
      setFailed(result.status !== "finished" && result.status !== "cancelled");
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <>
    <Button theme={theme} variant="outline" testID="student-share-material-link" isLoading={busy} onPress={() => void open()}>
      {en ? "Share link" : "Bagikan tautan"}
    </Button>
    {failed && <Text accessibilityRole="alert" style={[styles.meta, { color: nativeColors[theme].destructive }]}>
      {en ? "Could not share the link." : "Tautan belum dapat dibagikan."}
    </Text>}
  </>;
}

function Document({
  data, request, reload, renderMaterial, route, replace, openOfflineLibrary, openExternal, saveDiktatPdf, saveCourseMaterialPdf,
  shareMaterialLink, pdfReader, locale, session,
}: {
  data: MaterialDetailData; request: Request; reload: () => void; renderMaterial?: Reader; locale: string;
} & Pick<StudentScreenProps, "route" | "replace" | "openOfflineLibrary" | "openExternal" | "saveDiktatPdf" |
  "saveCourseMaterialPdf" | "shareMaterialLink" | "pdfReader" | "session">) {
  const copy = useContext(CopyContext);
  const theme = useContext(ThemeContext);
  const { course, material } = data;
  useStudentChromeVisibility({ hideTop: !material.locked, hideBottom: !material.locked });
  const canonicalHref = canonicalStudentArticleHref(route, data);
  useEffect(() => { if (canonicalHref) replace(canonicalHref); }, [canonicalHref, replace]);
  const target = studentMaterialReaderTarget(route, data);
  const downloadableDiktat = material.group === "diktat" && material.canDownloadPdf === true;
  const downloadablePdf = material.group === "pdf" && material.nativePdf && material.canDownloadPdf === true;
  const save = downloadableDiktat && saveDiktatPdf ? (signal: AbortSignal) => saveDiktatPdf(course.id, material.id, signal)
    : downloadablePdf && saveCourseMaterialPdf ? (signal: AbortSignal) => saveCourseMaterialPdf(course.id, material.id, material.title, signal) : null;
  const webPath = target?.kind === "pdf" ? target.webPath
    : target ? materialPath(route.params.id, material.id, target.section) : undefined;
  const openWeb = webPath && openExternal ? () => openExternal(webPath) : undefined;
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
          {shareMaterialLink && target && !canonicalHref ?
            <MaterialShareLink key={webPath} target={target} title={material.title} share={shareMaterialLink} locale={locale} /> : null}
          {save ? <PdfDownload key={JSON.stringify([course.id, material.id])} save={save} reload={reload}
            testID={downloadableDiktat ? "student-save-diktat-pdf" : "student-save-material-pdf"} /> : null}
          {(target && renderMaterial?.(target)) ?? (target?.kind === "pdf" && material.nativePdf && pdfReader
            ? <MaterialPdf key={JSON.stringify([course.id, material.id, target.page, locale])} reader={pdfReader}
                courseId={course.id} materialId={material.id} title={material.title} page={target.page} theme={theme}
                locale={locale} openWeb={openWeb} openExternal={openExternal} />
            : target && material.nativeReading && !canonicalHref
            ? <OnlineReading key={JSON.stringify([course.id, material.id, target.section, locale])}
                request={request} session={session} reloadDetail={reload} kind={material.nativeReading} courseId={course.id} materialId={material.id}
                title={material.title} section={target.section} theme={theme} locale={locale === "en" ? "en" : "id"} openWeb={openWeb} />
            : openWeb ? <Button theme={theme} variant="outline" testID="student-open-pdf-on-web" onPress={openWeb}>
                {target?.kind === "pdf" ? copy.openPdfOnWeb : downloadableDiktat ? copy.openDiktatOnWeb : copy.openDocumentOnWeb}
              </Button> : <LearningText>{copy.rendererPending}</LearningText>)}
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

function CourseEntry(props: StudentScreenProps & { query: LearningQuery; documentDisclosures?: DocumentDisclosures }) {
  const hasNavbar = useHasStudentCourseNavbar();
  const fallbackDisclosures = useRef<DocumentDisclosures>({});
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
  const androidDensity = Platform.OS === "android" ? Dimensions.get("screen").scale : undefined;
  const restoreOffset = useRef({ x: 0, y: courseScrollOffsetForMount(initialScrollY, androidDensity) });
  const lastOffset = useRef(initialScrollY);
  const isReady = !revoked && (resource.kind === "ready" || Boolean(useOfflineMetadata));
  const flushTabs = hasNavbar && resource.kind === "ready" && resource.data.view === "material-list" && resource.data.course.hasFullContentAccess;
  const reload = () => {
    restoreOffset.current = { x: 0, y: courseScrollOffsetForMount(lastOffset.current, androidDensity) };
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
      case "dashboard": content = <Dashboard data={resource.data} navigate={navigate} request={request} reload={reload} locale={locale} openExternal={openExternal} />; break;
      case "dashboard-extras": content = null; break;
      case "catalog": content = <Catalog data={resource.data} navigate={navigate} query={route.query} openExternal={openExternal} locale={locale} theme={theme}
        onClearSearch={() => updateListQuery(route, replace, { q: undefined })}
        onSelectGroup={id => updateListQuery(route, replace, { jurusan: id === "all" ? undefined : id, category: undefined })} />; break;
      case "course": content = <CourseOverview data={resource.data} navigate={navigate} request={request} reload={reload} locale={locale} />; break;
      case "material-list": content = <Documents data={resource.data} route={route} replace={replace} navigate={navigate} request={request} reload={reload} openOfflineLibrary={props.openOfflineLibrary} locale={locale} disclosures={props.documentDisclosures ?? fallbackDisclosures.current} openExternal={openExternal} />; break;
      case "material-detail": content = <Document data={resource.data} request={request} session={props.session} locale={locale} reload={reload} renderMaterial={renderMaterial} pdfReader={props.pdfReader} route={route} replace={replace} openOfflineLibrary={props.openOfflineLibrary} openExternal={openExternal} saveDiktatPdf={props.saveDiktatPdf}
        saveCourseMaterialPdf={props.saveCourseMaterialPdf} shareMaterialLink={props.shareMaterialLink} />; break;
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
          contentContainerStyle={[styles.content, isReady && (query.view === "catalog" || flushTabs) && styles.catalogContent]}
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
          {(!hasNavbar && (query.view === "course" || query.view === "material-list")) || query.view === "material-detail" ? (
            <Button theme={theme} variant="ghost" testID="student-learning-back" style={styles.back} onPress={back}>{copy.back}</Button>
          ) : null}
          {isReady ? <View style={styles.readyContent}>{content}</View> : content}
        </ScrollView>
      </CopyContext.Provider>
    </ThemeContext.Provider>
  );
}

function CourseRoute(props: StudentScreenProps & { query: LearningQuery }) {
  const scrollY = useRef(props.initialScrollY);
  const documentDisclosures = useRef<DocumentDisclosures>({});
  // Unmount the protected read while covered. Back starts a new authorization
  // check while this stack entry keeps its last reported scroll position.
  if (props.focused === false) return null;
  return <CourseEntry {...props} documentDisclosures={documentDisclosures.current} initialScrollY={scrollY.current} onScrollY={value => {
    scrollY.current = value;
    props.onScrollY(value);
  }} />;
}

export function CourseScreen(props: StudentScreenProps) {
  const query = queryForRoute(props.route);
  const { origin, userId, sessionId, locale } = props.session;
  const key = JSON.stringify([origin, userId, sessionId, locale, query]);
  if ("courseId" in query) return <CourseRoute key={key} {...props} query={query} />;
  return <CourseEntry key={key} {...props} query={query} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 36, gap: 14 },
  catalogContent: { paddingTop: 0 },
  readyContent: { gap: 14 },
  title: { fontSize: 24, lineHeight: 32 },
  heading: { fontSize: 16, lineHeight: 24 },
  body: { fontSize: 14, lineHeight: 21 },
  meta: { fontSize: 12, lineHeight: 18 },
  section: { gap: 3 },
  rowText: { flexShrink: 1, gap: 2 },
  toggles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggle: { borderWidth: 1, borderRadius: nativeRadii.md, minHeight: 44, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 5 },
  activationCard: { borderWidth: StyleSheet.hairlineWidth, borderStartWidth: StyleSheet.hairlineWidth, borderRadius: nativeRadii.lg, padding: 16, gap: 12 },
  notice: { borderStartWidth: 2, paddingStart: 12, gap: 8, paddingVertical: 3 },
  skeletonTitle: { width: "55%", height: 22, marginBottom: 10 },
  skeletonRow: { height: 40, marginBottom: 7 },
  back: { alignSelf: "flex-start" },
});
