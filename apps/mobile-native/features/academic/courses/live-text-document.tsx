import { useContext, useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  textDocumentMarkdownLimit, type TextDocumentDraft, type TextDocumentEdit,
} from "../../../../../packages/native-parity/academic/courses/text-document";
import type { CourseWriteTarget } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import { standardizeDocumentTitle } from "../../../../../lib/course-batch-upload";
import type { ReadingWidget } from "../../../../../lib/offline/reading-sections";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { useNativeSession } from "../../../auth/session-provider";
import { Button } from "../../../components/Button";
import { ExpandedImage } from "../../../components/ExpandedImage";
import { scopedFiles } from "../../../device/files";
import { ReadingContentDocument } from "../../../offline/ReadingDocument";
import type { ReadingContent } from "../../../offline/reading-document";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { AdminMarkdownPreview } from "../../shared-ui/AdminMarkdownPreview";
import { NavigationTabs } from "../../shared-ui/navigation";
import { SolutionVisualPreview } from "../../solutions/SolutionVisualPreview";
import { safeInlineCourseImage } from "../../student/course-markdown-model";
import { ReadingNavigation } from "../../student/courses/ReadingNavigation";
import { diktatReadingSections, readingNavigationItems, type ReadingSearchTarget } from "../../student/courses/reading-search";
import type { AcademicTransport } from "../client";
import { DocumentSuggestion } from "./document-suggestion";
import { TextDocumentTransport } from "./document-transport";
import { useCourseWrite } from "./live-write";
import { createTextDocumentClient } from "./text-document-client";
import { Action, CourseDialog, CourseStatus, CourseTheme, Field, Ink, Picker, layout } from "./ui";

export { TextDocumentTransport } from "./document-transport";

type Content = Awaited<ReturnType<ReturnType<typeof createTextDocumentClient>["read"]>>;
type Load = { state: "ready"; value: Content } | { state: "unavailable" | "denied" };

export function LiveTextCourseDocument({ slug, courseId, documentId, initialEdit, refresh }: {
  slug: string; courseId: string; documentId: string; initialEdit?: boolean; refresh(): void;
}) {
  const transport = useContext(TextDocumentTransport);
  if (!transport) return <CourseStatus label="Dokumen tidak dapat dimuat." error />;
  return <TextPreviewRoute transport={transport} slug={slug} courseId={courseId} id={documentId} initialEdit={initialEdit} refreshHost={refresh} />;
}

function TextPreviewRoute({ transport, slug, courseId, id, initialEdit, refreshHost }: {
  transport: AcademicTransport; slug: string; courseId: string; id: string; initialEdit?: boolean; refreshHost(): void;
}) {
  const client = useMemo(() => createTextDocumentClient(transport), [transport]);
  const target = useMemo(() => client.edit(slug, id), [client, slug, id]);
  const [pendingRead, setPendingRead] = useState(0);
  const [loaded, setLoaded] = useState<{ client: typeof client; key: string; result: Load }>();
  const [dialog, setDialog] = useState<"content" | "status" | null>(initialEdit ? "content" : null);
  const { height } = useWindowDimensions();
  const scopeKey = JSON.stringify([slug, courseId, id, pendingRead]);
  const result = loaded?.client === client && loaded.key === scopeKey ? loaded.result : undefined;
  const reload = () => setPendingRead(attempt => attempt + 1);
  useEffect(() => {
    const controller = new AbortController();
    const settle = (result: Load) => {
      if (!controller.signal.aborted) setLoaded({ client, key: scopeKey, result });
    };
    client.read(slug, courseId, id, controller.signal)
      .then(value => settle({ state: "ready", value }))
      .catch(error => settle({ state: error instanceof Error && error.message === "DENIED" ? "denied" : "unavailable" }));
    return () => controller.abort();
  }, [client, scopeKey, slug, courseId, id]);
  if (!result) return <CourseStatus label="Memuat dokumen…" />;
  if (result.state === "denied") return <CourseStatus label="Akses ditolak." error />;
  if (result.state !== "ready") return <CourseStatus label="Dokumen gagal dimuat." retry={reload} error />;
  const { edit, kind, data } = result.value;
  const pending = target?.pending();
  const activeDialog = pending?.draft.action ?? dialog;
  const locale = /^en(?:-|$)/i.test(transport.locale) ? "en" : "id";
  return <>
    {edit && target ? <View style={layout.row}>
      {pending ? <Action label="Periksa perubahan" onPress={() => setDialog(pending.draft.action)} /> : <>
        <Action label="Edit dokumen" onPress={() => setDialog("content")} testID="admin-text-document-edit" />
        <Action label={edit.status === "published" ? "Jadikan draf" : "Terbitkan"}
          onPress={() => setDialog("status")} testID="admin-text-document-status" />
      </>}
    </View> : null}
    <AdminTextPreview kind={kind} data={data} locale={locale} origin={transport.origin} accountId={transport.accountId}
      viewportHeight={Math.max(340, height - 240)} />
    {edit && target && dialog && activeDialog ? <TextDocumentForm key={activeDialog} slug={slug} documentId={id} initial={edit} operation={activeDialog} target={target} locale={locale}
      origin={transport.origin} accountId={transport.accountId}
      close={() => setDialog(null)} refresh={() => { setDialog(null); refreshHost(); }} /> : null}
  </>;
}

