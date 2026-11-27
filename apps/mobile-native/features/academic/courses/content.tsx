import { useState } from "react";
import { View } from "react-native";
import type { CourseDocument, CourseFixture, CourseQuestion } from "../../../../../packages/native-parity/academic/courses/fixtures";
import { adminCoursePath } from "../../../../../packages/native-parity/academic/courses/model";
import type { AcademicActor } from "../contracts";
import { DeleteRecord } from "./overview";
import { MutationStatus, useCourseMutation } from "./scope";
import { Action, CourseDialog, CourseStatus, DataRow, Field, Ink, Panel, Picker, SearchBox, Tabs, layout } from "./ui";

const documentTabs = [
  { id: "all", label: "Semua" },
  { id: "materi", label: "Materi" },
  { id: "diktat", label: "Diktat" },
  { id: "bank_soal", label: "Bank soal" },
  { id: "pdf", label: "PDF" },
] as const;
const questionTabs = [
  { id: "all", label: "Semua" },
  { id: "Zyx", label: "Zyx asli" },
  { id: "Referensi", label: "Referensi" },
] as const;

const statusLabel = { draft: "Draf", published: "Terbit" } as const;
type Navigate = (path: string) => void;

export function CourseDocuments({ data, initialTab, initialChapter, navigate, actor }: {
  data: CourseFixture; initialTab?: string; initialChapter?: string; navigate: Navigate; actor: AcademicActor;
}) {
  const [tab, setTab] = useState(() => documentTabs.find((item) => item.id === (initialTab === "bank-soal" ? "bank_soal" : initialTab))?.id ?? "all");
  const [chapter, setChapter] = useState(initialChapter ?? "");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<CourseDocument | null>(null);
  const [editing, setEditing] = useState(false);
  const term = search.trim().toLocaleLowerCase("id");
  const documents = data.documents.filter((document) => {
    if (chapter && chapter !== document.chapterId) return false;
    if (term && !document.title.toLocaleLowerCase("id").includes(term)) return false;
    if (tab === "materi") return document.type === "Artikel";
    if (tab === "diktat") return document.type === "Diktat";
    if (tab === "bank_soal") return document.type === "Soal UTS" || document.type === "Soal UAS";
    if (tab === "pdf") return document.type === "Lainnya" || document.type === "Soal UTS" || document.type === "Soal UAS";
    return true;
  });

  return (
    <>
      <Tabs<(typeof documentTabs)[number]["id"]> options={documentTabs} selected={tab} onSelect={setTab} testID="course-document-tab" />
      <SearchBox label="Cari dokumen" value={search} onChange={setSearch} />
      {data.chapters.length ? (
        <Picker label="Filter bab" options={[{ id: "", label: "Semua bab" }, ...data.chapters.map(({ id, title }) => ({ id, label: title }))]}
          selected={chapter} onSelect={setChapter} />
      ) : null}
      <Panel title="Dokumen" action={<Action label="Tambah dokumen" onPress={() => setEditing(true)} />}>
        {documents.length === 0 ? <CourseStatus label="Belum ada dokumen pada pilihan ini." /> : null}
        {documents.map((document) => {
          const path = adminCoursePath(data.course.slug, "documents", document.id);
          return (
            <View key={document.id} style={layout.compact}>
              <DataRow title={document.title} description={`${document.type} · ${data.chapters.find((item) => item.id === document.chapterId)?.title ?? "Tanpa bab"}`}
                detail={statusLabel[document.status]} onPress={() => navigate(path)} testID={`course-document-${document.id}`} />
              <View style={layout.row}>
                <Action label="Edit" onPress={() => navigate(`${path}?mode=edit`)} variation="ghost" />
                <Action label="Hapus" onPress={() => setDeleting(document)} variation="ghost" />
              </View>
            </View>
          );
        })}
      </Panel>
      {editing ? (
        <CourseDialog title="Tambah dokumen" onClose={() => setEditing(false)}>
          <DocumentEditor data={data} actor={actor} onDone={() => setEditing(false)} />
        </CourseDialog>
      ) : null}
      {deleting ? (
        <DeleteRecord title={deleting.title} impact="Dokumen akan dihapus dari mata kuliah." actor={actor} data={data}
          close={() => setDeleting(null)} apply={(current) => ({ ...current, documents: current.documents.filter((item) => item.id !== deleting.id) })} />
      ) : null}
    </>
  );
}

