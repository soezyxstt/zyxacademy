"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import { defineRegistry } from "@json-render/react";
import { assessmentJsonRenderCatalog } from "@/lib/assessment-ui-sdk";
import { cn } from "@/lib/utils";
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

export interface AssessmentRenderContextValue {
  isCompact: boolean;
  renderBlockAfter?: (blockId: string) => ReactNode;
}

export const AssessmentRenderContext = createContext<AssessmentRenderContextValue>({
  isCompact: false,
});

function useAssessmentRenderContext(): AssessmentRenderContextValue {
  return useContext(AssessmentRenderContext);
}

function BlockAnchor({
  blockId,
  blockType,
  children,
}: {
  blockId?: string;
  blockType: string;
  children: ReactNode;
}) {
  const { renderBlockAfter } = useAssessmentRenderContext();
  if (!blockId) {
    return <div className="min-w-0">{children}</div>;
  }
  return (
    <div
      data-assessment-block-id={blockId}
      data-assessment-block-type={blockType}
      className="min-w-0"
    >
      {children}
      {renderBlockAfter ? renderBlockAfter(blockId) : null}
    </div>
  );
}

const defined = defineRegistry(assessmentJsonRenderCatalog, {
  components: {
    Stack: ({ props, children }) => {
      const parent = useAssessmentRenderContext();
      const compact = props.layout ? props.layout === "compact" : parent.isCompact;
      return (
        <AssessmentRenderContext.Provider
          value={{ isCompact: compact, renderBlockAfter: parent.renderBlockAfter }}
        >
          <div className={cn(compact ? "space-y-3" : "space-y-4")}>{children}</div>
        </AssessmentRenderContext.Provider>
      );
    },
    Markdown: ({ props }) => {
      const { isCompact } = useAssessmentRenderContext();
      return (
        <BlockAnchor blockId={props.blockId} blockType="markdown">
          <AssessmentMarkdownView content={props.content} isCompact={isCompact} />
        </BlockAnchor>
      );
    },
    FormulaCard: ({ props }) => (
      <BlockAnchor blockId={props.blockId} blockType="formula_card">
        <AssessmentFormulaCardView
          title={props.title}
          latex={props.latex}
          note={props.note}
        />
      </BlockAnchor>
    ),
    Callout: ({ props }) => {
      const { isCompact } = useAssessmentRenderContext();
      return (
        <BlockAnchor blockId={props.blockId} blockType="callout">
          <AssessmentCalloutView
            tone={props.tone}
            title={props.title}
            content={props.content}
            isCompact={isCompact}
          />
        </BlockAnchor>
      );
    },
    CollapsibleSection: ({ props, children }) => {
      const { isCompact } = useAssessmentRenderContext();
      return (
        <BlockAnchor blockId={props.blockId} blockType="collapsible">
          <AssessmentCollapsibleView
            title={props.title}
            defaultOpen={props.defaultOpen}
            variant={props.variant}
            isCompact={isCompact}
          >
            {children}
          </AssessmentCollapsibleView>
        </BlockAnchor>
      );
    },
    Steps: ({ props, children }) => (
      <BlockAnchor blockId={props.blockId} blockType="steps">
        <AssessmentStepsContainerView
          title={props.title}
          collapsible={props.collapsible}
          defaultOpenStepId={props.defaultOpenStepId}
        >
          {children}
        </AssessmentStepsContainerView>
      </BlockAnchor>
    ),
    StepItem: ({ props, children }) => {
      const { isCompact, renderBlockAfter } = useAssessmentRenderContext();
      return (
        <AssessmentStepItemView
          stepId={props.stepId ?? `step-${props.index + 1}`}
          index={props.index}
          title={props.title}
          summary={props.summary}
          collapsible={props.collapsible}
          isCompact={isCompact}
          renderBlockAfter={renderBlockAfter}
        >
          {children}
        </AssessmentStepItemView>
      );
    },
    Image: ({ props }) => (
      <BlockAnchor blockId={props.blockId} blockType="image">
        <AssessmentImageView
          src={props.src}
          alt={props.alt}
          caption={props.caption}
          aspect={props.aspect}
        />
      </BlockAnchor>
    ),
    Graph: ({ props }) => (
      <BlockAnchor blockId={props.blockId} blockType="graph">
        <AssessmentGraphView
          title={props.title}
          caption={props.caption}
          spec={props.spec}
        />
      </BlockAnchor>
    ),
    Scene3D: ({ props }) => (
      <BlockAnchor blockId={props.blockId} blockType="scene_3d">
        <AssessmentScene3dView
          title={props.title}
          caption={props.caption}
          spec={props.spec}
        />
      </BlockAnchor>
    ),
    InteractiveVisual: ({ props }) => {
      const { isCompact } = useAssessmentRenderContext();
      return (
        <BlockAnchor blockId={props.blockId} blockType="interactive_visual">
          <AssessmentInteractiveVisualView
            title={props.title}
            caption={props.caption}
            kind={props.kind}
            spec={props.spec}
            isCompact={isCompact}
          />
        </BlockAnchor>
      );
    },
  },
});

export const assessmentJsonRenderRegistry = defined.registry;
