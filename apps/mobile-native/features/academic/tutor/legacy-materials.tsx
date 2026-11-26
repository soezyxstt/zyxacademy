import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import type { TutorLegacyMaterialCommand, TutorLegacyMaterialDraft } from "../../../../../packages/academic/tutor-legacy-materials";
import type { TutorMaterialsData, TutorSupportClient } from "../../../../../packages/academic/tutor-support";
import type { CourseWriteTarget } from "../../../../../packages/native-parity/academic/courses/edit-contract";
import { TutorDataError } from "../../../../../packages/native-parity/academic/tutor/model";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { useCourseWrite } from "../courses/live-write";
import { Empty, Heading, Label, Row, TutorDetail, TutorPage, tutorLayout, type TutorTheme } from "./ui";

type Editor = NonNullable<TutorSupportClient["legacyMaterials"]>;
type Mode = { action: "create" } | { action: "edit" | "delete"; id: string; title: string };

export function EditableTutorMaterials({ theme, courseId, legacyCourseId, data, editor, back, refresh }: {
  theme: TutorTheme; courseId: string; legacyCourseId: string; data: TutorMaterialsData; editor: Editor;
  back(): void; refresh(): void;
}) {
  const { canInteract } = useProtectedInteraction();
  const target = useMemo(() => editor.target(courseId), [editor, courseId]);
  const [mode, setMode] = useState<Mode>();
  const prior = target.pending()?.draft;
  function open(next: Mode) {
    if (canInteract() && !target.pending()) setMode(next);
  }
  function resume() {
    if (!prior || !canInteract()) return;
    if (prior.action === "create") setMode({ action: "create" });
    else setMode({ action: prior.action, id: prior.id, title: data.items.find(item => item.id === prior.id)?.title ?? "Materi" });
  }
  const updateList = () => { setMode(undefined); refresh(); };
  return <>
    <TutorPage title="Dokumen" subtitle={data.title} theme={theme} onBack={back}>
      <View style={tutorLayout.cluster}>
        {prior ? <Button theme={theme} variant="outline" testID="tutor-legacy-material-recover" onPress={resume}>Periksa perubahan materi</Button>
          : <Button theme={theme} testID="tutor-legacy-material-create" onPress={() => open({ action: "create" })}>Tambah materi</Button>}
      </View>
      <Heading theme={theme} title="Materi pengajaran" count={`${data.items.length} dokumen`} />
      {data.items.map(item => <Row key={item.id} theme={theme} title={item.title} subtitle={item.summary}>
        {!prior ? <View style={tutorLayout.cluster}>
          <Button theme={theme} variant="outline" accessibilityLabel={`Edit ${item.title}`}
            testID={`tutor-legacy-material-edit-${item.id}`} onPress={() => open({ action: "edit", id: item.id, title: item.title })}>Edit</Button>
          <Button theme={theme} variant="outline" accessibilityLabel={`Hapus ${item.title}`}
            testID={`tutor-legacy-material-delete-${item.id}`} onPress={() => open({ action: "delete", id: item.id, title: item.title })}>Hapus</Button>
        </View> : null}
      </Row>)}
      {!data.items.length ? <Empty theme={theme} title="Belum ada materi" /> : null}
    </TutorPage>
    {mode ? <MaterialDialog key={JSON.stringify(mode)} mode={mode} {...{ theme, courseId, legacyCourseId, editor, target }}
      close={() => setMode(undefined)} reload={updateList} /> : null}
  </>;
}

