"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  FolderOpen,
  GripVertical,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import {
  LEVEL1_CATEGORIES,
  getSubcategoriesForLevel1,
  type CourseMaterialSubcategory,
  type MaterialLevel1Category,
} from "@/lib/course-materials";
import {
  BATCH_MAX_FILES,
  BATCH_MAX_FILE_BYTES,
  UPLOAD_CONCURRENCY,
  detectCategoryFromFilename,
  detectYear,
  extensionOf,
  formatBytes,
  generateFileName,
  isHiddenOrSystemFile,
  isSupportedBatchFile,
  stripPdfExtension,
  type DuplicateAction,
  type StagedBatchDocument,
} from "@/lib/course-batch-upload";
import {
  hashFileSha256,
  putFileToPresignedUrl,
  runWithConcurrency,
} from "@/lib/batch-client";

type Chapter = {
  id: string;
  title: string;
  orderIndex: number;
};

type IngestEntry = { file: File; path: string };

type SkippedEntry = { name: string; reason: string };

type UploadSummary = {
  created: number;
  updated: number;
  failedUploads: number;
  skippedDuplicates: number;
};

type PreviewState = { url: string; name: string };

const TIME_RELATED_CATEGORIES: MaterialLevel1Category[] = [
  "soal",
  "pembahasan_soal",
];

const DUPLICATE_ACTION_LABELS: Record<DuplicateAction, string> = {
  skip: "Lewati",
  overwrite: "Timpa dokumen lama",
  keep: "Unggah sebagai versi baru",
};

function readAllDirectoryEntries(
  reader: FileSystemDirectoryReader
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const step = () => {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(all);
          return;
        }
        all.push(...batch);
        step();
      }, reject);
    };
    step();
  });
}

