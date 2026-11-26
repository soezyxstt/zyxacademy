import { useContext, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { allowedCategories } from "../../../../../packages/academic/course-categories";
import { parseCoursePricingInput, type CoursePricing } from "../../../../../packages/academic/course-pricing";
import { emptyCourseFixture, type CourseFixture } from "../../../../../packages/native-parity/academic/courses/fixtures";
import { adminCoursePath, filterAdminCourses, type AdminChapter, type AdminCourse, type AdminCourseOverview } from "../../../../../packages/native-parity/academic/courses/model";
import { NativeListRow, NativeResponsiveList, SharedUiSearch } from "../../shared-ui";
import type { AdminChapterEditor } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import { Button } from "../../../components/Button";
import { nativeTypography } from "../../../typography";
import { NavigationIcon } from "../../shared-ui/navigation-icons";
import { LiveChapterEditor } from "./live-chapters";
import type { AcademicActor } from "../contracts";
import { MutationStatus, useCourseMutation } from "./scope";
import { Action, CourseDialog, CourseStatus, CourseTheme, Field, Ink, Metrics, Panel, Picker, layout, useCourseColors } from "./ui";

type Navigate = (path: string) => void;
const pricingChoices = [
  { id: "premium", label: "Premium" },
  { id: "free", label: "Gratis" },
  { id: "limited_time_free", label: "Gratis sementara" },
] as const;
const courseCategoryChoices = allowedCategories.map((id) => ({ id, label: id }));
const pageSize = 12;
type CourseListEntry = AdminCourse & { pricing?: CoursePricing["category"] };

function CourseTag({ children }: { children: string }) {
  const palette = useCourseColors();
  return <Text style={[courseStyles.tag, { color: palette.foreground, backgroundColor: palette.muted }]}>{children}</Text>;
}

function CourseId({ id }: { id: string }) {
  const palette = useCourseColors();
  return <Text style={[courseStyles.id, { color: palette.mutedForeground }]}>{id}</Text>;
}

function CourseIconAction({ label, onPress, testID, glyph = "+", primary = false }: {
  label: string; onPress(): void; testID: string; glyph?: string; primary?: boolean;
}) {
  const theme = useContext(CourseTheme);
  return <Button theme={theme} accessibilityLabel={label} onPress={onPress} testID={testID} size="icon-lg" variant={primary ? "default" : "outline"}
    style={courseStyles.iconAction} renderIcon={(color) => <Text accessible={false} style={[courseStyles.actionGlyph, { color }]}>{glyph}</Text>} />;
}

function CourseCatalogRow({ course, navigate }: { course: CourseListEntry; navigate: Navigate }) {
  const palette = useCourseColors();
  const [focused, setFocused] = useState(false);
  const counts = `${course.chapterCount} bab · ${course.materialCount} dokumen · ${course.quizCount} kuis`;
  const access = pricingChoices.find(({ id }) => id === course.pricing)?.label;
  return <Pressable accessibilityRole="link" accessibilityLabel={[course.title, course.id, course.category, access, counts].filter(Boolean).join(", ")}
    testID={`course-row-${course.slug}`} onPress={() => navigate(adminCoursePath(course.slug))} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [courseStyles.catalogRow, pressed && { backgroundColor: `${palette.primary}14` },
      focused && { outlineColor: palette.accent, outlineWidth: 2, outlineOffset: -2 }]}>
    <Text style={[courseStyles.catalogTitle, { color: palette.foreground }]}>{course.title}</Text>
    <View style={courseStyles.metadata}>
      <CourseId id={course.id} />
      <CourseTag>{course.category}</CourseTag>
      {access ? <Ink kind="meta" tone="muted">{access}</Ink> : null}
    </View>
    <Ink kind="meta" tone="muted">{counts}</Ink>
  </Pressable>;
}

