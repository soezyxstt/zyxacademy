"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileCode2,
  FileIcon,
  FileText,
  Folder,
  FolderOpen,
  Grid3X3,
  Image as ImageIcon,
  List,
  Loader2,
  MoreVertical,
  Music,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  Video,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchBar } from "@/components/ui/search-bar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/state-panels";
import { DocumentViewer } from "@/components/admin/document-viewer";
import { flattenTree, FolderPicker } from "@/components/admin/folder-picker";
import {
  baseFolderName,
  folderPathOfKey,
  formatBytes,
  MEDIA_ACCEPT_ATTR,
  MEDIA_MAX_UPLOAD_BYTES,
  type MediaFile,
  type MediaKind,
  type MediaListing,
  type MediaTreeNode,
} from "@/lib/media";

const KIND_ICON: Record<MediaKind, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  pdf: FileText,
  markdown: FileCode2,
  text: FileText,
  other: FileIcon,
};

const KIND_LABELS: Record<MediaKind, string> = {
  image: "Gambar",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  markdown: "Markdown",
  text: "Teks",
  other: "Berkas",
};

type TargetItem = {
  kind: "file" | "folder";
  name: string;
  key?: string;
  folderPath?: string;
};

type DropHandlers = {
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>) => void;
};

type MarqueeRect = { left: number; top: number; width: number; height: number };

const fileRef = (key: string) => `file:${key}`;
const folderRef = (path: string) => `folder:${path}`;

function refKindOf(ref: string): "file" | "folder" {
  return ref.startsWith("folder:") ? "folder" : "file";
}

function refValueOf(ref: string): string {
  return ref.startsWith("folder:") ? ref.slice("folder:".length) : ref.slice("file:".length);
}

