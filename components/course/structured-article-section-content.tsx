"use client";

import type React from "react";
import { AlignLeft, AlertTriangle, Award, BookmarkCheck, BookOpen, BookOpenCheck, Brain, Calculator, CheckCircle2, Clock, FileText, HelpCircle, Layers, Sigma } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";
import type { PublicSectionReadModel } from "@/lib/articles/structured-read-model";
import { resolveReaderBlockTitle } from "@/lib/materials/reader-toc";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { ArticleMarkdownScope } from "@/components/coding/article-coding";
import { ArticleParts } from "@/components/course/article-parts";
import { MathText } from "@/components/course/math-text";
import { ProductLearningVisual } from "@/components/course/product-learning-visual";
import { InteractiveDocumentArticleLocation } from "@/components/course/interactive-document-context";
import { ProductWorkedExample, ProductFormativeCheck, ProductLearningTimeBadge } from "@/components/course/product-learning-blocks";

interface BlockMetadata {
  label: string;
  icon: React.ElementType;
  containerClass: string;
  badgeClass: string;
}

function getBlockMetadata(blockType: string, t: ReturnType<typeof useTranslations>): BlockMetadata {
  switch (blockType) {
    case "problem_introduction":
      return {
        label: t("articleReader.blockTypes.problemIntroduction"),
        icon: HelpCircle,
        containerClass: "border-l-4 border-l-status-warning border-t border-r border-b border-border/60 bg-status-warning/[0.03]",
        badgeClass: "text-status-warning bg-status-warning/10",
      };
    case "prior_knowledge_activation":
      return {
        label: t("articleReader.blockTypes.priorKnowledge"),
        icon: BookOpenCheck,
        containerClass: "border-l-4 border-l-primary/60 border-t border-r border-b border-border/60 bg-primary/[0.03]",
        badgeClass: "text-primary bg-primary/10",
      };
    case "verbal_representation":
      return {
        label: t("articleReader.blockTypes.verbalRepresentation"),
        icon: AlignLeft,
        containerClass: "",
        badgeClass: "text-primary bg-primary/10",
      };
    case "mathematical_representation":
      return {
        label: t("articleReader.blockTypes.mathematicalRepresentation"),
        icon: Calculator,
        containerClass: "",
        badgeClass: "text-status-success bg-status-success/10",
      };
    case "analogy":
      return {
        label: t("articleReader.blockTypes.analogy"),
        icon: Sigma,
        containerClass: "border-l-4 border-l-status-warning/70 border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-status-warning bg-status-warning/10",
      };
    case "worked_example":
      return {
        label: t("articleReader.blockTypes.workedExample"),
        icon: BookOpen,
        containerClass: "border-l-4 border-l-status-success border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-status-success bg-status-success/10",
      };
    case "misconception":
      return {
        label: t("articleReader.blockTypes.misconception"),
        icon: AlertTriangle,
        containerClass: "border-l-4 border-l-status-error border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-status-error bg-status-error/10",
      };
    case "application":
      return {
        label: t("articleReader.blockTypes.application"),
        icon: FileText,
        containerClass: "border-l-4 border-l-primary/60 border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-primary bg-primary/10",
      };
    case "retrieval_prompt":
      return {
        label: t("articleReader.blockTypes.retrievalPrompt"),
        icon: Brain,
        containerClass: "border-l-4 border-l-status-warning border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-status-warning bg-status-warning/10",
      };
    case "cross_idea_synthesis":
      return {
        label: t("articleReader.blockTypes.synthesis"),
        icon: Layers,
        containerClass: "border-l-4 border-l-primary/60 border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-primary bg-primary/10",
      };
    case "summary":
      return {
        label: t("articleReader.blockTypes.summary"),
        icon: BookmarkCheck,
        containerClass: "border-l-4 border-l-border border-t border-r border-b border-border/70 bg-muted/25",
        badgeClass: "text-muted-foreground bg-muted",
      };
    case "retrieval_close":
      return {
        label: t("articleReader.blockTypes.reflection"),
        icon: Award,
        containerClass: "border-l-4 border-l-status-success border-t border-r border-b border-border/70 bg-card",
        badgeClass: "text-status-success bg-status-success/10",
      };
    case "explanation":
    default:
      return {
        label: t("articleReader.blockTypes.explanation"),
        icon: AlignLeft,
        containerClass: "",
        badgeClass: "text-muted-foreground bg-muted",
      };
  }
}

