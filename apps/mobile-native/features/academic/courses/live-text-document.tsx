import { useContext, useEffect, useMemo, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import {
  textDocumentMarkdownLimit, type TextDocumentDraft, type TextDocumentEdit,
} from "../../../../../packages/native-parity/academic/courses/text-document";
import type { CourseWriteTarget } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import { standardizeDocumentTitle } from "../../../../../lib/course-batch-upload";
import { ReadingContentDocument } from "../../../offline/ReadingDocument";
import { safeInlineCourseImage } from "../../student/course-markdown-model";
import type { AcademicTransport } from "../client";
import { DocumentSuggestion } from "./document-suggestion";
import { TextDocumentTransport } from "./document-transport";
import { useCourseWrite } from "./live-write";
import { createTextDocumentClient } from "./text-document-client";
import { Action, CourseDialog, CourseStatus, Field, Ink, Picker, layout } from "./ui";

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
    <View style={{ height: Math.max(340, height - 240) }}>
      <ReadingContentDocument testID="admin-text-document-preview" content={{ kind, data, locale, title: data.title, resolveImage: safeInlineCourseImage }} />
    </View>
    {edit && target && dialog && activeDialog ? <TextDocumentForm key={activeDialog} slug={slug} documentId={id} initial={edit} operation={activeDialog} target={target}
      close={() => setDialog(null)} refresh={() => { setDialog(null); refreshHost(); }} /> : null}
  </>;
}

function TextDocumentForm({ slug, documentId, initial, operation, target, close, refresh }: {
  slug: string; documentId: string; initial: TextDocumentEdit; operation: "content" | "status"; target: CourseWriteTarget<TextDocumentDraft>;
  close(): void; refresh(): void;
}) {
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
      <Field label="Konten Markdown" multiline value={markdown} onChangeText={setMarkdown}
        maxLength={textDocumentMarkdownLimit} disabled={!command.editable} testID="admin-text-document-markdown" />
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
