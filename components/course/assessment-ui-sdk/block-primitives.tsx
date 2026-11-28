"use client";

import React, { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Info,
  Lightbulb,
  Sigma,
} from "lucide-react";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/react/collapsible";
import { createAccordionController } from "@ui-sdk/core/accordion";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/react/accordion";
import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@ui-sdk/react/tabs";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { ZyraInlineAskButton } from "@/components/course/zyra-inline-explanation-host";
import { InteractiveDocumentVisual } from "@/components/course/interactive-document-visual";
import { interactiveDocumentSchema } from "@/lib/materials/interactive-document";
import { validateCanvasSpec } from "@/lib/zyra/canvas";
import type {
  AssessmentUiCalloutTone,
  AssessmentUiCollapsibleVariant,
  AssessmentUiImageAspect,
  AssessmentUiVisualKind,
} from "@/lib/assessment-ui-sdk";
import { Scene3dViewer } from "./scene-3d-viewer";

const LazyInteractiveGraphWidget = dynamic(
  () =>
    import("@/components/course/interactive-graph-widget").then(
      (module) => module.InteractiveGraphWidget,
    ),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="py-6 text-center text-body-xs text-muted-foreground">
        Memuat grafik interaktif...
      </p>
    ),
  },
);

const LazyLearningCanvasRenderer = dynamic(
  () =>
    import("@/components/course/learning-canvas/learning-canvas-renderer").then(
      (module) => module.LearningCanvasRenderer,
    ),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="py-6 text-center text-body-xs text-muted-foreground">
        Memuat kanvas visual...
      </p>
    ),
  },
);

const LazyChartRenderer = dynamic(
  () =>
    import("@/components/course/markdown/chart-renderer").then(
      (module) => module.ChartRenderer,
    ),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="py-6 text-center text-body-xs text-muted-foreground">
        Memuat grafik data...
      </p>
    ),
  },
);

const LazyFlowchartDiagramRenderer = dynamic(
  () =>
    import("@/components/course/markdown/flowchart-diagram-renderer").then(
      (module) => module.FlowchartDiagramRenderer,
    ),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="py-6 text-center text-body-xs text-muted-foreground">
        Memuat diagram alur...
      </p>
    ),
  },
);

const LazyVibrationSimViewer = dynamic(
  () => import("./vibration-sim-viewer").then((module) => module.VibrationSimViewer),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="py-6 text-center text-body-xs text-muted-foreground">
        Memuat simulasi getaran mekanik...
      </p>
    ),
  },
);

const LazyKinematicsSimViewer = dynamic(
  () => import("./kinematics-sim-viewer").then((module) => module.KinematicsSimViewer),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="py-6 text-center text-body-xs text-muted-foreground">
        Memuat simulasi kinematika...
      </p>
    ),
  },
);

const LazyStaticsSimViewer = dynamic(
  () => import("./statics-sim-viewer").then((module) => module.StaticsSimViewer),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="py-6 text-center text-body-xs text-muted-foreground">
        Memuat diagram statika...
      </p>
    ),
  },
);

const LazyThermoSimViewer = dynamic(
  () => import("./thermo-sim-viewer").then((module) => module.ThermoSimViewer),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="py-6 text-center text-body-xs text-muted-foreground">
        Memuat simulasi termodinamika...
      </p>
    ),
  },
);

export const CALLOUT_STYLES: Record<
  AssessmentUiCalloutTone,
  {
    container: string;
    icon: React.ComponentType<{ className?: string }>;
    iconClass: string;
    defaultLabel: string;
  }
