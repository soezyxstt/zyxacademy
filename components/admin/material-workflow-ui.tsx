import type { ReactNode } from "react";
import { ArrowRight, Check, Eye, FileArchive } from "lucide-react";
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
};

const statusTones: Record<string, "muted" | "info" | "success" | "warning" | "error" | "brand"> = {
  validated: "warning",
  approved: "success",
  rejected: "error",
  draft: "info",
  published: "success",
  withdrawn: "muted",
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
    <ol className={cn("grid gap-2 sm:grid-cols-2", columnClass)} aria-label="Tahapan proses">
      {steps.map((step) => {
        const complete = step.number < currentStep;
        const active = step.number === currentStep;
        return (
          <li
            key={step.number}
            className={cn(
              "flex min-w-0 items-start gap-3 rounded-xl border p-3",
              active ? "border-brand-primary/40 bg-brand-primary/5" : "border-border bg-card",
            )}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full border text-body-sm font-bold",
                complete && "border-status-success bg-status-success text-white",
                active && "border-brand-primary bg-brand-primary text-white",
                !complete && !active && "border-border bg-muted text-muted-foreground",
              )}
            >
              {complete ? <Check className="size-4" aria-hidden /> : step.number}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-body-sm font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
                {step.title}
              </span>
              <span className="mt-0.5 block text-body-xs text-muted-foreground">{step.description}</span>
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
    <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {onBack && (
          <Button type="button" variant="outline" onClick={onBack} disabled={backDisabled}>
            Kembali
          </Button>
        )}
        {children}
      </div>
      {onNext && (
        <Button type="button" onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
          <ArrowRight className="size-4" />
        </Button>
      )}
    </div>
  );
}

export function MaterialArtifactCard({
  row,
  kind,
  courseLabel,
  authorLabel,
  onInspect,
  loading = false,
}: {
  row: MaterialBundleRow;
  kind: "idea" | "product";
  courseLabel?: string;
  authorLabel?: string;
  onInspect: () => void;
  loading?: boolean;
}) {
  const label = kind === "idea" ? "Source Pack + Idea" : "Product";
  const statusLabel = statusLabels[row.status] ?? row.status;
  const tone = statusTones[row.status] ?? "muted";

  return (
    <article className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5">
            <FileArchive className="size-3.5" aria-hidden />
            {label}
          </Badge>
          <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
        </div>
        <h3 className="truncate font-heading text-body-md font-semibold text-foreground">
          {courseLabel ?? "Mata kuliah belum terpetakan"}
        </h3>
        <p className="text-body-sm text-muted-foreground">
          Hasil generasi MCP · <FormattedDate date={row.createdAt} options={dateOptions} />
        </p>
        <p className="text-body-sm text-muted-foreground">
          Dibuat oleh {authorLabel ?? "admin yang belum teridentifikasi"} · {itemSummary(row, kind)}
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