export function CourseDocumentDetail({ data, document, initialMode, actor }: {
  data: CourseFixture; document: CourseDocument; initialMode?: string; actor: AcademicActor;
}) {
  const [mode, setMode] = useState(initialMode === "edit" ? "edit" : "preview");
  const [editKey, setEditKey] = useState(0);
  const [status, setStatus] = useState(false);
  const [saved, setSaved] = useState(false);
  const publishing = useCourseMutation(actor, () => setStatus(false));
  return (
    <>
      <Ink kind="heading">{document.title}</Ink>
      <Ink kind="meta" tone="muted">{document.type} · {statusLabel[document.status]}</Ink>
      <Tabs options={[{ id: "preview", label: "Pratinjau" }, { id: "edit", label: "Edit" }]}
        selected={mode} onSelect={(next) => { setMode(next); setSaved(false); }} />
      {saved ? <CourseStatus label="Perubahan tersimpan." /> : null}
      {mode === "edit" ? (
        <DocumentEditor key={editKey} data={data} document={document} actor={actor}
          onDone={() => { setMode("preview"); setSaved(true); }} reload={() => setEditKey((value) => value + 1)}
          onCancel={() => setMode("preview")} />
      ) : (
        <>
          <Ink>{document.body}</Ink>
          <View style={layout.row}>
            <Action label={document.status === "published" ? "Tarik publikasi" : "Terbitkan"} onPress={() => setStatus(true)} />
          </View>
        </>
      )}
      {status ? (
        <CourseDialog title={document.status === "published" ? "Tarik publikasi dokumen?" : "Terbitkan dokumen?"}
          onClose={() => { publishing.clear(); setStatus(false); }}>
          <Ink>{document.title}</Ink>
          <Ink>{document.status === "published" ? "Peserta akan kehilangan akses ke dokumen." : "Dokumen akan tersedia untuk peserta yang memiliki akses."}</Ink>
          <MutationStatus mutation={publishing} reload={() => { publishing.clear(); setStatus(false); }} />
          <Action label={document.status === "published" ? "Tarik publikasi" : "Terbitkan"}
            disabled={publishing.result?.status === "conflict" || publishing.result?.status === "retry"}
            onPress={() => publishing.submit({
              slug: data.course.slug, operation: "update", revision: data.revision,
              apply: (current) => current ? {
                ...current,
                documents: current.documents.map((item) => item.id === document.id ? {
                  ...item, status: item.status === "published" ? "draft" : "published",
                } : item),
              } : "Mata kuliah tidak ditemukan.",
            })} />
        </CourseDialog>
      ) : null}
    </>
  );
}

function DocumentEditor({ data, document, actor, onDone, onCancel, reload }: {
  data: CourseFixture; document?: CourseDocument; actor: AcademicActor; onDone(): void; onCancel?(): void; reload?(): void;
}) {
  const [revision] = useState(data.revision);
  const [title, setTitle] = useState(document?.title ?? "");
  const [body, setBody] = useState(document?.body ?? "");
  const [chapterId, setChapterId] = useState(document?.chapterId ?? "");
  const mutation = useCourseMutation(actor, onDone);
  const save = () => mutation.submit({
    slug: data.course.slug, operation: "update", revision,
    apply(current, id) {
      if (!current) return "Mata kuliah tidak ditemukan.";
      if (!title.trim() || !body.trim()) return "Judul dan isi wajib diisi.";
      const updated = { id: document?.id ?? id, title: title.trim(), body: body.trim(), chapterId: chapterId || null,
        status: document?.status ?? "draft", type: document?.type ?? "Artikel" } satisfies CourseDocument;
      return { ...current, documents: document ? current.documents.map((item) => item.id === document.id ? updated : item) : [...current.documents, updated] };
    },
  });
  return (
    <View style={layout.group}>
      <Field label="Judul dokumen" value={title} onChangeText={(value) => { mutation.clear(); setTitle(value); }} />
      <Picker label="Bab dokumen" selected={chapterId} onSelect={(value) => { mutation.clear(); setChapterId(value); }}
        options={[{ id: "", label: "Tanpa bab" }, ...data.chapters.map((item) => ({ id: item.id, label: item.title }))]} />
      <Field label="Isi dokumen" value={body} onChangeText={(value) => { mutation.clear(); setBody(value); }} multiline />
      <MutationStatus mutation={mutation} reload={reload ?? onCancel} />
      <View style={layout.row}>
        <Action label="Simpan dokumen" onPress={save} variation="default" disabled={mutation.result?.status === "retry" || mutation.result?.status === "conflict"} />
        {onCancel ? <Action label="Batal" onPress={onCancel} /> : null}
      </View>
    </View>
  );
}

