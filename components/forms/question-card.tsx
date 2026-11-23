"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckSquare,
  ChevronDown,
  CircleDot,
  Clock,
  Copy,
  FileText,
  Grid,
  Grid3X3,
  GripHorizontal,
  Image as ImageIcon,
  ImageOff,
  Info,
  Layers,
  Menu,
  MoreVertical,
  Plus,
  Shuffle,
  Sliders,
  Star,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
} from "lucide-react";
import type { CreateCustomQuestionInput, QuestionType } from "@/lib/google-forms";
import type { FormDisplayMode } from "@/lib/forms/presentation";
import { formFileAccept, FORM_IMAGE_MIMES, type FormFileMime } from "@/lib/forms/file-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ExtendedQuestionInput extends CreateCustomQuestionInput {
  showDescription?: boolean;
  shuffleOptions?: boolean;
  otherOption?: { enabled: boolean; label: string };
  maxFileSizeMb?: number;
  allowedFileTypes?: FormFileMime[];
}

function QuestionTypeIcon({ type, className = "size-4" }: { type: QuestionType; className?: string }) {
  switch (type) {
    case "TEXT":
      return <AlignLeft className={className} />;
    case "PARAGRAPH":
      return <Menu className={className} />;
    case "RADIO":
      return <CircleDot className={className} />;
    case "CHECKBOX":
      return <CheckSquare className={className} />;
    case "DROP_DOWN":
      return <ChevronDown className={className} />;
    case "FILE_UPLOAD":
      return <UploadCloud className={className} />;
    case "SCALE":
      return <Sliders className={className} />;
    case "RATING":
      return <Star className={className} />;
    case "GRID_RADIO":
      return <Grid className={className} />;
    case "GRID_CHECKBOX":
      return <Grid3X3 className={className} />;
    case "DATE":
      return <Calendar className={className} />;
    case "TIME":
      return <Clock className={className} />;
    case "SECTION":
      return <Layers className={className} />;
    case "STATEMENT":
      return <Info className={className} />;
    default:
      return <AlignLeft className={className} />;
  }
}