function rectsIntersect(a: { left: number; top: number; right: number; bottom: number }, b: DOMRect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function FileThumb({ file }: { file: MediaFile }) {
  if (file.kind === "image") {
    return (
      <div className="bg-muted relative flex aspect-photo-card w-full items-center justify-center overflow-hidden rounded-lg">
        <Image src={file.url} alt={file.name} fill sizes="(max-width: 768px) 50vw, 25vw" unoptimized className="object-cover" />
      </div>
    );
  }
  const Icon = KIND_ICON[file.kind];
  return (
    <div className="bg-muted flex aspect-photo-card w-full items-center justify-center rounded-lg">
      <Icon className="text-muted-foreground size-10 opacity-60" aria-hidden />
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-body-sm transition-colors",
        danger ? "text-status-error hover:bg-destructive/10" : "text-foreground hover:bg-muted"
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  );
}

function FolderTreeItem({
  node,
  depth,
  current,
  expanded,
  dropFolder,
  onToggle,
  onNavigate,
  getDropProps,
}: {
  node: MediaTreeNode;
  depth: number;
  current: string;
  expanded: Set<string>;
  dropFolder: string | null;
  onToggle: (path: string) => void;
  onNavigate: (path: string) => void;
  getDropProps: (path: string) => DropHandlers;
}) {
  const active = current === node.path;
  const isExpanded = expanded.has(node.path);
  const isDropTarget = dropFolder === node.path;
  return (
    <div>
      <button
        type="button"
        onClick={() => (node.children.length ? onToggle(node.path) : onNavigate(node.path))}
        {...getDropProps(node.path)}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-body-sm transition-colors",
          active ? "bg-brand-primary/10 font-medium text-brand-primary" : "text-foreground hover:bg-muted",
          isDropTarget && "border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary/40"
        )}
      >
        {node.children.length ? (
          isExpanded ? (
            <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          )
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        <Folder className={cn("size-4 shrink-0", active ? "text-brand-primary" : "text-muted-foreground")} aria-hidden />
        <span className="truncate">{node.name}</span>
      </button>
      {isExpanded &&
        node.children.map((child) => (
          <FolderTreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            current={current}
            expanded={expanded}
            dropFolder={dropFolder}
            onToggle={onToggle}
            onNavigate={onNavigate}
            getDropProps={getDropProps}
          />
        ))}
    </div>
  );
}

export function MediaLibrary() {
  const [folder, setFolder] = useState("");
  const [data, setData] = useState<MediaListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const [viewerFile, setViewerFile] = useState<MediaFile | null>(null);

  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState("");

  const [renameTarget, setRenameTarget] = useState<TargetItem | null>(null);
  const [renameName, setRenameName] = useState("");

  const [moveTarget, setMoveTarget] = useState<TargetItem | null>(null);
  const [moveFolder, setMoveFolder] = useState("");

  const [copyTarget, setCopyTarget] = useState<TargetItem | null>(null);
  const [copyFolder, setCopyFolder] = useState("");

  const [replaceTarget, setReplaceTarget] = useState<TargetItem | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TargetItem | null>(null);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMoveFolder, setBulkMoveFolder] = useState("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragRefsRef = useRef<string[]>([]);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/media?folder=${encodeURIComponent(target)}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal memuat media");
      setData(body as unknown as MediaListing);
      setFolder(target);
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat media");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const parts = folder.split("/").filter(Boolean);
    const ancestors = parts.reduce<string[]>((acc, part, idx) => {
      acc.push(parts.slice(0, idx + 1).join("/"));
      return acc;
    }, []);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      ancestors.forEach((a) => next.add(a));
      return next;
    });
  }, [folder, data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelected([]);
      setDropFolder(null);
      setMarquee(null);
      marqueeStartRef.current = null;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const refresh = useCallback(() => {
    void load(folder);
  }, [folder, load]);

  const navigate = useCallback(
    (path: string) => {
      void load(path);
    },
    [load]
  );

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const allFolders = useMemo(() => (data ? flattenTree(data.tree) : []), [data]);

  const visibleFolders = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return q ? data.folders.filter((f) => f.name.toLowerCase().includes(q)) : data.folders;
  }, [data, query]);

  const visibleFiles = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return q ? data.files.filter((f) => f.name.toLowerCase().includes(q)) : data.files;
  }, [data, query]);

  const visibleItems = useMemo(
    () => [
      ...visibleFolders.map((f) => ({ kind: "folder" as const, ref: folderRef(f.path), path: f.path, name: f.name })),
      ...visibleFiles.map((f) => ({ kind: "file" as const, ref: fileRef(f.key), file: f })),
    ],
    [visibleFolders, visibleFiles]
  );

  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selected.includes(item.ref));

  const selectedFileCount = selected.filter((ref) => refKindOf(ref) === "file").length;
  const selectedFolderCount = selected.length - selectedFileCount;

  function toggleRef(ref: string) {
    setSelected((prev) => (prev.includes(ref) ? prev.filter((r) => r !== ref) : [...prev, ref]));
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      visibleItems.every((item) => prev.includes(item.ref)) ? [] : visibleItems.map((item) => item.ref)
    );
  }

  function onItemClick(e: React.MouseEvent, ref: string, action: () => void) {
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      toggleRef(ref);
      return;
    }
    action();
  }

  function dedupeSelected(refs: string[]): string[] {
    const folderPaths = refs.filter((r) => refKindOf(r) === "folder").map((r) => refValueOf(r));
    return refs.filter((r) => {
      if (refKindOf(r) === "folder") return true;
      const filePath = folderPathOfKey(refValueOf(r));
      return !folderPaths.some((fp) => filePath === fp || filePath.startsWith(`${fp}/`));
    });
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length) return;
    if (files.some((f) => f.size > MEDIA_MAX_UPLOAD_BYTES)) {
      toast.error(`Ukuran file melebihi batas ${formatBytes(MEDIA_MAX_UPLOAD_BYTES)}`);
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        if (folder) form.append("folderPath", folder);
        const res = await fetch("/api/admin/media", { method: "POST", body: form });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error || `Gagal mengunggah ${file.name}`);
      }
      toast.success(`${files.length} file berhasil diunggah`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengunggah file");
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  async function postOp(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch("/api/admin/media/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error((body.error as string) || "Operasi gagal");
    return body;
  }

  async function singleOp(payload: Record<string, unknown>, successMessage: string, close?: () => void) {
    setBusy(String(payload.action));
    try {
      await postOp(payload);
      toast.success(successMessage);
      close?.();
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operasi gagal");
    } finally {
      setBusy(null);
    }
  }

  async function submitMkdir() {
    const name = mkdirName.trim();
    if (!name) return;
    setBusy("mkdir");
    try {
      const fullPath = folder ? `${folder}/${name}` : name;
      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mkdir", folderPath: fullPath }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal membuat folder");
      toast.success("Folder berhasil dibuat");
      setMkdirOpen(false);
      setMkdirName("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat folder");
    } finally {
      setBusy(null);
    }
  }

  function openRename(item: TargetItem) {
    setRenameTarget(item);
    setRenameName(item.name);
  }

  function openMove(item: TargetItem) {
    setMoveTarget(item);
    setMoveFolder("");
  }

  function openCopy(item: TargetItem) {
    setCopyTarget(item);
    setCopyFolder("");
  }

  function confirmRename() {
    if (!renameTarget || !renameName.trim()) return;
    const payload = renameTarget.kind === "folder"
      ? { action: "rename", kind: "folder" as const, folderPath: renameTarget.folderPath, newName: renameName.trim() }
      : { action: "rename", kind: "file" as const, key: renameTarget.key, newName: renameName.trim() };
    void singleOp(payload, "Nama berhasil diubah", () => setRenameTarget(null));
  }

  function confirmMove() {
    if (!moveTarget) return;
    const payload = moveTarget.kind === "folder"
      ? { action: "move", kind: "folder" as const, folderPath: moveTarget.folderPath, targetFolder: moveFolder }
      : { action: "move", kind: "file" as const, key: moveTarget.key, targetFolder: moveFolder };
    void singleOp(payload, "Berhasil dipindahkan", () => setMoveTarget(null));
  }

  function confirmCopy() {
    if (!copyTarget) return;
    const payload = copyTarget.kind === "folder"
      ? { action: "copy", kind: "folder" as const, folderPath: copyTarget.folderPath, targetFolder: copyFolder }
      : { action: "copy", kind: "file" as const, key: copyTarget.key, targetFolder: copyFolder };
    void singleOp(payload, "Salinan berhasil dibuat", () => setCopyTarget(null));
  }

  async function confirmReplace() {
    if (!replaceTarget || !replaceFile) return;
    setBusy("replace");
    try {
      const form = new FormData();
      form.append("action", "replace");
      form.append("kind", "file");
      if (replaceTarget.key) form.append("key", replaceTarget.key);
      form.append("file", replaceFile);
      const res = await fetch("/api/admin/media/ops", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal mengganti file");
      toast.success("File berhasil diganti");
      setReplaceTarget(null);
      setReplaceFile(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengganti file");
    } finally {
      setBusy(null);
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const payload = deleteTarget.kind === "folder"
      ? { action: "delete", kind: "folder" as const, folderPath: deleteTarget.folderPath }
      : { action: "delete", kind: "file" as const, key: deleteTarget.key };
    void singleOp(payload, "Berhasil dihapus", () => setDeleteTarget(null));
  }

  async function moveRefs(refs: string[], target: string) {
    const effective = dedupeSelected(refs);
    const ops = effective
      .map((ref) => {
        if (refKindOf(ref) === "folder") {
          const path = refValueOf(ref);
          if (path === target || target.startsWith(`${path}/`)) return null;
          const newPath = target ? `${target}/${baseFolderName(path)}` : baseFolderName(path);
          if (newPath === path) return null;
          return { action: "move" as const, kind: "folder" as const, folderPath: path, targetFolder: target };
        }
        const key = refValueOf(ref);
        if (folderPathOfKey(key) === target) return null;
        return { action: "move" as const, kind: "file" as const, key, targetFolder: target };
      })
      .filter((op): op is NonNullable<typeof op> => Boolean(op));

    if (!ops.length) return;
    setBusy("bulk-move");
    let ok = 0;
    let failed = 0;
    try {
      for (const op of ops) {
        try {
          await postOp(op);
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      setSelected((prev) => prev.filter((r) => !refs.includes(r)));
      if (ok && failed) toast.success(`${ok} dari ${ops.length} item berhasil dipindahkan`);
      else if (ok) toast.success(`${ok} item berhasil dipindahkan`);
      else toast.error("Tidak ada item yang berhasil dipindahkan");
      if (failed) toast.error(`${failed} item gagal dipindahkan`);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function bulkMove() {
    if (!selected.length) return;
    await moveRefs(selected, bulkMoveFolder);
    setBulkMoveOpen(false);
  }

  async function bulkDelete() {
    const effective = dedupeSelected(selected);
    if (!effective.length) return;
    setBusy("bulk-delete");
    let ok = 0;
    let failed = 0;
    try {
      for (const ref of effective) {
        try {
          await postOp(
            refKindOf(ref) === "folder"
              ? { action: "delete", kind: "folder" as const, folderPath: refValueOf(ref) }
              : { action: "delete", kind: "file" as const, key: refValueOf(ref) }
          );
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      if (ok && failed) toast.success(`${ok} dari ${effective.length} item berhasil dihapus`);
      else if (ok) toast.success(`${ok} item berhasil dihapus`);
      else toast.error("Tidak ada item yang berhasil dihapus");
      if (failed) toast.error(`${failed} item gagal dihapus`);
      setBulkDeleteOpen(false);
      setSelected([]);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  const forbiddenPaths = useMemo(() => {
    if (!moveTarget || moveTarget.kind !== "folder") return new Set<string>();
    const base = moveTarget.folderPath || "";
    const set = new Set<string>([base]);
    allFolders.forEach((f) => {
      if (f.path === base || f.path.startsWith(`${base}/`)) set.add(f.path);
    });
    return set;
  }, [moveTarget, allFolders]);

  const selectionForbidden = useMemo(() => {
    const set = new Set<string>();
    for (const ref of selected) {
      if (refKindOf(ref) !== "folder") continue;
      const path = refValueOf(ref);
      if (!path) continue;
      set.add(path);
      allFolders.forEach((f) => {
        if (f.path === path || f.path.startsWith(`${path}/`)) set.add(f.path);
      });
    }
    return set;
  }, [selected, allFolders]);

  function onItemDragStart(e: React.DragEvent, ref: string) {
    e.dataTransfer.effectAllowed = "move";
    let refs = selected;
    if (!selected.includes(ref)) {
      refs = [ref];
      setSelected([ref]);
    }
    dragRefsRef.current = refs;
    try {
      e.dataTransfer.setData("application/x-zyx-media", JSON.stringify(refs));
    } catch {
      // ignore
    }
    e.dataTransfer.setData("text/plain", ref);
  }

  function onItemDragEnd() {
    dragRefsRef.current = [];
    setDropFolder(null);
  }

  function handleFolderDrop(path: string) {
    const refs = dragRefsRef.current;
    dragRefsRef.current = [];
    setDropFolder(null);
    if (!refs.length) return;
    void moveRefs(refs, path);
  }

  const getDropProps = (path: string): DropHandlers => ({
    onDragOver: (e) => {
      if (!dragRefsRef.current.length) return;
      e.preventDefault();
      e.stopPropagation();
      setDropFolder(path);
    },
    onDragLeave: (e) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDropFolder((prev) => (prev === path ? null : prev));
    },
    onDrop: (e) => {
      if (!dragRefsRef.current.length) return;
      e.preventDefault();
      e.stopPropagation();
      handleFolderDrop(path);
    },
  });

  function onListPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !listRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-item-ref]")) return;
    if (target.closest("button, a, input, label, [role='button']")) return;
    e.preventDefault();
    const rect = listRef.current.getBoundingClientRect();
    marqueeStartRef.current = { x: e.clientX, y: e.clientY };
    setMarquee({ left: e.clientX - rect.left, top: e.clientY - rect.top, width: 0, height: 0 });
    listRef.current.setPointerCapture(e.pointerId);
  }

  function onListPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!marqueeStartRef.current || !listRef.current) return;
    const rect = listRef.current.getBoundingClientRect();
    const left = Math.min(marqueeStartRef.current.x, e.clientX) - rect.left;
    const top = Math.min(marqueeStartRef.current.y, e.clientY) - rect.top;
    setMarquee({
      left,
      top,
      width: Math.abs(e.clientX - marqueeStartRef.current.x),
      height: Math.abs(e.clientY - marqueeStartRef.current.y),
    });
  }

  function onListPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!marqueeStartRef.current || !listRef.current) return;
    const selectionRect = {
      left: Math.min(marqueeStartRef.current.x, e.clientX),
      top: Math.min(marqueeStartRef.current.y, e.clientY),
      right: Math.max(marqueeStartRef.current.x, e.clientX),
      bottom: Math.max(marqueeStartRef.current.y, e.clientY),
    };
    const found: string[] = [];
    listRef.current.querySelectorAll<HTMLElement>("[data-item-ref]").forEach((el) => {
      if (rectsIntersect(selectionRect, el.getBoundingClientRect())) {
        const ref = el.dataset.itemRef;
        if (ref) found.push(ref);
      }
    });
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    setSelected((prev) => (additive ? Array.from(new Set([...prev, ...found])) : found));
    marqueeStartRef.current = null;
    setMarquee(null);
    if (listRef.current.hasPointerCapture(e.pointerId)) {
      listRef.current.releasePointerCapture(e.pointerId);
    }
  }

  const selectionActions = (
    <div className="border-border bg-background/90 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 shadow-sm">
      <div>
        <p className="text-body-sm font-medium text-foreground">{selected.length} item dipilih</p>
        {selectedFolderCount > 0 && (
          <p className="text-body-xs text-muted-foreground">
            Termasuk {selectedFolderCount} folder; isinya ikut dipindahkan atau dihapus.
          </p>
        )}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => {
            setBulkMoveFolder("");
            setBulkMoveOpen(true);
          }}
          isLoading={busy === "bulk-move"}
        >
          <Folder className="size-3.5" />
          Pindahkan
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="rounded-lg"
          onClick={() => setBulkDeleteOpen(true)}
          isLoading={busy === "bulk-delete"}
        >
          <Trash2 className="size-3.5" />
          Hapus
        </Button>
        <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setSelected([])}>
          Bersihkan
        </Button>
      </div>
    </div>
  );

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <SearchBar
        value={query}
        onSearch={setQuery}
        onClear={() => setQuery("")}
        placeholder="Cari file atau folder"
        size="sm"
        containerClassName="min-w-[140px] w-48 shrink-0 sm:w-64"
      />
      <div className="border-border flex rounded-lg border p-0.5">
        <button
          type="button"
          className={cn(
            "cursor-pointer rounded-md p-1.5 outline-none transition-colors",
            view === "grid" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
          aria-pressed={view === "grid"}
          aria-label="Tampilan grid"
          onClick={() => setView("grid")}
        >
          <Grid3X3 className="size-4" />
        </button>
        <button
          type="button"
          className={cn(
            "cursor-pointer rounded-md p-1.5 outline-none transition-colors",
            view === "list" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
          aria-pressed={view === "list"}
          aria-label="Tampilan daftar"
          onClick={() => setView("list")}
        >
          <List className="size-4" />
        </button>
      </div>
      <Button variant="outline" size="sm" className="rounded-lg" onClick={refresh}>
        <RefreshCw className="size-3.5" />
        Muat Ulang
      </Button>
      <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setMkdirOpen(true)}>
        <Plus className="size-3.5" />
        Folder Baru
      </Button>
      <Button size="sm" className="rounded-lg" onClick={() => uploadInputRef.current?.click()}>
        <UploadCloud className="size-3.5" />
        Unggah
      </Button>
    </div>
  );

  const renderBreadcrumb = (
    <nav className="flex min-w-0 items-center gap-1 text-body-sm">
      <button
        type="button"
        onClick={() => navigate("")}
        className={cn(
          "cursor-pointer font-medium transition-colors",
          folder ? "text-muted-foreground hover:text-foreground" : "text-foreground"
        )}
      >
        Media
      </button>
      {folder.split("/").filter(Boolean).map((part, idx, parts) => {
        const path = parts.slice(0, idx + 1).join("/");
        const last = idx === parts.length - 1;
        return (
          <Fragment key={path}>
            <ChevronRight className="text-muted-foreground/60 size-3.5 shrink-0" aria-hidden />
            <button
              type="button"
              onClick={() => !last && navigate(path)}
              className={cn(
                "max-w-[180px] cursor-pointer truncate font-medium transition-colors",
                last ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {part}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );

  const renderUploadDropzone = (
    <div
      role="button"
      tabIndex={0}
      onClick={() => uploadInputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") uploadInputRef.current?.click();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
      }}
      className="border-border bg-card flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed py-6 text-center transition-colors hover:border-primary"
    >
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept={MEDIA_ACCEPT_ATTR}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) void uploadFiles(e.target.files);
        }}
      />
      {uploading ? (
        <>
          <Loader2 className="size-5 animate-spin text-brand-primary" aria-hidden />
          <p className="text-body-sm font-medium text-foreground">Mengunggah file...</p>
        </>
      ) : (
        <>
          <UploadCloud className="text-brand-primary size-6" aria-hidden />
          <p className="text-body-sm font-medium text-foreground">Unggah berkas</p>
          <p className="text-body-xs text-muted-foreground">
            Gambar, video, audio, PDF, Markdown, teks. Maksimal {formatBytes(MEDIA_MAX_UPLOAD_BYTES)} per file.
          </p>
          <p className="text-body-xs text-muted-foreground">
            Seret item ke folder tujuan untuk memindahkan.
          </p>
        </>
      )}
    </div>
  );

  const renderGrid = (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
      {visibleItems.map((item) =>
        item.kind === "folder" ? (
          <div
            key={item.path}
            data-item-ref={item.ref}
            draggable
            onDragStart={(e) => onItemDragStart(e, item.ref)}
            onDragEnd={onItemDragEnd}
            {...getDropProps(item.path)}
            className={cn(
              "border-border group relative select-none rounded-xl border bg-card p-2 shadow-sm transition-all",
              selected.includes(item.ref)
                ? "border-primary ring-1 ring-primary/40"
                : "hover:border-border/70",
              dropFolder === item.path && "border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/30"
            )}
          >
            <div className="relative">
              <div className="bg-muted flex aspect-photo-card w-full items-center justify-center rounded-lg">
                <Folder className="text-brand-primary size-10 opacity-70" aria-hidden />
              </div>
              <div className="absolute top-1.5 left-1.5 z-10">
                <Checkbox
                  checked={selected.includes(item.ref)}
                  aria-label={`Pilih folder ${item.name}`}
                  onCheckedChange={() => toggleRef(item.ref)}
                />
              </div>
              <div className="absolute top-1 right-1 z-10">
                <ItemMenu
                  item={{ kind: "folder", name: item.name, folderPath: item.path }}
                  onPreview={() => navigate(item.path)}
                  onRename={() => openRename({ kind: "folder", name: item.name, folderPath: item.path })}
                  onMove={() => openMove({ kind: "folder", name: item.name, folderPath: item.path })}
                  onCopy={() => openCopy({ kind: "folder", name: item.name, folderPath: item.path })}
                  onDelete={() => setDeleteTarget({ kind: "folder", name: item.name, folderPath: item.path })}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => onItemClick(e, item.ref, () => navigate(item.path))}
              className="mt-2 block w-full cursor-pointer text-left"
            >
              <p className="line-clamp-2 text-body-sm font-medium leading-snug text-foreground">{item.name}</p>
              <p className="text-muted-foreground mt-1 text-body-xs">Folder</p>
            </button>
          </div>
        ) : (
          <div
            key={item.file.key}
            data-item-ref={item.ref}
            draggable
            onDragStart={(e) => onItemDragStart(e, item.ref)}
            onDragEnd={onItemDragEnd}
            className={cn(
              "border-border group relative select-none rounded-xl border bg-card p-2 shadow-sm transition-all",
              selected.includes(item.ref) ? "border-primary ring-1 ring-primary/40" : "hover:border-border/70"
            )}
          >
            <div className="relative">
              <FileThumb file={item.file} />
              <button
                type="button"
                onClick={(e) => onItemClick(e, item.ref, () => setViewerFile(item.file))}
                className="absolute inset-0 z-0 cursor-pointer"
                aria-label={`Buka ${item.file.name}`}
              />
              <div className="absolute top-1.5 left-1.5 z-10">
                <Checkbox
                  checked={selected.includes(item.ref)}
                  aria-label={`Pilih ${item.file.name}`}
                  onCheckedChange={() => toggleRef(item.ref)}
                />
              </div>
              <div className="absolute top-1 right-1 z-10">
                <ItemMenu
                  item={{ kind: "file", name: item.file.name, key: item.file.key }}
                  onPreview={() => setViewerFile(item.file)}
                  onDownload={`${item.file.url}?download=1`}
                  onRename={() => openRename({ kind: "file", name: item.file.name, key: item.file.key })}
                  onMove={() => openMove({ kind: "file", name: item.file.name, key: item.file.key })}
                  onCopy={() => openCopy({ kind: "file", name: item.file.name, key: item.file.key })}
                  onReplace={() => {
                    setReplaceTarget({ kind: "file", name: item.file.name, key: item.file.key });
                    setReplaceFile(null);
                  }}
                  onDelete={() => setDeleteTarget({ kind: "file", name: item.file.name, key: item.file.key })}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => onItemClick(e, item.ref, () => setViewerFile(item.file))}
              className="mt-2 block w-full cursor-pointer text-left"
            >
              <p className="line-clamp-2 text-body-sm font-medium leading-snug text-foreground">{item.file.name}</p>
              <p className="text-muted-foreground mt-1 text-body-xs">
                {formatBytes(item.file.size)} · {KIND_LABELS[item.file.kind]}
              </p>
            </button>
          </div>
        )
      )}
    </div>
  );

  const renderTable = (
    <div className="border-border overflow-hidden rounded-xl border bg-card shadow-sm">
      <table className="w-full min-w-[640px] border-collapse text-left text-body-sm">
        <thead>
          <tr className="bg-muted/40 text-muted-foreground border-b">
            <th className="w-10 px-3 py-2.5 font-medium" scope="col">
              {visibleItems.length > 0 && (
                <Checkbox checked={allVisibleSelected} aria-label="Pilih semua item" onCheckedChange={toggleSelectAll} />
              )}
            </th>
            <th className="px-2 py-2.5 font-medium" scope="col">
              Nama
            </th>
            <th className="px-4 py-2.5 font-medium" scope="col">
              Ukuran
            </th>
            <th className="px-4 py-2.5 font-medium" scope="col">
              Diubah
            </th>
            <th className="w-10 px-3 py-2.5 font-medium" scope="col" />
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((item) => {
            if (item.kind === "folder") {
              return (
                <tr
                  key={item.path}
                  {...getDropProps(item.path)}
                  className={cn(
                    "border-border border-b last:border-b-0",
                    selected.includes(item.ref) && "bg-primary/5",
                    dropFolder === item.path && "bg-brand-primary/5"
                  )}
                >
                  <td className="px-3 py-2 align-middle">
                    <Checkbox
                      checked={selected.includes(item.ref)}
                      aria-label={`Pilih folder ${item.name}`}
                      onCheckedChange={() => toggleRef(item.ref)}
                    />
                  </td>
                  <td className="px-2 py-2 align-middle">
                    <button
                      type="button"
                      onClick={(e) => onItemClick(e, item.ref, () => navigate(item.path))}
                      className="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-left"
                    >
                      <Folder className="text-brand-primary size-5 shrink-0" aria-hidden />
                      <span className="truncate font-medium text-foreground">{item.name}</span>
                    </button>
                  </td>
                  <td className="text-muted-foreground px-4 py-2 align-middle whitespace-nowrap">
                    <Badge variant="secondary" className="font-normal">
                      Folder
                    </Badge>
                  </td>
                  <td className="text-muted-foreground px-4 py-2 align-middle whitespace-nowrap">-</td>
                  <td className="px-3 py-2 align-middle">
                    <ItemMenu
                      item={{ kind: "folder", name: item.name, folderPath: item.path }}
                      onPreview={() => navigate(item.path)}
                      onRename={() => openRename({ kind: "folder", name: item.name, folderPath: item.path })}
                      onMove={() => openMove({ kind: "folder", name: item.name, folderPath: item.path })}
                      onCopy={() => openCopy({ kind: "folder", name: item.name, folderPath: item.path })}
                      onDelete={() => setDeleteTarget({ kind: "folder", name: item.name, folderPath: item.path })}
                    />
                  </td>
                </tr>
              );
            }
            const file = item.file;
            const FileIconComp = KIND_ICON[file.kind];
            return (
              <tr
                key={file.key}
                className={cn("border-border border-b last:border-b-0", selected.includes(item.ref) && "bg-primary/5")}
              >
                <td className="px-3 py-2 align-middle">
                  <Checkbox
                    checked={selected.includes(item.ref)}
                    aria-label={`Pilih ${file.name}`}
                    onCheckedChange={() => toggleRef(item.ref)}
                  />
                </td>
                <td className="px-2 py-2 align-middle">
                  <button
                    type="button"
                    onClick={(e) => onItemClick(e, item.ref, () => setViewerFile(file))}
                    className="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-left"
                  >
                    <FileIconComp className="text-brand-primary size-5 shrink-0" aria-hidden />
                    <span className="truncate font-medium text-foreground">{file.name}</span>
                  </button>
                </td>
                <td className="text-muted-foreground px-4 py-2 align-middle whitespace-nowrap">
                  {formatBytes(file.size)}
                </td>
                <td className="text-muted-foreground px-4 py-2 align-middle whitespace-nowrap">
                  {new Date(file.lastModified).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </td>
                <td className="px-3 py-2 align-middle">
                  <ItemMenu
                    item={{ kind: "file", name: file.name, key: file.key }}
                    onPreview={() => setViewerFile(file)}
                    onDownload={`${file.url}?download=1`}
                    onRename={() => openRename({ kind: "file", name: file.name, key: file.key })}
                    onMove={() => openMove({ kind: "file", name: file.name, key: file.key })}
                    onCopy={() => openCopy({ kind: "file", name: file.name, key: file.key })}
                    onReplace={() => {
                      setReplaceTarget({ kind: "file", name: file.name, key: file.key });
                      setReplaceFile(null);
                    }}
                    onDelete={() => setDeleteTarget({ kind: "file", name: file.name, key: file.key })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {selected.length > 0 && selectionActions}

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">{renderBreadcrumb}</div>
        {headerActions}
      </div>

      {renderUploadDropzone}

      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="hidden w-48 shrink-0 self-start border-r border-border pr-3 lg:block">
          <p className="text-body-xs text-muted-foreground px-2 pt-1 pb-2 font-semibold uppercase tracking-wide">
            Folder
          </p>
          <button
            type="button"
            onClick={() => navigate("")}
            {...getDropProps("")}
            className={cn(
              "flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-body-sm transition-colors",
              !folder ? "bg-brand-primary/10 font-medium text-brand-primary" : "text-foreground hover:bg-muted",
              dropFolder === "" && "border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary/40"
            )}
          >
            <FolderOpen className={cn("size-4 shrink-0", !folder ? "text-brand-primary" : "text-muted-foreground")} aria-hidden />
            <span className="truncate">Media</span>
          </button>
          <div className="mt-1">
            {data?.tree.map((node) => (
              <FolderTreeItem
                key={node.path}
                node={node}
                depth={0}
                current={folder}
                expanded={expandedFolders}
                dropFolder={dropFolder}
                onToggle={toggleFolder}
                onNavigate={navigate}
                getDropProps={getDropProps}
              />
            ))}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="space-y-3">
              <div className="h-8 animate-pulse rounded-lg bg-muted" />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-44 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="border-border rounded-xl border bg-card p-6 shadow-sm">
                <AdminErrorState
                  message={error}
                  onRetry={refresh}
                />
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="border-border rounded-xl border bg-card shadow-sm">
              <AdminEmptyState
                icon={Folder}
                title={query ? "Tidak ada hasil" : "Folder ini kosong"}
                description={
                  query
                    ? "Tidak ada file atau folder yang cocok dengan pencarian."
                    : "Unggah file atau buat folder baru untuk mulai mengelola media."
                }
              />
            </div>
          ) : (
            <div
              ref={listRef}
              className={cn("relative", marquee && "select-none")}
              style={{ touchAction: "pan-y" }}
              onPointerDown={onListPointerDown}
              onPointerMove={onListPointerMove}
              onPointerUp={onListPointerUp}
              onPointerCancel={onListPointerUp}
            >
              {view === "grid" ? renderGrid : renderTable}
              {marquee && (
                <div
                  className="bg-brand-primary/10 pointer-events-none absolute z-20 rounded-md border border-brand-primary"
                  style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
                  aria-hidden
                />
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent className="max-w-md rounded-xl border border-border p-6 shadow-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">Buat folder baru</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground mt-2">
              Folder dibuat di dalam lokasi saat ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="mkdir-name">Nama folder</Label>
            <Input
              id="mkdir-name"
              value={mkdirName}
              onChange={(e) => setMkdirName(e.target.value)}
              placeholder="contoh: logos"
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitMkdir();
              }}
            />
            {folder && (
              <p className="text-body-xs text-muted-foreground">
                Path: media/{folder}/{mkdirName || "..."}
              </p>
            )}
          </div>
          <DialogFooter className="mt-5 flex items-center justify-end gap-2.5">
            <Button variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setMkdirOpen(false)}>
              Batal
            </Button>
            <Button
              className="rounded-lg cursor-pointer font-bold px-6 shadow-sm"
              onClick={submitMkdir}
              disabled={!mkdirName.trim()}
              isLoading={busy === "mkdir"}
            >
              Buat Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="max-w-md rounded-xl border border-border p-6 shadow-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">Ubah nama</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground mt-2">
              {renameTarget?.kind === "folder" ? "Ubah nama folder." : "Ubah nama file. Ekstensi file dipertahankan."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="rename-name">Nama baru</Label>
            <Input
              id="rename-name"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
              }}
            />
          </div>
          <DialogFooter className="mt-5 flex items-center justify-end gap-2.5">
            <Button variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setRenameTarget(null)}>
              Batal
            </Button>
            <Button
              className="rounded-lg cursor-pointer font-bold px-6 shadow-sm"
              onClick={confirmRename}
              disabled={!renameName.trim()}
              isLoading={busy === "rename"}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!moveTarget}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null);
        }}
      >
        <DialogContent className="max-w-md rounded-xl border border-border p-6 shadow-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">Pindahkan</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground mt-2">
              Pilih folder tujuan untuk {moveTarget?.name}.
            </DialogDescription>
          </DialogHeader>
          <FolderPicker folders={allFolders} value={moveFolder} onSelect={setMoveFolder} disabled={forbiddenPaths} />
          <DialogFooter className="mt-5 flex items-center justify-end gap-2.5">
            <Button variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setMoveTarget(null)}>
              Batal
            </Button>
            <Button
              className="rounded-lg cursor-pointer font-bold px-6 shadow-sm"
              onClick={confirmMove}
              isLoading={busy === "move"}
            >
              Pindahkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!copyTarget}
        onOpenChange={(open) => {
          if (!open) setCopyTarget(null);
        }}
      >
        <DialogContent className="max-w-md rounded-xl border border-border p-6 shadow-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">Duplikat</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground mt-2">
              Pilih folder tujuan salinan {copyTarget?.name}.
            </DialogDescription>
          </DialogHeader>
          <FolderPicker folders={allFolders} value={copyFolder} onSelect={setCopyFolder} disabled={forbiddenPaths} />
          <DialogFooter className="mt-5 flex items-center justify-end gap-2.5">
            <Button variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setCopyTarget(null)}>
              Batal
            </Button>
            <Button
              className="rounded-lg cursor-pointer font-bold px-6 shadow-sm"
              onClick={confirmCopy}
              isLoading={busy === "copy"}
            >
              Duplikat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!replaceTarget}
        onOpenChange={(open) => {
          if (!open) {
            setReplaceTarget(null);
            setReplaceFile(null);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-xl border border-border p-6 shadow-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">Ganti file</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground mt-2">
              Ganti isi {replaceTarget?.name} dengan file baru. Nama file tetap sama.
            </DialogDescription>
          </DialogHeader>
          <label className="border-border bg-muted/40 text-muted-foreground hover:border-primary hover:text-foreground flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed transition-colors">
            <UploadCloud className="size-5" aria-hidden />
            <span className="max-w-full truncate text-body-sm">
              {replaceFile ? replaceFile.name : "Pilih file pengganti"}
            </span>
            <input
              type="file"
              accept={MEDIA_ACCEPT_ATTR}
              className="sr-only"
              onChange={(e) => {
                setReplaceFile(e.target.files?.[0] || null);
              }}
            />
          </label>
          <DialogFooter className="mt-5 flex items-center justify-end gap-2.5">
            <Button
              variant="outline"
              className="rounded-lg cursor-pointer font-bold"
              onClick={() => {
                setReplaceTarget(null);
                setReplaceFile(null);
              }}
            >
              Batal
            </Button>
            <Button
              className="rounded-lg cursor-pointer font-bold px-6 shadow-sm"
              onClick={confirmReplace}
              disabled={!replaceFile}
              isLoading={busy === "replace"}
            >
              Ganti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkMoveOpen} onOpenChange={setBulkMoveOpen}>
        <DialogContent className="max-w-md rounded-xl border border-border p-6 shadow-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">Pindahkan item</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground mt-2">
              Pilih folder tujuan untuk {selected.length} item.
            </DialogDescription>
          </DialogHeader>
          <FolderPicker folders={allFolders} value={bulkMoveFolder} onSelect={setBulkMoveFolder} disabled={selectionForbidden} />
          <DialogFooter className="mt-5 flex items-center justify-end gap-2.5">
            <Button variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setBulkMoveOpen(false)}>
              Batal
            </Button>
            <Button
              className="rounded-lg cursor-pointer font-bold px-6 shadow-sm"
              onClick={bulkMove}
              disabled={!selected.length}
              isLoading={busy === "bulk-move"}
            >
              Pindahkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={deleteTarget?.kind === "folder" ? "Hapus folder?" : "Hapus file?"}
        description={
          deleteTarget?.kind === "folder"
            ? `Folder "${deleteTarget?.name}" beserta seluruh isinya akan dihapus permanen.`
            : `File "${deleteTarget?.name}" akan dihapus permanen.`
        }
        confirmLabel="Ya, Hapus"
        loading={busy === "delete"}
        onConfirm={confirmDelete}
      />

      <AdminConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="Hapus item terpilih?"
        description={`${selected.length} item akan dihapus permanen. Folder beserta seluruh isinya ikut terhapus.`}
        confirmLabel="Ya, Hapus"
        loading={busy === "bulk-delete"}
        onConfirm={bulkDelete}
      />

      <DocumentViewer file={viewerFile} onClose={() => setViewerFile(null)} />
    </div>
  );
}

