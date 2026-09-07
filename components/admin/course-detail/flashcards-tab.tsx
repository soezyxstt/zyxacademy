"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Layers,
  Plus,
  Search,
  Trash2,
  Pencil,
  FileQuestion,
  ChevronDown,
  ChevronRight,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  FolderPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SearchBar } from "@/components/ui/search-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { StatusBadge } from "@/components/admin/status-badges";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { MathText } from "@/components/course/math-text";
import { FormattedDate } from "@/components/ui/formatted-date";
import type {
  AdminFlashcardCard,
  AdminFlashcardSet,
} from "@/app/(admin)/admin/(academic)/courses/flashcard-actions";
import {
  createFlashcardSetAction,
  updateFlashcardSetAction,
  deleteFlashcardSetAction,
  createFlashcardAction,
  updateFlashcardAction,
  deleteFlashcardAction,
} from "@/app/(admin)/admin/(academic)/courses/flashcard-actions";

type Chapter = {
  id: string;
  title: string;
  orderIndex: number;
};

type Props = {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  chapters: Chapter[];
  initialSets: AdminFlashcardSet[];
};

export function FlashcardsTab({
  courseId,
  courseTitle,
  courseSlug,
  chapters,
  initialSets,
}: Props) {
  const [sets, setSets] = useState<AdminFlashcardSet[]>(initialSets);
  const [search, setSearch] = useState("");
  const [chapterFilter, setChapterFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedSets, setExpandedSets] = useState<Set<string>>(
    () => new Set(initialSets.map((s) => s.id))
  );

  const [isPending, startTransition] = useTransition();

  // Set Modal state
  const [setDialogOpen, setSetDialogOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<AdminFlashcardSet | null>(null);
  const [setTitle, setSetTitle] = useState("");
  const [setChapterId, setSetChapterId] = useState<string>("none");
  const [setStatus, setSetStatus] = useState<"draft" | "published">("published");

  // Card Modal state
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<{
    card: AdminFlashcardCard;
    setId: string;
  } | null>(null);
  const [targetSetId, setTargetSetId] = useState<string>("");
  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");
  const [cardExplanation, setCardExplanation] = useState("");
  const [cardStatus, setCardStatus] = useState<"draft" | "published" | "retired">("published");

  // Delete Confirm Dialog state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "set" | "card";
    id: string;
    title: string;
    setId?: string;
  } | null>(null);

  // Statistics
  const totalSets = sets.length;
  const totalCards = useMemo(
    () => sets.reduce((acc, s) => acc + s.cards.length, 0),
    [sets]
  );
  const publishedCards = useMemo(
    () =>
      sets.reduce(
        (acc, s) => acc + s.cards.filter((c) => c.status === "published").length,
        0
      ),
    [sets]
  );
  const draftCards = useMemo(
    () =>
      sets.reduce(
        (acc, s) => acc + s.cards.filter((c) => c.status === "draft").length,
        0
      ),
    [sets]
  );

  // Filtering
  const filteredSets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sets
      .filter((set) => {
        if (chapterFilter !== "all") {
          if (chapterFilter === "unassigned") {
            if (set.chapterId) return false;
          } else if (set.chapterId !== chapterFilter) {
            return false;
          }
        }
        if (statusFilter !== "all" && set.status !== statusFilter) {
          return false;
        }
        return true;
      })
      .map((set) => {
        if (!q) return set;
        const matchingCards = set.cards.filter(
          (c) =>
            c.front.toLowerCase().includes(q) ||
            c.back.toLowerCase().includes(q) ||
            (c.explanation && c.explanation.toLowerCase().includes(q))
        );
        const titleMatch = set.title.toLowerCase().includes(q);
        if (titleMatch) return set;
        return {
          ...set,
          cards: matchingCards,
        };
      })
      .filter((set) => {
        if (!q) return true;
        return (
          set.title.toLowerCase().includes(q) || set.cards.length > 0
        );
      });
  }, [sets, search, chapterFilter, statusFilter]);

  const toggleSetExpanded = (setId: string) => {
    setExpandedSets((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) next.delete(setId);
      else next.add(setId);
      return next;
    });
  };

  // Open Set Dialog
  const handleOpenNewSet = () => {
    setEditingSet(null);
    setSetTitle("");
    setSetChapterId(chapters[0]?.id ?? "none");
    setSetStatus("published");
    setSetDialogOpen(true);
  };

  const handleOpenEditSet = (set: AdminFlashcardSet) => {
    setEditingSet(set);
    setSetTitle(set.title);
    setSetChapterId(set.chapterId ?? "none");
    setSetStatus(set.status === "retired" ? "draft" : set.status === "in_review" ? "draft" : set.status);
    setSetDialogOpen(true);
  };

  // Save Set
  const handleSaveSet = () => {
    const title = setTitle.trim();
    if (!title) {
      toast.error("Judul set flashcard wajib diisi");
      return;
    }
    const babId = setChapterId === "none" ? null : setChapterId;

    startTransition(async () => {
      if (editingSet) {
        const res = await updateFlashcardSetAction({
          courseSlug,
          setId: editingSet.id,
          title,
          babId,
          status: setStatus,
        });
        if (res.success) {
          toast.success("Set flashcard berhasil diperbarui");
          setSets((prev) =>
            prev.map((s) =>
              s.id === editingSet.id
                ? {
                    ...s,
                    title,
                    chapterId: babId,
                    chapterTitle: babId
                      ? chapters.find((c) => c.id === babId)?.title ?? null
                      : null,
                    status: setStatus,
                    updatedAt: new Date(),
                  }
                : s
            )
          );
          setSetDialogOpen(false);
        } else {
          toast.error(res.error || "Gagal memperbarui set");
        }
      } else {
        const res = await createFlashcardSetAction({
          courseSlug,
          courseId,
          babId,
          title,
          status: setStatus,
        });
        if (res.success && res.setId) {
          toast.success("Set flashcard berhasil dibuat");
          const newSet: AdminFlashcardSet = {
            id: res.setId,
            title,
            courseId,
            chapterId: babId,
            chapterTitle: babId
              ? chapters.find((c) => c.id === babId)?.title ?? null
              : null,
            status: setStatus,
            createdAt: new Date(),
            updatedAt: new Date(),
            cards: [],
          };
          setSets((prev) => [newSet, ...prev]);
          setExpandedSets((prev) => new Set([...prev, res.setId!]));
          setSetDialogOpen(false);
        } else {
          toast.error(res.error || "Gagal membuat set");
        }
      }
    });
  };

  // Open Card Dialog
  const handleOpenNewCard = (setId?: string) => {
    const activeSetId = setId || (sets[0] ? sets[0].id : "");
    if (!activeSetId) {
      toast.error("Buat set flashcard terlebih dahulu");
      return;
    }
    setEditingCard(null);
    setTargetSetId(activeSetId);
    setCardFront("");
    setCardBack("");
    setCardExplanation("");
    setCardStatus("published");
    setCardDialogOpen(true);
  };

  const handleOpenEditCard = (card: AdminFlashcardCard, setId: string) => {
    setEditingCard({ card, setId });
    setTargetSetId(setId);
    setCardFront(card.front);
    setCardBack(card.back);
    setCardExplanation(card.explanation ?? "");
    setCardStatus(card.status);
    setCardDialogOpen(true);
  };

  // Save Card
  const handleSaveCard = () => {
    const front = cardFront.trim();
    const back = cardBack.trim();
    if (!front || !back) {
      toast.error("Sisi depan dan belakang kartu wajib diisi");
      return;
    }
    if (!targetSetId) {
      toast.error("Pilih set flashcard terlebih dahulu");
      return;
    }

    startTransition(async () => {
      if (editingCard) {
        const res = await updateFlashcardAction({
          courseSlug,
          id: editingCard.card.id,
          setId: targetSetId,
          front,
          back,
          explanation: cardExplanation.trim() || null,
          status: cardStatus,
        });
        if (res.success) {
          toast.success("Flashcard berhasil diperbarui");
          setSets((prev) => {
            const oldSetId = editingCard.setId;
            const newSetId = targetSetId;
            const updatedCard: AdminFlashcardCard = {
              ...editingCard.card,
              setId: newSetId,
              front,
              back,
              explanation: cardExplanation.trim() || null,
              status: cardStatus,
              updatedAt: new Date(),
            };

            if (oldSetId === newSetId) {
              return prev.map((s) =>
                s.id === oldSetId
                  ? {
                      ...s,
                      cards: s.cards.map((c) =>
                        c.id === updatedCard.id ? updatedCard : c
                      ),
                    }
                  : s
              );
            } else {
              return prev.map((s) => {
                if (s.id === oldSetId) {
                  return {
                    ...s,
                    cards: s.cards.filter((c) => c.id !== updatedCard.id),
                  };
                }
                if (s.id === newSetId) {
                  return {
                    ...s,
                    cards: [updatedCard, ...s.cards],
                  };
                }
                return s;
              });
            }
          });
          setCardDialogOpen(false);
        } else {
          toast.error(res.error || "Gagal memperbarui flashcard");
        }
      } else {
        const res = await createFlashcardAction({
          courseSlug,
          setId: targetSetId,
          front,
          back,
          explanation: cardExplanation.trim() || null,
          status: cardStatus === "retired" ? "published" : cardStatus,
        });
        if (res.success && res.cardId) {
          toast.success("Flashcard berhasil ditambahkan");
          const newCard: AdminFlashcardCard = {
            id: res.cardId,
            setId: targetSetId,
            front,
            back,
            explanation: cardExplanation.trim() || null,
            status: cardStatus === "retired" ? "published" : cardStatus,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          setSets((prev) =>
            prev.map((s) =>
              s.id === targetSetId
                ? { ...s, cards: [newCard, ...s.cards] }
                : s
            )
          );
          setCardDialogOpen(false);
        } else {
          toast.error(res.error || "Gagal menambahkan flashcard");
        }
      }
    });
  };

  // Delete Confirm
  const handleConfirmDelete = () => {
    if (!deleteTarget) return;

    startTransition(async () => {
      if (deleteTarget.type === "set") {
        const res = await deleteFlashcardSetAction({
          courseSlug,
          setId: deleteTarget.id,
        });
        if (res.success) {
          toast.success("Set flashcard berhasil dihapus");
          setSets((prev) => prev.filter((s) => s.id !== deleteTarget.id));
          setDeleteTarget(null);
        } else {
          toast.error(res.error || "Gagal menghapus set flashcard");
        }
      } else {
        const res = await deleteFlashcardAction({
          courseSlug,
          id: deleteTarget.id,
        });
        if (res.success) {
          toast.success("Flashcard berhasil dihapus");
          setSets((prev) =>
            prev.map((s) =>
              s.id === deleteTarget.setId
                ? { ...s, cards: s.cards.filter((c) => c.id !== deleteTarget.id) }
                : s
            )
          );
          setDeleteTarget(null);
        } else {
          toast.error(res.error || "Gagal menghapus flashcard");
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Grouped KPI Strip */}
      <AdminStatStrip className="grid-cols-2 lg:grid-cols-4">
        <AdminStatStripItem
          icon={Layers}
          label="Total set"
          value={totalSets}
          caption="Set kartu terdaftar"
        />
        <AdminStatStripItem
          icon={BookOpen}
          label="Total kartu"
          value={totalCards}
          caption="Seluruh kartu flashcard"
        />
        <AdminStatStripItem
          icon={CheckCircle2}
          label="Published"
          value={publishedCards}
          tone="success"
          caption="Dapat diakses murid"
        />
        <AdminStatStripItem
          icon={AlertCircle}
          label="Draft"
          value={draftCards}
          tone="default"
          caption="Belum dipublikasikan"
        />
      </AdminStatStrip>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <SearchBar
            size="sm"
            placeholder="Cari konsep, pertanyaan, atau pembahasan..."
            value={search}
            onSearch={setSearch}
            onClear={() => setSearch("")}
            containerClassName="flex-1 min-w-[160px] max-w-sm"
          />

          <Select value={chapterFilter} onValueChange={setChapterFilter}>
            <SelectTrigger className="w-[160px] h-9 text-body-sm rounded-lg shrink-0">
              <SelectValue placeholder="Semua bab" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua bab</SelectItem>
              <SelectItem value="unassigned">Tanpa bab</SelectItem>
              {chapters.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}>
                  Bab {ch.orderIndex}: {ch.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9 text-body-sm rounded-lg shrink-0">
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="retired">Retired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenNewSet}
            className="text-body-sm rounded-lg"
          >
            <FolderPlus className="size-4 mr-1.5" />
            Tambah set
          </Button>

          <Button
            size="sm"
            onClick={() => handleOpenNewCard()}
            className="text-body-sm rounded-lg"
          >
            <Plus className="size-4 mr-1.5" />
            Tambah kartu
          </Button>
        </div>
      </div>

      {/* Sets and Cards List */}
      {filteredSets.length === 0 ? (
        <AdminEmptyState
          icon={Layers}
          title={sets.length === 0 ? "Belum ada flashcard" : "Tidak ada hasil"}
          description={
            sets.length === 0
              ? "Mata kuliah ini belum memiliki set flashcard. Buat set pertama untuk menambahkan kartu hafalan konsep."
              : "Tidak ada kartu atau set yang sesuai dengan filter pencarian saat ini."
          }
          action={
            sets.length === 0 ? (
              <Button onClick={handleOpenNewSet} size="sm" className="mt-2 text-body-sm rounded-lg">
                <Plus className="size-4 mr-1.5" />
                Buat set flashcard
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredSets.map((set) => {
            const isExpanded = expandedSets.has(set.id);
            return (
              <div
                key={set.id}
                className="rounded-xl border border-border bg-card shadow-xs overflow-hidden transition-all"
              >
                {/* Set Header */}
                <div className="flex items-center justify-between p-4 bg-muted/20 border-b border-border gap-3">
                  <div
                    className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                    onClick={() => toggleSetExpanded(set.id)}
                  >
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      aria-label={isExpanded ? "Tutup set" : "Buka set"}
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-5" />
                      ) : (
                        <ChevronRight className="size-5" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-heading text-body-base font-bold text-foreground truncate">
                          {set.title}
                        </h3>
                        <StatusBadge
                          tone={
                            set.status === "published"
                              ? "success"
                              : set.status === "draft"
                              ? "muted"
                              : "warning"
                          }
                        >
                          {set.status}
                        </StatusBadge>
                        {set.chapterTitle && (
                          <Badge variant="outline" className="text-body-2xs">
                            {set.chapterTitle}
                          </Badge>
                        )}
                      </div>
                      <p className="text-body-xs text-muted-foreground mt-0.5">
                        {set.cards.length} kartu
                        {set.updatedAt && (
                          <>
                            {" "}
                            · diperbarui{" "}
                            <FormattedDate date={set.updatedAt} />
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Actions for Set */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-body-xs rounded-lg text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => handleOpenNewCard(set.id)}
                          >
                            <Plus className="size-3.5 mr-1" />
                            Kartu
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Tambah kartu ke set ini</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg"
                            aria-label="Edit set"
                            onClick={() => handleOpenEditSet(set)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit set</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label="Hapus set"
                            onClick={() =>
                              setDeleteTarget({
                                type: "set",
                                id: set.id,
                                title: set.title,
                              })
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Hapus set</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Cards Container */}
                {isExpanded && (
                  <div className="p-4">
                    {set.cards.length === 0 ? (
                      <div className="py-8 text-center text-body-sm text-muted-foreground">
                        Belum ada kartu di dalam set ini.
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenNewCard(set.id)}
                            className="text-body-xs rounded-lg"
                          >
                            <Plus className="size-3.5 mr-1" />
                            Tambah kartu pertama
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {set.cards.map((card, idx) => (
                          <div
                            key={card.id}
                            className="rounded-lg border border-border bg-background p-3 flex flex-col justify-between hover:border-primary/40 transition-colors"
                          >
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-body-2xs font-semibold text-muted-foreground">
                                  #{idx + 1}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <StatusBadge
                                    tone={
                                      card.status === "published"
                                        ? "success"
                                        : card.status === "draft"
                                        ? "muted"
                                        : "warning"
                                    }
                                  >
                                    {card.status}
                                  </StatusBadge>

                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 rounded-md"
                                    aria-label="Edit kartu"
                                    onClick={() => handleOpenEditCard(card, set.id)}
                                  >
                                    <Pencil className="size-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 rounded-md text-destructive hover:text-destructive hover:bg-destructive/10"
                                    aria-label="Hapus kartu"
                                    onClick={() =>
                                      setDeleteTarget({
                                        type: "card",
                                        id: card.id,
                                        title: card.front.slice(0, 40) + "...",
                                        setId: set.id,
                                      })
                                    }
                                  >
                                    <Trash2 className="size-3" />
                                  </Button>
                                </div>
                              </div>

                              {/* Front */}
                              <div className="rounded-md bg-muted/30 p-2.5 border border-border/50">
                                <span className="text-body-2xs font-semibold text-muted-foreground block mb-1">
                                  Sisi depan (konsep atau pertanyaan)
                                </span>
                                <div className="text-body-sm font-medium text-foreground">
                                  <MathText>{card.front}</MathText>
                                </div>
                              </div>

                              {/* Back */}
                              <div className="rounded-md bg-muted/10 p-2.5 border border-border/50">
                                <span className="text-body-2xs font-semibold text-muted-foreground block mb-1">
                                  Sisi belakang (jawaban)
                                </span>
                                <div className="text-body-sm text-foreground">
                                  <MathText>{card.back}</MathText>
                                </div>
                              </div>

                              {/* Explanation */}
                              {card.explanation && (
                                <div className="text-body-xs text-muted-foreground pt-1 border-t border-border/40">
                                  <span className="font-medium text-foreground">
                                    Penjelasan:{" "}
                                  </span>
                                  <MathText as="span">{card.explanation}</MathText>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Set Modal */}
      <Dialog open={setDialogOpen} onOpenChange={setSetDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {editingSet ? "Edit set flashcard" : "Tambah set flashcard"}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              Set flashcard mengelompokkan kartu hafalan untuk satu bab atau materi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">Judul set</Label>
              <Input
                placeholder="misal: Flashcard Bab 1 Limit dan Kontinuitas"
                value={setTitle}
                onChange={(e) => setSetTitle(e.target.value)}
                className="text-body-sm rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">Kaitkan ke bab</Label>
              <Select value={setChapterId} onValueChange={setSetChapterId}>
                <SelectTrigger className="w-full text-body-sm rounded-lg">
                  <SelectValue placeholder="Pilih bab" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa bab (umum)</SelectItem>
                  {chapters.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      Bab {ch.orderIndex}: {ch.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">Status</Label>
              <Select
                value={setStatus}
                onValueChange={(val) => setSetStatus(val as "draft" | "published")}
              >
                <SelectTrigger className="w-full text-body-sm rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSetDialogOpen(false)}
              disabled={isPending}
              className="text-body-sm rounded-lg"
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={handleSaveSet}
              disabled={isPending}
              className="text-body-sm rounded-lg"
            >
              {isPending ? "Menyimpan..." : editingSet ? "Simpan perubahan" : "Buat set"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Card Modal */}
      <Dialog open={cardDialogOpen} onOpenChange={setCardDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCard ? "Edit kartu flashcard" : "Tambah kartu flashcard"}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              Tulis pertanyaan di sisi depan dan jawaban di sisi belakang. Gunakan format LaTeX $...$ untuk rumus matematika.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">Set flashcard</Label>
              <Select value={targetSetId} onValueChange={setTargetSetId}>
                <SelectTrigger className="w-full text-body-sm rounded-lg">
                  <SelectValue placeholder="Pilih set" />
                </SelectTrigger>
                <SelectContent>
                  {sets.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">Sisi depan (konsep atau pertanyaan)</Label>
              <Textarea
                placeholder="misal: Berapakah nilai $\lim_{x \to 0} \frac{\sin x}{x}$?"
                value={cardFront}
                onChange={(e) => setCardFront(e.target.value)}
                rows={3}
                className="text-body-sm rounded-lg font-mono text-xs"
              />
              {cardFront.trim() && (
                <div className="rounded-md bg-muted/40 p-2.5 border border-border/60 text-body-sm">
                  <span className="text-body-2xs font-semibold text-muted-foreground block mb-1">
                    Preview tampilan depan:
                  </span>
                  <MathText>{cardFront}</MathText>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">Sisi belakang (jawaban)</Label>
              <Textarea
                placeholder="misal: $1$"
                value={cardBack}
                onChange={(e) => setCardBack(e.target.value)}
                rows={3}
                className="text-body-sm rounded-lg font-mono text-xs"
              />
              {cardBack.trim() && (
                <div className="rounded-md bg-muted/40 p-2.5 border border-border/60 text-body-sm">
                  <span className="text-body-2xs font-semibold text-muted-foreground block mb-1">
                    Preview tampilan belakang:
                  </span>
                  <MathText>{cardBack}</MathText>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">Penjelasan tambahan (opsional)</Label>
              <Textarea
                placeholder="misal: Gunakan aturan L'Hopital atau pendekatan deret Taylor."
                value={cardExplanation}
                onChange={(e) => setCardExplanation(e.target.value)}
                rows={2}
                className="text-body-sm rounded-lg font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">Status</Label>
              <Select
                value={cardStatus}
                onValueChange={(val) =>
                  setCardStatus(val as "draft" | "published" | "retired")
                }
              >
                <SelectTrigger className="w-full text-body-sm rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCardDialogOpen(false)}
              disabled={isPending}
              className="text-body-sm rounded-lg"
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={handleSaveCard}
              disabled={isPending}
              className="text-body-sm rounded-lg"
            >
              {isPending ? "Menyimpan..." : editingCard ? "Simpan perubahan" : "Tambah kartu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={deleteTarget?.type === "set" ? "Hapus set flashcard" : "Hapus flashcard"}
        description={
          deleteTarget?.type === "set"
            ? `Apakah Anda yakin ingin menghapus set "${deleteTarget.title}"? Seluruh kartu di dalam set ini juga akan dihapus.`
            : `Apakah Anda yakin ingin menghapus kartu ini? Tindakan ini tidak dapat dibatalkan.`
        }
        confirmLabel="Ya, hapus"
        destructive
        loading={isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