> = {
  info: {
    container: "border-status-info/60",
    icon: Info,
    iconClass: "text-status-info",
    defaultLabel: "Info",
  },
  tip: {
    container: "border-status-success/60",
    icon: Lightbulb,
    iconClass: "text-status-success",
    defaultLabel: "Tips",
  },
  warning: {
    container: "border-status-warning/60",
    icon: AlertTriangle,
    iconClass: "text-status-warning",
    defaultLabel: "Perhatian",
  },
  formula: {
    container: "border-brand-primary/60",
    icon: Sigma,
    iconClass: "text-brand-primary",
    defaultLabel: "Rumus",
  },
  mistake: {
    container: "border-status-error/60",
    icon: CircleAlert,
    iconClass: "text-status-error",
    defaultLabel: "Kesalahan umum",
  },
};

export const COLLAPSIBLE_VARIANT_LABELS: Record<AssessmentUiCollapsibleVariant, string> = {
  hint: "Petunjuk",
  derivation: "Penurunan",
  detail: "Detail",
  note: "Catatan",
};

function readFallbackText(spec: Record<string, unknown>): string | null {
  for (const key of ["summary", "description", "altText"]) {
    const val = spec[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  const fallback = spec.staticFallback ?? spec.fallback;
  if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
    const summary = (fallback as Record<string, unknown>).summary;
    if (typeof summary === "string" && summary.trim().length > 0) {
      return summary.trim();
    }
  }
  return null;
}

function extractFormulaString(spec: Record<string, unknown>): string | null {
  for (const key of ["initialFormula", "formula", "expression", "fn", "equation", "y"]) {
    const val = spec[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  for (const arrKey of ["expressions", "functions", "curves"]) {
    const rawArr = spec[arrKey];
    if (Array.isArray(rawArr)) {
      const lines = rawArr
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object") {
            const rec = item as Record<string, unknown>;
            for (const k of ["formula", "expression", "fn", "equation", "y"]) {
              if (typeof rec[k] === "string" && rec[k].trim()) return rec[k].trim();
            }
          }
          return "";
        })
        .filter((line) => line.length > 0);
      if (lines.length > 0) return lines.join("\n");
    }
  }
  return null;
}

export function AssessmentMarkdownView({
  content,
  isCompact,
}: {
  content: string;
  isCompact: boolean;
}) {
  return (
    <MarkdownRenderer
      content={content}
      density={isCompact ? "compact" : "default"}
      className="min-w-0 text-foreground [&_.katex-display]:max-w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1"
    />
  );
}

export function AssessmentFormulaCardView({
  title,
  latex,
  note,
}: {
  title?: string;
  latex: string;
  note?: string;
}) {
  return (
    <div
      data-assessment-formula=""
      className="space-y-1 border-l-2 border-brand-primary/50 pl-3 py-0.5"
    >
      {title ? (
        <div className="font-heading text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <MathText>{title}</MathText>
        </div>
      ) : null}
      <div className="overflow-x-auto text-foreground [&_.math-text>span]:my-0 [&_.math-text>span]:py-0">
        <MathText as="div" bareMath>
          {latex}
        </MathText>
      </div>
      {note ? (
        <p className="text-body-xs text-muted-foreground">
          <MathText>{note}</MathText>
        </p>
      ) : null}
    </div>
  );
}

export function AssessmentCalloutView({
  tone,
  title,
  content,
  isCompact,
}: {
  tone: AssessmentUiCalloutTone;
  title?: string;
  content: string;
  isCompact: boolean;
}) {
  const style = CALLOUT_STYLES[tone];
  const Icon = style.icon;
  return (
    <div role="note" className={cn("space-y-1 border-l-2 pl-3.5 py-0.5", style.container)}>
      <div className="flex items-center gap-1.5">
        <Icon className={cn("size-3.5 shrink-0", style.iconClass)} />
        <span className="font-heading text-body-xs font-semibold text-foreground">
          <MathText>{title ?? style.defaultLabel}</MathText>
        </span>
      </div>
      <MarkdownRenderer
        content={content}
        density={isCompact ? "compact" : "default"}
        className="text-body-sm text-muted-foreground [&_.katex-display]:max-w-full [&_.katex-display]:overflow-x-auto"
      />
    </div>
  );
}

