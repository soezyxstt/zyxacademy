"use client";

import React, { useMemo, type ReactNode } from "react";
import { JSONUIProvider, Renderer, type Spec } from "@json-render/react";
import { cn } from "@/lib/utils";
import {
  normalizeToAssessmentUiSpec,
  parseJsonRenderSpec,
  type AssessmentUiBlock,
  type AssessmentUiSpec,
} from "@/lib/assessment-ui-sdk";
import {
  AssessmentCalloutView,
  AssessmentCollapsibleView,
  AssessmentFormulaCardView,
  AssessmentGraphView,
  AssessmentImageView,
  AssessmentInteractiveVisualView,
  AssessmentMarkdownView,
  AssessmentScene3dView,
  AssessmentStepItemView,
  AssessmentStepsContainerView,
} from "./block-primitives";
import {
  AssessmentRenderContext,
  assessmentJsonRenderRegistry,
} from "./json-render-registry";

export interface AssessmentUiRendererProps {
  spec?: AssessmentUiSpec | Spec | unknown;
  fallbackMarkdown?: string | null;
  courseId?: string;
  renderBlockAfter?: (blockId: string) => ReactNode;
  className?: string;
}

function AssessmentBlockNode({
  block,
  isCompact,
  renderBlockAfter,
}: {
  block: AssessmentUiBlock;
  isCompact: boolean;
  renderBlockAfter?: (blockId: string) => ReactNode;
}) {
  const renderContent = (): ReactNode => {
    switch (block.type) {
      case "markdown":
        return <AssessmentMarkdownView content={block.content} isCompact={isCompact} />;

      case "formula_card":
        return (
          <AssessmentFormulaCardView
            title={block.title}
            latex={block.latex}
            note={block.note}
          />
        );

      case "callout":
        return (
          <AssessmentCalloutView
            tone={block.tone}
            title={block.title}
            content={block.content}
            isCompact={isCompact}
          />
        );

      case "image":
        return (
          <AssessmentImageView
            src={block.src}
            alt={block.alt}
            caption={block.caption}
            aspect={block.aspect}
          />
        );

      case "graph":
        return (
          <AssessmentGraphView
            title={block.title}
            caption={block.caption}
            spec={block.spec}
          />
        );

      case "scene_3d":
        return (
          <AssessmentScene3dView
            title={block.title}
            caption={block.caption}
            spec={block.spec}
          />
        );

      case "interactive_visual":
        return (
          <AssessmentInteractiveVisualView
            title={block.title}
            caption={block.caption}
            kind={block.kind}
            spec={block.spec}
            isCompact={isCompact}
          />
        );

      case "collapsible":
        return (
          <AssessmentCollapsibleView
            title={block.title}
            defaultOpen={block.defaultOpen}
            variant={block.variant}
            isCompact={isCompact}
          >
            {block.blocks.map((child) => (
              <AssessmentBlockNode
                key={child.id}
                block={child}
                isCompact={isCompact}
                renderBlockAfter={renderBlockAfter}
              />
            ))}
          </AssessmentCollapsibleView>
        );

      case "steps":
        return (
          <AssessmentStepsContainerView
            title={block.title}
            collapsible={block.collapsible}
            defaultOpenStepId={block.steps[0]?.id}
          >
            {block.steps.map((step, index) => (
              <AssessmentStepItemView
                key={step.id}
                stepId={step.id}
                index={index}
                title={step.title}
                summary={step.summary}
                collapsible={Boolean(block.collapsible)}
                isCompact={isCompact}
                renderBlockAfter={renderBlockAfter}
              >
                {step.blocks.map((child) => (
                  <AssessmentBlockNode
                    key={child.id}
                    block={child}
                    isCompact={isCompact}
                    renderBlockAfter={renderBlockAfter}
                  />
                ))}
              </AssessmentStepItemView>
            ))}
          </AssessmentStepsContainerView>
        );
    }
  };

  return (
    <div
      data-assessment-block-id={block.id}
      data-assessment-block-type={block.type}
      className="min-w-0"
    >
      {renderContent()}
      {renderBlockAfter ? renderBlockAfter(block.id) : null}
    </div>
  );
}

export function AssessmentUiRenderer({
  spec,
  fallbackMarkdown,
  courseId,
  renderBlockAfter,
  className,
}: AssessmentUiRendererProps) {
  const jsonRenderSpec = useMemo(() => parseJsonRenderSpec(spec), [spec]);
  const normalized = useMemo(
    () => (jsonRenderSpec ? null : normalizeToAssessmentUiSpec(spec, fallbackMarkdown)),
    [jsonRenderSpec, spec, fallbackMarkdown],
  );

  if (jsonRenderSpec) {
    return (
      <div
        data-assessment-ui-root=""
        data-assessment-ui-format="json-render"
        data-assessment-course-id={courseId}
        className={cn("min-w-0", className)}
      >
        <AssessmentRenderContext.Provider value={{ isCompact: false, renderBlockAfter }}>
          <JSONUIProvider registry={assessmentJsonRenderRegistry}>
            <Renderer spec={jsonRenderSpec} registry={assessmentJsonRenderRegistry} />
          </JSONUIProvider>
        </AssessmentRenderContext.Provider>
      </div>
    );
  }

  if (!normalized || normalized.blocks.length === 0) {
    return null;
  }

  const isCompact = normalized.layout === "compact";

  return (
    <div
      data-assessment-ui-root=""
      data-assessment-ui-format="blocks"
      data-assessment-course-id={courseId}
      data-assessment-layout={normalized.layout ?? "standard"}
      className={cn(isCompact ? "space-y-3" : "space-y-4", className)}
    >
      {normalized.blocks.map((block) => (
        <AssessmentBlockNode
          key={block.id}
          block={block}
          isCompact={isCompact}
          renderBlockAfter={renderBlockAfter}
        />
      ))}
    </div>
  );
}