function ItemMenu({
  item,
  onPreview,
  onDownload,
  onRename,
  onMove,
  onCopy,
  onReplace,
  onDelete,
}: {
  item: TargetItem;
  onPreview?: () => void;
  onDownload?: string;
  onRename?: () => void;
  onMove?: () => void;
  onCopy?: () => void;
  onReplace?: () => void;
  onDelete?: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="bg-background/80 text-muted-foreground hover:text-foreground rounded-md"
          aria-label={`Aksi untuk ${item.name}`}
        >
          <MoreVertical className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1.5">
        <div className="space-y-0.5">
          {onPreview && <MenuButton icon={item.kind === "folder" ? Folder : FileIcon} label="Buka" onClick={onPreview} />}
          {onDownload && (
            <a href={onDownload} className="block">
              <MenuButton icon={Download} label="Unduh" onClick={() => undefined} />
            </a>
          )}
          {onRename && <MenuButton icon={Pencil} label="Ubah Nama" onClick={onRename} />}
          {onMove && <MenuButton icon={Folder} label="Pindahkan" onClick={onMove} />}
          {onCopy && <MenuButton icon={Copy} label="Duplikat" onClick={onCopy} />}
          {onReplace && <MenuButton icon={UploadCloud} label="Ganti File" onClick={onReplace} />}
          {onDelete && (
            <>
              <div className="border-border my-1 border-t" />
              <MenuButton icon={Trash2} label="Hapus" danger onClick={onDelete} />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