export function AssessmentImageView({
  src,
  alt,
  caption,
  aspect = "auto",
}: {
  src: string;
  alt: string;
  caption?: string;
  aspect?: AssessmentUiImageAspect;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-body-xs text-muted-foreground"
      >
        <AlertCircle className="size-4 shrink-0 text-status-warning" />
        <span>Gambar tidak dapat dimuat: {alt}</span>
      </div>
    );
  }

  return (
    <figure className="space-y-1.5">
      {aspect === "video" || aspect === "square" ? (
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-lg border border-border bg-card",
            aspect === "video" ? "aspect-video" : "aspect-square max-w-md",
          )}
        >
          <Image
            src={src}
            alt={alt}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 720px"
            onError={() => setFailed(true)}
            className="object-contain"
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Image
            src={src}
            alt={alt}
            width={800}
            height={450}
            unoptimized
            onError={() => setFailed(true)}
            className="mx-auto h-auto max-h-[420px] w-auto max-w-full object-contain"
          />
        </div>
      )}
      {caption ? (
        <figcaption className="text-center text-body-xs text-muted-foreground">
          <MathText>{caption}</MathText>
        </figcaption>
      ) : null}
    </figure>
  );
}

export function AssessmentGraphView({
  title,
  caption,
  spec,
}: {
  title?: string;
  caption?: string;
  spec: Record<string, unknown>;
}) {
  const canvasResult = useMemo(() => validateCanvasSpec(spec), [spec]);
  const formula = useMemo(() => extractFormulaString(spec), [spec]);
  const fallbackText = readFallbackText(spec);

  return (
    <figure className="space-y-2">
      {title ? (
        <figcaption className="font-heading text-body-sm font-semibold text-foreground">
          <MathText>{title}</MathText>
        </figcaption>
      ) : null}

      {canvasResult.isValid && canvasResult.spec ? (
        <LazyLearningCanvasRenderer spec={canvasResult.spec} embedded />
      ) : formula ? (
        <LazyInteractiveGraphWidget initialFormula={formula} />
      ) : (
        <div
          role="status"
          data-assessment-visual-fallback="graph"
          className="border-l-2 border-border pl-3 py-1 text-body-xs text-muted-foreground"
        >
          {fallbackText ? (
            <MathText as="p">{fallbackText}</MathText>
          ) : (
            <p>Grafik belum dapat ditampilkan karena spesifikasi belum lengkap.</p>
          )}
        </div>
      )}

      {caption ? (
        <p className="text-body-xs text-muted-foreground">
          <MathText>{caption}</MathText>
        </p>
      ) : null}
    </figure>
  );
}

export function AssessmentScene3dView({
  title,
  caption,
  spec,
}: {
  title?: string;
  caption?: string;
  spec: Record<string, unknown>;
}) {
  return (
    <figure className="space-y-2">
      {title ? (
        <figcaption className="font-heading text-body-sm font-semibold text-foreground">
          <MathText>{title}</MathText>
        </figcaption>
      ) : null}
      <Scene3dViewer spec={spec} title={title} />
      {caption ? (
        <p className="text-body-xs text-muted-foreground">
          <MathText>{caption}</MathText>
        </p>
      ) : null}
    </figure>
  );
}