function BlockVisuals({ visuals }: { visuals?: PublicSectionReadModel["visuals"] }) {
  if (!visuals || visuals.length === 0) return null;
  return (
    <div className="space-y-4 pt-2">
      {visuals.map((visual) => (
        <ProductLearningVisual key={visual.id} spec={visual} />
      ))}
    </div>
  );
}

export function getBlockTitle(block: PublicSectionReadModel["blocks"][number], sectionTitle: string, t: ReturnType<typeof useTranslations>) {
  const fallback = block.blockType === "worked_example" && block.workedExample
    ? t("articleReader.blockTypes.stepByStepExample")
    : block.formativeCheck ? t("articleReader.blockTypes.selfCheck") : getBlockMetadata(block.blockType, t).label;
  return resolveReaderBlockTitle(block.title, fallback, sectionTitle);
}

export function StructuredArticleSectionContent({
  section,
  articleId,
  articleVersion,
  completed = false,
  showProgress = true,
  interactiveChecks = true,
}: {
  section: PublicSectionReadModel;
  articleId: string;
  articleVersion: number;
  completed?: boolean;
  showProgress?: boolean;
  interactiveChecks?: boolean;
}) {
  const t = useTranslations("studentCourse");
  return (
    <>
      <header className="space-y-3 border-b border-border/80 pb-5">
        <div className="flex flex-wrap items-center gap-2 text-body-xs font-semibold text-muted-foreground">
          <span className="rounded-md bg-primary/10 px-2.5 py-0.5 text-primary">
            {section.sectionNumber}
          </span>
          {!section.learningTimeEstimate ? (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {t("articleReader.readingMinutes", { count: section.estimatedReadingMinutes })}
            </span>
          ) : null}
          {showProgress && completed ? (
            <span className="flex items-center gap-1 text-status-success">
              <CheckCircle2 className="size-3.5" />
              {t("articleReader.readComplete")}
            </span>
          ) : null}
        </div>
        <h2 className={cn("font-heading font-bold tracking-tight text-foreground", section.blocks.some((block) => block.parts?.length) ? "text-h5" : "text-h4 sm:text-h3")}>
          <MathText className="normal-case">{section.title}</MathText>
        </h2>

        {/* Learning Time Estimate Heuristics */}
        {section.learningTimeEstimate ? (
          <ProductLearningTimeBadge
            timeEstimate={section.learningTimeEstimate}
            className="w-fit"
          />
        ) : null}

        {section.learningObjective ? (
          <div className="mt-3 border-l-2 border-primary/60 pl-3.5 py-1">
            <p className="text-body-base leading-relaxed text-muted-foreground">
              <MathText className="normal-case">{section.learningObjective}</MathText>
            </p>
          </div>
        ) : null}
      </header>

      {/* Typed Visuals */}
      {!section.blocks.some((block) => block.parts?.length) && section.visuals && section.visuals.length > 0 ? (
        <div className="space-y-4 py-2">
          {section.visuals.map((visual) => (
            <InteractiveDocumentArticleLocation key={visual.id} sectionId={section.id} field="section_visual"><ProductLearningVisual spec={visual} /></InteractiveDocumentArticleLocation>
          ))}
        </div>
      ) : null}

      <div className="space-y-6 py-2">
        {section.blocks.map((block, blockIndex) => {
          const renderBlock = () => {
          if (block.blockType === "worked_example" && block.workedExample) {
            return (
              <div
                key={block.id || blockIndex}
                id={block.id ? `block-${block.id}` : undefined}
                data-block-type="worked_example"
                data-block-title={block.title || t("articleReader.blockTypes.workedExample")}
                className="scroll-mt-24"
              >
                <ProductWorkedExample
                  title={block.title}
                  content={block.content}
                  contentNode={block.parts?.length ? <ArticleParts parts={block.parts} visuals={block.visuals} /> : undefined}
                  workedExample={block.workedExample}
                />
                {!block.parts?.length ? <BlockVisuals visuals={block.visuals} /> : null}
              </div>
            );
          }

          if (
            (block.blockType === "retrieval_prompt" || block.blockType === "retrieval_close") &&
            block.formativeCheck && interactiveChecks
          ) {
            return (
              <div
                key={block.id || blockIndex}
                id={block.id ? `block-${block.id}` : undefined}
                data-block-type={block.blockType}
                data-block-title={block.title || t("articleReader.blockTypes.retrievalPrompt")}
                className="scroll-mt-24"
              >
                <ProductFormativeCheck
                  title={block.title}
                  content={block.content}
                  contentNode={block.parts?.length ? <ArticleParts parts={block.parts} visuals={block.visuals} /> : undefined}
                  formativeCheck={block.formativeCheck}
                  locator={{
                    articleId,
                    articleVersion,
                    sectionId: section.id,
                    blockId: block.id,
                  }}
                />
                {!block.parts?.length ? <BlockVisuals visuals={block.visuals} /> : null}
              </div>
            );
          }

          const meta = getBlockMetadata(block.blockType, t);
          const Icon = meta.icon;
          const displayTitle = getBlockTitle(block, section.title, t);

          const isCoreDocument =
            block.blockType === "explanation" ||
            block.blockType === "verbal_representation" ||
            block.blockType === "mathematical_representation";

          if (isCoreDocument) {
            return (
              <div
                key={block.id || blockIndex}
                id={block.id ? `block-${block.id}` : undefined}
                data-block-type={block.blockType}
                data-block-title={displayTitle || meta.label}
                className={cn(
                  "space-y-3 py-1 scroll-mt-24",
                  block.blockType === "mathematical_representation" && "space-y-1.5 py-0.5",
                )}
              >
                {displayTitle &&
                displayTitle !== section.title &&
                displayTitle !== meta.label ? (
                  <h3 className={cn("font-heading font-bold tracking-tight text-foreground pt-3", block.parts?.length ? "text-body-base" : "text-h5")}>
                    <MathText className="normal-case">{displayTitle}</MathText>
                  </h3>
                ) : null}
                <div className="text-body-base leading-relaxed text-foreground">
                  {block.parts?.length ? <ArticleParts parts={block.parts} visuals={block.visuals} /> : <MarkdownRenderer content={block.content} density="default" />}
                </div>
                {!block.parts?.length ? <BlockVisuals visuals={block.visuals} /> : null}
              </div>
            );
          }

          return (
            <div
              key={block.id || blockIndex}
              id={block.id ? `block-${block.id}` : undefined}
              data-block-type={block.blockType}
              data-block-title={displayTitle || meta.label}
              className={cn(
                "rounded-r-lg p-4 sm:p-5 space-y-3 shadow-xs my-3 scroll-mt-24",
                meta.containerClass,
              )}
            >
              <div className="flex items-center gap-2 border-b border-border/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md",
                      meta.badgeClass,
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <h3 className="font-heading text-body-sm font-bold text-foreground">
                    <MathText className="normal-case">{displayTitle}</MathText>
                  </h3>
                </div>
              </div>
              <div className="text-body-base leading-relaxed text-foreground">
                {block.parts?.length ? <ArticleParts parts={block.parts} visuals={block.visuals} /> : <MarkdownRenderer content={block.content} density="compact" />}
              </div>
              {!block.parts?.length ? <BlockVisuals visuals={block.visuals} /> : null}
            </div>
          );
          };
          return <ArticleMarkdownScope key={block.id || blockIndex} id={JSON.stringify([section.id, block.id || blockIndex])}><InteractiveDocumentArticleLocation sectionId={section.id} blockId={block.id} field="content">{renderBlock()}</InteractiveDocumentArticleLocation></ArticleMarkdownScope>;
        })}
      </div>
    </>
  );
}
