import type { ReactNode } from "react";
import { ArrowRight, BookOpen, Check, Eye, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormattedDate } from "@/components/ui/formatted-date";
import { StatusBadge } from "@/components/admin/status-badges";
import { cn } from "@/lib/utils";

export type MaterialBundleRow = {
  id: string;
  bundleId: string;
  checksum: string;
  courseId: string | null;
  chapterId?: string | null;
  chapterLabel?: string | null;
  bundleTitle?: string | null;
  requestedBy?: string;
  status: string;
  validationReport: Record<string, unknown>;
  createdAt: string;
};

export type WorkflowStep = {
  number: number;
  title: string;
  description: string;
};

const statusLabels: Record<string, string> = {
  validated: "Menunggu review",
  approved: "Disetujui",
  rejected: "Ditolak",
  draft: "Draft",
  published: "Terbit",
  withdrawn: "Ditarik",
  discarding: "Penghapusan tertunda",
};

const statusTones: Record<string, "muted" | "info" | "success" | "warning" | "error" | "brand"> = {
  validated: "warning",
  approved: "success",
  rejected: "error",
  draft: "info",
  published: "success",
  withdrawn: "muted",
  discarding: "warning",
};

const dateOptions: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

function reportNumber(report: Record<string, unknown>, key: string): number | null {
  const value = report[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function itemSummary(row: MaterialBundleRow, kind: "idea" | "product") {
  if (kind === "idea") {
    const ideas = reportNumber(row.validationReport, "ideaCount");
    const entities = reportNumber(row.validationReport, "entityCount");
    const relations = reportNumber(row.validationReport, "relationCount");
    return [
      ideas !== null ? `${ideas} Idea` : entities !== null ? `${entities} item` : null,
      relations !== null ? `${relations} relasi` : null,
    ].filter(Boolean).join(" · ") || "Isi belum diringkas";
  }

  const products = reportNumber(row.validationReport, "productCount");
  const dependencies = reportNumber(row.validationReport, "dependencyCount");
  return [
    products !== null ? `${products} produk` : null,
    dependencies !== null ? `${dependencies} hubungan` : null,
  ].filter(Boolean).join(" · ") || "Isi belum diringkas";
}

export function WorkflowStepBar({ steps, currentStep }: { steps: WorkflowStep[]; currentStep: number }) {
  const columnClass = steps.length === 3 ? "lg:grid-cols-3" : steps.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-5";

  return (
    <ol className={cn("grid gap-2 grid-cols-2", columnClass)} aria-label="Tahapan proses">
      {steps.map((step) => {
        const complete = step.number < currentStep;
        const active = step.number === currentStep;
        return (
          <li
            key={step.number}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5",
              active ? "border-brand-primary/40 bg-brand-primary/5" : "border-border bg-card",
            )}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border text-body-xs font-bold",
                complete && "border-status-success bg-status-success text-white",
                active && "border-brand-primary bg-brand-primary text-white",
                !complete && !active && "border-border bg-muted text-muted-foreground",
              )}
            >
              {complete ? <Check className="size-3" aria-hidden /> : step.number}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className={cn("block truncate text-body-xs font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
                {step.title}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function WorkflowFooter({
  children,
  onBack,
  onNext,
  backDisabled = false,
  nextDisabled = false,
  nextLabel = "Lanjut",
}: {
  children?: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  backDisabled?: boolean;
  nextDisabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {onBack && (
          <Button type="button" variant="outline" onClick={onBack} disabled={backDisabled}>
            Kembali
          </Button>
        )}
        {children}
      </div>
      {onNext && (
        <div className="ml-auto shrink-0">
          <Button type="button" onClick={onNext} disabled={nextDisabled}>
            {nextLabel}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function MaterialArtifactCard({
  row,
  kind,
  courseLabel,
  chapterLabel: chapterLabelProp,
  authorLabel,
  onInspect,
  loading = false,
  showCourse = true,
}: {
  row: MaterialBundleRow;
  kind: "idea" | "product";
  courseLabel?: string;
  chapterLabel?: string;
  authorLabel?: string;
  onInspect: () => void;
  loading?: boolean;
  showCourse?: boolean;
}) {
  const label = kind === "idea" ? "Source Pack + Idea" : "Product";
  const statusLabel = statusLabels[row.status] ?? row.status;
  const tone = statusTones[row.status] ?? "muted";
  const resolvedChapterLabel = chapterLabelProp ?? row.chapterLabel ?? null;
  const cardTitle = row.bundleTitle || resolvedChapterLabel || courseLabel || "Mata kuliah belum terpetakan";

  return (
    <article className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            <FileArchive className="size-3.5" aria-hidden />
            {label}
          </Badge>
          <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
          {resolvedChapterLabel && (
            <Badge variant="secondary" className="gap-1.5 text-body-xs font-medium">
              <BookOpen className="size-3" aria-hidden />
              {resolvedChapterLabel}
            </Badge>
          )}
        </div>
        <h3 className="truncate font-heading text-body-base font-semibold text-foreground">
          {cardTitle}
        </h3>
        {showCourse && courseLabel && cardTitle !== courseLabel && (
          <p className="text-body-xs font-medium text-muted-foreground">
            {courseLabel}
          </p>
        )}
        <p className="text-body-xs text-muted-foreground">
          Diupload <FormattedDate date={row.createdAt} options={dateOptions} />
        </p>
        <p className="text-body-xs text-muted-foreground">
          {authorLabel ?? "Admin tidak diketahui"} · {itemSummary(row, kind)}
        </p>
        <details className="text-body-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium hover:text-foreground">Lihat identitas teknis</summary>
          <div className="mt-2 space-y-1 border-l-2 border-border pl-3">
            <p className="break-all">Bundle ID: {row.bundleId}</p>
            <p className="break-all">Checksum: {row.checksum}</p>
          </div>
        </details>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={loading} onClick={onInspect}>
        <Eye className="size-4" />
        Buka review
      </Button>
    </article>
  );
}

export function formatStatusLabel(status: string) {
  return statusLabels[status] ?? status;
}