export function AssessmentInteractiveVisualView({
  title,
  caption,
  kind,
  spec,
  isCompact,
}: {
  title?: string;
  caption?: string;
  kind: AssessmentUiVisualKind;
  spec: Record<string, unknown>;
  isCompact: boolean;
}) {
  const fallbackText = readFallbackText(spec);
  const density = isCompact ? "compact" : "default";

  const renderInner = (): ReactNode => {
    if (kind === "canvas") {
      const validated = validateCanvasSpec(spec);
      if (validated.isValid && validated.spec) {
        return <LazyLearningCanvasRenderer spec={validated.spec} embedded />;
      }
      return (
        <div
          role="status"
          data-assessment-visual-fallback="canvas"
          className="rounded-md border border-border bg-muted/30 p-3 text-body-xs text-muted-foreground"
        >
          {fallbackText ? (
            <MathText as="p">{fallbackText}</MathText>
          ) : (
            <p>Kanvas interaktif belum lengkap untuk ditampilkan.</p>
          )}
        </div>
      );
    }

    if (kind === "document") {
      const parsed = interactiveDocumentSchema.safeParse(spec);
      if (parsed.success) {
        const assetUrl = typeof spec.assetUrl === "string" ? spec.assetUrl : undefined;
        return <InteractiveDocumentVisual spec={parsed.data} assetUrl={assetUrl} />;
      }
      return (
        <div
          role="status"
          data-assessment-visual-fallback="document"
          className="rounded-md border border-border bg-muted/30 p-3 text-body-xs text-muted-foreground"
        >
          {fallbackText ? (
            <MathText as="p">{fallbackText}</MathText>
          ) : (
            <p>Dokumen visual interaktif belum lengkap untuk ditampilkan.</p>
          )}
        </div>
      );
    }

    if (kind === "chart") {
      if (Array.isArray(spec.data) && spec.data.length > 0) {
        return (
          <LazyChartRenderer
            data={spec}
            title={title}
            caption={caption}
            density={density}
          />
        );
      }
      return (
        <div
          role="status"
          data-assessment-visual-fallback="chart"
          className="rounded-md border border-border bg-muted/30 p-3 text-body-xs text-muted-foreground"
        >
          {fallbackText ? (
            <MathText as="p">{fallbackText}</MathText>
          ) : (
            <p>Data grafik belum tersedia.</p>
          )}
        </div>
      );
    }

    if (kind === "flowchart") {
      if (
        Array.isArray(spec.nodes) &&
        spec.nodes.length > 0 &&
        Array.isArray(spec.edges) &&
        spec.edges.length > 0
      ) {
        return (
          <LazyFlowchartDiagramRenderer
            data={spec}
            title={title}
            caption={caption}
            density={density}
            embedded
          />
        );
      }
      return (
        <div
          role="status"
          data-assessment-visual-fallback="flowchart"
          className="rounded-md border border-border bg-muted/30 p-3 text-body-xs text-muted-foreground"
        >
          {fallbackText ? (
            <MathText as="p">{fallbackText}</MathText>
          ) : (
            <p>Langkah diagram alur belum lengkap untuk ditampilkan.</p>
          )}
        </div>
      );
    }

    if (kind === "vibration") {
      return <LazyVibrationSimViewer spec={spec} />;
    }

    if (kind === "kinematics") {
      return <LazyKinematicsSimViewer spec={spec} />;
    }

    if (kind === "statics") {
      return <LazyStaticsSimViewer spec={spec} />;
    }

    if (kind === "thermo") {
      return <LazyThermoSimViewer spec={spec} />;
    }

    return null;
  };

  if (
    kind === "chart" ||
    kind === "flowchart" ||
    kind === "vibration" ||
    kind === "kinematics" ||
    kind === "statics" ||
    kind === "thermo"
  ) {
    return (
      <figure className="space-y-2">
        {title ? (
          <figcaption className="font-heading text-body-sm font-semibold text-foreground">
            <MathText>{title}</MathText>
          </figcaption>
        ) : null}
        {renderInner()}
        {caption ? (
          <p className="text-body-xs text-muted-foreground">
            <MathText>{caption}</MathText>
          </p>
        ) : null}
      </figure>
    );
  }

  return (
    <figure className="space-y-2 rounded-lg border border-border bg-card p-3.5">
      {title && kind !== "document" ? (
        <figcaption className="font-heading text-body-sm font-semibold text-foreground">
          <MathText>{title}</MathText>
        </figcaption>
      ) : null}
      {renderInner()}
      {caption ? (
        <p className="text-body-xs text-muted-foreground">
          <MathText>{caption}</MathText>
        </p>
      ) : null}
    </figure>
  );
}