async function collectFilesFromDataTransfer(
  dt: DataTransfer
): Promise<IngestEntry[]> {
  const out: IngestEntry[] = [];
  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < dt.items.length; i++) {
    const entry = dt.items[i].webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  if (entries.length) {
    const queue = [...entries];
    while (queue.length) {
      const entry = queue.shift() as FileSystemEntry;
      if (entry.isFile) {
        const file = await new Promise<File | null>((resolve) => {
          (entry as FileSystemFileEntry).file(resolve, () => resolve(null));
        });
        if (file) out.push({ file, path: entry.fullPath.replace(/^\//, "") });
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const children = await readAllDirectoryEntries(reader);
        queue.push(...children);
      }
    }
  }

  if (!out.length) {
    for (const file of Array.from(dt.files || [])) {
      out.push({ file, path: file.name });
    }
  }
  return out;
}

function deriveTitle(filename: string): string {
  const base = stripPdfExtension(filename)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base || stripPdfExtension(filename);
}

export function BatchUploadDialog({
  open,
  onOpenChange,
  courseId,
  courseTitle,
  chapters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
  chapters: Chapter[];
}) {
  const router = useRouter();

  const [docs, setDocs] = useState<StagedBatchDocument[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [skippedLog, setSkippedLog] = useState<SkippedEntry[]>([]);
  const [showSkipped, setShowSkipped] = useState(false);
  const [ingestPhase, setIngestPhase] = useState<"idle" | "hashing" | "checking">("idle");
  const [dragActive, setDragActive] = useState(false);
  const [columnDragOver, setColumnDragOver] = useState<MaterialLevel1Category | null>(null);
  const [showRenameMatrix, setShowRenameMatrix] = useState(false);
  const [uploadRunning, setUploadRunning] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const draggingIdsRef = useRef<string[]>([]);
  const renamedOverrideRef = useRef<Set<string>>(new Set());
  const completedUploadsRef = useRef<Array<{ doc: StagedBatchDocument; key: string }>>([]);
  const docsRef = useRef<StagedBatchDocument[]>([]);
  const selectionRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const resetAll = useCallback(() => {
    setDocs([]);
    setSelection(new Set());
    setSelectedChapters(new Set());
    setSkippedLog([]);
    setShowSkipped(false);
    setIngestPhase("idle");
    setDragActive(false);
    setColumnDragOver(null);
    setShowRenameMatrix(false);
    setUploadRunning(false);
    setCommitError(null);
    setSummary(null);
    draggingIdsRef.current = [];
    renamedOverrideRef.current = new Set();
    completedUploadsRef.current = [];
    docsRef.current = [];
    selectionRef.current = new Set();
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetAll();
      onOpenChange(next);
    },
    [onOpenChange, resetAll]
  );

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const updateDoc = useCallback(
    (id: string, patch: Partial<StagedBatchDocument>) => {
      setDocs((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
      );
    },
    []
  );

  const createStagedDoc = useCallback(
    (file: File, path: string): StagedBatchDocument => {
      const detected = detectCategoryFromFilename(file.name);
      const detectedYear = detectYear(file.name);
      const year = detected.category === "materi" ? null : detectedYear;
      const title = deriveTitle(file.name);
      return {
        id: crypto.randomUUID(),
        file,
        originalName: file.name,
        relativePath: path,
        size: file.size,
        checksum: null,
        status: "hashing",
        uploadProgress: 0,
        duplicateOf: null,
        duplicateAction: "keep",
        category: detected.category,
        subcategory: detected.subcategory,
        year,
        title,
        generatedName: generateFileName({
          courseCode: courseId,
          category: detected.category,
          subcategory: detected.subcategory,
          year,
          title,
        }),
      };
    },
    [courseId]
  );

  const runHashAndDedup = useCallback(
    async (staged: StagedBatchDocument[]) => {
      setIngestPhase("hashing");
      const hashedChecksums = new Set<string>();
      await runWithConcurrency(staged, 3, async (doc) => {
        try {
          const hex = await hashFileSha256(doc.file);
          hashedChecksums.add(hex);
          updateDoc(doc.id, { checksum: hex });
        } catch {
          updateDoc(doc.id, {
            status: "error",
            errorMessage: "Gagal menghitung checksum",
          });
        }
      });

      const hashes = Array.from(hashedChecksums);

      let serverDuplicates: Record<string, { materialId: string; title: string }> = {};
      if (hashes.length) {
        setIngestPhase("checking");
        try {
          const res = await fetch("/api/admin/course-materials/batch/check-duplicates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ courseId, checksums: hashes }),
          });
          const payload = await res.json().catch(() => null);
          if (res.ok && payload?.duplicates) {
            serverDuplicates = payload.duplicates;
          }
        } catch {
          toast.error("Gagal memeriksa duplikasi di server.");
        }
      }

      setIngestPhase("idle");
      setDocs((prev) =>
        prev.map((d) => {
          if (d.status !== "hashing") return d;
          const dup = d.checksum ? serverDuplicates[d.checksum] : undefined;
          return {
            ...d,
            status: "ready",
            duplicateOf: dup ? { materialId: dup.materialId, title: dup.title } : null,
          };
        })
      );
    },
    [courseId, updateDoc]
  );

  const addStagedFiles = useCallback(
    async (incoming: IngestEntry[]) => {
      const accepted: StagedBatchDocument[] = [];
      const skipped: SkippedEntry[] = [];

      for (const { file, path } of incoming) {
        if (isHiddenOrSystemFile(file.name)) continue;
        if (!isSupportedBatchFile(file.name)) {
          skipped.push({ name: file.name, reason: "Ekstensi tidak didukung" });
          continue;
        }
        if (file.size > BATCH_MAX_FILE_BYTES) {
          skipped.push({ name: file.name, reason: "Melebihi batas 50 MB" });
          continue;
        }
        accepted.push(createStagedDoc(file, path));
      }

      const room = Math.max(0, BATCH_MAX_FILES - docsRef.current.length);
      if (accepted.length > room) {
        skipped.push({
          name: `${accepted.length - room} berkas`,
          reason: `Melebihi batas ${BATCH_MAX_FILES} dokumen per batch`,
        });
      }
      const staged = accepted.slice(0, room);

      if (skipped.length) {
        setSkippedLog((prev) => [...prev, ...skipped]);
      }
      if (!staged.length) return;

      setDocs((prev) => [...prev, ...staged]);
      await runHashAndDedup(staged);
    },
    [createStagedDoc, runHashAndDedup]
  );

  const handleInputFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || !fileList.length) return;
      const entries: IngestEntry[] = Array.from(fileList).map((file) => ({
        file,
        path: file.webkitRelativePath || file.name,
      }));
      await addStagedFiles(entries);
    },
    [addStagedFiles]
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setDragActive(false);
      if (uploadRunning || ingestPhase !== "idle") return;
      const entries = await collectFilesFromDataTransfer(event.dataTransfer);
      await addStagedFiles(entries);
    },
    [addStagedFiles, ingestPhase, uploadRunning]
  );

  const inBatchDuplicateIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of docs) {
      if (!doc.checksum) continue;
      counts.set(doc.checksum, (counts.get(doc.checksum) ?? 0) + 1);
    }
    return new Set(
      docs.filter((d) => d.checksum && (counts.get(d.checksum) ?? 0) > 1).map((d) => d.id)
    );
  }, [docs]);

  const applyMetadataChange = useCallback(
    (
      id: string,
      patch: Partial<{
        category: MaterialLevel1Category;
        subcategory: CourseMaterialSubcategory | null;
        year: number | null;
        title: string;
      }>
    ) => {
      setDocs((prev) =>
        prev.map((doc) => {
          if (doc.id !== id) return doc;
          const next = { ...doc, ...patch };

          if (patch.category && patch.category !== doc.category) {
            const stillValid =
              next.subcategory &&
              getSubcategoriesForLevel1(patch.category).some(
                (s) => s.value === next.subcategory
              );
            if (!stillValid) {
              next.subcategory = getSubcategoriesForLevel1(patch.category)[0]?.value ?? null;
            }
            if (patch.category === "materi") {
              next.year = null;
            }
          }

          if (!renamedOverrideRef.current.has(doc.id)) {
            next.generatedName = generateFileName({
              courseCode: courseId,
              category: next.category,
              subcategory: next.subcategory,
              year: next.year,
              title: next.title,
            });
          }
          return next;
        })
      );
    },
    [courseId]
  );

  const moveDocsToCategory = useCallback(
    (ids: string[], category: MaterialLevel1Category) => {
      for (const id of ids) applyMetadataChange(id, { category });
      setSelection((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    },
    [applyMetadataChange]
  );

  const removeDocs = useCallback((ids: string[]) => {
    setDocs((prev) => prev.filter((d) => !ids.includes(d.id)));
    setSelection((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const toggleSelection = useCallback((id: string, additive: boolean) => {
    setSelection((prev) => {
      const next = new Set(additive ? prev : []);
      if (prev.has(id) && additive) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleChapter = useCallback((chapterId: string) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }, []);

  const openPreview = useCallback((doc: StagedBatchDocument) => {
    if (!doc.file) return;
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview({ url: URL.createObjectURL(doc.file), name: doc.originalName });
  }, [preview]);

  const handleCardKeyDown = useCallback(
    (event: React.KeyboardEvent, doc: StagedBatchDocument) => {
      if (event.target !== event.currentTarget) return;
      if (event.code === "Space") {
        event.preventDefault();
        openPreview(doc);
      }
    },
    [openPreview]
  );

  const uploadableDocs = useMemo(
    () =>
      docs.filter(
        (d) =>
          d.status === "ready" &&
          !(d.duplicateOf && d.duplicateAction === "skip")
      ),
    [docs]
  );

  const totalBytes = useMemo(
    () => uploadableDocs.reduce((sum, d) => sum + d.size, 0),
    [uploadableDocs]
  );

  const overallProgress = useMemo(() => {
    if (!uploadableDocs.length) return 0;
    const done = uploadableDocs.reduce(
      (sum, d) => sum + (d.status === "completed" ? 100 : d.uploadProgress),
      0
    );
    return Math.round(done / uploadableDocs.length);
  }, [uploadableDocs]);

  const commitCompletedUploads = useCallback(
    async (chapterIds: Set<string>): Promise<{ created: number; updated: number } | null> => {
      const uploads = completedUploadsRef.current;
      if (!uploads.length) return { created: 0, updated: 0 };

      const items = uploads.map(({ doc, key }) => ({
        id: doc.id,
        action:
          doc.duplicateOf && doc.duplicateAction === "overwrite"
            ? ("overwrite" as const)
            : ("create" as const),
        targetId:
          doc.duplicateOf && doc.duplicateAction === "overwrite"
            ? doc.duplicateOf.materialId
            : undefined,
        key,
        title: doc.title.trim(),
        type: doc.category,
        subcategory: doc.subcategory,
        year: doc.category === "materi" ? null : doc.year,
        checksum: doc.checksum,
        size: doc.size,
      }));

      try {
        const res = await fetch("/api/admin/course-materials/batch/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId,
            chapterIds: Array.from(chapterIds),
            items,
          }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          setCommitError(payload?.error || "Gagal menyimpan metadata batch.");
          return null;
        }
        return { created: payload.created ?? 0, updated: payload.updated ?? 0 };
      } catch {
        setCommitError("Terjadi kesalahan jaringan saat menyimpan metadata.");
        return null;
      }
    },
    [courseId]
  );

  const startUpload = useCallback(async () => {
    if (uploadRunning || ingestPhase !== "idle") return;

    if (selectedChapters.size === 0) {
      toast.error("Pilih minimal satu bab untuk seluruh dokumen dalam batch ini.");
      return;
    }
    if (docs.some((d) => !d.title.trim())) {
      toast.error("Semua dokumen memerlukan judul.");
      return;
    }
    if (!uploadableDocs.length) {
      toast.error("Tidak ada dokumen untuk diunggah.");
      return;
    }

    setCommitError(null);
    setSummary(null);
    setUploadRunning(true);

    try {
      const presignRes = await fetch("/api/admin/course-materials/batch/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          files: uploadableDocs.map((d) => ({
            id: d.id,
            filename: d.generatedName,
          })),
        }),
      });
      const presignPayload = await presignRes.json().catch(() => null);
      if (!presignRes.ok || !Array.isArray(presignPayload?.data)) {
        throw new Error(presignPayload?.error || "Gagal meminta URL unggahan");
      }

      const entriesById = new Map<string, { key: string; uploadUrl: string }>(
        presignPayload.data.map((entry: { id: string; key: string; uploadUrl: string }) => [
          entry.id,
          { key: entry.key, uploadUrl: entry.uploadUrl },
        ])
      );

      const uploadingIds = new Set(uploadableDocs.map((d) => d.id));
      setDocs((prev) =>
        prev.map((d) =>
          uploadingIds.has(d.id)
            ? { ...d, status: "uploading", uploadProgress: 0, errorMessage: undefined }
            : d
        )
      );

      completedUploadsRef.current = [];
      let failedUploads = 0;
      await runWithConcurrency(uploadableDocs, UPLOAD_CONCURRENCY, async (doc) => {
        const entry = entriesById.get(doc.id);
        if (!entry) {
          failedUploads += 1;
          updateDoc(doc.id, {
            status: "error",
            errorMessage: "URL unggahan tidak tersedia",
          });
          return;
        }
        try {
          await putFileToPresignedUrl(doc.file, entry.uploadUrl, (percent) =>
            updateDoc(doc.id, { uploadProgress: percent })
          );
          completedUploadsRef.current.push({ doc, key: entry.key });
          updateDoc(doc.id, { status: "completed", uploadProgress: 100 });
        } catch (err) {
          failedUploads += 1;
          updateDoc(doc.id, {
            status: "error",
            errorMessage: err instanceof Error ? err.message : "Unggahan gagal",
          });
        }
      });

      const result = await commitCompletedUploads(selectedChapters);
      if (result) {
        setSummary({
          created: result.created,
          updated: result.updated,
          failedUploads,
          skippedDuplicates: docs.filter(
            (d) => d.duplicateOf && d.duplicateAction === "skip"
          ).length,
        });
        toast.success("Batch dokumen berhasil disimpan.");
        router.refresh();
      }
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : "Terjadi kesalahan jaringan.");
    } finally {
      setUploadRunning(false);
    }
  }, [
    commitCompletedUploads,
    courseId,
    docs,
    ingestPhase,
    router,
    selectedChapters,
    updateDoc,
    uploadRunning,
    uploadableDocs,
  ]);

  const retryCommit = useCallback(async () => {
    if (!completedUploadsRef.current.length) return;
    setCommitError(null);
    setUploadRunning(true);
    try {
      const result = await commitCompletedUploads(selectedChapters);
      if (result) {
        setSummary({
          created: result.created,
          updated: result.updated,
          failedUploads: docs.filter((d) => d.status === "error").length,
          skippedDuplicates: docs.filter(
            (d) => d.duplicateOf && d.duplicateAction === "skip"
          ).length,
        });
        toast.success("Metadata batch berhasil disimpan.");
        router.refresh();
      }
    } finally {
      setUploadRunning(false);
    }
  }, [commitCompletedUploads, docs, router, selectedChapters]);

  const bulkApplyYear = useCallback(
    (raw: string) => {
      const year = raw.trim() ? Number(raw) : null;
      if (year !== null && (isNaN(year) || year < 1900 || year > 2100)) {
        toast.error("Tahun harus antara 1900 dan 2100.");
        return;
      }
      const ids = Array.from(selectionRef.current);
      for (const id of ids) {
        const doc = docsRef.current.find((d) => d.id === id);
        if (!doc || doc.category === "materi") continue;
        applyMetadataChange(id, { year });
      }
    },
    [applyMetadataChange]
  );

  const bulkApplySubcategory = useCallback(
    (subcategory: CourseMaterialSubcategory) => {
      const ids = Array.from(selectionRef.current);
      for (const id of ids) {
        const doc = docsRef.current.find((d) => d.id === id);
        if (!doc) continue;
        const valid = getSubcategoriesForLevel1(doc.category).some(
          (s) => s.value === subcategory
        );
        if (valid) applyMetadataChange(id, { subcategory });
      }
    },
    [applyMetadataChange]
  );

  const hashingCount = docs.filter((d) => d.status === "hashing").length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Unggah Batch Dokumen</DialogTitle>
          <DialogDescription>
            Unggah banyak PDF sekaligus untuk {courseTitle}. Atur kategori, tahun, dan nama berkas sebelum eksekusi.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => filesInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && e.code === "Enter") filesInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-6 text-center cursor-pointer transition-colors ${
              dragActive ? "border-brand-primary bg-brand-primary/10" : "border-border hover:bg-muted/20"
            }`}
          >
            <Upload className="size-5 text-muted-foreground" />
            <p className="text-body-sm font-semibold text-foreground">
              Tarik berkas atau folder PDF ke sini
            </p>
            <p className="text-body-xs text-muted-foreground">
              Maksimal {BATCH_MAX_FILES} dokumen, 50 MB per berkas. Sub-folder dipindai otomatis.
            </p>
            <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg text-body-sm"
                onClick={() => filesInputRef.current?.click()}
              >
                <FileText className="size-3.5" />
                Pilih Berkas
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg text-body-sm"
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderOpen className="size-3.5" />
                Pilih Folder
              </Button>
            </div>
          </div>

          <input
            ref={filesInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => {
              void handleInputFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void handleInputFiles(e.target.files);
              e.target.value = "";
            }}
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          />

          {(ingestPhase !== "idle" || hashingCount > 0) && (
            <div className="flex items-center gap-2 text-body-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {ingestPhase === "checking" ? "Memeriksa duplikasi" : "Menghitung checksum"}
            </div>
          )}

          {skippedLog.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-body-xs text-muted-foreground">
              <button
                type="button"
                className="font-semibold text-foreground hover:underline cursor-pointer"
                onClick={() => setShowSkipped((v) => !v)}
              >
                {skippedLog.length} berkas dilewati
              </button>
              {showSkipped && (
                <ul className="mt-1.5 space-y-0.5 list-disc list-inside">
                  {skippedLog.map((s, i) => (
                    <li key={`${s.name}-${i}`}>
                      <span className="text-foreground">{s.name}</span>, {s.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {docs.length > 0 && (
            <>
              <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-body-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Kaitkan dengan Bab ({selectedChapters.size} dipilih)
                  </span>
                  {chapters.length > 0 && (
                    <button
                      type="button"
                      className="text-body-xs text-brand-primary font-medium hover:underline cursor-pointer"
                      onClick={() =>
                        setSelectedChapters(
                          selectedChapters.size === chapters.length
                            ? new Set()
                            : new Set(chapters.map((c) => c.id))
                        )
                      }
                    >
                      {selectedChapters.size === chapters.length ? "Batalkan Semua" : "Pilih Semua Bab"}
                    </button>
                  )}
                </div>
                {chapters.length === 0 ? (
                  <p className="text-body-xs text-status-warning py-1">
                    Mata kuliah ini belum memiliki bab. Tambahkan bab terlebih dahulu di tab Bab.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-32 overflow-y-auto">
                    {chapters.map((ch) => {
                      const isChecked = selectedChapters.has(ch.id);
                      return (
                        <label
                          key={ch.id}
                          className={`flex items-start gap-2 p-2 rounded-lg border text-body-xs cursor-pointer select-none transition-colors ${
                            isChecked
                              ? "border-brand-primary bg-brand-primary/10 text-foreground"
                              : "border-border/60 hover:bg-muted/20 text-muted-foreground"
                          }`}
                        >
                          <Checkbox checked={isChecked} onCheckedChange={() => toggleChapter(ch.id)} className="mt-0.5" />
                          <span className="truncate">
                            Bab {ch.orderIndex}: {ch.title}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-md text-body-xs">
                  {docs.length} dokumen, {formatBytes(totalBytes)}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg text-body-sm"
                  onClick={() => setShowRenameMatrix((v) => !v)}
                >
                  {showRenameMatrix ? "Sembunyikan Pratinjau Nama" : "Pratinjau Nama Berkas"}
                </Button>
                {selection.size > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-lg text-body-sm"
                    onClick={() => setSelection(new Set())}
                  >
                    Bersihkan Seleksi ({selection.size})
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="ml-auto h-9 rounded-lg text-body-sm font-semibold"
                  disabled={
                    uploadRunning ||
                    ingestPhase !== "idle" ||
                    !uploadableDocs.length ||
                    chapters.length === 0
                  }
                  onClick={() => void startUpload()}
                >
                  {uploadRunning ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Unggah {uploadableDocs.length} Dokumen
                </Button>
              </div>

              {uploadRunning && (
                <div className="space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-md bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-200"
                      style={{ width: `${overallProgress}%` }}
                    />
                  </div>
                  <p className="text-body-xs text-muted-foreground">Progres total {overallProgress}%</p>
                </div>
              )}

              {commitError && (
                <div className="rounded-xl border border-status-error/40 bg-status-error/10 p-3 space-y-2">
                  <div className="flex items-start gap-2 text-body-xs text-foreground">
                    <AlertTriangle className="size-4 shrink-0 text-status-error" />
                    <span>{commitError} Berkas yang sudah terunggah dapat dicoba disimpan ulang.</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg text-body-sm"
                    disabled={uploadRunning}
                    onClick={() => void retryCommit()}
                  >
                    Coba Simpan Metadata Lagi
                  </Button>
                </div>
              )}

              {summary && (
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
                    <CheckCircle2 className="size-4 text-status-success" />
                    Selesai
                  </div>
                  <p className="mt-1 text-body-xs text-muted-foreground">
                    {summary.created} dokumen baru, {summary.updated} ditimpa.
                    {summary.skippedDuplicates > 0 && ` ${summary.skippedDuplicates} duplikat dilewati.`}
                    {summary.failedUploads > 0 && ` ${summary.failedUploads} unggahan gagal.`}
                  </p>
                </div>
              )}

              {showRenameMatrix && <RenameMatrix docs={docs} onRename={handleInlineRename} />}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {LEVEL1_CATEGORIES.map((col) => {
                  const columnDocs = docs.filter((d) => d.category === col.value);
                  const isOver = columnDragOver === col.value;
                  return (
                    <div
                      key={col.value}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setColumnDragOver(col.value);
                      }}
                      onDragLeave={() => setColumnDragOver((c) => (c === col.value ? null : c))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setColumnDragOver(null);
                        const ids = draggingIdsRef.current;
                        if (ids.length) moveDocsToCategory(ids, col.value);
                        draggingIdsRef.current = [];
                      }}
                      className={`rounded-xl border p-2 min-h-40 transition-colors ${
                        isOver ? "border-brand-primary bg-brand-primary/5" : "border-border bg-muted/10"
                      }`}
                    >
                      <div className="flex items-center justify-between px-1 pb-2">
                        <span className="font-heading text-body-sm font-bold text-foreground">{col.label}</span>
                        <Badge variant="outline" className="rounded-md text-[10px]">
                          {columnDocs.length}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {columnDocs.map((doc) => (
                          <StagedCard
                            key={doc.id}
                            doc={doc}
                            selected={selection.has(doc.id)}
                            inBatchDuplicate={inBatchDuplicateIds.has(doc.id)}
                            disabled={uploadRunning}
                            onToggleSelect={toggleSelection}
                            onMetaChange={applyMetadataChange}
                            onDuplicateAction={(action) =>
                              updateDoc(doc.id, { duplicateAction: action })
                            }
                            onPreview={() => openPreview(doc)}
                            onKeyDown={(e) => handleCardKeyDown(e, doc)}
                            onDragStartCard={(id) => {
                              draggingIdsRef.current = selectionRef.current.has(id)
                                ? Array.from(selectionRef.current)
                                : [id];
                            }}
                          />
                        ))}
                        {columnDocs.length === 0 && (
                          <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-body-xs text-muted-foreground">
                            Tarik kartu ke sini
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {selection.size > 0 && !uploadRunning && (
          <BulkActionBar
            count={selection.size}
            onMove={(cat) => moveDocsToCategory(Array.from(selectionRef.current), cat)}
            onApplyYear={bulkApplyYear}
            onApplySubcategory={bulkApplySubcategory}
            onRemove={() => removeDocs(Array.from(selectionRef.current))}
          />
        )}

        <Dialog open={Boolean(preview)} onOpenChange={(next) => {
          if (!next && preview) {
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }
        }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{preview?.name}</DialogTitle>
              <DialogDescription>Pratinjau cepat halaman pertama.</DialogDescription>
            </DialogHeader>
            {preview && (
              <iframe
                src={`${preview.url}#page=1&toolbar=0&navpanes=0`}
                title={preview.name}
                className="h-[60vh] w-full rounded-lg border border-border bg-background"
              />
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );

  function handleInlineRename(id: string, name: string) {
    const withExt = name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
    renamedOverrideRef.current.add(id);
    updateDoc(id, { generatedName: withExt });
  }
}

