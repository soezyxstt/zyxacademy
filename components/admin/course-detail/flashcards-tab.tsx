"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "@/lib/i18n/client";
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
  const t = useTranslations("adminAcademic");
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
      toast.error(t("courseDetail.flashcards.errors.setTitleRequired"));
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
          toast.success(t("courseDetail.flashcards.success.setUpdated"));
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
          toast.error(t("courseDetail.flashcards.errors.setUpdate"));
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
          toast.success(t("courseDetail.flashcards.success.setCreated"));
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
          toast.error(t("courseDetail.flashcards.errors.setCreate"));
        }
      }
    });
  };

  // Open Card Dialog
  const handleOpenNewCard = (setId?: string) => {
    const activeSetId = setId || (sets[0] ? sets[0].id : "");
    if (!activeSetId) {
      toast.error(t("courseDetail.flashcards.errors.createSetFirst"));
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
      toast.error(t("courseDetail.flashcards.errors.cardSidesRequired"));
      return;
    }
    if (!targetSetId) {
      toast.error(t("courseDetail.flashcards.errors.selectSetFirst"));
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
          toast.success(t("courseDetail.flashcards.success.cardUpdated"));
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
          toast.error(t("courseDetail.flashcards.errors.cardUpdate"));
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
          toast.success(t("courseDetail.flashcards.success.cardAdded"));
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
          toast.error(t("courseDetail.flashcards.errors.cardCreate"));
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
          toast.success(t("courseDetail.flashcards.success.setDeleted"));
          setSets((prev) => prev.filter((s) => s.id !== deleteTarget.id));
          setDeleteTarget(null);
        } else {
          toast.error(t("courseDetail.flashcards.errors.setDelete"));
        }
      } else {
        const res = await deleteFlashcardAction({
          courseSlug,
          id: deleteTarget.id,
        });
        if (res.success) {
          toast.success(t("courseDetail.flashcards.success.cardDeleted"));
          setSets((prev) =>
            prev.map((s) =>
              s.id === deleteTarget.setId
                ? { ...s, cards: s.cards.filter((c) => c.id !== deleteTarget.id) }
                : s
            )
          );
          setDeleteTarget(null);
        } else {
          toast.error(t("courseDetail.flashcards.errors.cardDelete"));
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
          label={t("courseDetail.flashcards.stats.totalSets")}
          value={totalSets}
          caption={t("courseDetail.flashcards.stats.registeredSets")}
        />
        <AdminStatStripItem
          icon={BookOpen}
          label={t("courseDetail.flashcards.stats.totalCards")}
          value={totalCards}
          caption={t("courseDetail.flashcards.stats.allCards")}
        />
        <AdminStatStripItem
          icon={CheckCircle2}
          label={t("courseDetail.flashcards.status.published")}
          value={publishedCards}
          tone="success"
          caption={t("courseDetail.flashcards.stats.availableToStudents")}
        />
        <AdminStatStripItem
          icon={AlertCircle}
          label={t("courseDetail.flashcards.status.draft")}
          value={draftCards}
          tone="default"
          caption={t("courseDetail.flashcards.stats.notPublished")}
        />
      </AdminStatStrip>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <SearchBar
            size="sm"
            placeholder={t("courseDetail.flashcards.search")}
            value={search}
            onSearch={setSearch}
            onClear={() => setSearch("")}
            containerClassName="flex-1 min-w-[160px] max-w-sm"
          />

          <Select value={chapterFilter} onValueChange={setChapterFilter}>
            <SelectTrigger className="w-[160px] h-9 text-body-sm rounded-lg shrink-0">
              <SelectValue placeholder={t("courseDetail.flashcards.allChapters")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("courseDetail.flashcards.allChapters")}</SelectItem>
              <SelectItem value="unassigned">{t("courseDetail.flashcards.unassigned")}</SelectItem>
              {chapters.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}>
                  {t("courseDetail.chapters.orderWithNumber", { number: ch.orderIndex })}: {ch.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9 text-body-sm rounded-lg shrink-0">
              <SelectValue placeholder={t("courseDetail.flashcards.allStatuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("courseDetail.flashcards.allStatuses")}</SelectItem>
              <SelectItem value="published">{t("courseDetail.flashcards.status.published")}</SelectItem>
              <SelectItem value="draft">{t("courseDetail.flashcards.status.draft")}</SelectItem>
              <SelectItem value="retired">{t("courseDetail.flashcards.status.retired")}</SelectItem>
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
            {t("courseDetail.flashcards.addSet")}
          </Button>

          <Button
            size="sm"
            onClick={() => handleOpenNewCard()}
            className="text-body-sm rounded-lg"
          >
            <Plus className="size-4 mr-1.5" />
            {t("courseDetail.flashcards.addCard")}
          </Button>
        </div>
      </div>

      {/* Sets and Cards List */}
      {filteredSets.length === 0 ? (
        <AdminEmptyState
          icon={Layers}
          title={sets.length === 0 ? t("courseDetail.flashcards.emptyTitle") : t("courseDetail.flashcards.noResults")}
          description={
            sets.length === 0
              ? t("courseDetail.flashcards.emptyDescription")
              : t("courseDetail.flashcards.noResultsDescription")
          }
          action={
            sets.length === 0 ? (
              <Button onClick={handleOpenNewSet} size="sm" className="mt-2 text-body-sm rounded-lg">
                <Plus className="size-4 mr-1.5" />
                {t("courseDetail.flashcards.createSet")}
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
                      aria-label={isExpanded ? t("courseDetail.flashcards.collapseSet") : t("courseDetail.flashcards.expandSet")}
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
                        <TooltipContent>{t("courseDetail.flashcards.addCardToSet")}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg"
                            aria-label={t("courseDetail.flashcards.editSet")}
                            onClick={() => handleOpenEditSet(set)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("courseDetail.flashcards.editSet")}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label={t("courseDetail.flashcards.deleteSet")}
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
                        <TooltipContent>{t("courseDetail.flashcards.deleteSet")}</TooltipContent>
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
                      <div className="divide-y divide-border">
                        {set.cards.map((card, idx) => (
                          <div
                            key={card.id}
                            className="py-3 first:pt-0 last:pb-0 flex flex-col justify-between"
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
                            aria-label={t("courseDetail.flashcards.editCard")}
                                    onClick={() => handleOpenEditCard(card, set.id)}
                                  >
                                    <Pencil className="size-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 rounded-md text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label={t("courseDetail.flashcards.deleteCard")}
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
                              <div className="py-1">
                                <span className="text-body-2xs font-semibold text-muted-foreground block mb-1">
                                  Sisi depan (konsep atau pertanyaan)
                                </span>
                                <div className="text-body-sm font-medium text-foreground">
                                  <MathText>{card.front}</MathText>
                                </div>
                              </div>

                              {/* Back */}
                              <div className="border-t border-border/50 pt-2">
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
              {editingSet ? t("courseDetail.flashcards.editSetTitle") : t("courseDetail.flashcards.addSetTitle")}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {t("courseDetail.flashcards.setDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">{t("courseDetail.flashcards.setTitle")}</Label>
              <Input
                placeholder={t("courseDetail.flashcards.setTitlePlaceholder")}
                value={setTitle}
                onChange={(e) => setSetTitle(e.target.value)}
                className="text-body-sm rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">{t("courseDetail.flashcards.linkChapter")}</Label>
              <Select value={setChapterId} onValueChange={setSetChapterId}>
                <SelectTrigger className="w-full text-body-sm rounded-lg">
                  <SelectValue placeholder={t("documents.selectChapter")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("courseDetail.flashcards.noChapter")}</SelectItem>
                  {chapters.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      {t("courseDetail.chapters.orderWithNumber", { number: ch.orderIndex })}: {ch.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">{t("courseDetail.flashcards.statusLabel")}</Label>
              <Select
                value={setStatus}
                onValueChange={(val) => setSetStatus(val as "draft" | "published")}
              >
                <SelectTrigger className="w-full text-body-sm rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">{t("courseDetail.flashcards.status.published")}</SelectItem>
                  <SelectItem value="draft">{t("courseDetail.flashcards.status.draft")}</SelectItem>
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
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveSet}
              disabled={isPending}
              className="text-body-sm rounded-lg"
            >
              {isPending ? t("courseDetail.flashcards.saving") : editingSet ? t("courseDetail.flashcards.saveChanges") : t("courseDetail.flashcards.createSet")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Card Modal */}
      <Dialog open={cardDialogOpen} onOpenChange={setCardDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCard ? t("courseDetail.flashcards.editCardTitle") : t("courseDetail.flashcards.addCardTitle")}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {t("courseDetail.flashcards.cardDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">{t("courseDetail.flashcards.setLabel")}</Label>
              <Select value={targetSetId} onValueChange={setTargetSetId}>
                <SelectTrigger className="w-full text-body-sm rounded-lg">
                  <SelectValue placeholder={t("courseDetail.flashcards.selectSet")} />
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
              <Label className="text-body-sm font-semibold">{t("courseDetail.flashcards.frontSide")}</Label>
              <Textarea
                placeholder={t("courseDetail.flashcards.frontPlaceholder")}
                value={cardFront}
                onChange={(e) => setCardFront(e.target.value)}
                rows={3}
                className="text-body-sm rounded-lg font-mono text-xs"
              />
              {cardFront.trim() && (
                <div className="rounded-md bg-muted/40 p-2.5 border border-border/60 text-body-sm">
                  <span className="text-body-2xs font-semibold text-muted-foreground block mb-1">
                    {t("courseDetail.flashcards.frontPreview")}
                  </span>
                  <MathText>{cardFront}</MathText>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">{t("courseDetail.flashcards.backSide")}</Label>
              <Textarea
                placeholder={t("courseDetail.flashcards.backPlaceholder")}
                value={cardBack}
                onChange={(e) => setCardBack(e.target.value)}
                rows={3}
                className="text-body-sm rounded-lg font-mono text-xs"
              />
              {cardBack.trim() && (
                <div className="rounded-md bg-muted/40 p-2.5 border border-border/60 text-body-sm">
                  <span className="text-body-2xs font-semibold text-muted-foreground block mb-1">
                    {t("courseDetail.flashcards.backPreview")}
                  </span>
                  <MathText>{cardBack}</MathText>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">{t("courseDetail.flashcards.extraExplanation")}</Label>
              <Textarea
                placeholder={t("courseDetail.flashcards.explanationPlaceholder")}
                value={cardExplanation}
                onChange={(e) => setCardExplanation(e.target.value)}
                rows={2}
                className="text-body-sm rounded-lg font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">{t("courseDetail.flashcards.statusLabel")}</Label>
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
                  <SelectItem value="published">{t("courseDetail.flashcards.status.published")}</SelectItem>
                  <SelectItem value="draft">{t("courseDetail.flashcards.status.draft")}</SelectItem>
                  <SelectItem value="retired">{t("courseDetail.flashcards.status.retired")}</SelectItem>
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
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveCard}
              disabled={isPending}
              className="text-body-sm rounded-lg"
            >
              {isPending ? t("courseDetail.flashcards.saving") : editingCard ? t("courseDetail.flashcards.saveChanges") : t("courseDetail.flashcards.addCard")}
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
        title={deleteTarget?.type === "set" ? t("courseDetail.flashcards.deleteSet") : t("courseDetail.flashcards.deleteCard")}
        description={
          deleteTarget?.type === "set"
            ? t("courseDetail.flashcards.deleteSetDescription", { title: deleteTarget.title })
            : t("courseDetail.flashcards.deleteCardDescription")
        }
        confirmLabel={t("courseDetail.flashcards.confirmDelete")}
        destructive
        loading={isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