export function AssessmentCollapsibleView({
  title,
  defaultOpen,
  variant,
  isCompact,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  variant?: AssessmentUiCollapsibleVariant;
  isCompact: boolean;
  children: ReactNode;
}) {
  const variantLabel = variant ? COLLAPSIBLE_VARIANT_LABELS[variant] : null;

  return (
    <Collapsible
      defaultOpen={Boolean(defaultOpen)}
      className="border-y border-border/60"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 py-2.5 text-left text-body-sm font-semibold text-foreground transition-colors hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          {variantLabel ? (
            <span className="text-body-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {variantLabel}
            </span>
          ) : null}
          <span className="min-w-0 break-words">
            <MathText>{title}</MathText>
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsiblePanel hiddenUntilFound>
        <div className={cn("pb-3 pt-1", isCompact ? "space-y-2.5" : "space-y-3")}>
          {children}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

export function AssessmentStepsContainerView({
  title,
  collapsible,
  defaultOpenStepId,
  children,
}: {
  title?: string;
  collapsible?: boolean;
  defaultOpenStepId?: string;
  children: ReactNode;
}) {
  const stepNodes = React.Children.toArray(children);
  const totalSteps = stepNodes.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [accordionController] = useState(() => createAccordionController());

  const isPaginated = !collapsible && totalSteps > 1 && !showAll;
  const clampedIndex = Math.max(0, Math.min(activeIndex, Math.max(0, totalSteps - 1)));
  const activeTabValue = String(clampedIndex);

  return (
    <section className="space-y-3" data-assessment-steps-paginated={isPaginated ? "true" : "false"}>
      {collapsible ? (
        <>
          {(title || totalSteps > 1) ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {title ? (
                <h3 className="font-heading text-body-base font-bold text-foreground">
                  <MathText>{title}</MathText>
                </h3>
              ) : (
                <span className="text-body-xs font-semibold text-muted-foreground tabular-nums">
                  {totalSteps} langkah
                </span>
              )}
              {totalSteps > 1 ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => accordionController.openAll()}
                    className="text-body-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    Buka semua
                  </button>
                  <button
                    type="button"
                    onClick={() => accordionController.closeAll()}
                    className="text-body-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    Tutup semua
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <Accordion
            multiple
            collapsible
            hiddenUntilFound
            controller={accordionController}
            defaultValue={defaultOpenStepId ? [defaultOpenStepId] : []}
            className="divide-y divide-border/60"
          >
            {children}
          </Accordion>
        </>
      ) : isPaginated ? (
        <Tabs
          value={activeTabValue}
          onValueChange={(next) => {
            if (next === null) return;
            const parsed = Number.parseInt(next, 10);
            if (Number.isFinite(parsed)) {
              setActiveIndex(Math.max(0, Math.min(parsed, totalSteps - 1)));
            }
          }}
          className="space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            {title ? (
              <h3 className="font-heading text-body-base font-bold text-foreground">
                <MathText>{title}</MathText>
              </h3>
            ) : (
              <span className="text-body-xs font-semibold text-muted-foreground tabular-nums">
                Langkah {clampedIndex + 1} dari {totalSteps}
              </span>
            )}
            <div className="flex items-center gap-2">
              <TabsList
                aria-label="Pilih langkah"
                className="inline-flex items-center gap-1 rounded-full bg-muted/40 p-0.5"
              >
                <TabsIndicator className="rounded-full bg-brand-primary" />
                {stepNodes.map((_, idx) => (
                  <TabsTab
                    key={`step-tab-${idx}`}
                    value={String(idx)}
                    aria-label={`Langkah ${idx + 1}`}
                    className="inline-flex size-6 items-center justify-center rounded-full text-body-xs font-semibold tabular-nums text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-selected:text-primary-foreground"
                  >
                    {idx + 1}
                  </TabsTab>
                ))}
              </TabsList>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-body-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Lihat semua
              </button>
            </div>
          </div>

          {stepNodes.map((node, idx) => (
            <TabsPanel key={`step-panel-${idx}`} value={String(idx)} className="min-w-0">
              {node}
            </TabsPanel>
          ))}

          <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
            <button
              type="button"
              disabled={clampedIndex <= 0}
              onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
              className="inline-flex items-center gap-1 text-body-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              <span>Langkah sebelumnya</span>
            </button>
            <span className="text-body-xs tabular-nums text-muted-foreground">
              {clampedIndex + 1} / {totalSteps}
            </span>
            <button
              type="button"
              disabled={clampedIndex >= totalSteps - 1}
              onClick={() => setActiveIndex((prev) => Math.min(totalSteps - 1, prev + 1))}
              className="inline-flex items-center gap-1 text-body-xs font-medium text-brand-primary transition-colors hover:text-brand-primary/80 disabled:pointer-events-none disabled:opacity-40"
            >
              <span>Langkah berikutnya</span>
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          </div>
        </Tabs>
      ) : (
        <>
          {(title || totalSteps > 1) ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {title ? (
                <h3 className="font-heading text-body-base font-bold text-foreground">
                  <MathText>{title}</MathText>
                </h3>
              ) : (
                <span className="text-body-xs font-semibold text-muted-foreground tabular-nums">
                  {totalSteps} langkah
                </span>
              )}
              {totalSteps > 1 ? (
                <button
                  type="button"
                  onClick={() => setShowAll(false)}
                  className="text-body-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  Per langkah
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="divide-y divide-border/60">{children}</div>
        </>
      )}
    </section>
  );
}

export function AssessmentStepItemView({
  stepId,
  index,
  title,
  summary,
  collapsible,
  isCompact,
  renderBlockAfter,
  children,
}: {
  stepId: string;
  index: number;
  title: string;
  summary?: string;
  collapsible?: boolean;
  isCompact: boolean;
  renderBlockAfter?: (blockId: string) => ReactNode;
  children: ReactNode;
}) {
  const headerContent = (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-body-xs font-semibold tabular-nums text-foreground">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-heading text-body-sm font-semibold text-foreground">
          <MathText>{title}</MathText>
        </div>
        {summary ? (
          <p className="mt-0.5 text-body-xs text-muted-foreground">
            <MathText>{summary}</MathText>
          </p>
        ) : null}
      </div>
    </div>
  );

  const bodyContent = (
    <div className={cn("pl-8.5", isCompact ? "space-y-2" : "space-y-2.5")}>
      {children}
      <div className="flex justify-end pt-0.5">
        <ZyraInlineAskButton
          anchorBlockId={stepId}
          snippet={`Langkah ${index + 1}: ${title}`}
          surroundingText={summary}
          label="Tanya langkah ini"
        />
      </div>
    </div>
  );

  return (
    <div
      data-assessment-block-id={stepId}
      data-assessment-step-id={stepId}
      className="py-2.5 first:pt-0 last:pb-0"
    >
      {collapsible ? (
        <AccordionItem value={stepId}>
          <AccordionHeader className="m-0">
            <AccordionTrigger className="group flex w-full items-start justify-between gap-2 rounded-md py-1 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {headerContent}
              <ChevronDown
                className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-open:rotate-180 motion-reduce:transition-none"
                aria-hidden
              />
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>
            <div className="pt-2">{bodyContent}</div>
          </AccordionPanel>
        </AccordionItem>
      ) : (
        <div className="space-y-2">
          {headerContent}
          {bodyContent}
        </div>
      )}
      {renderBlockAfter ? renderBlockAfter(stepId) : null}
    </div>
  );
}
