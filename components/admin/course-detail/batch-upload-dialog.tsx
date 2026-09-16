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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Eye,
  FileQuestion,
  FileText,
  FolderOpen,
  GripVertical,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { batchStandardizeDocumentsAction } from "@/app/(admin)/admin/(academic)/courses/actions";
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
  detectChaptersFromFilename,
  detectMetadataFromFilename,
  formatBytes,
  generateFileName,
  standardizeDocumentTitle,
  isHiddenOrSystemFile,
  isSupportedBatchFile,
  type BatchChapterInfo,
  type DuplicateAction,
  type StagedBatchDocument,
} from "@/lib/course-batch-upload";
import {
  hashFileSha256,
  putFileToPresignedUrl,
  runWithConcurrency,
} from "@/lib/batch-client";

type Chapter = BatchChapterInfo;

type IngestEntry = { file: File; path: string };

type SkippedEntry = { name: string; reason: string };

type UploadSummary = {
  created: number;
  updated: number;
  failedUploads: number;
  skippedDuplicates: number;
};

type PreviewState = { url: string; name: string };

type UploadStep = "category" | "chapters";

type ChapterViewMode = "kanban" | "table";

const TIME_RELATED_CATEGORIES: MaterialLevel1Category[] = [
  "soal",
  "pembahasan_soal",
];

const DUPLICATE_ACTION_LABELS: Record<DuplicateAction, string> = {
  skip: "Lewati",
  overwrite: "Timpa dokumen lama",
  keep: "Unggah sebagai versi baru",
};

const CATEGORY_THEME: Record<
  MaterialLevel1Category,
  {
    borderTop: string;
    border: string;
    bg: string;
    badgeBg: string;
    text: string;
    icon: typeof BookOpen;
  }
> = {
  materi: {
    borderTop: "border-t-sky-500",
    border: "border-sky-500/25",
    bg: "bg-sky-500/[0.03]",
    badgeBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
    text: "text-sky-600 dark:text-sky-400",
    icon: BookOpen,
  },
  soal: {
    borderTop: "border-t-amber-500",
    border: "border-amber-500/25",
    bg: "bg-amber-500/[0.03]",
    badgeBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
    icon: FileQuestion,
  },
  pembahasan_soal: {
    borderTop: "border-t-emerald-500",
    border: "border-emerald-500/25",
    bg: "bg-emerald-500/[0.03]",
    badgeBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2,
  },
};