function MaterialDialog({ mode, theme, courseId, legacyCourseId, editor, target, close, reload }: {
  mode: Mode; theme: TutorTheme; courseId: string; legacyCourseId: string; editor: Editor;
  target: CourseWriteTarget<TutorLegacyMaterialCommand>; close(): void; reload(): void;
}) {
  const { canInteract, suspended } = useProtectedInteraction();
  const pending = target.pending()?.draft;
  const id = mode.action === "create" ? null : mode.id;
  const [data, setData] = useState<TutorLegacyMaterialDraft>();
  const [failure, setFailure] = useState("");
  const [attempt, setAttempt] = useState(0);
  const loading = Boolean(id && !data && !failure && !pending);
  const title = mode.action === "create" ? "Tambah materi" : mode.action === "edit" ? "Edit materi" : "Hapus materi";
  useEffect(() => {
    if (!id || pending || suspended) return;
    const controller = new AbortController();
    setFailure(""); setData(undefined);
    void editor.read(courseId, legacyCourseId, id, controller.signal).then(value => {
      if (!controller.signal.aborted) setData(value);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setFailure(error instanceof TutorDataError && [401, 403, 404].includes(error.status) ? "Materi tidak tersedia untuk akun ini." : "Materi belum dapat dimuat.");
    });
    return () => controller.abort();
  }, [attempt, pending, courseId, legacyCourseId, id, editor, suspended]);
  if (loading || failure) return <TutorDetail theme={theme} title={title} subtitle={mode.action === "create" ? undefined : mode.title} onBack={close}>
    <Label theme={theme} tone={failure ? "error" : "muted"}>{failure || "Memuat materi…"}</Label>
    {failure ? <Button theme={theme} variant="outline" onPress={() => { if (canInteract()) setAttempt(value => value + 1); }}>Coba lagi</Button> : null}
  </TutorDetail>;
  return <MaterialEditor {...{ target, mode, data, title, theme, close, reload }} />;
}

function MaterialEditor({ target, mode, data, title, theme, close, reload }: {
  target: CourseWriteTarget<TutorLegacyMaterialCommand>; mode: Mode; data?: TutorLegacyMaterialDraft;
  title: string; theme: TutorTheme; close(): void; reload(): void;
}) {
  const { canInteract } = useProtectedInteraction();
  const pending = target.pending()?.draft;
  const initial = pending && pending.action !== "delete" ? pending : data;
  const [materialTitle, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [markdown, setMarkdown] = useState(initial?.markdown ?? "");
  const write = useCourseWrite(target, reload);
  const stale = write.stale || write.status === "denied";
  function submit() {
    if (!canInteract() || !write.editable) return;
    if (mode.action === "delete" && data) {
      write.submit({ action: "delete", id: mode.id, expectedRevision: data.revision });
      return;
    }
    if (![materialTitle, summary, markdown].every(value => value.trim())) { write.setStatus("invalid"); return; }
    const body = { title: materialTitle, summary, markdown };
    if (mode.action === "create") write.submit({ action: "create", ...body });
    else if (mode.action === "edit" && data) write.submit({ action: "edit", id: mode.id, expectedRevision: data.revision, ...body });
  }
  return <TutorDetail theme={theme} title={title} subtitle={mode.action === "create" ? undefined : mode.title} onBack={() => { if (!write.busy) close(); }}>
    {mode.action === "delete" ? <Label theme={theme}>Materi dan bagiannya akan dihapus.</Label> : <>
      <Input theme={theme} accessibilityLabel="Judul" placeholder="Judul" value={materialTitle} onChangeText={setTitle} editable={write.editable} />
      <Input theme={theme} accessibilityLabel="Ringkasan" placeholder="Ringkasan" multiline value={summary} onChangeText={setSummary} editable={write.editable} />
      <Input theme={theme} accessibilityLabel="Konten Markdown" placeholder="Konten Markdown" multiline value={markdown}
        onChangeText={setMarkdown} editable={write.editable} testID="tutor-legacy-material-markdown" />
    </>}
    {write.status === "invalid" ? <Label theme={theme} tone="error">Periksa judul, ringkasan, dan isi materi.</Label> : null}
    {write.status === "retry" ? <Label theme={theme} tone="error">Hasil perubahan belum terkonfirmasi.</Label> : null}
    {stale ? <Label theme={theme} tone="error">Materi berubah atau tidak tersedia untuk akun ini.</Label> : null}
    {stale ? <Button theme={theme} variant="outline" onPress={reload}>Muat ulang materi</Button>
      : write.status === "retry" ? <Button theme={theme} variant="outline" onPress={() => { if (canInteract()) write.retry(); }}>Periksa dengan percobaan ulang</Button>
        : <Button theme={theme} variant={mode.action === "delete" ? "destructive" : "default"} isLoading={write.busy} disabled={!write.editable}
          testID="tutor-legacy-material-submit" onPress={submit}>{mode.action === "delete" ? "Konfirmasi hapus" : "Simpan materi"}</Button>}
  </TutorDetail>;
}