function AdminTextPreview({ kind, data, locale, origin, accountId, viewportHeight }: {
  kind: Content["kind"]; data: Content["data"]; locale: "id" | "en"; origin: string; accountId: string; viewportHeight: number;
}) {
  const theme = useContext(CourseTheme);
  const colors = nativeColors[theme];
  const { canInteract, suspended } = useProtectedInteraction();
  const en = locale === "en";
  const baseContent = useMemo<ReadingContent>(() => ({
    kind, data, locale, title: data.title, resolveImage: safeInlineCourseImage,
  }), [kind, data, locale]);
  const structuredSections = useMemo(() => kind === "article" && "sections" in data ? data.sections : [], [kind, data]);
  const diktatSections = useMemo(() => diktatReadingSections(baseContent), [baseContent]);
  const navigation = useMemo(() => readingNavigationItems(baseContent), [baseContent]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>();
  const [diktatSectionIndex, setDiktatSectionIndex] = useState(0);
  const [searchTarget, setSearchTarget] = useState<ReadingSearchTarget>();
  const [searchNotice, setSearchNotice] = useState<string>();
  const [readerVisit, setReaderVisit] = useState(0);
  const [widget, setWidget] = useState<ReadingWidget>();

  const activeSection = structuredSections.length > 1
    ? structuredSections.find(section => section.id === selectedSectionId) ?? structuredSections[0]
    : undefined;
  const activeDiktat = diktatSections.length > 1 ? diktatSections[Math.min(diktatSectionIndex, diktatSections.length - 1)] : undefined;
  const pageCount = structuredSections.length > 1 ? structuredSections.length : diktatSections.length > 1 ? diktatSections.length : 1;
  const page = activeSection ? structuredSections.indexOf(activeSection) : activeDiktat ? Math.min(diktatSectionIndex, diktatSections.length - 1) : 0;

  const selectedContent = useMemo<ReadingContent>(() => {
    if (activeDiktat && !("sections" in data)) {
      return { ...baseContent, data: { ...data, body: "# " + activeDiktat.title + "\n\n" + activeDiktat.content } };
    }
    return activeSection ? { ...baseContent, section: activeSection.slug } : baseContent;
  }, [activeDiktat, activeSection, baseContent, data]);

  function move(to: number) {
    if (to < 0 || to >= pageCount || !canInteract()) return;
    setSearchTarget(undefined);
    setSearchNotice(undefined);
    if (activeSection) setSelectedSectionId(structuredSections[to]?.id);
    else setDiktatSectionIndex(to);
  }

  return <>
    {(pageCount > 1 || navigation.length > 0) && <View style={layout.row}>
      {navigation.length > 0 && <ReadingNavigation items={navigation} locale={locale} theme={theme} onOpen={(item, query) => {
        if (!canInteract()) return;
        setSearchTarget(item.target);
        setSearchNotice(query.length >= 2 ? query : undefined);
        setReaderVisit(value => value + 1);
        if (structuredSections.length > 1) setSelectedSectionId(item.id);
        else if (diktatSections.length > 1) {
          const idx = Number(item.slug);
          if (Number.isSafeInteger(idx) && diktatSections[idx]) setDiktatSectionIndex(idx);
        }
      }} />}
      {pageCount > 1 && <>
        <Action label={en ? "Previous section" : "Bagian sebelumnya"} disabled={page <= 0} onPress={() => move(page - 1)} />
        <Ink kind="meta" tone="muted">{`${page + 1} / ${pageCount}`}</Ink>
        <Action label={en ? "Next section" : "Bagian berikutnya"} disabled={page >= pageCount - 1} onPress={() => move(page + 1)} />
      </>}
    </View>}
    {searchNotice ? <Ink kind="meta">{`${en ? "Result for " : "Hasil untuk "}${searchNotice}`}</Ink> : null}
    <View style={{ height: viewportHeight }}>
      <ReadingContentDocument key={JSON.stringify([activeSection?.id ?? diktatSectionIndex, data.id, readerVisit])}
        testID="admin-text-document-preview" content={selectedContent} focus={searchTarget}
        onWidgetAction={spec => { if (canInteract()) setWidget(spec); }} />
    </View>
    {!suspended && widget?.kind === "source_figure" && widget.asset ? <AdminFigureModal url={widget.asset.imageUrl}
      label={widget.label} locale={locale} origin={origin} accountId={accountId} theme={theme} close={() => setWidget(undefined)} /> : null}
    {!suspended && widget && widget.kind !== "source_figure" ? <Modal visible onRequestClose={() => setWidget(undefined)} animationType="none">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Button theme={theme} variant="ghost" testID="admin-close-article-visual" onPress={() => setWidget(undefined)}>
          {en ? "Back to document" : "Kembali ke dokumen"}
        </Button>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <SolutionVisualPreview value={widget} origin={origin} locale={locale} theme={theme} />
        </ScrollView>
      </SafeAreaView>
    </Modal> : null}
  </>;
}

function AdminFigureModal({ url, label, locale, origin, accountId, theme, close }: {
  url: string; label: string; locale: "id" | "en"; origin: string; accountId: string; theme: keyof typeof nativeColors; close(): void;
}) {
  const { transport } = useNativeSession();
  const { canInteract } = useProtectedInteraction();
  const session = transport?.scope.accountId === accountId && transport.scope.origin === origin ? transport : null;
  const inline = safeInlineCourseImage(url);
  const [staged, setStaged] = useState<{ uri?: string; failed?: boolean }>(() => inline ? { uri: inline } : {});
  const en = locale === "en";
  useEffect(() => {
    if (inline) { setStaged({ uri: inline }); return; }
    if (!session || !canInteract()) { setStaged({ failed: true }); return; }
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const isCurrent = () => !controller.signal.aborted && canInteract();
    scopedFiles.prepareAdminMarkdownImage(session, url, "course", controller.signal, isCurrent).then(image => {
      if (!isCurrent()) { image.release(); return; }
      release = image.release;
      setStaged({ uri: image.uri });
    }).catch(() => {
      if (isCurrent()) setStaged({ failed: true });
    });
    return () => {
      controller.abort();
      release?.();
    };
  }, [canInteract, inline, session, url]);
  if (staged.uri) return <ExpandedImage uri={staged.uri} label={label} locale={locale} theme={theme} close={close} />;
  return <CourseDialog title={label} onClose={close}>
    <CourseStatus label={staged.failed ? (en ? "The image could not be loaded." : "Gambar belum dapat dimuat.") : (en ? "Loading image…" : "Memuat gambar…")} error={staged.failed} />
  </CourseDialog>;
}

function TextDocumentForm({ slug, documentId, initial, operation, target, locale, origin, accountId, close, refresh }: {
  slug: string; documentId: string; initial: TextDocumentEdit; operation: "content" | "status"; target: CourseWriteTarget<TextDocumentDraft>;
  locale: "id" | "en"; origin: string; accountId: string; close(): void; refresh(): void;
}) {
  const theme = useContext(CourseTheme);
  const { transport } = useNativeSession();
  const session = transport?.scope.accountId === accountId && transport.scope.origin === origin ? transport : null;
  const [preview, setPreview] = useState(false);
  const en = locale === "en";
  const prior = target.pending()?.draft;
  const content = prior?.action === "content" ? prior : initial;
  const [title, setTitle] = useState(content.title);
  const [markdown, setMarkdown] = useState(content.markdown);
  const [chapterId, setChapter] = useState(content.chapterId);
  const [revision] = useState(prior?.expectedRevision ?? initial.revision);
  const status = prior?.action === "status" ? prior.status : initial.status === "published" ? "draft" : "published";
  const command = useCourseWrite(target, refresh);
  const requireChapter = initial.source === "legacy-article";
  const options = [...(!requireChapter ? [{ id: "", label: "Tanpa bab" }] : []),
    ...initial.chapters.map(chapter => ({ id: chapter.id, label: chapter.title })),
    ...(chapterId && !initial.chapters.some(chapter => chapter.id === chapterId) ? [{ id: chapterId, label: "Bab saat ini" }] : [])];
  const action = operation === "content" ? "Simpan" : status === "published" ? "Terbitkan" : "Jadikan draf";
  function submit() {
    const common = { source: initial.source, expectedRevision: revision };
    if (operation === "status") {
      command.submit({ ...common, action: "status", status });
      return;
    }
    const cleaned = standardizeDocumentTitle(title);
    if (!cleaned || (requireChapter && !chapterId)) {
      command.setStatus("invalid");
      return;
    }
    command.submit({ ...common, action: "content", title: cleaned, markdown, chapterId });
  }
  return <CourseDialog title={operation === "content" ? "Edit dokumen" : action} onClose={close} dismissDisabled={command.busy}
    testID="admin-text-document-edit-dialog">
    {operation === "content" ? <>
      <Field label="Judul" value={title} onChangeText={setTitle} maxLength={500} disabled={!command.editable} />
      <DocumentSuggestion slug={slug} id={documentId} source={initial.source} values={{ title, category: "materi", subcategory: "ebook", year: null }}
        disabled={!command.editable} onSuggested={value => {
          setTitle(value.title);
          const chapter = value.chapterIds[0];
          if (chapter && initial.chapters.some(option => option.id === chapter)) setChapter(chapter);
        }} />
      <Picker label="Bab" options={options} selected={chapterId ?? ""} onSelect={id => setChapter(id || null)} disabled={!command.editable} />
      <NavigationTabs tabs={[{ id: "write", label: en ? "Write" : "Tulis" }, { id: "preview", label: en ? "Preview" : "Pratinjau" }]}
        activeId={preview ? "preview" : "write"} onTabPress={tab => setPreview(tab === "preview")}
        accessibilityLabel={en ? "Document content" : "Konten dokumen"} moreLabel={en ? "More" : "Lebih"}
        closeLabel={en ? "Close" : "Tutup"} variant="inline" theme={theme} />
      {preview ? (markdown.trim() ? <AdminMarkdownPreview key={documentId} source={markdown} audience="course"
        session={session} origin={origin} theme={theme} locale={locale} />
        : <Ink>{en ? "The document is empty." : "Konten masih kosong."}</Ink>) :
        <Field label="Konten Markdown" multiline value={markdown} onChangeText={setMarkdown}
          maxLength={textDocumentMarkdownLimit} disabled={!command.editable} testID="admin-text-document-markdown" />}
    </> : <Ink>{status === "published" ? `Terbitkan “${initial.title}” untuk peserta?`
      : `Jadikan “${initial.title}” draf agar tidak lagi tampil untuk peserta?`}</Ink>}
    {command.status === "invalid" ? <CourseStatus label="Periksa judul, bab, dan konten dokumen." error /> : null}
    {command.status === "denied" ? <CourseStatus label="Akses ditolak." error /> : null}
    {command.status === "retry" ? <CourseStatus label="Hasil perubahan belum diketahui." retry={command.retry} error /> : null}
    {command.stale ? <CourseStatus label="Dokumen berubah atau tidak tersedia." retry={refresh} error /> : null}
    {command.busy ? <CourseStatus label="Menyimpan…" /> : null}
    <View style={layout.row}>
      <Action label={action} onPress={submit} disabled={!command.editable} variation="default" />
      <Action label="Batal" onPress={close} disabled={command.busy} variation="ghost" />
    </View>
  </CourseDialog>;
}