function getSubcategoryBadgeClass(subcategory?: string | null): string {
  if (!subcategory) return "bg-muted text-muted-foreground border-border";
  switch (subcategory) {
    case "uts":
    case "uas":
      return "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 font-semibold";
    case "kuis":
    case "kbf":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold";
    case "tutorial":
    case "modul":
      return "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30 font-semibold";
    case "materi_dosen":
    case "scl":
    case "ebook":
      return "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 font-semibold";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

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

  const [step, setStep] = useState<UploadStep>("category");
  const [viewMode, setViewMode] = useState<ChapterViewMode>("kanban");
  const [docs, setDocs] = useState<StagedBatchDocument[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [skippedLog, setSkippedLog] = useState<SkippedEntry[]>([]);
  const [showSkipped, setShowSkipped] = useState(false);
  const [ingestPhase, setIngestPhase] = useState<"idle" | "hashing" | "checking">("idle");
  const [dragActive, setDragActive] = useState(false);
  const [categoryDragOver, setCategoryDragOver] = useState<MaterialLevel1Category | null>(null);
  const [chapterDragOver, setChapterDragOver] = useState<string | null>(null);
  const [uploadRunning, setUploadRunning] = useState(false);
  const [isBatchFormattingAi, setIsBatchFormattingAi] = useState(false);
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

  const sortedChapters = useMemo(
    () => [...chapters].sort((a, b) => a.orderIndex - b.orderIndex),
    [chapters]
  );

  const chapterMap = useMemo(() => {
    const map = new Map<string, Chapter>();
    for (const ch of chapters) map.set(ch.id, ch);
    return map;
  }, [chapters]);

  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const resetAll = useCallback(() => {
    setStep("category");
    setViewMode("kanban");
    setDocs([]);
    setSelection(new Set());
    setSkippedLog([]);
    setShowSkipped(false);
    setIngestPhase("idle");
    setDragActive(false);
    setCategoryDragOver(null);
    setChapterDragOver(null);
    setUploadRunning(false);
    setIsBatchFormattingAi(false);
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
      const meta = detectMetadataFromFilename(file.name, sortedChapters);
      const primaryChap = meta.chapterIds.length === 1
        ? sortedChapters.find((c) => c.id === meta.chapterIds[0])
        : null;

      let standardTitle = meta.title;
      if (
        meta.category === "materi" &&
        (meta.subcategory === "materi_dosen" || !meta.subcategory) &&
        primaryChap
      ) {
        const cleanChapTitle = primaryChap.title.replace(/^bab\s*\d+\s*[:\.-]?\s*/i, "");
        standardTitle = `Bab ${primaryChap.orderIndex}: ${standardizeDocumentTitle(cleanChapTitle)}`;
      }

      const generatedName = generateFileName({
        courseCode: courseId,
        category: meta.category,
        subcategory: meta.subcategory,
        chapterIndex: primaryChap?.orderIndex ?? meta.primaryChapterIndex,
        year: meta.year,
        title: standardTitle,
      });

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
        category: meta.category,
        subcategory: meta.subcategory,
        year: meta.year,
        title: standardTitle,
        generatedName,
        chapterIds: meta.chapterIds,
      };
    },
    [courseId, sortedChapters]
  );

  const handleBatchFormatAi = useCallback(async () => {
    if (docs.length === 0) return;
    setIsBatchFormattingAi(true);

    try {
      const filesToFormat = docs.map((d) => ({
        id: d.id,
        filename: d.originalName,
      }));

      const results = await batchStandardizeDocumentsAction({
        files: filesToFormat,
        courseId,
        courseTitle,
        chapters: sortedChapters,
      });

      if (results && results.length > 0) {
        const resultsMap = new Map(results.map((r) => [r.id, r]));

        setDocs((prev) =>
          prev.map((d) => {
            const res = resultsMap.get(d.id);
            if (!res) return d;

            const updatedChapterIds =
              res.chapterIds.length > 0 ? res.chapterIds : d.chapterIds;
            const primaryChap =
              updatedChapterIds.length === 1
                ? sortedChapters.find((c) => c.id === updatedChapterIds[0])
                : null;

            const updatedName = generateFileName({
              courseCode: courseId,
              category: res.category,
              subcategory: res.subcategory,
              chapterIndex: primaryChap?.orderIndex ?? res.matchedChapterOrderIndex,
              year: res.year,
              title: res.title,
            });

            return {
              ...d,
              title: res.title,
              category: res.category,
              subcategory: res.subcategory,
              year: res.year,
              chapterIds: updatedChapterIds,
              generatedName: updatedName,
            };
          })
        );

        toast.success(`${results.length} dokumen berhasil dirapikan format dan babnya dengan AI.`);
      }
    } catch (err) {
      console.error("Batch AI format failed:", err);
      toast.error("Gagal merapikan dengan AI. Format standar tetap dipertahankan.");
    } finally {
      setIsBatchFormattingAi(false);
    }
  }, [docs, courseId, courseTitle, sortedChapters]);


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
        chapterIds: string[];
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

          if (patch.subcategory && patch.subcategory !== doc.subcategory) {
            if ((patch.subcategory === "uts" || patch.subcategory === "uas") && next.chapterIds.length === 0) {
              next.chapterIds = detectChaptersFromFilename(next.originalName, sortedChapters, patch.subcategory);
            }
          }

          if (!renamedOverrideRef.current.has(doc.id)) {
            const primaryChap = next.chapterIds.length === 1
              ? sortedChapters.find((c) => c.id === next.chapterIds[0])
              : null;

            next.generatedName = generateFileName({
              courseCode: courseId,
              category: next.category,
              subcategory: next.subcategory,
              chapterIndex: primaryChap?.orderIndex ?? null,
              year: next.year,
              title: next.title,
            });
          }
          return next;
        })
      );
    },
    [courseId, sortedChapters]
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

  const assignDocsToChapter = useCallback(
    (ids: string[], targetChapterId: string, mode: "replace" | "add" = "replace") => {
      setDocs((prev) =>
        prev.map((doc) => {
          if (!ids.includes(doc.id)) return doc;
          let nextChapters: string[];
          if (mode === "add") {
            nextChapters = Array.from(new Set([...doc.chapterIds, targetChapterId]));
          } else {
            nextChapters = [targetChapterId];
          }
          return { ...doc, chapterIds: nextChapters };
        })
      );
      setSelection((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    },
    []
  );

  const toggleDocChapter = useCallback(
    (docId: string, chapterId: string) => {
      setDocs((prev) =>
        prev.map((doc) => {
          if (doc.id !== docId) return doc;
          const has = doc.chapterIds.includes(chapterId);
          const next = has
            ? doc.chapterIds.filter((id) => id !== chapterId)
            : [...doc.chapterIds, chapterId];
          return { ...doc, chapterIds: next };
        })
      );
    },
    []
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

  const selectAll = useCallback(() => {
    setSelection(new Set(docs.map((d) => d.id)));
  }, [docs]);

  const clearSelection = useCallback(() => {
    setSelection(new Set());
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

  const unassignedDocs = useMemo(
    () => docs.filter((d) => d.chapterIds.length === 0),
    [docs]
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
    async (): Promise<{ created: number; updated: number } | null> => {
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
        chapterIds: doc.chapterIds,
      }));

      try {
        const res = await fetch("/api/admin/course-materials/batch/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId,
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

    if (docs.length === 0) {
      toast.error("Tidak ada dokumen untuk diunggah.");
      return;
    }
    if (chapters.length === 0) {
      toast.error("Mata kuliah belum memiliki bab.");
      return;
    }
    if (docs.some((d) => !d.title.trim())) {
      toast.error("Semua dokumen memerlukan judul.");
      return;
    }
    const missingChapters = docs.filter(
      (d) =>
        d.status === "ready" &&
        !(d.duplicateOf && d.duplicateAction === "skip") &&
        d.chapterIds.length === 0
    );
    if (missingChapters.length > 0) {
      toast.error(
        `${missingChapters.length} dokumen belum dikaitkan ke bab manapun. Atur bab terlebih dahulu.`
      );
      setStep("chapters");
      return;
    }
    if (!uploadableDocs.length) {
      toast.error("Tidak ada dokumen siap unggah.");
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

      const result = await commitCompletedUploads();
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
    chapters.length,
    docs,
    ingestPhase,
    router,
    updateDoc,
    uploadRunning,
    uploadableDocs,
  ]);

  const retryCommit = useCallback(async () => {
    if (!completedUploadsRef.current.length) return;
    setCommitError(null);
    setUploadRunning(true);
    try {
      const result = await commitCompletedUploads();
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
  }, [commitCompletedUploads, docs, router]);

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

  const bulkSetChapters = useCallback(
    (targetChapterIds: string[]) => {
      const ids = Array.from(selectionRef.current);
      setDocs((prev) =>
        prev.map((doc) =>
          ids.includes(doc.id) ? { ...doc, chapterIds: [...targetChapterIds] } : doc
        )
      );
      toast.success(`${ids.length} dokumen diperbarui babnya.`);
    },
    []
  );

  const bulkAddChapter = useCallback(
    (chapterId: string) => {
      const ids = Array.from(selectionRef.current);
      setDocs((prev) =>
        prev.map((doc) => {
          if (!ids.includes(doc.id)) return doc;
          return {
            ...doc,
            chapterIds: Array.from(new Set([...doc.chapterIds, chapterId])),
          };
        })
      );
      toast.success(`Bab ditambahkan ke ${ids.length} dokumen.`);
    },
    []
  );

  const bulkRemoveChapter = useCallback(
    (chapterId: string) => {
      const ids = Array.from(selectionRef.current);
      setDocs((prev) =>
        prev.map((doc) => {
          if (!ids.includes(doc.id)) return doc;
          return {
            ...doc,
            chapterIds: doc.chapterIds.filter((cid) => cid !== chapterId),
          };
        })
      );
      toast.success(`Bab dilepas dari ${ids.length} dokumen.`);
    },
    []
  );

  const hashingCount = docs.filter((d) => d.status === "hashing").length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-6 bg-background/95 backdrop-blur-sm border-border/80 shadow-2xl">
        <DialogHeader className="shrink-0 space-y-2 border-b border-border/60 pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-0.5">
              <DialogTitle className="text-h5 font-heading font-bold text-foreground">
                Unggah Batch Dokumen
              </DialogTitle>
              <DialogDescription className="text-body-xs text-muted-foreground">
                {step === "category"
                  ? `Atur kategori (Materi, Soal, Pembahasan) dan tahun untuk ${courseTitle}.`
                  : `Kaitkan setiap dokumen ke bab spesifik atau multi-bab untuk tipe ujian (UTS/UAS).`}
              </DialogDescription>
            </div>

            {/* Stepper Tabs */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => setStep("category")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-body-sm font-semibold transition-all cursor-pointer ${
                  step === "category"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Layers className="size-3.5" />
                1. Kategori & Metadata
              </button>
              <button
                type="button"
                onClick={() => setStep("chapters")}
                disabled={docs.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-body-sm font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  step === "chapters"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <BookOpen className="size-3.5" />
                2. Distribusi Bab
                {unassignedDocs.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-md bg-status-warning/20 text-status-warning border border-status-warning/40">
                    {unassignedDocs.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0 pt-2">
          {step === "category" ? (
            <>
              {/* Dropzone with enhanced contrast */}
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
                className={`relative overflow-hidden flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
                  dragActive
                    ? "border-brand-primary bg-brand-primary/10 ring-2 ring-brand-primary/30"
                    : "border-border/80 bg-muted/20 hover:bg-muted/40 hover:border-brand-primary/50"
                }`}
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Upload className="size-5" />
                </div>
                <div>
                  <p className="text-body-sm font-semibold text-foreground">
                    Tarik berkas atau folder PDF ke sini
                  </p>
                  <p className="text-body-xs text-muted-foreground mt-0.5">
                    Maksimal ${BATCH_MAX_FILES} dokumen, 50 MB per berkas. Kategori & tahun terdeteksi otomatis.
                  </p>
                </div>
                <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-body-sm bg-card hover:bg-muted/60"
                    onClick={() => filesInputRef.current?.click()}
                  >
                    <FileText className="size-3.5 mr-1" />
                    Pilih Berkas
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-body-sm bg-card hover:bg-muted/60"
                    onClick={() => folderInputRef.current?.click()}
                  >
                    <FolderOpen className="size-3.5 mr-1" />
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
                <div className="flex items-center gap-2 text-body-xs font-medium text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-3 py-2 rounded-lg">
                  <Loader2 className="size-3.5 animate-spin shrink-0" />
                  <span>
                    {ingestPhase === "checking" ? "Memeriksa duplikasi di server..." : "Menghitung checksum berkas..."}
                  </span>
                </div>
              )}

              {skippedLog.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-body-xs text-muted-foreground">
                  <button
                    type="button"
                    className="font-semibold text-foreground hover:underline cursor-pointer"
                    onClick={() => setShowSkipped((v) => !v)}
                  >
                    {skippedLog.length} berkas dilewati (klik untuk melihat)
                  </button>
                  {showSkipped && (
                    <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-muted-foreground">
                      {skippedLog.map((s, i) => (
                        <li key={`${s.name}-${i}`}>
                          <span className="text-foreground font-medium">{s.name}</span>: {s.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Standard Naming Guide Banner */}
              <div className="flex items-center gap-2 rounded-xl border border-status-warning/30 bg-status-warning/10 px-3.5 py-2.5 text-body-xs text-foreground">
                <AlertCircle className="size-4 text-status-warning shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-status-warning">Format Standar Zyx:</span>{" "}
                  <code className="font-mono text-[11px] bg-background/80 px-1.5 py-0.5 rounded border border-status-warning/30 text-foreground">
                    {courseId.toLowerCase()}_[bab]_[kategori]_[topik]_[role]_[tahun].pdf
                  </code>
                  <span className="text-muted-foreground ml-1.5">
                    Nama target disusun otomatis saat Anda memilih kategori, bab, dan judul topik.
                  </span>
                </div>
              </div>

              {docs.length > 0 && (
                <>
                  {/* Category Step Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="rounded-md text-body-xs font-semibold bg-muted/60 border border-border text-foreground">
                        {docs.length} dokumen ({formatBytes(totalBytes)})
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 rounded-lg text-body-sm font-medium gap-1.5 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10"
                        disabled={isBatchFormattingAi || uploadRunning || docs.length === 0}
                        onClick={() => void handleBatchFormatAi()}
                        title="Rapikan display name dan petakan bab seluruh dokumen dengan Gemini AI"
                      >
                        {isBatchFormattingAi ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="size-3.5" />
                        )}
                        <span>{isBatchFormattingAi ? "Merapikan AI..." : "Rapikan dengan AI"}</span>
                      </Button>
                      {selection.size > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg text-body-sm text-muted-foreground hover:text-foreground"
                          onClick={clearSelection}
                        >
                          Bersihkan Seleksi ({selection.size})
                        </Button>
                      )}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      className="h-9 px-4 rounded-lg text-body-sm font-semibold shadow-xs"
                      disabled={uploadRunning || ingestPhase !== "idle" || chapters.length === 0}
                      onClick={() => setStep("chapters")}
                    >
                      Lanjut ke Distribusi Bab ({docs.length})
                      <ArrowRight className="size-4 ml-1.5" />
                    </Button>
                  </div>

                  {/* Category Kanban Columns */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {LEVEL1_CATEGORIES.map((col) => {
                      const theme = CATEGORY_THEME[col.value];
                      const Icon = theme.icon;
                      const columnDocs = docs.filter((d) => d.category === col.value);
                      const isOver = categoryDragOver === col.value;

                      return (
                        <div
                          key={col.value}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setCategoryDragOver(col.value);
                          }}
                          onDragLeave={() => setCategoryDragOver((c) => (c === col.value ? null : c))}
                          onDrop={(e) => {
                            e.preventDefault();
                            setCategoryDragOver(null);
                            const ids = draggingIdsRef.current;
                            if (ids.length) moveDocsToCategory(ids, col.value);
                            draggingIdsRef.current = [];
                          }}
                          className={`rounded-xl border ${theme.border} ${theme.borderTop} border-t-4 ${theme.bg} p-2.5 min-h-56 transition-all ${
                            isOver ? "ring-2 ring-brand-primary/50 bg-brand-primary/10" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between px-1 pb-2.5 mb-2 border-b border-border/40">
                            <div className="flex items-center gap-1.5">
                              <div className={`flex size-6 items-center justify-center rounded-md ${theme.badgeBg}`}>
                                <Icon className="size-3.5" />
                              </div>
                              <span className={`font-heading text-body-sm font-bold ${theme.text}`}>
                                {col.label}
                              </span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${theme.badgeBg}`}>
                              {columnDocs.length}
                            </span>
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
                              <div className="rounded-lg border border-dashed border-border/60 p-5 text-center text-body-xs text-muted-foreground/80 bg-background/30">
                                Tarik dokumen ke kategori {col.label}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* STEP 2: DISTRIBUSI BAB */}
              <div className="space-y-3">
                {/* Step 2 Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-body-sm bg-card"
                      onClick={() => setStep("category")}
                    >
                      <ArrowLeft className="size-3.5 mr-1" />
                      Kembali ke Kategori
                    </Button>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-body-xs font-semibold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                      <Layers className="size-3 shrink-0" />
                      {docs.length - unassignedDocs.length}/{docs.length} dokumen terkait bab
                    </span>
                    {selection.size < docs.length ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg text-body-sm"
                        onClick={selectAll}
                      >
                        Pilih Semua ({docs.length})
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg text-body-sm"
                        onClick={clearSelection}
                      >
                        Bersihkan Seleksi ({selection.size})
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 rounded-lg text-body-sm font-medium gap-1.5 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10"
                      disabled={isBatchFormattingAi || uploadRunning || docs.length === 0}
                      onClick={() => void handleBatchFormatAi()}
                      title="Rapikan display name dan petakan bab seluruh dokumen dengan Gemini AI"
                    >
                      {isBatchFormattingAi ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      <span>{isBatchFormattingAi ? "Merapikan AI..." : "Rapikan dengan AI"}</span>
                    </Button>
                    <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`h-7 px-2.5 rounded-md text-body-sm font-medium transition-all ${
                          viewMode === "kanban" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground"
                        }`}
                        onClick={() => setViewMode("kanban")}
                      >
                        <LayoutGrid className="size-3 mr-1" />
                        Papan Kanban
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`h-7 px-2.5 rounded-md text-body-sm font-medium transition-all ${
                          viewMode === "table" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground"
                        }`}
                        onClick={() => setViewMode("table")}
                      >
                        <List className="size-3 mr-1" />
                        Tabel Matriks
                      </Button>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      className="h-9 px-4 rounded-lg text-body-sm font-semibold shadow-xs"
                      disabled={
                        uploadRunning ||
                        ingestPhase !== "idle" ||
                        !uploadableDocs.length ||
                        chapters.length === 0 ||
                        unassignedDocs.length > 0
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
                </div>

                {/* Warning banner for unassigned docs */}
                {unassignedDocs.length > 0 && (
                  <div className="flex items-center justify-between flex-wrap gap-2 rounded-xl border border-status-warning/40 bg-status-warning/10 px-3.5 py-2.5 text-body-xs">
                    <div className="flex items-center gap-2 text-foreground">
                      <AlertTriangle className="size-4 shrink-0 text-status-warning" />
                      <span>
                        Terdapat <strong>{unassignedDocs.length} dokumen</strong> yang belum dikaitkan dengan bab.
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-body-sm bg-card hover:bg-muted font-medium"
                      onClick={() => {
                        const allChapterIds = chapters.map((c) => c.id);
                        setDocs((prev) =>
                          prev.map((d) =>
                            d.chapterIds.length === 0 ? { ...d, chapterIds: allChapterIds } : d
                          )
                        );
                        toast.success("Dokumen tanpa bab telah dikaitkan ke semua bab.");
                      }}
                    >
                      Kaitkan Semua yang Belum ke Semua Bab
                    </Button>
                  </div>
                )}

                {uploadRunning && (
                  <div className="space-y-1 bg-card border border-border p-3 rounded-xl">
                    <div className="h-2 w-full overflow-hidden rounded-md bg-muted">
                      <div
                        className="h-full bg-primary transition-all duration-200"
                        style={{ width: `${overallProgress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-body-xs text-muted-foreground font-medium">
                      <span>Mengunggah dokumen ke penyimpanan...</span>
                      <span>{overallProgress}%</span>
                    </div>
                  </div>
                )}

                {commitError && (
                  <div className="rounded-xl border border-status-error/40 bg-status-error/10 p-3 space-y-2">
                    <div className="flex items-start gap-2 text-body-xs text-foreground font-medium">
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
                  <div className="rounded-xl border border-status-success/40 bg-status-success/10 p-3">
                    <div className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
                      <CheckCircle2 className="size-4 text-status-success" />
                      Unggahan Selesai
                    </div>
                    <p className="mt-1 text-body-xs text-muted-foreground">
                      {summary.created} dokumen baru disimpan, {summary.updated} ditimpa.
                      {summary.skippedDuplicates > 0 && ` ${summary.skippedDuplicates} duplikat dilewati.`}
                      {summary.failedUploads > 0 && ` ${summary.failedUploads} unggahan gagal.`}
                    </p>
                  </div>
                )}

                {viewMode === "kanban" ? (
                  <div className="flex gap-3 overflow-x-auto pb-4 pt-1">
                    {/* Unassigned column if any */}
                    {unassignedDocs.length > 0 && (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setChapterDragOver("__unassigned__");
                        }}
                        onDragLeave={() => setChapterDragOver((c) => (c === "__unassigned__" ? null : c))}
                        onDrop={(e) => {
                          e.preventDefault();
                          setChapterDragOver(null);
                          const ids = draggingIdsRef.current;
                          if (ids.length) {
                            setDocs((prev) =>
                              prev.map((d) => (ids.includes(d.id) ? { ...d, chapterIds: [] } : d))
                            );
                          }
                          draggingIdsRef.current = [];
                        }}
                        className={`w-76 shrink-0 rounded-xl border border-amber-500/40 border-t-4 border-t-amber-500 bg-amber-500/[0.04] p-2.5 transition-all ${
                          chapterDragOver === "__unassigned__" ? "ring-2 ring-status-warning bg-amber-500/10" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between px-1 pb-2 border-b border-amber-500/30 mb-2.5">
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="size-3.5 text-status-warning" />
                            <span className="font-heading text-body-sm font-bold text-status-warning">
                              Belum Terkait Bab
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30">
                            {unassignedDocs.length}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {unassignedDocs.map((doc) => (
                            <ChapterKanbanCard
                              key={doc.id}
                              doc={doc}
                              chapters={sortedChapters}
                              chapterMap={chapterMap}
                              selected={selection.has(doc.id)}
                              disabled={uploadRunning}
                              onToggleSelect={toggleSelection}
                              onToggleChapter={toggleDocChapter}
                              onSetChapters={(cids) => applyMetadataChange(doc.id, { chapterIds: cids })}
                              onPreview={() => openPreview(doc)}
                              onRemove={() => removeDocs([doc.id])}
                              onDragStartCard={(id) => {
                                draggingIdsRef.current = selectionRef.current.has(id)
                                  ? Array.from(selectionRef.current)
                                  : [id];
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Chapter Columns */}
                    {sortedChapters.map((ch) => {
                      const chapterDocs = docs.filter((d) => d.chapterIds.includes(ch.id));
                      const isOver = chapterDragOver === ch.id;

                      return (
                        <div
                          key={ch.id}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setChapterDragOver(ch.id);
                          }}
                          onDragLeave={() => setChapterDragOver((c) => (c === ch.id ? null : c))}
                          onDrop={(e) => {
                            e.preventDefault();
                            setChapterDragOver(null);
                            const ids = draggingIdsRef.current;
                            if (ids.length) {
                              assignDocsToChapter(ids, ch.id, "add");
                            }
                            draggingIdsRef.current = [];
                          }}
                          className={`w-76 shrink-0 rounded-xl border border-border/80 border-t-4 border-t-brand-primary/80 bg-card/60 p-2.5 min-h-64 transition-all ${
                            isOver ? "border-brand-primary bg-brand-primary/10 ring-2 ring-brand-primary/40" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between px-1 pb-2 border-b border-border/60 mb-2.5">
                            <div className="min-w-0 pr-1 flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-brand-primary/15 text-brand-primary border border-brand-primary/30 shrink-0">
                                B{ch.orderIndex}
                              </span>
                              <span className="font-heading text-body-sm font-bold text-foreground truncate" title={`Bab ${ch.orderIndex}: ${ch.title}`}>
                                {ch.title}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted/60 text-muted-foreground border border-border shrink-0">
                              {chapterDocs.length}
                            </span>
                          </div>

                          <div className="space-y-2">
                            {chapterDocs.map((doc) => (
                              <ChapterKanbanCard
                                key={`${ch.id}-${doc.id}`}
                                doc={doc}
                                currentColumnChapterId={ch.id}
                                chapters={sortedChapters}
                                chapterMap={chapterMap}
                                selected={selection.has(doc.id)}
                                disabled={uploadRunning}
                                onToggleSelect={toggleSelection}
                                onToggleChapter={toggleDocChapter}
                                onSetChapters={(cids) => applyMetadataChange(doc.id, { chapterIds: cids })}
                                onPreview={() => openPreview(doc)}
                                onRemove={() => removeDocs([doc.id])}
                                onDragStartCard={(id) => {
                                  draggingIdsRef.current = selectionRef.current.has(id)
                                    ? Array.from(selectionRef.current)
                                    : [id];
                                }}
                              />
                            ))}

                            {chapterDocs.length === 0 && (
                              <div className="rounded-lg border border-dashed border-border/60 p-5 text-center text-body-xs text-muted-foreground/70 bg-background/20">
                                Tarik berkas ke Bab {ch.orderIndex}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <ChapterTableView
                    docs={docs}
                    chapters={sortedChapters}
                    selection={selection}
                    disabled={uploadRunning}
                    onToggleSelect={toggleSelection}
                    onToggleChapter={toggleDocChapter}
                    onPreview={openPreview}
                    onRemove={(id) => removeDocs([id])}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* BOTTOM FLOATING BULK ACTION BARS */}
        {selection.size > 0 && !uploadRunning && (
          step === "category" ? (
            <BulkActionBar
              count={selection.size}
              onMove={(cat) => moveDocsToCategory(Array.from(selectionRef.current), cat)}
              onApplyYear={bulkApplyYear}
              onApplySubcategory={bulkApplySubcategory}
              onRemove={() => removeDocs(Array.from(selectionRef.current))}
            />
          ) : (
            <ChapterBulkActionBar
              count={selection.size}
              chapters={sortedChapters}
              onAddChapter={bulkAddChapter}
              onSetChapters={bulkSetChapters}
              onRemoveChapter={bulkRemoveChapter}
              onRemove={() => removeDocs(Array.from(selectionRef.current))}
            />
          )
        )}

        <Dialog
          open={Boolean(preview)}
          onOpenChange={(next) => {
            if (!next && preview) {
              URL.revokeObjectURL(preview.url);
              setPreview(null);
            }
          }}
        >
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
      chapterIds: string[];
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
  const subcatBadgeClass = getSubcategoryBadgeClass(doc.subcategory);

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
      className={`space-y-2 rounded-xl border bg-card p-2.5 shadow-2xs outline-none transition-all focus-visible:ring-2 focus-visible:ring-zx-accent ${
        selected
          ? "border-brand-primary ring-2 ring-brand-primary/40 bg-brand-primary/[0.04]"
          : "border-border/80 hover:border-border hover:shadow-xs"
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
        <GripVertical className="size-3 shrink-0 text-muted-foreground/60 cursor-grab" />
        <span
          className="min-w-0 flex-1 truncate font-mono text-body-xs font-semibold text-foreground"
          title={`Target: ${doc.generatedName}\nBerkas asli: ${doc.originalName}`}
        >
          {doc.generatedName}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground font-medium">{formatBytes(doc.size)}</span>
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

      <div className="space-y-1">
        <Input
          value={doc.title}
          disabled={disabled || doc.status === "hashing"}
          placeholder="Judul topik materi"
          onChange={(e) => onMetaChange(doc.id, { title: e.target.value })}
          className="h-8 rounded-lg text-body-sm bg-background border-border/80 font-medium"
          aria-label="Judul dokumen"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Select
          value={doc.subcategory ?? ""}
          disabled={disabled || doc.status === "hashing"}
          onValueChange={(v) => onMetaChange(doc.id, { subcategory: v as CourseMaterialSubcategory })}
        >
          <SelectTrigger className="h-8 min-w-0 flex-1 rounded-lg text-body-sm bg-background border-border/80">
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
            className="h-8 w-20 shrink-0 rounded-lg text-body-sm bg-background border-border/80 text-center font-medium"
            aria-label="Tahun"
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-1.5 text-[10px] text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1">
          {doc.subcategory && (
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] border ${subcatBadgeClass}`}>
              {doc.subcategory.toUpperCase()}
            </span>
          )}
          {doc.year && (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-muted/60 text-muted-foreground border border-border">
              {doc.year}
            </span>
          )}
        </div>
        <span className="truncate max-w-[130px]" title={doc.originalName}>
          Asli: {doc.originalName}
        </span>
      </div>

      {hasDuplicateFlag && (
        <div className="space-y-1 bg-muted/30 p-1.5 rounded-lg border border-border/60">
          <div className="flex items-center gap-1.5 flex-wrap">
            {inBatchDuplicate && (
              <span className="px-1.5 py-0.5 rounded-md bg-status-error/15 text-status-error border border-status-error/30 text-[10px] font-bold">
                Duplikat dalam batch
              </span>
            )}
            {doc.duplicateOf && (
              <span className="px-1.5 py-0.5 rounded-md bg-status-warning/15 text-foreground border border-status-warning/40 text-[10px]" title={doc.duplicateOf.title}>
                Duplikat: {doc.duplicateOf.title}
              </span>
            )}
          </div>
          <Select
            value={doc.duplicateAction}
            disabled={disabled}
            onValueChange={(v) => onDuplicateAction(v as DuplicateAction)}
          >
            <SelectTrigger className="h-7 w-full rounded-md text-body-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DUPLICATE_ACTION_LABELS) as DuplicateAction[]).map((action) => (
                <SelectItem key={action} value={action} className="text-body-xs">
                  {DUPLICATE_ACTION_LABELS[action]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="min-w-0 pt-0.5">
        <p className="truncate font-mono text-[10px] text-muted-foreground" title={doc.generatedName}>
          {doc.generatedName}
        </p>
        {doc.status === "hashing" && (
          <p className="flex items-center gap-1 text-[10px] text-brand-primary font-medium">
            <Loader2 className="size-2.5 animate-spin" /> Menghitung checksum...
          </p>
        )}
        {doc.status === "uploading" && (
          <div className="space-y-0.5">
            <div className="h-1 w-full overflow-hidden rounded-sm bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${doc.uploadProgress}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">{doc.uploadProgress}%</p>
          </div>
        )}
        {doc.status === "completed" && (
          <p className="flex items-center gap-1 text-[10px] text-status-success font-semibold">
            <CheckCircle2 className="size-2.5" /> Terunggah
          </p>
        )}
        {doc.status === "error" && (
          <p className="flex items-center gap-1 text-[10px] text-status-error font-medium">
            <AlertTriangle className="size-2.5" /> {doc.errorMessage || "Gagal"}
          </p>
        )}
      </div>
    </div>
  );
}

function ChapterKanbanCard({
  doc,
  currentColumnChapterId,
  chapters,
  chapterMap,
  selected,
  disabled,
  onToggleSelect,
  onToggleChapter,
  onSetChapters,
  onPreview,
  onRemove,
  onDragStartCard,
}: {
  doc: StagedBatchDocument;
  currentColumnChapterId?: string;
  chapters: Chapter[];
  chapterMap: Map<string, Chapter>;
  selected: boolean;
  disabled: boolean;
  onToggleSelect: (id: string, additive: boolean) => void;
  onToggleChapter: (docId: string, chapterId: string) => void;
  onSetChapters: (chapterIds: string[]) => void;
  onPreview: () => void;
  onRemove: () => void;
  onDragStartCard: (id: string) => void;
}) {
  const isMultiChapter = doc.chapterIds.length > 1;
  const isExamType = doc.subcategory === "uts" || doc.subcategory === "uas";
  const catTheme = CATEGORY_THEME[doc.category];
  const subcatBadgeClass = getSubcategoryBadgeClass(doc.subcategory);

  const utsChapters = useMemo(() => {
    const midpoint = Math.max(1, Math.ceil(chapters.length / 2));
    return chapters.slice(0, midpoint).map((c) => c.id);
  }, [chapters]);

  return (
    <div
      tabIndex={0}
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        window.getSelection()?.removeAllRanges();
        onDragStartCard(doc.id);
      }}
      className={`space-y-2 rounded-xl border bg-card p-2.5 shadow-2xs outline-none transition-all focus-visible:ring-2 focus-visible:ring-zx-accent ${
        selected
          ? "border-brand-primary ring-2 ring-brand-primary/40 bg-brand-primary/[0.04]"
          : "border-border/80 hover:border-border hover:shadow-xs"
      }`}
    >
      <div className="flex items-start gap-1.5 min-w-0">
        <Checkbox
          checked={selected}
          disabled={disabled}
          onCheckedChange={() => onToggleSelect(doc.id, true)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Pilih ${doc.generatedName}`}
          className="shrink-0 mt-0.5"
        />
        <GripVertical className="size-3 shrink-0 text-muted-foreground/60 mt-0.5 cursor-grab" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-body-xs font-semibold text-foreground" title={doc.generatedName}>
            {doc.generatedName}
          </p>
          {doc.title && (
            <p className="truncate text-[10px] text-muted-foreground" title={doc.title}>
              {doc.title}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border capitalize ${catTheme.badgeBg}`}>
              {doc.category.replace("_", " ")}
            </span>
            {doc.subcategory && (
              <span className={`px-1.5 py-0.2 rounded text-[10px] border ${subcatBadgeClass}`}>
                {doc.subcategory.toUpperCase()}
              </span>
            )}
            {doc.year && (
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-muted/60 text-muted-foreground border border-border">
                {doc.year}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6 rounded-md text-muted-foreground hover:text-foreground"
            onClick={onPreview}
            disabled={disabled}
            aria-label="Pratinjau berkas"
          >
            <Eye className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6 rounded-md text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Hapus dokumen dari antrean"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Chapters linked badges and Multi-Bab Popover */}
      <div className="space-y-1.5 pt-1 border-t border-border/50">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            {isMultiChapter && (
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                Multi-Bab ({doc.chapterIds.length})
              </span>
            )}
            {isExamType && !isMultiChapter && (
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-status-error/10 text-status-error border border-status-error/20">
                Ujian Single Bab
              </span>
            )}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 rounded-lg text-body-xs font-medium border-brand-primary/40 text-brand-primary hover:bg-brand-primary/10"
                disabled={disabled}
              >
                <Plus className="size-3 mr-0.5" />
                Atur Bab
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2.5 space-y-2 bg-popover border-border shadow-xl">
              <div className="flex items-center justify-between pb-1.5 border-b border-border text-body-xs font-bold">
                <span>Kaitkan ke Bab</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  {doc.chapterIds.length} bab aktif
                </span>
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto">
                {chapters.map((ch) => {
                  const isChecked = doc.chapterIds.includes(ch.id);
                  return (
                    <label
                      key={ch.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-body-xs font-medium cursor-pointer select-none transition-colors ${
                        isChecked
                          ? "bg-brand-primary/15 text-foreground border border-brand-primary/30"
                          : "hover:bg-muted/50 text-muted-foreground border border-transparent"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => onToggleChapter(doc.id, ch.id)}
                      />
                      <span className="truncate">
                        Bab {ch.orderIndex}: {ch.title}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-1 pt-1.5 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-body-xs px-1.5 rounded-md justify-center font-medium hover:bg-muted"
                  onClick={() => onSetChapters(chapters.map((c) => c.id))}
                >
                  Semua Bab
                </Button>
                {chapters.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-body-xs px-1.5 rounded-md justify-center font-medium hover:bg-muted"
                    onClick={() => onSetChapters(utsChapters)}
                  >
                    Bab 1 s.d. UTS
                  </Button>
                )}
                {currentColumnChapterId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-body-xs px-1.5 rounded-md justify-center font-medium hover:bg-muted"
                    onClick={() => onSetChapters([currentColumnChapterId])}
                  >
                    Hanya Bab Ini
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-body-xs px-1.5 rounded-md justify-center font-medium text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onSetChapters([])}
                >
                  Kosongkan
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Render chips of linked chapters with enhanced contrast */}
        <div className="flex flex-wrap gap-1">
          {doc.chapterIds.map((cid) => {
            const ch = chapterMap.get(cid);
            if (!ch) return null;
            return (
              <span
                key={cid}
                className="inline-flex items-center gap-1 rounded-md border border-brand-primary/40 bg-brand-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
              >
                <span className="truncate max-w-[120px]">Bab {ch.orderIndex}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onToggleChapter(doc.id, cid)}
                    className="text-muted-foreground hover:text-foreground cursor-pointer rounded-xs"
                    aria-label={`Lepas bab ${ch.orderIndex}`}
                  >
                    <X className="size-2.5" />
                  </button>
                )}
              </span>
            );
          })}
          {doc.chapterIds.length === 0 && (
            <span className="text-[10px] font-semibold text-status-warning flex items-center gap-1">
              <AlertTriangle className="size-2.5 shrink-0" /> Belum dikaitkan
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ChapterTableView({
  docs,
  chapters,
  selection,
  disabled,
  onToggleSelect,
  onToggleChapter,
  onPreview,
  onRemove,
}: {
  docs: StagedBatchDocument[];
  chapters: Chapter[];
  selection: Set<string>;
  disabled: boolean;
  onToggleSelect: (id: string, additive: boolean) => void;
  onToggleChapter: (docId: string, chapterId: string) => void;
  onPreview: (doc: StagedBatchDocument) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
      <table className="w-full text-left text-body-xs">
        <thead className="bg-muted/80 font-bold text-foreground border-b border-border">
          <tr>
            <th className="w-8 px-3.5 py-2.5">
              <Checkbox
                checked={docs.length > 0 && selection.size === docs.length}
                onCheckedChange={() => {
                  if (selection.size === docs.length) {
                    for (const d of docs) onToggleSelect(d.id, true);
                  } else {
                    for (const d of docs) {
                      if (!selection.has(d.id)) onToggleSelect(d.id, true);
                    }
                  }
                }}
                aria-label="Pilih semua"
              />
            </th>
            <th className="px-3.5 py-2.5">Nama Dokumen</th>
            <th className="px-3.5 py-2.5">Kategori</th>
            <th className="px-3.5 py-2.5">Terkait Bab</th>
            <th className="w-20 px-3.5 py-2.5 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {docs.map((doc) => {
            const isSelected = selection.has(doc.id);
            const catTheme = CATEGORY_THEME[doc.category];
            const subcatBadgeClass = getSubcategoryBadgeClass(doc.subcategory);

            return (
              <tr
                key={doc.id}
                className={`hover:bg-muted/30 transition-colors ${
                  isSelected ? "bg-brand-primary/[0.06]" : ""
                }`}
              >
                <td className="px-3.5 py-2.5">
                  <Checkbox
                    checked={isSelected}
                    disabled={disabled}
                    onCheckedChange={() => onToggleSelect(doc.id, true)}
                    aria-label={`Pilih ${doc.generatedName}`}
                  />
                </td>
                <td className="px-3.5 py-2.5 max-w-[260px]">
                  <p className="truncate font-mono text-body-xs font-semibold text-foreground" title={doc.generatedName}>
                    {doc.generatedName}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground mt-0.5" title={`Topik: ${doc.title}\nAsli: ${doc.originalName}`}>
                    {doc.title ? `${doc.title} (${doc.originalName})` : doc.originalName}
                  </p>
                </td>
                <td className="px-3.5 py-2.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border capitalize ${catTheme.badgeBg}`}>
                      {doc.category.replace("_", " ")}
                    </span>
                    {doc.subcategory && (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] border uppercase ${subcatBadgeClass}`}>
                        {doc.subcategory}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3.5 py-2.5">
                  <div className="flex items-center gap-1 flex-wrap">
                    {chapters.map((ch) => {
                      const isLinked = doc.chapterIds.includes(ch.id);
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => onToggleChapter(doc.id, ch.id)}
                          className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold transition-all cursor-pointer ${
                            isLinked
                              ? "border-brand-primary bg-primary text-primary-foreground shadow-2xs"
                              : "border-border/80 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                          title={`Bab ${ch.orderIndex}: ${ch.title}`}
                        >
                          Bab {ch.orderIndex}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="px-3.5 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                      onClick={() => onPreview(doc)}
                      aria-label="Pratinjau berkas"
                    >
                      <Eye className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 rounded-md text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => onRemove(doc.id)}
                      aria-label="Hapus dari antrean"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
    <div className="sticky bottom-0 z-10 mt-2 rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-2.5 shadow-xl ring-1 ring-black/5 dark:ring-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2.5 py-1 rounded-md text-body-xs font-bold bg-brand-primary/15 text-brand-primary border border-brand-primary/30">
          {count} dipilih
        </span>

        <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v as MaterialLevel1Category)}>
          <SelectTrigger className="h-8 w-40 rounded-lg text-body-sm bg-background">
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
          className="h-8 rounded-lg text-body-sm bg-background"
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
          className="h-8 w-28 rounded-lg text-body-sm bg-background text-center"
          aria-label="Tahun massal"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg text-body-sm bg-background"
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
          <SelectTrigger className="h-8 w-44 rounded-lg text-body-sm bg-background">
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
          className="h-8 rounded-lg text-body-sm bg-background"
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
          className="ml-auto h-8 rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5 mr-1" />
          Hapus
        </Button>
      </div>
    </div>
  );
}

function ChapterBulkActionBar({
  count,
  chapters,
  onAddChapter,
  onSetChapters,
  onRemoveChapter,
  onRemove,
}: {
  count: number;
  chapters: Chapter[];
  onAddChapter: (chapterId: string) => void;
  onSetChapters: (chapterIds: string[]) => void;
  onRemoveChapter: (chapterId: string) => void;
  onRemove: () => void;
}) {
  const [selectedTargetChapter, setSelectedTargetChapter] = useState<string>("");

  const utsChapters = useMemo(() => {
    const midpoint = Math.max(1, Math.ceil(chapters.length / 2));
    return chapters.slice(0, midpoint).map((c) => c.id);
  }, [chapters]);

  return (
    <div className="sticky bottom-0 z-10 mt-2 rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-2.5 shadow-xl ring-1 ring-black/5 dark:ring-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2.5 py-1 rounded-md text-body-xs font-bold bg-brand-primary/15 text-brand-primary border border-brand-primary/30">
          {count} dipilih
        </span>

        <Select value={selectedTargetChapter} onValueChange={setSelectedTargetChapter}>
          <SelectTrigger className="h-8 w-44 rounded-lg text-body-sm bg-background">
            <SelectValue placeholder="Pilih Bab sasaran" />
          </SelectTrigger>
          <SelectContent>
            {chapters.map((ch) => (
              <SelectItem key={ch.id} value={ch.id} className="text-body-sm">
                Bab {ch.orderIndex}: {ch.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg text-body-sm bg-background"
          disabled={!selectedTargetChapter}
          onClick={() => {
            if (selectedTargetChapter) {
              onAddChapter(selectedTargetChapter);
            }
          }}
        >
          <Plus className="size-3.5 mr-1" />
          Tambah Bab
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg text-body-sm bg-background"
          disabled={!selectedTargetChapter}
          onClick={() => {
            if (selectedTargetChapter) {
              onSetChapters([selectedTargetChapter]);
            }
          }}
        >
          Set Hanya Bab Ini
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg text-body-sm bg-background"
          disabled={!selectedTargetChapter}
          onClick={() => {
            if (selectedTargetChapter) {
              onRemoveChapter(selectedTargetChapter);
            }
          }}
        >
          Lepas Bab Ini
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg text-body-sm bg-background"
          onClick={() => onSetChapters(chapters.map((c) => c.id))}
        >
          Set Semua Bab
        </Button>

        {chapters.length > 1 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg text-body-sm bg-background"
            onClick={() => onSetChapters(utsChapters)}
          >
            Set Bab 1 s.d. UTS
          </Button>
        )}

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg text-body-sm bg-background"
          onClick={() => onSetChapters([])}
        >
          Kosongkan Bab
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto h-8 rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5 mr-1" />
          Hapus
        </Button>
      </div>
    </div>
  );
}