function StagedCard({
  doc,
  selected,
  inBatchDuplicate,
  disabled,
  onToggleSelect,
  onMetaChange,
  onDuplicateAction,
  onPreview,
  onKeyDown,
  onDragStartCard,
}: {
  doc: StagedBatchDocument;
  selected: boolean;
  inBatchDuplicate: boolean;
  disabled: boolean;
  onToggleSelect: (id: string, additive: boolean) => void;
  onMetaChange: (
    id: string,
    patch: Partial<{
      category: MaterialLevel1Category;
      subcategory: CourseMaterialSubcategory | null;
      year: number | null;
      title: string;
    }>
  ) => void;
  onDuplicateAction: (action: DuplicateAction) => void;
  onPreview: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onDragStartCard: (id: string) => void;
}) {
  const showYear = TIME_RELATED_CATEGORIES.includes(doc.category);
  const subcategories = getSubcategoriesForLevel1(doc.category);
  const hasDuplicateFlag = Boolean(doc.duplicateOf) || inBatchDuplicate;

  return (
    <div
      tabIndex={0}
      draggable={!disabled}
      onKeyDown={onKeyDown}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        window.getSelection()?.removeAllRanges();
        onDragStartCard(doc.id);
      }}
      className={`space-y-1.5 rounded-lg border bg-card p-2 shadow-2xs outline-none focus-visible:ring-2 focus-visible:ring-zx-accent ${
        selected ? "border-brand-primary ring-1 ring-brand-primary" : "border-border"
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Checkbox
          checked={selected}
          disabled={disabled}
          onCheckedChange={() => onToggleSelect(doc.id, true)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Pilih ${doc.originalName}`}
          className="shrink-0"
        />
        <GripVertical className="size-3 shrink-0 text-muted-foreground/60" />
        <span className="min-w-0 flex-1 truncate text-body-xs font-medium text-foreground" title={doc.originalName}>
          {doc.originalName}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatBytes(doc.size)}</span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
          onClick={onPreview}
          disabled={disabled}
          aria-label={`Pratinjau ${doc.originalName}`}
        >
          <Eye className="size-3.5" />
        </Button>
      </div>

      <Input
        value={doc.title}
        disabled={disabled || doc.status === "hashing"}
        placeholder="Judul dokumen"
        onChange={(e) => onMetaChange(doc.id, { title: e.target.value })}
        className="h-8 rounded-md text-body-sm"
        aria-label="Judul dokumen"
      />

      <div className="flex items-center gap-1.5">
        <Select
          value={doc.subcategory ?? ""}
          disabled={disabled || doc.status === "hashing"}
          onValueChange={(v) => onMetaChange(doc.id, { subcategory: v as CourseMaterialSubcategory })}
        >
          <SelectTrigger className="h-8 min-w-0 flex-1 rounded-md text-body-sm">
            <SelectValue placeholder="Sub-kategori" />
          </SelectTrigger>
          <SelectContent>
            {subcategories.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-body-sm">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showYear && (
          <Input
            type="number"
            min={1900}
            max={2100}
            value={doc.year ?? ""}
            disabled={disabled || doc.status === "hashing"}
            placeholder="Tahun"
            onChange={(e) => {
              const raw = e.target.value;
              onMetaChange(doc.id, { year: raw ? Number(raw) : null });
            }}
            className="h-8 w-20 shrink-0 rounded-md text-body-sm"
            aria-label="Tahun"
          />
        )}
      </div>

      {hasDuplicateFlag && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {inBatchDuplicate && (
              <Badge className="rounded-md bg-status-error/15 text-status-error border border-status-error/30 text-[10px]">
                Duplikat dalam batch
              </Badge>
            )}
            {doc.duplicateOf && (
              <Badge className="rounded-md bg-status-warning/15 text-foreground border border-status-warning/40 text-[10px]" title={doc.duplicateOf.title}>
                Duplikat: {doc.duplicateOf.title}
              </Badge>
            )}
          </div>
          <Select
            value={doc.duplicateAction}
            disabled={disabled}
            onValueChange={(v) => onDuplicateAction(v as DuplicateAction)}
          >
            <SelectTrigger className="h-8 w-full rounded-md text-body-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DUPLICATE_ACTION_LABELS) as DuplicateAction[]).map((action) => (
                <SelectItem key={action} value={action} className="text-body-sm">
                  {DUPLICATE_ACTION_LABELS[action]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] text-muted-foreground" title={doc.generatedName}>
          {doc.generatedName}
        </p>
        {doc.status === "hashing" && (
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="size-2.5 animate-spin" /> Menghitung checksum
          </p>
        )}
        {doc.status === "uploading" && (
          <div className="space-y-0.5">
            <div className="h-1 w-full overflow-hidden rounded-sm bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${doc.uploadProgress}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground">{doc.uploadProgress}%</p>
          </div>
        )}
        {doc.status === "completed" && (
          <p className="flex items-center gap-1 text-[10px] text-status-success">
            <CheckCircle2 className="size-2.5" /> Terunggah
          </p>
        )}
        {doc.status === "error" && (
          <p className="flex items-center gap-1 text-[10px] text-status-error">
            <AlertTriangle className="size-2.5" /> {doc.errorMessage || "Gagal"}
          </p>
        )}
      </div>
    </div>
  );
}