function SafeQuestionImage({
  src,
  alt,
  compact = false,
  onZoom,
  onRemove,
  removeLabel,
  enlargeLabel,
}: {
  src: string;
  alt: string;
  compact?: boolean;
  onZoom?: () => void;
  onRemove?: () => void;
  removeLabel: string;
  enlargeLabel: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-body-xs text-muted-foreground">
        <ImageOff className="size-4 shrink-0" />
        <span>Gambar tidak tersedia</span>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={removeLabel}
            className="ml-1 text-muted-foreground hover:text-destructive"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="relative inline-block overflow-hidden rounded-lg border border-border bg-muted/20 p-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        onClick={(e) => {
          if (onZoom) {
            e.stopPropagation();
            onZoom();
          }
        }}
        className={`${compact ? "max-h-32" : "max-h-52"} rounded-md object-contain ${onZoom ? "cursor-pointer" : ""}`}
      />
      {!compact && onZoom && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onZoom();
          }}
          className="absolute bottom-2.5 left-2.5 h-7 gap-1 px-2 text-body-xs shadow-sm"
        >
          <ZoomIn className="size-3.5" />
          {enlargeLabel}
        </Button>
      )}
      {!compact && onRemove && (
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={removeLabel}
          className="absolute top-2.5 right-2.5 shadow-sm hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

interface QuestionCardProps {
  question: ExtendedQuestionInput;
  qIdx: number;
  totalItems: number;
  questionNumber: number;
  sectionIndex?: { current: number; total: number };
  displayMode: FormDisplayMode;
  isActive: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  isUploading: boolean;
  onActivate: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onChange: (updated: Partial<ExtendedQuestionInput>) => void;
  onAddOption: () => void;
  onOptionChange: (optIndex: number, value: string) => void;
  onRemoveOption: (optIndex: number) => void;
  onAddGridRow: () => void;
  onGridRowChange: (rIndex: number, value: string) => void;
  onRemoveGridRow: (rIndex: number) => void;
  onAddGridCol: () => void;
  onGridColChange: (cIndex: number, value: string) => void;
  onRemoveGridCol: (cIndex: number) => void;
  onImageUpload: (file: File) => void;
  onZoomImage: (uri: { url: string; title: string }) => void;
}

export function QuestionCard({
  question: q,
  qIdx,
  totalItems,
  questionNumber,
  sectionIndex,
  displayMode,
  isActive,
  isDragging,
  isDragOver,
  isUploading,
  onActivate,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
  onChange,
  onAddOption,
  onOptionChange,
  onRemoveOption,
  onAddGridRow,
  onGridRowChange,
  onRemoveGridRow,
  onAddGridCol,
  onGridColChange,
  onRemoveGridCol,
  onImageUpload,
  onZoomImage,
}: QuestionCardProps) {
  const t = useTranslations("adminForms");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isSection = q.type === "SECTION";
  const isStatement = q.type === "STATEMENT";
  const isChoice = q.type === "RADIO" || q.type === "CHECKBOX" || q.type === "DROP_DOWN";
  const isGrid = q.type === "GRID_RADIO" || q.type === "GRID_CHECKBOX";
  const hasDescriptionVisible = isStatement || isSection ? true : (q.showDescription ?? Boolean(q.description?.trim()));

  const handleTypeChange = (nextType: QuestionType) => {
    const patch: Partial<ExtendedQuestionInput> = { type: nextType };
    if ((nextType === "RADIO" || nextType === "CHECKBOX" || nextType === "DROP_DOWN") && (!q.options || q.options.length === 0)) {
      patch.options = ["Opsi 1"];
    }
    if ((nextType === "GRID_RADIO" || nextType === "GRID_CHECKBOX") && (!q.gridRows || q.gridRows.length === 0)) {
      patch.gridRows = ["Baris 1", "Baris 2"];
    }
    if ((nextType === "GRID_RADIO" || nextType === "GRID_CHECKBOX") && (!q.gridColumns || q.gridColumns.length === 0)) {
      patch.gridColumns = ["Kolom 1", "Kolom 2"];
    }
    if (nextType === "SCALE") {
      patch.scaleLow = q.scaleLow ?? 1;
      patch.scaleHigh = q.scaleHigh ?? 5;
    }
    if (nextType === "SECTION" || nextType === "STATEMENT") {
      patch.required = false;
    }
    onChange(patch);
  };

  // --- INACTIVE (CLEAN LESS-CARDS DIVIDED ROW) ---
  if (!isActive) {
    return (
      <div
        data-qidx={qIdx}
        role="button"
        tabIndex={0}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onActivate();
          }
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`group transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          isDragging
            ? "opacity-40 bg-muted/30"
            : isDragOver
            ? "bg-primary/5"
            : "hover:bg-muted/30"
        }`}
      >
        {isSection && sectionIndex && (
          <div className="flex items-center gap-2 pt-5 px-2">
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-body-xs font-semibold text-primary">
              {t("ui.section")} {sectionIndex.current} / {sectionIndex.total}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        )}

        <div className={`px-2 ${isSection ? "pt-2.5 pb-5" : "py-5"} space-y-3`}>
          {/* Card title & required asterisk */}
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <p className="font-heading text-body-base font-semibold text-foreground break-words">
                {!isSection && !isStatement && questionNumber > 0 && (
                  <span className="mr-1.5 text-muted-foreground font-normal">{questionNumber}.</span>
                )}
                {q.title?.trim() ? (
                  q.title
                ) : (
                  <span className="text-muted-foreground font-normal">
                    {isSection
                      ? t("ui.newSectionName")
                      : isStatement
                      ? t("ui.information")
                      : t("ui.questionText")}
                  </span>
                )}
                {!isSection && !isStatement && (q.required ?? true) && (
                  <span className="ml-1 text-status-error" aria-hidden="true">*</span>
                )}
              </p>
              {isStatement && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-body-2xs font-medium text-muted-foreground">
                  <Info className="size-3" />
                  {t("ui.information")}
                </span>
              )}
            </div>

            {q.description?.trim() && (
              <p className="text-body-xs text-muted-foreground whitespace-pre-line break-words">
                {q.description}
              </p>
            )}
          </div>

          {q.imageUrl && (
            <SafeQuestionImage
              src={q.imageUrl}
              alt={t("ui.questionImagePreview")}
              compact
              removeLabel={t("ui.removeImage")}
              enlargeLabel={t("ui.enlarge")}
            />
          )}

          {/* Compact read-only preview of answer input */}
          {q.type === "TEXT" && (
            <div className="w-full sm:w-2/3 border-b border-dashed border-border pb-1.5 text-body-xs text-muted-foreground">
              {t("ui.shortAnswer")}
            </div>
          )}

          {q.type === "PARAGRAPH" && (
            <div className="w-full border-b border-dashed border-border pb-1.5 text-body-xs text-muted-foreground">
              {t("ui.longAnswer")}
            </div>
          )}

          {isChoice && (
            <div className="space-y-1.5">
              {(q.options || ["Opsi 1"]).map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-2.5 text-body-sm text-muted-foreground">
                  {q.type === "RADIO" && <span className="size-4 rounded-full border border-border-strong shrink-0" />}
                  {q.type === "CHECKBOX" && <span className="size-4 rounded-sm border border-border-strong shrink-0" />}
                  {q.type === "DROP_DOWN" && (
                    <span className="w-4 text-body-xs font-mono text-muted-foreground shrink-0">{oIdx + 1}.</span>
                  )}
                  <span className="truncate">{opt || `Opsi ${oIdx + 1}`}</span>
                </div>
              ))}
              {q.otherOption?.enabled && (
                <div className="flex items-center gap-2.5 text-body-sm text-muted-foreground">
                  {q.type === "RADIO" ? (
                    <span className="size-4 rounded-full border border-border-strong shrink-0" />
                  ) : (
                    <span className="size-4 rounded-sm border border-border-strong shrink-0" />
                  )}
                  <span className="italic">{q.otherOption.label || "Lainnya"}...</span>
                </div>
              )}
            </div>
          )}

          {q.type === "FILE_UPLOAD" && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-1.5 text-body-xs text-muted-foreground">
              <UploadCloud className="size-3.5" />
              <span>Maks. {q.maxFileSizeMb || 10} MB</span>
            </div>
          )}

          {q.type === "SCALE" && (
            <div className="flex flex-wrap items-center gap-3 text-body-xs text-muted-foreground">
              <span>{q.scaleLowLabel || "1"}</span>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className="inline-flex size-6 items-center justify-center rounded-full border border-border text-body-2xs">
                    {n}
                  </span>
                ))}
              </div>
              <span>{q.scaleHighLabel || "5"}</span>
            </div>
          )}

          {q.type === "RATING" && (
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className="size-4 text-muted-foreground/60" />
              ))}
            </div>
          )}

          {isGrid && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-xs text-muted-foreground">
              <span>{t("ui.rows")}: {(q.gridRows || []).length}</span>
              <span>{t("ui.columns")}: {(q.gridColumns || []).length}</span>
            </div>
          )}

          {q.type === "DATE" && (
            <div className="inline-flex items-center gap-2 border-b border-dashed border-border pb-1 text-body-xs text-muted-foreground">
              <Calendar className="size-3.5" />
              <span>{t("ui.dateFormat")}</span>
            </div>
          )}

          {q.type === "TIME" && (
            <div className="inline-flex items-center gap-2 border-b border-dashed border-border pb-1 text-body-xs text-muted-foreground">
              <Clock className="size-3.5" />
              <span>{t("ui.timeFormat")}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- ACTIVE (FOCUSED EDIT BOUNDARY) ---
  return (
    <div
      data-qidx={qIdx}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`my-2 rounded-xl border border-border border-l-4 border-l-primary bg-card shadow-sm transition-colors ${
        isDragging ? "opacity-40 border-dashed" : isDragOver ? "bg-primary/5" : ""
      }`}
    >
      {/* Section Header Strip */}
      {isSection && sectionIndex && (
        <div className="flex items-center justify-between border-b border-border/60 bg-primary/10 px-5 py-1.5 rounded-tr-xl">
          <span className="text-body-xs font-semibold text-primary">
            {t("ui.section")} {sectionIndex.current} / {sectionIndex.total}
          </span>
          <span className="text-body-xs text-muted-foreground">
            {displayMode === "section"
              ? "Memulai halaman baru"
              : "Pemisah visual"}
          </span>
        </div>
      )}

      {/* Subtle Top-Center Drag Handle */}
      <div className="flex justify-center pt-1.5">
        <div
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title={t("ui.dragReorder")}
          aria-label={t("ui.dragReorder")}
          className="inline-flex items-center justify-center rounded-md px-4 py-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground cursor-grab active:cursor-grabbing transition-colors"
        >
          <GripHorizontal className="size-4" />
        </div>
      </div>

      <div className="px-5 pb-4 pt-2 space-y-4">
        {/* Row 1: Title Input + Inline Image Button + Question Type Select */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex flex-1 min-w-0 items-center gap-2">
            <Input
              type="text"
              aria-label={isSection ? t("ui.section") : isStatement ? t("ui.optionalInfoTitle") : t("ui.questionText")}
              placeholder={
                isSection
                  ? t("ui.newSectionName")
                  : isStatement
                  ? t("ui.optionalInfoTitle")
                  : t("ui.questionText")
              }
              value={q.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="flex-1 min-w-0 h-10 rounded-b-none rounded-t-md border-0 border-b-2 border-border bg-muted/40 px-3 text-body-sm font-medium text-foreground shadow-none focus-visible:border-primary focus-visible:bg-muted/60 focus-visible:ring-0"
            />

            {/* Hidden file input for question image */}
            <input
              ref={fileInputRef}
              type="file"
              accept={formFileAccept(FORM_IMAGE_MIMES)}
              disabled={isUploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImageUpload(f);
                e.target.value = "";
              }}
              className="hidden"
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isUploading}
                  isLoading={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={isStatement ? t("ui.uploadStatement") : t("ui.uploadQuestion")}
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <ImageIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isUploading
                  ? t("ui.uploading")
                  : isStatement
                  ? t("ui.uploadStatement")
                  : t("ui.uploadQuestion")}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="w-full sm:w-52 shrink-0">
            <Select value={q.type} onValueChange={(val: QuestionType) => handleTypeChange(val)}>
              <SelectTrigger aria-label={t("ui.questionType")} className="h-10 w-full text-body-sm">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-muted-foreground shrink-0">
                    <QuestionTypeIcon type={q.type} />
                  </span>
                  <SelectValue placeholder={t("ui.questionType")} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TEXT">{t("ui.typeShortAnswer")}</SelectItem>
                <SelectItem value="PARAGRAPH">{t("ui.typeParagraph")}</SelectItem>
                <SelectItem value="RADIO">{t("ui.typeMultipleChoice")}</SelectItem>
                <SelectItem value="CHECKBOX">{t("ui.typeCheckboxes")}</SelectItem>
                <SelectItem value="DROP_DOWN">{t("ui.typeDropdown")}</SelectItem>
                <SelectItem value="FILE_UPLOAD">{t("ui.typeFileUpload")}</SelectItem>
                <SelectItem value="SCALE">{t("ui.typeScale")}</SelectItem>
                <SelectItem value="RATING">{t("ui.typeRating")}</SelectItem>
                <SelectItem value="GRID_RADIO">{t("ui.typeRadioGrid")}</SelectItem>
                <SelectItem value="GRID_CHECKBOX">{t("ui.typeCheckboxGrid")}</SelectItem>
                <SelectItem value="DATE">{t("ui.typeDate")}</SelectItem>
                <SelectItem value="TIME">{t("ui.typeTime")}</SelectItem>
                <SelectItem value="SECTION">{t("ui.typeSection")}</SelectItem>
                <SelectItem value="STATEMENT">{t("ui.typeStatement")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Optional Description Field */}
        {hasDescriptionVisible && (
          isStatement ? (
            <Textarea
              rows={3}
              aria-label={t("ui.statementText")}
              placeholder={t("ui.statementText")}
              value={q.description || ""}
              onChange={(e) => onChange({ description: e.target.value })}
              className="w-full text-body-sm resize-y"
            />
          ) : (
            <Input
              type="text"
              aria-label={t("ui.questionDescription")}
              placeholder={t("ui.questionDescription")}
              value={q.description || ""}
              onChange={(e) => onChange({ description: e.target.value })}
              className="h-8 rounded-none border-0 border-b border-border/70 bg-transparent px-0 text-body-xs text-muted-foreground shadow-none focus-visible:border-primary focus-visible:ring-0"
            />
          )
        )}

        {/* Attached Image Preview */}
        {q.imageUrl && (
          <SafeQuestionImage
            src={q.imageUrl}
            alt={t("ui.questionImagePreview")}
            onZoom={() => onZoomImage({ url: q.imageUrl!, title: q.title })}
            onRemove={() => onChange({ imageUrl: undefined })}
            removeLabel={t("ui.removeImage")}
            enlargeLabel={t("ui.enlarge")}
          />
        )}

        {/* Answer Area by Question Type */}
        {q.type === "TEXT" && (
          <div className="w-full sm:w-2/3 border-b border-dashed border-border pb-1.5 text-body-sm text-muted-foreground">
            {t("ui.shortAnswer")}
          </div>
        )}

        {q.type === "PARAGRAPH" && (
          <div className="w-full border-b border-dashed border-border pb-1.5 text-body-sm text-muted-foreground">
            {t("ui.longAnswer")}
          </div>
        )}

        {isChoice && (
          <div className="space-y-2">
            {(q.options || []).map((opt, oIdx) => (
              <div key={oIdx} className="flex items-center gap-2.5">
                <span className="text-muted-foreground shrink-0">
                  {q.type === "RADIO" && <span className="block size-4 rounded-full border border-border-strong" />}
                  {q.type === "CHECKBOX" && <span className="block size-4 rounded-sm border border-border-strong" />}
                  {q.type === "DROP_DOWN" && (
                    <span className="inline-block w-4 text-center font-mono text-body-xs text-muted-foreground">
                      {oIdx + 1}.
                    </span>
                  )}
                </span>

                <Input
                  type="text"
                  value={opt}
                  onChange={(e) => onOptionChange(oIdx, e.target.value)}
                  placeholder={`Opsi ${oIdx + 1}`}
                  className="h-9 flex-1 rounded-none border-0 border-b border-transparent bg-transparent px-1 text-body-sm shadow-none hover:border-border focus-visible:border-primary focus-visible:ring-0"
                />

                {(q.options || []).length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRemoveOption(oIdx)}
                    aria-label={t("ui.deleteOption")}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            ))}

            {q.otherOption?.enabled && (
              <div className="flex items-center gap-2.5">
                <span className="text-muted-foreground shrink-0">
                  {q.type === "RADIO" ? (
                    <span className="block size-4 rounded-full border border-border-strong" />
                  ) : (
                    <span className="block size-4 rounded-sm border border-border-strong" />
                  )}
                </span>
                <span className="flex-1 border-b border-dashed border-border py-1.5 text-body-sm text-muted-foreground">
                  {q.otherOption.label || "Lainnya"}...
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onChange({ otherOption: { enabled: false, label: "Lainnya" } })}
                  aria-label={t("ui.deleteOption")}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </Button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onAddOption}
                className="inline-flex items-center gap-2 text-body-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <Plus className="size-4" />
                <span>{t("ui.addOption")}</span>
              </button>

              {(q.type === "RADIO" || q.type === "CHECKBOX") && !q.otherOption?.enabled && (
                <>
                  <span className="text-body-xs text-muted-foreground">atau</span>
                  <button
                    type="button"
                    onClick={() => onChange({ otherOption: { enabled: true, label: "Lainnya" } })}
                    className="text-body-sm font-medium text-primary hover:underline cursor-pointer"
                  >
                    Tambahkan &quot;Lainnya&quot;
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {q.type === "FILE_UPLOAD" && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Label htmlFor={`file-size-${qIdx}`} className="text-body-sm text-muted-foreground">
              {t("ui.maxSize")}
            </Label>
            <Select
              value={String(q.maxFileSizeMb || 10)}
              onValueChange={(value) => onChange({ maxFileSizeMb: Number(value) })}
            >
              <SelectTrigger id={`file-size-${qIdx}`} aria-label="Maksimal ukuran berkas" className="w-28 h-9 text-body-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 25, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} MB
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {q.type === "SCALE" && (
          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            <div className="flex items-center gap-2">
              <span className="w-5 text-body-sm font-medium text-muted-foreground">1</span>
              <Input
                type="text"
                placeholder={t("ui.minScale")}
                value={q.scaleLowLabel || ""}
                onChange={(e) => onChange({ scaleLowLabel: e.target.value })}
                className="h-9 flex-1 text-body-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 text-body-sm font-medium text-muted-foreground">5</span>
              <Input
                type="text"
                placeholder={t("ui.maxScale")}
                value={q.scaleHighLabel || ""}
                onChange={(e) => onChange({ scaleHighLabel: e.target.value })}
                className="h-9 flex-1 text-body-sm"
              />
            </div>
          </div>
        )}

        {q.type === "RATING" && (
          <div className="flex items-center gap-2 pt-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star key={star} className="size-5 text-status-warning fill-status-warning/25" />
            ))}
          </div>
        )}

        {isGrid && (
          <div className="grid gap-5 sm:grid-cols-2 pt-1">
            <div className="space-y-2">
              <p className="text-body-sm font-semibold text-foreground">{t("ui.rows")}</p>
              {(q.gridRows || ["Baris 1", "Baris 2"]).map((rowVal, rIdx) => (
                <div key={rIdx} className="flex items-center gap-2">
                  <span className="w-5 font-mono text-body-xs text-muted-foreground">{rIdx + 1}.</span>
                  <Input
                    type="text"
                    value={rowVal}
                    onChange={(e) => onGridRowChange(rIdx, e.target.value)}
                    className="h-9 flex-1 rounded-none border-0 border-b border-border/70 bg-transparent px-1 text-body-sm shadow-none focus-visible:border-primary focus-visible:ring-0"
                  />
                  {(q.gridRows || []).length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRemoveGridRow(rIdx)}
                      aria-label={t("ui.deleteOption")}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={onAddGridRow}
                className="inline-flex items-center gap-1.5 pt-1 text-body-sm text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Plus className="size-3.5" />
                {t("ui.addRow")}
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-body-sm font-semibold text-foreground">{t("ui.columns")}</p>
              {(q.gridColumns || ["Kolom 1", "Kolom 2"]).map((colVal, cIdx) => (
                <div key={cIdx} className="flex items-center gap-2">
                  <span className="text-muted-foreground shrink-0">
                    {q.type === "GRID_RADIO" ? (
                      <span className="block size-3.5 rounded-full border border-border-strong" />
                    ) : (
                      <span className="block size-3.5 rounded-sm border border-border-strong" />
                    )}
                  </span>
                  <Input
                    type="text"
                    value={colVal}
                    onChange={(e) => onGridColChange(cIdx, e.target.value)}
                    className="h-9 flex-1 rounded-none border-0 border-b border-border/70 bg-transparent px-1 text-body-sm shadow-none focus-visible:border-primary focus-visible:ring-0"
                  />
                  {(q.gridColumns || []).length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRemoveGridCol(cIdx)}
                      aria-label={t("ui.deleteOption")}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={onAddGridCol}
                className="inline-flex items-center gap-1.5 pt-1 text-body-sm text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Plus className="size-3.5" />
                {t("ui.addColumn")}
              </button>
            </div>
          </div>
        )}

        {q.type === "DATE" && (
          <div className="inline-flex items-center gap-2 border-b border-dashed border-border pb-1.5 text-body-sm text-muted-foreground">
            <Calendar className="size-4" />
            <span>{t("ui.dateFormat")}</span>
          </div>
        )}

        {q.type === "TIME" && (
          <div className="inline-flex items-center gap-2 border-b border-dashed border-border pb-1.5 text-body-sm text-muted-foreground">
            <Clock className="size-4" />
            <span>{t("ui.timeFormat")}</span>
          </div>
        )}

        {/* Google Forms Bottom-Right Action Footer */}
        <div className="flex flex-wrap items-center justify-end gap-1 border-t border-border/60 pt-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={qIdx === 0}
                onClick={onMoveUp}
                aria-label={t("ui.moveUp")}
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
              >
                <ArrowUp className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("ui.moveUp")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={qIdx === totalItems - 1}
                onClick={onMoveDown}
                aria-label={t("ui.moveDown")}
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
              >
                <ArrowDown className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("ui.moveDown")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onDuplicate}
                aria-label={t("ui.copyQuestion")}
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
              >
                <Copy className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("ui.copyQuestion")}</TooltipContent>
          </Tooltip>

          {!isStatement && !isSection && (
            <>
              <div className="mx-1.5 hidden h-5 w-px bg-border sm:block" />
              <div className="inline-flex items-center gap-2 px-1">
                <Label
                  htmlFor={`question-required-${qIdx}`}
                  className="text-body-sm text-foreground cursor-pointer"
                >
                  {t("ui.required")}
                </Label>
                <Switch
                  id={`question-required-${qIdx}`}
                  checked={q.required ?? true}
                  onCheckedChange={(checked) => onChange({ required: Boolean(checked) })}
                />
              </div>
            </>
          )}

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("ui.moreOptions")}
                    className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("ui.moreOptions")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-52">
              {!isStatement && !isSection && (
                <DropdownMenuItem
                  onSelect={() => onChange({ showDescription: !hasDescriptionVisible })}
                >
                  <FileText className="size-4" />
                  {hasDescriptionVisible ? t("ui.hideSubtext") : t("ui.showSubtext")}
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                onSelect={() => {
                  if (q.imageUrl) {
                    onChange({ imageUrl: undefined });
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
              >
                <ImageIcon className="size-4" />
                {q.imageUrl ? t("ui.removeImage") : t("ui.attachImage")}
              </DropdownMenuItem>

              {isChoice && (
                <DropdownMenuItem
                  onSelect={() => onChange({ shuffleOptions: !q.shuffleOptions })}
                >
                  <Shuffle className="size-4" />
                  {q.shuffleOptions ? t("ui.disableShuffle") : t("ui.shuffle")}
                </DropdownMenuItem>
              )}

              {totalItems > 1 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={onRemove}
                  >
                    <Trash2 className="size-4" />
                    {t("ui.deleteQuestion")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
