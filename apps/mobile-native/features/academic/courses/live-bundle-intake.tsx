import { useRef, useState } from "react";
import { explainBundleError } from "../../../../../lib/bundle/admin-errors";
import { bundleIntakeBytes, bundleIntakePath, type BundleIntakeKind } from "../../../../../packages/native-parity/academic/courses/intake";
import type { DraftDocument } from "../../../device/file-controller";
import { scopedFiles } from "../../../device/files";
import { IntakeFailure, type BundleIntakePreview } from "./intake-client";
import { useIntakeDraft, useVerifiedIntakeSession, type VerifiedIntakeSession } from "./intake-scope";
import { Action, CourseDialog, CourseStatus, DataRow, Ink } from "./ui";

const zipPolicy = { mimeTypes: ["application/zip"], maxBytes: bundleIntakeBytes };

type Props = { courseId: string; kind: BundleIntakeKind; onStaged(id: string): void };

export function LiveBundleIntake(props: Props) {
  const verified = useVerifiedIntakeSession();
  const [open, setOpen] = useState(false);
  if (!verified) return null;
  const label = props.kind === "idea" ? "Idea Bundle" : "Product Bundle";
  return <>
    <Action label={`Unggah ${label}`} onPress={() => { if (verified.ready()) setOpen(true); }} testID={`admin-bundle-intake-${props.kind}`} />
    {open ? <BundleIntakeEditor key={props.kind + ":" + props.courseId} {...props} session={verified}
      close={() => setOpen(false)} label={label} /> : null}
  </>;
}

function BundleIntakeEditor({ courseId, kind, onStaged, session, close, label }: Props & {
  session: VerifiedIntakeSession; close(): void; label: string;
}) {
  const openDraft = useIntakeDraft(session, courseId, bundleIntakePath(kind) + "?" + new URLSearchParams({ courseId }), zipPolicy);
  const [selection, setSelection] = useState<{ file: DraftDocument; draft: NonNullable<ReturnType<typeof openDraft>> }>();
  const [stagedId, setStagedId] = useState<string>();
  const [preview, setPreview] = useState<BundleIntakePreview>();
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<void>) {
    if (busyRef.current || !session.current() || !session.ready()) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (failure) {
      if (!session.current()) return;
      if (failure instanceof IntakeFailure) {
        if (failure.codes.includes("BUNDLE_COURSE_MISMATCH")) setError("Mata kuliah pada ZIP berbeda. Pilih ZIP untuk mata kuliah ini.");
        else if (failure.codes.includes("BUNDLE_PREVIEW_CHANGED")) {
          setPreview(undefined);
          setError("Pratinjau kedaluwarsa. Periksa ZIP lagi.");
        } else if ([401, 403].includes(failure.status)) setError("Akses ditolak.");
        else setError(explainBundleError(failure.codes.join(",")));
      } else setError("Koneksi terputus. Coba lagi dengan ZIP yang sama.");
    } finally { busyRef.current = false; setBusy(false); }
  }

  if (stagedId) return <CourseDialog title={label} onClose={close}>
    <CourseStatus label="Draf tersimpan untuk review." />
    <Action label="Buka review" variation="default" onPress={() => {
      if (!session.ready()) return;
      close();
      onStaged(stagedId);
    }} />
  </CourseDialog>;

  return <CourseDialog title={`Unggah ${label}`} onClose={close} dismissDisabled={busy} testID="bundle-intake-dialog">
    <Action label={selection ? "Ganti ZIP" : "Pilih ZIP"} disabled={busy} onPress={() => void run(async () => {
      const draft = openDraft();
      if (!draft) return;
      const picked = await scopedFiles.pickDocument(draft.draft);
      if (picked.status === "ready") {
        if (!draft.draft.isDraftCurrent() || draft.draft.signal.aborted) { picked.document.release(); return; }
        selection?.file.release();
        setSelection({ file: picked.document, draft });
        setPreview(undefined);
      } else if (picked.status === "error") {
        setError(picked.issue === "size" ? "Pilih satu ZIP hingga 32 MB." : "Berkas ZIP tidak dapat dibaca.");
      }
    })} testID="bundle-intake-pick" />
    {selection ? <Ink>{selection.file.name}</Ink> : null}
    {preview ? <>
      <DataRow title={preview.bundleId} description={preview.schemaVersion} detail={`${preview.total} ${kind === "idea" ? "ide" : "produk"}`} />
      {preview.titles.map((title, index) => <Ink key={index} kind="meta">{title}</Ink>)}
    </> : null}
    {error ? <CourseStatus label={error} error /> : null}
    {busy ? <CourseStatus label={preview ? "Menyimpan draf..." : "Memeriksa berkas..."} /> : null}
    {selection && !preview ? <Action label="Periksa ZIP" variation="default" disabled={busy} onPress={() => void run(async () => {
      setPreview(await selection.draft.client.previewBundle(kind, selection.file));
    })} testID="bundle-intake-preview" /> : null}
    {selection && preview ? <Action label="Simpan untuk review" variation="default" disabled={busy} onPress={() => void run(async () => {
      const id = await selection.draft.client.stageBundle(kind, selection.file, preview);
      if (!session.current() || selection.draft.draft.signal.aborted) return;
      if (session.ready()) {
        close();
        onStaged(id);
      } else setStagedId(id);
    })} testID="bundle-intake-stage" /> : null}
  </CourseDialog>;
}
