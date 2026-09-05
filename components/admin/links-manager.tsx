"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Link as LinkIcon,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CourseBadge,
  StatusBadge,
} from "@/components/admin/status-badges";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/state-panels";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  DEFAULT_ICON,
  EMOJI_OPTIONS,
  LINK_CATEGORY_SUGGESTIONS,
  LINK_COLORS,
  isValidHttpUrl,
  linkColor,
} from "@/lib/links";

export type LinkRow = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

type LinkForm = {
  title: string;
  url: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  isActive: boolean;
};

const EMPTY_FORM: LinkForm = {
  title: "",
  url: "",
  description: "",
  category: "",
  icon: DEFAULT_ICON,
  color: "neutral",
  isActive: true,
};

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

const chipClasses = (active: boolean) =>
  cn(
    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-body-sm font-medium transition-colors cursor-pointer",
    active
      ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
      : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
  );

export function LinksManager() {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const [form, setForm] = useState<LinkForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/links");
      const data = await res.json();
      if (data.success && Array.isArray(data.links)) {
        setLinks(data.links);
      } else {
        setError(data.error || "Gagal memuat daftar tautan.");
        setLinks([]);
      }
    } catch {
      setError("Terjadi kesalahan jaringan saat memuat tautan.");
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const link of links) {
      if (link.category) set.add(link.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [links]);

  const categorySuggestions = useMemo(() => {
    const set = new Set<string>(LINK_CATEGORY_SUGGESTIONS);
    for (const link of links) {
      if (link.category) set.add(link.category);
    }
    return Array.from(set);
  }, [links]);

  const filteredLinks = useMemo(() => {
    if (!filterCategory) return links;
    return links.filter((link) => (link.category ?? null) === filterCategory);
  }, [links, filterCategory]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (link: LinkRow) => {
    setEditing(link);
    setForm({
      title: link.title,
      url: link.url,
      description: link.description ?? "",
      category: link.category ?? "",
      icon: link.icon || DEFAULT_ICON,
      color: link.color || "neutral",
      isActive: link.isActive,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setFormError("Judul wajib diisi.");
      return;
    }
    if (!isValidHttpUrl(form.url.trim())) {
      setFormError("URL harus diawali dengan http:// atau https://.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        title: form.title.trim(),
        url: form.url.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        icon: form.icon.trim(),
        color: form.color,
        isActive: form.isActive,
      };
      const res = await fetch(
        editing ? `/api/admin/links/${editing.id}` : "/api/admin/links",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (data.success) {
        toast.success(editing ? "Tautan berhasil diperbarui." : "Tautan berhasil ditambahkan.");
        setDialogOpen(false);
        await fetchLinks();
      } else {
        setFormError(data.error || "Gagal menyimpan tautan.");
      }
    } catch {
      setFormError("Terjadi kesalahan jaringan saat menyimpan tautan.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (link: LinkRow) => {
    const next = !link.isActive;
    setLinks((prev) =>
      prev.map((l) => (l.id === link.id ? { ...l, isActive: next } : l))
    );
    try {
      const res = await fetch(`/api/admin/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(next ? "Tautan diaktifkan." : "Tautan dinonaktifkan.");
      } else {
        setLinks((prev) =>
          prev.map((l) => (l.id === link.id ? { ...l, isActive: !next } : l))
        );
        toast.error(data.error || "Gagal mengubah status tautan.");
      }
    } catch {
      setLinks((prev) =>
        prev.map((l) => (l.id === link.id ? { ...l, isActive: !next } : l))
      );
      toast.error("Terjadi kesalahan jaringan.");
    }
  };

  const moveLink = async (link: LinkRow, dir: "up" | "down") => {
    const index = links.findIndex((l) => l.id === link.id);
    const targetIndex = dir === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= links.length) return;
    const target = links[targetIndex];
    setLinks((prev) => {
      const next = [...prev];
      next[index] = target;
      next[targetIndex] = link;
      return next;
    });
    setMovingId(link.id);
    try {
      const res = await fetch(`/api/admin/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move: dir }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Gagal mengubah urutan tautan.");
        await fetchLinks();
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
      await fetchLinks();
    } finally {
      setMovingId(null);
    }
  };

  const executeDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setDeletingId(id);
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/admin/links/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("Tautan berhasil dihapus.");
        setLinks((prev) => prev.filter((l) => l.id !== id));
      } else {
        toast.error(data.error || "Gagal menghapus tautan.");
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setDeletingId(null);
    }
  };

  const renderGrid = () => (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {filteredLinks.map((link) => {
        const color = linkColor(link.color);
        const index = links.findIndex((l) => l.id === link.id);
        const moving = movingId === link.id;
        return (
          <article
            key={link.id}
            className={cn(
              "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all overflow-hidden",
              moving && "opacity-60"
            )}
          >
            <div className="flex items-start justify-between gap-2.5 min-w-0">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg text-lg",
                    color.tile
                  )}
                >
                  {link.icon || DEFAULT_ICON}
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate font-heading text-body-base font-semibold text-foreground" title={link.title}>
                    {link.title}
                  </h3>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={link.url}
                    className="mt-0.5 inline-flex max-w-full items-center gap-1 text-body-xs text-muted-foreground transition-colors hover:text-brand-primary"
                  >
                    <span className="truncate">{displayUrl(link.url)}</span>
                    <ExternalLink className="size-3 shrink-0" aria-hidden />
                  </a>
                </div>
              </div>
              <StatusBadge tone={link.isActive ? "success" : "muted"} className="shrink-0">
                {link.isActive ? "Aktif" : "Nonaktif"}
              </StatusBadge>
            </div>

            {link.description && (
              <p className="text-body-sm leading-normal text-muted-foreground line-clamp-2">
                {link.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-1">
              {link.category && <CourseBadge>{link.category}</CourseBadge>}
              <span
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                title={color.label}
              >
                <span className={cn("size-2 rounded-full", color.dot)} aria-hidden />
                {color.label}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <GripVertical className="size-3" aria-hidden />
                Urutan {link.sortOrder}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Pindah ke atas"
                  aria-label={`Pindah ${link.title} ke atas`}
                  disabled={index <= 0 || moving}
                  onClick={() => moveLink(link, "up")}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Pindah ke bawah"
                  aria-label={`Pindah ${link.title} ke bawah`}
                  disabled={index === -1 || index >= links.length - 1 || moving}
                  onClick={() => moveLink(link, "down")}
                >
                  <ArrowDown className="size-4" />
                </Button>
              </div>

              <div className="flex items-center gap-1 flex-wrap shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-body-xs font-medium"
                  onClick={() => openEdit(link)}
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-body-xs font-medium"
                  onClick={() => toggleActive(link)}
                >
                  {link.isActive ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                  {link.isActive ? "Nonaktif" : "Aktif"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-body-xs font-medium text-status-error hover:text-status-error hover:bg-status-error/10"
                  onClick={() => setConfirmDeleteId(link.id)}
                >
                  <Trash2 className="size-3.5" />
                  Hapus
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={chipClasses(filterCategory === null)}
            onClick={() => setFilterCategory(null)}
          >
            Semua ({links.length})
          </button>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={chipClasses(filterCategory === category)}
              onClick={() =>
                setFilterCategory(filterCategory === category ? null : category)
              }
            >
              {category} ({links.filter((l) => l.category === category).length})
            </button>
          ))}
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Tambah Tautan
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : error ? (
        <AdminErrorState message={error} onRetry={fetchLinks} />
      ) : links.length === 0 ? (
        <AdminEmptyState
          icon={LinkIcon}
          title="Belum ada tautan"
          description="Tambahkan tautan penting pertama untuk mulai mengisi pustaka tautan."
          action={
            <Button onClick={openCreate} className="mt-2">
              <Plus className="size-4" />
              Tambah Tautan
            </Button>
          }
        />
      ) : filteredLinks.length === 0 ? (
        <AdminEmptyState
          compact
          title="Tidak ada tautan pada kategori ini."
        />
      ) : (
        renderGrid()
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saving) {
            setDialogOpen(open);
            if (!open) setFormError(null);
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-xl border border-border p-6 shadow-lg text-left">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold">
              {editing ? "Edit Tautan" : "Tambah Tautan"}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground mt-2">
              {editing
                ? "Perbarui detail tautan di bawah ini."
                : "Lengkapi detail tautan yang ingin ditambahkan."}
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="flex items-center gap-2 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2 text-body-sm text-status-error">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              {formError}
            </div>
          )}

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label
                htmlFor="link-title"
                className="text-body-sm font-semibold text-foreground"
              >
                Judul <span className="text-status-error">*</span>
              </Label>
              <Input
                id="link-title"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Contoh: Portal Akademik ITB"
              />
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor="link-url"
                className="text-body-sm font-semibold text-foreground"
              >
                URL <span className="text-status-error">*</span>
              </Label>
              <Input
                id="link-url"
                value={form.url}
                onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                placeholder="https://..."
              />
              <p className="text-body-xs text-muted-foreground">
                Wajib diawali dengan http:// atau https://
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor="link-description"
                className="text-body-sm font-semibold text-foreground"
              >
                Deskripsi
              </Label>
              <Textarea
                id="link-description"
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="Deskripsi singkat tautan (opsional)"
                rows={2}
              />
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor="link-category"
                className="text-body-sm font-semibold text-foreground"
              >
                Kategori
              </Label>
              <Input
                id="link-category"
                value={form.category}
                onChange={(e) =>
                  setForm((p) => ({ ...p, category: e.target.value }))
                }
                placeholder="Contoh: Materi Belajar"
              />
              <div className="flex flex-wrap gap-1.5">
                {categorySuggestions.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-body-xs font-medium transition-colors cursor-pointer",
                      form.category === category
                        ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    )}
                    onClick={() =>
                      setForm((p) => ({ ...p, category }))
                    }
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-body-sm font-semibold text-foreground">
                Ikon
              </Label>
              <div className="flex items-center gap-2">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                  {form.icon || DEFAULT_ICON}
                </span>
                <Input
                  value={form.icon}
                  onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))}
                  placeholder="Emoji atau teks singkat"
                  className="flex-1"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg border text-lg transition-colors cursor-pointer",
                      form.icon === emoji
                        ? "border-brand-primary bg-brand-primary/10"
                        : "border-border bg-background hover:bg-muted"
                    )}
                    onClick={() => setForm((p) => ({ ...p, icon: emoji }))}
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-body-sm font-semibold text-foreground">
                Warna
              </Label>
              <div className="flex flex-wrap gap-2">
                {LINK_COLORS.map((color) => (
                  <button
                    key={color.key}
                    type="button"
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-body-xs font-semibold transition-colors cursor-pointer",
                      form.color === color.key
                        ? "border-brand-primary bg-brand-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    )}
                    onClick={() => setForm((p) => ({ ...p, color: color.key }))}
                  >
                    <span
                      className={cn("size-2.5 rounded-full", color.dot)}
                      aria-hidden
                    />
                    {color.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <div>
                <Label htmlFor="link-active-status" className="text-body-sm font-semibold text-foreground cursor-pointer">
                  Status aktif
                </Label>
                <p className="text-body-xs text-muted-foreground">
                  Tautan nonaktif tidak muncul di halaman publik.
                </p>
              </div>
              <Switch
                id="link-active-status"
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  setForm((p) => ({ ...p, isActive: checked }))
                }
              />
            </div>
          </div>

          <DialogFooter className="mt-2 flex items-center justify-end gap-2.5">
            <Button
              variant="outline"
              className="rounded-lg cursor-pointer font-bold"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button
              className="rounded-lg cursor-pointer font-bold px-6 shadow-sm"
              onClick={handleSave}
              disabled={saving}
              isLoading={saving}
            >
              {editing ? "Simpan Perubahan" : "Tambahkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
        title="Hapus Tautan"
        description="Tautan akan dihapus dari pustaka. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Ya, Hapus"
        loading={deletingId !== null}
        onConfirm={executeDelete}
      />
    </div>
  );
}
