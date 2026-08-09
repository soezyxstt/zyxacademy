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
  Search,
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
import { AdminEmptyState } from "@/components/admin/state-panels";
import { DocumentViewer } from "@/components/admin/document-viewer";
import {
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

type FlatFolder = { path: string; label: string; depth: number };

function flattenTree(nodes: MediaTreeNode[], depth = 0, acc: FlatFolder[] = []): FlatFolder[] {
  for (const node of nodes) {
    acc.push({ path: node.path, label: node.name, depth });
    if (node.children.length) flattenTree(node.children, depth + 1, acc);
  }
  return acc;
}

function FileThumb({ file }: { file: MediaFile }) {
  if (file.kind === "image") {
    return (
      <div className="bg-muted relative flex aspect-photo-card w-full items-center justify-center overflow-hidden rounded-lg border border-border/80">
        <Image src={file.url} alt={file.name} fill sizes="(max-width: 768px) 50vw, 25vw" unoptimized className="object-cover" />
      </div>
    );
  }
  const Icon = KIND_ICON[file.kind];
  return (
    <div className="bg-muted flex aspect-photo-card w-full items-center justify-center rounded-lg border border-border/80">
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

function FolderPicker({
  folders,
  value,
  onSelect,
  disabled = new Set<string>(),
}: {
  folders: FlatFolder[];
  value: string;
  onSelect: (path: string) => void;
  disabled?: Set<string>;
}) {
  const options = useMemo(() => [{ path: "", label: "Media (root)", depth: 0 }, ...folders], [folders]);
  return (
    <div className="border-border bg-background max-h-64 overflow-auto rounded-lg border p-1">
      {options.map((option) => {
        const isDisabled = disabled.has(option.path);
        return (
          <button
            key={option.path || "root"}
            type="button"
            disabled={isDisabled}
            onClick={() => onSelect(option.path)}
            style={{ paddingLeft: `${8 + option.depth * 16}px` }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-body-sm transition-colors",
              isDisabled && "cursor-not-allowed opacity-40",
              !isDisabled && value === option.path && "bg-brand-primary/10 font-medium text-brand-primary",
              !isDisabled && value !== option.path && "text-foreground hover:bg-muted"
            )}
          >
            <Folder className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FolderTreeItem({
  node,
  depth,
  current,
  expanded,
  onToggle,
  onNavigate,
}: {
  node: MediaTreeNode;
  depth: number;
  current: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onNavigate: (path: string) => void;
}) {
  const active = current === node.path;
  const isExpanded = expanded.has(node.path);
  return (
    <div>
      <button
        type="button"
        onClick={() => (node.children.length ? onToggle(node.path) : onNavigate(node.path))}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-body-sm transition-colors",
          active ? "bg-brand-primary/10 font-medium text-brand-primary" : "text-foreground hover:bg-muted"
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
            onToggle={onToggle}
            onNavigate={onNavigate}
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
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
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

  const uploadInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/media?folder=${encodeURIComponent(target)}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Gagal memuat media");
      setData(body as unknown as MediaListing);
      setFolder(target);
      setSelectedKeys([]);
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

  const allVisibleSelected = visibleFiles.length > 0 && visibleFiles.every((f) => selectedKeys.includes(f.key));

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

  async function bulkDelete() {
    if (!selectedKeys.length) return;
    setBusy("bulk-delete");
    try {
      for (const key of selectedKeys) {
        await postOp({ action: "delete", kind: "file", key });
      }
      toast.success(`${selectedKeys.length} file berhasil dihapus`);
      setBulkDeleteOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus file");
    } finally {
      setBusy(null);
    }
  }

  async function bulkMove() {
    if (!selectedKeys.length) return;
    setBusy("bulk-move");
    try {
      for (const key of selectedKeys) {
        await postOp({ action: "move", kind: "file", key, targetFolder: bulkMoveFolder });
      }
      toast.success(`${selectedKeys.length} file berhasil dipindahkan`);
      setBulkMoveOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memindahkan file");
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

  const selectionActions = (
    <div className="border-border bg-background/90 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 shadow-sm">
      <p className="text-body-sm font-medium text-foreground">
        {selectedKeys.length} file dipilih
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => setBulkMoveOpen(true)}
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
        >
          <Trash2 className="size-3.5" />
          Hapus
        </Button>
        <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setSelectedKeys([])}>
          Bersihkan
        </Button>
      </div>
    </div>
  );

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari file atau folder"
          className="h-8 w-44 rounded-lg pl-8 text-body-sm sm:w-56"
          aria-label="Cari file atau folder"
        />
      </div>
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
          <p className="text-body-sm font-medium text-foreground">Tarik file ke sini atau klik untuk memilih</p>
          <p className="text-body-xs text-muted-foreground">
            Gambar, video, audio, PDF, markdown, dan teks. Maksimal {formatBytes(MEDIA_MAX_UPLOAD_BYTES)} per file.
          </p>
        </>
      )}
    </div>
  );

  const renderFolderGrid = (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
      {visibleFolders.map((item) => (
        <div
          key={item.path}
          className="border-border group relative cursor-pointer rounded-xl border bg-card p-2 shadow-sm transition-colors hover:border-border"
        >
          <div className="relative">
            <div className="bg-muted flex aspect-photo-card w-full items-center justify-center rounded-lg border border-border/80">
              <Folder className="text-brand-primary size-10 opacity-70" aria-hidden />
            </div>
            <div className="absolute top-1 right-1">
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
            onClick={() => navigate(item.path)}
            className="mt-2 block w-full cursor-pointer text-left"
          >
            <p className="line-clamp-2 text-body-sm font-medium leading-snug text-foreground">{item.name}</p>
            <p className="text-muted-foreground mt-1 text-[11px]">Folder</p>
          </button>
        </div>
      ))}
    </div>
  );

  const renderFileGrid = (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
      {visibleFiles.map((file) => {
        const selected = selectedKeys.includes(file.key);
        return (
          <div
            key={file.key}
            className={cn(
              "border-border relative cursor-pointer rounded-xl border bg-card p-2 shadow-sm transition-colors",
              selected && "border-primary ring-1 ring-primary/40"
            )}
          >
            <div className="relative">
              <FileThumb file={file} />
              <button
                type="button"
                onClick={() => setViewerFile(file)}
                className="absolute inset-0 z-0 cursor-pointer"
                aria-label={`Buka ${file.name}`}
              />
              <div className="absolute top-1.5 left-1.5 z-10">
                <Checkbox
                  checked={selected}
                  aria-label={`Pilih ${file.name}`}
                  onCheckedChange={(checked) => {
                    setSelectedKeys((prev) =>
                      checked ? [...prev, file.key] : prev.filter((k) => k !== file.key)
                    );
                  }}
                />
              </div>
              <div className="absolute top-1 right-1 z-10">
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
              </div>
            </div>
            <button type="button" onClick={() => setViewerFile(file)} className="mt-2 block w-full cursor-pointer text-left">
              <p className="line-clamp-2 text-body-sm font-medium leading-snug text-foreground">{file.name}</p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                {formatBytes(file.size)} · {KIND_LABELS[file.kind]}
              </p>
            </button>
          </div>
        );
      })}
    </div>
  );

  const renderList = (
    <div className="border-border overflow-hidden rounded-xl border bg-card shadow-sm">
      <table className="w-full min-w-[640px] border-collapse text-left text-body-sm">
        <thead>
          <tr className="bg-muted/40 text-muted-foreground border-b">
            <th className="w-10 px-3 py-2.5 font-medium" scope="col">
              {visibleFiles.length > 0 && (
                <Checkbox
                  checked={allVisibleSelected}
                  aria-label="Pilih semua file"
                  onCheckedChange={(checked) => {
                    setSelectedKeys(checked ? visibleFiles.map((f) => f.key) : []);
                  }}
                />
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
          {visibleFiles.map((file) => {
            const selected = selectedKeys.includes(file.key);
            const FileIconComp = KIND_ICON[file.kind];
            return (
              <tr
                key={file.key}
                className={cn("border-border border-b last:border-b-0", selected && "bg-primary/5")}
              >
                <td className="px-3 py-2 align-middle">
                  <Checkbox
                    checked={selected}
                    aria-label={`Pilih ${file.name}`}
                    onCheckedChange={(checked) => {
                      setSelectedKeys((prev) => (checked ? [...prev, file.key] : prev.filter((k) => k !== file.key)));
                    }}
                  />
                </td>
                <td className="px-2 py-2 align-middle">
                  <button
                    type="button"
                    onClick={() => setViewerFile(file)}
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
      {selectedKeys.length > 0 && selectionActions}

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">{renderBreadcrumb}</div>
        {headerActions}
      </div>

      {renderUploadDropzone}

      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="border-border hidden w-56 shrink-0 self-start rounded-xl border bg-card p-2 shadow-sm lg:block">
          <p className="text-body-xs text-muted-foreground px-2 pt-1 pb-2 font-semibold uppercase tracking-wide">
            Folder
          </p>
          <button
            type="button"
            onClick={() => navigate("")}
            className={cn(
              "flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-body-sm transition-colors",
              !folder ? "bg-brand-primary/10 font-medium text-brand-primary" : "text-foreground hover:bg-muted"
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
                onToggle={toggleFolder}
                onNavigate={navigate}
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
              <p className="text-body-sm text-status-error">{error}</p>
              <Button variant="outline" size="sm" className="mt-4 rounded-lg" onClick={refresh}>
                Muat Ulang
              </Button>
            </div>
          ) : data && visibleFolders.length === 0 && visibleFiles.length === 0 ? (
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
            <div className="space-y-6">
              {visibleFolders.length > 0 && (
                <section>
                  {view === "grid" ? (
                    renderFolderGrid
                  ) : (
                    <div className="border-border overflow-hidden rounded-xl border bg-card shadow-sm">
                      <table className="w-full min-w-[640px] border-collapse text-left text-body-sm">
                        <thead>
                          <tr className="bg-muted/40 text-muted-foreground border-b">
                            <th className="w-10 px-3 py-2.5 font-medium" scope="col" />
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
                          {visibleFolders.map((item) => (
                            <tr key={item.path} className="border-border border-b last:border-b-0">
                              <td className="px-3 py-2 align-middle" />
                              <td className="px-2 py-2 align-middle">
                                <button
                                  type="button"
                                  onClick={() => navigate(item.path)}
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
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {visibleFiles.length > 0 && (
                <section>
                  {view === "grid" ? renderFileGrid : renderList}
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent className="max-w-md rounded-xl border border-border p-6 shadow-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-h6 font-bold text-foreground">Buat folder baru</DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground mt-2">
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
            <DialogTitle className="font-heading text-h6 font-bold text-foreground">Ubah nama</DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground mt-2">
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
            <DialogTitle className="font-heading text-h6 font-bold text-foreground">Pindahkan</DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground mt-2">
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
            <DialogTitle className="font-heading text-h6 font-bold text-foreground">Duplikat</DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground mt-2">
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
            <DialogTitle className="font-heading text-h6 font-bold text-foreground">Ganti file</DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground mt-2">
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
            <DialogTitle className="font-heading text-h6 font-bold text-foreground">Pindahkan file</DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground mt-2">
              Pilih folder tujuan untuk {selectedKeys.length} file.
            </DialogDescription>
          </DialogHeader>
          <FolderPicker folders={allFolders} value={bulkMoveFolder} onSelect={setBulkMoveFolder} />
          <DialogFooter className="mt-5 flex items-center justify-end gap-2.5">
            <Button variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setBulkMoveOpen(false)}>
              Batal
            </Button>
            <Button
              className="rounded-lg cursor-pointer font-bold px-6 shadow-sm"
              onClick={bulkMove}
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
        title="Hapus file terpilih?"
        description={`${selectedKeys.length} file akan dihapus permanen.`}
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