function BulkActionBar({
  count,
  onMove,
  onApplyYear,
  onApplySubcategory,
  onRemove,
}: {
  count: number;
  onMove: (category: MaterialLevel1Category) => void;
  onApplyYear: (year: string) => void;
  onApplySubcategory: (subcategory: CourseMaterialSubcategory) => void;
  onRemove: () => void;
}) {
  const [moveTarget, setMoveTarget] = useState<MaterialLevel1Category>("materi");
  const [bulkYear, setBulkYear] = useState("");
  const [bulkSubcategory, setBulkSubcategory] = useState<CourseMaterialSubcategory | "">("");

  const allSubcategories = useMemo(() => {
    const seen = new Set<string>();
    return [...getSubcategoriesForLevel1("materi"), ...getSubcategoriesForLevel1("soal")].filter((s) => {
      if (seen.has(s.value)) return false;
      seen.add(s.value);
      return true;
    });
  }, []);

  return (
    <div className="sticky bottom-0 z-10 mt-2 rounded-xl border border-border bg-popover p-2 shadow-lg">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-xs font-semibold text-foreground">{count} dipilih</span>

        <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v as MaterialLevel1Category)}>
          <SelectTrigger className="h-8 w-40 rounded-md text-body-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVEL1_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value} className="text-body-sm">
                Pindah ke {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-md text-body-sm"
          onClick={() => onMove(moveTarget)}
        >
          Terapkan Kategori
        </Button>

        <Input
          type="number"
          min={1900}
          max={2100}
          value={bulkYear}
          placeholder="Tahun massal"
          onChange={(e) => setBulkYear(e.target.value)}
          className="h-8 w-28 rounded-md text-body-sm"
          aria-label="Tahun massal"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-md text-body-sm"
          onClick={() => {
            onApplyYear(bulkYear);
            setBulkYear("");
          }}
        >
          Terapkan Tahun
        </Button>

        <Select
          value={bulkSubcategory}
          onValueChange={(v) => setBulkSubcategory(v as CourseMaterialSubcategory)}
        >
          <SelectTrigger className="h-8 w-44 rounded-md text-body-sm">
            <SelectValue placeholder="Sub-kategori massal" />
          </SelectTrigger>
          <SelectContent>
            {allSubcategories.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-body-sm">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-md text-body-sm"
          disabled={!bulkSubcategory}
          onClick={() => {
            if (bulkSubcategory) onApplySubcategory(bulkSubcategory);
            setBulkSubcategory("");
          }}
        >
          Terapkan Sub-kategori
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto h-8 rounded-md text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
          Hapus dari Antrean
        </Button>
      </div>
    </div>
  );
}

function RenameMatrix({
  docs,
  onRename,
}: {
  docs: StagedBatchDocument[];
  onRename: (id: string, name: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-left text-body-xs">
        <thead className="bg-muted font-semibold text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Nama Asli</th>
            <th className="px-3 py-2">Nama Baru</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {docs.map((doc) => (
            <tr key={doc.id} className="hover:bg-muted/20">
              <td className="max-w-[280px] truncate px-3 py-2 text-muted-foreground" title={doc.originalName}>
                {doc.originalName}
              </td>
              <td className="px-3 py-1.5">
                <Input
                  value={doc.generatedName}
                  disabled={doc.status === "uploading" || doc.status === "completed"}
                  onChange={(e) => onRename(doc.id, e.target.value)}
                  onBlur={(e) => {
                    if (!extensionOf(e.target.value)) onRename(doc.id, e.target.value);
                  }}
                  className="h-7 max-w-md rounded-md font-mono text-body-xs"
                  aria-label={`Nama baru untuk ${doc.originalName}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