export function CourseQuestions({ data, initialChapter, actor }: { data: CourseFixture; initialChapter?: string; actor: AcademicActor }) {
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState<(typeof questionTabs)[number]["id"]>("all");
  const [difficulty, setDifficulty] = useState("");
  const [chapter, setChapter] = useState(initialChapter ?? "");
  const [view, setView] = useState<CourseQuestion | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [deleting, setDeleting] = useState<CourseQuestion | null>(null);
  const matches = data.questions.filter((question) =>
    (origin === "all" || question.origin === origin) && (!difficulty || question.difficulty === difficulty) &&
    (!chapter || question.chapterId === chapter) && `${question.prompt} ${question.explanation}`.toLocaleLowerCase("id").includes(search.trim().toLocaleLowerCase("id"))
  );
  return (
    <>
      <Tabs<(typeof questionTabs)[number]["id"]> selected={origin} options={questionTabs} onSelect={setOrigin} />
      <SearchBox label="Cari soal" value={search} onChange={setSearch} />
      <View style={layout.row}>
        <Picker label="Tingkat kesulitan" selected={difficulty} onSelect={setDifficulty}
          options={[{ id: "", label: "Semua tingkat" }, ...["Mudah", "Sedang", "Sulit"].map((id) => ({ id, label: id }))]} />
        {data.chapters.length ? (
          <Picker label="Bab soal" selected={chapter} onSelect={setChapter}
            options={[{ id: "", label: "Semua bab" }, ...data.chapters.map(({ id, title }) => ({ id, label: title }))]} />
        ) : null}
      </View>
      <Panel title={`Bank soal · ${matches.length}`}>
        {matches.length ? matches.map((item) => (
          <DataRow key={item.id} title={item.prompt} description={`${item.origin} · ${item.difficulty}`}
            onPress={() => { setShowAnswer(false); setView(item); }} />
        )) : <CourseStatus label="Tidak ada soal pada pilihan ini." />}
      </Panel>
      {view ? (
        <CourseDialog title="Detail soal" onClose={() => setView(null)}>
          <Ink kind="strong">{view.prompt}</Ink>
          {view.options.map((option, index) => (
            <DataRow key={option} title={`${String.fromCharCode(65 + index)}. ${option}`} detail={showAnswer && index === view.answer ? "Jawaban benar" : undefined} />
          ))}
          <Action label={showAnswer ? "Sembunyikan pembahasan" : "Lihat pembahasan"} onPress={() => setShowAnswer(!showAnswer)} />
          {showAnswer ? <Ink>{view.explanation}</Ink> : null}
          <Action label="Hapus soal" variation="destructive" onPress={() => { setDeleting(view); setView(null); }} />
        </CourseDialog>
      ) : null}
      {deleting ? (
        <DeleteRecord title="soal" impact={deleting.prompt} actor={actor} data={data} close={() => setDeleting(null)}
          apply={(current) => {
            if (current.quizzes.some((quiz) => quiz.questionStats.some((item) => item.questionId === deleting.id))) {
              return "Keluarkan soal dari kuis yang masih menggunakannya.";
            }
            return { ...current, questions: current.questions.filter((item) => item.id !== deleting.id) };
          }} />
      ) : null}
    </>
  );
}
