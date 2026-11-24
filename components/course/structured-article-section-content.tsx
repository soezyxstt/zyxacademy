"use client";

import type React from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { AlignLeft, AlertTriangle, Award, BookmarkCheck, BookOpen, BookOpenCheck, Brain, Calculator, CheckCircle2, Clock, ChevronRight, FileText, HelpCircle, Layers, Sigma } from "lucide-react";
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
import { ProductWorkedExample, ProductFormativeCheck } from "@/components/course/product-learning-blocks";

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
        containerClass: "border-l-2 border-primary/40",
        badgeClass: "text-primary",
      };
    case "prior_knowledge_activation":
      return {
        label: t("articleReader.blockTypes.priorKnowledge"),
        icon: BookOpenCheck,
        containerClass: "border-l-2 border-primary/40",
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
        badgeClass: "text-primary",
      };
    case "analogy":
      return {
        label: t("articleReader.blockTypes.analogy"),
        icon: Sigma,
        containerClass: "border-l-2 border-primary/40",
        badgeClass: "text-primary",
      };
    case "worked_example":
      return {
        label: t("articleReader.blockTypes.workedExample"),
        icon: BookOpen,
        containerClass: "border-l-2 border-primary/40",
        badgeClass: "text-primary",
      };
    case "misconception":
      return {
        label: t("articleReader.blockTypes.misconception"),
        icon: AlertTriangle,
        containerClass: "border-l-2 border-status-warning/70",
        badgeClass: "text-status-warning",
      };
    case "application":
      return {
        label: t("articleReader.blockTypes.application"),
        icon: FileText,
        containerClass: "border-l-2 border-primary/40",
        badgeClass: "text-primary bg-primary/10",
      };
    case "retrieval_prompt":
      return {
        label: t("articleReader.blockTypes.retrievalPrompt"),
        icon: Brain,
        containerClass: "border-l-2 border-primary/40",
        badgeClass: "text-primary",
      };
    case "cross_idea_synthesis":
      return {
        label: t("articleReader.blockTypes.synthesis"),
        icon: Layers,
        containerClass: "border-l-2 border-primary/40",
        badgeClass: "text-primary bg-primary/10",
      };
    case "summary":
      return {
        label: t("articleReader.blockTypes.summary"),
        icon: BookmarkCheck,
        containerClass: "border-l-2 border-primary/40",
        badgeClass: "text-muted-foreground bg-muted",
      };
    case "retrieval_close":
      return {
        label: t("articleReader.blockTypes.reflection"),
        icon: Award,
        containerClass: "border-l-2 border-primary/40",
        badgeClass: "text-primary",
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
    <div className="mt-4 space-y-4">
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
  collapsedChecks = false,
  onCheckpointChange,
}: {
  section: PublicSectionReadModel;
  articleId: string;
  articleVersion: number;
  completed?: boolean;
  showProgress?: boolean;
  interactiveChecks?: boolean;
  collapsedChecks?: boolean;
  onCheckpointChange?: (blockId: string, correct: boolean) => void;
}) {
  const t = useTranslations("studentCourse");
  return (
    <>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-body-xs font-semibold text-muted-foreground">
          <span className="font-mono text-primary">
            {section.sectionNumber.padStart(2, "0")}
          </span>
          <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {t("articleReader.readingMinutes", { count: section.estimatedReadingMinutes })}
          </span>
          {showProgress && completed ? (
            <span className="flex items-center gap-1 text-status-success">
              <CheckCircle2 className="size-3.5" />
              {t("articleReader.readComplete")}
            </span>
          ) : null}
        </div>
        <h2 className="font-heading text-reading-major font-bold text-foreground">
          <MathText className="normal-case">{section.title}</MathText>
        </h2>

        {section.learningObjective ? (
          <div>
            <p className="text-body-base text-muted-foreground">
              <MathText className="normal-case">{section.learningObjective}</MathText>
            </p>
          </div>
        ) : null}
      </header>

      {/* Typed Visuals */}
      {!section.blocks.some((block) => block.parts?.length) && section.visuals && section.visuals.length > 0 ? (
        <div className="space-y-4">
          {section.visuals.map((visual) => (
            <InteractiveDocumentArticleLocation key={visual.id} sectionId={section.id} field="section_visual"><ProductLearningVisual spec={visual} /></InteractiveDocumentArticleLocation>
          ))}
        </div>
      ) : null}

      <div className="space-y-4">
        {section.blocks.map((block, blockIndex) => {
          const renderBlock = () => {
          if (block.blockType === "worked_example" && block.workedExample) {
            const additional = collapsedChecks && section.blocks.slice(0, blockIndex).some(previous => previous.blockType === "worked_example");
            const exampleContent = (
              <div
                key={block.id || blockIndex}
                id={block.id && !additional ? `block-${block.id}` : undefined}
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
            return additional ? <Collapsible id={`block-${block.id}`} className="space-y-3 scroll-mt-24">
              <CollapsibleTrigger asChild><Button variant="ghost" className="group h-auto max-w-full justify-start gap-2 whitespace-normal border-0 px-3 py-2 text-left shadow-none hover:bg-muted/20 dark:hover:bg-muted/20 aria-expanded:bg-muted/20 [&>span]:justify-start"><ChevronRight aria-hidden="true" className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" /><span><span className="group-data-[state=open]:hidden">{t("articleReader.additionalExample")}</span><span className="hidden group-data-[state=open]:inline">{t("articleReader.hideAdditionalExample")}</span>{block.title && !["contoh tambahan", "additional example"].includes(block.title.trim().toLowerCase()) ? <>: <MathText>{block.title}</MathText></> : null}</span></Button></CollapsibleTrigger>
              <CollapsibleContent className="ml-1 pl-4">{exampleContent}</CollapsibleContent>
            </Collapsible> : exampleContent;
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
                data-article-exercise
                data-block-title={block.title || t("articleReader.blockTypes.retrievalPrompt")}
                className="scroll-mt-24"
              >
                <ProductFormativeCheck
                  collapsedByDefault={collapsedChecks}
                  onResultChange={(correct) => onCheckpointChange?.(block.id, correct)}
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
          const titleInContent = block.parts?.some(part => part.kind === "worked_example" && part.title.trim().toLocaleLowerCase() === displayTitle?.trim().toLocaleLowerCase());

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
                className="space-y-2 scroll-mt-24"
              >
                {displayTitle &&
                displayTitle !== section.title &&
                displayTitle !== meta.label ? (
                  <h3 className="font-heading text-reading-minor font-semibold text-foreground">
                    <MathText className="normal-case">{displayTitle}</MathText>
                  </h3>
                ) : null}
                <div className="text-body-base text-foreground">
                  {block.parts?.length ? <ArticleParts parts={block.parts} visuals={block.visuals} /> : <MarkdownRenderer content={block.content} density="default" standaloneInlineMath />}
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
                "space-y-3 scroll-mt-24",
                block.parts?.some(part => part.kind === "worked_example") ? "" : cn("pl-4", meta.containerClass),
              )}
            >
              {!titleInContent && (
              <div className="flex items-center gap-2">
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
              )}
              <div className="text-body-base text-foreground">
                {block.parts?.length ? <ArticleParts parts={block.parts} visuals={block.visuals} /> : <MarkdownRenderer content={block.content} density="default" standaloneInlineMath />}
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