export function CourseList({ courses, actor, navigate, allowCreate, initialSearch, initialCategory, pending, readError, retry }: {
  courses: readonly CourseListEntry[];
  actor: AcademicActor;
  navigate: Navigate;
  allowCreate: boolean;
  initialSearch: string;
  initialCategory: string;
  pending?: boolean;
  readError?: boolean;
  retry?(): void;
}) {
  const theme = useContext(CourseTheme);
  const palette = useCourseColors();
  const [search, setSearch] = useState(initialSearch);
  const [searchOpen, setSearchOpen] = useState(false);
  const [category, setCategory] = useState(initialCategory);
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const filtered = filterAdminCourses(courses, search, category);
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const visible = filtered.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize);
  const categories = [...new Set([category, ...courses.map((course) => course.category)].filter(Boolean))].sort((first, right) => first.localeCompare(right, "id"));
  const reset = () => { setSearch(""); setCategory(""); setPage(0); };
  const filtersActive = Boolean(search || category);
  const searching = searchOpen || Boolean(search);
  const emptyTitle = filtersActive ? "Tidak ada mata kuliah yang sesuai." : "Belum ada mata kuliah.";
  return (
    <>
      <View style={courseStyles.toolbar}>
        <View style={courseStyles.filter}>
          <Picker compact label="Kategori mata kuliah" selected={category} onSelect={(value) => { setCategory(value); setPage(0); }} testID="course-category"
            options={[{ id: "", label: pending || readError ? "Semua kategori" : `Semua (${courses.length})` }, ...categories.map((id) => ({ id, label: id }))]} />
        </View>
        {filtersActive ? <Action label="Atur ulang" onPress={reset} testID="course-clear-filters" variation="ghost" /> : null}
        <View style={searching ? courseStyles.expandedSearch : undefined}>
          <SharedUiSearch label="Cari mata kuliah" clearLabel="Hapus pencarian" value={search} theme={theme}
            onValueChange={(value) => { setSearch(value); setPage(0); }} testID="course-search"
            expansion={{ expanded: searchOpen, onExpandedChange: setSearchOpen, closeLabel: "Tutup pencarian" }} />
        </View>
        {allowCreate && !searching ? <CourseIconAction label="Tambah mata kuliah" onPress={() => { setCreated(false); setCreating(true); }} testID="course-create" primary /> : null}
      </View>
      {created ? <CourseStatus label="Mata kuliah dibuat." /> : null}
      {!pending && !readError && !visible.length ? <View style={courseStyles.empty} accessibilityLiveRegion="polite">
        <NavigationIcon name="book" size={22} color={palette.mutedForeground} />
        <Ink kind="strong">{emptyTitle}</Ink>
      </View> : <View style={[courseStyles.catalog, { borderColor: palette.border }]}><NativeResponsiveList
        label="Daftar mata kuliah"
        theme={theme}
        state={pending ? { status: "loading", label: "Memuat mata kuliah" }
          : readError && retry ? {
            status: "error", title: "Data mata kuliah gagal dimuat.",
            action: { id: "retry", label: "Coba lagi" }, onAction: retry,
          } : { status: "ready", rows: visible }}
        empty={{ title: emptyTitle }}
        getRowKey={(row) => row.id}
        renderRow={(course, listLayout) => listLayout === "compact" ? <CourseCatalogRow course={course} navigate={navigate} /> : (
          <NativeListRow
            layout={listLayout}
            theme={theme}
            title={course.title}
            subtitle={`${course.id} · ${course.category}`}
            metadata={[
              { id: "chapters", label: "Bab", value: String(course.chapterCount) },
              { id: "materials", label: "Materi", value: String(course.materialCount) },
              { id: "quizzes", label: "Kuis", value: String(course.quizCount) },
            ]}
            primary={{ testID: `course-row-${course.slug}`, role: "link", onPress: () => navigate(adminCoursePath(course.slug)) }}
          />
        )}
      /></View>}
      {filtered.length > pageSize ? (
        <View style={layout.row}>
          <Action label="Sebelumnya" onPress={() => setPage(visiblePage - 1)} disabled={visiblePage === 0} />
          <Ink kind="meta" tone="muted">{visiblePage + 1} / {Math.ceil(filtered.length / pageSize)}</Ink>
          <Action label="Berikutnya" onPress={() => setPage(visiblePage + 1)} disabled={(visiblePage + 1) * pageSize >= filtered.length} />
        </View>
      ) : null}
      {creating ? (
        <CourseDialog title="Tambah mata kuliah" onClose={() => setCreating(false)}>
          <CourseFields actor={actor} onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); setCreated(true); reset(); }} />
        </CourseDialog>
      ) : null}
    </>
  );
}

function formatWib(input: string) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(input) ? input.replace(" ", "T") + ":00+07:00" : null;
}

