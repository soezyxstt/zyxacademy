"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "@/lib/i18n/client";
import {
  Layers,
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  FolderPlus,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminIconAction } from "@/components/admin/icon-action";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    <div className="space-y-(--related-gap)">
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
      <div className="group/flashcard-toolbar flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 max-sm:[&:has(>[data-search-expanded=true])>:not([data-search-expanded=true]):not([data-active-filter])]:hidden">
          <SearchBar
            collapsible
            size="sm"
            containerClassName="min-w-[140px]"
            placeholder={t("courseDetail.flashcards.search")}
            value={search}
            onSearch={setSearch}
            onClear={() => setSearch("")}
          />

          <Select value={chapterFilter} onValueChange={setChapterFilter}>
            <SelectTrigger
              variant="inline"
              aria-label={t("courseDetail.flashcards.linkChapter")}
              data-active-filter={chapterFilter === "all" ? undefined : ""}
              className="max-w-40 shrink-0"
            >
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
            <SelectTrigger
              variant="inline"
              aria-label={t("courseDetail.flashcards.statusLabel")}
              data-active-filter={statusFilter === "all" ? undefined : ""}
              className="max-w-36 shrink-0"
            >
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

        <div className="ml-auto flex shrink-0 items-center gap-2 max-sm:group-has-[[data-search-expanded=true]]/flashcard-toolbar:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <AdminIconAction label={t("courseDetail.flashcards.addMenu")}><Plus aria-hidden /></AdminIconAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleOpenNewSet}>
                <FolderPlus aria-hidden /> {t("courseDetail.flashcards.addSet")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleOpenNewCard()}>
                <Plus aria-hidden /> {t("courseDetail.flashcards.addCard")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
        <div className="divide-y divide-border/60 border-y border-border/60">
          {filteredSets.map((set) => {
            const isExpanded = expandedSets.has(set.id);
            return (
              <section key={set.id}>
                <div className="flex items-start justify-between gap-2 py-1">
                  <button
                    type="button"
                    onClick={() => toggleSetExpanded(set.id)}
                    aria-expanded={isExpanded}
                    className="flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-md py-2 text-left hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {isExpanded ? (
                      <ChevronDown className="mt-0.5 size-4 shrink-0" aria-hidden />
                    ) : (
                      <ChevronRight className="mt-0.5 size-4 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 wrap-anywhere font-heading text-body-sm font-bold text-foreground">
                          {set.title}
                        </span>
                        <StatusBadge
                          tone={
                            set.status === "published"
                              ? "success"
                              : set.status === "draft"
                              ? "muted"
                              : "warning"
                          }
                        >
                          {t(`courseDetail.flashcards.status.${set.status}`)}
                        </StatusBadge>
                        {set.chapterTitle && (
                          <Badge variant="outline" className="min-w-0 whitespace-normal break-words text-body-xs">
                            {set.chapterTitle}
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block text-body-xs text-muted-foreground">
                        {set.cards.length} kartu
                        {set.updatedAt && (
                          <>
                            {" "}
                            · diperbarui{" "}
                            <FormattedDate date={set.updatedAt} />
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`${t("courses.actions")} · ${set.title}`} className="shrink-0">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => handleOpenNewCard(set.id)}>
                        <Plus className="size-4" />
                        {t("courseDetail.flashcards.addCardToSet")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleOpenEditSet(set)}>
                        <Pencil className="size-4" />
                        {t("courseDetail.flashcards.editSet")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget({ type: "set", id: set.id, title: set.title })}>
                        <Trash2 className="size-4" />
                        {t("courseDetail.flashcards.deleteSet")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Cards Container */}
                {isExpanded && (
                  <div className="ml-6 border-t border-border/60 py-(--compact-gap)">
                    {set.cards.length === 0 ? (
                      <AdminEmptyState
                        icon={Layers}
                        title="Belum ada kartu"
                        className="py-4"
                        action={
                          <Button variant="outline" size="sm" onClick={() => handleOpenNewCard(set.id)}>
                            <Plus className="size-4" />
                            Tambah kartu pertama
                          </Button>
                        }
                      />
                    ) : (
                      <div className="divide-y divide-border/60">
                        {set.cards.map((card, idx) => (
                          <div
                            key={card.id}
                            className="py-(--row-padding) first:pt-0 last:pb-0"
                          >
                            <div className="space-y-2">
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
                                    {t(`courseDetail.flashcards.status.${card.status}`)}
                                  </StatusBadge>

                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" aria-label={`${t("courses.actions")} · ${idx + 1}`}>
                                        <MoreHorizontal className="size-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onSelect={() => handleOpenEditCard(card, set.id)}>
                                        <Pencil className="size-4" />
                                        {t("courseDetail.flashcards.editCard")}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onSelect={() => setDeleteTarget({
                                          type: "card",
                                          id: card.id,
                                          title: card.front.slice(0, 40) + "...",
                                          setId: set.id,
                                        })}
                                      >
                                        <Trash2 className="size-4" />
                                        {t("courseDetail.flashcards.deleteCard")}
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>

                              {/* Front */}
                              <div>
                                <span className="mb-1 block text-body-xs font-semibold text-muted-foreground">
                                  Sisi depan (konsep atau pertanyaan)
                                </span>
                                <div className="text-body-sm font-medium text-foreground">
                                  <MathText>{card.front}</MathText>
                                </div>
                              </div>

                              {/* Back */}
                              <div className="border-t border-border/50 pt-2">
                                <span className="mb-1 block text-body-xs font-semibold text-muted-foreground">
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
              </section>
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

          <div className="space-y-(--compact-gap)">
            <div className="space-y-1.5">
              <Label htmlFor="flashcard-set-title" className="text-body-sm font-semibold">{t("courseDetail.flashcards.setTitle")}</Label>
              <Input id="flashcard-set-title"
                placeholder={t("courseDetail.flashcards.setTitlePlaceholder")}
                value={setTitle}
                onChange={(e) => setSetTitle(e.target.value)}
                className="text-body-sm rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="flashcard-set-chapter" className="text-body-sm font-semibold">{t("courseDetail.flashcards.linkChapter")}</Label>
              <Select value={setChapterId} onValueChange={setSetChapterId}>
                <SelectTrigger id="flashcard-set-chapter" className="h-9 bg-muted/35">
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
              <Label htmlFor="flashcard-set-status" className="text-body-sm font-semibold">{t("courseDetail.flashcards.statusLabel")}</Label>
              <Select
                value={setStatus}
                onValueChange={(val) => setSetStatus(val as "draft" | "published")}
              >
                <SelectTrigger id="flashcard-set-status" className="h-9 bg-muted/35">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">{t("courseDetail.flashcards.status.published")}</SelectItem>
                  <SelectItem value="draft">{t("courseDetail.flashcards.status.draft")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex-row flex-wrap justify-end">
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
        <DialogContent className="sm:max-w-[560px] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCard ? t("courseDetail.flashcards.editCardTitle") : t("courseDetail.flashcards.addCardTitle")}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {t("courseDetail.flashcards.cardDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-(--compact-gap)">
            <div className="space-y-1.5">
              <Label htmlFor="flashcard-card-set" className="text-body-sm font-semibold">{t("courseDetail.flashcards.setLabel")}</Label>
              <Select value={targetSetId} onValueChange={setTargetSetId}>
                <SelectTrigger id="flashcard-card-set" className="h-9 bg-muted/35">
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
              <Label htmlFor="flashcard-card-front" className="text-body-sm font-semibold">{t("courseDetail.flashcards.frontSide")}</Label>
              <Textarea id="flashcard-card-front"
                placeholder={t("courseDetail.flashcards.frontPlaceholder")}
                value={cardFront}
                onChange={(e) => setCardFront(e.target.value)}
                rows={3}
                className="text-body-sm rounded-lg font-mono"
              />
              {cardFront.trim() && (
                <div className="border-l-2 border-border/60 pl-3 text-body-sm">
                  <span className="mb-1 block text-body-xs font-semibold text-muted-foreground">
                    {t("courseDetail.flashcards.frontPreview")}
                  </span>
                  <MathText>{cardFront}</MathText>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="flashcard-card-back" className="text-body-sm font-semibold">{t("courseDetail.flashcards.backSide")}</Label>
              <Textarea id="flashcard-card-back"
                placeholder={t("courseDetail.flashcards.backPlaceholder")}
                value={cardBack}
                onChange={(e) => setCardBack(e.target.value)}
                rows={3}
                className="text-body-sm rounded-lg font-mono"
              />
              {cardBack.trim() && (
                <div className="border-l-2 border-border/60 pl-3 text-body-sm">
                  <span className="mb-1 block text-body-xs font-semibold text-muted-foreground">
                    {t("courseDetail.flashcards.backPreview")}
                  </span>
                  <MathText>{cardBack}</MathText>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="flashcard-card-explanation" className="text-body-sm font-semibold">{t("courseDetail.flashcards.extraExplanation")}</Label>
              <Textarea id="flashcard-card-explanation"
                placeholder={t("courseDetail.flashcards.explanationPlaceholder")}
                value={cardExplanation}
                onChange={(e) => setCardExplanation(e.target.value)}
                rows={2}
                className="text-body-sm rounded-lg font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="flashcard-card-status" className="text-body-sm font-semibold">{t("courseDetail.flashcards.statusLabel")}</Label>
              <Select
                value={cardStatus}
                onValueChange={(val) =>
                  setCardStatus(val as "draft" | "published" | "retired")
                }
              >
                <SelectTrigger id="flashcard-card-status" className="h-9 bg-muted/35">
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

          <DialogFooter className="flex-row flex-wrap justify-end">
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
