"use client";

import { MediaItemsSkeleton } from "@/components/admin/content-loading-skeletons";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
  Loader2,
  MoreVertical,
  Music,
  RefreshCw,
  Image as ImageIcon,
  Video,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { AdminEmptyState } from "@/components/admin/state-panels";
import { DocumentViewer } from "@/components/admin/document-viewer";
import { flattenTree, FolderPicker, type FlatFolder } from "@/components/admin/folder-picker";
import {
  formatBytes,
  STORAGE_DOMAIN_LABELS,
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

type TargetItem = {
  kind: "file" | "folder";
  name: string;
  key?: string;
  folderPath?: string;
};

const fileRef = (key: string) => `file:${key}`;
const folderRef = (path: string) => `folder:${path}`;

function refKindOf(ref: string): "file" | "folder" {
  return ref.startsWith("folder:") ? "folder" : "file";
}

function refValueOf(ref: string): string {
  return ref.startsWith("folder:") ? ref.slice("folder:".length) : ref.slice("file:".length);
}

function domainLabel(name: string): string {
  return STORAGE_DOMAIN_LABELS[name] ?? name;
}

function TreeItem({
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
  const t = useTranslations("adminMedia");
  const isCurrent = current === node.path;
  const hasChildren = node.children.length > 0;
  const label = depth === 0 ? domainLabel(node.name) : node.name;
  const isOpen = expanded.has(node.path);

  return (
    <div>
      <div
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-body-sm transition-colors",
          isCurrent ? "bg-brand-primary/10 font-medium text-brand-primary" : "text-foreground hover:bg-muted"
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        role="button"
        tabIndex={0}
        onClick={() => onNavigate(node.path)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onNavigate(node.path);
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isOpen ? t("storage.closeFolder") : t("storage.openFolder")}
            className="text-muted-foreground cursor-pointer p-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.path);
            }}
          >
            {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden />
        )}
        <Folder className={cn("size-4 shrink-0", isCurrent ? "text-brand-primary" : "text-muted-foreground")} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      {hasChildren && isOpen && (
        <div className="ml-3">
          {node.children.map((child) => (
            <TreeItem
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
      )}
    </div>
  );
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
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-body-sm text-foreground transition-colors hover:bg-muted"
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  );
}

export function StorageBrowser() {
  const t = useTranslations("adminMedia");
  const tRef = useRef(t);
  tRef.current = t;
  const [folder, setFolder] = useState("");
  const [data, setData] = useState<MediaListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [viewerFile, setViewerFile] = useState<MediaFile | null>(null);

  const [copyTarget, setCopyTarget] = useState<TargetItem | null>(null);
  const [copyFolder, setCopyFolder] = useState("");
  const [mediaFolders, setMediaFolders] = useState<FlatFolder[]>([]);
  const [bulkCopyOpen, setBulkCopyOpen] = useState(false);
  const [bulkCopyFolder, setBulkCopyFolder] = useState("");

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/media/storage?folder=${encodeURIComponent(target)}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(tRef.current("storage.loadError"));
      setData(body as unknown as MediaListing);
      setFolder(target);
      setSelected([]);
    } catch {
      setError(tRef.current("storage.loadError"));
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

  function openFile(file: MediaFile) {
    setViewerFile(file);
  }

  async function copyOne(ref: string, targetFolder: string) {
    const kind = refKindOf(ref);
    const value = refValueOf(ref);
    const payload =
      kind === "folder"
        ? { action: "copy", kind: "folder", folderPath: value, targetFolder }
        : { action: "copy", kind: "file", key: value, targetFolder };
    const res = await fetch("/api/admin/media/storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(t("storage.copyError"));
  }

  async function runBulkCopy(targetFolder: string) {
    if (!selected.length) return;
    setBusy(true);
    const refs = [...selected];
    try {
      let okCount = 0;
      for (const ref of refs) {
        try {
          await copyOne(ref, targetFolder);
          okCount += 1;
        } catch {
          toast.error(t("storage.someCopyFailed"));
        }
      }
      toast.success(t("storage.copiedCount", { count: okCount }));
      setSelected([]);
      setBulkCopyOpen(false);
      setBulkCopyFolder("");
    } finally {
      setBusy(false);
    }
  }

  const loadMediaFolders = useCallback(async () => {
    setMediaFolders([]);
    try {
      const res = await fetch(`/api/admin/media?folder=`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as MediaListing;
      if (res.ok && Array.isArray(body.tree)) {
        setMediaFolders(flattenTree(body.tree));
      }
    } catch {
      setMediaFolders([]);
    }
  }, []);

  async function openCopyDialog(target: TargetItem) {
    setCopyTarget(target);
    setCopyFolder("");
    await loadMediaFolders();
  }

  async function runSingleCopy() {
    if (!copyTarget) return;
    setBusy(true);
    try {
      await copyOne(copyTarget.kind === "folder" ? folderRef(copyTarget.folderPath ?? "") : fileRef(copyTarget.key ?? ""), copyFolder);
      toast.success(t("storage.copied"));
      setCopyTarget(null);
    } catch {
      toast.error(t("storage.copyError"));
    } finally {
      setBusy(false);
    }
  }

  const crumbs = folder.split("/").filter(Boolean);

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
        Storage R2
      </button>
      {crumbs.map((crumb, idx) => {
        const path = crumbs.slice(0, idx + 1).join("/");
        const last = idx === crumbs.length - 1;
        const label = idx === 0 ? domainLabel(crumb) : crumb;
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
              {label}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );

  const selectionActions = selected.length > 0 && (
    <div className="border-border bg-background/90 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 shadow-sm">
      <div>
        <p className="text-body-sm font-medium text-foreground">
          {t("storage.selectedSummary", { count: selected.length, files: selectedFileCount, folders: selectedFolderCount })}
        </p>
        {selectedFolderCount > 0 && (
          <p className="text-body-xs text-muted-foreground">{t("storage.selectedFolderContents", { count: selectedFolderCount })}</p>
        )}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="rounded-lg"
          onClick={() => {
            setBulkCopyFolder("");
            void loadMediaFolders();
            setBulkCopyOpen(true);
          }}
          isLoading={busy}
        >
          <Copy className="size-3.5" />
          {t("storage.copyToMedia")}
        </Button>
        <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setSelected([])}>
          {t("media.clear")}
        </Button>
      </div>
    </div>
  );

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <SearchBar
        size="sm"
        value={query}
        onSearch={setQuery}
        onClear={() => setQuery("")}
        placeholder={t("storage.search")}
        containerClassName="min-w-[140px] w-48 shrink-0 sm:w-64"
      />
      {visibleItems.length > 0 && (
        <label className="text-body-sm flex items-center gap-1.5 text-muted-foreground">
          <Checkbox
            checked={allVisibleSelected}
            onCheckedChange={() => toggleSelectAll()}
            aria-label={t("storage.selectAll")}
          />
          {t("storage.selectAllLabel")}
        </label>
      )}
      <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void load(folder)} isLoading={loading}>
        <RefreshCw className="size-3.5" />
        {t("storage.reload")}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {selectionActions}

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">{renderBreadcrumb}</div>
        {headerActions}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="hidden w-48 shrink-0 self-start border-r border-border pr-3 lg:block">
          <p className="text-body-xs text-muted-foreground px-2 pt-1 pb-2 font-semibold uppercase tracking-wide">
            {t("media.folder")}
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
            <span className="truncate">{t("storage.title")}</span>
          </button>
          <div className="mt-1">
            {(data?.tree ?? []).map((f) => (
              <TreeItem
                key={f.path}
                node={f}
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
            <MediaItemsSkeleton />
          ) : error ? (
            <div className="border-border rounded-xl border bg-card p-6 shadow-sm">
              <p className="text-body-sm text-status-error">{error}</p>
              <Button variant="outline" size="sm" className="mt-4 rounded-lg" onClick={() => void load(folder)}>
                {t("storage.reload")}
              </Button>
            </div>
          ) : !data || visibleItems.length === 0 ? (
            <div className="border-border rounded-xl border bg-card shadow-sm">
              <AdminEmptyState
                icon={FolderOpen}
                title={query ? t("media.noResults") : t("media.emptyFolder")}
                description={
                  query
                    ? t("media.noMatches")
                    : t("storage.emptyLocation")
                }
                compact={Boolean(query)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {visibleFolders.map((f) => {
                const ref = folderRef(f.path);
                const isSelected = selected.includes(ref);
                return (
                  <div
                    key={f.path}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(f.path)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate(f.path);
                    }}
                    className={cn(
                      "border-border group relative select-none rounded-xl border bg-card p-2 text-left shadow-sm transition-all",
                      isSelected ? "border-primary ring-1 ring-primary/40" : "hover:border-border/70"
                    )}
                  >
                    <div className="relative">
                      <Checkbox
                        className="bg-background absolute top-1.5 left-1.5 z-10"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => toggleRef(ref)}
                        aria-label={t("media.selectFolder", { name: f.name })}
                      />
                      <div className="bg-muted flex aspect-photo-card w-full items-center justify-center rounded-lg">
                        <Folder className="text-brand-primary size-10 opacity-70" aria-hidden />
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={t("storage.folderActions", { name: f.name })}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-background absolute top-1 right-1 z-10 cursor-pointer rounded-md border border-border p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                          >
                            <MoreVertical className="size-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-44 p-1">
                          <MenuButton
                            icon={Copy}
                            label={t("storage.copyToMedia")}
                            onClick={() => void openCopyDialog({ kind: "folder", name: domainLabel(f.name), folderPath: f.path })}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <p className="mt-2 line-clamp-2 text-body-sm font-medium leading-snug text-foreground">{domainLabel(f.name)}</p>
                    <p className="text-muted-foreground mt-1 text-body-xs">{t("media.folder")}</p>
                  </div>
                );
              })}

              {visibleFiles.map((file) => {
                const ref = fileRef(file.key);
                const isSelected = selected.includes(ref);
                return (
                  <div
                    key={file.key}
                    className={cn(
                      "border-border group relative select-none rounded-xl border bg-card p-2 text-left shadow-sm transition-all",
                      isSelected ? "border-primary ring-1 ring-primary/40" : "hover:border-border/70"
                    )}
                  >
                    <div className="relative">
                      <FileThumb file={file} />
                      <button
                        type="button"
                        onClick={() => openFile(file)}
                        className="absolute inset-0 z-0 cursor-pointer"
                        aria-label={t("media.openFile", { name: file.name })}
                      />
                      <Checkbox
                        className="bg-background absolute top-1.5 left-1.5 z-10"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => toggleRef(ref)}
                        aria-label={t("media.selectFile", { name: file.name })}
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={t("media.selectItemActions", { name: file.name })}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-background absolute top-1 right-1 z-10 cursor-pointer rounded-md border border-border p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                          >
                            <MoreVertical className="size-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-44 p-1">
                          <MenuButton icon={FileIcon} label={t("storage.preview")} onClick={() => openFile(file)} />
                          <MenuButton
                            icon={Download}
                            label={t("storage.openLink")}
                            onClick={() => window.open(file.url, "_blank", "noopener,noreferrer")}
                          />
                          <MenuButton
                            icon={Copy}
                            label={t("storage.copyToMedia")}
                            onClick={() => void openCopyDialog({ kind: "file", name: file.name, key: file.key })}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <p className="mt-2 line-clamp-2 text-body-sm font-medium leading-snug text-foreground">{file.name}</p>
                    <p className="text-muted-foreground mt-1 text-body-xs">{formatBytes(file.size)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={copyTarget !== null} onOpenChange={(open) => !open && setCopyTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("storage.copyToMedia")}</DialogTitle>
            <DialogDescription>
              {t(copyTarget?.kind === "folder" ? "storage.folder" : "storage.file")} &quot;{copyTarget?.name}&quot; {t("storage.copyTargetDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-body-sm font-semibold text-foreground">{t("storage.destinationFolder")}</Label>
            <Input
              value={copyFolder}
              onChange={(e) => setCopyFolder(e.target.value)}
              placeholder={t("storage.rootPlaceholder")}
            />
            <FolderPicker folders={mediaFolders} value={copyFolder} onSelect={setCopyFolder} rootLabel={t("media.rootLabel")} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCopyTarget(null)}>
              {t("media.cancel")}
            </Button>
            <Button onClick={() => void runSingleCopy()} disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="animate-spin size-4" />}
              {t("storage.copy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkCopyOpen} onOpenChange={(open) => !open && setBulkCopyOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("storage.copyToMedia")}</DialogTitle>
            <DialogDescription>
              {t("storage.copyManyDescription", { count: selected.length })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-body-sm font-semibold text-foreground">{t("storage.destinationFolder")}</Label>
            <Input
              value={bulkCopyFolder}
              onChange={(e) => setBulkCopyFolder(e.target.value)}
              placeholder={t("storage.rootPlaceholder")}
            />
            <FolderPicker
              folders={mediaFolders}
              value={bulkCopyFolder}
              onSelect={setBulkCopyFolder}
              rootLabel={t("media.rootLabel")}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkCopyOpen(false)} disabled={busy}>
              {t("media.cancel")}
            </Button>
            <Button onClick={() => void runBulkCopy(bulkCopyFolder)} disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="animate-spin size-4" />}
              {t("storage.copy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentViewer file={viewerFile} onClose={() => setViewerFile(null)} />

      <div className="sr-only" aria-live="polite">
        {busy ? t("storage.processing") : ""}
      </div>
    </div>
  );
}