function displayWib(value: Date | null | undefined) {
  return value ? new Date(value.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
}

function CourseFields({ actor, data, onSaved, onCancel, onReload }: {
  actor: AcademicActor;
  data?: CourseFixture;
  onSaved(): void;
  onCancel(): void;
  onReload?(): void;
}) {
  const course = data?.course;
  const [revision, setRevision] = useState(data?.revision ?? null);
  const [id, setId] = useState(course?.id ?? "");
  const [title, setTitle] = useState(course?.title ?? "");
  const [category, setCategory] = useState(course?.category ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [access, setAccess] = useState<CoursePricing["category"]>(data?.pricing.category ?? "premium");
  const [start, setStart] = useState(displayWib(data?.pricing.startsAt));
  const [end, setEnd] = useState(displayWib(data?.pricing.endsAt));
  const mutation = useCourseMutation(actor, () => {
    setRevision((value) => (value ?? 0) + 1);
    onSaved();
  });

  function reset() {
    setTitle(course?.title ?? "");
    setCategory(course?.category ?? "");
    setDescription(course?.description ?? "");
    setAccess(data?.pricing.category ?? "premium");
    setStart(displayWib(data?.pricing.startsAt));
    setEnd(displayWib(data?.pricing.endsAt));
    setRevision(data?.revision ?? null);
    mutation.clear();
  }

  function save() {
    const cleanId = id.trim().toLowerCase();
    const cleanTitle = title.trim();
    const cleanDescription = description.trim() || null;
    mutation.submit({
      slug: course?.slug ?? cleanId, operation: course ? "update" : "create", revision,
      apply(current) {
        if (!/^[a-z0-9-]+$/.test(cleanId)) return "ID hanya boleh berisi huruf kecil, angka, dan tanda hubung.";
        if (!cleanTitle) return "Nama mata kuliah wajib diisi.";
        if (!courseCategoryChoices.some((item) => item.id === category) && !(data?.canonicalOnly && category === "Umum")) {
          return "Pilih kategori mata kuliah.";
        }
        let pricing: CoursePricing;
        try {
          pricing = parseCoursePricingInput({ category: access, startsAt: formatWib(start), endsAt: formatWib(end) });
          if (access === "limited_time_free" && (start !== displayWib(pricing.startsAt) || end !== displayWib(pricing.endsAt))) {
            return "Masukkan tanggal dan waktu WIB yang valid.";
          }
        } catch {
          return "Masukkan waktu mulai dan akhir WIB yang valid. Waktu akhir harus setelah waktu mulai.";
        }
        const initial = current ?? emptyCourseFixture({ id: cleanId, slug: cleanId, title: cleanTitle,
          category, description: cleanDescription, chapterCount: 0, materialCount: 0, quizCount: 0 });
        return { ...initial, course: { ...initial.course, title: cleanTitle, category, description: cleanDescription }, pricing };
      },
    });
  }

  const change = (set: (value: string) => void) => (value: string) => { mutation.clear(); set(value); };
  const blocked = mutation.result?.status === "conflict" || mutation.result?.status === "retry";
  return (
    <View style={layout.group}>
      {course ? <Ink kind="meta" tone="muted">{course.id}</Ink> : (
        <Field label="ID mata kuliah" value={id} onChangeText={change(setId)} autoCapitalize="none" autoCorrect={false} testID="course-field-id" />
      )}
      <Field label="Nama mata kuliah" value={title} onChangeText={change(setTitle)} testID="course-field-title" />
      {data?.canonicalOnly ? <Ink>{category}</Ink> : (
        <Picker label="Kategori" selected={category} onSelect={change(setCategory)} options={courseCategoryChoices} testID="course-field-category" />
      )}
      {!data?.canonicalOnly ? <Field label="Deskripsi" multiline value={description} onChangeText={change(setDescription)} /> : null}
      <Picker label="Akses mata kuliah" selected={access} onSelect={(value) => { mutation.clear(); setAccess(value as CoursePricing["category"]); }}
        options={pricingChoices} testID="course-field-access" />
      {access === "limited_time_free" ? (
        <View style={layout.group}>
          <Ink kind="meta" tone="muted">Gunakan format YYYY-MM-DD JJ:MM dalam WIB.</Ink>
          <Field label="Mulai gratis" value={start} onChangeText={change(setStart)} placeholder="2026-12-01 08:00" />
          <Field label="Akhir gratis" value={end} onChangeText={change(setEnd)} placeholder="2026-12-07 23:59" />
        </View>
      ) : null}
      <MutationStatus mutation={mutation} reload={onReload ?? reset} success="Perubahan tersimpan." />
      <View style={layout.row}>
        <Action label="Simpan" onPress={save} variation="default" testID="course-save" disabled={blocked} />
        <Action label="Batal" onPress={onCancel} variation="ghost" />
      </View>
    </View>
  );
}

export function CourseOverview({ data, fixture, liveChapterEditor, actor, navigate }: {
  data: AdminCourseOverview;
  fixture?: CourseFixture;
  liveChapterEditor?: { save: AdminChapterEditor; refresh(): void };
  actor: AcademicActor;
  navigate: Navigate;
}) {
  const palette = useCourseColors();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminChapter | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminChapter | null>(null);
  const reorder = useCourseMutation(actor, () => undefined);
  const { course, chapters, chapterEdit } = data;
  const canEdit = fixture || (liveChapterEditor && chapterEdit);
  const createPending = liveChapterEditor?.save(course.id).pending();

  function move(chapter: AdminChapter, offset: number) {
    if (!fixture) return;
    const index = chapters.findIndex((item) => item.id === chapter.id);
    if (index + offset < 0 || index + offset >= chapters.length) return;
    const order = chapters.map((item) => item.id);
    [order[index], order[index + offset]] = [order[index + offset], order[index]];
    reorder.submit({
      slug: course.slug, operation: "update", revision: fixture.revision,
      apply: (current) => {
        if (!current) return "Mata kuliah tidak ditemukan.";
        const byId = new Map(current.chapters.map((item) => [item.id, item]));
        return { ...current, chapters: order.map((id) => byId.get(id)!) };
      },
    });
  }

  return (
    <>
      <View style={[courseStyles.metadata, courseStyles.courseIdentity]}>
        <CourseId id={course.id} />
        <Ink kind="meta" tone="muted">{course.category}</Ink>
      </View>
      <View style={[courseStyles.chapterHeader, { borderColor: palette.border }]}>
        <View style={courseStyles.metadata}>
          <NavigationIcon name="classes" color={palette.mutedForeground} size={18} />
          <Ink kind="heading">{`${chapters.length} bab`}</Ink>
        </View>
        {canEdit ? createPending
          ? <Action label="Periksa bab baru" onPress={() => setEditing("new")} testID="course-chapter-create" />
          : <CourseIconAction label="Tambah bab" onPress={() => setEditing("new")} testID="course-chapter-create" primary /> : null}
      </View>
      <View>
        <MutationStatus mutation={reorder} reload={reorder.clear} success="Urutan bab tersimpan." />
        {chapters.length === 0 ? <CourseStatus label="Belum ada bab." /> : chapters.map((chapter, index) => {
          const chapterNumber = index + 1;
          const isExpanded = expanded === chapter.id;
          const editPending = liveChapterEditor?.save(course.id, chapter.id).pending();
          const editTestId = `course-chapter-edit-${chapter.id}`;
          const summary = <>
            <View style={courseStyles.metadata}>
              <CourseTag>{`Bab ${chapterNumber}`}</CourseTag>
              <Ink kind="strong">{chapter.title}</Ink>
            </View>
            {chapter.description ? <Ink kind="meta" tone="muted">{chapter.description}</Ink> : null}
            <View style={courseStyles.metadata}>
              <CourseTag>{`${chapter.materialCount} dokumen`}</CourseTag>
              <CourseTag>{`${chapter.questionCount} soal`}</CourseTag>
            </View>
          </>;
          return (
            <View key={chapter.id} style={[courseStyles.chapterRow, { borderColor: palette.border }]}>
              <View style={courseStyles.chapterRowTop}>
                {canEdit ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: isExpanded }}
                  accessibilityLabel={`${chapterNumber}. ${chapter.title}, ${chapter.materialCount} dokumen, ${chapter.questionCount} soal${chapter.description ? `. ${chapter.description}` : ""}`}
                  onPress={() => setExpanded(isExpanded ? null : chapter.id)} testID={`course-chapter-${chapter.id}`}
                  style={({ pressed }) => [courseStyles.chapterSummary, pressed && { backgroundColor: `${palette.primary}14` }]}>
                  {summary}
                </Pressable> : <View testID={`course-chapter-${chapter.id}`} style={courseStyles.chapterSummary}>{summary}</View>}
                {canEdit ? editPending
                  ? <Action label="Periksa edit bab" onPress={() => setEditing(chapter)} testID={editTestId} />
                  : <CourseIconAction label={`Edit bab ${chapter.title}`} onPress={() => setEditing(chapter)} testID={editTestId} glyph="✎" /> : null}
              </View>
              {isExpanded && canEdit ? (
                <View style={layout.group}>
                  <View style={layout.row}>
                    <Action label="Dokumen" onPress={() => navigate(`${adminCoursePath(course.slug, "documents")}?chapter=${encodeURIComponent(chapter.id)}`)} />
                    <Action label="Bank soal" onPress={() => navigate(`${adminCoursePath(course.slug, "questions")}?chapter=${encodeURIComponent(chapter.id)}`)} />
                    {fixture ? <Action label="Hapus bab" onPress={() => setDeleting(chapter)} variation="destructive" /> : null}
                  </View>
                  {fixture && chapters.length > 1 ? (
                    <View style={layout.row}>
                      <Action label="Naikkan" onPress={() => move(chapter, -1)} disabled={index === 0} />
                      <Action label="Turunkan" onPress={() => move(chapter, 1)} disabled={index === chapters.length - 1} />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      {fixture && editing ? (
        <ChapterEditor data={fixture} chapter={editing === "new" ? undefined : editing} actor={actor} onClose={() => setEditing(null)} />
      ) : null}
      {editing && liveChapterEditor && chapterEdit ? (
        <LiveChapterEditor edit={chapterEdit} chapter={editing === "new" ? undefined : editing}
          target={liveChapterEditor.save(course.id, editing === "new" ? undefined : editing.id)}
          close={() => setEditing(null)} refresh={liveChapterEditor.refresh} />
      ) : null}
      {fixture && deleting ? (
        <DeleteRecord title={deleting.title} actor={actor} data={fixture} close={() => setDeleting(null)}
          impact="Bab akan dihapus. Periksa dokumen, soal, dan kartu yang menggunakan bab ini."
          apply={(current) => {
            if (current.documents.some((item) => item.chapterId === deleting.id) || current.questions.some((item) => item.chapterId === deleting.id) ||
              current.flashcards.some((item) => item.chapterId === deleting.id)) {
              return "Pindahkan konten yang menggunakan bab ini sebelum menghapusnya.";
            }
            return { ...current, chapters: current.chapters.filter((item) => item.id !== deleting.id) };
          }}
        />
      ) : null}
    </>
  );
}

const courseStyles = StyleSheet.create({
  toolbar: { flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", gap: 8 },
  filter: { flexGrow: 1, flexShrink: 1, alignItems: "flex-start" },
  expandedSearch: { flexBasis: "100%" },
  iconAction: { height: 44, width: 44, borderRadius: nativeRadii.lg },
  actionGlyph: { fontSize: 20, lineHeight: 24 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 30 },
  catalog: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth },
  catalogRow: { minHeight: 88, justifyContent: "center", paddingVertical: 10, gap: 4 },
  catalogTitle: { ...nativeTypography.headingSemibold, fontSize: 14, lineHeight: 20 },
  metadata: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  id: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12, lineHeight: 17, flexShrink: 1 },
  tag: { ...nativeTypography.bodyMedium, fontSize: 11, lineHeight: 15, flexShrink: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: nativeRadii.md },
  courseIdentity: { justifyContent: "flex-end", minHeight: 32 },
  chapterHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  chapterRow: { paddingVertical: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  chapterRowTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  chapterSummary: { flex: 1, minWidth: 0, minHeight: 44, gap: 5 },
});

function ChapterEditor({ data, chapter, actor, onClose }: {
  data: CourseFixture; chapter?: AdminChapter; actor: AcademicActor; onClose(): void;
}) {
  const [revision] = useState(data.revision);
  const [title, setTitle] = useState(chapter?.title ?? "");
  const [description, setDescription] = useState(chapter?.description ?? "");
  const mutation = useCourseMutation(actor, onClose);
  function save() {
    mutation.submit({
      slug: data.course.slug, operation: "update", revision,
      apply(current, id) {
        if (!current) return "Mata kuliah tidak ditemukan.";
        if (!title.trim()) return "Judul bab wajib diisi.";
        const cleanDescription = description.trim() || null;
        if (current.canonicalOnly && cleanDescription) return "Deskripsi bab belum didukung untuk mata kuliah ini.";
        const chapters = chapter ? current.chapters.map((item) => item.id === chapter.id ? {
          ...item, title: title.trim(), description: cleanDescription,
        } : item) : [...current.chapters, {
          id, title: title.trim(), description: cleanDescription, orderIndex: current.chapters.length, materialCount: 0, questionCount: 0,
        }];
        return { ...current, chapters };
      },
    });
  }
  return (
    <CourseDialog title={chapter ? "Edit bab" : "Tambah bab"} onClose={onClose} testID="course-chapter-dialog">
      <Field label="Judul bab" value={title} onChangeText={(value) => { setTitle(value); mutation.clear(); }} testID="course-chapter-title" />
      {!data.canonicalOnly ? <Field label="Deskripsi bab" value={description} multiline onChangeText={(value) => { setDescription(value); mutation.clear(); }} /> : null}
      <MutationStatus mutation={mutation} reload={onClose} />
      <View style={layout.row}>
        <Action label="Simpan bab" onPress={save} variation="default" testID="course-chapter-save" disabled={mutation.result?.status === "retry" || mutation.result?.status === "conflict"} />
        <Action label="Batal" onPress={onClose} variation="ghost" testID="course-chapter-cancel" />
      </View>
    </CourseDialog>
  );
}

export function DeleteRecord({ title, impact, actor, data, close, onSaved, apply }: {
  title: string; impact: string; actor: AcademicActor; data: CourseFixture; close(): void; onSaved?(): void;
  apply?(current: CourseFixture): CourseFixture | string;
}) {
  const [revision] = useState(data.revision);
  const mutation = useCourseMutation(actor, () => { close(); onSaved?.(); });
  return (
    <CourseDialog title={`Hapus ${title}?`} onClose={close}>
      <Ink>{impact}</Ink>
      <MutationStatus mutation={mutation} reload={close} />
      <View style={layout.row}>
        <Action label="Batal" onPress={close} />
        <Action label="Hapus" testID="course-delete-confirm" variation="destructive"
          disabled={mutation.result?.status === "retry" || mutation.result?.status === "conflict"}
          onPress={() => mutation.submit({
            slug: data.course.slug, operation: apply ? "update" : "delete", revision,
            apply: (current) => current && apply?.(current),
          })} />
      </View>
    </CourseDialog>
  );
}

export function CourseSettings({ data, actor, navigate, back }: {
  data: CourseFixture;
  actor: AcademicActor;
  navigate: Navigate;
  back(): void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const demos = useCourseMutation(actor, () => undefined);
  const checks = [
    { label: "Artikel", count: data.documents.filter((item) => item.status === "published" && item.type === "Artikel").length },
    { label: "Diktat", count: data.documents.filter((item) => item.status === "published" && item.type === "Diktat").length },
    { label: "Set kartu", count: data.flashcards.filter((item) => item.status === "published" && item.cards.length).length },
    { label: "Kuis", count: data.quizzes.filter((item) => item.status === "published").length },
  ];
  const eligible = checks.every((item) => item.count > 0);
  return (
    <>
      <Panel title="Informasi mata kuliah">
        <CourseFields key={formKey} data={data} actor={actor} onSaved={() => undefined} onCancel={back}
          onReload={() => setFormKey((key) => key + 1)} />
      </Panel>
      <Panel title="Demo publik">
        <Ink>{data.isDemo ? "Aktif untuk demo publik" : "Belum dipilih untuk demo publik"}</Ink>
        <Metrics values={checks.map(({ label, count }) => ({ label, value: count }))} />
        {!eligible && !data.isDemo ? <CourseStatus label="Terbitkan artikel, diktat, set kartu, dan kuis untuk mengaktifkan demo." /> : null}
        <MutationStatus mutation={demos} reload={demos.clear} />
        <Action label={data.isDemo ? "Nonaktifkan demo" : "Jadikan demo publik"}
          disabled={(!eligible && !data.isDemo) || demos.result?.status === "retry"}
          onPress={() => demos.submit({
            slug: data.course.slug, revision: data.revision, operation: "update",
            apply: (current) => current ? { ...current, isDemo: !current.isDemo } : "Mata kuliah tidak ditemukan.",
          })} />
      </Panel>
      <Panel title="Hapus mata kuliah">
        <Action label="Hapus mata kuliah" onPress={() => setDeleteOpen(true)} variation="destructive" />
      </Panel>
      {deleteOpen ? <DeleteRecord title={data.course.title} data={data} actor={actor} close={() => setDeleteOpen(false)}
        impact="Seluruh bab dan konten mata kuliah akan hilang dari daftar aktif."
        onSaved={() => navigate("/admin/courses")} /> : null}
    </>
  );
}
